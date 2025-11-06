export interface Timestamps {
  createdAt: string;
  updatedAt: string;
}

export enum HipaaAction {
  VIEW = 'VIEW',
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE'
}

// Common database types
export interface DatabaseRecord {
  id: string;
  created_at: Date;
  updated_at: Date;
}

// Common response types
export interface PaginationResponse {
  count: number;
  total: number;
}