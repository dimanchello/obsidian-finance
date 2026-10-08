import { describe, it, expect } from 'vitest';
import {
  calculateAnnuityPayment,
  calculatePaymentBreakdown,
  generateAnnuitySchedule,
  calculateRemainingPrincipal,
  calculateTotalInterestPaid,
  calculateCreditEndDate,
  getCreditTypeLabel,
  buildCreditScheduleChartData,
  calculatePeriodInterest,
  getLastPaidPaymentDate,
} from '../domain/creditCalculations';
import { CreditRecord, CreditType, CreditStatus, PaymentStatus, DayCountConvention } from '../types';
import { t } from '../i18n';

describe('creditCalculations', () => {
  describe('calculateAnnuityPayment', () => {
    it('calculates correct monthly payment for 12% annual rate over 12 months', () => {
      // 100 000 at 12% annual rate (1% monthly) for 12 months:
      // A = 100000 * (0.01 * 1.01^12) / (1.01^12 - 1) = 8884.88
      const payment = calculateAnnuityPayment(100000, 12, 12);
      expect(payment).toBe(8884.88);
    });

    it('handles 0% interest rate correctly by dividing principal by months', () => {
      const payment = calculateAnnuityPayment(120000, 0, 12);
      expect(payment).toBe(10000);
    });

    it('returns 0 for zero or negative amount/term', () => {
      expect(calculateAnnuityPayment(0, 15, 12)).toBe(0);
      expect(calculateAnnuityPayment(100000, 15, 0)).toBe(0);
      expect(calculateAnnuityPayment(-1000, 15, 12)).toBe(0);
    });

    it('falls back to linear split when the compound factor overflows', () => {
      // A monstrous rate makes (1 + i)^n non-finite -> linear fallback
      expect(calculateAnnuityPayment(120000, 1e12, 1200)).toBe(100);
    });
  });

  describe('calculatePaymentBreakdown', () => {
    it('splits payment into interest and principal correctly', () => {
      // 100 000 balance at 12% -> 1 000 interest per month
      // Payment 8884.88 -> Interest: 1000, Principal: 7884.88, Remaining: 92115.12
      const breakdown = calculatePaymentBreakdown(100000, 8884.88, 12);
      expect(breakdown.interestPart).toBe(1000);
      expect(breakdown.principalPart).toBe(7884.88);
      expect(breakdown.remainingDebt).toBe(92115.12);
    });

    it('handles 0% interest rate without interest charge', () => {
      const breakdown = calculatePaymentBreakdown(50000, 10000, 0);
      expect(breakdown.interestPart).toBe(0);
      expect(breakdown.principalPart).toBe(10000);
      expect(breakdown.remainingDebt).toBe(40000);
    });

    it('handles last payment capping remaining principal to 0', () => {
      const breakdown = calculatePaymentBreakdown(5000, 5050, 12, true);
      expect(breakdown.principalPart).toBe(5000);
      expect(breakdown.interestPart).toBe(50);
      expect(breakdown.remainingDebt).toBe(0);
    });

    it('returns zeros when nothing is left to repay', () => {
      expect(calculatePaymentBreakdown(0, 5000, 12)).toEqual({
        principalPart: 0,
        interestPart: 0,
        remainingDebt: 0,
      });
      expect(calculatePaymentBreakdown(-100, 5000, 12)).toEqual({
        principalPart: 0,
        interestPart: 0,
        remainingDebt: 0,
      });
    });

    it('clamps rounded principal part to the remaining principal', () => {
      // Rounding of (payment - interest) may exceed the un-rounded remainder
      const breakdown = calculatePaymentBreakdown(99.996, 100.999, 12);
      expect(breakdown.interestPart).toBe(1);
      expect(breakdown.principalPart).toBe(100);
      expect(breakdown.remainingDebt).toBe(0);
    });
  });

  describe('generateAnnuitySchedule', () => {
    it('generates full schedule with monotonically decreasing remaining debt', () => {
      const result = generateAnnuitySchedule({
        originalAmount: 100000,
        interestRate: 12,
        termMonths: 12,
        monthlyPayment: 8884.88,
        startDate: '2026-01-01',
        paymentDay: 15,
      });

      expect(result.payments.length).toBe(12);
      expect(result.payments[0]?.dueDate).toBe('2026-02-15');
      expect(result.payments[0]?.principalPart).toBe(7884.88);
      expect(result.payments[0]?.interestPart).toBe(1000);

      // Remaining debt should decrease each month
      for (let i = 1; i < result.payments.length; i++) {
        expect(result.payments[i]!.remainingDebt!).toBeLessThan(result.payments[i - 1]!.remainingDebt!);
      }
      expect(result.payments[11]!.remainingDebt).toBe(0);
    });

    it('returns empty schedule for non-positive term or amount', () => {
      const zeroTerm = generateAnnuitySchedule({
        originalAmount: 100000,
        interestRate: 12,
        termMonths: 0,
        monthlyPayment: 8884.88,
        startDate: '2026-01-01',
        paymentDay: 15,
      });
      expect(zeroTerm).toEqual({ payments: [], currentAmount: 0 });

      const zeroAmount = generateAnnuitySchedule({
        originalAmount: 0,
        interestRate: 12,
        termMonths: 12,
        monthlyPayment: 8884.88,
        startDate: '2026-01-01',
      });
      expect(zeroAmount).toEqual({ payments: [], currentAmount: 0 });
    });

    it('keeps the start-date day when paymentDay is not provided', () => {
      const result = generateAnnuitySchedule({
        originalAmount: 100000,
        interestRate: 12,
        termMonths: 3,
        monthlyPayment: 34002.21,
        startDate: '2026-01-07',
      });

      expect(result.payments.map(p => p.dueDate)).toEqual(['2026-02-07', '2026-03-07', '2026-04-07']);
    });

    it('preserves ids, amounts, notes and paid status of existing payments', () => {
      const result = generateAnnuitySchedule({
        originalAmount: 100000,
        interestRate: 12,
        termMonths: 3,
        monthlyPayment: 34002.21,
        startDate: '2030-01-01',
        paymentDay: 1,
        existingPayments: [
          {
            id: 'keep-me',
            amount: 40000,
            dueDate: '2030-02-01',
            status: PaymentStatus.PAID,
            paidDate: '2030-01-28',
            note: 'first',
          },
        ],
      });

      const first = result.payments[0]!;
      expect(first.id).toBe('keep-me');
      expect(first.amount).toBe(40000);
      expect(first.status).toBe(PaymentStatus.PAID);
      expect(first.paidDate).toBe('2030-01-28');
      expect(first.note).toBe('first');
      expect(first.interestPart).toBe(1000);
      expect(first.remainingDebt).toBe(61000);

      // Future payments stay pending and carry no paidDate
      expect(result.payments[1]!.status).toBe(PaymentStatus.PENDING);
      expect(result.payments[1]!.paidDate).toBeUndefined();

      // currentAmount reflects the last paid payment's remaining debt
      expect(result.currentAmount).toBe(61000);
    });
  });

  describe('calculateRemainingPrincipal & calculateTotalInterestPaid', () => {
    it('calculates remaining principal based on paid payments', () => {
      const schedule = generateAnnuitySchedule({
        originalAmount: 100000,
        interestRate: 12,
        termMonths: 12,
        monthlyPayment: 8884.88,
        startDate: '2030-01-01',
        paymentDay: 1,
      });

      // Mark first 3 payments as paid
      schedule.payments[0]!.status = PaymentStatus.PAID;
      schedule.payments[1]!.status = PaymentStatus.PAID;
      schedule.payments[2]!.status = PaymentStatus.PAID;

      const mockCredit: CreditRecord = {
        id: 'credit-1',
        name: 'Test Mortgage',
        type: CreditType.MORTGAGE,
        bankName: 'Sber',
        originalAmount: 100000,
        currentAmount: 0,
        interestRate: 12,
        monthlyPayment: 8884.88,
        termMonths: 12,
        startDate: '2030-01-01',
        createdAt: 1000,
        note: '',
        status: CreditStatus.ACTIVE,
        earlyRepaymentOption: null,
        payments: schedule.payments,
      };

      const remaining = calculateRemainingPrincipal(mockCredit);
      expect(remaining).toBe(schedule.payments[2]!.remainingDebt);

      const interestPaid = calculateTotalInterestPaid(mockCredit);
      const expectedInterest = (schedule.payments[0]!.interestPart ?? 0) +
        (schedule.payments[1]!.interestPart ?? 0) +
        (schedule.payments[2]!.interestPart ?? 0);
      expect(interestPaid).toBe(expectedInterest);
    });

    it('auto-marks past dates as paid and computes currentAmount to remaining principal', () => {
      const result = generateAnnuitySchedule({
        originalAmount: 100000,
        interestRate: 12,
        termMonths: 12,
        monthlyPayment: 8884.88,
        startDate: '2020-01-01',
        paymentDay: 1,
      });

      // All payments in 2020 are in the past, so all 12 should be paid
      expect(result.payments.every(p => p.status === PaymentStatus.PAID)).toBe(true);
      expect(result.currentAmount).toBe(0);
    });

    it('recomputes interest dynamically for legacy payments without interestPart', () => {
      // Legacy payments store neither interestPart nor remainingDebt
      const legacyCredit: CreditRecord = {
        id: 'credit-legacy',
        name: 'Legacy Credit',
        type: CreditType.CONSUMER,
        bankName: 'Old Bank',
        originalAmount: 100000,
        currentAmount: 0,
        interestRate: 12,
        monthlyPayment: 8884.88,
        termMonths: 12,
        startDate: '2020-01-01',
        createdAt: 1000,
        note: '',
        status: CreditStatus.ACTIVE,
        earlyRepaymentOption: null,
        payments: [
          { id: 'p1', amount: 8884.88, dueDate: '2020-02-01', status: PaymentStatus.PAID },
          { id: 'p2', amount: 8884.88, dueDate: '2020-03-01', status: PaymentStatus.PAID },
          { id: 'p3', amount: 8884.88, dueDate: '2020-04-01', status: PaymentStatus.PENDING },
        ],
      };

      // Payment 1: interest = 100000 * 0.01 = 1000, remaining = 92115.12
      // Payment 2: interest = 92115.12 * 0.01 = 921.15
      expect(calculateTotalInterestPaid(legacyCredit)).toBe(1921.15);

      // Remaining principal also falls back to simulation
      expect(calculateRemainingPrincipal(legacyCredit)).toBe(84151.39);
    });

    it('returns 0 for closed credits and full amount when nothing is paid', () => {
      const base: CreditRecord = {
        id: 'credit-2',
        name: 'Closed Credit',
        type: CreditType.CONSUMER,
        bankName: 'Bank',
        originalAmount: 50000,
        currentAmount: 0,
        interestRate: 10,
        monthlyPayment: 5000,
        termMonths: 12,
        startDate: '2030-01-01',
        createdAt: 1000,
        note: '',
        status: CreditStatus.PAID,
        earlyRepaymentOption: null,
        payments: [],
      };

      expect(calculateRemainingPrincipal(base)).toBe(0);
      expect(calculateRemainingPrincipal({ ...base, status: CreditStatus.ACTIVE, originalAmount: 0 })).toBe(0);
      expect(calculateRemainingPrincipal({
        ...base,
        status: CreditStatus.ACTIVE,
        payments: [{ id: 'p1', amount: 5000, dueDate: '2030-02-01', status: PaymentStatus.PENDING }],
      })).toBe(50000);
    });
  });

  describe('calculateCreditEndDate', () => {
    it('calculates end date correctly based on startDate and termMonths', () => {
      const credit: CreditRecord = {
        id: 'c1',
        name: 'Credit 1',
        type: CreditType.CONSUMER,
        bankName: 'Bank',
        originalAmount: 100000,
        currentAmount: 100000,
        interestRate: 10,
        monthlyPayment: 1000,
        termMonths: 12,
        startDate: '2025-01-15',
        createdAt: 1000,
        note: '',
        status: CreditStatus.ACTIVE,
        earlyRepaymentOption: null,
        payments: [],
      };
      expect(calculateCreditEndDate(credit)).toBe('2026-01-15');
    });
  });

  describe('getCreditTypeLabel', () => {
    it('returns localized label for each credit type', () => {
      const ru = t('ru');
      expect(getCreditTypeLabel(CreditType.MORTGAGE, ru)).toBe(ru.creditTypeMortgage);
      expect(getCreditTypeLabel(CreditType.AUTO, ru)).toBe(ru.creditTypeAuto);
      expect(getCreditTypeLabel(CreditType.CONSUMER, ru)).toBe(ru.creditTypeConsumer);
    });
  });

  describe('buildCreditScheduleChartData', () => {
    it('builds schedule chart items with breakdown and remaining debt', () => {
      const credit: CreditRecord = {
        id: 'c1',
        name: 'Credit 1',
        type: CreditType.CONSUMER,
        bankName: 'Bank',
        originalAmount: 100000,
        currentAmount: 100000,
        interestRate: 12,
        monthlyPayment: 8884.88,
        termMonths: 2,
        startDate: '2026-01-01',
        createdAt: 1000,
        note: '',
        status: CreditStatus.ACTIVE,
        earlyRepaymentOption: null,
        payments: [
          {
            id: 'p1',
            amount: 8884.88,
            dueDate: '2026-02-01',
            status: PaymentStatus.PAID,
          },
          {
            id: 'p2',
            amount: 8884.88,
            dueDate: '2026-03-01',
            status: PaymentStatus.PENDING,
          },
        ],
      };

      const chartData = buildCreditScheduleChartData(credit);
      expect(chartData).toHaveLength(2);
      expect(chartData[0]?.id).toBe('p1');
      expect(chartData[0]?.label).toBe('2026-02');
      expect(chartData[0]?.dueDate).toBe('2026-02-01');
      expect(chartData[0]?.total).toBe(8884.88);
      expect(chartData[0]?.interestPart).toBe(1000);
      expect(chartData[0]?.principalPart).toBe(7884.88);
      expect(chartData[0]?.remainingDebt).toBe(92115.12);
      expect(chartData[0]?.status).toBe(PaymentStatus.PAID);

      expect(chartData[1]?.id).toBe('p2');
      expect(chartData[1]?.label).toBe('2026-03');
      expect(chartData[1]?.status).toBe(PaymentStatus.PENDING);
    });
  });

  describe('calculatePeriodInterest', () => {
    it('calculates interest for 31 days in a non-leap year (ACT/365)', () => {
      // 1 000 000 * 0.12 * (31 / 365) = 10191.78
      const interest = calculatePeriodInterest(1000000, 12, '2025-01-01', '2025-02-01');
      expect(interest).toBe(10191.78);
    });

    it('calculates interest for 29 days in a leap year (ACT/366)', () => {
      // 2024 is a leap year (366 days). Feb 1 to March 1 = 29 days.
      // 1 000 000 * 0.12 * (29 / 366) = 9508.20
      const interest = calculatePeriodInterest(1000000, 12, '2024-02-01', '2024-03-01');
      expect(interest).toBe(9508.2);
    });

    it('calculates interest crossing leap and non-leap year boundary properly', () => {
      // 2024-12-15 to 2025-01-15:
      // 17 days in 2024 (/366) + 14 days in 2025 (/365)
      // 1 000 000 * 0.12 * (17 / 366 + 14 / 365) = 1 000 000 * 0.12 * (0.046448087 + 0.038356164)
      // = 120 000 * 0.084804251 = 10176.51
      const interest = calculatePeriodInterest(1000000, 12, '2024-12-15', '2025-01-15');
      expect(interest).toBe(10176.51);
    });

    it('returns 0 for non-positive principal or rate or inverted dates', () => {
      expect(calculatePeriodInterest(0, 12, '2025-01-01', '2025-02-01')).toBe(0);
      expect(calculatePeriodInterest(1000000, 0, '2025-01-01', '2025-02-01')).toBe(0);
      expect(calculatePeriodInterest(1000000, 12, '2025-02-01', '2025-01-01')).toBe(0);
    });
  });

  describe('calculatePaymentBreakdown with period', () => {
    it('uses period interest when period is specified', () => {
      const period = { fromDate: '2025-01-01', toDate: '2025-02-01' };
      const breakdown = calculatePaymentBreakdown(1000000, 20000, 12, false, period);
      expect(breakdown.interestPart).toBe(10191.78);
      expect(breakdown.principalPart).toBe(9808.22);
      expect(breakdown.remainingDebt).toBe(990191.78);
    });
  });

  describe('generateAnnuitySchedule with DayCountConvention.ACTUAL', () => {
    it('calculates different interest for 31-day vs 28-day months under actual convention', () => {
      const schedule = generateAnnuitySchedule({
        originalAmount: 1000000,
        interestRate: 12,
        termMonths: 3,
        monthlyPayment: 340000,
        startDate: '2025-01-15',
        paymentDay: 15,
        dayCountConvention: DayCountConvention.ACTUAL,
      });

      // Payment 1: 2025-01-15 to 2025-02-15 = 31 days -> interest = 10191.78
      expect(schedule.payments[0]?.interestPart).toBe(10191.78);

      // Payment 2: 2025-02-15 to 2025-03-15 = 28 days (non-leap Feb) -> interest on reduced principal
      const remainingP1 = schedule.payments[0]!.remainingDebt!;
      const expectedP2Interest = calculatePeriodInterest(remainingP1, 12, '2025-02-15', '2025-03-15');
      expect(schedule.payments[1]?.interestPart).toBe(expectedP2Interest);
    });

    it('preserves existing paid payments and their remaining debt', () => {
      const existingPaid = {
        id: 'p-paid',
        amount: 50000,
        dueDate: '2025-02-15',
        status: PaymentStatus.PAID,
        paidDate: '2025-02-15',
        principalPart: 40000,
        interestPart: 10000,
        remainingDebt: 960000,
      };

      const schedule = generateAnnuitySchedule({
        originalAmount: 1000000,
        interestRate: 12,
        termMonths: 2,
        monthlyPayment: 50000,
        startDate: '2025-01-15',
        paymentDay: 15,
        existingPayments: [existingPaid],
        dayCountConvention: DayCountConvention.ACTUAL,
      });

      expect(schedule.payments[0]?.remainingDebt).toBe(960000);
      expect(schedule.payments[0]?.principalPart).toBe(40000);
      expect(schedule.payments[0]?.interestPart).toBe(10000);

      // Next payment calculates from 960000
      const expectedNextInterest = calculatePeriodInterest(960000, 12, '2025-02-15', '2025-03-15');
      expect(schedule.payments[1]?.interestPart).toBe(expectedNextInterest);
    });
  });

  describe('getLastPaidPaymentDate', () => {
    it('returns credit startDate when there are no payments or no paid payments', () => {
      const credit: CreditRecord = {
        id: 'c1',
        name: 'Credit',
        type: CreditType.CONSUMER,
        bankName: 'Bank',
        originalAmount: 100000,
        currentAmount: 100000,
        interestRate: 10,
        monthlyPayment: 1000,
        termMonths: 12,
        startDate: '2025-01-15',
        createdAt: 1000,
        note: '',
        status: CreditStatus.ACTIVE,
        earlyRepaymentOption: null,
        payments: [
          { id: 'p1', amount: 1000, dueDate: '2025-02-15', status: PaymentStatus.PENDING },
        ],
      };
      expect(getLastPaidPaymentDate(credit)).toBe('2025-01-15');
    });

    it('returns the latest paid payment date', () => {
      const credit: CreditRecord = {
        id: 'c1',
        name: 'Credit',
        type: CreditType.CONSUMER,
        bankName: 'Bank',
        originalAmount: 100000,
        currentAmount: 100000,
        interestRate: 10,
        monthlyPayment: 1000,
        termMonths: 12,
        startDate: '2025-01-15',
        createdAt: 1000,
        note: '',
        status: CreditStatus.ACTIVE,
        earlyRepaymentOption: null,
        payments: [
          { id: 'p1', amount: 1000, dueDate: '2025-02-15', status: PaymentStatus.PAID, paidDate: '2025-02-14' },
          { id: 'p2', amount: 1000, dueDate: '2025-03-15', status: PaymentStatus.PAID, paidDate: '2025-03-15' },
          { id: 'p3', amount: 1000, dueDate: '2025-04-15', status: PaymentStatus.PENDING },
        ],
      };
      expect(getLastPaidPaymentDate(credit)).toBe('2025-03-15');
    });
  });
});
