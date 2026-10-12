import initSqlJs, { Database } from 'sql.js';
import type { App } from 'obsidian';
import type { IStorageBackend } from '../interfaces/IStorageBackend';
import { StorageBackendType, SQLITE_DB_FILENAME } from '../../types';
import { SQLITE_SCHEMA_DDL } from './sqlite/schema';

/**
 * SQLite storage backend using sql.js (WebAssembly).
 * Provides a single-file database alternative to JSON files.
 */
export class SqliteStorageBackend implements IStorageBackend {
  private db: Database | null = null;
  private dbPath: string;
  private app: App;

  constructor(pluginId: string, app: App) {
    this.dbPath = `.obsidian/plugins/${pluginId}/${SQLITE_DB_FILENAME}`;
    this.app = app;
  }

  getType(): StorageBackendType {
    return StorageBackendType.SQLITE;
  }

  async initialize(): Promise<void> {
    const SQL = await initSqlJs({
      locateFile: file => `https://sql.js.org/dist/${file}`
    });

    const exists = await this.app.vault.adapter.exists(this.dbPath);

    if (exists) {
      // Open existing database
      const data = await this.app.vault.adapter.readBinary(this.dbPath);
      this.db = new SQL.Database(new Uint8Array(data));
      console.log('[SQLite] Database opened');
    } else {
      // Create new database with schema
      this.db = new SQL.Database();
      this.db.exec(SQLITE_SCHEMA_DDL);
      await this.persistDb();
      console.log('[SQLite] Database created with schema');
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.persistDb();
      this.db.close();
      this.db = null;
      console.log('[SQLite] Database closed');
    }
  }

  getDatabase(): Database {
    if (!this.db) throw new Error('[SQLite] Database not initialized');
    return this.db;
  }

  async exists(_path: string): Promise<boolean> {
    // SQLite doesn't use paths — data is in DB
    return true;
  }

  async read(_path: string): Promise<string | null> {
    // Not used directly (queries go through SqliteAccountRepository)
    throw new Error('[SQLite] read() not supported — use SQL queries');
  }

  async write(_path: string, _content: string): Promise<void> {
    // Not used directly
    throw new Error('[SQLite] write() not supported — use SQL queries');
  }

  async delete(_path: string): Promise<void> {
    // Not used directly
    throw new Error('[SQLite] delete() not supported — use SQL queries');
  }

  async ensureDir(_path: string): Promise<void> {
    // No-op for SQLite
  }

  async removeDir(_path: string): Promise<void> {
    // No-op for SQLite
  }

  async listDirs(_path: string): Promise<string[]> {
    // SQLite has no concept of directories
    return [];
  }

  /** Persist database to disk */
  private async persistDb(): Promise<void> {
    if (!this.db) return;
    const data = this.db.export();
    const dir = this.dbPath.substring(0, this.dbPath.lastIndexOf('/'));
    if (!(await this.app.vault.adapter.exists(dir))) {
      await this.app.vault.adapter.mkdir(dir);
    }
    // Cast to ArrayBuffer for writeBinary (data.buffer is Uint8Array.buffer which is ArrayBufferLike)
    await this.app.vault.adapter.writeBinary(this.dbPath, data.buffer as ArrayBuffer);
  }

  /** Manual flush (called by repository) */
  async flush(): Promise<void> {
    await this.persistDb();
  }
}
