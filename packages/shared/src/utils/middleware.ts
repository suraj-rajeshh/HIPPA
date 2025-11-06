import { LambdaHandler } from '../types';

export function compose(...middlewares: Array<(handler: LambdaHandler) => LambdaHandler>) {
  return (handler: LambdaHandler): LambdaHandler => {
    return middlewares.reduceRight((acc, middleware) => middleware(acc), handler);
  };
}


export function sanitizeSensitiveData(data: any): any {
  if (!data) return data;
  
  const sensitiveFields = [
    'password',
    'ssn',
    'creditCard',
    'token',
    'secret',
    'authorization'
  ];
  
  if (typeof data === 'object') {
    const sanitized = Array.isArray(data) ? [...data] : { ...data };
    
    for (const [key, value] of Object.entries(sanitized)) {
      if (sensitiveFields.includes(key.toLowerCase())) {
        sanitized[key] = '***REDACTED***';
      } else if (typeof value === 'object') {
        sanitized[key] = sanitizeSensitiveData(value);
      }
    }
    
    return sanitized;
  }
  
  return data;
}