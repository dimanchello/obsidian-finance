/**
 * Deposit metrics: Interest over time, active deposit progress
 */
import type { DepositRecord } from '../../types';
import { OVERVIEW_TREND_MONTHS, OVERVIEW_MAX_TREND_MONTHS } from '../../types';
import { addMonthsClamped, MS_PER_DAY } from '../dateMath';
import { getTodayStr } from '../../utils';
import { DepositStatus, PaymentStatus, DepositType, DepositAccrualType, DATE_FORMAT_LENGTH } from '../../constants';

/**
 * Sentinel span: "all time" is a real selection, distinct from "no filter chosen yet".
 */
const ALL_TIME_MONTHS = 0;

/** Clamps an all-time span so one stray far-past date cannot produce hundreds of columns. */
function clampMonthSpan(startMonth: string, endMonth: string): string {
	const [sy, sm] = startMonth.split('-').map(Number);
	const [ey, em] = endMonth.split('-').map(Number);
	if (sy === undefined || sm === undefined || ey === undefined || em === undefined) return startMonth;
	const spanMonths = (ey - sy) * 12 + (em - sm);
	if (spanMonths <= OVERVIEW_MAX_TREND_MONTHS) return startMonth;
	return addMonthsClamped(`${endMonth}-01`, -OVERVIEW_MAX_TREND_MONTHS).slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
}

export interface DepositInterestSegment {
	depositId: string;
	depositName: string;
	bankName: string;
	amount: number;
	status: PaymentStatus;
}

export interface DepositInterestMonth {
	monthKey: string;
	label: string;
	paidInterest: number;
	pendingInterest: number;
	total: number;
	cumulativeTotal: number;
	segments: DepositInterestSegment[];
}

export interface ActiveDepositProgress {
	id: string;
	name: string;
	bankName: string;
	amount: number;
	interestRate: number;
	startDate: string;
	endDate: string;
	isDemand: boolean;
	accrualType: DepositAccrualType;
	progressPercent: number;
	/** Interest already paid out (PAID accruals). */
	accruedProfit: number;
	/** Interest still scheduled but not yet paid (PENDING accruals). */
	pendingProfit: number;
	/** Lifetime interest across the whole term: accrued + pending. */
	totalProfit: number;
	totalEstimatedReturn: number;
	remainingDays: number | null;
	nextAccrualDate: string | null;
	nextAccrualAmount: number | null;
}

export function resolveDepositMonthRange(
	deposits: DepositRecord[],
	dateFrom?: string,
	dateTo?: string,
	asOfDate: string = getTodayStr(),
	defaultMonths = OVERVIEW_TREND_MONTHS
): string[] {
	let startMonth: string;
	let endMonth: string;

	const allAccrualDates: string[] = [];
	deposits.forEach(d => {
		(d.accruals ?? []).forEach(a => {
			if (a.paidDate) allAccrualDates.push(a.paidDate);
			if (a.dueDate) allAccrualDates.push(a.dueDate);
		});
	});
	allAccrualDates.sort();

	const earliest = allAccrualDates[0];
	const latest = allAccrualDates[allAccrualDates.length - 1];
	const earliestAccrual = earliest ? earliest.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH) : '';
	const latestAccrual = latest ? latest.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH) : '';
	const asOfCurMonth = asOfDate.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
	const halfMonths = Math.floor(defaultMonths / 2);

	if (dateFrom && dateTo) {
		startMonth = dateFrom.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
		endMonth = dateTo.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
	} else if (dateFrom) {
		startMonth = dateFrom.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
		const fallbackEnd = addMonthsClamped(`${asOfCurMonth}-01`, halfMonths).slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
		endMonth = latestAccrual && latestAccrual > asOfCurMonth ? latestAccrual : fallbackEnd;
	} else if (dateTo) {
		endMonth = dateTo.slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
		const fallbackStart = addMonthsClamped(`${asOfCurMonth}-01`, -halfMonths).slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
		startMonth = earliestAccrual && earliestAccrual < asOfCurMonth ? earliestAccrual : fallbackStart;
	} else if (defaultMonths === ALL_TIME_MONTHS) {
		// "All time": span every accrual, past and scheduled, instead of a window around today.
		endMonth = latestAccrual > asOfCurMonth ? latestAccrual : asOfCurMonth;
		startMonth = earliestAccrual ? clampMonthSpan(earliestAccrual, endMonth) : asOfCurMonth;
	} else {
		const fallbackStart = addMonthsClamped(`${asOfCurMonth}-01`, -halfMonths).slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
		const fallbackEnd = addMonthsClamped(`${asOfCurMonth}-01`, halfMonths).slice(0, DATE_FORMAT_LENGTH.YEAR_MONTH);
		startMonth = earliestAccrual && earliestAccrual < fallbackStart ? earliestAccrual : fallbackStart;
		endMonth = latestAccrual && latestAccrual > fallbackEnd ? latestAccrual : fallbackEnd;
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

export function calcDepositInterestOverTime(
	deposits: DepositRecord[],
	dateFromOrAsOfDate?: string,
	dateToOrMonths?: string | number,
	asOfDate: string = getTodayStr(),
	defaultMonths: number = OVERVIEW_TREND_MONTHS
): DepositInterestMonth[] {
	let monthsList: string[];

	if (typeof dateToOrMonths === 'number') {
		monthsList = resolveDepositMonthRange(
			deposits,
			undefined,
			undefined,
			dateFromOrAsOfDate ?? asOfDate,
			dateToOrMonths
		);
	} else {
		monthsList = resolveDepositMonthRange(
			deposits,
			dateFromOrAsOfDate,
			dateToOrMonths,
			asOfDate,
			defaultMonths
		);
	}

	let runningCumulative = 0;

	return monthsList.map(month => {
		const monthStart = `${month}-01`;
		const monthEnd = addMonthsClamped(monthStart, 1);
		const label = month;

		let paidInterest = 0;
		let pendingInterest = 0;
		const segments: DepositInterestSegment[] = [];

		deposits.forEach(d => {
			(d.accruals ?? []).forEach(a => {
				const accrualDate = a.dueDate;
				if (accrualDate >= monthStart && accrualDate < monthEnd) {
					if (a.status === PaymentStatus.PAID) {
						paidInterest += a.amount;
					} else {
						pendingInterest += a.amount;
					}
					segments.push({
						depositId: d.id,
						depositName: d.name || d.bankName || '—',
						bankName: d.bankName || '—',
						amount: a.amount,
						status: a.status,
					});
				}
			});
		});

		const monthTotal = paidInterest + pendingInterest;
		runningCumulative += monthTotal;

		return {
			monthKey: month,
			label,
			paidInterest,
			pendingInterest,
			total: monthTotal,
			cumulativeTotal: runningCumulative,
			segments,
		};
	});
}

export function calcActiveDepositsProgress(
	deposits: DepositRecord[],
	asOfDate: string = getTodayStr()
): ActiveDepositProgress[] {
	const active = deposits.filter(d => d.status === DepositStatus.ACTIVE);
	const nowMs = new Date(asOfDate).getTime();

	return active.map(d => {
		const isDemand = d.type === DepositType.DEMAND || !d.termMonths || d.termMonths <= 0;
		let endDate = '';
		let progressPercent = 100;
		let remainingDays: number | null = null;

		if (!isDemand && d.startDate) {
			try {
				endDate = addMonthsClamped(d.startDate, d.termMonths);
				const startMs = new Date(d.startDate).getTime();
				const endMs = new Date(endDate).getTime();
				const totalMs = endMs - startMs;
				if (totalMs > 0) {
					progressPercent = Math.min(100, Math.max(0, ((nowMs - startMs) / totalMs) * 100));
				}
				const diffDays = Math.ceil((endMs - nowMs) / MS_PER_DAY);
				remainingDays = Math.max(0, diffDays);
			} catch {
				endDate = '';
				progressPercent = 100;
				remainingDays = null;
			}
		}

		const paidProfit = (d.accruals ?? [])
			.filter(a => a.status === PaymentStatus.PAID)
			.reduce((s, a) => s + a.amount, 0);

		const totalProfit = (d.accruals ?? []).reduce((s, a) => s + a.amount, 0);
		const accruedProfit = paidProfit;
		const pendingProfit = totalProfit - paidProfit;
		const totalEstimatedReturn = d.amount + totalProfit;

		const pendingAccruals = (d.accruals ?? [])
			.filter(a => a.status === PaymentStatus.PENDING && a.dueDate >= asOfDate)
			.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

		const nextAccrual = pendingAccruals[0];
		const nextAccrualDate = nextAccrual ? nextAccrual.dueDate : null;
		const nextAccrualAmount = nextAccrual ? nextAccrual.amount : null;

		return {
			id: d.id,
			name: d.name || d.bankName || '—',
			bankName: d.bankName || '—',
			amount: d.amount,
			interestRate: d.interestRate,
			startDate: d.startDate,
			endDate,
			isDemand,
			accrualType: d.accrualType ?? DepositAccrualType.TO_ACCOUNT,
			progressPercent,
			accruedProfit,
			pendingProfit,
			totalProfit,
			totalEstimatedReturn,
			remainingDays,
			nextAccrualDate,
			nextAccrualAmount,
		};
	});
}
