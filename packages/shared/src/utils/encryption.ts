import {
  KMSClient,
  EncryptCommand,
  DecryptCommand,
  GenerateDataKeyCommand,
} from '@aws-sdk/client-kms';
import { config } from '../config';
import * as crypto from 'crypto';

const kmsClient = new KMSClient({ region: config.aws.region });

export class EncryptionService {
  async encryptWithKMS(plaintext: string): Promise<string> {
    const command = new EncryptCommand({
      KeyId: config.kms.keyId,
      Plaintext: Buffer.from(plaintext, 'utf8'),
    });

    const response = await kmsClient.send(command);
    return Buffer.from(response.CiphertextBlob!).toString('base64');
  }

  async decryptWithKMS(ciphertext: string): Promise<string> {
    const command = new DecryptCommand({
      CiphertextBlob: Buffer.from(ciphertext, 'base64'),
    });

    const response = await kmsClient.send(command);
    return Buffer.from(response.Plaintext!).toString('utf8');
  }

  async generateDataKey(): Promise<{ plaintext: Buffer; encrypted: Buffer }> {
    const command = new GenerateDataKeyCommand({
      KeyId: config.kms.keyId,
      KeySpec: 'AES_256',
    });

    const response = await kmsClient.send(command);
    
    return {
      plaintext: Buffer.from(response.Plaintext!),
      encrypted: Buffer.from(response.CiphertextBlob!),
    };
  }

  encryptPHI(data: string, key: Buffer): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  decryptPHI(encryptedData: string, key: Buffer): string {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  hashData(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  maskSensitiveData(data: string, visibleChars: number = 4): string {
    if (!data || data.length <= visibleChars * 2) {
      return '****';
    }
    
    const start = data.substring(0, visibleChars);
    const end = data.substring(data.length - visibleChars);
    const masked = '*'.repeat(Math.max(data.length - (visibleChars * 2), 4));
    
    return `${start}${masked}${end}`;
  }
}

export const encryption = new EncryptionService();