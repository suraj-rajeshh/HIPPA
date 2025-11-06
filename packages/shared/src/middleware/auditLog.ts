import { DynamoDB } from 'aws-sdk';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { 
  AuditLogEntry, 
  LambdaHandler, 
  AuditLogOptions,
  Middleware 
} from '../types/middleware';
import { v4 as uuidv4 } from 'uuid';

const dynamoDB = new DynamoDB.DocumentClient();
const TABLE_NAME = process.env.AUDIT_LOG_TABLE || 'healthcare-audit-logs';


function sanitizeBody(body: any): any {
  if (!body) return body;
  
  const sensitiveFields = [
    'password',
    'token',
    'refreshToken',
    'ssn',
    'creditCard',
    'bankAccount',
    'secret',
    'apiKey'
  ];
  
  const sanitized = JSON.parse(JSON.stringify(body));
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '***REDACTED***';
    }
  }
  
  return sanitized;
}


export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  const timestamp = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + (7 * 365 * 24 * 60 * 60); // 7 years TTL

  try {
    await dynamoDB.put({
      TableName: TABLE_NAME,
      Item: {
        ...entry,
        timestamp,
        ttl // DynamoDB TTL attribute
      }
    }).promise();
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw - audit logging should not break the main flow
  }
}


export async function queryAuditLogs(filters: {
  userId?: string;
  resource?: string;
  phiAccessed?: boolean;
  startDate?: string;
  endDate?: string;
  limit?: number;
  nextToken?: string;
}): Promise<{
  items: AuditLogEntry[];
  nextToken?: string;
}> {
  let KeyConditionExpression = 'resourceType = :resourceType';
  const ExpressionAttributeValues: any = {
    ':resourceType': filters.resource || 'ALL'
  };

  if (filters.startDate && filters.endDate) {
    KeyConditionExpression += ' AND #ts BETWEEN :start AND :end';
    ExpressionAttributeValues[':start'] = filters.startDate;
    ExpressionAttributeValues[':end'] = filters.endDate;
  }

  const params: DynamoDB.DocumentClient.QueryInput = {
    TableName: TABLE_NAME,
    IndexName: 'ResourceTypeIndex',
    KeyConditionExpression,
    ExpressionAttributeValues,
    ExpressionAttributeNames: {
      '#ts': 'timestamp'
    },
    Limit: filters.limit || 50,
    ExclusiveStartKey: filters.nextToken ? JSON.parse(Buffer.from(filters.nextToken, 'base64').toString()) : undefined,
    ScanIndexForward: false // Get most recent first
  };

  if (filters.userId || filters.phiAccessed !== undefined) {
    let FilterExpression = [];
    if (filters.userId) {
      FilterExpression.push('userId = :userId');
      ExpressionAttributeValues[':userId'] = filters.userId;
    }
    if (filters.phiAccessed !== undefined) {
      FilterExpression.push('phiAccessed = :phiAccessed');
      ExpressionAttributeValues[':phiAccessed'] = filters.phiAccessed;
    }
    params.FilterExpression = FilterExpression.join(' AND ');
  }

  const result = await dynamoDB.query(params).promise();

  return {
    items: result.Items as AuditLogEntry[],
    nextToken: result.LastEvaluatedKey 
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined
  };
}

/**
 * Lambda middleware for audit logging
 */
export function withAuditLog(options: {
  resourceType: string;
  phiAccessed?: boolean;
}) {
  return (handler: LambdaHandler): LambdaHandler => {
    return async (event: APIGatewayProxyEvent, context: Context) => {
      const startTime = Date.now();
      let response;
      let error;

      try {
        response = await handler(event, context);
        return response;
      } catch (err) {
        error = err;
        throw err;
      } finally {
        const duration = Date.now() - startTime;
        const cognitoIdentity = event.requestContext.identity.cognitoIdentityId;
        const userArn = event.requestContext.identity.userArn;
        
        const timestamp = new Date().toISOString();
        const auditEntry: AuditLogEntry = {
          id: uuidv4(),
          timestamp,
          userId: cognitoIdentity || userArn || 'anonymous',
          action: `${event.httpMethod} ${event.path}`,
          resource: options.resourceType,
          resourceId: event.pathParameters?.id,
          method: event.httpMethod,
          endpoint: event.path,
          statusCode: error ? 500 : response?.statusCode || 200,
          ipAddress: event.requestContext.identity.sourceIp,
          userAgent: event.headers['User-Agent'],
          requestBody: event.body ? sanitizeBody(JSON.parse(event.body)) : undefined,
          responseBody: response?.body ? sanitizeBody(JSON.parse(response.body)) : undefined,
          phiAccessed: options.phiAccessed || false,
          error: error ? {
            message: error instanceof Error ? error.message : 'Unknown error',
            code: (error as any).code,
            stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
          } : undefined,
          duration
        };

        await createAuditLog(auditEntry);
      }
    };
  };
}