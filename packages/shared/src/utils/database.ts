import {
  RDSDataClient,
  ExecuteStatementCommand,
  BatchExecuteStatementCommand,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
} from '@aws-sdk/client-rds-data';
import { config } from '../config';

const rdsClient = new RDSDataClient({ region: config.aws.region });

export interface QueryResult {
  records?: any[];
  numberOfRecordsUpdated?: number;
  generatedFields?: any[];
}

export interface DatabaseQueryResult<T> {
  rows: T[];
  rowCount: number;
}

export class DatabaseClient {
  private transactionId?: string;

  async executeStatement(
    sql: string,
    parameters: any[] = []
  ): Promise<QueryResult> {
    try {
      const command = new ExecuteStatementCommand({
        resourceArn: config.database.clusterArn,
        secretArn: config.database.secretArn,
        database: config.database.database,
        sql,
        parameters: this.formatParameters(parameters),
        transactionId: this.transactionId,
        includeResultMetadata: true,
      });

      const response = await rdsClient.send(command);
      
      return {
        records: this.formatRecords(response.records, response.columnMetadata),
        numberOfRecordsUpdated: response.numberOfRecordsUpdated,
        generatedFields: response.generatedFields,
      };
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  async query<T>(sql: string, params: any[] = []): Promise<DatabaseQueryResult<T>> {
    const result = await this.executeStatement(sql, params);
    return {
      rows: result.records || [],
      rowCount: result.records?.length || 0
    };
  }

  async queryOne<T>(sql: string, params: any[] = []): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results.rows.length > 0 ? results.rows[0] : null;
  }

  async insert(
    table: string,
    data: Record<string, any>
  ): Promise<any | null> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `:param${i}`).join(', ');

    const sql = `
      INSERT INTO ${table} (${keys.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;

    const result = await this.executeStatement(sql, values);
    return result.records?.[0] || null;
  }

  async update(
    table: string,
    id: string,
    data: Record<string, any>
  ): Promise<any | null> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key, i) => `${key} = :param${i}`).join(', ');

    const sql = `
      UPDATE ${table}
      SET ${setClause}, updated_at = NOW()
      WHERE id = :id
      RETURNING *
    `;

    const result = await this.executeStatement(sql, [...values, id]);
    return result.records?.[0] || null;
  }

  async delete(table: string, id: string): Promise<boolean> {
    const sql = `DELETE FROM ${table} WHERE id = :id`;
    const result = await this.executeStatement(sql, [id]);
    return (result.numberOfRecordsUpdated || 0) > 0;
  }

  async beginTransaction(): Promise<void> {
    const command = new BeginTransactionCommand({
      resourceArn: config.database.clusterArn,
      secretArn: config.database.secretArn,
      database: config.database.database,
    });

    const response = await rdsClient.send(command);
    this.transactionId = response.transactionId;
  }

  async commit(): Promise<void> {
    if (!this.transactionId) {
      throw new Error('No active transaction');
    }

    const command = new CommitTransactionCommand({
      resourceArn: config.database.clusterArn,
      secretArn: config.database.secretArn,
      transactionId: this.transactionId,
    });

    await rdsClient.send(command);
    this.transactionId = undefined;
  }

  async rollback(): Promise<void> {
    if (!this.transactionId) {
      throw new Error('No active transaction');
    }

    const command = new RollbackTransactionCommand({
      resourceArn: config.database.clusterArn,
      secretArn: config.database.secretArn,
      transactionId: this.transactionId,
    });

    await rdsClient.send(command);
    this.transactionId = undefined;
  }

  private formatParameters(params: any[]): any[] {
    return params.map((param, index) => {
      const formattedParam: any = { name: `param${index}` };

      if (param === null) {
        formattedParam.value = { isNull: true };
      } else if (typeof param === 'string') {
        formattedParam.value = { stringValue: param };
      } else if (typeof param === 'number') {
        if (Number.isInteger(param)) {
          formattedParam.value = { longValue: param };
        } else {
          formattedParam.value = { doubleValue: param };
        }
      } else if (typeof param === 'boolean') {
        formattedParam.value = { booleanValue: param };
      } else if (param instanceof Date) {
        formattedParam.value = { stringValue: param.toISOString() };
      } else if (typeof param === 'object') {
        formattedParam.value = { stringValue: JSON.stringify(param) };
      }

      return formattedParam;
    });
  }

  private formatRecords(records: any[] | undefined, metadata: any[] | undefined): any[] {
    if (!records || !metadata) return [];

    return records.map(record => {
      const formatted: any = {};
      
      record.forEach((field: any, index: number) => {
        const columnName = metadata[index]?.name;
        if (!columnName) return;

        if (field.isNull) {
          formatted[columnName] = null;
        } else if (field.stringValue !== undefined) {
          formatted[columnName] = field.stringValue;
        } else if (field.longValue !== undefined) {
          formatted[columnName] = field.longValue;
        } else if (field.doubleValue !== undefined) {
          formatted[columnName] = field.doubleValue;
        } else if (field.booleanValue !== undefined) {
          formatted[columnName] = field.booleanValue;
        } else if (field.blobValue !== undefined) {
          formatted[columnName] = field.blobValue;
        }
      });

      return formatted;
    });
  }
}

export const db = new DatabaseClient();