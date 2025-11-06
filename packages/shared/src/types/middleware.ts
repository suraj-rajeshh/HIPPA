import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { AppSyncResolverHandler } from 'aws-lambda';

// Lambda Handler Types
export type LambdaHandler = (
  event: APIGatewayProxyEvent,
  context: Context
) => Promise<APIGatewayProxyResult>;

export type GraphQLHandler<TArgs = any, TResult = any> = AppSyncResolverHandler<TArgs, TResult>;

// Middleware Types
export type Middleware = (handler: LambdaHandler) => LambdaHandler;

// Error Types
export interface ApiErrorResponse {
  success: boolean;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

// Audit Types
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  method: string;
  endpoint: string;
  statusCode: number;
  ipAddress: string;
  userAgent?: string;
  requestBody?: any;
  responseBody?: any;
  phiAccessed: boolean;
  duration: number;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  ttl?: number;
}

export interface AuditLogOptions {
  resourceType: string;
  phiAccessed?: boolean;
}

// Auth Types
export interface AuthContext {
  sub: string;
  email?: string;
  'custom:role': string;
  'custom:userType'?: string;
}

// Validation Types
export interface ValidationResult<T = any> {
  value: T;
  error?: {
    details: Array<{
      message: string;
      path: string[];
    }>;
  };
}