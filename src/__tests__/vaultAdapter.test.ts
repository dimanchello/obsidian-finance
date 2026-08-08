import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VaultAdapter } from '../storage/VaultAdapter';

describe('VaultAdapter.atomicWrite', () => {
  let calls: string[];
  let adapter: {
    write: ReturnType<typeof vi.fn>;
    rename: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    exists: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
  };
  let vault: VaultAdapter;

  beforeEach(() => {
    calls = [];
    adapter = {
      write: vi.fn().mockImplementation(async (p: string) => { calls.push(`write:${p}`); }),
      rename: vi.fn().mockImplementation(async (from: string, to: string) => { calls.push(`rename:${from}→${to}`); }),
      remove: vi.fn().mockImplementation(async (p: string) => { calls.push(`remove:${p}`); }),
      exists: vi.fn().mockResolvedValue(true),
      read: vi.fn(),
    };
    vault = new VaultAdapter({ vault: { adapter } } as never);
  });

  it('пишет во временный файл и переименовывает — прерывание не оставит битый JSON', async () => {
    await vault.atomicWrite('accounts/x/records.json', '{"a":1}');

    // Мок normalizePath заменяет "/" на "_", поэтому tmp-путь выглядит так
    expect(calls).toEqual([
      'write:accounts_x_records.json.tmp',
      'remove:accounts/x/records.json',
      'rename:accounts_x_records.json.tmp→accounts/x/records.json',
    ]);
    expect(adapter.write).toHaveBeenCalledWith('accounts_x_records.json.tmp', '{"a":1}');
  });

  it('первая запись: remove падает, rename всё равно выполняется', async () => {
    adapter.remove.mockRejectedValue(new Error('нет файла'));

    await vault.atomicWrite('accounts/x/meta.json', '{}');

    expect(adapter.rename).toHaveBeenCalledWith('accounts_x_meta.json.tmp', 'accounts/x/meta.json');
  });

  it('ошибка записи tmp не трогает целевой файл', async () => {
    adapter.write.mockRejectedValue(new Error('диск полон'));

    await expect(vault.atomicWrite('accounts/x/meta.json', '{}')).rejects.toThrow();
    expect(adapter.remove).not.toHaveBeenCalled();
    expect(adapter.rename).not.toHaveBeenCalled();
  });
});

describe('VaultAdapter.readJson', () => {
  it('битый JSON даёт null, а не исключение', async () => {
    const adapter = {
      exists: vi.fn().mockResolvedValue(true),
      read: vi.fn().mockResolvedValue('{ не json'),
    };
    const vault = new VaultAdapter({ vault: { adapter } } as never);
    expect(await vault.readJson('x.json')).toBeNull();
  });

  it('отсутствующий файл даёт null без чтения', async () => {
    const read = vi.fn();
    const adapter = { exists: vi.fn().mockResolvedValue(false), read };
    const vault = new VaultAdapter({ vault: { adapter } } as never);
    expect(await vault.readJson('x.json')).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
});
