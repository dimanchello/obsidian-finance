import type { StorageBackendType } from '../../types';

/**
 * Low-level storage operations.
 * JSON backend uses Obsidian vault API, SQLite uses sql.js.
 */
export interface IStorageBackend {
  /** Backend type identifier */
  getType(): StorageBackendType;

  /** Initialize backend (create DB, load WASM, etc.) */
  initialize(): Promise<void>;

  /** Close backend (flush, close DB connection) */
  close(): Promise<void>;

  /** Check if resource exists */
  exists(path: string): Promise<boolean>;

  /** Read raw content (file or query result as JSON string) */
  read(path: string): Promise<string | null>;

  /** Write raw content */
  write(path: string, content: string): Promise<void>;

  /** Delete resource */
  delete(path: string): Promise<void>;

  /** Ensure directory exists (for JSON) or no-op (for SQLite) */
  ensureDir(path: string): Promise<void>;

  /** Remove directory recursively */
  removeDir(path: string): Promise<void>;

  /** List subdirectories */
  listDirs(path: string): Promise<string[]>;
}
