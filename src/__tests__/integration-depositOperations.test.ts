import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FinanceStorage } from '../storage/index';
import {
  DepositRecord, DepositTopUp, DepositWithdrawal,
  DepositType, DepositStatus, DepositAccrualType, PaymentStatus,
} from '../types';

/**
 * Integration tests for deposit top-up and withdrawal operations.
 *
 * These tests verify that:
 * 1. Top-ups increase deposit amount and are recorded
 * 2. Withdrawals decrease deposit amount without going negative
 * 3. Deleting a top-up/withdrawal reverses its effect on the amount
 * 4. Future accruals are recalculated after balance changes
 * 5. Operations survive flush/load cycles
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

function mkDeposit(over: Partial<DepositRecord> = {}): DepositRecord {
  return {
    id: 'dep-1',
    name: 'Накопительный',
    type: DepositType.SAVINGS,
    bankName: 'Тест Банк',
    amount: 100_000,
    interestRate: 12,
    startDate: '2026-01-15',
    termMonths: 12,
    accrualType: DepositAccrualType.TO_ACCOUNT,
    createdAt: Date.now(),
    note: '',
    status: DepositStatus.ACTIVE,
    accruals: [],
    topUps: [],
    withdrawals: [],
    ...over,
  };
}

function mkTopUp(over: Partial<DepositTopUp> = {}): DepositTopUp {
  return {
    id: 'top-1',
    amount: 20_000,
    date: '2026-02-01',
    time: '12:00',
    createdAt: Date.now(),
    note: '',
    ...over,
  };
}

function mkWithdrawal(over: Partial<DepositWithdrawal> = {}): DepositWithdrawal {
  return {
    id: 'wd-1',
    amount: 15_000,
    date: '2026-02-10',
    time: '12:00',
    createdAt: Date.now(),
    note: '',
    ...over,
  };
}

describe('Deposit Operations Integration Tests', () => {
  let storage: FinanceStorage;
  let mockApp: MockApp;
  const accountId = 'test-account';

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
    storage = new FinanceStorage(mockApp as any, 'test-plugin', '₽');

    await storage.load(accountId);
    await storage.updateMeta(accountId, { name: 'Test Account', currency: '₽' });
  });

  describe('Top-Up Operations', () => {
    it('пополнение увеличивает сумму вклада и попадает в topUps', async () => {
      await storage.addDeposit(accountId, mkDeposit());
      await storage.addDepositTopUp(accountId, 'dep-1', mkTopUp({ amount: 20_000 }));
      await storage.flush();

      const data = await storage.load(accountId);
      const deposit = data.deposits[0];

      expect(deposit.amount).toBe(120_000);
      expect(deposit.topUps.length).toBe(1);
      expect(deposit.topUps[0].amount).toBe(20_000);
    });

    it('несколько пополнений суммируются', async () => {
      await storage.addDeposit(accountId, mkDeposit());
      await storage.addDepositTopUp(accountId, 'dep-1', mkTopUp({ id: 'top-1', amount: 10_000 }));
      await storage.addDepositTopUp(accountId, 'dep-1', mkTopUp({ id: 'top-2', amount: 5_500 }));
      await storage.addDepositTopUp(accountId, 'dep-1', mkTopUp({ id: 'top-3', amount: 4_500 }));
      await storage.flush();

      const data = await storage.load(accountId);
      const deposit = data.deposits[0];

      expect(deposit.amount).toBe(120_000);
      expect(deposit.topUps.length).toBe(3);
    });

    it('удаление пополнения откатывает сумму вклада', async () => {
      await storage.addDeposit(accountId, mkDeposit());
      await storage.addDepositTopUp(accountId, 'dep-1', mkTopUp({ amount: 20_000 }));
      await storage.deleteDepositTopUp(accountId, 'dep-1', 'top-1');
      await storage.flush();

      const data = await storage.load(accountId);
      const deposit = data.deposits[0];

      expect(deposit.amount).toBe(100_000);
      expect(deposit.topUps.length).toBe(0);
    });

    it('удаление несуществующего пополнения не меняет сумму', async () => {
      await storage.addDeposit(accountId, mkDeposit());
      await storage.addDepositTopUp(accountId, 'dep-1', mkTopUp({ amount: 20_000 }));
      await storage.deleteDepositTopUp(accountId, 'dep-1', 'no-such-id');
      await storage.flush();

      const data = await storage.load(accountId);
      expect(data.deposits[0].amount).toBe(120_000);
      expect(data.deposits[0].topUps.length).toBe(1);
    });

    it('дробные суммы пополнений не накапливают ошибку float', async () => {
      await storage.addDeposit(accountId, mkDeposit({ amount: 0.1 }));
      await storage.addDepositTopUp(accountId, 'dep-1', mkTopUp({ id: 'top-1', amount: 0.2 }));
      await storage.flush();

      const data = await storage.load(accountId);
      // round2 must keep this at 0.3, not 0.30000000000000004
      expect(data.deposits[0].amount).toBe(0.3);
    });

    it('пополнение несуществующего вклада не создаёт запись', async () => {
      await storage.addDeposit(accountId, mkDeposit());
      await storage.addDepositTopUp(accountId, 'no-such-deposit', mkTopUp());
      await storage.flush();

      const data = await storage.load(accountId);
      expect(data.deposits.length).toBe(1);
      expect(data.deposits[0].topUps.length).toBe(0);
      expect(data.deposits[0].amount).toBe(100_000);
    });
  });

  describe('Withdrawal Operations', () => {
    it('снятие уменьшает сумму вклада и попадает в withdrawals', async () => {
      await storage.addDeposit(accountId, mkDeposit());
      await storage.addDepositWithdrawal(accountId, 'dep-1', mkWithdrawal({ amount: 15_000 }));
      await storage.flush();

      const data = await storage.load(accountId);
      const deposit = data.deposits[0];

      expect(deposit.amount).toBe(85_000);
      expect(deposit.withdrawals.length).toBe(1);
      expect(deposit.withdrawals[0].amount).toBe(15_000);
    });

    it('снятие больше остатка обнуляет вклад, но не уводит в минус', async () => {
      await storage.addDeposit(accountId, mkDeposit({ amount: 10_000 }));
      await storage.addDepositWithdrawal(accountId, 'dep-1', mkWithdrawal({ amount: 50_000 }));
      await storage.flush();

      const data = await storage.load(accountId);
      expect(data.deposits[0].amount).toBe(0);
    });

    it('удаление снятия возвращает сумму на вклад', async () => {
      await storage.addDeposit(accountId, mkDeposit());
      await storage.addDepositWithdrawal(accountId, 'dep-1', mkWithdrawal({ amount: 15_000 }));
      await storage.deleteDepositWithdrawal(accountId, 'dep-1', 'wd-1');
      await storage.flush();

      const data = await storage.load(accountId);
      const deposit = data.deposits[0];

      expect(deposit.amount).toBe(100_000);
      expect(deposit.withdrawals.length).toBe(0);
    });

    it('удаление снятия после обнуления возвращает только снятую сумму', async () => {
      // Amount was clamped to 0 on withdrawal; deletion adds back the full
      // withdrawal amount — documenting the asymmetry so it is not "fixed" silently.
      await storage.addDeposit(accountId, mkDeposit({ amount: 10_000 }));
      await storage.addDepositWithdrawal(accountId, 'dep-1', mkWithdrawal({ amount: 50_000 }));
      await storage.deleteDepositWithdrawal(accountId, 'dep-1', 'wd-1');
      await storage.flush();

      const data = await storage.load(accountId);
      expect(data.deposits[0].amount).toBe(50_000);
      expect(data.deposits[0].withdrawals.length).toBe(0);
    });

    it('снятие несуществующего вклада ничего не меняет', async () => {
      await storage.addDeposit(accountId, mkDeposit());
      await storage.addDepositWithdrawal(accountId, 'no-such-deposit', mkWithdrawal());
      await storage.flush();

      const data = await storage.load(accountId);
      expect(data.deposits[0].amount).toBe(100_000);
      expect(data.deposits[0].withdrawals.length).toBe(0);
    });
  });

  describe('Combined Operations', () => {
    it('пополнения и снятия применяются в сумме', async () => {
      await storage.addDeposit(accountId, mkDeposit());
      await storage.addDepositTopUp(accountId, 'dep-1', mkTopUp({ id: 'top-1', amount: 30_000 }));
      await storage.addDepositWithdrawal(accountId, 'dep-1', mkWithdrawal({ id: 'wd-1', amount: 10_000 }));
      await storage.addDepositTopUp(accountId, 'dep-1', mkTopUp({ id: 'top-2', amount: 5_000 }));
      await storage.flush();

      const data = await storage.load(accountId);
      const deposit = data.deposits[0];

      // 100_000 + 30_000 - 10_000 + 5_000
      expect(deposit.amount).toBe(125_000);
      expect(deposit.topUps.length).toBe(2);
      expect(deposit.withdrawals.length).toBe(1);
    });

    it('операции над разными вкладами не пересекаются', async () => {
      await storage.addDeposit(accountId, mkDeposit({ id: 'dep-1', amount: 100_000 }));
      await storage.addDeposit(accountId, mkDeposit({ id: 'dep-2', amount: 200_000 }));

      await storage.addDepositTopUp(accountId, 'dep-1', mkTopUp({ id: 'top-1', amount: 10_000 }));
      await storage.addDepositWithdrawal(accountId, 'dep-2', mkWithdrawal({ id: 'wd-1', amount: 20_000 }));
      await storage.flush();

      const data = await storage.load(accountId);
      const dep1 = data.deposits.find(d => d.id === 'dep-1');
      const dep2 = data.deposits.find(d => d.id === 'dep-2');

      expect(dep1?.amount).toBe(110_000);
      expect(dep1?.withdrawals.length).toBe(0);
      expect(dep2?.amount).toBe(180_000);
      expect(dep2?.topUps.length).toBe(0);
    });
  });

  describe('Accrual Recalculation', () => {
    it('пополнение пересчитывает будущие начисления под новую сумму', async () => {
      const accruals = [
        { id: 'a1', amount: 1_000, dueDate: '2026-02-15', status: PaymentStatus.PAID, paidDate: '2026-02-15' },
        { id: 'a2', amount: 1_000, dueDate: '2099-01-15', status: PaymentStatus.PENDING },
      ];
      await storage.addDeposit(accountId, mkDeposit({ accruals }));

      // Baseline recalc with a negligible top-up, so both sides come from recalcFutureAccruals
      await storage.addDepositTopUp(accountId, 'dep-1', mkTopUp({ id: 'top-0', amount: 1 }));
      await storage.flush();
      const before = (await storage.load(accountId)).deposits[0].accruals
        .find(a => a.status === PaymentStatus.PENDING);
      expect(before).toBeDefined();

      await storage.addDepositTopUp(accountId, 'dep-1', mkTopUp({ id: 'top-1', amount: 100_000 }));
      await storage.flush();

      const data = await storage.load(accountId);
      const deposit = data.deposits[0];

      // Paid accrual is history and must not move
      const paid = deposit.accruals.find(a => a.id === 'a1');
      expect(paid?.amount).toBe(1_000);
      expect(paid?.status).toBe(PaymentStatus.PAID);

      // Doubling the principal must raise the pending accrual
      const after = deposit.accruals.find(a => a.status === PaymentStatus.PENDING);
      expect(after).toBeDefined();
      expect(after!.amount).toBeGreaterThan(before!.amount);
    });

    it('снятие пересчитывает будущие начисления вниз', async () => {
      // recalcFutureAccruals overwrites pending amounts from the principal, so the
      // baseline has to come from a recalc too — compare two recalcs, not a literal.
      const accruals = [
        { id: 'a1', amount: 1_000, dueDate: '2099-01-15', status: PaymentStatus.PENDING },
      ];
      await storage.addDeposit(accountId, mkDeposit({ accruals }));

      await storage.addDepositWithdrawal(accountId, 'dep-1', mkWithdrawal({ id: 'wd-1', amount: 1 }));
      await storage.flush();

      const before = (await storage.load(accountId)).deposits[0].accruals
        .find(a => a.status === PaymentStatus.PENDING);
      expect(before).toBeDefined();

      await storage.addDepositWithdrawal(accountId, 'dep-1', mkWithdrawal({ id: 'wd-2', amount: 50_000 }));
      await storage.flush();

      const after = (await storage.load(accountId)).deposits[0].accruals
        .find(a => a.status === PaymentStatus.PENDING);
      expect(after).toBeDefined();
      expect(after!.amount).toBeLessThan(before!.amount);
    });
  });

  describe('Persistence', () => {
    it('пополнения и снятия сохраняются в deposits.json', async () => {
      await storage.addDeposit(accountId, mkDeposit());
      await storage.addDepositTopUp(accountId, 'dep-1', mkTopUp({ amount: 20_000 }));
      await storage.addDepositWithdrawal(accountId, 'dep-1', mkWithdrawal({ amount: 5_000 }));
      await storage.flush();

      const writeCalls = (mockApp.vault.adapter.write as any).mock.calls as [string, string][];
      const depositsWrite = writeCalls.filter(c => c[0].includes('deposits.json')).pop();

      expect(depositsWrite).toBeDefined();
      const saved = JSON.parse(depositsWrite![1]) as DepositRecord[];

      expect(saved.length).toBe(1);
      expect(saved[0].amount).toBe(115_000);
      expect(saved[0].topUps.length).toBe(1);
      expect(saved[0].withdrawals.length).toBe(1);
    });

    it('повторная загрузка отдаёт те же суммы', async () => {
      await storage.addDeposit(accountId, mkDeposit());
      await storage.addDepositTopUp(accountId, 'dep-1', mkTopUp({ amount: 20_000 }));
      await storage.flush();

      const first = await storage.load(accountId);
      const second = await storage.load(accountId);

      expect(second.deposits[0].amount).toBe(first.deposits[0].amount);
      expect(second.deposits[0].topUps.length).toBe(first.deposits[0].topUps.length);
    });
  });
});
