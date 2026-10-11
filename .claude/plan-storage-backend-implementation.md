# План реализации заменяемого бекенда хранения данных

**Дата:** 2024  
**Цель:** Рефакторинг слоя хранения для поддержки заменяемых бекендов (JSON ↔ SQLite)  
**Принципы:**
- ✅ Все магические строки и числа → константы
- ✅ Всё через интерфейсы (репозитории), никаких прямых вызовов из вкладок
- ✅ Мягкие миграции при изменении схемы (JSON ↔ SQL синхронизация)
- ✅ Дефолт: JSON
- ✅ Автоматическая миграция с прогрессбаром при переключении бекенда
- ✅ Кроссплатформенность (sql.js для mobile/desktop)

---

## Анализ текущей архитектуры

### Слой хранения (JSON-based)

```
FinanceStorage (фасад)
 ├── FileStore<T> × 7 (meta, records, debts, credits, deposits, exchanges, state)
 │    ├── cache: Map<accountId, T>
 │    ├── dirty: Set<accountId>
 │    └── parse: (raw: unknown) => T
 ├── VaultAdapter (app.vault wrapper)
 ├── AccountFiles (path calculation)
 └── FlushScheduler (debounced 500ms)
```

### Типы данных (7 файлов на аккаунт)

1. **meta.json** → `AccountMetaFile` (name, currency, accentColor, sourcePath)
2. **records.json** → `AccountRecordsFile` (records[], categories[], tags[], payers[])
3. **debts.json** → `DebtRecord[]` (с movements[])
4. **credits.json** → `CreditRecord[]` (с payments[])
5. **deposits.json** → `DepositRecord[]` (с accruals[], topUps[], withdrawals[])
6. **exchanges.json** → `CurrencyExchange[]`
7. **state.json** → `ViewState` (UI state persistence)

### Константы (уже определены)

- `src/constants.ts` — domain state enums (RecordType, DebtDirection, CreditStatus и т.д.)
- `src/types.ts` — magic numbers (MOBILE_BREAKPOINT, SEARCH_DEBOUNCE_MS, PAGE_SIZE_OPTIONS и т.д.)
- `DATA_VERSION = 1` в `FinanceStorage.ts`

### Валидация и миграция

- `src/domain/validate.ts` — парсеры с fallback (`??=` для новых полей)
- Валидаторы используют `Object.values(RecordType)` и т.д. — автоматически расширяются

---

## Целевая архитектура

```
FinanceStorage (фасад, API не меняется)
 ├── IAccountRepository (интерфейс)
 │    ├── JsonAccountRepository
 │    │    ├── JsonStorageBackend (VaultAdapter обёрнутый)
 │    │    ├── FileStore<T> × 7
 │    │    └── FlushScheduler
 │    └── SqliteAccountRepository
 │         ├── SqliteStorageBackend (sql.js)
 │         ├── Cache (опциональный)
 │         └── Transactions
 └── BackendFactory (создаёт repository по типу)
```

### Добавление констант для SQLite

```typescript
// src/types.ts — новые константы

/** Storage backend types */
export const StorageBackendType = {
  JSON: 'json',
  SQLITE: 'sqlite',
} as const;
export type StorageBackendType = ValueOf<typeof StorageBackendType>;

/** SQLite database configuration */
export const SQLITE_DB_FILENAME = 'finance.db';
export const SQLITE_SCHEMA_VERSION = 1;
export const SQLITE_BATCH_SIZE = 100;
export const SQLITE_CACHE_ENABLED_DEFAULT = true;

/** Migration progress */
export const MIGRATION_PROGRESS_UPDATE_INTERVAL = 100; // ms
export const MIGRATION_BATCH_SIZE = 10; // accounts per batch
```

### Обновление PluginSettings

```typescript
// src/types.ts
export interface PluginSettings {
  defaultCurrency: string;
  defaultPageSize: number;
  customCurrencies: string[];
  storageBackend: StorageBackendType; // НОВОЕ
}

export const DEFAULT_SETTINGS: PluginSettings = {
  defaultCurrency: '₽',
  defaultPageSize: 25,
  customCurrencies: ['₽'],
  storageBackend: StorageBackendType.JSON, // НОВОЕ
};
```

---

## Этапы реализации

### Этап 1: Создание интерфейсов и констант

**Файлы:**
- `src/storage/interfaces/IStorageBackend.ts` (новый)
- `src/storage/interfaces/IAccountRepository.ts` (новый)
- `src/storage/interfaces/types.ts` (новый, re-export для чистоты импортов)
- `src/types.ts` (обновить: добавить StorageBackendType и константы)
- `src/constants.ts` (обновить: добавить SQL table/column name константы)

**Задачи:**

1. **Константы для SQL схемы** (`src/constants.ts`):
```typescript
/** SQL table names — single source of truth */
export const SQL_TABLE = {
  ACCOUNTS: 'accounts',
  RECORDS: 'records',
  DEBTS: 'debts',
  DEBT_MOVEMENTS: 'debt_movements',
  CREDITS: 'credits',
  CREDIT_PAYMENTS: 'credit_payments',
  DEPOSITS: 'deposits',
  DEPOSIT_ACCRUALS: 'deposit_accruals',
  DEPOSIT_TOPUPS: 'deposit_topups',
  DEPOSIT_WITHDRAWALS: 'deposit_withdrawals',
  CURRENCY_EXCHANGES: 'currency_exchanges',
  RECORD_CATEGORIES: 'record_categories',
  RECORD_TAGS: 'record_tags',
  RECORD_PAYERS: 'record_payers',
  VIEW_STATES: 'view_states',
} as const;

/** SQL column names — mapped from interface field names */
export const SQL_COLUMN = {
  // Universal
  ID: 'id',
  ACCOUNT_ID: 'account_id',
  CREATED_AT: 'created_at',
  DATE: 'date',
  TIME: 'time',
  AMOUNT: 'amount',
  NOTE: 'note',
  STATUS: 'status',
  
  // Records
  TYPE: 'type',
  CATEGORY: 'category',
  TAG: 'tag',
  PAYER: 'payer',
  ATTACHMENT_PATH: 'attachment_path',
  LINKED_ID: 'linked_id',
  LINKED_MOVEMENT_ID: 'linked_movement_id',
  IS_INTERNAL: 'is_internal',
  EXCHANGE_RATE: 'exchange_rate',
  
  // Debts
  PERSON: 'person',
  DIRECTION: 'direction',
  DUE_DATE: 'due_date',
  INTEREST_RATE: 'interest_rate',
  ORIGINAL_AMOUNT: 'original_amount',
  INTEREST_AMOUNT: 'interest_amount',
  MOVEMENT_TYPE: 'movement_type',
  DEBT_ID: 'debt_id',
  
  // Credits
  NAME: 'name',
  BANK_NAME: 'bank_name',
  CURRENT_AMOUNT: 'current_amount',
  MONTHLY_PAYMENT: 'monthly_payment',
  TERM_MONTHS: 'term_months',
  START_DATE: 'start_date',
  PAYMENT_DAY: 'payment_day',
  EARLY_REPAYMENT_OPTION: 'early_repayment_option',
  PURCHASE_PRICE: 'purchase_price',
  DOWN_PAYMENT: 'down_payment',
  DOWN_PAYMENT_TYPE: 'down_payment_type',
  DOWN_PAYMENT_VALUE: 'down_payment_value',
  DOWN_PAYMENT_DATE: 'down_payment_date',
  DOWN_PAYMENT_RECORD_ID: 'down_payment_record_id',
  IS_ESCROW: 'is_escrow',
  DAY_COUNT_CONVENTION: 'day_count_convention',
  CREDIT_ID: 'credit_id',
  PRINCIPAL_PART: 'principal_part',
  INTEREST_PART: 'interest_part',
  REMAINING_DEBT: 'remaining_debt',
  PAID_DATE: 'paid_date',
  
  // Deposits
  ACCRUAL_TYPE: 'accrual_type',
  DEPOSIT_ID: 'deposit_id',
  
  // Currency
  TARGET_CURRENCY: 'target_currency',
  TARGET_AMOUNT: 'target_amount',
  AMOUNT_IN_ACCOUNT_CURRENCY: 'amount_in_account_currency',
  PROVIDER: 'provider',
  FEE: 'fee',
  
  // Meta
  CURRENCY: 'currency',
  ACCENT_COLOR: 'accent_color',
  SOURCE_PATH: 'source_path',
  VERSION: 'version',
  
  // State
  STATE: 'state',
} as const;
```

2. **IStorageBackend** (`src/storage/interfaces/IStorageBackend.ts`):
```typescript
import { StorageBackendType } from '../../types';

/**
 * Low-level storage operations.
 * JSON backend uses Obsidian vault API, SQLite uses sql.js.
 */
export interface IStorageBackend {
  /** Backend type identifier */
  getType(): StorageBackendType;
  
  /** Initialize backend (create DB, load WASM, etc.) */
  initialize(): Promise<void>;
  
  /** Close backend (flush, close DB connection) */
  close(): Promise<void>;
  
  /** Check if resource exists */
  exists(path: string): Promise<boolean>;
  
  /** Read raw content (file or query result as JSON string) */
  read(path: string): Promise<string | null>;
  
  /** Write raw content */
  write(path: string, content: string): Promise<void>;
  
  /** Delete resource */
  delete(path: string): Promise<void>;
  
  /** Ensure directory exists (for JSON) or no-op (for SQLite) */
  ensureDir(path: string): Promise<void>;
  
  /** Remove directory recursively */
  removeDir(path: string): Promise<void>;
  
  /** List subdirectories */
  listDirs(path: string): Promise<string[]>;
}
```

3. **IAccountRepository** (`src/storage/interfaces/IAccountRepository.ts`):
```typescript
import type {
  AccountData,
  AccountMeta,
  FinanceRecord,
  DebtRecord,
  CreditRecord,
  DepositRecord,
  CurrencyExchange,
  DebtMovement,
} from '../../types';
import type { AccountMetaFile, AccountRecordsFile } from '../FinanceStorage';

/**
 * High-level repository interface for account data operations.
 * Both JsonAccountRepository and SqliteAccountRepository implement this.
 * 
 * API matches current FinanceStorage methods → zero changes in tabs/commands.
 */
export interface IAccountRepository {
  // ── Lifecycle ───────────────────────────────────────────────────────────
  
  /** Flush all pending writes immediately */
  flush(): Promise<void>;
  
  /** Clear cache for account (e.g., after note rename) */
  invalidate(accountId: string): void;
  
  /** Set default currency for new accounts */
  setDefaultCurrency(currency: string): void;
  
  // ── Composite load ──────────────────────────────────────────────────────
  
  /** Load all account data (parallel load of 7 entities) */
  load(accountId: string): Promise<AccountData>;
  
  // ── Meta ────────────────────────────────────────────────────────────────
  
  updateMeta(accountId: string, meta: Partial<AccountMeta>): Promise<void>;
  touchSourcePath(accountId: string, sourcePath: string): Promise<void>;
  
  // ── Records CRUD ────────────────────────────────────────────────────────
  
  addRecord(accountId: string, record: FinanceRecord): Promise<void>;
  updateRecord(accountId: string, record: FinanceRecord): Promise<void>;
  deleteRecord(accountId: string, id: string): Promise<void>;
  deleteRecordsBatch(accountId: string, ids: string[]): Promise<void>;
  importRecords(accountId: string, records: FinanceRecord[]): Promise<void>;
  saveAllRecords(accountId: string, records: FinanceRecord[]): Promise<void>;
  
  // ── Debts CRUD ──────────────────────────────────────────────────────────
  
  addDebt(accountId: string, debt: DebtRecord): Promise<void>;
  updateDebt(accountId: string, debt: DebtRecord): Promise<void>;
  deleteDebt(accountId: string, id: string): Promise<void>;
  deleteDebtsBatch(accountId: string, ids: string[]): Promise<void>;
  addDebtMovement(accountId: string, debtId: string, movement: DebtMovement): Promise<void>;
  updateDebtMovement(accountId: string, debtId: string, movement: DebtMovement): Promise<void>;
  deleteDebtMovement(accountId: string, debtId: string, movementId: string): Promise<void>;
  
  // ── Credits CRUD ────────────────────────────────────────────────────────
  
  addCredit(accountId: string, credit: CreditRecord): Promise<void>;
  updateCredit(accountId: string, credit: CreditRecord): Promise<void>;
  deleteCredit(accountId: string, id: string): Promise<void>;
  deleteCreditsBatch(accountId: string, ids: string[]): Promise<void>;
  saveAllCredits(accountId: string, credits: CreditRecord[]): Promise<void>;
  
  // ── Deposits CRUD ───────────────────────────────────────────────────────
  
  addDeposit(accountId: string, deposit: DepositRecord): Promise<void>;
  updateDeposit(accountId: string, deposit: DepositRecord): Promise<void>;
  deleteDeposit(accountId: string, id: string): Promise<void>;
  deleteDepositsBatch(accountId: string, ids: string[]): Promise<void>;
  saveAllDeposits(accountId: string, deposits: DepositRecord[]): Promise<void>;
  addDepositTopUp(accountId: string, depositId: string, topUp: DepositTopUp): Promise<void>;
  deleteDepositTopUp(accountId: string, depositId: string, topUpId: string): Promise<void>;
  addDepositWithdrawal(accountId: string, depositId: string, withdrawal: DepositWithdrawal): Promise<void>;
  deleteDepositWithdrawal(accountId: string, depositId: string, withdrawalId: string): Promise<void>;
  
  // ── Exchanges CRUD ──────────────────────────────────────────────────────
  
  addExchange(accountId: string, exchange: CurrencyExchange): Promise<void>;
  updateExchange(accountId: string, exchange: CurrencyExchange): Promise<void>;
  deleteExchange(accountId: string, id: string): Promise<void>;
  deleteExchangesBatch(accountId: string, ids: string[]): Promise<void>;
  saveAllExchanges(accountId: string, exchanges: CurrencyExchange[]): Promise<void>;
  
  // ── ViewState ───────────────────────────────────────────────────────────
  
  saveViewState(accountId: string, state: Record<string, unknown> | null): Promise<void>;
  loadViewState(accountId: string): Promise<Record<string, unknown> | null>;
  
  // ── Account management ──────────────────────────────────────────────────
  
  deleteAccount(accountId: string): Promise<void>;
  findOrphanedAccounts(activeAccountIds: string[]): Promise<string[]>;
  
  // ── Linked records (for AccountCommands atomic operations) ──────────────
  
  deleteDebtsWithLinkedRecords(accountId: string, debtIds: string[]): Promise<void>;
  deleteCreditsWithLinkedRecords(accountId: string, creditIds: string[]): Promise<void>;
  deleteDepositsWithLinkedRecords(accountId: string, depositIds: string[]): Promise<void>;
}
```

**Время:** 4-6 часов  
**Риски:** минимальные (только типы и константы)

---

### Этап 2: Рефакторинг JSON backend

**Файлы:**
- `src/storage/backends/JsonStorageBackend.ts` (новый, было VaultAdapter)
- `src/storage/repositories/JsonAccountRepository.ts` (новый, из FinanceStorage)
- `src/storage/FinanceStorage.ts` (упростить до делегирующего фасада)
- Обновить импорты в `FileStore`, `AccountFiles`

**Задачи:**

1. **JsonStorageBackend** — переименовать VaultAdapter:
```typescript
// src/storage/backends/JsonStorageBackend.ts
import { App } from 'obsidian';
import { IStorageBackend } from '../interfaces/IStorageBackend';
import { StorageBackendType } from '../../types';

export class JsonStorageBackend implements IStorageBackend {
  constructor(private app: App) {}
  
  getType(): StorageBackendType {
    return StorageBackendType.JSON;
  }
  
  async initialize(): Promise<void> {
    // No-op for JSON (vault already initialized)
  }
  
  async close(): Promise<void> {
    // No-op for JSON
  }
  
  async exists(path: string): Promise<boolean> {
    return this.app.vault.adapter.exists(path);
  }
  
  async read(path: string): Promise<string | null> {
    if (!(await this.exists(path))) return null;
    try {
      return await this.app.vault.adapter.read(path);
    } catch (e) {
      console.error(`[JsonBackend] Read error: ${path}`, e);
      return null;
    }
  }
  
  async write(path: string, content: string): Promise<void> {
    await this.atomicWrite(path, content);
  }
  
  async delete(path: string): Promise<void> {
    if (await this.exists(path)) {
      await this.app.vault.adapter.remove(path);
    }
  }
  
  async ensureDir(path: string): Promise<void> {
    if (!(await this.exists(path))) {
      await this.app.vault.adapter.mkdir(path);
    }
  }
  
  async removeDir(path: string): Promise<void> {
    if (await this.exists(path)) {
      await this.app.vault.adapter.rmdir(path, true);
    }
  }
  
  async listDirs(path: string): Promise<string[]> {
    if (!(await this.exists(path))) return [];
    return (await this.app.vault.adapter.list(path)).folders;
  }
  
  // ── Internal ──────────────────────────────────────────────────────────
  
  private async atomicWrite(path: string, content: string): Promise<void> {
    const a = this.app.vault.adapter;
    const tmp = `${path}.tmp`;
    await a.write(tmp, content);
    try {
      await a.remove(path);
    } catch { /* первая запись */ }
    await a.rename(tmp, path);
  }
}
```

2. **JsonAccountRepository** — извлечь из FinanceStorage:
```typescript
// src/storage/repositories/JsonAccountRepository.ts
import { IAccountRepository } from '../interfaces/IAccountRepository';
import { IStorageBackend } from '../interfaces/IStorageBackend';
import { FileStore, FlushScheduler } from '../AccountRepo';
import { AccountFiles } from '../AccountFiles';
import { /* все типы */ } from '../../types';
import { DATA_VERSION } from '../FinanceStorage';

export class JsonAccountRepository implements IAccountRepository {
  private backend: IStorageBackend;
  private files: AccountFiles;
  private scheduler: FlushScheduler;
  private defaultCurrency: string;
  
  private meta: FileStore<AccountMetaFile>;
  private records: FileStore<AccountRecordsFile>;
  private debts: FileStore<DebtRecord[]>;
  private credits: FileStore<CreditRecord[]>;
  private deposits: FileStore<DepositRecord[]>;
  private exchanges: FileStore<CurrencyExchange[]>;
  private state: FileStore<Record<string, unknown> | null>;
  private allStores: FileStore<unknown>[];
  
  constructor(backend: IStorageBackend, files: AccountFiles, defaultCurrency: string) {
    this.backend = backend;
    this.files = files;
    this.defaultCurrency = defaultCurrency;
    this.scheduler = new FlushScheduler(() => this.flushAll());
    
    const dirty = () => { this.scheduler.schedule(); };
    
    // FileStore теперь принимает backend вместо vault
    this.meta = new FileStore('meta', raw => this.parseMeta(raw), dirty);
    this.records = new FileStore('records', raw => this.parseRecordsFile(raw), dirty);
    this.debts = new FileStore('debts', parseDebts, dirty);
    this.credits = new FileStore('credits', parseCredits, dirty);
    this.deposits = new FileStore('deposits', parseDeposits, dirty);
    this.exchanges = new FileStore('exchanges', parseExchanges, dirty);
    this.state = new FileStore('state', raw => (isObject(raw) ? raw : null), dirty);
    
    this.allStores = [
      this.meta, this.records, this.debts, this.credits,
      this.deposits, this.exchanges, this.state
    ] as FileStore<unknown>[];
  }
  
  // ── Все методы IAccountRepository ──────────────────────────────────────
  // Скопировать из текущего FinanceStorage (логика НЕ меняется!)
  
  async load(accountId: string): Promise<AccountData> {
    // Текущая логика из FinanceStorage.load()
  }
  
  async addRecord(accountId: string, rec: FinanceRecord): Promise<void> {
    // Текущая логика из FinanceStorage.addRecord()
  }
  
  // ... и т.д.
  
  private async flushAll(): Promise<void> {
    await this.backend.ensureDir(this.files.base);
    for (const store of this.allStores) {
      await store.flush(this.backend, this.files);
    }
  }
}
```

3. **FinanceStorage упростить** — делегирующий фасад:
```typescript
// src/storage/FinanceStorage.ts (УПРОЩЁННЫЙ)
import { App } from 'obsidian';
import { IAccountRepository } from './interfaces/IAccountRepository';
import { JsonStorageBackend } from './backends/JsonStorageBackend';
import { JsonAccountRepository } from './repositories/JsonAccountRepository';
import { AccountFiles } from './AccountFiles';
import { StorageBackendType } from '../types';

export const DATA_VERSION = 1;
export { type AccountMetaFile, type AccountRecordsFile } from './repositories/JsonAccountRepository';
export { isObject, addToSet, rebuildLookups } from './repositories/JsonAccountRepository';

export class FinanceStorage {
  private repository: IAccountRepository;
  
  constructor(
    app: App,
    pluginId: string,
    defaultCurrency: string,
    backendType: StorageBackendType = StorageBackendType.JSON
  ) {
    // Пока только JSON (SQLite добавим на этапе 5)
    const backend = new JsonStorageBackend(app);
    const files = new AccountFiles(pluginId);
    this.repository = new JsonAccountRepository(backend, files, defaultCurrency);
  }
  
  // ── Все методы делегируют в repository (API НЕ МЕНЯЕТСЯ!) ─────────────
  
  setDefaultCurrency(c: string): void {
    this.repository.setDefaultCurrency(c);
  }
  
  async load(accountId: string): Promise<AccountData> {
    return this.repository.load(accountId);
  }
  
  async flush(): Promise<void> {
    return this.repository.flush();
  }
  
  async updateMeta(accountId: string, meta: Partial<AccountMeta>): Promise<void> {
    return this.repository.updateMeta(accountId, meta);
  }
  
  async touchSourcePath(accountId: string, sourcePath: string): Promise<void> {
    return this.repository.touchSourcePath(accountId, sourcePath);
  }
  
  async addRecord(accountId: string, rec: FinanceRecord): Promise<void> {
    return this.repository.addRecord(accountId, rec);
  }
  
  async updateRecord(accountId: string, rec: FinanceRecord): Promise<void> {
    return this.repository.updateRecord(accountId, rec);
  }
  
  async deleteRecord(accountId: string, id: string): Promise<void> {
    return this.repository.deleteRecord(accountId, id);
  }
  
  async deleteRecordsBatch(accountId: string, ids: string[]): Promise<void> {
    return this.repository.deleteRecordsBatch(accountId, ids);
  }
  
  async importRecords(accountId: string, recs: FinanceRecord[]): Promise<void> {
    return this.repository.importRecords(accountId, recs);
  }
  
  async saveAllRecords(accountId: string, records: FinanceRecord[]): Promise<void> {
    return this.repository.saveAllRecords(accountId, records);
  }
  
  // ... остальные методы (debts, credits, deposits, exchanges, state)
  // ВСЕ делегируют в repository
  
  async deleteDebtsWithLinkedRecords(accountId: string, debtIds: string[]): Promise<void> {
    return this.repository.deleteDebtsWithLinkedRecords(accountId, debtIds);
  }
  
  async deleteCreditsWithLinkedRecords(accountId: string, creditIds: string[]): Promise<void> {
    return this.repository.deleteCreditsWithLinkedRecords(accountId, creditIds);
  }
  
  async deleteDepositsWithLinkedRecords(accountId: string, depositIds: string[]): Promise<void> {
    return this.repository.deleteDepositsWithLinkedRecords(accountId, depositIds);
  }
  
  invalidate(accountId: string): void {
    this.repository.invalidate(accountId);
  }
  
  async deleteAccount(accountId: string): Promise<void> {
    return this.repository.deleteAccount(accountId);
  }
  
  async findOrphanedAccounts(activeAccountIds: string[]): Promise<string[]> {
    return this.repository.findOrphanedAccounts(activeAccountIds);
  }
}
```

4. **FileStore** — обновить для работы через IStorageBackend:
```typescript
// src/storage/AccountRepo.ts (обновить метод flush)
async flush(backend: IStorageBackend, files: AccountFiles): Promise<void> {
  for (const accountId of this.dirty) {
    const value = this.cache.get(accountId);
    if (value === undefined) continue;
    await backend.ensureDir(files.folder(accountId));
    const path = files.file(accountId, this.kind);
    await backend.write(path, JSON.stringify(value));
  }
  this.dirty.clear();
}

async load(backend: IStorageBackend, files: AccountFiles, accountId: string): Promise<T> {
  const cached = this.cache.get(accountId);
  if (cached !== undefined) return cached;
  
  const path = files.file(accountId, this.kind);
  const raw = await backend.read(path);
  const parsed = raw ? JSON.parse(raw) : null;
  const value = this.parse(parsed);
  this.cache.set(accountId, value);
  return value;
}
```

**Время:** 8-12 часов  
**Риски:** средние (большой рефакторинг, но поведение не меняется)  
**Тестирование:** ВСЕ существующие тесты должны пройти без изменений

---

### Этап 3: SQLite backend — схема и инфраструктура

**Файлы:**
- `package.json` (добавить `sql.js` в dependencies)
- `src/storage/backends/sqlite/schema.ts` (новый, SQL DDL)
- `src/storage/backends/sqlite/migrations.ts` (новый, версионирование)
- `src/storage/backends/SqliteStorageBackend.ts` (новый)

**Задачи:**

1. **Добавить sql.js**:
```bash
npm install sql.js@1.10.3 --save
npm install @types/sql.js --save-dev
```

2. **Схема БД** (`src/storage/backends/sqlite/schema.ts`):
```typescript
import { SQL_TABLE, SQL_COLUMN, SQLITE_SCHEMA_VERSION } from '../../../constants';

/** SQLite schema — single source of truth */
export const SQLITE_SCHEMA_DDL = `
-- Version marker
PRAGMA user_version = ${SQLITE_SCHEMA_VERSION};

-- Accounts (meta)
CREATE TABLE ${SQL_TABLE.ACCOUNTS} (
  ${SQL_COLUMN.ID} TEXT PRIMARY KEY,
  ${SQL_COLUMN.NAME} TEXT NOT NULL DEFAULT '',
  ${SQL_COLUMN.CURRENCY} TEXT NOT NULL,
  ${SQL_COLUMN.ACCENT_COLOR} TEXT,
  ${SQL_COLUMN.SOURCE_PATH} TEXT,
  ${SQL_COLUMN.VERSION} INTEGER NOT NULL DEFAULT 1
);

-- Records
CREATE TABLE ${SQL_TABLE.RECORDS} (
  ${SQL_COLUMN.ID} TEXT PRIMARY KEY,
  ${SQL_COLUMN.ACCOUNT_ID} TEXT NOT NULL,
  ${SQL_COLUMN.CREATED_AT} INTEGER NOT NULL,
  ${SQL_COLUMN.DATE} TEXT NOT NULL,
  ${SQL_COLUMN.TIME} TEXT NOT NULL DEFAULT '',
  ${SQL_COLUMN.TYPE} TEXT NOT NULL,
  ${SQL_COLUMN.AMOUNT} REAL NOT NULL,
  ${SQL_COLUMN.CATEGORY} TEXT NOT NULL,
  ${SQL_COLUMN.TAG} TEXT NOT NULL DEFAULT '',
  ${SQL_COLUMN.PAYER} TEXT NOT NULL DEFAULT '',
  ${SQL_COLUMN.NOTE} TEXT NOT NULL DEFAULT '',
  ${SQL_COLUMN.ATTACHMENT_PATH} TEXT NOT NULL DEFAULT '',
  ${SQL_COLUMN.LINKED_ID} TEXT,
  ${SQL_COLUMN.LINKED_MOVEMENT_ID} TEXT,
  ${SQL_COLUMN.IS_INTERNAL} INTEGER NOT NULL DEFAULT 0,
  ${SQL_COLUMN.EXCHANGE_RATE} REAL,
  FOREIGN KEY (${SQL_COLUMN.ACCOUNT_ID}) REFERENCES ${SQL_TABLE.ACCOUNTS}(${SQL_COLUMN.ID}) ON DELETE CASCADE
);
CREATE INDEX idx_records_account ON ${SQL_TABLE.RECORDS}(${SQL_COLUMN.ACCOUNT_ID});
CREATE INDEX idx_records_date ON ${SQL_TABLE.RECORDS}(${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.DATE});
CREATE INDEX idx_records_linked ON ${SQL_TABLE.RECORDS}(${SQL_COLUMN.LINKED_ID});
CREATE INDEX idx_records_type ON ${SQL_TABLE.RECORDS}(${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.TYPE});
CREATE INDEX idx_records_category ON ${SQL_TABLE.RECORDS}(${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.CATEGORY});

-- Debts
CREATE TABLE ${SQL_TABLE.DEBTS} (
  ${SQL_COLUMN.ID} TEXT PRIMARY KEY,
  ${SQL_COLUMN.ACCOUNT_ID} TEXT NOT NULL,
  ${SQL_COLUMN.PERSON} TEXT NOT NULL,
  ${SQL_COLUMN.AMOUNT} REAL NOT NULL,
  ${SQL_COLUMN.ORIGINAL_AMOUNT} REAL NOT NULL,
  ${SQL_COLUMN.INTEREST_RATE} REAL NOT NULL DEFAULT 0,
  ${SQL_COLUMN.DIRECTION} TEXT NOT NULL,
  ${SQL_COLUMN.DATE} TEXT NOT NULL,
  ${SQL_COLUMN.TIME} TEXT NOT NULL DEFAULT '',
  ${SQL_COLUMN.DUE_DATE} TEXT NOT NULL DEFAULT '',
  ${SQL_COLUMN.CREATED_AT} INTEGER NOT NULL,
  ${SQL_COLUMN.NOTE} TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (${SQL_COLUMN.ACCOUNT_ID}) REFERENCES ${SQL_TABLE.ACCOUNTS}(${SQL_COLUMN.ID}) ON DELETE CASCADE
);
CREATE INDEX idx_debts_account ON ${SQL_TABLE.DEBTS}(${SQL_COLUMN.ACCOUNT_ID});

-- Debt movements
CREATE TABLE ${SQL_TABLE.DEBT_MOVEMENTS} (
  ${SQL_COLUMN.ID} TEXT PRIMARY KEY,
  ${SQL_COLUMN.DEBT_ID} TEXT NOT NULL,
  ${SQL_COLUMN.MOVEMENT_TYPE} TEXT NOT NULL,
  ${SQL_COLUMN.AMOUNT} REAL NOT NULL,
  ${SQL_COLUMN.INTEREST_AMOUNT} REAL,
  ${SQL_COLUMN.DATE} TEXT NOT NULL,
  ${SQL_COLUMN.TIME} TEXT NOT NULL DEFAULT '',
  ${SQL_COLUMN.CREATED_AT} INTEGER NOT NULL,
  ${SQL_COLUMN.NOTE} TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (${SQL_COLUMN.DEBT_ID}) REFERENCES ${SQL_TABLE.DEBTS}(${SQL_COLUMN.ID}) ON DELETE CASCADE
);
CREATE INDEX idx_debt_movements_debt ON ${SQL_TABLE.DEBT_MOVEMENTS}(${SQL_COLUMN.DEBT_ID});

-- Credits
CREATE TABLE ${SQL_TABLE.CREDITS} (
  ${SQL_COLUMN.ID} TEXT PRIMARY KEY,
  ${SQL_COLUMN.ACCOUNT_ID} TEXT NOT NULL,
  ${SQL_COLUMN.NAME} TEXT NOT NULL,
  ${SQL_COLUMN.TYPE} TEXT NOT NULL,
  ${SQL_COLUMN.BANK_NAME} TEXT NOT NULL,
  ${SQL_COLUMN.ORIGINAL_AMOUNT} REAL NOT NULL,
  ${SQL_COLUMN.CURRENT_AMOUNT} REAL NOT NULL,
  ${SQL_COLUMN.INTEREST_RATE} REAL NOT NULL,
  ${SQL_COLUMN.MONTHLY_PAYMENT} REAL NOT NULL,
  ${SQL_COLUMN.TERM_MONTHS} INTEGER NOT NULL,
  ${SQL_COLUMN.START_DATE} TEXT NOT NULL,
  ${SQL_COLUMN.PAYMENT_DAY} INTEGER,
  ${SQL_COLUMN.CREATED_AT} INTEGER NOT NULL,
  ${SQL_COLUMN.NOTE} TEXT NOT NULL DEFAULT '',
  ${SQL_COLUMN.STATUS} TEXT NOT NULL,
  ${SQL_COLUMN.EARLY_REPAYMENT_OPTION} TEXT,
  ${SQL_COLUMN.PURCHASE_PRICE} REAL,
  ${SQL_COLUMN.DOWN_PAYMENT} REAL,
  ${SQL_COLUMN.DOWN_PAYMENT_TYPE} TEXT,
  ${SQL_COLUMN.DOWN_PAYMENT_VALUE} REAL,
  ${SQL_COLUMN.DOWN_PAYMENT_DATE} TEXT,
  ${SQL_COLUMN.DOWN_PAYMENT_RECORD_ID} TEXT,
  ${SQL_COLUMN.IS_ESCROW} INTEGER NOT NULL DEFAULT 0,
  ${SQL_COLUMN.ATTACHMENT_PATH} TEXT,
  ${SQL_COLUMN.DAY_COUNT_CONVENTION} TEXT,
  FOREIGN KEY (${SQL_COLUMN.ACCOUNT_ID}) REFERENCES ${SQL_TABLE.ACCOUNTS}(${SQL_COLUMN.ID}) ON DELETE CASCADE
);
CREATE INDEX idx_credits_account ON ${SQL_TABLE.CREDITS}(${SQL_COLUMN.ACCOUNT_ID});

-- Credit payments
CREATE TABLE ${SQL_TABLE.CREDIT_PAYMENTS} (
  ${SQL_COLUMN.ID} TEXT PRIMARY KEY,
  ${SQL_COLUMN.CREDIT_ID} TEXT NOT NULL,
  ${SQL_COLUMN.AMOUNT} REAL NOT NULL,
  ${SQL_COLUMN.DUE_DATE} TEXT NOT NULL,
  ${SQL_COLUMN.STATUS} TEXT NOT NULL,
  ${SQL_COLUMN.PAID_DATE} TEXT,
  ${SQL_COLUMN.NOTE} TEXT,
  ${SQL_COLUMN.PRINCIPAL_PART} REAL,
  ${SQL_COLUMN.INTEREST_PART} REAL,
  ${SQL_COLUMN.REMAINING_DEBT} REAL,
  FOREIGN KEY (${SQL_COLUMN.CREDIT_ID}) REFERENCES ${SQL_TABLE.CREDITS}(${SQL_COLUMN.ID}) ON DELETE CASCADE
);
CREATE INDEX idx_credit_payments_credit ON ${SQL_TABLE.CREDIT_PAYMENTS}(${SQL_COLUMN.CREDIT_ID});

-- Deposits
CREATE TABLE ${SQL_TABLE.DEPOSITS} (
  ${SQL_COLUMN.ID} TEXT PRIMARY KEY,
  ${SQL_COLUMN.ACCOUNT_ID} TEXT NOT NULL,
  ${SQL_COLUMN.NAME} TEXT NOT NULL,
  ${SQL_COLUMN.TYPE} TEXT NOT NULL,
  ${SQL_COLUMN.BANK_NAME} TEXT NOT NULL,
  ${SQL_COLUMN.AMOUNT} REAL NOT NULL,
  ${SQL_COLUMN.INTEREST_RATE} REAL NOT NULL,
  ${SQL_COLUMN.START_DATE} TEXT NOT NULL,
  ${SQL_COLUMN.TERM_MONTHS} INTEGER NOT NULL,
  ${SQL_COLUMN.ACCRUAL_TYPE} TEXT NOT NULL,
  ${SQL_COLUMN.CREATED_AT} INTEGER NOT NULL,
  ${SQL_COLUMN.NOTE} TEXT NOT NULL DEFAULT '',
  ${SQL_COLUMN.STATUS} TEXT NOT NULL,
  ${SQL_COLUMN.ATTACHMENT_PATH} TEXT,
  FOREIGN KEY (${SQL_COLUMN.ACCOUNT_ID}) REFERENCES ${SQL_TABLE.ACCOUNTS}(${SQL_COLUMN.ID}) ON DELETE CASCADE
);
CREATE INDEX idx_deposits_account ON ${SQL_TABLE.DEPOSITS}(${SQL_COLUMN.ACCOUNT_ID});

-- Deposit accruals
CREATE TABLE ${SQL_TABLE.DEPOSIT_ACCRUALS} (
  ${SQL_COLUMN.ID} TEXT PRIMARY KEY,
  ${SQL_COLUMN.DEPOSIT_ID} TEXT NOT NULL,
  ${SQL_COLUMN.AMOUNT} REAL NOT NULL,
  ${SQL_COLUMN.DUE_DATE} TEXT NOT NULL,
  ${SQL_COLUMN.STATUS} TEXT NOT NULL,
  ${SQL_COLUMN.PAID_DATE} TEXT,
  ${SQL_COLUMN.NOTE} TEXT,
  FOREIGN KEY (${SQL_COLUMN.DEPOSIT_ID}) REFERENCES ${SQL_TABLE.DEPOSITS}(${SQL_COLUMN.ID}) ON DELETE CASCADE
);
CREATE INDEX idx_deposit_accruals_deposit ON ${SQL_TABLE.DEPOSIT_ACCRUALS}(${SQL_COLUMN.DEPOSIT_ID});

-- Deposit top-ups
CREATE TABLE ${SQL_TABLE.DEPOSIT_TOPUPS} (
  ${SQL_COLUMN.ID} TEXT PRIMARY KEY,
  ${SQL_COLUMN.DEPOSIT_ID} TEXT NOT NULL,
  ${SQL_COLUMN.AMOUNT} REAL NOT NULL,
  ${SQL_COLUMN.DATE} TEXT NOT NULL,
  ${SQL_COLUMN.TIME} TEXT NOT NULL DEFAULT '',
  ${SQL_COLUMN.CREATED_AT} INTEGER NOT NULL,
  ${SQL_COLUMN.NOTE} TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (${SQL_COLUMN.DEPOSIT_ID}) REFERENCES ${SQL_TABLE.DEPOSITS}(${SQL_COLUMN.ID}) ON DELETE CASCADE
);
CREATE INDEX idx_deposit_topups_deposit ON ${SQL_TABLE.DEPOSIT_TOPUPS}(${SQL_COLUMN.DEPOSIT_ID});

-- Deposit withdrawals
CREATE TABLE ${SQL_TABLE.DEPOSIT_WITHDRAWALS} (
  ${SQL_COLUMN.ID} TEXT PRIMARY KEY,
  ${SQL_COLUMN.DEPOSIT_ID} TEXT NOT NULL,
  ${SQL_COLUMN.AMOUNT} REAL NOT NULL,
  ${SQL_COLUMN.DATE} TEXT NOT NULL,
  ${SQL_COLUMN.TIME} TEXT NOT NULL DEFAULT '',
  ${SQL_COLUMN.CREATED_AT} INTEGER NOT NULL,
  ${SQL_COLUMN.NOTE} TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (${SQL_COLUMN.DEPOSIT_ID}) REFERENCES ${SQL_TABLE.DEPOSITS}(${SQL_COLUMN.ID}) ON DELETE CASCADE
);
CREATE INDEX idx_deposit_withdrawals_deposit ON ${SQL_TABLE.DEPOSIT_WITHDRAWALS}(${SQL_COLUMN.DEPOSIT_ID});

-- Currency exchanges
CREATE TABLE ${SQL_TABLE.CURRENCY_EXCHANGES} (
  ${SQL_COLUMN.ID} TEXT PRIMARY KEY,
  ${SQL_COLUMN.ACCOUNT_ID} TEXT NOT NULL,
  ${SQL_COLUMN.CREATED_AT} INTEGER NOT NULL,
  ${SQL_COLUMN.DATE} TEXT NOT NULL,
  ${SQL_COLUMN.TIME} TEXT NOT NULL DEFAULT '',
  ${SQL_COLUMN.TYPE} TEXT NOT NULL,
  ${SQL_COLUMN.AMOUNT_IN_ACCOUNT_CURRENCY} REAL NOT NULL,
  ${SQL_COLUMN.TARGET_CURRENCY} TEXT NOT NULL,
  ${SQL_COLUMN.TARGET_AMOUNT} REAL NOT NULL,
  ${SQL_COLUMN.EXCHANGE_RATE} REAL NOT NULL,
  ${SQL_COLUMN.PROVIDER} TEXT NOT NULL DEFAULT '',
  ${SQL_COLUMN.CATEGORY} TEXT,
  ${SQL_COLUMN.FEE} REAL,
  ${SQL_COLUMN.NOTE} TEXT NOT NULL DEFAULT '',
  ${SQL_COLUMN.ATTACHMENT_PATH} TEXT,
  FOREIGN KEY (${SQL_COLUMN.ACCOUNT_ID}) REFERENCES ${SQL_TABLE.ACCOUNTS}(${SQL_COLUMN.ID}) ON DELETE CASCADE
);
CREATE INDEX idx_currency_exchanges_account ON ${SQL_TABLE.CURRENCY_EXCHANGES}(${SQL_COLUMN.ACCOUNT_ID});

-- Record lookups (categories, tags, payers)
CREATE TABLE ${SQL_TABLE.RECORD_CATEGORIES} (
  ${SQL_COLUMN.ACCOUNT_ID} TEXT NOT NULL,
  ${SQL_COLUMN.CATEGORY} TEXT NOT NULL,
  PRIMARY KEY (${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.CATEGORY}),
  FOREIGN KEY (${SQL_COLUMN.ACCOUNT_ID}) REFERENCES ${SQL_TABLE.ACCOUNTS}(${SQL_COLUMN.ID}) ON DELETE CASCADE
);

CREATE TABLE ${SQL_TABLE.RECORD_TAGS} (
  ${SQL_COLUMN.ACCOUNT_ID} TEXT NOT NULL,
  ${SQL_COLUMN.TAG} TEXT NOT NULL,
  PRIMARY KEY (${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.TAG}),
  FOREIGN KEY (${SQL_COLUMN.ACCOUNT_ID}) REFERENCES ${SQL_TABLE.ACCOUNTS}(${SQL_COLUMN.ID}) ON DELETE CASCADE
);

CREATE TABLE ${SQL_TABLE.RECORD_PAYERS} (
  ${SQL_COLUMN.ACCOUNT_ID} TEXT NOT NULL,
  ${SQL_COLUMN.PAYER} TEXT NOT NULL,
  PRIMARY KEY (${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.PAYER}),
  FOREIGN KEY (${SQL_COLUMN.ACCOUNT_ID}) REFERENCES ${SQL_TABLE.ACCOUNTS}(${SQL_COLUMN.ID}) ON DELETE CASCADE
);

-- ViewState (UI persistence)
CREATE TABLE ${SQL_TABLE.VIEW_STATES} (
  ${SQL_COLUMN.ACCOUNT_ID} TEXT PRIMARY KEY,
  ${SQL_COLUMN.STATE} TEXT NOT NULL,
  FOREIGN KEY (${SQL_COLUMN.ACCOUNT_ID}) REFERENCES ${SQL_TABLE.ACCOUNTS}(${SQL_COLUMN.ID}) ON DELETE CASCADE
);
`;
```

3. **SqliteStorageBackend** (`src/storage/backends/SqliteStorageBackend.ts`):
```typescript
import initSqlJs, { Database } from 'sql.js';
import { App } from 'obsidian';
import { IStorageBackend } from '../interfaces/IStorageBackend';
import { StorageBackendType, SQLITE_DB_FILENAME } from '../../types';
import { SQLITE_SCHEMA_DDL } from './sqlite/schema';

export class SqliteStorageBackend implements IStorageBackend {
  private db: Database | null = null;
  private dbPath: string;
  private app: App;
  
  constructor(pluginId: string, app: App) {
    this.dbPath = `.obsidian/plugins/${pluginId}/${SQLITE_DB_FILENAME}`;
    this.app = app;
  }
  
  getType(): StorageBackendType {
    return StorageBackendType.SQLITE;
  }
  
  async initialize(): Promise<void> {
    const SQL = await initSqlJs({
      locateFile: file => `https://sql.js.org/dist/${file}`
    });
    
    const exists = await this.app.vault.adapter.exists(this.dbPath);
    
    if (exists) {
      // Открыть существующую БД
      const data = await this.app.vault.adapter.readBinary(this.dbPath);
      this.db = new SQL.Database(new Uint8Array(data));
      console.log('[SQLite] Database opened');
    } else {
      // Создать новую БД
      this.db = new SQL.Database();
      this.db.exec(SQLITE_SCHEMA_DDL);
      await this.persistDb();
      console.log('[SQLite] Database created with schema');
    }
  }
  
  async close(): Promise<void> {
    if (this.db) {
      await this.persistDb();
      this.db.close();
      this.db = null;
      console.log('[SQLite] Database closed');
    }
  }
  
  getDatabase(): Database {
    if (!this.db) throw new Error('[SQLite] Database not initialized');
    return this.db;
  }
  
  async exists(path: string): Promise<boolean> {
    // SQLite не использует paths — всегда true (данные в БД)
    return true;
  }
  
  async read(path: string): Promise<string | null> {
    // Не используется напрямую (queries идут через SqliteAccountRepository)
    throw new Error('[SQLite] read() not supported — use SQL queries');
  }
  
  async write(path: string, content: string): Promise<void> {
    // Не используется напрямую
    throw new Error('[SQLite] write() not supported — use SQL queries');
  }
  
  async delete(path: string): Promise<void> {
    // Не используется напрямую
    throw new Error('[SQLite] delete() not supported — use SQL queries');
  }
  
  async ensureDir(path: string): Promise<void> {
    // No-op для SQLite
  }
  
  async removeDir(path: string): Promise<void> {
    // No-op для SQLite
  }
  
  async listDirs(path: string): Promise<string[]> {
    // SQLite не имеет концепции директорий
    return [];
  }
  
  /** Persist database to disk */
  private async persistDb(): Promise<void> {
    if (!this.db) return;
    const data = this.db.export();
    const dir = this.dbPath.substring(0, this.dbPath.lastIndexOf('/'));
    if (!(await this.app.vault.adapter.exists(dir))) {
      await this.app.vault.adapter.mkdir(dir);
    }
    await this.app.vault.adapter.writeBinary(this.dbPath, data.buffer);
  }
  
  /** Manual flush (called by repository) */
  async flush(): Promise<void> {
    await this.persistDb();
  }
}
```

**Время:** 10-14 часов  
**Риски:** высокие (новая зависимость, WASM, требует тщательного тестирования)

---

### Этап 4: SqliteAccountRepository — реализация

**Файлы:**
- `src/storage/repositories/SqliteAccountRepository.ts` (новый, ~1000+ строк)
- `src/storage/backends/sqlite/queries.ts` (новый, prepared statements)
- `src/storage/backends/sqlite/mappers.ts` (новый, DB row ↔ TS type)

**Задачи:**

1. **Mappers** (`src/storage/backends/sqlite/mappers.ts`):
```typescript
import { FinanceRecord, DebtRecord, CreditRecord, /* ... */ } from '../../../types';
import { SQL_COLUMN } from '../../../constants';

/** Map DB row to FinanceRecord */
export function mapRowToRecord(row: any): FinanceRecord {
  return {
    id: row[SQL_COLUMN.ID],
    createdAt: row[SQL_COLUMN.CREATED_AT],
    date: row[SQL_COLUMN.DATE],
    time: row[SQL_COLUMN.TIME] || '',
    type: row[SQL_COLUMN.TYPE],
    amount: row[SQL_COLUMN.AMOUNT],
    category: row[SQL_COLUMN.CATEGORY],
    tag: row[SQL_COLUMN.TAG] || '',
    payer: row[SQL_COLUMN.PAYER] || '',
    note: row[SQL_COLUMN.NOTE] || '',
    attachmentPath: row[SQL_COLUMN.ATTACHMENT_PATH] || '',
    isInternal: Boolean(row[SQL_COLUMN.IS_INTERNAL]),
    linkedId: row[SQL_COLUMN.LINKED_ID] || undefined,
    linkedMovementId: row[SQL_COLUMN.LINKED_MOVEMENT_ID] || undefined,
    exchangeRate: row[SQL_COLUMN.EXCHANGE_RATE] || undefined,
  };
}

/** Map FinanceRecord to SQL params */
export function mapRecordToParams(rec: FinanceRecord, accountId: string): any[] {
  return [
    rec.id,
    accountId,
    rec.createdAt,
    rec.date,
    rec.time || '',
    rec.type,
    rec.amount,
    rec.category,
    rec.tag || '',
    rec.payer || '',
    rec.note || '',
    rec.attachmentPath || '',
    rec.linkedId || null,
    rec.linkedMovementId || null,
    rec.isInternal ? 1 : 0,
    rec.exchangeRate || null,
  ];
}

// ... аналогично для DebtRecord, CreditRecord, DepositRecord и т.д.
```

2. **SqliteAccountRepository** (частичная реализация, ~1000 строк):
```typescript
// src/storage/repositories/SqliteAccountRepository.ts
import { IAccountRepository } from '../interfaces/IAccountRepository';
import { SqliteStorageBackend } from '../backends/SqliteStorageBackend';
import { AccountData, FinanceRecord, DebtRecord, /* ... */ } from '../../types';
import { SQL_TABLE, SQL_COLUMN, DATA_VERSION } from '../FinanceStorage';
import { mapRowToRecord, mapRecordToParams, /* ... */ } from '../backends/sqlite/mappers';

export class SqliteAccountRepository implements IAccountRepository {
  private backend: SqliteStorageBackend;
  private cache: Map<string, AccountData> | null;
  
  constructor(backend: SqliteStorageBackend, enableCache = true) {
    this.backend = backend;
    this.cache = enableCache ? new Map() : null;
  }
  
  // ── Lifecycle ───────────────────────────────────────────────────────────
  
  async flush(): Promise<void> {
    await this.backend.flush();
  }
  
  invalidate(accountId: string): void {
    this.cache?.delete(accountId);
  }
  
  setDefaultCurrency(_currency: string): void {
    // SQLite не нуждается в defaultCurrency (хранится в каждой записи accounts)
  }
  
  // ── Composite load ──────────────────────────────────────────────────────
  
  async load(accountId: string): Promise<AccountData> {
    if (this.cache?.has(accountId)) {
      return this.cache.get(accountId)!;
    }
    
    const db = this.backend.getDatabase();
    
    // Parallel queries
    const [meta, records, debts, credits, deposits, exchanges] = await Promise.all([
      this.loadMetaFromDb(db, accountId),
      this.loadRecordsFromDb(db, accountId),
      this.loadDebtsFromDb(db, accountId),
      this.loadCreditsFromDb(db, accountId),
      this.loadDepositsFromDb(db, accountId),
      this.loadExchangesFromDb(db, accountId),
    ]);
    
    const data: AccountData = {
      version: DATA_VERSION,
      name: meta.name,
      currency: meta.currency,
      accentColor: meta.accentColor,
      records: records.records,
      categories: records.categories,
      tags: records.tags,
      payers: records.payers,
      debts,
      credits,
      deposits,
      exchanges,
    };
    
    this.cache?.set(accountId, data);
    return data;
  }
  
  private loadMetaFromDb(db: Database, accountId: string): Promise<AccountMetaFile> {
    const stmt = db.prepare(`
      SELECT * FROM ${SQL_TABLE.ACCOUNTS}
      WHERE ${SQL_COLUMN.ID} = ?
    `);
    stmt.bind([accountId]);
    
    if (stmt.step()) {
      const row = stmt.getAsObject();
      return {
        version: row[SQL_COLUMN.VERSION] as number,
        name: row[SQL_COLUMN.NAME] as string,
        currency: row[SQL_COLUMN.CURRENCY] as string,
        accentColor: row[SQL_COLUMN.ACCENT_COLOR] as string | undefined,
        sourcePath: row[SQL_COLUMN.SOURCE_PATH] as string | undefined,
      };
    }
    
    // Account doesn't exist → create empty
    db.run(`
      INSERT INTO ${SQL_TABLE.ACCOUNTS}
      (${SQL_COLUMN.ID}, ${SQL_COLUMN.NAME}, ${SQL_COLUMN.CURRENCY}, ${SQL_COLUMN.VERSION})
      VALUES (?, '', '₽', ${DATA_VERSION})
    `, [accountId]);
    
    return {
      version: DATA_VERSION,
      name: '',
      currency: '₽',
    };
  }
  
  private loadRecordsFromDb(db: Database, accountId: string): Promise<AccountRecordsFile> {
    // Load records
    const records: FinanceRecord[] = [];
    const stmt = db.prepare(`
      SELECT * FROM ${SQL_TABLE.RECORDS}
      WHERE ${SQL_COLUMN.ACCOUNT_ID} = ?
      ORDER BY ${SQL_COLUMN.DATE} DESC, ${SQL_COLUMN.CREATED_AT} DESC
    `);
    stmt.bind([accountId]);
    
    while (stmt.step()) {
      records.push(mapRowToRecord(stmt.getAsObject()));
    }
    stmt.free();
    
    // Load categories
    const categories: string[] = [];
    const catStmt = db.prepare(`
      SELECT ${SQL_COLUMN.CATEGORY} FROM ${SQL_TABLE.RECORD_CATEGORIES}
      WHERE ${SQL_COLUMN.ACCOUNT_ID} = ?
      ORDER BY ${SQL_COLUMN.CATEGORY}
    `);
    catStmt.bind([accountId]);
    while (catStmt.step()) {
      categories.push(catStmt.getAsObject()[SQL_COLUMN.CATEGORY] as string);
    }
    catStmt.free();
    
    // Load tags (аналогично)
    const tags: string[] = [];
    // ... SQL query ...
    
    // Load payers (аналогично)
    const payers: string[] = [];
    // ... SQL query ...
    
    return {
      version: DATA_VERSION,
      records,
      categories,
      tags,
      payers,
    };
  }
  
  private loadDebtsFromDb(db: Database, accountId: string): Promise<DebtRecord[]> {
    const debts: DebtRecord[] = [];
    
    // Load debts
    const stmt = db.prepare(`
      SELECT * FROM ${SQL_TABLE.DEBTS}
      WHERE ${SQL_COLUMN.ACCOUNT_ID} = ?
      ORDER BY ${SQL_COLUMN.DATE} DESC
    `);
    stmt.bind([accountId]);
    
    while (stmt.step()) {
      const debt = mapRowToDebt(stmt.getAsObject());
      
      // Load movements for this debt
      const movStmt = db.prepare(`
        SELECT * FROM ${SQL_TABLE.DEBT_MOVEMENTS}
        WHERE ${SQL_COLUMN.DEBT_ID} = ?
        ORDER BY ${SQL_COLUMN.DATE} ASC
      `);
      movStmt.bind([debt.id]);
      debt.movements = [];
      while (movStmt.step()) {
        debt.movements.push(mapRowToDebtMovement(movStmt.getAsObject()));
      }
      movStmt.free();
      
      debts.push(debt);
    }
    stmt.free();
    
    return debts;
  }
  
  // ... аналогично loadCreditsFromDb, loadDepositsFromDb, loadExchangesFromDb ...
  
  // ── Records CRUD ────────────────────────────────────────────────────────
  
  async addRecord(accountId: string, rec: FinanceRecord): Promise<void> {
    const db = this.backend.getDatabase();
    
    db.run('BEGIN TRANSACTION');
    try {
      // Insert record
      db.run(`
        INSERT INTO ${SQL_TABLE.RECORDS} (
          ${SQL_COLUMN.ID}, ${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.CREATED_AT},
          ${SQL_COLUMN.DATE}, ${SQL_COLUMN.TIME}, ${SQL_COLUMN.TYPE},
          ${SQL_COLUMN.AMOUNT}, ${SQL_COLUMN.CATEGORY}, ${SQL_COLUMN.TAG},
          ${SQL_COLUMN.PAYER}, ${SQL_COLUMN.NOTE}, ${SQL_COLUMN.ATTACHMENT_PATH},
          ${SQL_COLUMN.LINKED_ID}, ${SQL_COLUMN.LINKED_MOVEMENT_ID},
          ${SQL_COLUMN.IS_INTERNAL}, ${SQL_COLUMN.EXCHANGE_RATE}
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, mapRecordToParams(rec, accountId));
      
      // Update lookups
      if (rec.category) {
        db.run(`
          INSERT OR IGNORE INTO ${SQL_TABLE.RECORD_CATEGORIES}
          (${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.CATEGORY})
          VALUES (?, ?)
        `, [accountId, rec.category]);
      }
      if (rec.tag) {
        db.run(`
          INSERT OR IGNORE INTO ${SQL_TABLE.RECORD_TAGS}
          (${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.TAG})
          VALUES (?, ?)
        `, [accountId, rec.tag]);
      }
      if (rec.payer) {
        db.run(`
          INSERT OR IGNORE INTO ${SQL_TABLE.RECORD_PAYERS}
          (${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.PAYER})
          VALUES (?, ?)
        `, [accountId, rec.payer]);
      }
      
      db.run('COMMIT');
      this.invalidate(accountId);
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }
  
  async updateRecord(accountId: string, rec: FinanceRecord): Promise<void> {
    const db = this.backend.getDatabase();
    
    db.run('BEGIN TRANSACTION');
    try {
      db.run(`
        UPDATE ${SQL_TABLE.RECORDS}
        SET
          ${SQL_COLUMN.DATE} = ?,
          ${SQL_COLUMN.TIME} = ?,
          ${SQL_COLUMN.TYPE} = ?,
          ${SQL_COLUMN.AMOUNT} = ?,
          ${SQL_COLUMN.CATEGORY} = ?,
          ${SQL_COLUMN.TAG} = ?,
          ${SQL_COLUMN.PAYER} = ?,
          ${SQL_COLUMN.NOTE} = ?,
          ${SQL_COLUMN.ATTACHMENT_PATH} = ?,
          ${SQL_COLUMN.LINKED_ID} = ?,
          ${SQL_COLUMN.LINKED_MOVEMENT_ID} = ?,
          ${SQL_COLUMN.IS_INTERNAL} = ?,
          ${SQL_COLUMN.EXCHANGE_RATE} = ?
        WHERE ${SQL_COLUMN.ID} = ? AND ${SQL_COLUMN.ACCOUNT_ID} = ?
      `, [
        rec.date, rec.time || '', rec.type, rec.amount,
        rec.category, rec.tag || '', rec.payer || '',
        rec.note || '', rec.attachmentPath || '',
        rec.linkedId || null, rec.linkedMovementId || null,
        rec.isInternal ? 1 : 0, rec.exchangeRate || null,
        rec.id, accountId
      ]);
      
      // Update lookups (аналогично addRecord)
      // ...
      
      db.run('COMMIT');
      this.invalidate(accountId);
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }
  
  async deleteRecord(accountId: string, id: string): Promise<void> {
    const db = this.backend.getDatabase();
    db.run(`
      DELETE FROM ${SQL_TABLE.RECORDS}
      WHERE ${SQL_COLUMN.ID} = ? AND ${SQL_COLUMN.ACCOUNT_ID} = ?
    `, [id, accountId]);
    this.invalidate(accountId);
  }
  
  async saveAllRecords(accountId: string, records: FinanceRecord[]): Promise<void> {
    const db = this.backend.getDatabase();
    
    db.run('BEGIN TRANSACTION');
    try {
      // Delete all records
      db.run(`DELETE FROM ${SQL_TABLE.RECORDS} WHERE ${SQL_COLUMN.ACCOUNT_ID} = ?`, [accountId]);
      db.run(`DELETE FROM ${SQL_TABLE.RECORD_CATEGORIES} WHERE ${SQL_COLUMN.ACCOUNT_ID} = ?`, [accountId]);
      db.run(`DELETE FROM ${SQL_TABLE.RECORD_TAGS} WHERE ${SQL_COLUMN.ACCOUNT_ID} = ?`, [accountId]);
      db.run(`DELETE FROM ${SQL_TABLE.RECORD_PAYERS} WHERE ${SQL_COLUMN.ACCOUNT_ID} = ?`, [accountId]);
      
      // Rebuild lookups
      const categories = new Set<string>();
      const tags = new Set<string>();
      const payers = new Set<string>();
      
      // Insert all records
      for (const rec of records) {
        db.run(`
          INSERT INTO ${SQL_TABLE.RECORDS} (/* ... */)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, mapRecordToParams(rec, accountId));
        
        if (rec.category) categories.add(rec.category);
        if (rec.tag) tags.add(rec.tag);
        if (rec.payer) payers.add(rec.payer);
      }
      
      // Insert lookups
      for (const cat of categories) {
        db.run(`INSERT INTO ${SQL_TABLE.RECORD_CATEGORIES} VALUES (?, ?)`, [accountId, cat]);
      }
      for (const tag of tags) {
        db.run(`INSERT INTO ${SQL_TABLE.RECORD_TAGS} VALUES (?, ?)`, [accountId, tag]);
      }
      for (const payer of payers) {
        db.run(`INSERT INTO ${SQL_TABLE.RECORD_PAYERS} VALUES (?, ?)`, [accountId, payer]);
      }
      
      db.run('COMMIT');
      this.invalidate(accountId);
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }
  
  // ── Debts CRUD ──────────────────────────────────────────────────────────
  // ... аналогично Records, но с JOIN на debt_movements ...
  
  // ── Credits CRUD ────────────────────────────────────────────────────────
  // ... аналогично Debts ...
  
  // ── Deposits CRUD ───────────────────────────────────────────────────────
  // ... аналогично Credits ...
  
  // ── Exchanges CRUD ──────────────────────────────────────────────────────
  // ... аналогично Records (простая таблица) ...
  
  // ── ViewState ───────────────────────────────────────────────────────────
  
  async saveViewState(accountId: string, state: Record<string, unknown> | null): Promise<void> {
    const db = this.backend.getDatabase();
    const json = state ? JSON.stringify(state) : '';
    
    db.run(`
      INSERT OR REPLACE INTO ${SQL_TABLE.VIEW_STATES}
      (${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.STATE})
      VALUES (?, ?)
    `, [accountId, json]);
  }
  
  async loadViewState(accountId: string): Promise<Record<string, unknown> | null> {
    const db = this.backend.getDatabase();
    const stmt = db.prepare(`
      SELECT ${SQL_COLUMN.STATE} FROM ${SQL_TABLE.VIEW_STATES}
      WHERE ${SQL_COLUMN.ACCOUNT_ID} = ?
    `);
    stmt.bind([accountId]);
    
    if (stmt.step()) {
      const json = stmt.getAsObject()[SQL_COLUMN.STATE] as string;
      stmt.free();
      return json ? JSON.parse(json) : null;
    }
    stmt.free();
    return null;
  }
  
  // ── Account management ──────────────────────────────────────────────────
  
  async deleteAccount(accountId: string): Promise<void> {
    const db = this.backend.getDatabase();
    // CASCADE удалит все связанные записи
    db.run(`DELETE FROM ${SQL_TABLE.ACCOUNTS} WHERE ${SQL_COLUMN.ID} = ?`, [accountId]);
    this.invalidate(accountId);
  }
  
  async findOrphanedAccounts(activeAccountIds: string[]): Promise<string[]> {
    const db = this.backend.getDatabase();
    const placeholders = activeAccountIds.map(() => '?').join(',');
    
    const stmt = db.prepare(`
      SELECT ${SQL_COLUMN.ID} FROM ${SQL_TABLE.ACCOUNTS}
      WHERE ${SQL_COLUMN.ID} NOT IN (${placeholders})
    `);
    stmt.bind(activeAccountIds);
    
    const orphans: string[] = [];
    while (stmt.step()) {
      orphans.push(stmt.getAsObject()[SQL_COLUMN.ID] as string);
    }
    stmt.free();
    
    return orphans;
  }
  
  // ── Linked records (atomic operations) ──────────────────────────────────
  
  async deleteDebtsWithLinkedRecords(accountId: string, debtIds: string[]): Promise<void> {
    const db = this.backend.getDatabase();
    
    db.run('BEGIN TRANSACTION');
    try {
      for (const debtId of debtIds) {
        // Delete linked records
        db.run(`
          DELETE FROM ${SQL_TABLE.RECORDS}
          WHERE ${SQL_COLUMN.ACCOUNT_ID} = ? AND ${SQL_COLUMN.LINKED_ID} = ?
        `, [accountId, debtId]);
        
        // Delete debt (CASCADE удалит movements)
        db.run(`
          DELETE FROM ${SQL_TABLE.DEBTS}
          WHERE ${SQL_COLUMN.ID} = ? AND ${SQL_COLUMN.ACCOUNT_ID} = ?
        `, [debtId, accountId]);
      }
      
      db.run('COMMIT');
      this.invalidate(accountId);
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }
  
  // ... аналогично deleteCreditsWithLinkedRecords, deleteDepositsWithLinkedRecords ...
}
```

**Время:** 16-24 часа  
**Риски:** высокие (сложная логика, много SQL, требует покрытия тестами)

---

### Этап 5: BackendFactory и интеграция

**Файлы:**
- `src/storage/BackendFactory.ts` (новый)
- `src/storage/FinanceStorage.ts` (обновить конструктор)
- `main.ts` (передать backendType из settings)

**Задачи:**

1. **BackendFactory**:
```typescript
// src/storage/BackendFactory.ts
import { App } from 'obsidian';
import { IAccountRepository } from './interfaces/IAccountRepository';
import { JsonStorageBackend } from './backends/JsonStorageBackend';
import { SqliteStorageBackend } from './backends/SqliteStorageBackend';
import { JsonAccountRepository } from './repositories/JsonAccountRepository';
import { SqliteAccountRepository } from './repositories/SqliteAccountRepository';
import { AccountFiles } from './AccountFiles';
import { StorageBackendType, SQLITE_CACHE_ENABLED_DEFAULT } from '../types';

export class BackendFactory {
  static async createRepository(
    app: App,
    pluginId: string,
    backendType: StorageBackendType,
    defaultCurrency: string
  ): Promise<IAccountRepository> {
    if (backendType === StorageBackendType.JSON) {
      const backend = new JsonStorageBackend(app);
      await backend.initialize();
      const files = new AccountFiles(pluginId);
      return new JsonAccountRepository(backend, files, defaultCurrency);
    } else if (backendType === StorageBackendType.SQLITE) {
      const backend = new SqliteStorageBackend(pluginId, app);
      await backend.initialize();
      return new SqliteAccountRepository(backend, SQLITE_CACHE_ENABLED_DEFAULT);
    } else {
      throw new Error(`Unknown storage backend: ${backendType}`);
    }
  }
}
```

2. **FinanceStorage** — обновить конструктор:
```typescript
// src/storage/FinanceStorage.ts
export class FinanceStorage {
  private repository: IAccountRepository;
  
  constructor(
    app: App,
    pluginId: string,
    defaultCurrency: string,
    backendType: StorageBackendType = StorageBackendType.JSON
  ) {
    // Асинхронная инициализация (await в main.ts)
    this.initRepository(app, pluginId, backendType, defaultCurrency);
  }
  
  private async initRepository(
    app: App,
    pluginId: string,
    backendType: StorageBackendType,
    defaultCurrency: string
  ): Promise<void> {
    this.repository = await BackendFactory.createRepository(
      app, pluginId, backendType, defaultCurrency
    );
  }
  
  // ... остальное без изменений ...
}
```

3. **main.ts** — передать backendType:
```typescript
// main.ts
async onload() {
  await this.loadSettings();
  
  this.storage = new FinanceStorage(
    this.app,
    this.manifest.id,
    this.settings.defaultCurrency,
    this.settings.storageBackend // НОВОЕ
  );
  
  // ... остальное ...
}
```

**Время:** 3-4 часа  
**Риски:** низкие

---

### Этап 6: UI для выбора backend и автоматическая миграция

**Файлы:**
- `main.ts` (обновить FinanceSettingTab)
- `src/modals/MigrationModal.ts` (новый)
- `src/storage/migration/DataMigrator.ts` (новый)

**Задачи:**

1. **UI в настройках** (`main.ts`):
```typescript
// В FinanceSettingTab.display()
new Setting(containerEl)
  .setName('Storage Backend')
  .setDesc('How to store your data. JSON: human-readable, Git-friendly. SQLite: faster for large datasets, binary format.')
  .addDropdown(dropdown => dropdown
    .addOption(StorageBackendType.JSON, 'JSON Files (recommended)')
    .addOption(StorageBackendType.SQLITE, 'SQLite Database')
    .setValue(this.plugin.settings.storageBackend)
    .onChange(async (value: StorageBackendType) => {
      // Предупреждение перед сменой
      const confirmed = await this.confirmBackendChange(
        this.plugin.settings.storageBackend,
        value as StorageBackendType
      );
      
      if (confirmed) {
        this.plugin.settings.storageBackend = value as StorageBackendType;
        await this.plugin.saveSettings();
        
        new Notice(
          'Storage backend changed. Reloading plugin...',
          5000
        );
        
        // Reload plugin
        await (this.plugin as any).app.plugins.disablePlugin(this.plugin.manifest.id);
        await (this.plugin as any).app.plugins.enablePlugin(this.plugin.manifest.id);
      } else {
        // Revert dropdown
        dropdown.setValue(this.plugin.settings.storageBackend);
      }
    })
  );

// SQLite warning
if (this.plugin.settings.storageBackend === StorageBackendType.SQLITE) {
  containerEl.createEl('div', {
    text: '⚠️ SQLite uses binary format. Git diffs will not be readable. Not recommended if you edit from multiple devices simultaneously.',
    cls: 'setting-item-description mod-warning',
  });
}
```

2. **Автоматическая миграция** при reload:
```typescript
// main.ts → onload()
async onload() {
  await this.loadSettings();
  
  // Создать storage
  this.storage = new FinanceStorage(/* ... */);
  
  // Проверить необходимость миграции
  await this.checkAndMigrate();
  
  // ... остальное ...
}

private async checkAndMigrate(): Promise<void> {
  const currentBackend = this.settings.storageBackend;
  
  // Detect противоположный backend с данными
  const needsMigration = await this.detectMigrationNeed(currentBackend);
  
  if (needsMigration) {
    // Показать MigrationModal
    const modal = new MigrationModal(
      this.app,
      this.storage,
      needsMigration.from,
      needsMigration.to,
      needsMigration.accounts
    );
    
    const result = await modal.showAndWait(); // Promise-based modal
    
    if (result.migrated) {
      new Notice(`Migration complete! ${result.count} accounts migrated.`);
    }
  }
}

private async detectMigrationNeed(currentBackend: StorageBackendType): Promise<{
  from: StorageBackendType;
  to: StorageBackendType;
  accounts: string[];
} | null> {
  if (currentBackend === StorageBackendType.SQLITE) {
    // Check if JSON folders exist
    const jsonFolders = await this.vault.adapter.list(`.obsidian/plugins/${this.manifest.id}/accounts`);
    if (jsonFolders.folders.length > 0) {
      return {
        from: StorageBackendType.JSON,
        to: StorageBackendType.SQLITE,
        accounts: jsonFolders.folders.map(f => f.split('/').pop()!),
      };
    }
  } else if (currentBackend === StorageBackendType.JSON) {
    // Check if SQLite DB exists
    const dbPath = `.obsidian/plugins/${this.manifest.id}/${SQLITE_DB_FILENAME}`;
    if (await this.vault.adapter.exists(dbPath)) {
      // Check if DB has data
      const accounts = await this.getSqliteAccountIds();
      if (accounts.length > 0) {
        return {
          from: StorageBackendType.SQLITE,
          to: StorageBackendType.JSON,
          accounts,
        };
      }
    }
  }
  
  return null;
}
```

3. **MigrationModal** (`src/modals/MigrationModal.ts`):
```typescript
import { App, Modal } from 'obsidian';
import { FinanceStorage } from '../storage';
import { StorageBackendType, MIGRATION_PROGRESS_UPDATE_INTERVAL } from '../types';
import { DataMigrator } from '../storage/migration/DataMigrator';

export class MigrationModal extends Modal {
  private resolve: ((result: { migrated: boolean; count: number }) => void) | null = null;
  private migrator: DataMigrator;
  private progressEl: HTMLElement | null = null;
  
  constructor(
    app: App,
    private storage: FinanceStorage,
    private from: StorageBackendType,
    private to: StorageBackendType,
    private accounts: string[]
  ) {
    super(app);
    this.migrator = new DataMigrator(storage);
  }
  
  showAndWait(): Promise<{ migrated: boolean; count: number }> {
    this.open();
    return new Promise(resolve => {
      this.resolve = resolve;
    });
  }
  
  onOpen(): void {
    const { contentEl } = this;
    
    contentEl.createEl('h2', { text: 'Migrate Data' });
    
    contentEl.createEl('p', {
      text: `We found existing data in ${this.from.toUpperCase()} format. Migrate to ${this.to.toUpperCase()}?`,
    });
    
    contentEl.createEl('ul').innerHTML = `
      <li>${this.accounts.length} accounts</li>
      <li>All records, debts, credits, deposits, exchanges</li>
      <li>Your original data will remain unchanged (backup)</li>
    `;
    
    this.progressEl = contentEl.createEl('div', { cls: 'finance-migration-progress' });
    this.progressEl.style.display = 'none';
    
    const btnContainer = contentEl.createEl('div', { cls: 'modal-button-container' });
    
    const skipBtn = btnContainer.createEl('button', { text: 'Skip' });
    skipBtn.addEventListener('click', () => {
      this.resolve?.({ migrated: false, count: 0 });
      this.close();
    });
    
    const migrateBtn = btnContainer.createEl('button', {
      text: 'Migrate',
      cls: 'mod-cta',
    });
    migrateBtn.addEventListener('click', () => {
      void this.startMigration();
    });
  }
  
  private async startMigration(): Promise<void> {
    if (!this.progressEl) return;
    
    this.progressEl.style.display = 'block';
    this.progressEl.innerHTML = `
      <div class="progress-bar-container">
        <div class="progress-bar" style="width: 0%"></div>
      </div>
      <div class="progress-text">Starting migration...</div>
    `;
    
    const progressBar = this.progressEl.querySelector('.progress-bar') as HTMLElement;
    const progressText = this.progressEl.querySelector('.progress-text') as HTMLElement;
    
    try {
      let migratedCount = 0;
      
      await this.migrator.migrate(
        this.from,
        this.to,
        this.accounts,
        (current, total) => {
          const percent = Math.round((current / total) * 100);
          progressBar.style.width = `${percent}%`;
          progressText.textContent = `Migrating account ${current} of ${total}...`;
          migratedCount = current;
        }
      );
      
      progressText.textContent = `Migration complete! ✓`;
      
      setTimeout(() => {
        this.resolve?.({ migrated: true, count: migratedCount });
        this.close();
      }, 1000);
    } catch (e) {
      progressText.textContent = `Migration failed: ${e.message}`;
      console.error('[Migration]', e);
    }
  }
  
  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.resolve?.({ migrated: false, count: 0 });
  }
}
```

4. **DataMigrator** (`src/storage/migration/DataMigrator.ts`):
```typescript
import { FinanceStorage } from '../';
import { StorageBackendType, MIGRATION_BATCH_SIZE } from '../../types';

export class DataMigrator {
  constructor(private storage: FinanceStorage) {}
  
  async migrate(
    from: StorageBackendType,
    to: StorageBackendType,
    accountIds: string[],
    progressCallback?: (current: number, total: number) => void
  ): Promise<void> {
    // NOTE: Миграция требует создания двух storage instances:
    // 1. Source repository (from)
    // 2. Target repository (to)
    // 
    // Текущий FinanceStorage — это target.
    // Нужно создать source repository отдельно.
    
    // TODO: Реализация требует рефакторинга, чтобы можно было
    // создать два repository одновременно.
    // 
    // Упрощённый подход:
    // 1. Использовать текущий storage (target)
    // 2. Напрямую читать из source (JSON folders или SQLite DB)
    // 3. Записывать через target repository
    
    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i];
      
      // Load from source
      const data = await this.loadFromSource(from, accountId);
      
      // Save to target
      await this.saveToTarget(to, accountId, data);
      
      progressCallback?.(i + 1, accountIds.length);
    }
  }
  
  private async loadFromSource(
    backend: StorageBackendType,
    accountId: string
  ): Promise<AccountData> {
    // TODO: Implementation
    throw new Error('Not implemented');
  }
  
  private async saveToTarget(
    backend: StorageBackendType,
    accountId: string,
    data: AccountData
  ): Promise<void> {
    // TODO: Implementation
    throw new Error('Not implemented');
  }
}
```

**Время:** 10-14 часов  
**Риски:** средние (UI + миграция, требует тестирования на реальных данных)

---

### Этап 7: Тестирование

**Файлы:**
- `src/__tests__/storage/JsonAccountRepository.test.ts` (новый)
- `src/__tests__/storage/SqliteAccountRepository.test.ts` (новый)
- `src/__tests__/storage/SqliteStorageBackend.test.ts` (новый)
- `src/__tests__/storage/DataMigrator.test.ts` (новый)
- `src/__tests__/integration-storage-backends.test.ts` (новый)
- Обновить существующие `storage.test.ts` (должны проходить без изменений)

**Задачи:**

1. **Shared test suite** для обоих repositories:
```typescript
// src/__tests__/storage/shared-repository-tests.ts
import { describe, it, expect } from 'vitest';
import { IAccountRepository } from '../../storage/interfaces/IAccountRepository';
import { RecordType, DebtDirection } from '../../types';

export function testAccountRepository(
  name: string,
  createRepository: () => Promise<IAccountRepository>
) {
  describe(`${name} - IAccountRepository`, () => {
    it('should add and load record', async () => {
      const repo = await createRepository();
      const accountId = 'test-account';
      
      const record = {
        id: 'rec-1',
        createdAt: Date.now(),
        date: '2024-11-15',
        time: '10:00',
        type: RecordType.EXPENSE,
        amount: 500,
        category: 'Продукты',
        tag: '',
        payer: '',
        note: '',
        attachmentPath: '',
      };
      
      await repo.addRecord(accountId, record);
      const data = await repo.load(accountId);
      
      expect(data.records).toHaveLength(1);
      expect(data.records[0].id).toBe('rec-1');
      expect(data.categories).toContain('Продукты');
    });
    
    it('should update record', async () => {
      // ... аналогично текущим storage.test.ts ...
    });
    
    it('should delete record', async () => {
      // ...
    });
    
    it('should handle debts with movements', async () => {
      // ...
    });
    
    it('should handle credits with payments', async () => {
      // ...
    });
    
    it('should handle deposits with accruals', async () => {
      // ...
    });
    
    it('should handle linked records deletion', async () => {
      // ...
    });
    
    // ... ещё 50+ тестов ...
  });
}
```

2. **JsonAccountRepository tests**:
```typescript
// src/__tests__/storage/JsonAccountRepository.test.ts
import { testAccountRepository } from './shared-repository-tests';
import { JsonStorageBackend } from '../../storage/backends/JsonStorageBackend';
import { JsonAccountRepository } from '../../storage/repositories/JsonAccountRepository';
import { AccountFiles } from '../../storage/AccountFiles';

testAccountRepository('JsonAccountRepository', async () => {
  const mockApp = createMockApp(); // из существующих тестов
  const backend = new JsonStorageBackend(mockApp);
  await backend.initialize();
  const files = new AccountFiles('test-plugin');
  return new JsonAccountRepository(backend, files, '₽');
});
```

3. **SqliteAccountRepository tests**:
```typescript
// src/__tests__/storage/SqliteAccountRepository.test.ts
import { testAccountRepository } from './shared-repository-tests';
import { SqliteStorageBackend } from '../../storage/backends/SqliteStorageBackend';
import { SqliteAccountRepository } from '../../storage/repositories/SqliteAccountRepository';

testAccountRepository('SqliteAccountRepository', async () => {
  const mockApp = createMockApp();
  const backend = new SqliteStorageBackend('test-plugin', mockApp);
  await backend.initialize();
  return new SqliteAccountRepository(backend, true);
});
```

4. **Performance benchmarks**:
```typescript
// src/__tests__/storage/performance.bench.ts
import { describe, bench } from 'vitest';

describe('Storage Performance', () => {
  bench('JSON: load 1000 records', async () => {
    // ...
  });
  
  bench('SQLite: load 1000 records', async () => {
    // ...
  });
  
  bench('JSON: add 100 records', async () => {
    // ...
  });
  
  bench('SQLite: add 100 records', async () => {
    // ...
  });
  
  bench('JSON: filter by date (1000 records)', async () => {
    // ...
  });
  
  bench('SQLite: filter by date (1000 records)', async () => {
    // ...
  });
});
```

**Время:** 16-20 часов  
**Риски:** средние (требуется mock sql.js)

---

### Этап 8: Документация

**Файлы:**
- `CODEBASE.md` (обновить раздел Storage)
- `README.md` и `README.ru.md` (добавить раздел про backends)
- `docs/storage-backends.md` (новый, детальное описание)

**Задачи:**

1. **CODEBASE.md** — обновить:
```markdown
## Storage Architecture

### Abstraction Layers

1. **IStorageBackend** — low-level (files/DB)
2. **IAccountRepository** — high-level CRUD
3. **FinanceStorage** — facade (API unchanged)

### Implementations

- **JsonAccountRepository** (default)
  - FileStore × 7 (meta, records, debts, credits, deposits, exchanges, state)
  - Debounced flush (500ms)
  - Human-readable format
  - Git-friendly

- **SqliteAccountRepository**
  - sql.js (WebAssembly)
  - 14 tables (normalized schema)
  - Optional cache
  - Better performance for large datasets (10,000+ records)
  - Binary format (not Git-friendly)

### Constants

All magic strings/numbers → `src/constants.ts` and `src/types.ts`:
- `StorageBackendType.JSON` / `StorageBackendType.SQLITE`
- `SQL_TABLE.*` — table names
- `SQL_COLUMN.*` — column names
- `SQLITE_*` — configuration constants

### Migration

Automatic migration on backend switch via `DataMigrator`.
```

2. **README.md** — добавить раздел:
```markdown
## Storage Options

### JSON Files (Default)

- Human-readable format
- Works well with Git
- Up to ~10,000 records
- `.obsidian/plugins/finance-manager/accounts/<accountId>/`

### SQLite Database

- Better performance for large datasets
- Binary format (not Git-friendly)
- Recommended for 10,000+ records
- `.obsidian/plugins/finance-manager/finance.db`

**To switch:**
1. Settings → Storage Backend → Select SQLite
2. Plugin reloads automatically
3. Migration dialog appears if data exists
4. Click "Migrate" to transfer data

**Warning:** SQLite uses binary format. Git diffs will not be readable.
```

**Время:** 4-6 часов  
**Риски:** минимальные

---

## Общая оценка

**Общее время:** 80-110 часов (10-14 рабочих дней)

**Критический путь:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

**Обязательные этапы:**
- ✅ Этап 1 (Интерфейсы и константы)
- ✅ Этап 2 (JSON refactoring)
- ✅ Этап 3 (SQLite schema)
- ✅ Этап 4 (SQLite repository)
- ✅ Этап 5 (Integration)
- ✅ Этап 6 (UI + Migration)
- ✅ Этап 7 (Testing)
- ⚠️ Этап 8 (Documentation) — желательно

---

## Проверка требований

✅ **Все магические строки и числа → константы**
- `SQL_TABLE.*`, `SQL_COLUMN.*` в `constants.ts`
- Все числа (SQLITE_BATCH_SIZE, MIGRATION_*) в `types.ts`

✅ **Всё через интерфейсы**
- `IStorageBackend` + `IAccountRepository`
- FinanceStorage API не меняется → вкладки НЕ трогаем

✅ **Мягкие миграции**
- JSON схема: `??=` для новых полей (уже есть)
- SQL схема: версионирование через `PRAGMA user_version`
- DataMigrator для переноса данных

✅ **Дефолт JSON**
- `DEFAULT_SETTINGS.storageBackend = StorageBackendType.JSON`

✅ **Автоматическая миграция**
- `checkAndMigrate()` в `main.ts onload()`
- MigrationModal с прогрессбаром

✅ **Кроссплатформенность**
- sql.js (WebAssembly) — работает везде

---

## Следующие шаги

1. ✅ **Обсудить план с пользователем**
2. ✅ **Создать feature branch** — `feature/storage-backend`
3. ⏭️ **Начать с Этапа 1** — создание интерфейсов и констант
4. ⏭️ **Итеративная разработка** — каждый этап = отдельный коммит/review

Готов начать реализацию после одобрения плана.
