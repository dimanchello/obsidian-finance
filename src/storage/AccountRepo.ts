import { VaultAdapter } from './VaultAdapter';
import { AccountFiles, AccountFileKind } from './AccountFiles';

export const FLUSH_DEBOUNCE_MS = 500;

/**
 * One cache + dirty-set + debounced flush, typed per file kind.
 * Replaces the five hand-rolled copies the old storage carried.
 */
export class FileStore<T> {
  private cache = new Map<string, T>();
  private dirty = new Set<string>();
  private readonly kind: AccountFileKind;
  private readonly parse: (raw: unknown) => T;
  private readonly onDirty: () => void;

  constructor(kind: AccountFileKind, parse: (raw: unknown) => T, onDirty: () => void) {
    this.kind = kind;
    this.parse = parse;
    this.onDirty = onDirty;
  }

  async load(vault: VaultAdapter, files: AccountFiles, accountId: string): Promise<T> {
    const cached = this.cache.get(accountId);
    if (cached !== undefined) return cached;
    const value = this.parse(await vault.readJson(files.file(accountId, this.kind)));
    this.cache.set(accountId, value);
    return value;
  }

  set(accountId: string, value: T): void {
    this.cache.set(accountId, value);
    this.markDirty(accountId);
  }

  markDirty(accountId: string): void {
    this.dirty.add(accountId);
    this.onDirty();
  }

  invalidate(accountId: string): void {
    this.cache.delete(accountId);
    this.dirty.delete(accountId);
  }

  dirtyIds(): string[] {
    return [...this.dirty];
  }

  async flush(vault: VaultAdapter, files: AccountFiles): Promise<void> {
    for (const accountId of this.dirty) {
      const value = this.cache.get(accountId);
      if (value === undefined) continue;
      await vault.mkdir(files.folder(accountId));
      await vault.atomicWrite(files.file(accountId, this.kind), JSON.stringify(value));
    }
    this.dirty.clear();
  }
}

/** Owns the shared debounce timer across all stores. */
export class FlushScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly run: () => Promise<void>;

  constructor(run: () => Promise<void>) {
    this.run = run;
  }

  schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.run(); }, FLUSH_DEBOUNCE_MS);
  }

  async flushNow(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    await this.run();
  }
}
