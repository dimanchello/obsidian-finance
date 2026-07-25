import { App, normalizePath } from 'obsidian';
import { AccountData, AccountMeta, CreditRecord, DebtMovement, DebtRecord, DepositRecord, DepositTopUp, DepositWithdrawal, FinanceRecord } from './types';
import { getTodayStr } from './utils';
import { recalcFutureAccruals } from './domain/schedule';
import { round2, sumMoney } from './domain/money';
import { parseCredits, parseDebts, parseDeposits, parseRecords, parseStringList } from './domain/validate';

const DATA_VERSION = 1;

interface AccountMetaFile {
  version: number;
  name: string;
  currency: string;
  accentColor?: string;
  sourcePath?: string;
}

interface AccountRecordsFile {
  version: number;
  records: FinanceRecord[];
  categories: string[];
  tags: string[];
  payers: string[];
}

function emptyMeta(defaultCurrency: string): AccountMetaFile {
  return { version: DATA_VERSION, name: '', currency: defaultCurrency, sourcePath: '' };
}

function emptyRecords(): AccountRecordsFile {
  return { version: DATA_VERSION, records: [], categories: [], tags: [], payers: [] };
}

function addToSet(arr: string[], value: string): void {
  const v = value.trim();
  if (v && !arr.includes(v)) arr.push(v);
}

export class FinanceStorage {
  private app:   App;
  private base:  string;

  private metaCache = new Map<string, AccountMetaFile>();
  private metaDirty = new Set<string>();

  private recordsCache = new Map<string, AccountRecordsFile>();
  private recordsDirty = new Set<string>();

  private debtsCache = new Map<string, DebtRecord[]>();
  private debtsDirty = new Set<string>();

  private creditsCache = new Map<string, CreditRecord[]>();
  private creditsDirty = new Set<string>();

  private depositsCache = new Map<string, DepositRecord[]>();
  private depositsDirty = new Set<string>();

  private folderOverrides = new Map<string, string>();

  private timer: ReturnType<typeof setTimeout> | null = null;
  private defaultCurrency: string;

  constructor(app: App, pluginId: string, defaultCurrency = '₽') {
    this.app             = app;
    this.defaultCurrency = defaultCurrency;
    this.base            = normalizePath(`.obsidian/plugins/${pluginId}/accounts`);
  }

  setDefaultCurrency(c: string) { this.defaultCurrency = c; }

  private getFolderBaseName(notePath: string): string {
    const withoutExt = notePath.replace(/\.md$/i, '');
    const segments = withoutExt.split(/[\\/]/);
    const folderName = segments.length >= 2
      ? segments.slice(-2).join('_')
      : segments[0];
    return folderName.replace(/[\\/:"*?<>|]/g, '_');
  }

  private noteFolder(notePath: string): string {
    const override = this.folderOverrides.get(notePath);
    if (override) return normalizePath(`${this.base}/${override}`);
    const safe = this.getFolderBaseName(notePath);
    return normalizePath(`${this.base}/${safe}`);
  }

  private fp(notePath: string, suffix: string): string {
    return normalizePath(`${this.noteFolder(notePath)}/${suffix}.json`);
  }

  private async ensureBase(): Promise<void> {
    const a = this.app.vault.adapter;
    if (!(await a.exists(this.base))) await a.mkdir(this.base);
  }

  private async ensureNoteFolder(notePath: string): Promise<void> {
    const a = this.app.vault.adapter;
    const folder = this.noteFolder(notePath);

    if (!(await a.exists(folder))) {
      await a.mkdir(folder);
      return;
    }

    const metaPath = normalizePath(`${folder}/meta.json`);
    if (await a.exists(metaPath)) {
      try {
        const meta = JSON.parse(await a.read(metaPath)) as AccountMetaFile;
        if (meta.sourcePath && meta.sourcePath !== notePath) {
          const base = this.getFolderBaseName(notePath);
          let suffix = 1;
          while (true) {
            const newName = `${base}_${suffix}`;
            const newFolder = normalizePath(`${this.base}/${newName}`);
            if (!(await a.exists(newFolder))) {
              await a.mkdir(newFolder);
              this.folderOverrides.set(notePath, newName);
              return;
            }
            suffix++;
          }
        }
      } catch { /* ignore corrupt meta */ }
    }
  }

  // ── Load methods ──────────────────────────────────────────────────────────

  private async readJson(notePath: string, suffix: string): Promise<unknown> {
    const fp = this.fp(notePath, suffix);
    if (!(await this.app.vault.adapter.exists(fp))) return null;
    try {
      return JSON.parse(await this.app.vault.adapter.read(fp));
    } catch (e) {
      console.error(`[FT-storage] ${suffix}.json parse error:`, e);
      return null;
    }
  }

  private async loadMeta(notePath: string): Promise<AccountMetaFile> {
    const cached = this.metaCache.get(notePath);
    if (cached) return cached;

    const raw = await this.readJson(notePath, 'meta');
    const meta = emptyMeta(this.defaultCurrency);
    meta.sourcePath = notePath;
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      const o = raw as Record<string, unknown>;
      if (typeof o.name === 'string') meta.name = o.name;
      if (typeof o.currency === 'string' && o.currency) meta.currency = o.currency;
      if (typeof o.accentColor === 'string') meta.accentColor = o.accentColor;
      if (typeof o.sourcePath === 'string') meta.sourcePath = o.sourcePath;
    }
    this.metaCache.set(notePath, meta);
    return meta;
  }

  private async loadRecords(notePath: string): Promise<AccountRecordsFile> {
    const cached = this.recordsCache.get(notePath);
    if (cached) return cached;

    const raw = await this.readJson(notePath, 'records');
    const file = emptyRecords();
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      const o = raw as Record<string, unknown>;
      file.records = parseRecords(o.records);
      file.categories = parseStringList(o.categories);
      file.tags = parseStringList(o.tags);
      file.payers = parseStringList(o.payers);
    }
    this.recordsCache.set(notePath, file);
    return file;
  }

  private async loadDebts(notePath: string): Promise<DebtRecord[]> {
    const cached = this.debtsCache.get(notePath);
    if (cached) return cached;
    const debts = parseDebts(await this.readJson(notePath, 'debts'));
    this.debtsCache.set(notePath, debts);
    return debts;
  }

  private async loadCredits(notePath: string): Promise<CreditRecord[]> {
    const cached = this.creditsCache.get(notePath);
    if (cached) return cached;
    const credits = parseCredits(await this.readJson(notePath, 'credits'));
    this.creditsCache.set(notePath, credits);
    return credits;
  }

  private async loadDeposits(notePath: string): Promise<DepositRecord[]> {
    const cached = this.depositsCache.get(notePath);
    if (cached) return cached;
    const deposits = parseDeposits(await this.readJson(notePath, 'deposits'));
    this.depositsCache.set(notePath, deposits);
    return deposits;
  }

  // ── Composite load (for AccountView) ──────────────────────────────────────

  async load(notePath: string): Promise<AccountData> {
    const meta = await this.loadMeta(notePath);
    const recs = await this.loadRecords(notePath);
    const debts = await this.loadDebts(notePath);
    const credits = await this.loadCredits(notePath);
    const deposits = await this.loadDeposits(notePath);

    return {
      version: DATA_VERSION,
      name: meta.name,
      currency: meta.currency,
      accentColor: meta.accentColor,
      records: recs.records,
      categories: recs.categories,
      tags: recs.tags,
      payers: recs.payers,
      debts,
      credits,
      deposits,
    };
  }

  // ── Schedule / Flush ──────────────────────────────────────────────────────

  private scheduleMeta(notePath: string): void { this.metaDirty.add(notePath); this.startTimer(); }
  private scheduleRecords(notePath: string): void { this.recordsDirty.add(notePath); this.startTimer(); }
  private scheduleDebts(notePath: string): void { this.debtsDirty.add(notePath); this.startTimer(); }
  private scheduleCredits(notePath: string): void { this.creditsDirty.add(notePath); this.startTimer(); }
  private scheduleDeposits(notePath: string): void { this.depositsDirty.add(notePath); this.startTimer(); }

  private startTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flushDirty(), 500);
  }

  private async flushDirty(): Promise<void> {
    await this.ensureBase();

    const allNotes = new Set([
      ...this.metaDirty,
      ...this.recordsDirty,
      ...this.debtsDirty,
      ...this.creditsDirty,
      ...this.depositsDirty,
    ]);
    for (const np of allNotes) {
      await this.ensureNoteFolder(np);
    }

    for (const np of this.metaDirty) {
      const d = this.metaCache.get(np);
      if (d) {
        d.sourcePath = np;
        await this.app.vault.adapter.write(this.fp(np, 'meta'), JSON.stringify(d));
      }
    }
    this.metaDirty.clear();

    for (const np of this.recordsDirty) {
      const d = this.recordsCache.get(np);
      if (d) await this.app.vault.adapter.write(this.fp(np, 'records'), JSON.stringify(d));
    }
    this.recordsDirty.clear();

    for (const np of this.debtsDirty) {
      const d = this.debtsCache.get(np);
      if (d !== undefined) {
        const fp = this.fp(np, 'debts');
        if (d.length > 0 || await this.app.vault.adapter.exists(fp)) {
          await this.app.vault.adapter.write(fp, JSON.stringify(d));
        }
      }
    }
    this.debtsDirty.clear();

    for (const np of this.creditsDirty) {
      const d = this.creditsCache.get(np);
      if (d !== undefined) {
        const fp = this.fp(np, 'credits');
        if (d.length > 0 || await this.app.vault.adapter.exists(fp)) {
          await this.app.vault.adapter.write(fp, JSON.stringify(d));
        }
      }
    }
    this.creditsDirty.clear();

    for (const np of this.depositsDirty) {
      const d = this.depositsCache.get(np);
      if (d !== undefined) {
        const fp = this.fp(np, 'deposits');
        if (d.length > 0 || await this.app.vault.adapter.exists(fp)) {
          await this.app.vault.adapter.write(fp, JSON.stringify(d));
        }
      }
    }
    this.depositsDirty.clear();
  }

  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    await this.flushDirty();
  }

  // ── Meta ──────────────────────────────────────────────────────────────────

  async updateMeta(notePath: string, meta: Partial<AccountMeta>): Promise<void> {
    const d = await this.loadMeta(notePath);
    if (meta.name     !== undefined) d.name     = meta.name;
    if (meta.currency !== undefined) d.currency = meta.currency;
    if (meta.accentColor !== undefined) d.accentColor = meta.accentColor;
    this.scheduleMeta(notePath);
  }

  // ── Records CRUD ──────────────────────────────────────────────────────────

  async addRecord(notePath: string, rec: FinanceRecord): Promise<void> {
    const d = await this.loadRecords(notePath);
    d.records.push(rec);
    addToSet(d.categories, rec.category);
    addToSet(d.tags,       rec.tag);
    addToSet(d.payers,     rec.payer);
    this.scheduleRecords(notePath);
  }

  async updateRecord(notePath: string, rec: FinanceRecord): Promise<void> {
    const d   = await this.loadRecords(notePath);
    const idx = d.records.findIndex(r => r.id === rec.id);
    if (idx === -1) return;
    d.records[idx] = rec;
    addToSet(d.categories, rec.category);
    addToSet(d.tags,       rec.tag);
    addToSet(d.payers,     rec.payer);
    this.scheduleRecords(notePath);
  }

  async deleteRecord(notePath: string, id: string): Promise<void> {
    const d   = await this.loadRecords(notePath);
    d.records = d.records.filter(r => r.id !== id);
    this.scheduleRecords(notePath);
  }

  async deleteRecordsBatch(notePath: string, ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    const d   = await this.loadRecords(notePath);
    d.records = d.records.filter(r => !idSet.has(r.id));
    this.scheduleRecords(notePath);
  }

  async importRecords(notePath: string, recs: FinanceRecord[]): Promise<void> {
    const d = await this.loadRecords(notePath);
    for (const r of recs) {
      d.records.push(r);
      addToSet(d.categories, r.category);
      addToSet(d.tags,       r.tag);
      addToSet(d.payers,     r.payer);
    }
    this.scheduleRecords(notePath);
  }

  async saveAllRecords(notePath: string, records: FinanceRecord[]): Promise<void> {
    const d = await this.loadRecords(notePath);
    d.records = records;
    d.categories = [];
    d.tags = [];
    d.payers = [];
    records.forEach(r => {
      addToSet(d.categories, r.category);
      addToSet(d.tags, r.tag);
      addToSet(d.payers, r.payer);
    });
    this.scheduleRecords(notePath);
  }

  // ── Debt CRUD ──────────────────────────────────────────────────────────────

  async addDebt(notePath: string, debt: DebtRecord): Promise<void> {
    const d = await this.loadDebts(notePath);
    d.push(debt);
    this.scheduleDebts(notePath);
  }

  async updateDebt(notePath: string, debt: DebtRecord): Promise<void> {
    const d   = await this.loadDebts(notePath);
    const idx = d.findIndex(x => x.id === debt.id);
    if (idx === -1) return;
    d[idx] = debt;
    this.scheduleDebts(notePath);
  }

  async deleteDebt(notePath: string, id: string): Promise<void> {
    const d = await this.loadDebts(notePath);
    const filtered = d.filter(x => x.id !== id);
    this.debtsCache.set(notePath, filtered);
    this.scheduleDebts(notePath);
  }

  async deleteDebtsBatch(notePath: string, ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    const d = await this.loadDebts(notePath);
    const filtered = d.filter(x => !idSet.has(x.id));
    this.debtsCache.set(notePath, filtered);
    this.scheduleDebts(notePath);
  }

  async addDebtMovement(notePath: string, debtId: string, mov: DebtMovement): Promise<void> {
    const d   = await this.loadDebts(notePath);
    const idx = d.findIndex(x => x.id === debtId);
    if (idx === -1) return;
    const debt = d[idx];
    debt.movements.push(mov);
    debt.amount = sumMoney(debt.movements.map(m => m.type === 'borrow' ? m.amount : -m.amount));
    this.scheduleDebts(notePath);
  }

  async updateDebtMovement(notePath: string, debtId: string, mov: DebtMovement): Promise<void> {
    const d   = await this.loadDebts(notePath);
    const idx = d.findIndex(x => x.id === debtId);
    if (idx === -1) return;
    const debt = d[idx];
    const mIdx = debt.movements.findIndex(m => m.id === mov.id);
    if (mIdx === -1) return;
    debt.movements[mIdx] = mov;
    debt.amount = sumMoney(debt.movements.map(m => m.type === 'borrow' ? m.amount : -m.amount));
    this.scheduleDebts(notePath);
  }

  async deleteDebtMovement(notePath: string, debtId: string, movementId: string): Promise<void> {
    const d   = await this.loadDebts(notePath);
    const idx = d.findIndex(x => x.id === debtId);
    if (idx === -1) return;
    const debt = d[idx];
    debt.movements = debt.movements.filter(m => m.id !== movementId);
    debt.amount = sumMoney(debt.movements.map(m => m.type === 'borrow' ? m.amount : -m.amount));
    this.scheduleDebts(notePath);
  }

  // ── Credit CRUD ──────────────────────────────────────────────────────────────

  async addCredit(notePath: string, credit: CreditRecord): Promise<void> {
    const d = await this.loadCredits(notePath);
    d.push(credit);
    this.scheduleCredits(notePath);
  }

  async updateCredit(notePath: string, credit: CreditRecord): Promise<void> {
    const d   = await this.loadCredits(notePath);
    const idx = d.findIndex(x => x.id === credit.id);
    if (idx === -1) return;
    d[idx] = credit;
    this.scheduleCredits(notePath);
  }

  async deleteCredit(notePath: string, id: string): Promise<void> {
    const d = await this.loadCredits(notePath);
    const filtered = d.filter(x => x.id !== id);
    this.creditsCache.set(notePath, filtered);
    this.scheduleCredits(notePath);
  }

  async deleteCreditsBatch(notePath: string, ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    const d = await this.loadCredits(notePath);
    const filtered = d.filter(x => !idSet.has(x.id));
    this.creditsCache.set(notePath, filtered);
    this.scheduleCredits(notePath);
  }

  // ── Deposit CRUD ──────────────────────────────────────────────────────────────

  async addDeposit(notePath: string, deposit: DepositRecord): Promise<void> {
    const d = await this.loadDeposits(notePath);
    d.push(deposit);
    this.scheduleDeposits(notePath);
  }

  async updateDeposit(notePath: string, deposit: DepositRecord): Promise<void> {
    const d   = await this.loadDeposits(notePath);
    const idx = d.findIndex(x => x.id === deposit.id);
    if (idx === -1) return;
    d[idx] = deposit;
    this.scheduleDeposits(notePath);
  }

  async deleteDeposit(notePath: string, id: string): Promise<void> {
    const d = await this.loadDeposits(notePath);
    const filtered = d.filter(x => x.id !== id);
    this.depositsCache.set(notePath, filtered);
    this.scheduleDeposits(notePath);
  }

  async deleteDepositsBatch(notePath: string, ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    const d = await this.loadDeposits(notePath);
    const filtered = d.filter(x => !idSet.has(x.id));
    this.depositsCache.set(notePath, filtered);
    this.scheduleDeposits(notePath);
  }

  async saveAllDeposits(notePath: string, deposits: DepositRecord[]): Promise<void> {
    this.depositsCache.set(notePath, deposits);
    this.scheduleDeposits(notePath);
  }

  async addDepositTopUp(notePath: string, depositId: string, topUp: DepositTopUp): Promise<void> {
    const d = await this.loadDeposits(notePath);
    const idx = d.findIndex(x => x.id === depositId);
    if (idx === -1) return;
    const deposit = d[idx];
    if (!deposit.topUps) deposit.topUps = [];
    deposit.topUps.push(topUp);
    deposit.amount = round2(deposit.amount + topUp.amount);
    this.recalculateFutureAccruals(deposit);
    this.scheduleDeposits(notePath);
  }

  async deleteDepositTopUp(notePath: string, depositId: string, topUpId: string): Promise<void> {
    const d = await this.loadDeposits(notePath);
    const idx = d.findIndex(x => x.id === depositId);
    if (idx === -1) return;
    const deposit = d[idx];
    if (!deposit.topUps) return;
    const topUp = deposit.topUps.find(t => t.id === topUpId);
    if (topUp) {
      deposit.amount = Math.max(0, round2(deposit.amount - topUp.amount));
      deposit.topUps = deposit.topUps.filter(t => t.id !== topUpId);
      this.recalculateFutureAccruals(deposit);
    }
    this.scheduleDeposits(notePath);
  }

  async addDepositWithdrawal(notePath: string, depositId: string, withdrawal: DepositWithdrawal): Promise<void> {
    const d = await this.loadDeposits(notePath);
    const idx = d.findIndex(x => x.id === depositId);
    if (idx === -1) return;
    const deposit = d[idx];
    if (!deposit.withdrawals) deposit.withdrawals = [];
    deposit.withdrawals.push(withdrawal);
    deposit.amount = Math.max(0, round2(deposit.amount - withdrawal.amount));
    this.recalculateFutureAccruals(deposit);
    this.scheduleDeposits(notePath);
  }

  async deleteDepositWithdrawal(notePath: string, depositId: string, withdrawalId: string): Promise<void> {
    const d = await this.loadDeposits(notePath);
    const idx = d.findIndex(x => x.id === depositId);
    if (idx === -1) return;
    const deposit = d[idx];
    if (!deposit.withdrawals) return;
    const withdrawal = deposit.withdrawals.find(w => w.id === withdrawalId);
    if (withdrawal) {
      deposit.amount = round2(deposit.amount + withdrawal.amount);
      deposit.withdrawals = deposit.withdrawals.filter(w => w.id !== withdrawalId);
      this.recalculateFutureAccruals(deposit);
    }
    this.scheduleDeposits(notePath);
  }

  private recalculateFutureAccruals(deposit: DepositRecord): void {
    deposit.accruals = recalcFutureAccruals(deposit, getTodayStr());
  }

  async saveAllCredits(notePath: string, credits: CreditRecord[]): Promise<void> {
    this.creditsCache.set(notePath, credits);
    this.scheduleCredits(notePath);
  }

  // ── View State ──────────────────────────────────────────────────────────

  async saveViewState(notePath: string, state: Record<string, unknown>): Promise<void> {
    const a = this.app.vault.adapter;
    await this.ensureNoteFolder(notePath);
    const fp = this.fp(notePath, 'state');
    await a.write(fp, JSON.stringify(state));
  }

  async loadViewState(notePath: string): Promise<Record<string, unknown> | null> {
    const fp = this.fp(notePath, 'state');
    if (await this.app.vault.adapter.exists(fp)) {
      try {
        return JSON.parse(await this.app.vault.adapter.read(fp));
      } catch { /* ignore */ }
    }
    return null;
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  invalidate(notePath: string): void {
    this.folderOverrides.delete(notePath);
    this.metaCache.delete(notePath);
    this.recordsCache.delete(notePath);
    this.debtsCache.delete(notePath);
    this.creditsCache.delete(notePath);
    this.depositsCache.delete(notePath);
  }

  async resetAllData(notePath: string): Promise<void> {
    const recs = await this.loadRecords(notePath);
    recs.records = [];
    recs.categories = [];
    recs.tags = [];
    recs.payers = [];
    this.scheduleRecords(notePath);

    const debts: DebtRecord[] = [];
    this.debtsCache.set(notePath, debts);
    this.scheduleDebts(notePath);

    const credits: CreditRecord[] = [];
    this.creditsCache.set(notePath, credits);
    this.scheduleCredits(notePath);

    const deposits: DepositRecord[] = [];
    this.depositsCache.set(notePath, deposits);
    this.scheduleDeposits(notePath);
  }

  // ── Rename ────────────────────────────────────────────────────────────────

  async renameAccount(oldNotePath: string, newNotePath: string): Promise<void> {
    await this.flushDirty();

    const a = this.app.vault.adapter;
    const oldFolder = this.noteFolder(oldNotePath);
    const newFolder = this.noteFolder(newNotePath);

    if (await a.exists(oldFolder)) {
      try {
        await a.rename(oldFolder, newFolder);
      } catch {
        // If rename fails, copy all files and delete old folder
        try {
          await this.ensureNoteFolder(newNotePath);
          const suffixes = ['meta', 'records', 'debts', 'credits', 'deposits'];
          for (const suffix of suffixes) {
            const oldFp = this.fp(oldNotePath, suffix);
            const newFp = this.fp(newNotePath, suffix);
            if (await a.exists(oldFp)) {
              const content = await a.read(oldFp);
              await a.write(newFp, content);
              await a.remove(oldFp);
            }
          }
          // Try to remove old folder if empty
          try { await a.remove(oldFolder); } catch { /* ignore */ }
        } catch { /* ignore */ }
      }
    }

    // Update caches
    const mvCache = <T>(cache: Map<string, T>, old: string, n: string) => {
      const v = cache.get(old);
      if (v !== undefined) { cache.set(n, v); cache.delete(old); }
    };
    mvCache(this.metaCache, oldNotePath, newNotePath);
    mvCache(this.recordsCache, oldNotePath, newNotePath);
    mvCache(this.debtsCache, oldNotePath, newNotePath);
    mvCache(this.creditsCache, oldNotePath, newNotePath);
    mvCache(this.depositsCache, oldNotePath, newNotePath);

    // Update dirty sets
    const mvSet = (set: Set<string>) => {
      if (set.has(oldNotePath)) { set.delete(oldNotePath); set.add(newNotePath); }
    };
    mvSet(this.metaDirty);
    mvSet(this.recordsDirty);
    mvSet(this.debtsDirty);
    mvSet(this.creditsDirty);
    mvSet(this.depositsDirty);
  }
}
