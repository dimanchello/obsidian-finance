import {
  AccountData, CreditPayment, CreditRecord, DepositAccrual, DepositRecord, FinanceRecord,
} from '../types';
import { buildCreditSchedule, buildDepositSchedule, type ScheduleDeps } from './schedule';
import { round2 } from './money';
import { parseDateStr, withDayClamped } from './dateMath';
import {
  PaymentStatus, RecordType, DepositStatus, DepositAccrualType, CreditStatus,
} from '../constants';

export interface AutoTxLabels {
  depositInterestCat: string;
  depositInterestNote: string;
  depositRefundCat: string;
  depositRefundNote: string;
  depositOpeningCat: string;
  depositOpenNote: string;
  creditDefaultCat: string;
  creditPaymentNote: string;
}

export interface AutoTxDeps extends ScheduleDeps {
  now: number;
  nowTime: string;
  labels: AutoTxLabels;
}

export interface AutoTxResult {
  records: FinanceRecord[];
  deposits: DepositRecord[];
  credits: CreditRecord[];
  changed: { records: boolean; deposits: boolean; credits: boolean };
}

interface MirrorSpec {
  date: string;
  type: FinanceRecord['type'];
  amount: number;
  category: string;
  payer: string;
  note: string;
  linkedId: string;
}

/**
 * Records mirrored from a deposit/credit are a materialized view keyed by
 * (linkedId, date, type, category) — one rule for every entity type.
 */
function mirrorKey(r: MirrorSpec | FinanceRecord): string {
  return `${r.linkedId ?? ''}|${r.date}|${r.type}|${r.category}`;
}

class RecordMirror {
  private readonly keys: Set<string>;
  readonly records: FinanceRecord[];
  changed = false;

  constructor(existing: FinanceRecord[]) {
    this.records = [...existing];
    this.keys = new Set(existing.filter(r => r.linkedId).map(mirrorKey));
  }

  ensure(spec: MirrorSpec, deps: AutoTxDeps): void {
    const key = mirrorKey(spec);
    if (this.keys.has(key)) return;
    this.keys.add(key);
    this.records.push({
      id: deps.newId(),
      createdAt: deps.now,
      date: spec.date,
      time: deps.nowTime,
      type: spec.type,
      amount: spec.amount,
      category: spec.category,
      tag: '',
      payer: spec.payer,
      note: spec.note,
      attachmentPath: '',
      linkedId: spec.linkedId,
    });
    this.changed = true;
  }
}

function settleDue<T extends { dueDate: string; status: PaymentStatus; paidDate?: string | undefined }>(
  items: T[], today: string,
): { items: T[]; settled: T[] } {
  const settled: T[] = [];
  const next = items.map(item => {
    if (item.status !== PaymentStatus.PENDING || item.dueDate > today) return item;
    const paid = { ...item, status: PaymentStatus.PAID, paidDate: item.dueDate };
    settled.push(paid);
    return paid;
  });
  return { items: settled.length ? next : items, settled };
}

function processDeposit(
  deposit: DepositRecord, mirror: RecordMirror, deps: AutoTxDeps,
): { deposit: DepositRecord; changed: boolean } {
  if (deposit.status !== DepositStatus.ACTIVE) return { deposit, changed: false };

  let changed = false;
  let accruals: DepositAccrual[] = deposit.accruals;
  let amount = deposit.amount;

  if (!accruals.length) {
    accruals = buildDepositSchedule(deposit, deps);
    if (!accruals.length) return { deposit, changed: false };
    changed = true;

    // Create expense record for opening the deposit (transfer to bank)
    // Use a special category to distinguish it from the refund
    mirror.ensure({
      date: deposit.startDate,
      type: RecordType.EXPENSE,
      amount: deposit.amount,
      category: deps.labels.depositOpeningCat,
      payer: deposit.bankName,
      note: `${deps.labels.depositOpenNote} "${deposit.name}"`,
      linkedId: deposit.id,
    }, deps);

    if (deposit.accrualType === DepositAccrualType.CAPITALIZATION) {
      for (const a of accruals) {
        if (a.status === PaymentStatus.PAID) amount = round2(amount + a.amount);
      }
    }
  } else {
    const due = settleDue(accruals, deps.today);
    if (due.settled.length) {
      accruals = due.items;
      changed = true;
      if (deposit.accrualType === DepositAccrualType.CAPITALIZATION) {
        for (const a of due.settled) amount = round2(amount + a.amount);
      }
    }
  }

  if (deposit.accrualType !== DepositAccrualType.CAPITALIZATION) {
    for (const a of accruals) {
      if (a.status !== PaymentStatus.PAID) continue;
      mirror.ensure({
        date: a.dueDate,
        type: RecordType.INCOME,
        amount: a.amount,
        category: deps.labels.depositInterestCat,
        payer: deposit.bankName,
        note: `${deps.labels.depositInterestNote} "${deposit.name}"`,
        linkedId: deposit.id,
      }, deps);
    }
  }

  let status: DepositRecord['status'] = deposit.status;
  const matured = accruals.length > 0 && accruals.every(a => a.status === PaymentStatus.PAID);
  if (matured) {
    status = DepositStatus.CLOSED;
    changed = true;
    // Dated at term end, not at "whenever the note was next opened".
    const lastDueDate = accruals[accruals.length - 1]!.dueDate;
    mirror.ensure({
      date: lastDueDate,
      type: RecordType.INCOME,
      amount,
      category: deps.labels.depositRefundCat,
      payer: deposit.bankName,
      note: `${deps.labels.depositRefundNote} "${deposit.name}"`,
      linkedId: deposit.id,
    }, deps);
  }

  if (!changed) return { deposit, changed: false };
  return { deposit: { ...deposit, accruals, amount, status }, changed: true };
}

function processCredit(
  credit: CreditRecord, mirror: RecordMirror, deps: AutoTxDeps,
): { credit: CreditRecord; changed: boolean } {
  if (credit.status !== CreditStatus.ACTIVE) return { credit, changed: false };

  let changed = false;
  let payments: CreditPayment[] = credit.payments;

  if (!payments.length) {
    payments = buildCreditSchedule(credit, deps);
    if (!payments.length) return { credit, changed: false };
    changed = true;
  } else {
    if (credit.paymentDay !== undefined) {
      const paymentDay = credit.paymentDay; // Capture for type narrowing in callbacks
      const pendingWithWrongDay = payments.filter(p => {
        if (p.status !== PaymentStatus.PENDING) return false;
        const parsed = parseDateStr(p.dueDate);
        return parsed !== null && parsed.day !== paymentDay;
      });
      if (pendingWithWrongDay.length > 0) {
        // Fix only the specific payments with wrong day, preserve manual edits to others
        payments = payments.map(p => {
          if (!pendingWithWrongDay.includes(p)) return p;
          const parsed = parseDateStr(p.dueDate);
          if (!parsed) return p;
          return {
            ...p,
            dueDate: withDayClamped(p.dueDate, paymentDay),
          };
        });
        changed = true;
      }
    }
    const due = settleDue(payments, deps.today);
    if (due.settled.length) {
      payments = due.items;
      changed = true;
    }
  }

  for (const p of payments) {
    if (p.status !== PaymentStatus.PAID) continue;
    mirror.ensure({
      date: p.dueDate,
      type: RecordType.EXPENSE,
      amount: p.amount,
      category: deps.labels.creditDefaultCat,
      payer: credit.bankName,
      note: `${deps.labels.creditPaymentNote} "${credit.name}"`,
      linkedId: credit.id,
    }, deps);
  }

  // "No pending payments left" — not `remainingAmount === 0`, which compares a float sum to zero.
  const status = payments.length > 0 && !payments.some(p => p.status === PaymentStatus.PENDING)
    ? CreditStatus.PAID
    : credit.status;
  if (status !== credit.status) changed = true;

  if (!changed) return { credit, changed: false };
  return { credit: { ...credit, payments, status }, changed: true };
}

/**
 * Advances deposits and credits to `deps.today`: generates missing schedules, settles
 * due items and mirrors them into records. Pure — returns new state, saves nothing.
 */
export function applyAutoTransactions(data: AccountData, deps: AutoTxDeps): AutoTxResult {
  const mirror = new RecordMirror(data.records);

  let depositsChanged = false;
  const deposits = data.deposits.map(d => {
    const res = processDeposit(d, mirror, deps);
    if (res.changed) depositsChanged = true;
    return res.deposit;
  });

  let creditsChanged = false;
  const credits = data.credits.map(c => {
    const res = processCredit(c, mirror, deps);
    if (res.changed) creditsChanged = true;
    return res.credit;
  });

  return {
    records: mirror.records,
    deposits,
    credits,
    changed: { records: mirror.changed, deposits: depositsChanged, credits: creditsChanged },
  };
}
