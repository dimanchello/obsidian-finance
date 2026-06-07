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

  private noteFolder(notePath: string): string {
    const safe = notePath.replace(/\.md$/i, '').replace(/[\\/:"*?<>|]/g, '_');
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
    const folder = this.noteFolder(notePath);
    const a = this.app.vault.adapter;
    if (!(await a.exists(folder))) await a.mkdir(folder);
  }

  // ── Legacy migration ──────────────────────────────────────────────────────

  private oldFp(notePath: string, suffix: string): string {
    const safe = notePath.replace(/\.md$/i, '').replace(/[\\/:"*?<>|]/g, '_');
    return normalizePath(`${this.base}/${safe}${suffix}.json`);
  }

  private async migrateLegacy(notePath: string): Promise<void> {
    const a = this.app.vault.adapter;

    // Step 1: Check if new folder files already exist
    const newMeta = this.fp(notePath, 'meta');
    const newRecs = this.fp(notePath, 'records');
    if (await a.exists(newMeta) || await a.exists(newRecs)) {
      // New format exists, clean up any old flat files
      await this.cleanupOldFlatFiles(notePath);
      return;
    }

    // Step 2: Try migrating from old flat files (e.g., accounts/name.meta.json → accounts/name/meta.json)
    const oldMeta = this.oldFp(notePath, '.meta');
    const oldRecs = this.oldFp(notePath, '.records');
    if (await a.exists(oldMeta) || await a.exists(oldRecs)) {
      try {
        await this.ensureNoteFolder(notePath);
        const suffixes = ['.meta', '.records', '.debts', '.credits', '.deposits'];
        for (const suffix of suffixes) {
          const oldFile = this.oldFp(notePath, suffix);
          const newSuffix = suffix.replace('.', '');
          const newFile = this.fp(notePath, newSuffix);
          if (await a.exists(oldFile)) {
            await a.rename(oldFile, newFile);
          }
        }
      } catch {
        // Migration failed, try copy+delete fallback
        try {
          await this.ensureNoteFolder(notePath);
          const suffixes = ['.meta', '.records', '.debts', '.credits', '.deposits'];
          for (const suffix of suffixes) {
            const oldFile = this.oldFp(notePath, suffix);
            const newSuffix = suffix.replace('.', '');
            const newFile = this.fp(notePath, newSuffix);
            if (await a.exists(oldFile)) {
              const content = await a.read(oldFile);
              await a.write(newFile, content);
              await a.remove(oldFile);
            }
          }
        } catch { /* ignore */ }
      }
      return;
    }

    // Step 3: Try migrating from single legacy file (accounts/name.json)
    const safe = notePath.replace(/[\\/:"*?<>|]/g, '_');
    const legacyPath = normalizePath(`${this.base}/${safe}.json`);
    if (!(await a.exists(legacyPath))) return;

    try {
      await this.ensureNoteFolder(notePath);

      const raw = await a.read(legacyPath);
      const legacy = JSON.parse(raw) as AccountData;

      const meta: AccountMetaFile = {
        version: DATA_VERSION,
        name: legacy.name || '',
        currency: legacy.currency || this.defaultCurrency,
        accentColor: legacy.accentColor ?? '',
      };
      await a.write(this.fp(notePath, 'meta'), JSON.stringify(meta));

      const recs: AccountRecordsFile = {
        version: DATA_VERSION,
        records: legacy.records || [],
        categories: legacy.categories || [],
        tags: legacy.tags || [],
        payers: legacy.payers || [],
      };
      await a.write(this.fp(notePath, 'records'), JSON.stringify(recs));

      if (legacy.debts && legacy.debts.length > 0) {
        await a.write(this.fp(notePath, 'debts'), JSON.stringify(legacy.debts));
      }
      if (legacy.credits && legacy.credits.length > 0) {
        await a.write(this.fp(notePath, 'credits'), JSON.stringify(legacy.credits));
      }
      if (legacy.deposits && legacy.deposits.length > 0) {
        await a.write(this.fp(notePath, 'deposits'), JSON.stringify(legacy.deposits));
      }

      await a.remove(legacyPath);
    } catch {
      // Migration failed, leave legacy file as-is
    }
  }

  private async cleanupOldFlatFiles(notePath: string): Promise<void> {
    const a = this.app.vault.adapter;
    const suffixes = ['.meta', '.records', '.debts', '.credits', '.deposits'];
    for (const suffix of suffixes) {
      const oldFile = this.oldFp(notePath, suffix);
      if (await a.exists(oldFile)) {
        try { await a.remove(oldFile); } catch { /* ignore */ }
      }
    }
    // Also remove single legacy file if exists
    const safe = notePath.replace(/[\\/:"*?<>|]/g, '_');
    const legacyPath = normalizePath(`${this.base}/${safe}.json`);
    if (await a.exists(legacyPath)) {
      try { await a.remove(legacyPath); } catch { /* ignore */ }
    }
  }

  // ── Load methods ──────────────────────────────────────────────────────────

  private async loadMeta(notePath: string): Promise<AccountMetaFile> {
    if (this.metaCache.has(notePath)) return this.metaCache.get(notePath)!;
    const fp = this.fp(notePath, 'meta');
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
    const fp = this.fp(notePath, 'records');
    console.log('[FT-storage] loadRecords:', fp);
    if (await this.app.vault.adapter.exists(fp)) {
      try {
        const data = JSON.parse(await this.app.vault.adapter.read(fp)) as AccountRecordsFile;
        console.log('[FT-storage] loadRecords loaded:', data.records.length, 'records');
        data.records.forEach(r => {
          r.time ??= '';
          r.isInternal ??= false;
          r.linkedId ??= '';
        });
        this.recordsCache.set(notePath, data);
        return data;
      } catch (e) { 
        console.error('[FT-storage] loadRecords parse error:', e);
      }
    }
    const empty = emptyRecords();
    this.recordsCache.set(notePath, empty);
    return empty;
  }

  private async loadDebts(notePath: string): Promise<DebtRecord[]> {
    if (this.debtsCache.has(notePath)) return this.debtsCache.get(notePath)!;
    const fp = this.fp(notePath, 'debts');
    if (await this.app.vault.adapter.exists(fp)) {
      try {
        const data = JSON.parse(await this.app.vault.adapter.read(fp)) as DebtRecord[];
        data.forEach(d => {
          if (!d.direction) d.direction = 'borrowed';
          d.dueDate ??= '';
          d.time ??= '';
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
    const fp = this.fp(notePath, 'credits');
    if (await this.app.vault.adapter.exists(fp)) {
      try {
        const data = JSON.parse(await this.app.vault.adapter.read(fp)) as CreditRecord[];
        data.forEach(c => {
          if (!c.status) c.status = 'active';
          if (!c.payments) c.payments = [];
          if (c.earlyRepaymentOption === undefined) c.earlyRepaymentOption = null;
        });
        this.creditsCache.set(notePath, data);
        return data;
      } catch (e) { 
        console.error('[FT-storage] loadCredits parse error:', e);
      }
    }
    const empty: CreditRecord[] = [];
    this.creditsCache.set(notePath, empty);
    return empty;
  }

  private async loadDeposits(notePath: string): Promise<DepositRecord[]> {
    if (this.depositsCache.has(notePath)) return this.depositsCache.get(notePath)!;
    const fp = this.fp(notePath, 'deposits');
    if (await this.app.vault.adapter.exists(fp)) {
      try {
        const data = JSON.parse(await this.app.vault.adapter.read(fp)) as DepositRecord[];
        data.forEach(d => {
          if (!d.termMonths) d.termMonths = 12;
          if (!d.accrualType) d.accrualType = 'to_account';
          if (!d.type) d.type = 'term';
          d.status ??= 'active';
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

  async updateDebtMovement(notePath: string, debtId: string, mov: DebtMovement): Promise<void> {
    const d   = await this.loadDebts(notePath);
    const idx = d.findIndex(x => x.id === debtId);
    if (idx === -1) return;
    const debt = d[idx];
    const mIdx = debt.movements.findIndex(m => m.id === mov.id);
    if (mIdx === -1) return;
    debt.movements[mIdx] = mov;
    debt.amount = debt.movements.reduce((sum, m) => m.type === 'borrow' ? sum + m.amount : sum - m.amount, 0);
    this.scheduleDebts(notePath);
  }

  async deleteDebtMovement(notePath: string, debtId: string, movementId: string): Promise<void> {
    const d   = await this.loadDebts(notePath);
    const idx = d.findIndex(x => x.id === debtId);
    if (idx === -1) return;
    const debt = d[idx];
    debt.movements = debt.movements.filter(m => m.id !== movementId);
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
    const futureAccruals = deposit.accruals
      .filter(a => a.dueDate > today && a.status === 'pending')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    if (!futureAccruals.length) return;

    if (deposit.accrualType === 'capitalization') {
      let currentAmount = deposit.amount;
      for (const accrual of futureAccruals) {
        const interest = currentAmount * (deposit.interestRate / 100 / 12);
        currentAmount += interest;
        accrual.amount = Math.round(interest * 100) / 100;
      }
    } else {
      const monthlyRate = deposit.amount * (deposit.interestRate / 100 / 12);
      for (const accrual of futureAccruals) {
        accrual.amount = Math.round(monthlyRate * 100) / 100;
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
