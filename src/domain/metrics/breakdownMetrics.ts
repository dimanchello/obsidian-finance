/**
 * Breakdown metrics: Category/tag/payer breakdowns, debt aggregations, filtering utilities
 */
import type { FinanceRecord, DebtRecord, OverviewGroupBy } from '../../types';
import { RecordType, DebtDirection, DATE_FORMAT_LENGTH } from '../../constants';
import { getDebtRepaid, getDebtWithInterest } from '../debtCalculations';
import { isoWeek } from '../dateMath';

export function getISOWeekString(dateStr: string): string {
  const iso = isoWeek(dateStr);
  if (!iso) return dateStr;
  return `${iso.year}-W${String(iso.week).padStart(2, '0')}`;
}

export interface DebtBreakdownItem {
  person: string;
  lent: number;       // мне должны (текущий остаток)
  lentTotal: number;  // начальная сумма долга
  lentRepaid: number; // сколько уже возвращено
  lentRepaidPct: number; // % возврата (0–100)
  borrowed: number;   // я должен (текущий остаток)
  borrowedTotal: number; // начальная сумма
  borrowedRepaid: number; // сколько уже выплачено
  borrowedRepaidPct: number; // % возврата (0–100)
  net: number;        // lent - borrowed
}

/**
 * Aggregates debts per person with repayment progress
 */
export function calcDebtsBreakdown(debts: DebtRecord[]): DebtBreakdownItem[] {
  const map = new Map<
    string,
    {
      lent: number;
      lentTotal: number;
      lentRepaid: number;
      borrowed: number;
      borrowedTotal: number;
      borrowedRepaid: number;
    }
  >();

  debts.forEach(d => {
    const person = d.person.trim() || '—';
    const cur = map.get(person) ?? {
      lent: 0,
      lentTotal: 0,
      lentRepaid: 0,
      borrowed: 0,
      borrowedTotal: 0,
      borrowedRepaid: 0,
    };

    const repaid = getDebtRepaid(d);
    const withInterest = getDebtWithInterest(d);
    const total = withInterest > 0 ? withInterest : (d.originalAmount || d.amount);

    if (d.direction === DebtDirection.LENT) {
      cur.lent += d.amount;
      cur.lentTotal += total;
      cur.lentRepaid += repaid;
    } else {
      cur.borrowed += d.amount;
      cur.borrowedTotal += total;
      cur.borrowedRepaid += repaid;
    }
    map.set(person, cur);
  });

  const result: DebtBreakdownItem[] = [];
  map.forEach((val, person) => {
    const lentRepaidPct =
      val.lentTotal > 0
        ? Math.min(100, Math.max(0, Math.round((val.lentRepaid / val.lentTotal) * 100)))
        : 0;
    const borrowedRepaidPct =
      val.borrowedTotal > 0
        ? Math.min(100, Math.max(0, Math.round((val.borrowedRepaid / val.borrowedTotal) * 100)))
        : 0;

    result.push({
      person,
      lent: val.lent,
      lentTotal: val.lentTotal,
      lentRepaid: val.lentRepaid,
      lentRepaidPct,
      borrowed: val.borrowed,
      borrowedTotal: val.borrowedTotal,
      borrowedRepaid: val.borrowedRepaid,
      borrowedRepaidPct,
      net: val.lent - val.borrowed,
    });
  });

  return result.sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.person.localeCompare(b.person));
}

export function filterRecordsByDateRange(
  records: FinanceRecord[],
  dateFrom?: string,
  dateTo?: string,
): FinanceRecord[] {
  return records.filter(r => {
    if (dateFrom && r.date < dateFrom) return false;
    if (dateTo && r.date > dateTo) return false;
    return true;
  });
}

export interface BreakdownItem {
  key: string;
  income: number;
  expense: number;
  net: number;
  total: number;
}

export function calcGroupBreakdown(
  records: FinanceRecord[],
  groupBy: OverviewGroupBy,
  emptyLabel = '—',
): BreakdownItem[] {
  const map = new Map<string, { income: number; expense: number }>();

  records.forEach(r => {
    if (r.isInternal) return;
    let key = '';
    if (groupBy === 'category') {
      key = r.category.trim();
    } else if (groupBy === 'tag') {
      key = r.tag.trim();
    } else if (groupBy === 'payer') {
      key = r.payer.trim();
    } else if (groupBy === 'year') {
      key = r.date ? r.date.slice(0, DATE_FORMAT_LENGTH.YEAR) : emptyLabel;
    } else if (groupBy === 'month') {
      key = r.date ? r.date.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH) : emptyLabel;
    } else if (groupBy === 'week') {
      key = r.date ? getISOWeekString(r.date) : emptyLabel;
    }
    if (!key) key = emptyLabel;

    const existing = map.get(key) ?? { income: 0, expense: 0 };
    if (r.type === RecordType.INCOME) {
      existing.income += r.amount;
    } else {
      existing.expense += r.amount;
    }
    map.set(key, existing);
  });

  const items: BreakdownItem[] = [];
  map.forEach(({ income, expense }, key) => {
    items.push({
      key,
      income,
      expense,
      net: income - expense,
      total: income + expense,
    });
  });

  if (groupBy === 'year' || groupBy === 'month' || groupBy === 'week') {
    return items.sort((a, b) => b.key.localeCompare(a.key));
  }

  return items.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}
