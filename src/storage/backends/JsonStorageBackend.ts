import { App } from 'obsidian';
import type { IStorageBackend } from '../interfaces/IStorageBackend';
import { StorageBackendType } from '../../types';

/**
 * JSON file storage backend using Obsidian's VaultAdapter.
 * Each entity is stored as a separate JSON file in the plugin folder.
 */
export class JsonStorageBackend implements IStorageBackend {
  private app: App;
  private basePath: string;

  constructor(pluginId: string, app: App) {
    this.basePath = `.obsidian/plugins/${pluginId}/data`;
    this.app = app;
  }

  getType(): StorageBackendType {
    return StorageBackendType.JSON;
  }

  async initialize(): Promise<void> {
    // Ensure base directory exists
    await this.ensureDir(this.basePath);
  }

  async close(): Promise<void> {
    // No-op for JSON backend (files are written immediately)
  }

  async exists(path: string): Promise<boolean> {
    return await this.app.vault.adapter.exists(this.resolvePath(path));
  }

  async read(path: string): Promise<string | null> {
    const fullPath = this.resolvePath(path);
    if (!(await this.app.vault.adapter.exists(fullPath))) {
      return null;
    }
    return await this.app.vault.adapter.read(fullPath);
  }

  async write(path: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(path);
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    await this.ensureDir(dir);
    await this.app.vault.adapter.write(fullPath, content);
  }

  async delete(path: string): Promise<void> {
    const fullPath = this.resolvePath(path);
    if (await this.app.vault.adapter.exists(fullPath)) {
      await this.app.vault.adapter.remove(fullPath);
    }
  }

  async ensureDir(path: string): Promise<void> {
    const fullPath = this.resolvePath(path);
    if (!(await this.app.vault.adapter.exists(fullPath))) {
      await this.app.vault.adapter.mkdir(fullPath);
    }
  }

  async removeDir(path: string): Promise<void> {
    const fullPath = this.resolvePath(path);
    if (await this.app.vault.adapter.exists(fullPath)) {
      await this.app.vault.adapter.rmdir(fullPath, true);
    }
  }

  async listDirs(path: string): Promise<string[]> {
    const fullPath = this.resolvePath(path);
    if (!(await this.app.vault.adapter.exists(fullPath))) {
      return [];
    }
    const entries = await this.app.vault.adapter.list(fullPath);
    return entries.folders.map(f => f.replace(fullPath + '/', ''));
  }

  private resolvePath(path: string): string {
    // If path is already absolute (starts with base), return as-is
    if (path.startsWith(this.basePath)) {
      return path;
    }
    // Otherwise, prepend base path
    return path.startsWith('/') ? `${this.basePath}${path}` : `${this.basePath}/${path}`;
  }
}
