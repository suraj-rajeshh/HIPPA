export const config = {
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    stage: process.env.STAGE || 'dev',
  },
  database: {
    clusterArn: process.env.AURORA_CLUSTER_ARN!,
    secretArn: process.env.AURORA_SECRET_ARN!,
    database: 'healthcare',
  },
  cognito: {
    userPoolId: process.env.COGNITO_USER_POOL_ID!,
    region: process.env.AWS_REGION || 'us-east-1',
  },
  s3: {
    bucket: process.env.S3_BUCKET!,
  },
  kms: {
    keyId: process.env.ENCRYPTION_KEY_ID!,
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 100,
  },
};

export default config;