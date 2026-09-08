import { describe, it, expect } from 'vitest';
import {
  calculateAnnuityPayment,
  calculatePaymentBreakdown,
  generateAnnuitySchedule,
  calculateRemainingPrincipal,
  calculateTotalInterestPaid,
} from '../domain/creditCalculations';
import { CreditRecord, CreditType, CreditStatus, PaymentStatus } from '../types';

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
});
