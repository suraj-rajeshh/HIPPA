import { 
  AppSyncResolverHandler, 
  AppSyncResolverEvent,
  AppSyncIdentityCognito
} from 'aws-lambda';
import { 
  APIGatewayProxyEvent, 
  APIGatewayEventIdentity, 
  Context,
  Callback 
} from 'aws-lambda';
import { LambdaHandler } from '../types/middleware';

// Extended APIGatewayEventIdentity to include vpcId and vpceId
const emptyIdentity: APIGatewayEventIdentity = {
  accessKey: null,
  accountId: null,
  apiKey: null,
  apiKeyId: null,
  caller: null,
  clientCert: null,
  cognitoAuthenticationProvider: null,
  cognitoAuthenticationType: null,
  cognitoIdentityId: null,
  cognitoIdentityPoolId: null,
  principalOrgId: null,
  sourceIp: '',
  user: null,
  userAgent: null,
  userArn: null,
  vpcId: null,
  vpceId: null
};

const defaultIdentity: APIGatewayEventIdentity = {
  accessKey: null,
  accountId: null,
  apiKey: null,
  apiKeyId: null,
  caller: null,
  clientCert: null,
  cognitoAuthenticationProvider: null,
  cognitoAuthenticationType: null,
  cognitoIdentityId: null,
  cognitoIdentityPoolId: null,
  principalOrgId: null,
  sourceIp: '',
  user: null,
  userAgent: null,
  userArn: null,
  vpcId: null,
  vpceId: null
};


export function appSyncToLambda<TArgs = any, TResult = any>(
  handler: AppSyncResolverHandler<TArgs, TResult>
): LambdaHandler {
  return async (event: APIGatewayProxyEvent, context: Context) => {
    // Convert APIGateway event to AppSync event format
    const appSyncEvent: AppSyncResolverEvent<TArgs, null> = {
      arguments: event.body ? JSON.parse(event.body) : {},
      info: {
        fieldName: event.pathParameters?.field || event.path.split('/').pop() || 'unknown',
        parentTypeName: 'Query',
        selectionSetList: [],
        selectionSetGraphQL: '',
        variables: {}
      },
      identity: event.requestContext.authorizer?.claims ? {
        claims: event.requestContext.authorizer.claims,
        defaultAuthStrategy: 'ALLOW',
        issuer: 'https://cognito-idp.us-east-1.amazonaws.com',
        sub: event.requestContext.authorizer.claims.sub,
        username: event.requestContext.authorizer.claims.sub
      } as AppSyncIdentityCognito : null,
      request: {
        headers: event.headers,
        domainName: null
      },
      prev: null,
      source: null,
      stash: {}
    };

    try {
      return new Promise((resolve, reject) => {
        const callback: Callback<TResult> = (error, result) => {
          if (error) reject(error);
          else resolve({
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(result)
          });
        };
        
        handler(appSyncEvent, context, callback);
      });
    } catch (error) {
      throw error; // Let error handler middleware handle it
    }
  };
};


export function lambdaToAppSync<TArgs = any, TResult = any>(
  handler: LambdaHandler
): AppSyncResolverHandler<TArgs, TResult> {
  return async (event, context) => {
    // Convert AppSync event to APIGateway event format
    const apiGatewayEvent: APIGatewayProxyEvent = {
      httpMethod: 'POST',
      path: `/graphql/${event.info.fieldName}`,
      pathParameters: {
        field: event.info.fieldName
      },
      queryStringParameters: null,
      headers: (event.request?.headers as any) || {},
      body: JSON.stringify(event.arguments),
      isBase64Encoded: false,
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {
        accountId: '',
        apiId: '',
        authorizer: event.identity ? {
          claims: event.identity
        } : {},
        protocol: 'HTTP/1.1',
        httpMethod: 'POST',
        identity: emptyIdentity,
        path: `/graphql/${event.info.fieldName}`,
        stage: '',
        requestId: context.awsRequestId,
        requestTimeEpoch: Date.now(),
        resourceId: '',
        resourcePath: ''
      },
      resource: ''
    };

    try {
      const result = await handler(apiGatewayEvent, context);
      if (result.statusCode !== 200) {
        throw JSON.parse(result.body);
      }
      return JSON.parse(result.body);
    } catch (error) {
      throw error; // Let error handler middleware handle it
    }
  };
};