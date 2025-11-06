import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { 
  LambdaHandler, 
  ApiErrorResponse,
  Middleware,
  AuthContext
} from '../types/middleware';
import { HipaaAction } from '../types';
import { createAuditLog } from './auditLog';

export interface ApiError {
  code: string;
  message: string;
  details?: ErrorDetails;
}

export interface ErrorResponse {
  success: boolean;
  error: ApiError;
}

export interface ErrorDetails {
  [key: string]: string | string[];
}

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: ErrorDetails
  ) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }

  toResponse(): APIGatewayProxyResult {
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details
      }
    };

    return {
      statusCode: this.statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
      },
      body: JSON.stringify(body)
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized access') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access forbidden') {
    super('FORBIDDEN', message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super('NOT_FOUND', message, 404);
  }
}


export function withErrorHandler(handler: LambdaHandler): LambdaHandler {
  return async (event: APIGatewayProxyEvent, context: Context) => {
    try {
      const result = await handler(event, context);
      return result;
    } catch (error) {
      const errorObj = error as Error;
      console.error('Error:', {
        message: errorObj.message || 'Unknown error',
        stack: errorObj.stack,
        details: (error as any)?.details,
        event: {
          path: event.path,
          httpMethod: event.httpMethod,
          headers: event.headers
        }
      });

      // Log security/access related errors
      if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
        const cognitoIdentity = event.requestContext.identity.cognitoIdentityId;
        await createAuditLog({
          id: context.awsRequestId,
          timestamp: new Date().toISOString(),
          userId: cognitoIdentity || 'anonymous',
          method: event.httpMethod,
          endpoint: event.path,
          action: HipaaAction.LOGIN_FAILED,
          resource: event.path,
          resourceId: event.pathParameters?.id,
          phiAccessed: false,
          statusCode: error.statusCode,
          duration: Date.now() - context.getRemainingTimeInMillis(),
          ipAddress: event.requestContext.identity.sourceIp || 'unknown',
          userAgent: event.headers['User-Agent'] || 'unknown',
          error: {
            message: error.message,
            code: error.code
          }
        });
      }

      if (error instanceof AppError) {
        return error.toResponse();
      }

      // Handle unexpected errors
      const serverError = new AppError(
        'INTERNAL_SERVER_ERROR',
        'An unexpected error occurred',
        500
      );
      return serverError.toResponse();
    }
  };
}

export function validateRequest<T>(schema: any) {
  return (handler: LambdaHandler): LambdaHandler => {
    return async (event: APIGatewayProxyEvent, context: Context) => {
      try {
        const data = event.body ? JSON.parse(event.body) : {};
        const { error, value } = schema.validate(data, {
          abortEarly: false,
          stripUnknown: true
        });

        if (error) {
          interface JoiValidationError {
            path: string[];
            message: string;
          }
          const details = error.details.reduce((acc: Record<string, string>, detail: JoiValidationError) => {
            acc[detail.path.join('.')] = detail.message;
            return acc;
          }, {});

          throw new ValidationError('Validation failed', details);
        }

        // Add validated body to event for handler
        event.body = JSON.stringify(value);
        return handler(event, context);
      } catch (error) {
        if (error instanceof ValidationError) {
          throw error;
        }
        throw new ValidationError('Invalid request body');
      }
    };
  };
}


export function withSecurityHeaders(handler: LambdaHandler): LambdaHandler {
  return async (event: APIGatewayProxyEvent, context: Context) => {
    const response = await handler(event, context);
    
    // Add security headers
    response.headers = {
      ...response.headers,
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'Content-Security-Policy': "default-src 'self'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    };

    return response;
  };
}