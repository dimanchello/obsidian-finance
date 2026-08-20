import { describe, it, expect } from 'vitest';
import {
  calculateAnnuityPayment,
  calculatePaymentBreakdown,
  generateAnnuitySchedule,
  calculateRemainingPrincipal,
  calculateTotalInterestPaid,
} from '../domain/creditCalculations';
import { CreditRecord } from '../types';

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
      schedule.payments[0]!.status = 'paid';
      schedule.payments[1]!.status = 'paid';
      schedule.payments[2]!.status = 'paid';

      const mockCredit: CreditRecord = {
        id: 'credit-1',
        name: 'Test Mortgage',
        type: 'mortgage',
        bankName: 'Sber',
        originalAmount: 100000,
        currentAmount: 0,
        interestRate: 12,
        monthlyPayment: 8884.88,
        termMonths: 12,
        startDate: '2030-01-01',
        createdAt: 1000,
        note: '',
        status: 'active',
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
      expect(result.payments.every(p => p.status === 'paid')).toBe(true);
      expect(result.currentAmount).toBe(0);
    });
  });
});
