import type {
  AccountData,
  AccountMeta,
  FinanceRecord,
  DebtRecord,
  CreditRecord,
  DepositRecord,
  CurrencyExchange,
  DebtMovement,
  DepositTopUp,
  DepositWithdrawal,
} from '../../types';

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
