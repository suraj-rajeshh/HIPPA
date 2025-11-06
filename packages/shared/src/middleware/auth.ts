import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { config } from '../config';

const verifier = CognitoJwtVerifier.create({
  userPoolId: config.cognito.userPoolId,
  tokenUse: 'access',
  clientId: null,
});

export interface AuthContext {
  userId: string;
  email: string;
  role: string;
  userType: string;
}

export async function authenticate(token: string): Promise<AuthContext> {
  try {
    const payload = await verifier.verify(token) as {
      sub: string;
      email?: string;
      'custom:role'?: string;
      'custom:userType'?: string;
    };
    
    return {
      userId: payload.sub,
      email: payload.email || '',
      role: payload['custom:role'] || 'patient',
      userType: payload['custom:userType'] || 'client',
    };
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

export function authorize(allowedRoles: string[]) {
  return (context: AuthContext) => {
    if (!allowedRoles.includes(context.role)) {
      throw new Error('Insufficient permissions');
    }
  };
}