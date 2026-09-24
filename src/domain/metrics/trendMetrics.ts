/**
 * Trend metrics: Time-series calculations for credit burden, assets/liabilities, savings rate
 */
import type { FinanceRecord, CreditRecord, DepositRecord, DebtRecord, CurrencyExchange } from '../../types';
import {
	OVERVIEW_BURDEN_MONTHS,
	OVERVIEW_MAX_TREND_MONTHS
} from '../../types';
import { addMonthsClamped, MONTHS_IN_YEAR } from '../dateMath';
import { getTodayStr } from '../../utils';
import { RecordType, CreditStatus, DebtDirection, DepositStatus, DATE_FORMAT_LENGTH } from '../../constants';
import { calcAssets } from './balanceMetrics';
import { calculatePaymentBreakdown, calculateRemainingPrincipal } from '../creditCalculations';

/**
 * Sentinel span: "all time" is a real selection, distinct from "no filter chosen yet".
 */
export const ALL_TIME_MONTHS = 0;

/** Clamps an all-time span so one stray far-past date cannot produce hundreds of columns. */
function clampMonthSpan(startMonth: string, endMonth: string): string {
	const spanMonths = monthsBetween(startMonth, endMonth);
	if (spanMonths <= OVERVIEW_MAX_TREND_MONTHS) return startMonth;
	return addMonthsClamped(`${endMonth}-01`, -OVERVIEW_MAX_TREND_MONTHS).slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
}

function monthsBetween(startMonth: string, endMonth: string): number {
	const [sy, sm] = startMonth.split('-').map(Number);
	const [ey, em] = endMonth.split('-').map(Number);
	if (sy === undefined || sm === undefined || ey === undefined || em === undefined) return 0;
	return (ey - sy) * MONTHS_IN_YEAR + (em - sm);
}

/** Earliest non-empty `YYYY-MM-DD` across the given lists, or '' when they hold no dates. */
function earliestDate(...dateLists: string[][]): string {
	let earliest = '';
	dateLists.forEach(list => {
		list.forEach(d => {
			if (!d) return;
			if (!earliest || d < earliest) earliest = d;
		});
	});
	return earliest;
}

export function resolveMonthRange(
	dateFrom?: string,
	dateTo?: string,
	asOfDate: string = getTodayStr(),
	defaultMonths = 6,
	allTimeEarliestDate?: string
): string[] {
	let startMonth: string;
	let endMonth: string;

	if (dateFrom && dateTo) {
		startMonth = dateFrom.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
		endMonth = dateTo.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
	} else if (dateFrom) {
		startMonth = dateFrom.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
		endMonth = asOfDate.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
	} else if (dateTo) {
		endMonth = dateTo.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
		startMonth = addMonthsClamped(`${endMonth}-01`, -(defaultMonths - 1)).slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
	} else if (defaultMonths === ALL_TIME_MONTHS) {
		// "All time": span the data itself, not a rolling window.
		endMonth = asOfDate.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
		const earliest = allTimeEarliestDate ? allTimeEarliestDate.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH) : endMonth;
		startMonth = earliest < endMonth ? clampMonthSpan(earliest, endMonth) : endMonth;
	} else {
		endMonth = asOfDate.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
		startMonth = addMonthsClamped(`${endMonth}-01`, -(defaultMonths - 1)).slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
	}

	if (startMonth > endMonth) {
		const tmp = startMonth;
		startMonth = endMonth;
		endMonth = tmp;
	}

	const result: string[] = [];
	let curr = `${startMonth}-01`;
	const end = `${endMonth}-01`;

	while (curr <= end) {
		result.push(curr.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH));
		curr = addMonthsClamped(curr, 1);
	}

	return result;
}

export interface MonthGroup {
	label: string;
	income: number;
	expense: number;
	net: number;
}

/**
 * Group records by month (YYYY-MM) for chart display
 */
export function groupRecordsByMonth(records: FinanceRecord[]): MonthGroup[] {
	const map = new Map<string, { income: number; expense: number }>();

	records.forEach(r => {
		if (r.isInternal) return;
		const key = r.date.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH); // YYYY-MM
		const existing = map.get(key) ?? { income: 0, expense: 0 };
		if (r.type === RecordType.INCOME) {
			existing.income += r.amount;
		} else {
			existing.expense += r.amount;
		}
		map.set(key, existing);
	});

	const sorted = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));

	return sorted.map(([key, { income, expense }]) => ({
		label: key,
		income,
		expense,
		net: income - expense,
	}));
}

export interface CreditBurdenMonth {
	label: string;
	principal: number;
	interest: number;
	total: number;
	burdenPercent: number | null;
}

/**
 * Calculate monthly credit burden breakdown over date range or last N months
 */
export function calcCreditBurdenOverTime(
	credits: CreditRecord[],
	records: FinanceRecord[],
	dateFromOrAsOfDate?: string,
	dateToOrMonths?: string | number,
	asOfDate: string = getTodayStr(),
	defaultMonths: number = OVERVIEW_BURDEN_MONTHS
): CreditBurdenMonth[] {
	let monthsList: string[];
	const allTimeStart = earliestDate(
		credits.map(c => c.startDate),
		records.map(r => r.date)
	);

	if (typeof dateToOrMonths === 'number') {
		monthsList = resolveMonthRange(
			undefined,
			undefined,
			dateFromOrAsOfDate ?? asOfDate,
			dateToOrMonths,
			allTimeStart
		);
	} else {
		monthsList = resolveMonthRange(
			dateFromOrAsOfDate,
			dateToOrMonths,
			asOfDate,
			defaultMonths,
			allTimeStart
		);
	}

	return monthsList.map(month => {
		const monthStart = `${month}-01`;
		const monthEnd = addMonthsClamped(monthStart, 1);
		const label = month;

		const monthIncome = records
			.filter(r => r.type === RecordType.INCOME && !r.isInternal && r.date >= monthStart && r.date < monthEnd)
			.reduce((s, r) => s + r.amount, 0);

		let principal = 0;
		let interest = 0;

		credits.filter(c => c.status === CreditStatus.ACTIVE).forEach(c => {
			const monthPayments = (c.payments ?? []).filter(
				p => (p.dueDate >= monthStart && p.dueDate < monthEnd) ||
					 (p.paidDate && p.paidDate >= monthStart && p.paidDate < monthEnd)
			);

			if (monthPayments.length > 0) {
				monthPayments.forEach(p => {
					let pPart = p.principalPart;
					let iPart = p.interestPart;
					if (pPart === undefined || iPart === undefined) {
						const breakdown = calculatePaymentBreakdown(
							c.currentAmount ?? c.originalAmount,
							p.amount,
							c.interestRate
						);
						pPart = breakdown.principalPart;
						iPart = breakdown.interestPart;
					}
					principal += pPart ?? 0;
					interest += iPart ?? 0;
				});
			} else if (c.startDate < monthEnd && c.monthlyPayment > 0) {
				const breakdown = calculatePaymentBreakdown(
					c.currentAmount ?? c.originalAmount,
					c.monthlyPayment,
					c.interestRate
				);
				principal += breakdown.principalPart;
				interest += breakdown.interestPart;
			}
		});

		const total = principal + interest;
		const burdenPercent = monthIncome > 0 ? (total / monthIncome) * 100 : null;

		return {
			label,
			principal,
			interest,
			total,
			burdenPercent,
		};
	});
}

export interface AssetLiabilityMonth {
	label: string;
	assets: number;
	liabilities: number;
	net: number;
}

/**
 * Calculate assets and liabilities trend over date range or last N months
 */
export function calcAssetsLiabilitiesOverTime(
	deposits: DepositRecord[],
	exchanges: CurrencyExchange[],
	credits: CreditRecord[],
	debts: DebtRecord[],
	dateFromOrAsOfDate?: string,
	dateToOrMonths?: string | number,
	asOfDate: string = getTodayStr(),
	defaultMonths = 6
): AssetLiabilityMonth[] {
	let monthsList: string[];
	const allTimeStart = earliestDate(
		deposits.map(d => d.startDate),
		exchanges.map(e => e.date),
		credits.map(c => c.startDate),
		debts.map(d => d.date)
	);

	if (typeof dateToOrMonths === 'number') {
		monthsList = resolveMonthRange(
			undefined,
			undefined,
			dateFromOrAsOfDate ?? asOfDate,
			dateToOrMonths,
			allTimeStart
		);
	} else {
		monthsList = resolveMonthRange(
			dateFromOrAsOfDate,
			dateToOrMonths,
			asOfDate,
			defaultMonths,
			allTimeStart
		);
	}

	const today = getTodayStr();

	return monthsList.map(month => {
		const monthStart = `${month}-01`;
		const label = month;
		const checkDate = month === today.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH) ? today : monthStart;

		const assets = calcAssets(
			deposits.filter(d => d.status === DepositStatus.ACTIVE && d.startDate <= checkDate),
			exchanges.filter(e => e.date <= checkDate),
			debts.filter(d => d.direction === DebtDirection.LENT && d.date <= checkDate)
		);

		const activeCreditsPrincipal = credits
			.filter(c => c.status === CreditStatus.ACTIVE && c.startDate <= checkDate)
			.reduce((sum, c) => {
				const remaining = calculateRemainingPrincipal(c);
				return sum + remaining;
			}, 0);

		const borrowedDebts = debts
			.filter(d => d.direction === DebtDirection.BORROWED && d.date <= checkDate)
			.reduce((s, d) => s + d.amount, 0);

		const liabilities = activeCreditsPrincipal + borrowedDebts;

		return {
			label,
			assets,
			liabilities,
			net: assets - liabilities,
		};
	});
}

export interface SavingsRateMonth {
	label: string;
	income: number;
	expense: number;
	savings: number;
	savingsRate: number; // in percent
}

/**
 * Calculate monthly savings rate (%) = (income - expense) / income * 100
 */
export function calcSavingsRateOverTime(
	records: FinanceRecord[],
	dateFrom?: string,
	dateTo?: string,
	asOfDate: string = getTodayStr(),
	defaultMonths = 6
): SavingsRateMonth[] {
	const monthsList = resolveMonthRange(
		dateFrom,
		dateTo,
		asOfDate,
		defaultMonths,
		earliestDate(records.filter(r => !r.isInternal).map(r => r.date))
	);

	return monthsList.map(month => {
		const monthStart = `${month}-01`;
		const monthEnd = addMonthsClamped(monthStart, 1);

		const monthRecords = records.filter(
			r => !r.isInternal && r.date >= monthStart && r.date < monthEnd
		);
		const income = monthRecords
			.filter(r => r.type === RecordType.INCOME)
			.reduce((s, r) => s + r.amount, 0);
		const expense = monthRecords
			.filter(r => r.type === RecordType.EXPENSE)
			.reduce((s, r) => s + r.amount, 0);

		const savings = income - expense;
		const savingsRate = income > 0 ? (savings / income) * 100 : 0;

		return {
			label: month,
			income,
			expense,
			savings,
			savingsRate,
		};
	});
}
