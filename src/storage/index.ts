import { App } from 'obsidian';
import { AccountData, AccountMeta, CreditRecord, DebtMovement, DebtRecord, DepositRecord, DepositTopUp, DepositWithdrawal, FinanceRecord } from '../types';
import { getTodayStr } from '../utils';
import { recalcFutureAccruals } from '../domain/schedule';
import { round2, sumMoney } from '../domain/money';
import { parseCredits, parseDebts, parseDeposits, parseRecords, parseStringList } from '../domain/validate';
import { VaultAdapter } from './VaultAdapter';
import { AccountFiles } from './AccountFiles';
import { FileStore, FlushScheduler } from './AccountRepo';

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

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function addToSet(arr: string[], value: string): void {
  const v = value.trim();
  if (v && !arr.includes(v)) arr.push(v);
}

function rebuildLookups(file: AccountRecordsFile): void {
  file.categories = [];
  file.tags = [];
  file.payers = [];
  for (const r of file.records) {
    addToSet(file.categories, r.category);
    addToSet(file.tags, r.tag);
    addToSet(file.payers, r.payer);
  }
}

export class FinanceStorage {
  private vault: VaultAdapter;
  private files: AccountFiles;
  private scheduler: FlushScheduler;
  private defaultCurrency: string;

  private meta: FileStore<AccountMetaFile>;
  private records: FileStore<AccountRecordsFile>;
  private debts: FileStore<DebtRecord[]>;
  private credits: FileStore<CreditRecord[]>;
  private deposits: FileStore<DepositRecord[]>;
  private state: FileStore<Record<string, unknown> | null>;
  private allStores: FileStore<unknown>[];

  constructor(app: App, pluginId: string, defaultCurrency = '₽') {
    this.defaultCurrency = defaultCurrency;
    this.vault = new VaultAdapter(app);
    this.files = new AccountFiles(pluginId);
    this.scheduler = new FlushScheduler(() => this.flushAll());
    const dirty = () => { this.scheduler.schedule(); };

    this.meta = new FileStore('meta', raw => this.parseMeta(raw), dirty);
    this.records = new FileStore('records', raw => this.parseRecordsFile(raw), dirty);
    this.debts = new FileStore('debts', parseDebts, dirty);
    this.credits = new FileStore('credits', parseCredits, dirty);
    this.deposits = new FileStore('deposits', parseDeposits, dirty);
    this.state = new FileStore('state', raw => (isObject(raw) ? raw : null), dirty);
    this.allStores = [this.meta, this.records, this.debts, this.credits, this.deposits, this.state] as FileStore<unknown>[];
  }

  setDefaultCurrency(c: string) { this.defaultCurrency = c; }

  private parseMeta(raw: unknown): AccountMetaFile {
    const meta: AccountMetaFile = { version: DATA_VERSION, name: '', currency: this.defaultCurrency, sourcePath: '' };
    if (isObject(raw)) {
      if (typeof raw.name === 'string') meta.name = raw.name;
      if (typeof raw.currency === 'string' && raw.currency) meta.currency = raw.currency;
      if (typeof raw.accentColor === 'string') meta.accentColor = raw.accentColor;
      if (typeof raw.sourcePath === 'string') meta.sourcePath = raw.sourcePath;
    }
    return meta;
  }

  private parseRecordsFile(raw: unknown): AccountRecordsFile {
    const file: AccountRecordsFile = { version: DATA_VERSION, records: [], categories: [], tags: [], payers: [] };
    if (isObject(raw)) {
      file.records = parseRecords(raw.records);
      file.categories = parseStringList(raw.categories);
      file.tags = parseStringList(raw.tags);
      file.payers = parseStringList(raw.payers);
    }
    return file;
  }

  private loadMeta(accountId: string): Promise<AccountMetaFile> {
    return this.meta.load(this.vault, this.files, accountId);
  }

  private loadRecords(accountId: string): Promise<AccountRecordsFile> {
    return this.records.load(this.vault, this.files, accountId);
  }

  private loadDebts(accountId: string): Promise<DebtRecord[]> {
    return this.debts.load(this.vault, this.files, accountId);
  }

  private loadCredits(accountId: string): Promise<CreditRecord[]> {
    return this.credits.load(this.vault, this.files, accountId);
  }

  private loadDeposits(accountId: string): Promise<DepositRecord[]> {
    return this.deposits.load(this.vault, this.files, accountId);
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

  // ── Flush ─────────────────────────────────────────────────────────────────

  private async flushAll(): Promise<void> {
    await this.vault.mkdir(this.files.base);
    for (const store of this.allStores) {
      await store.flush(this.vault, this.files);
    }
  }

  async flush(): Promise<void> {
    await this.scheduler.flushNow();
  }

  // ── Meta ──────────────────────────────────────────────────────────────────

  async updateMeta(accountId: string, meta: Partial<AccountMeta>): Promise<void> {
    const d = await this.loadMeta(accountId);
    if (meta.name !== undefined) d.name = meta.name;
    if (meta.currency !== undefined) d.currency = meta.currency;
    if (meta.accentColor !== undefined) d.accentColor = meta.accentColor;
    this.meta.markDirty(accountId);
  }

  /** Notes the path where this account's block was last rendered — for diagnostics only. */
  async touchSourcePath(accountId: string, sourcePath: string): Promise<void> {
    const meta = await this.loadMeta(accountId);
    if (meta.sourcePath === sourcePath) return;
    meta.sourcePath = sourcePath;
    this.meta.markDirty(accountId);
  }

  // ── Records CRUD ──────────────────────────────────────────────────────────

  async addRecord(accountId: string, rec: FinanceRecord): Promise<void> {
    const d = await this.loadRecords(accountId);
    d.records.push(rec);
    addToSet(d.categories, rec.category);
    addToSet(d.tags, rec.tag);
    addToSet(d.payers, rec.payer);
    this.records.markDirty(accountId);
  }

  async updateRecord(accountId: string, rec: FinanceRecord): Promise<void> {
    const d = await this.loadRecords(accountId);
    const idx = d.records.findIndex(r => r.id === rec.id);
    if (idx === -1) return;
    d.records[idx] = rec;
    addToSet(d.categories, rec.category);
    addToSet(d.tags, rec.tag);
    addToSet(d.payers, rec.payer);
    this.records.markDirty(accountId);
  }

  async deleteRecord(accountId: string, id: string): Promise<void> {
    const d = await this.loadRecords(accountId);
    d.records = d.records.filter(r => r.id !== id);
    this.records.markDirty(accountId);
  }

  async deleteRecordsBatch(accountId: string, ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    const d = await this.loadRecords(accountId);
    d.records = d.records.filter(r => !idSet.has(r.id));
    this.records.markDirty(accountId);
  }

  async importRecords(accountId: string, recs: FinanceRecord[]): Promise<void> {
    const d = await this.loadRecords(accountId);
    for (const r of recs) {
      d.records.push(r);
      addToSet(d.categories, r.category);
      addToSet(d.tags, r.tag);
      addToSet(d.payers, r.payer);
    }
    this.records.markDirty(accountId);
  }

  async saveAllRecords(accountId: string, records: FinanceRecord[]): Promise<void> {
    const d = await this.loadRecords(accountId);
    d.records = records;
    rebuildLookups(d);
    this.records.markDirty(accountId);
  }

  // ── Debt CRUD ─────────────────────────────────────────────────────────────

  async addDebt(accountId: string, debt: DebtRecord): Promise<void> {
    (await this.loadDebts(accountId)).push(debt);
    this.debts.markDirty(accountId);
  }

  async updateDebt(accountId: string, debt: DebtRecord): Promise<void> {
    const d = await this.loadDebts(accountId);
    const idx = d.findIndex(x => x.id === debt.id);
    if (idx === -1) return;
    d[idx] = debt;
    this.debts.markDirty(accountId);
  }

  async deleteDebt(accountId: string, id: string): Promise<void> {
    const d = await this.loadDebts(accountId);
    this.debts.set(accountId, d.filter(x => x.id !== id));
  }

  async deleteDebtsBatch(accountId: string, ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    const d = await this.loadDebts(accountId);
    this.debts.set(accountId, d.filter(x => !idSet.has(x.id)));
  }

  private async withDebt(accountId: string, debtId: string, fn: (debt: DebtRecord) => void): Promise<void> {
    const d = await this.loadDebts(accountId);
    const debt = d.find(x => x.id === debtId);
    if (!debt) return;
    fn(debt);
    debt.amount = sumMoney(debt.movements.map(m => m.type === 'borrow' ? m.amount : -m.amount));
    this.debts.markDirty(accountId);
  }

  async addDebtMovement(accountId: string, debtId: string, mov: DebtMovement): Promise<void> {
    await this.withDebt(accountId, debtId, debt => { debt.movements.push(mov); });
  }

  async updateDebtMovement(accountId: string, debtId: string, mov: DebtMovement): Promise<void> {
    await this.withDebt(accountId, debtId, debt => {
      const idx = debt.movements.findIndex(m => m.id === mov.id);
      if (idx !== -1) debt.movements[idx] = mov;
    });
  }

  async deleteDebtMovement(accountId: string, debtId: string, movementId: string): Promise<void> {
    await this.withDebt(accountId, debtId, debt => {
      debt.movements = debt.movements.filter(m => m.id !== movementId);
    });
  }

  // ── Credit CRUD ───────────────────────────────────────────────────────────

  async addCredit(accountId: string, credit: CreditRecord): Promise<void> {
    (await this.loadCredits(accountId)).push(credit);
    this.credits.markDirty(accountId);
  }

  async updateCredit(accountId: string, credit: CreditRecord): Promise<void> {
    const d = await this.loadCredits(accountId);
    const idx = d.findIndex(x => x.id === credit.id);
    if (idx === -1) return;
    d[idx] = credit;
    this.credits.markDirty(accountId);
  }

  async deleteCredit(accountId: string, id: string): Promise<void> {
    const d = await this.loadCredits(accountId);
    this.credits.set(accountId, d.filter(x => x.id !== id));
  }

  async deleteCreditsBatch(accountId: string, ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    const d = await this.loadCredits(accountId);
    this.credits.set(accountId, d.filter(x => !idSet.has(x.id)));
  }

  async saveAllCredits(accountId: string, credits: CreditRecord[]): Promise<void> {
    this.credits.set(accountId, credits);
  }

  // ── Deposit CRUD ──────────────────────────────────────────────────────────

  async addDeposit(accountId: string, deposit: DepositRecord): Promise<void> {
    (await this.loadDeposits(accountId)).push(deposit);
    this.deposits.markDirty(accountId);
  }

  async updateDeposit(accountId: string, deposit: DepositRecord): Promise<void> {
    const d = await this.loadDeposits(accountId);
    const idx = d.findIndex(x => x.id === deposit.id);
    if (idx === -1) return;
    d[idx] = deposit;
    this.deposits.markDirty(accountId);
  }

  async deleteDeposit(accountId: string, id: string): Promise<void> {
    const d = await this.loadDeposits(accountId);
    this.deposits.set(accountId, d.filter(x => x.id !== id));
  }

  async deleteDepositsBatch(accountId: string, ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    const d = await this.loadDeposits(accountId);
    this.deposits.set(accountId, d.filter(x => !idSet.has(x.id)));
  }

  async saveAllDeposits(accountId: string, deposits: DepositRecord[]): Promise<void> {
    this.deposits.set(accountId, deposits);
  }

  private async withDeposit(accountId: string, depositId: string, fn: (deposit: DepositRecord) => void): Promise<void> {
    const d = await this.loadDeposits(accountId);
    const deposit = d.find(x => x.id === depositId);
    if (!deposit) return;
    fn(deposit);
    deposit.accruals = recalcFutureAccruals(deposit, getTodayStr());
    this.deposits.markDirty(accountId);
  }

  async addDepositTopUp(accountId: string, depositId: string, topUp: DepositTopUp): Promise<void> {
    await this.withDeposit(accountId, depositId, deposit => {
      deposit.topUps.push(topUp);
      deposit.amount = round2(deposit.amount + topUp.amount);
    });
  }

  async deleteDepositTopUp(accountId: string, depositId: string, topUpId: string): Promise<void> {
    await this.withDeposit(accountId, depositId, deposit => {
      const topUp = deposit.topUps.find(t => t.id === topUpId);
      if (!topUp) return;
      deposit.amount = Math.max(0, round2(deposit.amount - topUp.amount));
      deposit.topUps = deposit.topUps.filter(t => t.id !== topUpId);
    });
  }

  async addDepositWithdrawal(accountId: string, depositId: string, withdrawal: DepositWithdrawal): Promise<void> {
    await this.withDeposit(accountId, depositId, deposit => {
      deposit.withdrawals.push(withdrawal);
      deposit.amount = Math.max(0, round2(deposit.amount - withdrawal.amount));
    });
  }

  async deleteDepositWithdrawal(accountId: string, depositId: string, withdrawalId: string): Promise<void> {
    await this.withDeposit(accountId, depositId, deposit => {
      const withdrawal = deposit.withdrawals.find(w => w.id === withdrawalId);
      if (!withdrawal) return;
      deposit.amount = round2(deposit.amount + withdrawal.amount);
      deposit.withdrawals = deposit.withdrawals.filter(w => w.id !== withdrawalId);
    });
  }

  // ── View State ────────────────────────────────────────────────────────────

  async saveViewState(accountId: string, state: Record<string, unknown>): Promise<void> {
    this.state.set(accountId, state);
  }

  async loadViewState(accountId: string): Promise<Record<string, unknown> | null> {
    return this.state.load(this.vault, this.files, accountId);
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  invalidate(accountId: string): void {
    for (const store of this.allStores) store.invalidate(accountId);
  }

  async resetAllData(accountId: string): Promise<void> {
    const recs = await this.loadRecords(accountId);
    recs.records = [];
    rebuildLookups(recs);
    this.records.markDirty(accountId);
    this.debts.set(accountId, []);
    this.credits.set(accountId, []);
    this.deposits.set(accountId, []);
  }

  /** Account folders whose id is not referenced by any block in the vault. */
  async findOrphanedAccounts(liveIds: Set<string>): Promise<string[]> {
    const folders = await this.vault.listFolders(this.files.base);
    return folders
      .map(f => f.split('/').pop() ?? '')
      .filter(id => id && !liveIds.has(id));
  }

  async deleteAccount(accountId: string): Promise<void> {
    await this.vault.rmdir(this.files.folder(accountId));
    this.invalidate(accountId);
  }
}
