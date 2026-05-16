import { App, normalizePath } from 'obsidian';
import { AccountData, AccountMeta, DebtMovement, DebtRecord, FinanceRecord } from './types';

const DATA_VERSION = 3;

function emptyAccount(defaultCurrency: string): AccountData {
  return {
    version: DATA_VERSION, name: '', currency: defaultCurrency,
    records: [], debts: [], categories: [], tags: [], payers: [],
  };
}

function addToSet(arr: string[], value: string): void {
  const v = value.trim();
  if (v && !arr.includes(v)) arr.push(v);
}

export class FinanceStorage {
  private app:   App;
  private base:  string;
  private cache: Map<string, AccountData> = new Map();
  private dirty: Set<string>              = new Set();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private defaultCurrency: string;

  constructor(app: App, pluginId: string, defaultCurrency = '₽') {
    this.app             = app;
    this.defaultCurrency = defaultCurrency;
    this.base            = normalizePath(`.obsidian/plugins/${pluginId}/accounts`);
  }

  setDefaultCurrency(c: string) { this.defaultCurrency = c; }

  private fp(notePath: string): string {
    return normalizePath(`${this.base}/${notePath.replace(/[\\/:"*?<>|]/g, '_')}.json`);
  }

  private async ensureBase(): Promise<void> {
    const a = this.app.vault.adapter;
    if (!(await a.exists(this.base))) await a.mkdir(this.base);
  }

  async load(notePath: string): Promise<AccountData> {
    if (this.cache.has(notePath)) return this.cache.get(notePath)!;
    try {
      const fp = this.fp(notePath);
      if (await this.app.vault.adapter.exists(fp)) {
        const data = JSON.parse(await this.app.vault.adapter.read(fp)) as AccountData;
        // back-compat: add missing fields
        if (!data.currency) data.currency = this.defaultCurrency;
        if (data.name === undefined) data.name = '';
        if (!data.debts) data.debts = [];
        if (!data.accentColor) data.accentColor = '';
        // ensure all records have time field
        data.records.forEach(r => { if (r.time === undefined) r.time = ''; });
        // ensure all debts have direction, dueDate fields
        data.debts.forEach(d => {
          if (!d.direction) d.direction = 'borrowed';
          if (d.dueDate === undefined) d.dueDate = '';
          if (d.time === undefined) d.time = '';
        });
        this.cache.set(notePath, data);
        return data;
      }
    } catch { /* corrupt → start fresh */ }
    const empty = emptyAccount(this.defaultCurrency);
    this.cache.set(notePath, empty);
    return empty;
  }

  private schedule(notePath: string): void {
    this.dirty.add(notePath);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flushDirty(), 500);
  }

  private async flushDirty(): Promise<void> {
    await this.ensureBase();
    for (const np of this.dirty) {
      const d = this.cache.get(np);
      if (d) await this.app.vault.adapter.write(this.fp(np), JSON.stringify(d));
    }
    this.dirty.clear();
  }

  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    await this.flushDirty();
  }

  async updateMeta(notePath: string, meta: Partial<AccountMeta>): Promise<void> {
    const d = await this.load(notePath);
    if (meta.name     !== undefined) d.name     = meta.name;
    if (meta.currency !== undefined) d.currency = meta.currency;
    this.schedule(notePath);
  }

  async addRecord(notePath: string, rec: FinanceRecord): Promise<void> {
    const d = await this.load(notePath);
    d.records.push(rec);
    addToSet(d.categories, rec.category);
    addToSet(d.tags,       rec.tag);
    addToSet(d.payers,     rec.payer);
    this.schedule(notePath);
  }

  async updateRecord(notePath: string, rec: FinanceRecord): Promise<void> {
    const d   = await this.load(notePath);
    const idx = d.records.findIndex(r => r.id === rec.id);
    if (idx === -1) return;
    d.records[idx] = rec;
    addToSet(d.categories, rec.category);
    addToSet(d.tags,       rec.tag);
    addToSet(d.payers,     rec.payer);
    this.schedule(notePath);
  }

  async deleteRecord(notePath: string, id: string): Promise<void> {
    const d   = await this.load(notePath);
    d.records = d.records.filter(r => r.id !== id);
    this.schedule(notePath);
  }

  /** Bulk-import records (append). */
  async importRecords(notePath: string, recs: FinanceRecord[]): Promise<void> {
    const d = await this.load(notePath);
    for (const r of recs) {
      d.records.push(r);
      addToSet(d.categories, r.category);
      addToSet(d.tags,       r.tag);
      addToSet(d.payers,     r.payer);
    }
    this.schedule(notePath);
  }

  // ── Debt CRUD ──────────────────────────────────────────────────────────────

  async addDebt(notePath: string, debt: DebtRecord): Promise<void> {
    const d = await this.load(notePath);
    d.debts.push(debt);
    this.schedule(notePath);
  }

  async updateDebt(notePath: string, debt: DebtRecord): Promise<void> {
    const d   = await this.load(notePath);
    const idx = d.debts.findIndex(x => x.id === debt.id);
    if (idx === -1) return;
    d.debts[idx] = debt;
    this.schedule(notePath);
  }

  async deleteDebt(notePath: string, id: string): Promise<void> {
    const d     = await this.load(notePath);
    d.debts     = d.debts.filter(x => x.id !== id);
    this.schedule(notePath);
  }

  async addDebtMovement(notePath: string, debtId: string, mov: DebtMovement): Promise<void> {
    const d   = await this.load(notePath);
    const idx = d.debts.findIndex(x => x.id === debtId);
    if (idx === -1) return;
    const debt = d.debts[idx];
    debt.movements.push(mov);
    debt.amount = debt.movements.reduce((sum, m) => m.type === 'borrow' ? sum + m.amount : sum - m.amount, 0);
    this.schedule(notePath);
  }

  invalidate(notePath: string): void { this.cache.delete(notePath); }

  async resetAllData(notePath: string): Promise<void> {
    const d = await this.load(notePath);
    d.records = [];
    d.debts = [];
    d.categories = [];
    d.tags = [];
    d.payers = [];
    this.schedule(notePath);
  }
}
