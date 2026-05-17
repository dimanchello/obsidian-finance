import { App, normalizePath } from 'obsidian';
import { AccountData, AccountMeta, CreditRecord, DebtMovement, DebtRecord, DepositRecord, DepositTopUp, DepositWithdrawal, FinanceRecord } from './types';

const DATA_VERSION = 4;

interface AccountMetaFile {
  version: number;
  name: string;
  currency: string;
  accentColor?: string;
}

interface AccountRecordsFile {
  version: number;
  records: FinanceRecord[];
  categories: string[];
  tags: string[];
  payers: string[];
}

function emptyMeta(defaultCurrency: string): AccountMetaFile {
  return { version: DATA_VERSION, name: '', currency: defaultCurrency };
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

  private metaCache: Map<string, AccountMetaFile> = new Map();
  private metaDirty: Set<string> = new Set();

  private recordsCache: Map<string, AccountRecordsFile> = new Map();
  private recordsDirty: Set<string> = new Set();

  private debtsCache: Map<string, DebtRecord[]> = new Map();
  private debtsDirty: Set<string> = new Set();

  private creditsCache: Map<string, CreditRecord[]> = new Map();
  private creditsDirty: Set<string> = new Set();

  private depositsCache: Map<string, DepositRecord[]> = new Map();
  private depositsDirty: Set<string> = new Set();

  private timer: ReturnType<typeof setTimeout> | null = null;
  private defaultCurrency: string;

  constructor(app: App, pluginId: string, defaultCurrency = '₽') {
    this.app             = app;
    this.defaultCurrency = defaultCurrency;
    this.base            = normalizePath(`.obsidian/plugins/${pluginId}/accounts`);
  }

  setDefaultCurrency(c: string) { this.defaultCurrency = c; }

  private fp(notePath: string, suffix: string): string {
    const safe = notePath.replace(/[\\/:"*?<>|]/g, '_');
    return normalizePath(`${this.base}/${safe}${suffix}.json`);
  }

  private async ensureBase(): Promise<void> {
    const a = this.app.vault.adapter;
    if (!(await a.exists(this.base))) await a.mkdir(this.base);
  }

  // ── Legacy migration ──────────────────────────────────────────────────────

  private async migrateLegacy(notePath: string): Promise<void> {
    const legacyPath = this.fp(notePath, '');
    if (!(await this.app.vault.adapter.exists(legacyPath))) return;

    try {
      const raw = await this.app.vault.adapter.read(legacyPath);
      const legacy = JSON.parse(raw) as AccountData;

      // Write meta
      const meta: AccountMetaFile = {
        version: DATA_VERSION,
        name: legacy.name || '',
        currency: legacy.currency || this.defaultCurrency,
        accentColor: legacy.accentColor || '',
      };
      await this.app.vault.adapter.write(this.fp(notePath, '.meta'), JSON.stringify(meta));

      // Write records
      const recs: AccountRecordsFile = {
        version: DATA_VERSION,
        records: legacy.records || [],
        categories: legacy.categories || [],
        tags: legacy.tags || [],
        payers: legacy.payers || [],
      };
      await this.app.vault.adapter.write(this.fp(notePath, '.records'), JSON.stringify(recs));

      // Write debts
      await this.app.vault.adapter.write(this.fp(notePath, '.debts'), JSON.stringify(legacy.debts || []));

      // Write credits
      await this.app.vault.adapter.write(this.fp(notePath, '.credits'), JSON.stringify(legacy.credits || []));

      // Write deposits
      await this.app.vault.adapter.write(this.fp(notePath, '.deposits'), JSON.stringify(legacy.deposits || []));

      // Delete legacy file
      await this.app.vault.adapter.remove(legacyPath);
    } catch {
      // Migration failed, leave legacy file as-is
    }
  }

  // ── Load methods ──────────────────────────────────────────────────────────

  private async loadMeta(notePath: string): Promise<AccountMetaFile> {
    if (this.metaCache.has(notePath)) return this.metaCache.get(notePath)!;
    const fp = this.fp(notePath, '.meta');
    if (await this.app.vault.adapter.exists(fp)) {
      try {
        const data = JSON.parse(await this.app.vault.adapter.read(fp)) as AccountMetaFile;
        this.metaCache.set(notePath, data);
        return data;
      } catch { /* corrupt */ }
    }
    const empty = emptyMeta(this.defaultCurrency);
    this.metaCache.set(notePath, empty);
    return empty;
  }

  private async loadRecords(notePath: string): Promise<AccountRecordsFile> {
    if (this.recordsCache.has(notePath)) return this.recordsCache.get(notePath)!;
    const fp = this.fp(notePath, '.records');
    if (await this.app.vault.adapter.exists(fp)) {
      try {
        const data = JSON.parse(await this.app.vault.adapter.read(fp)) as AccountRecordsFile;
        data.records.forEach(r => { if (r.time === undefined) r.time = ''; });
        this.recordsCache.set(notePath, data);
        return data;
      } catch { /* corrupt */ }
    }
    const empty = emptyRecords();
    this.recordsCache.set(notePath, empty);
    return empty;
  }

  private async loadDebts(notePath: string): Promise<DebtRecord[]> {
    if (this.debtsCache.has(notePath)) return this.debtsCache.get(notePath)!;
    const fp = this.fp(notePath, '.debts');
    if (await this.app.vault.adapter.exists(fp)) {
      try {
        const data = JSON.parse(await this.app.vault.adapter.read(fp)) as DebtRecord[];
        data.forEach(d => {
          if (!d.direction) d.direction = 'borrowed';
          if (d.dueDate === undefined) d.dueDate = '';
          if (d.time === undefined) d.time = '';
        });
        this.debtsCache.set(notePath, data);
        return data;
      } catch { /* corrupt */ }
    }
    const empty: DebtRecord[] = [];
    this.debtsCache.set(notePath, empty);
    return empty;
  }

  private async loadCredits(notePath: string): Promise<CreditRecord[]> {
    if (this.creditsCache.has(notePath)) return this.creditsCache.get(notePath)!;
    const fp = this.fp(notePath, '.credits');
    if (await this.app.vault.adapter.exists(fp)) {
      try {
        const data = JSON.parse(await this.app.vault.adapter.read(fp)) as CreditRecord[];
        this.creditsCache.set(notePath, data);
        return data;
      } catch { /* corrupt */ }
    }
    const empty: CreditRecord[] = [];
    this.creditsCache.set(notePath, empty);
    return empty;
  }

  private async loadDeposits(notePath: string): Promise<DepositRecord[]> {
    if (this.depositsCache.has(notePath)) return this.depositsCache.get(notePath)!;
    const fp = this.fp(notePath, '.deposits');
    if (await this.app.vault.adapter.exists(fp)) {
      try {
        const data = JSON.parse(await this.app.vault.adapter.read(fp)) as DepositRecord[];
        data.forEach(d => {
          if (!d.termMonths) d.termMonths = 12;
          if (!d.accrualType) d.accrualType = 'end_of_term';
          if (!d.paymentFrequency) d.paymentFrequency = 'monthly';
          if (!d.type) d.type = 'term';
          if (d.status === undefined) d.status = 'active';
          if (!d.accruals) d.accruals = [];
          if (!d.topUps) d.topUps = [];
          if (!d.withdrawals) d.withdrawals = [];
        });
        this.depositsCache.set(notePath, data);
        return data;
      } catch { /* corrupt */ }
    }
    const empty: DepositRecord[] = [];
    this.depositsCache.set(notePath, empty);
    return empty;
  }

  // ── Composite load (for AccountView) ──────────────────────────────────────

  async load(notePath: string): Promise<AccountData> {
    await this.migrateLegacy(notePath);

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

    for (const np of this.metaDirty) {
      const d = this.metaCache.get(np);
      if (d) await this.app.vault.adapter.write(this.fp(np, '.meta'), JSON.stringify(d));
    }
    this.metaDirty.clear();

    for (const np of this.recordsDirty) {
      const d = this.recordsCache.get(np);
      if (d) await this.app.vault.adapter.write(this.fp(np, '.records'), JSON.stringify(d));
    }
    this.recordsDirty.clear();

    for (const np of this.debtsDirty) {
      const d = this.debtsCache.get(np);
      if (d !== undefined) await this.app.vault.adapter.write(this.fp(np, '.debts'), JSON.stringify(d));
    }
    this.debtsDirty.clear();

    for (const np of this.creditsDirty) {
      const d = this.creditsCache.get(np);
      if (d !== undefined) await this.app.vault.adapter.write(this.fp(np, '.credits'), JSON.stringify(d));
    }
    this.creditsDirty.clear();

    for (const np of this.depositsDirty) {
      const d = this.depositsCache.get(np);
      if (d !== undefined) await this.app.vault.adapter.write(this.fp(np, '.deposits'), JSON.stringify(d));
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

  async addDebtMovement(notePath: string, debtId: string, mov: DebtMovement): Promise<void> {
    const d   = await this.loadDebts(notePath);
    const idx = d.findIndex(x => x.id === debtId);
    if (idx === -1) return;
    const debt = d[idx];
    debt.movements.push(mov);
    debt.amount = debt.movements.reduce((sum, m) => m.type === 'borrow' ? sum + m.amount : sum - m.amount, 0);
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
    deposit.amount += topUp.amount;
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
      deposit.amount = Math.max(0, deposit.amount - topUp.amount);
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
    deposit.amount = Math.max(0, deposit.amount - withdrawal.amount);
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
      deposit.amount += withdrawal.amount;
      deposit.withdrawals = deposit.withdrawals.filter(w => w.id !== withdrawalId);
      this.recalculateFutureAccruals(deposit);
    }
    this.scheduleDeposits(notePath);
  }

  private recalculateFutureAccruals(deposit: DepositRecord): void {
    const today = new Date().toISOString().split('T')[0];
    const monthsStep = deposit.paymentFrequency === 'monthly' ? 1 : 3;
    const accrualAmount = Math.round((deposit.amount * deposit.interestRate / 100) * (monthsStep / 12) * 100) / 100;

    for (const accrual of deposit.accruals) {
      if (accrual.dueDate > today && accrual.status === 'pending') {
        accrual.amount = accrualAmount;
      }
    }
  }

  async saveAllCredits(notePath: string, credits: CreditRecord[]): Promise<void> {
    this.creditsCache.set(notePath, credits);
    this.scheduleCredits(notePath);
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  invalidate(notePath: string): void {
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
}
