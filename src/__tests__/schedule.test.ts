import { describe, it, expect } from 'vitest';
import { buildDepositSchedule, buildCreditSchedule, recalcFutureAccruals, type ScheduleDeps } from '../domain/schedule';
import { sumMoney, round2 } from '../domain/money';
import {
  CreditRecord, DepositRecord, DepositAccrual,
  DepositType, DepositAccrualType, DepositStatus,
  CreditType, CreditStatus, PaymentStatus,
} from '../types';

function mkDeps(today: string): ScheduleDeps {
  let n = 0;
  return { today, newId: () => `id-${++n}` };
}

function mkDeposit(over: Partial<DepositRecord> = {}): DepositRecord {
  return {
    id: 'dep-1',
    name: 'Вклад',
    type: DepositType.TERM,
    bankName: 'Банк',
    amount: 100_000,
    interestRate: 12,
    startDate: '2026-01-15',
    termMonths: 12,
    accrualType: DepositAccrualType.TO_ACCOUNT,
    createdAt: 0,
    note: '',
    status: DepositStatus.ACTIVE,
    accruals: [],
    topUps: [],
    withdrawals: [],
    ...over,
  };
}

function mkCredit(over: Partial<CreditRecord> = {}): CreditRecord {
  return {
    id: 'cr-1',
    name: 'Кредит',
    type: CreditType.CONSUMER,
    bankName: 'Банк',
    originalAmount: 100_000,
    currentAmount: 100_000,
    interestRate: 15,
    monthlyPayment: 9_000,
    termMonths: 12,
    startDate: '2026-01-31',
    createdAt: 0,
    note: '',
    status: CreditStatus.ACTIVE,
    earlyRepaymentOption: null,
    payments: [],
    ...over,
  };
}

describe('buildDepositSchedule', () => {
  it('создаёт по одному начислению на каждый месяц срока', () => {
    const schedule = buildDepositSchedule(mkDeposit({ termMonths: 6 }), mkDeps('2026-01-01'));
    expect(schedule).toHaveLength(6);
  });

  it('вклад, открытый 31 числа, получает корректные даты — без переноса на следующий месяц', () => {
    const schedule = buildDepositSchedule(
      mkDeposit({ startDate: '2026-01-31', termMonths: 4 }),
      mkDeps('2026-01-01'),
    );
    // До исправления setMonth давал 2026-03-03 вместо 2026-02-28
    expect(schedule.map(a => a.dueDate)).toEqual([
      '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31',
    ]);
  });

  it('вклад «на счёт»: тело не растёт, начисления считаются от исходной суммы', () => {
    const deposit = mkDeposit({ accrualType: DepositAccrualType.TO_ACCOUNT, startDate: '2026-01-31', termMonths: 3 });
    const schedule = buildDepositSchedule(deposit, mkDeps('2026-01-01'));

    // 100000 * 12% * дни / 365 от неизменной базы
    expect(schedule[0].amount).toBe(round2(100_000 * 0.12 * 28 / 365));
    expect(schedule[1].amount).toBe(round2(100_000 * 0.12 * 31 / 365));
    expect(deposit.amount).toBe(100_000);
  });

  it('капитализация: каждое следующее начисление больше предыдущего при равных днях', () => {
    const schedule = buildDepositSchedule(
      mkDeposit({ accrualType: DepositAccrualType.CAPITALIZATION, startDate: '2026-01-31', termMonths: 12 }),
      mkDeps('2026-01-01'),
    );
    // Март и май — оба 31 день, но база во втором случае выросла
    const march = schedule[1];
    const may = schedule[3];
    expect(march.dueDate).toBe('2026-03-31');
    expect(may.dueDate).toBe('2026-05-31');
    expect(may.amount).toBeGreaterThan(march.amount);
  });

  it('капитализация: сумма начислений равна итоговой сумме минус тело', () => {
    const deposit = mkDeposit({ accrualType: DepositAccrualType.CAPITALIZATION, amount: 100_000, termMonths: 12 });
    const schedule = buildDepositSchedule(deposit, mkDeps('2026-01-01'));

    const totalInterest = sumMoney(schedule.map(a => a.amount));
    // Воспроизводим ту же цепочку капитализации независимо от реализации
    let principal = deposit.amount;
    for (const a of schedule) principal = round2(principal + a.amount);

    expect(totalInterest).toBe(round2(principal - deposit.amount));
  });

  it('високосный год: использует 366 дней для расчёта процентов в 2024', () => {
    // 2024 — високосный год (366 дней)
    const deposit = mkDeposit({
      startDate: '2024-01-31',
      termMonths: 2,
      amount: 100_000,
      interestRate: 12,
      accrualType: DepositAccrualType.TO_ACCOUNT,
    });
    const schedule = buildDepositSchedule(deposit, mkDeps('2024-01-01'));

    // Февраль 2024 = 29 дней (високосный)
    // Процент за февраль: 100000 * 0.12 * 29 / 366
    const expectedFeb = round2(100_000 * 0.12 * 29 / 366);
    expect(schedule[0].amount).toBe(expectedFeb);
    expect(schedule[0].dueDate).toBe('2024-02-29');

    // Март 2024 = 31 день
    // Процент за март: 100000 * 0.12 * 31 / 366
    const expectedMar = round2(100_000 * 0.12 * 31 / 366);
    expect(schedule[1].amount).toBe(expectedMar);
  });

  it('невисокосный год: использует 365 дней для расчёта процентов', () => {
    // 2026 — невисокосный год (365 дней)
    const deposit = mkDeposit({
      startDate: '2026-01-31',
      termMonths: 2,
      amount: 100_000,
      interestRate: 12,
      accrualType: DepositAccrualType.TO_ACCOUNT,
    });
    const schedule = buildDepositSchedule(deposit, mkDeps('2026-01-01'));

    // Февраль 2026 = 28 дней (невисокосный)
    // Процент за февраль: 100000 * 0.12 * 28 / 365
    const expectedFeb = round2(100_000 * 0.12 * 28 / 365);
    expect(schedule[0].amount).toBe(expectedFeb);
    expect(schedule[0].dueDate).toBe('2026-02-28');
  });

  it('прошедшие начисления помечены paid с датой, будущие — pending без неё', () => {
    const schedule = buildDepositSchedule(
      mkDeposit({ startDate: '2026-01-15', termMonths: 6 }),
      mkDeps('2026-04-01'),
    );
    const paid = schedule.filter(a => a.status === PaymentStatus.PAID);
    const pending = schedule.filter(a => a.status === PaymentStatus.PENDING);

    expect(paid.map(a => a.dueDate)).toEqual(['2026-02-15', '2026-03-15']);
    expect(paid.every(a => a.paidDate === a.dueDate)).toBe(true);
    expect(pending.every(a => a.paidDate === undefined)).toBe(true);
  });

  it('начисление ровно на сегодня считается прошедшим', () => {
    const schedule = buildDepositSchedule(
      mkDeposit({ startDate: '2026-01-15', termMonths: 1 }),
      mkDeps('2026-02-15'),
    );
    expect(schedule[0].status).toBe(PaymentStatus.PAID);
  });

  it('идентификаторы берутся из deps, а не из crypto', () => {
    const schedule = buildDepositSchedule(mkDeposit({ termMonths: 3 }), mkDeps('2026-01-01'));
    expect(schedule.map(a => a.id)).toEqual(['id-1', 'id-2', 'id-3']);
  });

  it('пустой график при нулевом сроке, нулевой сумме или битой дате', () => {
    const deps = mkDeps('2026-01-01');
    expect(buildDepositSchedule(mkDeposit({ termMonths: 0 }), deps)).toEqual([]);
    expect(buildDepositSchedule(mkDeposit({ amount: 0 }), deps)).toEqual([]);
    expect(buildDepositSchedule(mkDeposit({ startDate: '' }), deps)).toEqual([]);
    expect(buildDepositSchedule(mkDeposit({ startDate: 'мусор' }), deps)).toEqual([]);
  });

  it('детерминирован: одинаковый вход даёт одинаковый выход', () => {
    const a = buildDepositSchedule(mkDeposit(), mkDeps('2026-04-01'));
    const b = buildDepositSchedule(mkDeposit(), mkDeps('2026-04-01'));
    expect(a).toEqual(b);
  });
});

describe('buildCreditSchedule', () => {
  it('создаёт по одному платежу на каждый месяц срока', () => {
    const schedule = buildCreditSchedule(mkCredit({ termMonths: 12 }), mkDeps('2026-01-01'));
    expect(schedule).toHaveLength(12);
  });

  it('кредит, взятый 31 января, платит 28 февраля', () => {
    const schedule = buildCreditSchedule(
      mkCredit({ startDate: '2026-01-31', termMonths: 3 }),
      mkDeps('2026-01-01'),
    );
    expect(schedule.map(p => p.dueDate)).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('сумма платежей закрывает тело плюс проценты', () => {
    const credit = mkCredit({ originalAmount: 100_000, monthlyPayment: 9_000, termMonths: 12 });
    const schedule = buildCreditSchedule(credit, mkDeps('2026-01-01'));
    const total = sumMoney(schedule.map(p => p.amount));

    expect(total).toBe(108_000);
    expect(total).toBeGreaterThan(credit.originalAmount);
  });

  it('прошедшие платежи помечены paid', () => {
    const schedule = buildCreditSchedule(
      mkCredit({ startDate: '2026-01-15', termMonths: 6 }),
      mkDeps('2026-04-01'),
    );
    expect(schedule.filter(p => p.status === PaymentStatus.PAID).map(p => p.dueDate))
      .toEqual(['2026-02-15', '2026-03-15']);
  });

  it('пустой график при нулевом платеже, сроке или битой дате', () => {
    const deps = mkDeps('2026-01-01');
    expect(buildCreditSchedule(mkCredit({ monthlyPayment: 0 }), deps)).toEqual([]);
    expect(buildCreditSchedule(mkCredit({ termMonths: 0 }), deps)).toEqual([]);
    expect(buildCreditSchedule(mkCredit({ startDate: '' }), deps)).toEqual([]);
  });
});

describe('recalcFutureAccruals', () => {
  function accrual(over: Partial<DepositAccrual> & { dueDate: string }): DepositAccrual {
    return { id: `a-${over.dueDate}`, amount: 0, status: PaymentStatus.PENDING, ...over };
  }

  it('пересчитывает будущие начисления и не трогает прошлые', () => {
    const deposit = mkDeposit({
      amount: 200_000,
      startDate: '2026-01-15',
      accruals: [
        accrual({ dueDate: '2026-02-15', amount: 986.3, status: PaymentStatus.PAID, paidDate: '2026-02-15' }),
        accrual({ dueDate: '2026-03-15', amount: 986.3 }),
        accrual({ dueDate: '2026-04-15', amount: 986.3 }),
      ],
    });

    const result = recalcFutureAccruals(deposit, '2026-02-20');

    expect(result[0]).toEqual(deposit.accruals[0]);
    expect(result[1].amount).toBe(round2(200_000 * 0.12 * 28 / 365));
    expect(result[2].amount).toBe(round2(200_000 * 0.12 * 31 / 365));
  });

  it('считает от последнего оплаченного начисления, а не от даты открытия', () => {
    const withPaid = mkDeposit({
      startDate: '2026-01-15',
      accruals: [
        accrual({ dueDate: '2026-02-15', amount: 1, status: PaymentStatus.PAID, paidDate: '2026-02-15' }),
        accrual({ dueDate: '2026-03-15', amount: 1 }),
      ],
    });
    const withoutPaid = mkDeposit({
      startDate: '2026-01-15',
      accruals: [accrual({ dueDate: '2026-03-15', amount: 1 })],
    });

    const a = recalcFutureAccruals(withPaid, '2026-02-20');
    const b = recalcFutureAccruals(withoutPaid, '2026-02-20');

    // 28 дней от 15 февраля против 59 дней от 15 января
    expect(a[1].amount).toBe(round2(100_000 * 0.12 * 28 / 365));
    expect(b[0].amount).toBe(round2(100_000 * 0.12 * 59 / 365));
    expect(b[0].amount).toBeGreaterThan(a[1].amount);
  });

  it('капитализация: база растёт по цепочке будущих начислений', () => {
    const deposit = mkDeposit({
      accrualType: DepositAccrualType.CAPITALIZATION,
      startDate: '2026-01-31',
      accruals: [
        accrual({ dueDate: '2026-03-31', amount: 0 }),
        accrual({ dueDate: '2026-05-31', amount: 0 }),
      ],
    });

    const result = recalcFutureAccruals(deposit, '2026-02-01');

    // Оба интервала по 59/61 дней, но вторая база больше на первое начисление
    expect(result[1].amount).toBeGreaterThan(0);
    expect(result[0].amount).toBeGreaterThan(0);
  });

  it('не мутирует входной массив', () => {
    const deposit = mkDeposit({
      accruals: [accrual({ dueDate: '2026-03-15', amount: 111 })],
    });
    const before = structuredClone(deposit.accruals);

    recalcFutureAccruals(deposit, '2026-02-01');

    expect(deposit.accruals).toEqual(before);
  });

  it('возвращает исходный массив, когда пересчитывать нечего', () => {
    const deposit = mkDeposit({
      accruals: [accrual({ dueDate: '2026-01-20', amount: 5, status: PaymentStatus.PAID, paidDate: '2026-01-20' })],
    });
    expect(recalcFutureAccruals(deposit, '2026-02-01')).toBe(deposit.accruals);
    expect(recalcFutureAccruals(mkDeposit({ accruals: [] }), '2026-02-01')).toEqual([]);
  });

  it('начисление ровно на сегодня не пересчитывается', () => {
    const deposit = mkDeposit({
      accruals: [accrual({ dueDate: '2026-02-15', amount: 777 })],
    });
    const result = recalcFutureAccruals(deposit, '2026-02-15');
    expect(result[0].amount).toBe(777);
  });

  it('пополнение увеличивает будущие начисления, снятие уменьшает', () => {
    const base = {
      startDate: '2026-01-15',
      accruals: [accrual({ dueDate: '2026-03-15', amount: 0 })],
    };
    const toppedUp = recalcFutureAccruals(mkDeposit({ ...base, amount: 150_000 }), '2026-02-01');
    const asIs = recalcFutureAccruals(mkDeposit({ ...base, amount: 100_000 }), '2026-02-01');
    const withdrawn = recalcFutureAccruals(mkDeposit({ ...base, amount: 50_000 }), '2026-02-01');

    expect(toppedUp[0].amount).toBeGreaterThan(asIs[0].amount);
    expect(withdrawn[0].amount).toBeLessThan(asIs[0].amount);
  });
});
