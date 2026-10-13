/**
 * Storage barrel export
 */

export { FinanceStorage } from './FinanceStorage';
export type { AccountMetaFile, AccountRecordsFile } from './repositories/JsonAccountRepository';
export { isObject, addToSet, rebuildLookups } from './repositories/JsonAccountRepository';
export { DATA_VERSION } from '../constants';

// Storage backends
export { JsonStorageBackend } from './backends/JsonStorageBackend';
export { SqliteStorageBackend } from './backends/SqliteStorageBackend';

// Interfaces
export type { IStorageBackend } from './interfaces/IStorageBackend';
export type { IAccountRepository } from './interfaces/IAccountRepository';

// Repositories
export { JsonAccountRepository } from './repositories/JsonAccountRepository';
export { SqliteAccountRepository } from './repositories/SqliteAccountRepository';

// SQLite utilities
export { toSqlParams } from './backends/sqlite/utils';
export { SQLITE_SCHEMA_DDL, SQLITE_SCHEMA_VERSION } from './backends/sqlite/schema';
export * from './backends/sqlite/mappers';
