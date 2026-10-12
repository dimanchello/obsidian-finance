# План реализации заменяемого бекенда хранения данных

## Цель
Рефакторинг слоя хранения данных для поддержки заменяемых бекендов (JSON ↔ SQLite) с возможностью выбора пользователем.

## Текущая архитектура

```
FinanceStorage (фасад)
 ├── FileStore<T> × 7 (meta, records, debts, credits, deposits, exchanges, state)
 │    ├── cache: Map<accountId, T>
 │    ├── dirty: Set<accountId>
 │    └── parse: (raw: unknown) => T
 ├── VaultAdapter (обертка над app.vault)
 │    ├── read/write/exists/mkdir/remove
 │    ├── atomicWrite (через .tmp файл)
 │    └── readJson (с fallback на null)
 ├── AccountFiles (расчет путей)
 │    └── `.obsidian/plugins/<pluginId>/accounts/<accountId>/<kind>.json`
 └── FlushScheduler (debounced запись 500ms)
```

**Особенности:**
- Каждый аккаунт → папка с 7 JSON файлами
- Кеш в памяти (Map), dirty tracking (Set)
- Debounced запись (500ms), flush на unload
- Парсинг/валидация через `domain/validate.ts`
- Атомарная запись через temp файл

## Целевая архитектура

```
FinanceStorage (фасад, без изменений API)
 ├── IAccountRepository (интерфейс репозитория)
 │    ├── JsonAccountRepository (текущая реализация)
 │    │    ├── FileStore<T> × 7
 │    │    ├── JsonStorageBackend (обертка над VaultAdapter)
 │    │    └── FlushScheduler
 │    └── SqliteAccountRepository (новая реализация)
 │         ├── IStorageBackend (SQLite драйвер)
 │         ├── Кеш в памяти (опционально)
 │         └── Transactions (SQLite native)
 └── BackendFactory (создание репозитория по типу)
```

## Этапы реализации

### Этап 1: Создание интерфейсов (Foundation)

**Цель:** Определить контракты для storage backend и repository.

**Файлы:**
- `src/storage/interfaces/IStorageBackend.ts` — низкоуровневые операции
- `src/storage/interfaces/IAccountRepository.ts` — высокоуровневые операции
- `src/storage/interfaces/types.ts` — общие типы

**IStorageBackend:**
```typescript
interface IStorageBackend {
  // Базовые операции с файлами/записями
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  delete(path: string): Promise<void>;
  
  // Операции с директориями
  ensureDir(path: string): Promise<void>;
  removeDir(path: string): Promise<void>;
  listDirs(path: string): Promise<string[]>;
  
  // Метаданные
  getType(): StorageBackendType; // 'json' | 'sqlite'
  
  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
}
```

**IAccountRepository:**
```typescript
interface IAccountRepository {
  // Composite load
  load(accountId: string): Promise<AccountData>;
  
  // Meta
  getMeta(accountId: string): Promise<AccountMetaFile>;
  saveMeta(accountId: string, meta: AccountMetaFile): Promise<void>;
  
  // Records
  getRecords(accountId: string): Promise<AccountRecordsFile>;
  saveRecords(accountId: string, records: AccountRecordsFile): Promise<void>;
  addRecord(accountId: string, record: FinanceRecord): Promise<void>;
  updateRecord(accountId: string, record: FinanceRecord): Promise<void>;
  deleteRecord(accountId: string, id: string): Promise<void>;
  
  // Debts (аналогично для credits, deposits, exchanges)
  getDebts(accountId: string): Promise<DebtRecord[]>;
  saveDebts(accountId: string, debts: DebtRecord[]): Promise<void>;
  // ... и т.д.
  
  // State
  getState(accountId: string): Promise<Record<string, unknown> | null>;
  saveState(accountId: string, state: Record<string, unknown> | null): Promise<void>;
  
  // Batch operations
  flush(): Promise<void>;
  invalidate(accountId: string): void;
  
  // Utility
  touchSourcePath(accountId: string, sourcePath: string): Promise<void>;
  findOrphanedAccounts(activeAccountIds: string[]): Promise<string[]>;
  deleteAccount(accountId: string): Promise<void>;
}
```

**Зависимости:** нет  
**Время:** 2-3 часа  
**Риски:** минимальные (только типы)

---

### Этап 2: Рефакторинг VaultAdapter → JsonStorageBackend

**Цель:** Переименовать и адаптировать VaultAdapter к интерфейсу IStorageBackend.

**Файлы:**
- `src/storage/backends/JsonStorageBackend.ts` (было VaultAdapter.ts)
- Обновить импорты в `FinanceStorage.ts`, `FileStore`

**Изменения:**
1. Класс `JsonStorageBackend implements IStorageBackend`
2. Добавить методы `getType()`, `initialize()`, `close()`
3. Переименовать методы для соответствия интерфейсу:
   - `read()` → возвращает `string | null`
   - `mkdir()` → `ensureDir()`
   - `rmdir()` → `removeDir()`
   - `listFolders()` → `listDirs()`
4. Оставить `atomicWrite()` как есть (или сделать приватным)

**Зависимости:** Этап 1  
**Время:** 1-2 часа  
**Риски:** низкие (переименование, тесты должны пройти)

---

### Этап 3: Извлечение JsonAccountRepository

**Цель:** Переместить логику FileStore + FlushScheduler в отдельный класс, реализующий IAccountRepository.

**Файлы:**
- `src/storage/repositories/JsonAccountRepository.ts` (новый)
- `src/storage/FinanceStorage.ts` (упрощается, делегирует в repository)

**JsonAccountRepository:**
```typescript
class JsonAccountRepository implements IAccountRepository {
  private backend: IStorageBackend;
  private files: AccountFiles;
  private scheduler: FlushScheduler;
  private defaultCurrency: string;
  
  private meta: FileStore<AccountMetaFile>;
  private records: FileStore<AccountRecordsFile>;
  private debts: FileStore<DebtRecord[]>;
  // ... остальные stores
  
  constructor(backend: IStorageBackend, files: AccountFiles, defaultCurrency: string) {
    // Текущая логика из FinanceStorage
  }
  
  async load(accountId: string): Promise<AccountData> {
    // Текущая логика из FinanceStorage.load()
  }
  
  // ... остальные методы IAccountRepository
}
```

**FinanceStorage упрощается:**
```typescript
class FinanceStorage {
  private repository: IAccountRepository;
  
  constructor(app: App, pluginId: string, defaultCurrency: string, backendType: StorageBackendType = 'json') {
    const backend = this.createBackend(app, backendType);
    const files = new AccountFiles(pluginId);
    this.repository = new JsonAccountRepository(backend, files, defaultCurrency);
  }
  
  async load(accountId: string): Promise<AccountData> {
    return this.repository.load(accountId);
  }
  
  // Все остальные методы делегируют в repository
}
```

**Зависимости:** Этап 2  
**Время:** 4-6 часов  
**Риски:** средние (большой рефакторинг, нужно сохранить все поведение)  
**Тестирование:** все существующие тесты должны пройти без изменений

---

### Этап 4: SQLite backend — базовая инфраструктура

**Цель:** Выбрать и интегрировать SQLite библиотеку, создать базовую структуру БД.

**Выбор библиотеки:**
- **better-sqlite3** — синхронный API, нативный, быстрый (требует native build)
- **sql.js** — WebAssembly, работает везде (больше размер, медленнее)
- **Рекомендация:** `sql.js` для совместимости с Obsidian mobile

**Файлы:**
- `src/storage/backends/SqliteStorageBackend.ts` (новый)
- `src/storage/backends/sqlite/schema.ts` — SQL схема
- `src/storage/backends/sqlite/migrations.ts` — миграции схемы

**Схема БД:**
```sql
-- Аккаунты (мета)
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT NOT NULL,
  accent_color TEXT,
  source_path TEXT,
  version INTEGER NOT NULL DEFAULT 1
);

-- Записи (records)
CREATE TABLE records (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL,
  type TEXT NOT NULL, -- 'income' | 'expense'
  category TEXT NOT NULL,
  tag TEXT NOT NULL DEFAULT '',
  payer TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  attachment TEXT NOT NULL DEFAULT '',
  linked_id TEXT,
  is_internal INTEGER NOT NULL DEFAULT 0, -- boolean
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX idx_records_account_id ON records(account_id);
CREATE INDEX idx_records_date ON records(account_id, date);
CREATE INDEX idx_records_linked_id ON records(account_id, linked_id);

-- Долги
CREATE TABLE debts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  direction TEXT NOT NULL, -- 'borrowed' | 'lent'
  principal REAL NOT NULL,
  currency TEXT NOT NULL,
  start_date TEXT NOT NULL,
  interest_rate REAL NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX idx_debts_account_id ON debts(account_id);

-- Движения долгов
CREATE TABLE debt_movements (
  id TEXT PRIMARY KEY,
  debt_id TEXT NOT NULL,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  type TEXT NOT NULL, -- 'borrow' | 'repay'
  interest_amount REAL,
  note TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE CASCADE
);
CREATE INDEX idx_debt_movements_debt_id ON debt_movements(debt_id);

-- Кредиты
CREATE TABLE credits (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  bank TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  start_date TEXT NOT NULL,
  term_months INTEGER NOT NULL,
  interest_rate REAL NOT NULL,
  type TEXT NOT NULL, -- 'annuity' | 'differentiated'
  status TEXT NOT NULL, -- 'active' | 'paid'
  payment_day INTEGER NOT NULL,
  early_repayment_option TEXT,
  down_payment REAL,
  down_payment_type TEXT,
  down_payment_record_id TEXT,
  is_escrow INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  day_count_convention TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX idx_credits_account_id ON credits(account_id);

-- Платежи по кредитам
CREATE TABLE credit_payments (
  id TEXT PRIMARY KEY,
  credit_id TEXT NOT NULL,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  principal REAL NOT NULL,
  interest REAL NOT NULL,
  status TEXT NOT NULL, -- 'pending' | 'paid'
  note TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (credit_id) REFERENCES credits(id) ON DELETE CASCADE
);
CREATE INDEX idx_credit_payments_credit_id ON credit_payments(credit_id);

-- Вклады
CREATE TABLE deposits (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  bank TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  start_date TEXT NOT NULL,
  term_months INTEGER NOT NULL,
  interest_rate REAL NOT NULL,
  type TEXT NOT NULL, -- 'fixed' | 'demand'
  status TEXT NOT NULL, -- 'active' | 'closed'
  accrual_type TEXT NOT NULL, -- 'to_account' | 'capitalization'
  accrual_day INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX idx_deposits_account_id ON deposits(account_id);

-- Начисления вклада
CREATE TABLE deposit_accruals (
  id TEXT PRIMARY KEY,
  deposit_id TEXT NOT NULL,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL, -- 'pending' | 'paid'
  FOREIGN KEY (deposit_id) REFERENCES deposits(id) ON DELETE CASCADE
);
CREATE INDEX idx_deposit_accruals_deposit_id ON deposit_accruals(deposit_id);

-- Пополнения вклада
CREATE TABLE deposit_topups (
  id TEXT PRIMARY KEY,
  deposit_id TEXT NOT NULL,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (deposit_id) REFERENCES deposits(id) ON DELETE CASCADE
);
CREATE INDEX idx_deposit_topups_deposit_id ON deposit_topups(deposit_id);

-- Снятия вклада
CREATE TABLE deposit_withdrawals (
  id TEXT PRIMARY KEY,
  deposit_id TEXT NOT NULL,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (deposit_id) REFERENCES deposits(id) ON DELETE CASCADE
);
CREATE INDEX idx_deposit_withdrawals_deposit_id ON deposit_withdrawals(deposit_id);

-- Валютные операции
CREATE TABLE currency_exchanges (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  date TEXT NOT NULL,
  operation TEXT NOT NULL, -- 'buy' | 'sell'
  amount REAL NOT NULL,
  rate REAL NOT NULL,
  currency TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX idx_currency_exchanges_account_id ON currency_exchanges(account_id);

-- Lookup таблицы (категории, теги, плательщики)
CREATE TABLE record_categories (
  account_id TEXT NOT NULL,
  category TEXT NOT NULL,
  PRIMARY KEY (account_id, category),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE record_tags (
  account_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (account_id, tag),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE record_payers (
  account_id TEXT NOT NULL,
  payer TEXT NOT NULL,
  PRIMARY KEY (account_id, payer),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- ViewState (сохранение состояния UI)
CREATE TABLE view_states (
  account_id TEXT PRIMARY KEY,
  state TEXT NOT NULL, -- JSON blob
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
```

**SqliteStorageBackend:**
```typescript
class SqliteStorageBackend implements IStorageBackend {
  private db: Database | null = null;
  private dbPath: string;
  
  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }
  
  async initialize(): Promise<void> {
    // Инициализация sql.js
    // Создание/открытие БД
    // Запуск миграций
  }
  
  async close(): Promise<void> {
    // Закрытие БД
  }
  
  getType(): StorageBackendType {
    return 'sqlite';
  }
  
  // Реализация методов IStorageBackend через SQL запросы
  async exists(path: string): Promise<boolean> { /* ... */ }
  async read(path: string): Promise<string | null> { /* ... */ }
  async write(path: string, content: string): Promise<void> { /* ... */ }
  // ...
}
```

**Зависимости:** Этап 1  
**Время:** 8-12 часов  
**Риски:** высокие (новая зависимость, сложная схема, требуется тестирование)

---

### Этап 5: SqliteAccountRepository

**Цель:** Реализовать IAccountRepository поверх SQLite.

**Файлы:**
- `src/storage/repositories/SqliteAccountRepository.ts` (новый)
- `src/storage/backends/sqlite/queries.ts` — prepared statements

**Особенности:**
1. **Кеш:** опциональный (SQLite уже быстрый)
2. **Transactions:** использовать для batch операций
3. **Flush:** менее критичен (SQLite пишет синхронно), но нужен для совместимости API
4. **Linked records:** сохраняются как обычные records с `linked_id`

**Пример:**
```typescript
class SqliteAccountRepository implements IAccountRepository {
  private backend: SqliteStorageBackend;
  private cache: Map<string, AccountData> | null = null; // опционально
  
  constructor(backend: SqliteStorageBackend, enableCache = false) {
    this.backend = backend;
    if (enableCache) this.cache = new Map();
  }
  
  async load(accountId: string): Promise<AccountData> {
    // Если есть кеш и данные в кеше — вернуть
    if (this.cache?.has(accountId)) return this.cache.get(accountId)!;
    
    // Иначе загрузить из БД
    const db = this.backend.getDatabase();
    
    // Параллельные запросы
    const [meta, records, debts, credits, deposits, exchanges] = await Promise.all([
      this.getMetaFromDb(db, accountId),
      this.getRecordsFromDb(db, accountId),
      this.getDebtsFromDb(db, accountId),
      this.getCreditsFromDb(db, accountId),
      this.getDepositsFromDb(db, accountId),
      this.getExchangesFromDb(db, accountId),
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
    
    // Если кеш включен — сохранить
    this.cache?.set(accountId, data);
    
    return data;
  }
  
  async saveRecords(accountId: string, records: AccountRecordsFile): Promise<void> {
    const db = this.backend.getDatabase();
    
    // Transaction для batch операций
    db.exec('BEGIN TRANSACTION');
    try {
      // Удалить все текущие записи аккаунта
      db.run('DELETE FROM records WHERE account_id = ?', [accountId]);
      db.run('DELETE FROM record_categories WHERE account_id = ?', [accountId]);
      db.run('DELETE FROM record_tags WHERE account_id = ?', [accountId]);
      db.run('DELETE FROM record_payers WHERE account_id = ?', [accountId]);
      
      // Вставить новые записи
      const stmt = db.prepare(`
        INSERT INTO records (id, account_id, date, time, amount, type, category, tag, payer, note, attachment, linked_id, is_internal)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      for (const r of records.records) {
        stmt.run([
          r.id, accountId, r.date, r.time || '', r.amount, r.type,
          r.category, r.tag || '', r.payer || '', r.note || '', r.attachment || '',
          r.linkedId || null, r.isInternal ? 1 : 0
        ]);
      }
      
      // Вставить lookup таблицы
      for (const cat of records.categories) {
        db.run('INSERT OR IGNORE INTO record_categories VALUES (?, ?)', [accountId, cat]);
      }
      for (const tag of records.tags) {
        db.run('INSERT OR IGNORE INTO record_tags VALUES (?, ?)', [accountId, tag]);
      }
      for (const payer of records.payers) {
        db.run('INSERT OR IGNORE INTO record_payers VALUES (?, ?)', [accountId, payer]);
      }
      
      db.exec('COMMIT');
      
      // Инвалидация кеша
      this.cache?.delete(accountId);
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  
  // ... аналогично для остальных методов
}
```

**Зависимости:** Этап 4  
**Время:** 12-16 часов  
**Риски:** высокие (сложная логика, требуется полное покрытие тестами)

---

### Этап 6: BackendFactory и интеграция

**Цель:** Создать фабрику для выбора backend/repository, интегрировать в FinanceStorage.

**Файлы:**
- `src/storage/BackendFactory.ts` (новый)
- `src/storage/FinanceStorage.ts` (обновить конструктор)
- `src/types.ts` (добавить StorageBackendType в PluginSettings)

**BackendFactory:**
```typescript
class BackendFactory {
  static createRepository(
    app: App,
    pluginId: string,
    backendType: StorageBackendType,
    defaultCurrency: string
  ): IAccountRepository {
    if (backendType === 'json') {
      const backend = new JsonStorageBackend(app);
      const files = new AccountFiles(pluginId);
      return new JsonAccountRepository(backend, files, defaultCurrency);
    } else if (backendType === 'sqlite') {
      const dbPath = `.obsidian/plugins/${pluginId}/finance.db`;
      const backend = new SqliteStorageBackend(dbPath, app);
      return new SqliteAccountRepository(backend, true); // с кешем
    } else {
      throw new Error(`Unknown storage backend: ${backendType}`);
    }
  }
}
```

**FinanceStorage:**
```typescript
class FinanceStorage {
  private repository: IAccountRepository;
  
  constructor(app: App, pluginId: string, defaultCurrency: string, backendType: StorageBackendType = 'json') {
    this.repository = BackendFactory.createRepository(app, pluginId, backendType, defaultCurrency);
  }
  
  // Все методы делегируют в repository (без изменений)
  async load(accountId: string): Promise<AccountData> {
    return this.repository.load(accountId);
  }
  
  async addRecord(accountId: string, record: FinanceRecord): Promise<void> {
    return this.repository.addRecord(accountId, record);
  }
  
  // ...
}
```

**PluginSettings:**
```typescript
interface PluginSettings {
  defaultCurrency: string;
  defaultPageSize: number;
  customCurrencies: string[];
  storageBackend: StorageBackendType; // новое поле
}

const DEFAULT_SETTINGS: PluginSettings = {
  defaultCurrency: '₽',
  defaultPageSize: 25,
  customCurrencies: ['₽'],
  storageBackend: 'json', // по умолчанию JSON
};
```

**Зависимости:** Этапы 3, 5  
**Время:** 2-4 часа  
**Риски:** низкие (простая интеграция)

---

### Этап 7: UI для выбора backend

**Цель:** Добавить настройку в settings для выбора backend.

**Файлы:**
- `main.ts` (обновить FinanceSettingTab)

**UI:**
```typescript
// В FinanceSettingTab.display()
new Setting(containerEl)
  .setName('Storage Backend')
  .setDesc('Choose how to store your financial data. JSON: human-readable files. SQLite: database (better performance for large datasets).')
  .addDropdown(dropdown => dropdown
    .addOption('json', 'JSON Files')
    .addOption('sqlite', 'SQLite Database')
    .setValue(this.plugin.settings.storageBackend)
    .onChange(async (value: StorageBackendType) => {
      this.plugin.settings.storageBackend = value;
      await this.plugin.saveSettings();
      
      new Notice('Storage backend changed. Please reload the plugin for changes to take effect.');
    })
  );
```

**Важно:** Смена backend требует перезагрузки плагина (или даже Obsidian), чтобы пересоздать FinanceStorage.

**Зависимости:** Этап 6  
**Время:** 1-2 часа  
**Риски:** минимальные

---

### Этап 8: Миграция данных между backends

**Цель:** Добавить утилиту для миграции данных JSON → SQLite и обратно.

**Файлы:**
- `src/storage/migration/DataMigrator.ts` (новый)
- `src/storage/migration/MigrationModal.ts` (новый, UI для миграции)
- `main.ts` (добавить команду для миграции)

**DataMigrator:**
```typescript
class DataMigrator {
  static async migrateJsonToSqlite(
    sourceRepo: JsonAccountRepository,
    targetRepo: SqliteAccountRepository,
    accountIds: string[],
    progressCallback?: (current: number, total: number) => void
  ): Promise<void> {
    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i];
      
      // Загрузить из JSON
      const data = await sourceRepo.load(accountId);
      
      // Сохранить в SQLite
      await targetRepo.saveMeta(accountId, {
        version: DATA_VERSION,
        name: data.name,
        currency: data.currency,
        accentColor: data.accentColor,
        sourcePath: '', // будет обновлено позже
      });
      
      await targetRepo.saveRecords(accountId, {
        version: DATA_VERSION,
        records: data.records,
        categories: data.categories,
        tags: data.tags,
        payers: data.payers,
      });
      
      await targetRepo.saveDebts(accountId, data.debts);
      await targetRepo.saveCredits(accountId, data.credits);
      await targetRepo.saveDeposits(accountId, data.deposits);
      await targetRepo.saveExchanges(accountId, data.exchanges);
      
      progressCallback?.(i + 1, accountIds.length);
    }
  }
  
  static async migrateSqliteToJson(
    sourceRepo: SqliteAccountRepository,
    targetRepo: JsonAccountRepository,
    accountIds: string[],
    progressCallback?: (current: number, total: number) => void
  ): Promise<void> {
    // Аналогично, но в обратную сторону
  }
}
```

**MigrationModal:**
```typescript
class MigrationModal extends Modal {
  // UI для:
  // 1. Выбор направления (JSON → SQLite или SQLite → JSON)
  // 2. Progress bar
  // 3. Кнопка Start Migration
  // 4. Предупреждение о backup
}
```

**Команда:**
```typescript
this.addCommand({
  id: 'migrate-storage-backend',
  name: 'Migrate data between storage backends',
  callback: () => {
    new MigrationModal(this.app, this.storage, /* ... */).open();
  }
});
```

**Зависимости:** Этап 6  
**Время:** 6-8 часов  
**Риски:** средние (критичная операция, нужны проверки целостности)

---

### Этап 9: Тестирование

**Цель:** Полное покрытие тестами новых компонентов.

**Файлы:**
- `src/__tests__/storage/JsonAccountRepository.test.ts`
- `src/__tests__/storage/SqliteAccountRepository.test.ts`
- `src/__tests__/storage/SqliteStorageBackend.test.ts`
- `src/__tests__/storage/DataMigrator.test.ts`
- `src/__tests__/integration-storage-backends.test.ts` (интеграционные тесты)

**Тестовые сценарии:**

1. **JsonAccountRepository:**
   - Load/save для всех типов данных
   - Кеширование и dirty tracking
   - Flush и debounce
   - Параллельная загрузка

2. **SqliteAccountRepository:**
   - Load/save для всех типов данных
   - Transactions и rollback
   - Кеширование (опционально)
   - Производительность на больших данных

3. **SqliteStorageBackend:**
   - Инициализация БД
   - Миграции схемы
   - CRUD операции
   - Обработка ошибок

4. **DataMigrator:**
   - JSON → SQLite (все типы данных)
   - SQLite → JSON (все типы данных)
   - Сохранение ID и связей (linkedId, downPaymentRecordId)
   - Progress callback

5. **Интеграционные тесты:**
   - Работа плагина с JSON backend
   - Работа плагина с SQLite backend
   - Миграция и продолжение работы
   - Переключение backend и reload

**Зависимости:** Этапы 1-8  
**Время:** 12-16 часов  
**Риски:** средние (требуется mock sql.js для тестов)

---

### Этап 10: Документация и финализация

**Цель:** Обновить документацию, README, добавить примеры.

**Файлы:**
- `CODEBASE.md` — обновить раздел Storage
- `README.md` и `README.ru.md` — добавить раздел о backend'ах
- `docs/storage-backends.md` — новый файл с детальным описанием

**Содержание документации:**
1. Обзор архитектуры заменяемых backends
2. Когда использовать JSON vs SQLite
3. Как переключить backend
4. Как мигрировать данные
5. Производительность и ограничения
6. Troubleshooting

**Зависимости:** Этап 9  
**Время:** 4-6 часов  
**Риски:** минимальные

---

## Общая оценка

**Время реализации:** 60-80 часов (7-10 рабочих дней)

**Этапы по приоритету:**
1. ✅ Этап 1 (Foundation) — обязательно
2. ✅ Этап 2-3 (JSON refactoring) — обязательно
3. ✅ Этап 4-5 (SQLite implementation) — обязательно
4. ✅ Этап 6 (Integration) — обязательно
5. ⚠️ Этап 7 (UI) — желательно (можно сделать позже)
6. ⚠️ Этап 8 (Migration) — желательно (можно сделать позже)
7. ✅ Этап 9 (Testing) — обязательно
8. ⚠️ Этап 10 (Documentation) — желательно

**Критический путь:** 1 → 2 → 3 → 4 → 5 → 6 → 9

## Риски и миtigация

### Риск 1: Производительность SQLite в браузере (sql.js)
**Вероятность:** средняя  
**Влияние:** высокое  
**Миtigация:**
- Бенчмарки на реальных данных (1000+ records)
- Опциональный кеш для SqliteAccountRepository
- Индексы на часто используемые поля
- Рассмотреть better-sqlite3 для desktop (если Electron позволяет native modules)

### Риск 2: Размер bundle с sql.js
**Вероятность:** высокая  
**Влияние:** среднее  
**Миtigация:**
- Lazy load sql.js только при выборе SQLite backend
- Использовать минифицированную версию
- CDN fallback (если Obsidian разрешает)

### Риск 3: Несовместимость данных после миграции
**Вероятность:** средняя  
**Влияние:** критическое  
**Миtigация:**
- Валидация данных после миграции
- Backup перед миграцией (автоматический)
- Rollback mechanism
- Интеграционные тесты для миграции

### Риск 4: Обратная совместимость
**Вероятность:** низкая  
**Влияние:** высокое  
**Миtigация:**
- API FinanceStorage не меняется
- Дефолт остается JSON (существующие пользователи не затронуты)
- Миграция опциональная

### Риск 5: Сложность поддержки двух backends
**Вероятность:** высокая  
**Влияние:** среднее  
**Миtigация:**
- Общий интерфейс IAccountRepository
- Shared test suite (одни и те же тесты для обоих backends)
- Документация различий

## Альтернативные подходы

### Вариант 1: Только рефакторинг интерфейсов (без SQLite)
**Плюсы:**
- Меньше работы (только этапы 1-3)
- Меньше рисков
- Улучшает архитектуру

**Минусы:**
- Не дает выбор пользователю
- Не решает проблему производительности для больших данных

**Рекомендация:** Можно сделать как первую итерацию, затем добавить SQLite.

### Вариант 2: IndexedDB вместо SQLite
**Плюсы:**
- Нативно в браузере (нет зависимостей)
- Асинхронный API
- Хорошая производительность

**Минусы:**
- Нет SQL (нужно писать индексы вручную)
- Менее структурирован
- Сложнее миграции схемы

**Рекомендация:** Можно рассмотреть как третий backend в будущем.

### Вариант 3: Гибридный подход (JSON для мета, SQLite для records)
**Плюсы:**
- Мета остается читаемой
- Records в БД (производительность)

**Минусы:**
- Сложнее реализация
- Смешанная ответственность
- Сложнее миграции

**Рекомендация:** Не рекомендуется (усложняет архитектуру).

## Следующие шаги

1. **Обсудить план с пользователем** — убедиться в согласии с подходом
2. **Выбрать приоритет** — делать ли SQLite сразу или сначала только рефакторинг
3. **Создать feature branch** — `feature/storage-backend-refactoring`
4. **Начать с Этапа 1** — создание интерфейсов
5. **Итеративная разработка** — каждый этап = отдельный PR (для удобства review)

## Вопросы для обсуждения

1. **Приоритет SQLite:** Делать сразу или сначала только рефакторинг интерфейсов?
2. **SQLite библиотека:** sql.js (WebAssembly) или better-sqlite3 (native, только desktop)?
3. **Кеш для SQLite:** Включать по умолчанию или сделать опциональным?
4. **Миграция:** Автоматическая при первом запуске или ручная по команде?
5. **Дефолтный backend для новых пользователей:** JSON или SQLite?
