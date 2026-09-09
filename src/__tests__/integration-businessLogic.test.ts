import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FinanceStorage } from '../storage/index';
import { AccountCommands } from '../domain/AccountCommands';
import {
  CreditRecord, DepositRecord, CurrencyExchange, FinanceRecord, DebtRecord,
  CreditType, CreditStatus, DepositType, DepositStatus, DepositAccrualType,
  PaymentStatus, RecordType, CurrencyOperationType, DebtDirection,
} from '../types';
import { calculateTotalInterestPaid } from '../domain/creditCalculations';
import { getCurrencyBalance } from '../domain/currencyBalance';
import { withDayClamped } from '../domain/dateMath';
import { parseAccountId, newAccountId } from '../domain/accountId';
import {
  createCreditPaymentRecord, createCreditReceiptRecord, createDepositRefundRecord,
  findDuplicateLinkedRecords, linkedRecordKey, updateLinkedRecord,
} from '../domain/linkedRecords';
import { parseDeposit, parseExchange, parseCredit } from '../domain/validate';

/**
 * Covers business logic left uncovered by the per-module unit tests:
 * AccountCommands.updateCredit record sync, batch exchange deletion,
 * deposit close/delete refunds, account-level storage operations, and the
 * record-factory / validation branches those paths depend on.
 */

interface MockAdapter {
  exists: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  rename: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  rmdir: ReturnType<typeof vi.fn>;
}

interface MockApp {
  vault: { adapter: MockAdapter };
}

const TR = { receiptNote: 'Получен {name}', paymentNote: 'Платёж {name}', downPaymentNote: 'Первоначальный взнос: ' };

function mkCredit(over: Partial<CreditRecord> = {}): CreditRecord {
  return {
    id: 'cr-1', name: 'Кредит', type: CreditType.CONSUMER, bankName: 'Банк',
    originalAmount: 100_000, currentAmount: 100_000, interestRate: 12,
    monthlyPayment: 10_000, termMonths: 12, startDate: '2026-01-01',
    createdAt: 0, note: '', status: CreditStatus.ACTIVE, earlyRepaymentOption: null,
    payments: [], ...over,
  };
}

function mkDeposit(over: Partial<DepositRecord> = {}): DepositRecord {
  return {
    id: 'dep-1', name: 'Вклад', type: DepositType.TERM, bankName: 'Банк',
    amount: 100_000, interestRate: 8, startDate: '2026-01-01', termMonths: 12,
    accrualType: DepositAccrualType.TO_ACCOUNT, createdAt: 0, note: '', status: DepositStatus.ACTIVE,
    accruals: [], topUps: [], withdrawals: [], ...over,
  };
}

function mkExchange(over: Partial<CurrencyExchange> = {}): CurrencyExchange {
  return {
    id: 'ex-1', createdAt: 0, date: '2026-08-01', time: '10:00', type: CurrencyOperationType.BUY,
    amountInAccountCurrency: 100_000, targetCurrency: '$', targetAmount: 1_000,
    exchangeRate: 100, provider: 'Банк', note: '', ...over,
  };
}

function mkRecord(over: Partial<FinanceRecord> = {}): FinanceRecord {
  return {
    id: 'rec-1', createdAt: 0, date: '2026-08-01', time: '', type: RecordType.EXPENSE,
    amount: 1_000, category: 'Тест', tag: '', payer: '', note: '',
    attachmentPath: '', ...over,
  };
}

describe('Business Logic Integration', () => {
  let storage: FinanceStorage;
  let commands: AccountCommands;
  let mockApp: MockApp;
  const accountId = 'aaaaaaaaaaaa';

  beforeEach(async () => {
    mockApp = {
      vault: {
        adapter: {
          exists: vi.fn().mockResolvedValue(false),
          read: vi.fn().mockResolvedValue(null),
          write: vi.fn().mockResolvedValue(undefined),
          mkdir: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
          rename: vi.fn().mockResolvedValue(undefined),
          list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
          rmdir: vi.fn().mockResolvedValue(undefined),
        },
      },
    };
    storage = new FinanceStorage(mockApp as never, 'test-plugin', '₽');
    await storage.updateMeta(accountId, { name: 'Test', currency: '₽' });
    commands = new AccountCommands(storage, accountId);
  });

  describe('Credit Payment Synchronization', () => {
    it('updateCredit синхронизирует paid платежи с records если нет ручных expense', async () => {
      const credit = mkCredit({
        id: 'cr-1',
        payments: [
          { id: 'p1', dueDate: '2026-02-01', amount: 10_000, status: PaymentStatus.PAID },
          { id: 'p2', dueDate: '2026-03-01', amount: 10_000, status: PaymentStatus.PENDING },
        ],
      });

      await storage.addCredit(accountId, credit);
      await commands.updateCredit(credit, 'loan_payment', TR);

      const data = await storage.load(accountId);
      const linked = data.records.filter(r => r.linkedId === 'cr-1' && r.type === RecordType.EXPENSE && r.isInternal);
      expect(linked).toHaveLength(1);
      expect(linked[0]!.date).toBe('2026-02-01');
      expect(linked[0]!.amount).toBe(10_000);
    });

    it('updateCredit не дублирует expense если вручную создана запись на ту же дату', async () => {
      const credit = mkCredit({
        id: 'cr-2',
        payments: [{ id: 'p1', dueDate: '2026-02-01', amount: 10_000, status: PaymentStatus.PAID }],
      });

      await storage.addCredit(accountId, credit);
      await storage.addRecord(accountId, mkRecord({
        id: 'manual-1', date: '2026-02-01', type: RecordType.EXPENSE, amount: 10_000,
        category: 'loan_payment', isInternal: false, linkedId: 'cr-2',
      }));

      await commands.updateCredit(credit, 'loan_payment', TR);

      const data = await storage.load(accountId);
      const onThatDate = data.records.filter(r => r.linkedId === 'cr-2' && r.date === '2026-02-01');
      expect(onThatDate).toHaveLength(1);
      expect(onThatDate[0]!.isInternal).toBe(false);
    });

    it('updateCredit не создаёт receipt для ипотеки', async () => {
      const mortgage = mkCredit({ id: 'cr-m', type: CreditType.MORTGAGE, originalAmount: 5_000_000 });
      await storage.addCredit(accountId, mortgage);
      await commands.updateCredit(mortgage, 'loan_payment', TR);

      const data = await storage.load(accountId);
      const receipts = data.records.filter(r => r.linkedId === 'cr-m' && r.type === RecordType.INCOME);
      expect(receipts).toHaveLength(0);
    });
  });

  describe('Batch Exchange Deletion', () => {
    it('deleteExchanges удаляет обмены и их связанные записи', async () => {
      await storage.addExchange(accountId, mkExchange({ id: 'ex-1' }));
      await storage.addExchange(accountId, mkExchange({ id: 'ex-2', type: CurrencyOperationType.SELL }));
      await storage.addRecord(accountId, mkRecord({ id: 'r1', linkedId: 'ex-1', isInternal: true }));
      await storage.addRecord(accountId, mkRecord({ id: 'r2', linkedId: 'ex-2', isInternal: true }));

      await commands.deleteExchanges(['ex-1']);

      const data = await storage.load(accountId);
      expect(data.exchanges).toHaveLength(1);
      expect(data.exchanges[0]!.id).toBe('ex-2');
      expect(data.records.find(r => r.linkedId === 'ex-1')).toBeUndefined();
      expect(data.records.find(r => r.linkedId === 'ex-2')).toBeDefined();
    });

    it('deleteExchanges сохраняет записи без linkedId', async () => {
      await storage.addExchange(accountId, mkExchange({ id: 'ex-1' }));
      await storage.addRecord(accountId, mkRecord({ id: 'standalone' }));

      await commands.deleteExchanges(['ex-1']);

      const data = await storage.load(accountId);
      expect(data.records).toHaveLength(1);
      expect(data.records[0]!.id).toBe('standalone');
    });
  });

  describe('Deposit Close and Delete', () => {
    it('closeDeposit переводит вклад в closed и создаёт возврат', async () => {
      const deposit = mkDeposit({ id: 'dep-1' });
      await storage.addDeposit(accountId, deposit);

      await commands.closeDeposit(deposit, 'deposits', 'Закрыт вручную');

      const data = await storage.load(accountId);
      expect(data.deposits[0]!.status).toBe(DepositStatus.CLOSED);

      const refunds = data.records.filter(r => r.linkedId === 'dep-1' && r.type === RecordType.INCOME);
      expect(refunds).toHaveLength(1);
      expect(refunds[0]!.amount).toBe(100_000);
      expect(refunds[0]!.note).toBe('Закрыт вручную');
    });

    it('deleteDeposit активного вклада создаёт возврат БЕЗ linkedId', async () => {
      await storage.addDeposit(accountId, mkDeposit({ id: 'dep-2', amount: 50_000 }));
      await storage.addRecord(accountId, mkRecord({ id: 'open-rec', linkedId: 'dep-2' }));

      await commands.deleteDeposit('dep-2', 'deposits', 'Счёт закрыт');

      const data = await storage.load(accountId);
      expect(data.deposits.find(d => d.id === 'dep-2')).toBeUndefined();

      const refunds = data.records.filter(r => r.type === RecordType.INCOME && r.amount === 50_000);
      expect(refunds).toHaveLength(1);
      // Возврат намеренно отвязан — иначе он был бы удалён как осиротевший
      expect(refunds[0]!.linkedId).toBeUndefined();
      // Записи вклада вычищены
      expect(data.records.find(r => r.linkedId === 'dep-2')).toBeUndefined();
    });

    it('deleteDeposit закрытого вклада не создаёт возврат', async () => {
      await storage.addDeposit(accountId, mkDeposit({ id: 'dep-3', status: DepositStatus.CLOSED }));

      await commands.deleteDeposit('dep-3', 'deposits', 'Возврат');

      const data = await storage.load(accountId);
      expect(data.deposits).toHaveLength(0);
      expect(data.records.filter(r => r.type === RecordType.INCOME)).toHaveLength(0);
    });

    it('deleteDeposit несуществующего вклада не бросает исключение', async () => {
      await expect(commands.deleteDeposit('no-such', 'deposits', 'Возврат')).resolves.toBeUndefined();
    });
  });

  describe('Account-level Storage Operations', () => {
    it('resetAllData очищает все коллекции счёта', async () => {
      await storage.addRecord(accountId, mkRecord({ id: 'r1', category: 'Зарплата' }));
      await storage.addDebt(accountId, {
        id: 'd1', person: 'Друг', amount: 5_000, originalAmount: 5_000, interestRate: 0,
        direction: DebtDirection.BORROWED, date: '2026-01-01', time: '', dueDate: '',
        createdAt: 0, note: '', movements: [],
      } as DebtRecord);
      await storage.addCredit(accountId, mkCredit({ id: 'c1' }));
      await storage.addDeposit(accountId, mkDeposit({ id: 'dep1' }));
      await storage.addExchange(accountId, mkExchange({ id: 'ex1' }));

      await storage.resetAllData(accountId);

      const data = await storage.load(accountId);
      expect(data.records).toHaveLength(0);
      expect(data.debts).toHaveLength(0);
      expect(data.credits).toHaveLength(0);
      expect(data.deposits).toHaveLength(0);
      expect(data.exchanges).toHaveLength(0);
    });

    it('resetAllData пересобирает справочники категорий и плательщиков', async () => {
      await storage.addRecord(accountId, mkRecord({ id: 'r1', category: 'Еда', payer: 'Иван', tag: 'дом' }));

      const before = await storage.load(accountId);
      expect(before.categories).toContain('Еда');

      await storage.resetAllData(accountId);

      const after = await storage.load(accountId);
      expect(after.categories).toHaveLength(0);
      expect(after.payers).toHaveLength(0);
      expect(after.tags).toHaveLength(0);
    });

    it('deleteAccount удаляет папку счёта', async () => {
      await storage.addRecord(accountId, mkRecord({ id: 'r1' }));
      await storage.flush();
      // rmdir в VaultAdapter вызывается только если папка существует
      mockApp.vault.adapter.exists.mockResolvedValue(true);

      await storage.deleteAccount(accountId);

      const rmdir = mockApp.vault.adapter.rmdir;
      expect(rmdir).toHaveBeenCalledTimes(1);
      expect((rmdir.mock.calls[0] as string[])[0]).toContain(accountId);
    });

    it('deleteAccount инвалидирует кеш — данные не возвращаются из памяти', async () => {
      await storage.addRecord(accountId, mkRecord({ id: 'r1' }));
      await storage.flush();

      await storage.deleteAccount(accountId);

      // Диск пуст (read → null), поэтому кеш обязан быть сброшен
      const data = await storage.load(accountId);
      expect(data.records).toHaveLength(0);
    });

    it('findOrphanedAccounts возвращает папки, чьих id нет среди живых блоков', async () => {
      mockApp.vault.adapter.exists.mockResolvedValue(true);
      mockApp.vault.adapter.list.mockResolvedValue({
        files: [],
        folders: [
          '.obsidian/plugins/test-plugin/accounts/aaaaaaaaaaaa',
          '.obsidian/plugins/test-plugin/accounts/bbbbbbbbbbbb',
        ],
      });

      const orphans = await storage.findOrphanedAccounts(new Set(['aaaaaaaaaaaa']));

      expect(orphans).toEqual(['bbbbbbbbbbbb']);
    });
  });

  describe('Helper Functions', () => {
    it('calculateTotalInterestPaid суммирует interestPart из paid платежей', () => {
      const credit = mkCredit({
        payments: [
          { id: 'p1', dueDate: '2026-02-01', amount: 50_000, status: PaymentStatus.PAID, interestPart: 8_333 },
          { id: 'p2', dueDate: '2026-03-01', amount: 50_000, status: PaymentStatus.PAID, interestPart: 7_500 },
          { id: 'p3', dueDate: '2026-04-01', amount: 50_000, status: PaymentStatus.PENDING, interestPart: 6_700 },
        ],
      });

      expect(calculateTotalInterestPaid(credit)).toBe(15_833);
    });

    it('getCurrencyBalance считает баланс по операциям', () => {
      const ops = [
        mkExchange({ type: CurrencyOperationType.BUY, targetCurrency: '$', targetAmount: 100 }),
        mkExchange({ type: CurrencyOperationType.SELL, targetCurrency: '$', targetAmount: 50 }),
        mkExchange({ type: CurrencyOperationType.ADD, targetCurrency: '$', targetAmount: 25, amountInAccountCurrency: 0 }),
      ];

      expect(getCurrencyBalance(ops, '$')).toBe(75);
    });

    it('withDayClamped прижимает день к последнему дню месяца', () => {
      // Вход должен быть валидной датой: parseDateStr отвергает 2026-02-30,
      // и тогда withDayClamped возвращает строку как есть.
      expect(withDayClamped('2026-02-15', 30)).toBe('2026-02-28');
      expect(withDayClamped('2026-04-01', 31)).toBe('2026-04-30');
      expect(withDayClamped('2026-01-01', 31)).toBe('2026-01-31');
      // Невалидная дата проходит насквозь без изменений
      expect(withDayClamped('2026-02-30', 30)).toBe('2026-02-30');
    });

    it('parseAccountId читает строку "id: <hex>" из тела блока', () => {
      expect(parseAccountId('id: abc123def456\nContent')).toEqual({ kind: 'ok', id: 'abc123def456' });
      expect(parseAccountId('  id:  abc123def456  ')).toEqual({ kind: 'ok', id: 'abc123def456' });
      // Не 12 hex-символов → invalid, а не ok
      expect(parseAccountId('id: NOTHEX')).toEqual({ kind: 'invalid', raw: 'NOTHEX' });
      expect(parseAccountId('id:')).toEqual({ kind: 'invalid', raw: '' });
      expect(parseAccountId('No id line')).toEqual({ kind: 'missing' });
    });

    it('newAccountId укорачивает uuid до 12 hex-символов', () => {
      const id = newAccountId('AB12CD34-EF56-7890-ABCD-EF1234567890');
      expect(id).toBe('ab12cd34ef56');
      expect(/^[a-f0-9]{12}$/.test(id)).toBe(true);
    });

    it('createCreditPaymentRecord создаёт internal expense', () => {
      const credit = mkCredit({ id: 'cr-1', bankName: 'Банк' });
      const rec = createCreditPaymentRecord(credit, '2026-02-01', 10_000, 'Платёж', 'loan_payment');

      expect(rec.type).toBe(RecordType.EXPENSE);
      expect(rec.amount).toBe(10_000);
      expect(rec.linkedId).toBe('cr-1');
      expect(rec.isInternal).toBe(true);
      expect(rec.payer).toBe('Банк');
    });

    it('createCreditReceiptRecord создаёт income на дату выдачи', () => {
      const credit = mkCredit({ id: 'cr-2', startDate: '2026-01-15', originalAmount: 200_000 });
      const rec = createCreditReceiptRecord(credit, 'Получено', 'loan_receipt');

      expect(rec.type).toBe(RecordType.INCOME);
      expect(rec.amount).toBe(200_000);
      expect(rec.date).toBe('2026-01-15');
      expect(rec.linkedId).toBe('cr-2');
    });

    it('createDepositRefundRecord создаёт income на дату открытия вклада', () => {
      const deposit = mkDeposit({ id: 'dep-1', amount: 50_000, startDate: '2026-06-01' });
      const rec = createDepositRefundRecord(deposit, 'Возврат', 'deposit_refund');

      expect(rec.type).toBe(RecordType.INCOME);
      expect(rec.amount).toBe(50_000);
      expect(rec.date).toBe('2026-06-01');
      expect(rec.linkedId).toBe('dep-1');
    });

    it('findDuplicateLinkedRecords выявляет дубликаты по ключу', () => {
      const r1 = mkRecord({ id: 'r1', linkedId: 'e1', date: '2026-08-01', type: RecordType.EXPENSE, amount: 1000 });
      const r2 = mkRecord({ id: 'r2', linkedId: 'e1', date: '2026-08-01', type: RecordType.EXPENSE, amount: 1000 });
      const r3 = mkRecord({ id: 'r3', linkedId: 'e2', date: '2026-08-02', type: RecordType.INCOME, amount: 500 });

      const dupes = findDuplicateLinkedRecords([r1, r2, r3]);
      expect(dupes.size).toBe(1);
      expect(dupes.get('e1|2026-08-01|expense|1000|')).toEqual([r1, r2]);
    });

    it('linkedRecordKey создаёт уникальный ключ из record', () => {
      const rec = mkRecord({ linkedId: 'ent', date: '2026-08-01', type: RecordType.EXPENSE, amount: 1000 });
      expect(linkedRecordKey(rec)).toBe('ent|2026-08-01|expense|1000|');
    });

    it('updateLinkedRecord меняет поля нужной записи и не трогает остальные', () => {
      const target = mkRecord({ id: 'r1', createdAt: 123, linkedId: 'ent', amount: 1000 });
      const other = mkRecord({ id: 'r2', linkedId: 'ent', amount: 500 });

      const result = updateLinkedRecord([target, other], 'r1', {
        amount: 2000, note: 'Обновлено', category: 'Новая',
      });

      const updated = result.find(r => r.id === 'r1')!;
      expect(updated.amount).toBe(2000);
      expect(updated.note).toBe('Обновлено');
      expect(updated.category).toBe('Новая');
      // Поля, которые не передавали, сохраняются
      expect(updated.createdAt).toBe(123);
      expect(updated.linkedId).toBe('ent');
      // Вторая запись не изменилась
      expect(result.find(r => r.id === 'r2')!.amount).toBe(500);
    });
  });

  describe('Validation Edge Cases', () => {
    it('parseDeposit возвращает null если id отсутствует', () => {
      expect(parseDeposit({ name: 'Test', amount: 1000 })).toBeNull();
    });

    it('parseExchange отбрасывает только записи без id', () => {
      expect(parseExchange({ date: '2026-08-01', type: CurrencyOperationType.BUY, targetAmount: 100 })).toBeNull();
    });

    it('parseExchange подставляет дефолты для остальных полей, включая targetCurrency', () => {
      // Валидация на границе проверяет только id; пустая валюта — не причина
      // терять запись, иначе битое поле унесло бы всю историю обменов.
      const ex = parseExchange({ id: 'ex-1', date: '2026-08-01', type: CurrencyOperationType.BUY, targetAmount: 100 });
      expect(ex).not.toBeNull();
      expect(ex!.targetCurrency).toBe('');
      expect(ex!.amountInAccountCurrency).toBe(0);
      expect(ex!.provider).toBe('');
    });

    it('parseExchange откатывает неизвестный type на buy', () => {
      const ex = parseExchange({ id: 'ex-2', type: 'nonsense' });
      expect(ex!.type).toBe(CurrencyOperationType.BUY);
    });

    it('parseCredit возвращает null если id отсутствует', () => {
      expect(parseCredit({ name: 'Loan', originalAmount: 100_000 })).toBeNull();
    });
  });
});
