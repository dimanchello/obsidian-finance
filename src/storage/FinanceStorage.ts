import type { App } from 'obsidian';
import type { IAccountRepository } from './interfaces/IAccountRepository';
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
} from '../types';
import { JsonStorageBackend } from './backends/JsonStorageBackend';
import { JsonAccountRepository } from './repositories/JsonAccountRepository';
import { AccountFiles } from './AccountFiles';

/**
 * Storage facade that delegates all operations to the underlying repository.
 * API unchanged from the original implementation — tabs/commands require zero changes.
 */
export class FinanceStorage {
  private repository: IAccountRepository;

  constructor(app: App, pluginId: string, defaultCurrency = '₽') {
    // Currently only JSON backend (SQLite will be added in Stage 5)
    const backend = new JsonStorageBackend(app);
    const files = new AccountFiles(pluginId);
    this.repository = new JsonAccountRepository(backend, files, defaultCurrency);
  }

  // ── All methods delegate to repository (API unchanged) ─────────────────

  setDefaultCurrency(currency: string): void {
    this.repository.setDefaultCurrency(currency);
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

  async addDebt(accountId: string, debt: DebtRecord): Promise<void> {
    return this.repository.addDebt(accountId, debt);
  }

  async updateDebt(accountId: string, debt: DebtRecord): Promise<void> {
    return this.repository.updateDebt(accountId, debt);
  }

  async deleteDebt(accountId: string, id: string): Promise<void> {
    return this.repository.deleteDebt(accountId, id);
  }

  async deleteDebtsBatch(accountId: string, ids: string[]): Promise<void> {
    return this.repository.deleteDebtsBatch(accountId, ids);
  }

  async addDebtMovement(accountId: string, debtId: string, movement: DebtMovement): Promise<void> {
    return this.repository.addDebtMovement(accountId, debtId, movement);
  }

  async updateDebtMovement(accountId: string, debtId: string, movement: DebtMovement): Promise<void> {
    return this.repository.updateDebtMovement(accountId, debtId, movement);
  }

  async deleteDebtMovement(accountId: string, debtId: string, movementId: string): Promise<void> {
    return this.repository.deleteDebtMovement(accountId, debtId, movementId);
  }

  async addCredit(accountId: string, credit: CreditRecord): Promise<void> {
    return this.repository.addCredit(accountId, credit);
  }

  async updateCredit(accountId: string, credit: CreditRecord): Promise<void> {
    return this.repository.updateCredit(accountId, credit);
  }

  async deleteCredit(accountId: string, id: string): Promise<void> {
    return this.repository.deleteCredit(accountId, id);
  }

  async deleteCreditsBatch(accountId: string, ids: string[]): Promise<void> {
    return this.repository.deleteCreditsBatch(accountId, ids);
  }

  async saveAllCredits(accountId: string, credits: CreditRecord[]): Promise<void> {
    return this.repository.saveAllCredits(accountId, credits);
  }

  async addDeposit(accountId: string, deposit: DepositRecord): Promise<void> {
    return this.repository.addDeposit(accountId, deposit);
  }

  async updateDeposit(accountId: string, deposit: DepositRecord): Promise<void> {
    return this.repository.updateDeposit(accountId, deposit);
  }

  async deleteDeposit(accountId: string, id: string): Promise<void> {
    return this.repository.deleteDeposit(accountId, id);
  }

  async deleteDepositsBatch(accountId: string, ids: string[]): Promise<void> {
    return this.repository.deleteDepositsBatch(accountId, ids);
  }

  async saveAllDeposits(accountId: string, deposits: DepositRecord[]): Promise<void> {
    return this.repository.saveAllDeposits(accountId, deposits);
  }

  async addDepositTopUp(accountId: string, depositId: string, topUp: DepositTopUp): Promise<void> {
    return this.repository.addDepositTopUp(accountId, depositId, topUp);
  }

  async deleteDepositTopUp(accountId: string, depositId: string, topUpId: string): Promise<void> {
    return this.repository.deleteDepositTopUp(accountId, depositId, topUpId);
  }

  async addDepositWithdrawal(accountId: string, depositId: string, withdrawal: DepositWithdrawal): Promise<void> {
    return this.repository.addDepositWithdrawal(accountId, depositId, withdrawal);
  }

  async deleteDepositWithdrawal(accountId: string, depositId: string, withdrawalId: string): Promise<void> {
    return this.repository.deleteDepositWithdrawal(accountId, depositId, withdrawalId);
  }

  async addExchange(accountId: string, exchange: CurrencyExchange): Promise<void> {
    return this.repository.addExchange(accountId, exchange);
  }

  async updateExchange(accountId: string, exchange: CurrencyExchange): Promise<void> {
    return this.repository.updateExchange(accountId, exchange);
  }

  async deleteExchange(accountId: string, id: string): Promise<void> {
    return this.repository.deleteExchange(accountId, id);
  }

  async deleteExchangesBatch(accountId: string, ids: string[]): Promise<void> {
    return this.repository.deleteExchangesBatch(accountId, ids);
  }

  async saveAllExchanges(accountId: string, exchanges: CurrencyExchange[]): Promise<void> {
    return this.repository.saveAllExchanges(accountId, exchanges);
  }

  async loadAllExchanges(accountId: string): Promise<CurrencyExchange[]> {
    const data = await this.repository.load(accountId);
    return data.exchanges;
  }

  async saveViewState(accountId: string, state: Record<string, unknown>): Promise<void> {
    return this.repository.saveViewState(accountId, state);
  }

  async loadViewState(accountId: string): Promise<Record<string, unknown> | null> {
    return this.repository.loadViewState(accountId);
  }

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

  async findOrphanedAccounts(liveIds: Set<string>): Promise<string[]> {
    return this.repository.findOrphanedAccounts([...liveIds]);
  }

  /** Legacy method for resetting all data (used in tests/dev) */
  async resetAllData(accountId: string): Promise<void> {
    const data = await this.repository.load(accountId);
    await this.repository.saveAllRecords(accountId, []);
    await this.repository.saveAllCredits(accountId, []);
    await this.repository.saveAllDeposits(accountId, []);
    await this.repository.saveAllExchanges(accountId, []);
    await this.repository.deleteDebtsBatch(accountId, data.debts.map(d => d.id));
  }
}
