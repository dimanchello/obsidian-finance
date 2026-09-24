/**
 * Metrics barrel export
 */

// Balance metrics
export {
  calcNetBalance,
  calcAssets,
  calcLiabilities,
  calcCreditBurden,
  calcUpcomingPayments,
} from './balanceMetrics';

// Trend metrics
export {
  ALL_TIME_MONTHS,
  resolveMonthRange,
  groupRecordsByMonth,
  calcCreditBurdenOverTime,
  calcAssetsLiabilitiesOverTime,
  calcSavingsRateOverTime,
} from './trendMetrics';

export type {
  MonthGroup,
  CreditBurdenMonth,
  AssetLiabilityMonth,
  SavingsRateMonth,
} from './trendMetrics';

// Deposit metrics
export {
  resolveDepositMonthRange,
  calcDepositInterestOverTime,
  calcActiveDepositsProgress,
} from './depositMetrics';

export type {
  DepositInterestSegment,
  DepositInterestMonth,
  ActiveDepositProgress,
} from './depositMetrics';

// Breakdown metrics
export {
  getISOWeekString,
  calcDebtsBreakdown,
  filterRecordsByDateRange,
  calcGroupBreakdown,
} from './breakdownMetrics';

export type {
  DebtBreakdownItem,
  BreakdownItem,
} from './breakdownMetrics';
