import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import * as fs from 'fs';
import * as path from 'path';

const env = process.argv.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'dev';

const rdsClient = new RDSDataClient({ region: process.env.AWS_REGION || 'us-east-1' });
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });

async function getDbCredentials() {
  const command = new GetSecretValueCommand({
    SecretId: `healthcare/aurora/${env}/credentials`,
  });

  const response = await secretsClient.send(command);
  return JSON.parse(response.SecretString!);
}

async function initDatabase() {
  console.log('🗄️  Initializing database schema...');

  const credentials = await getDbCredentials();
  const sqlFile = fs.readFileSync(path.join(__dirname, 'init-database.sql'), 'utf8');

  // Split SQL file into individual statements
  const statements = sqlFile
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const statement of statements) {
    try {
      const command = new ExecuteStatementCommand({
        resourceArn: process.env.AURORA_CLUSTER_ARN!,
        secretArn: process.env.AURORA_SECRET_ARN!,
        database: credentials.database,
        sql: statement,
      });

      await rdsClient.send(command);
      console.log('✅ Executed:', statement.substring(0, 50) + '...');
    } catch (error) {
      console.error('❌ Error executing statement:', error);
      throw error;
    }
  }

  console.log('✅ Database initialized successfully!');
}

initDatabase().catch(console.error);