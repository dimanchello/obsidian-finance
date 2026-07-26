import { App, normalizePath } from 'obsidian';

/** The only place that knows about app.vault. */
export class VaultAdapter {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  async exists(path: string): Promise<boolean> {
    return this.app.vault.adapter.exists(path);
  }

  async read(path: string): Promise<string> {
    return this.app.vault.adapter.read(path);
  }

  async mkdir(path: string): Promise<void> {
    if (!(await this.exists(path))) await this.app.vault.adapter.mkdir(path);
  }

  async remove(path: string): Promise<void> {
    if (await this.exists(path)) await this.app.vault.adapter.remove(path);
  }

  async rmdir(path: string): Promise<void> {
    if (await this.exists(path)) await this.app.vault.adapter.rmdir(path, true);
  }

  async listFolders(path: string): Promise<string[]> {
    if (!(await this.exists(path))) return [];
    return (await this.app.vault.adapter.list(path)).folders;
  }

  /**
   * Write via a temp file + rename so an interrupted write cannot leave a truncated
   * JSON behind — there are no backups and no migrations left to repair one.
   */
  async atomicWrite(path: string, content: string): Promise<void> {
    const a = this.app.vault.adapter;
    const tmp = normalizePath(`${path}.tmp`);
    await a.write(tmp, content);
    try {
      await a.remove(path);
    } catch { /* first write: nothing to remove */ }
    await a.rename(tmp, path);
  }

  async readJson(path: string): Promise<unknown> {
    if (!(await this.exists(path))) return null;
    try {
      return JSON.parse(await this.read(path));
    } catch (e) {
      console.error(`[FT-storage] ${path} parse error:`, e);
      return null;
    }
  }
}
