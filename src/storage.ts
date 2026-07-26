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
  /** Where the note was last seen. A display/diagnostics hint only — never identity. */
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


  private timer: ReturnType<typeof setTimeout> | null = null;
  private defaultCurrency: string;

  constructor(app: App, pluginId: string, defaultCurrency = '₽') {
    this.app             = app;
    this.defaultCurrency = defaultCurrency;
    this.base            = normalizePath(`.obsidian/plugins/${pluginId}/accounts`);
  }

  setDefaultCurrency(c: string) { this.defaultCurrency = c; }

  /** The id is self-contained, so this folder never has to be renamed or disambiguated. */
  private accountFolder(accountId: string): string {
    return normalizePath(`${this.base}/${accountId}`);
  }

  private fp(accountId: string, suffix: string): string {
    return normalizePath(`${this.accountFolder(accountId)}/${suffix}.json`);
  }

  private async ensureBase(): Promise<void> {
    const a = this.app.vault.adapter;
    if (!(await a.exists(this.base))) await a.mkdir(this.base);
  }

  private async ensureAccountFolder(accountId: string): Promise<void> {
    const a = this.app.vault.adapter;
    const folder = this.accountFolder(accountId);
    if (!(await a.exists(folder))) await a.mkdir(folder);
  }

  // ── Load methods ──────────────────────────────────────────────────────────

  private async readJson(accountId: string, suffix: string): Promise<unknown> {
    const fp = this.fp(accountId, suffix);
    if (!(await this.app.vault.adapter.exists(fp))) return null;
    try {
      return JSON.parse(await this.app.vault.adapter.read(fp));
    } catch (e) {
      console.error(`[FT-storage] ${suffix}.json parse error:`, e);
      return null;
    }
  }

  private async loadMeta(accountId: string): Promise<AccountMetaFile> {
    const cached = this.metaCache.get(accountId);
    if (cached) return cached;

    const raw = await this.readJson(accountId, 'meta');
    const meta = emptyMeta(this.defaultCurrency);
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      const o = raw as Record<string, unknown>;
      if (typeof o.name === 'string') meta.name = o.name;
      if (typeof o.currency === 'string' && o.currency) meta.currency = o.currency;
      if (typeof o.accentColor === 'string') meta.accentColor = o.accentColor;
      if (typeof o.sourcePath === 'string') meta.sourcePath = o.sourcePath;
    }
    this.metaCache.set(accountId, meta);
    return meta;
  }

  private async loadRecords(accountId: string): Promise<AccountRecordsFile> {
    const cached = this.recordsCache.get(accountId);
    if (cached) return cached;

    const raw = await this.readJson(accountId, 'records');
    const file = emptyRecords();
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      const o = raw as Record<string, unknown>;
      file.records = parseRecords(o.records);
      file.categories = parseStringList(o.categories);
      file.tags = parseStringList(o.tags);
      file.payers = parseStringList(o.payers);
    }
    this.recordsCache.set(accountId, file);
    return file;
  }

  private async loadDebts(accountId: string): Promise<DebtRecord[]> {
    const cached = this.debtsCache.get(accountId);
    if (cached) return cached;
    const debts = parseDebts(await this.readJson(accountId, 'debts'));
    this.debtsCache.set(accountId, debts);
    return debts;
  }

  private async loadCredits(accountId: string): Promise<CreditRecord[]> {
    const cached = this.creditsCache.get(accountId);
    if (cached) return cached;
    const credits = parseCredits(await this.readJson(accountId, 'credits'));
    this.creditsCache.set(accountId, credits);
    return credits;
  }

  private async loadDeposits(accountId: string): Promise<DepositRecord[]> {
    const cached = this.depositsCache.get(accountId);
    if (cached) return cached;
    const deposits = parseDeposits(await this.readJson(accountId, 'deposits'));
    this.depositsCache.set(accountId, deposits);
    return deposits;
  }

  // ── Composite load (for AccountView) ──────────────────────────────────────

  async load(accountId: string): Promise<AccountData> {
    const meta = await this.loadMeta(accountId);
    const recs = await this.loadRecords(accountId);
    const debts = await this.loadDebts(accountId);
    const credits = await this.loadCredits(accountId);
    const deposits = await this.loadDeposits(accountId);

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

  private scheduleMeta(accountId: string): void { this.metaDirty.add(accountId); this.startTimer(); }
  private scheduleRecords(accountId: string): void { this.recordsDirty.add(accountId); this.startTimer(); }
  private scheduleDebts(accountId: string): void { this.debtsDirty.add(accountId); this.startTimer(); }
  private scheduleCredits(accountId: string): void { this.creditsDirty.add(accountId); this.startTimer(); }
  private scheduleDeposits(accountId: string): void { this.depositsDirty.add(accountId); this.startTimer(); }

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
      await this.ensureAccountFolder(np);
    }

    for (const np of this.metaDirty) {
      const d = this.metaCache.get(np);
      if (d) await this.app.vault.adapter.write(this.fp(np, 'meta'), JSON.stringify(d));
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

  async updateMeta(accountId: string, meta: Partial<AccountMeta>): Promise<void> {
    const d = await this.loadMeta(accountId);
    if (meta.name     !== undefined) d.name     = meta.name;
    if (meta.currency !== undefined) d.currency = meta.currency;
    if (meta.accentColor !== undefined) d.accentColor = meta.accentColor;
    this.scheduleMeta(accountId);
  }

  // ── Records CRUD ──────────────────────────────────────────────────────────

  async addRecord(accountId: string, rec: FinanceRecord): Promise<void> {
    const d = await this.loadRecords(accountId);
    d.records.push(rec);
    addToSet(d.categories, rec.category);
    addToSet(d.tags,       rec.tag);
    addToSet(d.payers,     rec.payer);
    this.scheduleRecords(accountId);
  }

  async updateRecord(accountId: string, rec: FinanceRecord): Promise<void> {
    const d   = await this.loadRecords(accountId);
    const idx = d.records.findIndex(r => r.id === rec.id);
    if (idx === -1) return;
    d.records[idx] = rec;
    addToSet(d.categories, rec.category);
    addToSet(d.tags,       rec.tag);
    addToSet(d.payers,     rec.payer);
    this.scheduleRecords(accountId);
  }

  async deleteRecord(accountId: string, id: string): Promise<void> {
    const d   = await this.loadRecords(accountId);
    d.records = d.records.filter(r => r.id !== id);
    this.scheduleRecords(accountId);
  }

  async deleteRecordsBatch(accountId: string, ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    const d   = await this.loadRecords(accountId);
    d.records = d.records.filter(r => !idSet.has(r.id));
    this.scheduleRecords(accountId);
  }

  async importRecords(accountId: string, recs: FinanceRecord[]): Promise<void> {
    const d = await this.loadRecords(accountId);
    for (const r of recs) {
      d.records.push(r);
      addToSet(d.categories, r.category);
      addToSet(d.tags,       r.tag);
      addToSet(d.payers,     r.payer);
    }
    this.scheduleRecords(accountId);
  }

  async saveAllRecords(accountId: string, records: FinanceRecord[]): Promise<void> {
    const d = await this.loadRecords(accountId);
    d.records = records;
    d.categories = [];
    d.tags = [];
    d.payers = [];
    records.forEach(r => {
      addToSet(d.categories, r.category);
      addToSet(d.tags, r.tag);
      addToSet(d.payers, r.payer);
    });
    this.scheduleRecords(accountId);
  }

  // ── Debt CRUD ──────────────────────────────────────────────────────────────

  async addDebt(accountId: string, debt: DebtRecord): Promise<void> {
    const d = await this.loadDebts(accountId);
    d.push(debt);
    this.scheduleDebts(accountId);
  }

  async updateDebt(accountId: string, debt: DebtRecord): Promise<void> {
    const d   = await this.loadDebts(accountId);
    const idx = d.findIndex(x => x.id === debt.id);
    if (idx === -1) return;
    d[idx] = debt;
    this.scheduleDebts(accountId);
  }

  async deleteDebt(accountId: string, id: string): Promise<void> {
    const d = await this.loadDebts(accountId);
    const filtered = d.filter(x => x.id !== id);
    this.debtsCache.set(accountId, filtered);
    this.scheduleDebts(accountId);
  }

  async deleteDebtsBatch(accountId: string, ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    const d = await this.loadDebts(accountId);
    const filtered = d.filter(x => !idSet.has(x.id));
    this.debtsCache.set(accountId, filtered);
    this.scheduleDebts(accountId);
  }

  async addDebtMovement(accountId: string, debtId: string, mov: DebtMovement): Promise<void> {
    const d   = await this.loadDebts(accountId);
    const idx = d.findIndex(x => x.id === debtId);
    if (idx === -1) return;
    const debt = d[idx];
    debt.movements.push(mov);
    debt.amount = sumMoney(debt.movements.map(m => m.type === 'borrow' ? m.amount : -m.amount));
    this.scheduleDebts(accountId);
  }

  async updateDebtMovement(accountId: string, debtId: string, mov: DebtMovement): Promise<void> {
    const d   = await this.loadDebts(accountId);
    const idx = d.findIndex(x => x.id === debtId);
    if (idx === -1) return;
    const debt = d[idx];
    const mIdx = debt.movements.findIndex(m => m.id === mov.id);
    if (mIdx === -1) return;
    debt.movements[mIdx] = mov;
    debt.amount = sumMoney(debt.movements.map(m => m.type === 'borrow' ? m.amount : -m.amount));
    this.scheduleDebts(accountId);
  }

  async deleteDebtMovement(accountId: string, debtId: string, movementId: string): Promise<void> {
    const d   = await this.loadDebts(accountId);
    const idx = d.findIndex(x => x.id === debtId);
    if (idx === -1) return;
    const debt = d[idx];
    debt.movements = debt.movements.filter(m => m.id !== movementId);
    debt.amount = sumMoney(debt.movements.map(m => m.type === 'borrow' ? m.amount : -m.amount));
    this.scheduleDebts(accountId);
  }

  // ── Credit CRUD ──────────────────────────────────────────────────────────────

  async addCredit(accountId: string, credit: CreditRecord): Promise<void> {
    const d = await this.loadCredits(accountId);
    d.push(credit);
    this.scheduleCredits(accountId);
  }

  async updateCredit(accountId: string, credit: CreditRecord): Promise<void> {
    const d   = await this.loadCredits(accountId);
    const idx = d.findIndex(x => x.id === credit.id);
    if (idx === -1) return;
    d[idx] = credit;
    this.scheduleCredits(accountId);
  }

  async deleteCredit(accountId: string, id: string): Promise<void> {
    const d = await this.loadCredits(accountId);
    const filtered = d.filter(x => x.id !== id);
    this.creditsCache.set(accountId, filtered);
    this.scheduleCredits(accountId);
  }

  async deleteCreditsBatch(accountId: string, ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    const d = await this.loadCredits(accountId);
    const filtered = d.filter(x => !idSet.has(x.id));
    this.creditsCache.set(accountId, filtered);
    this.scheduleCredits(accountId);
  }

  // ── Deposit CRUD ──────────────────────────────────────────────────────────────

  async addDeposit(accountId: string, deposit: DepositRecord): Promise<void> {
    const d = await this.loadDeposits(accountId);
    d.push(deposit);
    this.scheduleDeposits(accountId);
  }

  async updateDeposit(accountId: string, deposit: DepositRecord): Promise<void> {
    const d   = await this.loadDeposits(accountId);
    const idx = d.findIndex(x => x.id === deposit.id);
    if (idx === -1) return;
    d[idx] = deposit;
    this.scheduleDeposits(accountId);
  }

  async deleteDeposit(accountId: string, id: string): Promise<void> {
    const d = await this.loadDeposits(accountId);
    const filtered = d.filter(x => x.id !== id);
    this.depositsCache.set(accountId, filtered);
    this.scheduleDeposits(accountId);
  }

  async deleteDepositsBatch(accountId: string, ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    const d = await this.loadDeposits(accountId);
    const filtered = d.filter(x => !idSet.has(x.id));
    this.depositsCache.set(accountId, filtered);
    this.scheduleDeposits(accountId);
  }

  async saveAllDeposits(accountId: string, deposits: DepositRecord[]): Promise<void> {
    this.depositsCache.set(accountId, deposits);
    this.scheduleDeposits(accountId);
  }

  async addDepositTopUp(accountId: string, depositId: string, topUp: DepositTopUp): Promise<void> {
    const d = await this.loadDeposits(accountId);
    const idx = d.findIndex(x => x.id === depositId);
    if (idx === -1) return;
    const deposit = d[idx];
    if (!deposit.topUps) deposit.topUps = [];
    deposit.topUps.push(topUp);
    deposit.amount = round2(deposit.amount + topUp.amount);
    this.recalculateFutureAccruals(deposit);
    this.scheduleDeposits(accountId);
  }

  async deleteDepositTopUp(accountId: string, depositId: string, topUpId: string): Promise<void> {
    const d = await this.loadDeposits(accountId);
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
    this.scheduleDeposits(accountId);
  }

  async addDepositWithdrawal(accountId: string, depositId: string, withdrawal: DepositWithdrawal): Promise<void> {
    const d = await this.loadDeposits(accountId);
    const idx = d.findIndex(x => x.id === depositId);
    if (idx === -1) return;
    const deposit = d[idx];
    if (!deposit.withdrawals) deposit.withdrawals = [];
    deposit.withdrawals.push(withdrawal);
    deposit.amount = Math.max(0, round2(deposit.amount - withdrawal.amount));
    this.recalculateFutureAccruals(deposit);
    this.scheduleDeposits(accountId);
  }

  async deleteDepositWithdrawal(accountId: string, depositId: string, withdrawalId: string): Promise<void> {
    const d = await this.loadDeposits(accountId);
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
    this.scheduleDeposits(accountId);
  }

  private recalculateFutureAccruals(deposit: DepositRecord): void {
    deposit.accruals = recalcFutureAccruals(deposit, getTodayStr());
  }

  async saveAllCredits(accountId: string, credits: CreditRecord[]): Promise<void> {
    this.creditsCache.set(accountId, credits);
    this.scheduleCredits(accountId);
  }

  // ── View State ──────────────────────────────────────────────────────────

  async saveViewState(accountId: string, state: Record<string, unknown>): Promise<void> {
    const a = this.app.vault.adapter;
    await this.ensureAccountFolder(accountId);
    const fp = this.fp(accountId, 'state');
    await a.write(fp, JSON.stringify(state));
  }

  async loadViewState(accountId: string): Promise<Record<string, unknown> | null> {
    const fp = this.fp(accountId, 'state');
    if (await this.app.vault.adapter.exists(fp)) {
      try {
        return JSON.parse(await this.app.vault.adapter.read(fp));
      } catch { /* ignore */ }
    }
    return null;
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  invalidate(accountId: string): void {
    this.metaCache.delete(accountId);
    this.recordsCache.delete(accountId);
    this.debtsCache.delete(accountId);
    this.creditsCache.delete(accountId);
    this.depositsCache.delete(accountId);
  }

  async resetAllData(accountId: string): Promise<void> {
    const recs = await this.loadRecords(accountId);
    recs.records = [];
    recs.categories = [];
    recs.tags = [];
    recs.payers = [];
    this.scheduleRecords(accountId);

    const debts: DebtRecord[] = [];
    this.debtsCache.set(accountId, debts);
    this.scheduleDebts(accountId);

    const credits: CreditRecord[] = [];
    this.creditsCache.set(accountId, credits);
    this.scheduleCredits(accountId);

    const deposits: DepositRecord[] = [];
    this.depositsCache.set(accountId, deposits);
    this.scheduleDeposits(accountId);
  }

  /** Notes the path where this account's block was last rendered — for diagnostics only. */
  async touchSourcePath(accountId: string, sourcePath: string): Promise<void> {
    const meta = await this.loadMeta(accountId);
    if (meta.sourcePath === sourcePath) return;
    meta.sourcePath = sourcePath;
    this.scheduleMeta(accountId);
  }

  /** Account folders whose id is not referenced by any block in the vault. */
  async findOrphanedAccounts(liveIds: Set<string>): Promise<string[]> {
    const a = this.app.vault.adapter;
    if (!(await a.exists(this.base))) return [];
    const listing = await a.list(this.base);
    return listing.folders
      .map(f => f.split('/').pop() ?? '')
      .filter(id => id && !liveIds.has(id));
  }

  async deleteAccount(accountId: string): Promise<void> {
    const a = this.app.vault.adapter;
    const folder = this.accountFolder(accountId);
    for (const suffix of ['meta', 'records', 'debts', 'credits', 'deposits', 'state']) {
      const fp = this.fp(accountId, suffix);
      if (await a.exists(fp)) await a.remove(fp);
    }
    if (await a.exists(folder)) await a.rmdir(folder, true);
    this.invalidate(accountId);
  }
}
