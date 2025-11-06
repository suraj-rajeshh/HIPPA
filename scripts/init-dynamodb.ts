#!/usr/bin/env node
import { DynamoDB, CreateTableCommand } from '@aws-sdk/client-dynamodb';
import { tables } from './tables';

const dynamodb = new DynamoDB({
  endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local'
  }
});

async function createTables() {
  try {
    console.log('Creating DynamoDB tables...');
    
    for (const table of tables) {
      try {
        const command = new CreateTableCommand(table);
        await dynamodb.send(command);
        console.log(`Created table: ${table.TableName}`);
      } catch (error: any) {
        if (error.name === 'ResourceInUseException') {
          console.log(`Table already exists: ${table.TableName}`);
        } else {
          throw error;
        }
      }
    }

    console.log('All tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
    process.exit(1);
  }
}

createTables();