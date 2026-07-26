import { normalizePath } from 'obsidian';

export type AccountFileKind = 'meta' | 'records' | 'debts' | 'credits' | 'deposits' | 'state';

export const ACCOUNT_FILE_KINDS: readonly AccountFileKind[] =
  ['meta', 'records', 'debts', 'credits', 'deposits', 'state'];

export class AccountFiles {
  readonly base: string;

  constructor(pluginId: string) {
    this.base = normalizePath(`.obsidian/plugins/${pluginId}/accounts`);
  }

  folder(accountId: string): string {
    return normalizePath(`${this.base}/${accountId}`);
  }

  file(accountId: string, kind: AccountFileKind): string {
    return normalizePath(`${this.folder(accountId)}/${kind}.json`);
  }
}
