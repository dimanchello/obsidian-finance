import type { Database, SqlValue } from 'sql.js';
import type { IAccountRepository } from '../interfaces/IAccountRepository';
import type { SqliteStorageBackend } from '../backends/SqliteStorageBackend';
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
import type { AccountMetaFile, AccountRecordsFile } from './JsonAccountRepository';
import { SQL_TABLE, SQL_COLUMN, DATA_VERSION } from '../../constants';
import {
  mapRowToRecord,
  mapRecordToParams,
  mapRowToDebt,
  mapDebtToParams,
  mapRowToDebtMovement,
  mapDebtMovementToParams,
  mapRowToCredit,
  mapCreditToParams,
  mapRowToCreditPayment,
  mapCreditPaymentToParams,
  mapRowToDeposit,
  mapDepositToParams,
  mapRowToDepositAccrual,
  mapDepositAccrualToParams,
  mapRowToDepositTopUp,
  mapDepositTopUpToParams,
  mapRowToDepositWithdrawal,
  mapDepositWithdrawalToParams,
  mapRowToExchange,
} from '../backends/sqlite/mappers';

/**
 * Helper to convert unknown[] to SqlValue[] for sql.js type safety
 */
function toSqlParams(params: unknown[]): SqlValue[] {
  return params as SqlValue[];
}

/**
 * SQLite implementation of IAccountRepository.
 * Uses sql.js for data persistence with optional in-memory cache.
 */
export class SqliteAccountRepository implements IAccountRepository {
  private backend: SqliteStorageBackend;
  private cache: Map<string, AccountData> | null;

  constructor(backend: SqliteStorageBackend, enableCache = true) {
    this.backend = backend;
    this.cache = enableCache ? new Map() : null;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async flush(): Promise<void> {
    await this.backend.flush();
  }

  invalidate(accountId: string): void {
    this.cache?.delete(accountId);
  }

  setDefaultCurrency(_currency: string): void {
    // SQLite doesn't need defaultCurrency (stored per account in DB)
  }

  // ── Composite load ───────────────────────────────────────────────────────

  async load(accountId: string): Promise<AccountData> {
    if (this.cache?.has(accountId)) {
      return this.cache.get(accountId)!;
    }

    const db = this.backend.getDatabase();

    // Sequential queries (sync operations, not Promises)
    const meta = this.loadMetaFromDb(db, accountId);
    const recordsFile = this.loadRecordsFromDb(db, accountId);
    const debts = this.loadDebtsFromDb(db, accountId);
    const credits = this.loadCreditsFromDb(db, accountId);
    const deposits = this.loadDepositsFromDb(db, accountId);
    const exchanges = this.loadExchangesFromDb(db, accountId);

    const data: AccountData = {
      version: DATA_VERSION,
      name: meta.name,
      currency: meta.currency,
      accentColor: meta.accentColor,
      records: recordsFile.records,
      categories: recordsFile.categories,
      tags: recordsFile.tags,
      payers: recordsFile.payers,
      debts,
      credits,
      deposits,
      exchanges,
    };

    this.cache?.set(accountId, data);
    return data;
  }

  private loadMetaFromDb(db: Database, accountId: string): AccountMetaFile {
    const stmt = db.prepare(`
      SELECT * FROM ${SQL_TABLE.ACCOUNTS}
      WHERE ${SQL_COLUMN.ID} = ?
    `);
    stmt.bind([accountId]);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return {
        version: row[SQL_COLUMN.VERSION] as number,
        name: row[SQL_COLUMN.NAME] as string,
        currency: row[SQL_COLUMN.CURRENCY] as string,
        accentColor: (row[SQL_COLUMN.ACCENT_COLOR] as string) ?? '',
        sourcePath: (row[SQL_COLUMN.SOURCE_PATH] as string) ?? '',
      };
    }
    stmt.free();

    // Account doesn't exist → create empty
    db.run(`
      INSERT INTO ${SQL_TABLE.ACCOUNTS}
      (${SQL_COLUMN.ID}, ${SQL_COLUMN.NAME}, ${SQL_COLUMN.CURRENCY}, ${SQL_COLUMN.VERSION})
      VALUES (?, '', '₽', ${DATA_VERSION})
    `, toSqlParams([accountId]));

    return {
      version: DATA_VERSION,
      name: '',
      currency: '₽',
    };
  }

  private loadRecordsFromDb(db: Database, accountId: string): AccountRecordsFile {
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

    // Load tags
    const tags: string[] = [];
    const tagStmt = db.prepare(`
      SELECT ${SQL_COLUMN.TAG} FROM ${SQL_TABLE.RECORD_TAGS}
      WHERE ${SQL_COLUMN.ACCOUNT_ID} = ?
      ORDER BY ${SQL_COLUMN.TAG}
    `);
    tagStmt.bind([accountId]);
    while (tagStmt.step()) {
      tags.push(tagStmt.getAsObject()[SQL_COLUMN.TAG] as string);
    }
    tagStmt.free();

    // Load payers
    const payers: string[] = [];
    const payerStmt = db.prepare(`
      SELECT ${SQL_COLUMN.PAYER} FROM ${SQL_TABLE.RECORD_PAYERS}
      WHERE ${SQL_COLUMN.ACCOUNT_ID} = ?
      ORDER BY ${SQL_COLUMN.PAYER}
    `);
    payerStmt.bind([accountId]);
    while (payerStmt.step()) {
      payers.push(payerStmt.getAsObject()[SQL_COLUMN.PAYER] as string);
    }
    payerStmt.free();

    return {
      version: DATA_VERSION,
      records,
      categories,
      tags,
      payers,
    };
  }

  private loadDebtsFromDb(db: Database, accountId: string): DebtRecord[] {
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
        debt.movements.push(mapRowToDebtMovement(stmt.getAsObject()));
      }
      movStmt.free();

      debts.push(debt);
    }
    stmt.free();

    return debts;
  }

  private loadCreditsFromDb(db: Database, accountId: string): CreditRecord[] {
    const credits: CreditRecord[] = [];

    // Load credits
    const stmt = db.prepare(`
      SELECT * FROM ${SQL_TABLE.CREDITS}
      WHERE ${SQL_COLUMN.ACCOUNT_ID} = ?
      ORDER BY ${SQL_COLUMN.START_DATE} DESC
    `);
    stmt.bind([accountId]);

    while (stmt.step()) {
      const credit = mapRowToCredit(stmt.getAsObject());

      // Load payments for this credit
      const payStmt = db.prepare(`
        SELECT * FROM ${SQL_TABLE.CREDIT_PAYMENTS}
        WHERE ${SQL_COLUMN.CREDIT_ID} = ?
        ORDER BY ${SQL_COLUMN.DUE_DATE} ASC
      `);
      payStmt.bind([credit.id]);
      credit.payments = [];
      while (payStmt.step()) {
        credit.payments.push(mapRowToCreditPayment(stmt.getAsObject()));
      }
      payStmt.free();

      credits.push(credit);
    }
    stmt.free();

    return credits;
  }

  private loadDepositsFromDb(db: Database, accountId: string): DepositRecord[] {
    const deposits: DepositRecord[] = [];

    // Load deposits
    const stmt = db.prepare(`
      SELECT * FROM ${SQL_TABLE.DEPOSITS}
      WHERE ${SQL_COLUMN.ACCOUNT_ID} = ?
      ORDER BY ${SQL_COLUMN.START_DATE} DESC
    `);
    stmt.bind([accountId]);

    while (stmt.step()) {
      const deposit = mapRowToDeposit(stmt.getAsObject());

      // Load accruals
      const accrStmt = db.prepare(`
        SELECT * FROM ${SQL_TABLE.DEPOSIT_ACCRUALS}
        WHERE ${SQL_COLUMN.DEPOSIT_ID} = ?
        ORDER BY ${SQL_COLUMN.DUE_DATE} ASC
      `);
      accrStmt.bind([deposit.id]);
      deposit.accruals = [];
      while (accrStmt.step()) {
        deposit.accruals.push(mapRowToDepositAccrual(stmt.getAsObject()));
      }
      accrStmt.free();

      // Load top-ups
      const topUpStmt = db.prepare(`
        SELECT * FROM ${SQL_TABLE.DEPOSIT_TOPUPS}
        WHERE ${SQL_COLUMN.DEPOSIT_ID} = ?
        ORDER BY ${SQL_COLUMN.DATE} ASC
      `);
      topUpStmt.bind([deposit.id]);
      deposit.topUps = [];
      while (topUpStmt.step()) {
        deposit.topUps.push(mapRowToDepositTopUp(stmt.getAsObject()));
      }
      topUpStmt.free();

      // Load withdrawals
      const wdStmt = db.prepare(`
        SELECT * FROM ${SQL_TABLE.DEPOSIT_WITHDRAWALS}
        WHERE ${SQL_COLUMN.DEPOSIT_ID} = ?
        ORDER BY ${SQL_COLUMN.DATE} ASC
      `);
      wdStmt.bind([deposit.id]);
      deposit.withdrawals = [];
      while (wdStmt.step()) {
        deposit.withdrawals.push(mapRowToDepositWithdrawal(stmt.getAsObject()));
      }
      wdStmt.free();

      deposits.push(deposit);
    }
    stmt.free();

    return deposits;
  }

  private loadExchangesFromDb(db: Database, accountId: string): CurrencyExchange[] {
    const exchanges: CurrencyExchange[] = [];
    const stmt = db.prepare(`
      SELECT * FROM ${SQL_TABLE.CURRENCY_EXCHANGES}
      WHERE ${SQL_COLUMN.ACCOUNT_ID} = ?
      ORDER BY ${SQL_COLUMN.DATE} DESC, ${SQL_COLUMN.CREATED_AT} DESC
    `);
    stmt.bind([accountId]);

    while (stmt.step()) {
      exchanges.push(mapRowToExchange(stmt.getAsObject()));
    }
    stmt.free();

    return exchanges;
  }

  // ── Meta ─────────────────────────────────────────────────────────────────

  async updateMeta(accountId: string, meta: Partial<AccountMeta>): Promise<void> {
    const db = this.backend.getDatabase();

    const updates: string[] = [];
    const params: unknown[] = [];

    if (meta.name !== undefined) {
      updates.push(`${SQL_COLUMN.NAME} = ?`);
      params.push(meta.name);
    }
    if (meta.currency !== undefined) {
      updates.push(`${SQL_COLUMN.CURRENCY} = ?`);
      params.push(meta.currency);
    }
    if (meta.accentColor !== undefined) {
      updates.push(`${SQL_COLUMN.ACCENT_COLOR} = ?`);
      params.push(meta.accentColor ?? null);
    }

    if (updates.length === 0) return;

    params.push(accountId);

    db.run(`
      UPDATE ${SQL_TABLE.ACCOUNTS}
      SET ${updates.join(', ')}
      WHERE ${SQL_COLUMN.ID} = ?
    `, toSqlParams(params));

    this.invalidate(accountId);
  }

  async touchSourcePath(accountId: string, sourcePath: string): Promise<void> {
    const db = this.backend.getDatabase();
    db.run(`
      UPDATE ${SQL_TABLE.ACCOUNTS}
      SET ${SQL_COLUMN.SOURCE_PATH} = ?
      WHERE ${SQL_COLUMN.ID} = ?
    `, toSqlParams([sourcePath, accountId]));
  }

  // ── Records CRUD ─────────────────────────────────────────────────────────

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
      `, toSqlParams(mapRecordToParams(rec, accountId)));

      // Update lookups
      if (rec.category) {
        db.run(`
          INSERT OR IGNORE INTO ${SQL_TABLE.RECORD_CATEGORIES}
          (${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.CATEGORY})
          VALUES (?, ?)
        `, toSqlParams([accountId, rec.category]));
      }
      if (rec.tag) {
        db.run(`
          INSERT OR IGNORE INTO ${SQL_TABLE.RECORD_TAGS}
          (${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.TAG})
          VALUES (?, ?)
        `, toSqlParams([accountId, rec.tag]));
      }
      if (rec.payer) {
        db.run(`
          INSERT OR IGNORE INTO ${SQL_TABLE.RECORD_PAYERS}
          (${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.PAYER})
          VALUES (?, ?)
        `, toSqlParams([accountId, rec.payer]));
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
      `, toSqlParams([
        rec.date, rec.time ?? '', rec.type, rec.amount,
        rec.category, rec.tag ?? '', rec.payer ?? '',
        rec.note ?? '', rec.attachmentPath ?? '',
        rec.linkedId ?? null, rec.linkedMovementId ?? null,
        rec.isInternal ? 1 : 0, rec.exchangeRate ?? null,
        rec.id, accountId
      ]));

      // Update lookups (same as addRecord)
      if (rec.category) {
        db.run(`
          INSERT OR IGNORE INTO ${SQL_TABLE.RECORD_CATEGORIES}
          (${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.CATEGORY})
          VALUES (?, ?)
        `, toSqlParams([accountId, rec.category]));
      }
      if (rec.tag) {
        db.run(`
          INSERT OR IGNORE INTO ${SQL_TABLE.RECORD_TAGS}
          (${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.TAG})
          VALUES (?, ?)
        `, toSqlParams([accountId, rec.tag]));
      }
      if (rec.payer) {
        db.run(`
          INSERT OR IGNORE INTO ${SQL_TABLE.RECORD_PAYERS}
          (${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.PAYER})
          VALUES (?, ?)
        `, toSqlParams([accountId, rec.payer]));
      }

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
    `, toSqlParams([id, accountId]));
    this.invalidate(accountId);
  }

  async deleteRecordsBatch(accountId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const db = this.backend.getDatabase();
    const placeholders = ids.map(() => '?').join(',');

    db.run(`
      DELETE FROM ${SQL_TABLE.RECORDS}
      WHERE ${SQL_COLUMN.ACCOUNT_ID} = ? AND ${SQL_COLUMN.ID} IN (${placeholders})
    `, toSqlParams([accountId, ...ids]));

    this.invalidate(accountId);
  }

  async importRecords(accountId: string, records: FinanceRecord[]): Promise<void> {
    const db = this.backend.getDatabase();

    db.run('BEGIN TRANSACTION');
    try {
      for (const rec of records) {
        await this.addRecord(accountId, rec);
      }
      db.run('COMMIT');
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }

  async saveAllRecords(accountId: string, records: FinanceRecord[]): Promise<void> {
    const db = this.backend.getDatabase();

    db.run('BEGIN TRANSACTION');
    try {
      // Delete all records and lookups
      db.run(`DELETE FROM ${SQL_TABLE.RECORDS} WHERE ${SQL_COLUMN.ACCOUNT_ID} = ?`, toSqlParams([accountId]));
      db.run(`DELETE FROM ${SQL_TABLE.RECORD_CATEGORIES} WHERE ${SQL_COLUMN.ACCOUNT_ID} = ?`, toSqlParams([accountId]));
      db.run(`DELETE FROM ${SQL_TABLE.RECORD_TAGS} WHERE ${SQL_COLUMN.ACCOUNT_ID} = ?`, toSqlParams([accountId]));
      db.run(`DELETE FROM ${SQL_TABLE.RECORD_PAYERS} WHERE ${SQL_COLUMN.ACCOUNT_ID} = ?`, toSqlParams([accountId]));

      // Rebuild lookups
      const categories = new Set<string>();
      const tags = new Set<string>();
      const payers = new Set<string>();

      // Insert all records
      for (const rec of records) {
        db.run(`
          INSERT INTO ${SQL_TABLE.RECORDS} (
            ${SQL_COLUMN.ID}, ${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.CREATED_AT},
            ${SQL_COLUMN.DATE}, ${SQL_COLUMN.TIME}, ${SQL_COLUMN.TYPE},
            ${SQL_COLUMN.AMOUNT}, ${SQL_COLUMN.CATEGORY}, ${SQL_COLUMN.TAG},
            ${SQL_COLUMN.PAYER}, ${SQL_COLUMN.NOTE}, ${SQL_COLUMN.ATTACHMENT_PATH},
            ${SQL_COLUMN.LINKED_ID}, ${SQL_COLUMN.LINKED_MOVEMENT_ID},
            ${SQL_COLUMN.IS_INTERNAL}, ${SQL_COLUMN.EXCHANGE_RATE}
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, toSqlParams(mapRecordToParams(rec, accountId)));

        if (rec.category) categories.add(rec.category);
        if (rec.tag) tags.add(rec.tag);
        if (rec.payer) payers.add(rec.payer);
      }

      // Insert lookups
      for (const cat of categories) {
        db.run(`
          INSERT INTO ${SQL_TABLE.RECORD_CATEGORIES}
          (${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.CATEGORY})
          VALUES (?, ?)
        `, toSqlParams([accountId, cat]));
      }
      for (const tag of tags) {
        db.run(`
          INSERT INTO ${SQL_TABLE.RECORD_TAGS}
          (${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.TAG})
          VALUES (?, ?)
        `, toSqlParams([accountId, tag]));
      }
      for (const payer of payers) {
        db.run(`
          INSERT INTO ${SQL_TABLE.RECORD_PAYERS}
          (${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.PAYER})
          VALUES (?, ?)
        `, toSqlParams([accountId, payer]));
      }

      db.run('COMMIT');
      this.invalidate(accountId);
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }

  // ── Debts CRUD ───────────────────────────────────────────────────────────

  async addDebt(accountId: string, debt: DebtRecord): Promise<void> {
    const db = this.backend.getDatabase();

    db.run('BEGIN TRANSACTION');
    try {
      // Insert debt
      db.run(`
        INSERT INTO ${SQL_TABLE.DEBTS} (
          ${SQL_COLUMN.ID}, ${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.PERSON},
          ${SQL_COLUMN.AMOUNT}, ${SQL_COLUMN.ORIGINAL_AMOUNT}, ${SQL_COLUMN.INTEREST_RATE},
          ${SQL_COLUMN.DIRECTION}, ${SQL_COLUMN.DATE}, ${SQL_COLUMN.TIME},
          ${SQL_COLUMN.DUE_DATE}, ${SQL_COLUMN.CREATED_AT}, ${SQL_COLUMN.NOTE}
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, toSqlParams(mapDebtToParams(debt, accountId)));

      // Insert movements
      for (const movement of debt.movements) {
        db.run(`
          INSERT INTO ${SQL_TABLE.DEBT_MOVEMENTS} (
            ${SQL_COLUMN.ID}, ${SQL_COLUMN.DEBT_ID}, ${SQL_COLUMN.MOVEMENT_TYPE},
            ${SQL_COLUMN.AMOUNT}, ${SQL_COLUMN.INTEREST_AMOUNT}, ${SQL_COLUMN.DATE},
            ${SQL_COLUMN.TIME}, ${SQL_COLUMN.CREATED_AT}, ${SQL_COLUMN.NOTE}
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, toSqlParams(mapDebtMovementToParams(movement, debt.id)));
      }

      db.run('COMMIT');
      this.invalidate(accountId);
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }

  async updateDebt(accountId: string, debt: DebtRecord): Promise<void> {
    const db = this.backend.getDatabase();

    db.run('BEGIN TRANSACTION');
    try {
      // Update debt
      db.run(`
        UPDATE ${SQL_TABLE.DEBTS}
        SET
          ${SQL_COLUMN.PERSON} = ?,
          ${SQL_COLUMN.AMOUNT} = ?,
          ${SQL_COLUMN.ORIGINAL_AMOUNT} = ?,
          ${SQL_COLUMN.INTEREST_RATE} = ?,
          ${SQL_COLUMN.DIRECTION} = ?,
          ${SQL_COLUMN.DATE} = ?,
          ${SQL_COLUMN.TIME} = ?,
          ${SQL_COLUMN.DUE_DATE} = ?,
          ${SQL_COLUMN.NOTE} = ?
        WHERE ${SQL_COLUMN.ID} = ? AND ${SQL_COLUMN.ACCOUNT_ID} = ?
      `, toSqlParams([
        debt.person, debt.amount, debt.originalAmount, debt.interestRate,
        debt.direction, debt.date, debt.time ?? '', debt.dueDate ?? '',
        debt.note ?? '', debt.id, accountId
      ]));

      // Delete old movements and insert new ones
      db.run(`
        DELETE FROM ${SQL_TABLE.DEBT_MOVEMENTS}
        WHERE ${SQL_COLUMN.DEBT_ID} = ?
      `, toSqlParams([debt.id]));

      for (const movement of debt.movements) {
        db.run(`
          INSERT INTO ${SQL_TABLE.DEBT_MOVEMENTS} (
            ${SQL_COLUMN.ID}, ${SQL_COLUMN.DEBT_ID}, ${SQL_COLUMN.MOVEMENT_TYPE},
            ${SQL_COLUMN.AMOUNT}, ${SQL_COLUMN.INTEREST_AMOUNT}, ${SQL_COLUMN.DATE},
            ${SQL_COLUMN.TIME}, ${SQL_COLUMN.CREATED_AT}, ${SQL_COLUMN.NOTE}
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, toSqlParams(mapDebtMovementToParams(movement, debt.id)));
      }

      db.run('COMMIT');
      this.invalidate(accountId);
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }

  async deleteDebt(accountId: string, id: string): Promise<void> {
    const db = this.backend.getDatabase();
    // CASCADE will delete movements automatically
    db.run(`
      DELETE FROM ${SQL_TABLE.DEBTS}
      WHERE ${SQL_COLUMN.ID} = ? AND ${SQL_COLUMN.ACCOUNT_ID} = ?
    `, toSqlParams([id, accountId]));
    this.invalidate(accountId);
  }

  async deleteDebtsBatch(accountId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const db = this.backend.getDatabase();
    const placeholders = ids.map(() => '?').join(',');

    db.run(`
      DELETE FROM ${SQL_TABLE.DEBTS}
      WHERE ${SQL_COLUMN.ACCOUNT_ID} = ? AND ${SQL_COLUMN.ID} IN (${placeholders})
    `, toSqlParams([accountId, ...ids]));

    this.invalidate(accountId);
  }

  async addDebtMovement(accountId: string, debtId: string, movement: DebtMovement): Promise<void> {
    const db = this.backend.getDatabase();

    db.run(`
      INSERT INTO ${SQL_TABLE.DEBT_MOVEMENTS} (
        ${SQL_COLUMN.ID}, ${SQL_COLUMN.DEBT_ID}, ${SQL_COLUMN.MOVEMENT_TYPE},
        ${SQL_COLUMN.AMOUNT}, ${SQL_COLUMN.INTEREST_AMOUNT}, ${SQL_COLUMN.DATE},
        ${SQL_COLUMN.TIME}, ${SQL_COLUMN.CREATED_AT}, ${SQL_COLUMN.NOTE}
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, toSqlParams(mapDebtMovementToParams(movement, debtId)));

    this.invalidate(accountId);
  }

  async updateDebtMovement(accountId: string, debtId: string, movement: DebtMovement): Promise<void> {
    const db = this.backend.getDatabase();

    db.run(`
      UPDATE ${SQL_TABLE.DEBT_MOVEMENTS}
      SET
        ${SQL_COLUMN.MOVEMENT_TYPE} = ?,
        ${SQL_COLUMN.AMOUNT} = ?,
        ${SQL_COLUMN.INTEREST_AMOUNT} = ?,
        ${SQL_COLUMN.DATE} = ?,
        ${SQL_COLUMN.TIME} = ?,
        ${SQL_COLUMN.NOTE} = ?
      WHERE ${SQL_COLUMN.ID} = ? AND ${SQL_COLUMN.DEBT_ID} = ?
    `, toSqlParams([
      movement.type, movement.amount, movement.interestAmount ?? null,
      movement.date, movement.time ?? '', movement.note ?? '',
      movement.id, debtId
    ]));

    this.invalidate(accountId);
  }

  async deleteDebtMovement(accountId: string, debtId: string, movementId: string): Promise<void> {
    const db = this.backend.getDatabase();

    db.run(`
      DELETE FROM ${SQL_TABLE.DEBT_MOVEMENTS}
      WHERE ${SQL_COLUMN.ID} = ? AND ${SQL_COLUMN.DEBT_ID} = ?
    `, toSqlParams([movementId, debtId]));

    this.invalidate(accountId);
  }

  // ── Credits CRUD ─────────────────────────────────────────────────────────

  async addCredit(accountId: string, credit: CreditRecord): Promise<void> {
    const db = this.backend.getDatabase();

    db.run('BEGIN TRANSACTION');
    try {
      // Insert credit
      db.run(`
        INSERT INTO ${SQL_TABLE.CREDITS} (
          ${SQL_COLUMN.ID}, ${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.NAME},
          ${SQL_COLUMN.TYPE}, ${SQL_COLUMN.BANK_NAME}, ${SQL_COLUMN.ORIGINAL_AMOUNT},
          ${SQL_COLUMN.CURRENT_AMOUNT}, ${SQL_COLUMN.INTEREST_RATE}, ${SQL_COLUMN.MONTHLY_PAYMENT},
          ${SQL_COLUMN.TERM_MONTHS}, ${SQL_COLUMN.START_DATE}, ${SQL_COLUMN.PAYMENT_DAY},
          ${SQL_COLUMN.CREATED_AT}, ${SQL_COLUMN.NOTE}, ${SQL_COLUMN.STATUS},
          ${SQL_COLUMN.EARLY_REPAYMENT_OPTION}, ${SQL_COLUMN.PURCHASE_PRICE}, ${SQL_COLUMN.DOWN_PAYMENT},
          ${SQL_COLUMN.DOWN_PAYMENT_TYPE}, ${SQL_COLUMN.DOWN_PAYMENT_VALUE}, ${SQL_COLUMN.DOWN_PAYMENT_DATE},
          ${SQL_COLUMN.DOWN_PAYMENT_RECORD_ID}, ${SQL_COLUMN.IS_ESCROW}, ${SQL_COLUMN.ATTACHMENT_PATH},
          ${SQL_COLUMN.DAY_COUNT_CONVENTION}
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, toSqlParams(mapCreditToParams(credit, accountId)));

      // Insert payments
      for (const payment of credit.payments) {
        db.run(`
          INSERT INTO ${SQL_TABLE.CREDIT_PAYMENTS} (
            ${SQL_COLUMN.ID}, ${SQL_COLUMN.CREDIT_ID}, ${SQL_COLUMN.AMOUNT},
            ${SQL_COLUMN.DUE_DATE}, ${SQL_COLUMN.STATUS}, ${SQL_COLUMN.PAID_DATE},
            ${SQL_COLUMN.NOTE}, ${SQL_COLUMN.PRINCIPAL_PART}, ${SQL_COLUMN.INTEREST_PART},
            ${SQL_COLUMN.REMAINING_DEBT}
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, toSqlParams(mapCreditPaymentToParams(payment, credit.id)));
      }

      db.run('COMMIT');
      this.invalidate(accountId);
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }

  async updateCredit(accountId: string, credit: CreditRecord): Promise<void> {
    const db = this.backend.getDatabase();

    db.run('BEGIN TRANSACTION');
    try {
      // Update credit
      db.run(`
        UPDATE ${SQL_TABLE.CREDITS}
        SET
          ${SQL_COLUMN.NAME} = ?,
          ${SQL_COLUMN.TYPE} = ?,
          ${SQL_COLUMN.BANK_NAME} = ?,
          ${SQL_COLUMN.ORIGINAL_AMOUNT} = ?,
          ${SQL_COLUMN.CURRENT_AMOUNT} = ?,
          ${SQL_COLUMN.INTEREST_RATE} = ?,
          ${SQL_COLUMN.MONTHLY_PAYMENT} = ?,
          ${SQL_COLUMN.TERM_MONTHS} = ?,
          ${SQL_COLUMN.START_DATE} = ?,
          ${SQL_COLUMN.PAYMENT_DAY} = ?,
          ${SQL_COLUMN.NOTE} = ?,
          ${SQL_COLUMN.STATUS} = ?,
          ${SQL_COLUMN.EARLY_REPAYMENT_OPTION} = ?,
          ${SQL_COLUMN.PURCHASE_PRICE} = ?,
          ${SQL_COLUMN.DOWN_PAYMENT} = ?,
          ${SQL_COLUMN.DOWN_PAYMENT_TYPE} = ?,
          ${SQL_COLUMN.DOWN_PAYMENT_VALUE} = ?,
          ${SQL_COLUMN.DOWN_PAYMENT_DATE} = ?,
          ${SQL_COLUMN.DOWN_PAYMENT_RECORD_ID} = ?,
          ${SQL_COLUMN.IS_ESCROW} = ?,
          ${SQL_COLUMN.ATTACHMENT_PATH} = ?,
          ${SQL_COLUMN.DAY_COUNT_CONVENTION} = ?
        WHERE ${SQL_COLUMN.ID} = ? AND ${SQL_COLUMN.ACCOUNT_ID} = ?
      `, toSqlParams([
        credit.name, credit.type, credit.bankName, credit.originalAmount,
        credit.currentAmount, credit.interestRate, credit.monthlyPayment,
        credit.termMonths, credit.startDate, credit.paymentDay ?? null,
        credit.note ?? '', credit.status, credit.earlyRepaymentOption ?? null,
        credit.purchasePrice ?? null, credit.downPayment ?? null,
        credit.downPaymentType ?? null, credit.downPaymentValue ?? null,
        credit.downPaymentDate ?? null, credit.downPaymentRecordId ?? null,
        credit.isEscrow ? 1 : 0, credit.attachmentPath ?? null,
        credit.dayCountConvention ?? null, credit.id, accountId
      ]));

      // Delete old payments and insert new ones
      db.run(`
        DELETE FROM ${SQL_TABLE.CREDIT_PAYMENTS}
        WHERE ${SQL_COLUMN.CREDIT_ID} = ?
      `, toSqlParams([credit.id]));

      for (const payment of credit.payments) {
        db.run(`
          INSERT INTO ${SQL_TABLE.CREDIT_PAYMENTS} (
            ${SQL_COLUMN.ID}, ${SQL_COLUMN.CREDIT_ID}, ${SQL_COLUMN.AMOUNT},
            ${SQL_COLUMN.DUE_DATE}, ${SQL_COLUMN.STATUS}, ${SQL_COLUMN.PAID_DATE},
            ${SQL_COLUMN.NOTE}, ${SQL_COLUMN.PRINCIPAL_PART}, ${SQL_COLUMN.INTEREST_PART},
            ${SQL_COLUMN.REMAINING_DEBT}
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, toSqlParams(mapCreditPaymentToParams(payment, credit.id)));
      }

      db.run('COMMIT');
      this.invalidate(accountId);
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }

  async deleteCredit(accountId: string, id: string): Promise<void> {
    const db = this.backend.getDatabase();
    // CASCADE will delete payments automatically
    db.run(`
      DELETE FROM ${SQL_TABLE.CREDITS}
      WHERE ${SQL_COLUMN.ID} = ? AND ${SQL_COLUMN.ACCOUNT_ID} = ?
    `, toSqlParams([id, accountId]));
    this.invalidate(accountId);
  }

  async deleteCreditsBatch(accountId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const db = this.backend.getDatabase();
    const placeholders = ids.map(() => '?').join(',');

    db.run(`
      DELETE FROM ${SQL_TABLE.CREDITS}
      WHERE ${SQL_COLUMN.ACCOUNT_ID} = ? AND ${SQL_COLUMN.ID} IN (${placeholders})
    `, toSqlParams([accountId, ...ids]));

    this.invalidate(accountId);
  }

  async saveAllCredits(accountId: string, credits: CreditRecord[]): Promise<void> {
    const db = this.backend.getDatabase();

    db.run('BEGIN TRANSACTION');
    try {
      // Delete all credits (payments deleted by CASCADE)
      db.run(`DELETE FROM ${SQL_TABLE.CREDITS} WHERE ${SQL_COLUMN.ACCOUNT_ID} = ?`, toSqlParams([accountId]));

      // Insert all credits
      for (const credit of credits) {
        db.run(`
          INSERT INTO ${SQL_TABLE.CREDITS} (
            ${SQL_COLUMN.ID}, ${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.NAME},
            ${SQL_COLUMN.TYPE}, ${SQL_COLUMN.BANK_NAME}, ${SQL_COLUMN.ORIGINAL_AMOUNT},
            ${SQL_COLUMN.CURRENT_AMOUNT}, ${SQL_COLUMN.INTEREST_RATE}, ${SQL_COLUMN.MONTHLY_PAYMENT},
            ${SQL_COLUMN.TERM_MONTHS}, ${SQL_COLUMN.START_DATE}, ${SQL_COLUMN.PAYMENT_DAY},
            ${SQL_COLUMN.CREATED_AT}, ${SQL_COLUMN.NOTE}, ${SQL_COLUMN.STATUS},
            ${SQL_COLUMN.EARLY_REPAYMENT_OPTION}, ${SQL_COLUMN.PURCHASE_PRICE}, ${SQL_COLUMN.DOWN_PAYMENT},
            ${SQL_COLUMN.DOWN_PAYMENT_TYPE}, ${SQL_COLUMN.DOWN_PAYMENT_VALUE}, ${SQL_COLUMN.DOWN_PAYMENT_DATE},
            ${SQL_COLUMN.DOWN_PAYMENT_RECORD_ID}, ${SQL_COLUMN.IS_ESCROW}, ${SQL_COLUMN.ATTACHMENT_PATH},
            ${SQL_COLUMN.DAY_COUNT_CONVENTION}
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, toSqlParams(mapCreditToParams(credit, accountId)));

        // Insert payments
        for (const payment of credit.payments) {
          db.run(`
            INSERT INTO ${SQL_TABLE.CREDIT_PAYMENTS} (
              ${SQL_COLUMN.ID}, ${SQL_COLUMN.CREDIT_ID}, ${SQL_COLUMN.AMOUNT},
              ${SQL_COLUMN.DUE_DATE}, ${SQL_COLUMN.STATUS}, ${SQL_COLUMN.PAID_DATE},
              ${SQL_COLUMN.NOTE}, ${SQL_COLUMN.PRINCIPAL_PART}, ${SQL_COLUMN.INTEREST_PART},
              ${SQL_COLUMN.REMAINING_DEBT}
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, toSqlParams(mapCreditPaymentToParams(payment, credit.id)));
        }
      }

      db.run('COMMIT');
      this.invalidate(accountId);
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }

  // ── Deposits CRUD ────────────────────────────────────────────────────────

  async addDeposit(accountId: string, deposit: DepositRecord): Promise<void> {
    const db = this.backend.getDatabase();

    db.run('BEGIN TRANSACTION');
    try {
      // Insert deposit
      db.run(`
        INSERT INTO ${SQL_TABLE.DEPOSITS} (
          ${SQL_COLUMN.ID}, ${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.NAME},
          ${SQL_COLUMN.TYPE}, ${SQL_COLUMN.BANK_NAME}, ${SQL_COLUMN.AMOUNT},
          ${SQL_COLUMN.INTEREST_RATE}, ${SQL_COLUMN.START_DATE}, ${SQL_COLUMN.TERM_MONTHS},
          ${SQL_COLUMN.ACCRUAL_TYPE}, ${SQL_COLUMN.CREATED_AT}, ${SQL_COLUMN.NOTE},
          ${SQL_COLUMN.STATUS}, ${SQL_COLUMN.ATTACHMENT_PATH}
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, toSqlParams(mapDepositToParams(deposit, accountId)));

      // Insert accruals
      for (const accrual of deposit.accruals) {
        db.run(`
          INSERT INTO ${SQL_TABLE.DEPOSIT_ACCRUALS} (
            ${SQL_COLUMN.ID}, ${SQL_COLUMN.DEPOSIT_ID}, ${SQL_COLUMN.AMOUNT},
            ${SQL_COLUMN.DUE_DATE}, ${SQL_COLUMN.STATUS}, ${SQL_COLUMN.PAID_DATE},
            ${SQL_COLUMN.NOTE}
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, toSqlParams(mapDepositAccrualToParams(accrual, deposit.id)));
      }

      // Insert top-ups
      for (const topUp of deposit.topUps) {
        db.run(`
          INSERT INTO ${SQL_TABLE.DEPOSIT_TOPUPS} (
            ${SQL_COLUMN.ID}, ${SQL_COLUMN.DEPOSIT_ID}, ${SQL_COLUMN.AMOUNT},
            ${SQL_COLUMN.DATE}, ${SQL_COLUMN.TIME}, ${SQL_COLUMN.CREATED_AT},
            ${SQL_COLUMN.NOTE}
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, toSqlParams(mapDepositTopUpToParams(topUp, deposit.id)));
      }

      // Insert withdrawals
      for (const withdrawal of deposit.withdrawals) {
        db.run(`
          INSERT INTO ${SQL_TABLE.DEPOSIT_WITHDRAWALS} (
            ${SQL_COLUMN.ID}, ${SQL_COLUMN.DEPOSIT_ID}, ${SQL_COLUMN.AMOUNT},
            ${SQL_COLUMN.DATE}, ${SQL_COLUMN.TIME}, ${SQL_COLUMN.CREATED_AT},
            ${SQL_COLUMN.NOTE}
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, toSqlParams(mapDepositWithdrawalToParams(withdrawal, deposit.id)));
      }

      db.run('COMMIT');
      this.invalidate(accountId);
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }

  async updateDeposit(accountId: string, deposit: DepositRecord): Promise<void> {
    const db = this.backend.getDatabase();

    db.run('BEGIN TRANSACTION');
    try {
      // Update deposit
      db.run(`
        UPDATE ${SQL_TABLE.DEPOSITS}
        SET
          ${SQL_COLUMN.NAME} = ?,
          ${SQL_COLUMN.TYPE} = ?,
          ${SQL_COLUMN.BANK_NAME} = ?,
          ${SQL_COLUMN.AMOUNT} = ?,
          ${SQL_COLUMN.INTEREST_RATE} = ?,
          ${SQL_COLUMN.START_DATE} = ?,
          ${SQL_COLUMN.TERM_MONTHS} = ?,
          ${SQL_COLUMN.ACCRUAL_TYPE} = ?,
          ${SQL_COLUMN.NOTE} = ?,
          ${SQL_COLUMN.STATUS} = ?,
          ${SQL_COLUMN.ATTACHMENT_PATH} = ?
        WHERE ${SQL_COLUMN.ID} = ? AND ${SQL_COLUMN.ACCOUNT_ID} = ?
      `, toSqlParams([
        deposit.name, deposit.type, deposit.bankName, deposit.amount,
        deposit.interestRate, deposit.startDate, deposit.termMonths,
        deposit.accrualType, deposit.note ?? '', deposit.status,
        deposit.attachmentPath ?? null, deposit.id, accountId
      ]));

      // Delete old accruals and insert new ones
      db.run(`
        DELETE FROM ${SQL_TABLE.DEPOSIT_ACCRUALS}
        WHERE ${SQL_COLUMN.DEPOSIT_ID} = ?
      `, toSqlParams([deposit.id]));

      for (const accrual of deposit.accruals) {
        db.run(`
          INSERT INTO ${SQL_TABLE.DEPOSIT_ACCRUALS} (
            ${SQL_COLUMN.ID}, ${SQL_COLUMN.DEPOSIT_ID}, ${SQL_COLUMN.AMOUNT},
            ${SQL_COLUMN.DUE_DATE}, ${SQL_COLUMN.STATUS}, ${SQL_COLUMN.PAID_DATE},
            ${SQL_COLUMN.NOTE}
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, toSqlParams(mapDepositAccrualToParams(accrual, deposit.id)));
      }

      // Delete old top-ups and insert new ones
      db.run(`
        DELETE FROM ${SQL_TABLE.DEPOSIT_TOPUPS}
        WHERE ${SQL_COLUMN.DEPOSIT_ID} = ?
      `, toSqlParams([deposit.id]));

      for (const topUp of deposit.topUps) {
        db.run(`
          INSERT INTO ${SQL_TABLE.DEPOSIT_TOPUPS} (
            ${SQL_COLUMN.ID}, ${SQL_COLUMN.DEPOSIT_ID}, ${SQL_COLUMN.AMOUNT},
            ${SQL_COLUMN.DATE}, ${SQL_COLUMN.TIME}, ${SQL_COLUMN.CREATED_AT},
            ${SQL_COLUMN.NOTE}
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, toSqlParams(mapDepositTopUpToParams(topUp, deposit.id)));
      }

      // Delete old withdrawals and insert new ones
      db.run(`
        DELETE FROM ${SQL_TABLE.DEPOSIT_WITHDRAWALS}
        WHERE ${SQL_COLUMN.DEPOSIT_ID} = ?
      `, toSqlParams([deposit.id]));

      for (const withdrawal of deposit.withdrawals) {
        db.run(`
          INSERT INTO ${SQL_TABLE.DEPOSIT_WITHDRAWALS} (
            ${SQL_COLUMN.ID}, ${SQL_COLUMN.DEPOSIT_ID}, ${SQL_COLUMN.AMOUNT},
            ${SQL_COLUMN.DATE}, ${SQL_COLUMN.TIME}, ${SQL_COLUMN.CREATED_AT},
            ${SQL_COLUMN.NOTE}
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, toSqlParams(mapDepositWithdrawalToParams(withdrawal, deposit.id)));
      }

      db.run('COMMIT');
      this.invalidate(accountId);
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }

  async deleteDeposit(accountId: string, id: string): Promise<void> {
    const db = this.backend.getDatabase();
    // CASCADE will delete accruals/topUps/withdrawals automatically
    db.run(`
      DELETE FROM ${SQL_TABLE.DEPOSITS}
      WHERE ${SQL_COLUMN.ID} = ? AND ${SQL_COLUMN.ACCOUNT_ID} = ?
    `, toSqlParams([id, accountId]));
    this.invalidate(accountId);
  }

  async deleteDepositsBatch(accountId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const db = this.backend.getDatabase();
    const placeholders = ids.map(() => '?').join(',');

    db.run(`
      DELETE FROM ${SQL_TABLE.DEPOSITS}
      WHERE ${SQL_COLUMN.ACCOUNT_ID} = ? AND ${SQL_COLUMN.ID} IN (${placeholders})
    `, toSqlParams([accountId, ...ids]));

    this.invalidate(accountId);
  }

  async saveAllDeposits(accountId: string, deposits: DepositRecord[]): Promise<void> {
    const db = this.backend.getDatabase();

    db.run('BEGIN TRANSACTION');
    try {
      // Delete all deposits (children deleted by CASCADE)
      db.run(`DELETE FROM ${SQL_TABLE.DEPOSITS} WHERE ${SQL_COLUMN.ACCOUNT_ID} = ?`, toSqlParams([accountId]));

      // Insert all deposits
      for (const deposit of deposits) {
        db.run(`
          INSERT INTO ${SQL_TABLE.DEPOSITS} (
            ${SQL_COLUMN.ID}, ${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.NAME},
            ${SQL_COLUMN.TYPE}, ${SQL_COLUMN.BANK_NAME}, ${SQL_COLUMN.AMOUNT},
            ${SQL_COLUMN.INTEREST_RATE}, ${SQL_COLUMN.START_DATE}, ${SQL_COLUMN.TERM_MONTHS},
            ${SQL_COLUMN.ACCRUAL_TYPE}, ${SQL_COLUMN.CREATED_AT}, ${SQL_COLUMN.NOTE},
            ${SQL_COLUMN.STATUS}, ${SQL_COLUMN.ATTACHMENT_PATH}
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, toSqlParams(mapDepositToParams(deposit, accountId)));

        // Insert accruals
        for (const accrual of deposit.accruals) {
          db.run(`
            INSERT INTO ${SQL_TABLE.DEPOSIT_ACCRUALS} (
              ${SQL_COLUMN.ID}, ${SQL_COLUMN.DEPOSIT_ID}, ${SQL_COLUMN.AMOUNT},
              ${SQL_COLUMN.DUE_DATE}, ${SQL_COLUMN.STATUS}, ${SQL_COLUMN.PAID_DATE},
              ${SQL_COLUMN.NOTE}
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `, toSqlParams(mapDepositAccrualToParams(accrual, deposit.id)));
        }

        // Insert top-ups
        for (const topUp of deposit.topUps) {
          db.run(`
            INSERT INTO ${SQL_TABLE.DEPOSIT_TOPUPS} (
              ${SQL_COLUMN.ID}, ${SQL_COLUMN.DEPOSIT_ID}, ${SQL_COLUMN.AMOUNT},
              ${SQL_COLUMN.DATE}, ${SQL_COLUMN.TIME}, ${SQL_COLUMN.CREATED_AT},
              ${SQL_COLUMN.NOTE}
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `, toSqlParams(mapDepositTopUpToParams(topUp, deposit.id)));
        }

        // Insert withdrawals
        for (const withdrawal of deposit.withdrawals) {
          db.run(`
            INSERT INTO ${SQL_TABLE.DEPOSIT_WITHDRAWALS} (
              ${SQL_COLUMN.ID}, ${SQL_COLUMN.DEPOSIT_ID}, ${SQL_COLUMN.AMOUNT},
              ${SQL_COLUMN.DATE}, ${SQL_COLUMN.TIME}, ${SQL_COLUMN.CREATED_AT},
              ${SQL_COLUMN.NOTE}
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `, toSqlParams(mapDepositWithdrawalToParams(withdrawal, deposit.id)));
        }
      }

      db.run('COMMIT');
      this.invalidate(accountId);
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }

  async addDepositTopUp(accountId: string, depositId: string, topUp: DepositTopUp): Promise<void> {
    const db = this.backend.getDatabase();

    db.run(`
      INSERT INTO ${SQL_TABLE.DEPOSIT_TOPUPS} (
        ${SQL_COLUMN.ID}, ${SQL_COLUMN.DEPOSIT_ID}, ${SQL_COLUMN.AMOUNT},
        ${SQL_COLUMN.DATE}, ${SQL_COLUMN.TIME}, ${SQL_COLUMN.CREATED_AT},
        ${SQL_COLUMN.NOTE}
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, toSqlParams(mapDepositTopUpToParams(topUp, depositId)));

    this.invalidate(accountId);
  }

  async deleteDepositTopUp(accountId: string, depositId: string, topUpId: string): Promise<void> {
    const db = this.backend.getDatabase();

    db.run(`
      DELETE FROM ${SQL_TABLE.DEPOSIT_TOPUPS}
      WHERE ${SQL_COLUMN.ID} = ? AND ${SQL_COLUMN.DEPOSIT_ID} = ?
    `, toSqlParams([topUpId, depositId]));

    this.invalidate(accountId);
  }

  async addDepositWithdrawal(accountId: string, depositId: string, withdrawal: DepositWithdrawal): Promise<void> {
    const db = this.backend.getDatabase();

    db.run(`
      INSERT INTO ${SQL_TABLE.DEPOSIT_WITHDRAWALS} (
        ${SQL_COLUMN.ID}, ${SQL_COLUMN.DEPOSIT_ID}, ${SQL_COLUMN.AMOUNT},
        ${SQL_COLUMN.DATE}, ${SQL_COLUMN.TIME}, ${SQL_COLUMN.CREATED_AT},
        ${SQL_COLUMN.NOTE}
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, toSqlParams(mapDepositWithdrawalToParams(withdrawal, depositId)));

    this.invalidate(accountId);
  }

  async deleteDepositWithdrawal(accountId: string, depositId: string, withdrawalId: string): Promise<void> {
    const db = this.backend.getDatabase();

    db.run(`
      DELETE FROM ${SQL_TABLE.DEPOSIT_WITHDRAWALS}
      WHERE ${SQL_COLUMN.ID} = ? AND ${SQL_COLUMN.DEPOSIT_ID} = ?
    `, toSqlParams([withdrawalId, depositId]));

    this.invalidate(accountId);
  }

  // ── Exchanges CRUD ──────────────────────────────────────────────────────

  async addExchange(accountId: string, exchange: CurrencyExchange): Promise<void> {
    const db = this.backend.getDatabase();

    db.run(`
      INSERT INTO ${SQL_TABLE.CURRENCY_EXCHANGES} (
        ${SQL_COLUMN.ID}, ${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.CREATED_AT},
        ${SQL_COLUMN.DATE}, ${SQL_COLUMN.TIME}, ${SQL_COLUMN.TYPE},
        ${SQL_COLUMN.AMOUNT_IN_ACCOUNT_CURRENCY}, ${SQL_COLUMN.TARGET_CURRENCY},
        ${SQL_COLUMN.TARGET_AMOUNT}, ${SQL_COLUMN.EXCHANGE_RATE}, ${SQL_COLUMN.PROVIDER},
        ${SQL_COLUMN.CATEGORY}, ${SQL_COLUMN.FEE}, ${SQL_COLUMN.NOTE},
        ${SQL_COLUMN.ATTACHMENT_PATH}
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, toSqlParams([
      exchange.id,
      accountId,
      exchange.createdAt,
      exchange.date,
      exchange.time ?? '',
      exchange.type,
      exchange.amountInAccountCurrency,
      exchange.targetCurrency,
      exchange.targetAmount,
      exchange.exchangeRate,
      exchange.provider,
      exchange.category ?? null,
      exchange.fee ?? null,
      exchange.note ?? '',
      exchange.attachmentPath ?? null,
    ]));

    this.invalidate(accountId);
  }

  async updateExchange(accountId: string, exchange: CurrencyExchange): Promise<void> {
    const db = this.backend.getDatabase();

    db.run(`
      UPDATE ${SQL_TABLE.CURRENCY_EXCHANGES}
      SET
        ${SQL_COLUMN.DATE} = ?,
        ${SQL_COLUMN.TIME} = ?,
        ${SQL_COLUMN.TYPE} = ?,
        ${SQL_COLUMN.AMOUNT_IN_ACCOUNT_CURRENCY} = ?,
        ${SQL_COLUMN.TARGET_CURRENCY} = ?,
        ${SQL_COLUMN.TARGET_AMOUNT} = ?,
        ${SQL_COLUMN.EXCHANGE_RATE} = ?,
        ${SQL_COLUMN.PROVIDER} = ?,
        ${SQL_COLUMN.CATEGORY} = ?,
        ${SQL_COLUMN.FEE} = ?,
        ${SQL_COLUMN.NOTE} = ?,
        ${SQL_COLUMN.ATTACHMENT_PATH} = ?
      WHERE ${SQL_COLUMN.ID} = ? AND ${SQL_COLUMN.ACCOUNT_ID} = ?
    `, toSqlParams([
      exchange.date,
      exchange.time ?? '',
      exchange.type,
      exchange.amountInAccountCurrency,
      exchange.targetCurrency,
      exchange.targetAmount,
      exchange.exchangeRate,
      exchange.provider,
      exchange.category ?? null,
      exchange.fee ?? null,
      exchange.note ?? '',
      exchange.attachmentPath ?? null,
      exchange.id,
      accountId,
    ]));

    this.invalidate(accountId);
  }

  async deleteExchange(accountId: string, id: string): Promise<void> {
    const db = this.backend.getDatabase();

    db.run(`
      DELETE FROM ${SQL_TABLE.CURRENCY_EXCHANGES}
      WHERE ${SQL_COLUMN.ID} = ? AND ${SQL_COLUMN.ACCOUNT_ID} = ?
    `, toSqlParams([id, accountId]));

    this.invalidate(accountId);
  }

  async deleteExchangesBatch(accountId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const db = this.backend.getDatabase();
    const placeholders = ids.map(() => '?').join(',');

    db.run(`
      DELETE FROM ${SQL_TABLE.CURRENCY_EXCHANGES}
      WHERE ${SQL_COLUMN.ACCOUNT_ID} = ? AND ${SQL_COLUMN.ID} IN (${placeholders})
    `, toSqlParams([accountId, ...ids]));

    this.invalidate(accountId);
  }

  async saveAllExchanges(accountId: string, exchanges: CurrencyExchange[]): Promise<void> {
    const db = this.backend.getDatabase();

    db.run('BEGIN TRANSACTION');
    try {
      // Delete all existing exchanges
      db.run(`
        DELETE FROM ${SQL_TABLE.CURRENCY_EXCHANGES}
        WHERE ${SQL_COLUMN.ACCOUNT_ID} = ?
      `, toSqlParams([accountId]));

      // Insert all new exchanges
      for (const exchange of exchanges) {
        db.run(`
          INSERT INTO ${SQL_TABLE.CURRENCY_EXCHANGES} (
            ${SQL_COLUMN.ID}, ${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.CREATED_AT},
            ${SQL_COLUMN.DATE}, ${SQL_COLUMN.TIME}, ${SQL_COLUMN.TYPE},
            ${SQL_COLUMN.AMOUNT_IN_ACCOUNT_CURRENCY}, ${SQL_COLUMN.TARGET_CURRENCY},
            ${SQL_COLUMN.TARGET_AMOUNT}, ${SQL_COLUMN.EXCHANGE_RATE}, ${SQL_COLUMN.PROVIDER},
            ${SQL_COLUMN.CATEGORY}, ${SQL_COLUMN.FEE}, ${SQL_COLUMN.NOTE},
            ${SQL_COLUMN.ATTACHMENT_PATH}
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, toSqlParams([
          exchange.id,
          accountId,
          exchange.createdAt,
          exchange.date,
          exchange.time ?? '',
          exchange.type,
          exchange.amountInAccountCurrency,
          exchange.targetCurrency,
          exchange.targetAmount,
          exchange.exchangeRate,
          exchange.provider,
          exchange.category ?? null,
          exchange.fee ?? null,
          exchange.note ?? '',
          exchange.attachmentPath ?? null,
        ]));
      }

      db.run('COMMIT');
      this.invalidate(accountId);
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }

  // ── ViewState ───────────────────────────────────────────────────────────

  async saveViewState(accountId: string, state: Record<string, unknown> | null): Promise<void> {
    const db = this.backend.getDatabase();
    const json = state ? JSON.stringify(state) : '';

    db.run(`
      INSERT OR REPLACE INTO ${SQL_TABLE.VIEW_STATES}
      (${SQL_COLUMN.ACCOUNT_ID}, ${SQL_COLUMN.STATE})
      VALUES (?, ?)
    `, toSqlParams([accountId, json]));
  }

  async loadViewState(accountId: string): Promise<Record<string, unknown> | null> {
    const db = this.backend.getDatabase();
    const stmt = db.prepare(`
      SELECT ${SQL_COLUMN.STATE} FROM ${SQL_TABLE.VIEW_STATES}
      WHERE ${SQL_COLUMN.ACCOUNT_ID} = ?
    `);
    stmt.bind(toSqlParams([accountId]));

    if (stmt.step()) {
      const row = stmt.getAsObject();
      const json = row[SQL_COLUMN.STATE] as string;
      stmt.free();
      return json ? JSON.parse(json) : null;
    }
    stmt.free();
    return null;
  }

  // ── Account management ──────────────────────────────────────────────────

  async deleteAccount(accountId: string): Promise<void> {
    const db = this.backend.getDatabase();
    // CASCADE will delete all related records
    db.run(`
      DELETE FROM ${SQL_TABLE.ACCOUNTS}
      WHERE ${SQL_COLUMN.ID} = ?
    `, toSqlParams([accountId]));
    this.invalidate(accountId);
  }

  async findOrphanedAccounts(activeAccountIds: string[]): Promise<string[]> {
    const db = this.backend.getDatabase();

    if (activeAccountIds.length === 0) {
      // No active accounts, all DB accounts are orphaned
      const stmt = db.prepare(`SELECT ${SQL_COLUMN.ID} FROM ${SQL_TABLE.ACCOUNTS}`);
      const orphans: string[] = [];
      while (stmt.step()) {
        orphans.push(stmt.getAsObject()[SQL_COLUMN.ID] as string);
      }
      stmt.free();
      return orphans;
    }

    const placeholders = activeAccountIds.map(() => '?').join(',');
    const stmt = db.prepare(`
      SELECT ${SQL_COLUMN.ID} FROM ${SQL_TABLE.ACCOUNTS}
      WHERE ${SQL_COLUMN.ID} NOT IN (${placeholders})
    `);
    stmt.bind(toSqlParams(activeAccountIds));

    const orphans: string[] = [];
    while (stmt.step()) {
      orphans.push(stmt.getAsObject()[SQL_COLUMN.ID] as string);
    }
    stmt.free();

    return orphans;
  }

  // ── Linked records (atomic operations) ──────────────────────────────────

  async deleteDebtsWithLinkedRecords(accountId: string, debtIds: string[]): Promise<void> {
    if (debtIds.length === 0) return;

    const db = this.backend.getDatabase();

    db.run('BEGIN TRANSACTION');
    try {
      for (const debtId of debtIds) {
        // Delete linked records
        db.run(`
          DELETE FROM ${SQL_TABLE.RECORDS}
          WHERE ${SQL_COLUMN.ACCOUNT_ID} = ? AND ${SQL_COLUMN.LINKED_ID} = ?
        `, toSqlParams([accountId, debtId]));

        // Delete debt (CASCADE will delete movements)
        db.run(`
          DELETE FROM ${SQL_TABLE.DEBTS}
          WHERE ${SQL_COLUMN.ID} = ? AND ${SQL_COLUMN.ACCOUNT_ID} = ?
        `, toSqlParams([debtId, accountId]));
      }

      db.run('COMMIT');
      this.invalidate(accountId);
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }

  async deleteCreditsWithLinkedRecords(accountId: string, creditIds: string[]): Promise<void> {
    if (creditIds.length === 0) return;

    const db = this.backend.getDatabase();

    db.run('BEGIN TRANSACTION');
    try {
      for (const creditId of creditIds) {
        // Delete linked records
        db.run(`
          DELETE FROM ${SQL_TABLE.RECORDS}
          WHERE ${SQL_COLUMN.ACCOUNT_ID} = ? AND ${SQL_COLUMN.LINKED_ID} = ?
        `, toSqlParams([accountId, creditId]));

        // Delete credit (CASCADE will delete payments)
        db.run(`
          DELETE FROM ${SQL_TABLE.CREDITS}
          WHERE ${SQL_COLUMN.ID} = ? AND ${SQL_COLUMN.ACCOUNT_ID} = ?
        `, toSqlParams([creditId, accountId]));
      }

      db.run('COMMIT');
      this.invalidate(accountId);
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }

  async deleteDepositsWithLinkedRecords(accountId: string, depositIds: string[]): Promise<void> {
    if (depositIds.length === 0) return;

    const db = this.backend.getDatabase();

    db.run('BEGIN TRANSACTION');
    try {
      for (const depositId of depositIds) {
        // Delete linked records
        db.run(`
          DELETE FROM ${SQL_TABLE.RECORDS}
          WHERE ${SQL_COLUMN.ACCOUNT_ID} = ? AND ${SQL_COLUMN.LINKED_ID} = ?
        `, toSqlParams([accountId, depositId]));

        // Delete deposit (CASCADE will delete accruals, topups, withdrawals)
        db.run(`
          DELETE FROM ${SQL_TABLE.DEPOSITS}
          WHERE ${SQL_COLUMN.ID} = ? AND ${SQL_COLUMN.ACCOUNT_ID} = ?
        `, toSqlParams([depositId, accountId]));
      }

      db.run('COMMIT');
      this.invalidate(accountId);
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }
}




