import { App, normalizePath } from 'obsidian';
import type { IStorageBackend } from '../interfaces/IStorageBackend';
import { StorageBackendType } from '../../types';

/**
 * JSON file-based storage backend using Obsidian vault API.
 * Implements IStorageBackend for compatibility with the repository pattern.
 */
export class JsonStorageBackend implements IStorageBackend {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  getType(): StorageBackendType {
    return StorageBackendType.JSON;
  }

  async initialize(): Promise<void> {
    // No-op for JSON (vault already initialized)
  }

  async close(): Promise<void> {
    // No-op for JSON
  }

  async exists(path: string): Promise<boolean> {
    return this.app.vault.adapter.exists(path);
  }

  async read(path: string): Promise<string | null> {
    if (!(await this.exists(path))) return null;
    try {
      return await this.app.vault.adapter.read(path);
    } catch (e) {
      console.error(`[JsonBackend] Read error: ${path}`, e);
      return null;
    }
  }

  async write(path: string, content: string): Promise<void> {
    await this.atomicWrite(path, content);
  }

  async delete(path: string): Promise<void> {
    if (await this.exists(path)) {
      await this.app.vault.adapter.remove(path);
    }
  }

  async ensureDir(path: string): Promise<void> {
    if (!(await this.exists(path))) {
      await this.app.vault.adapter.mkdir(path);
    }
  }

  async removeDir(path: string): Promise<void> {
    if (await this.exists(path)) {
      await this.app.vault.adapter.rmdir(path, true);
    }
  }

  async listDirs(path: string): Promise<string[]> {
    if (!(await this.exists(path))) return [];
    return (await this.app.vault.adapter.list(path)).folders;
  }

  // ── Internal ────────────────────────────────────────────────────────────

  /**
   * Write via a temp file + rename so an interrupted write cannot leave a truncated
   * JSON behind — there are no backups and no migrations left to repair one.
   */
  private async atomicWrite(path: string, content: string): Promise<void> {
    const a = this.app.vault.adapter;
    const tmp = normalizePath(`${path}.tmp`);
    await a.write(tmp, content);
    try {
      await a.remove(path);
    } catch { /* first write: nothing to remove */ }
    await a.rename(tmp, path);
  }
}
