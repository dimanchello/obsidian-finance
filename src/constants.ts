/**
 * Single source of truth for the string literals that describe entity state.
 *
 * The union types in `types.ts` are derived from these objects, and the runtime
 * validators in `domain/validate.ts` read their values — so a status exists in
 * exactly one place. Adding a member here widens the type and the validator at
 * the same time; there is no second list to keep in sync.
 *
 * Compared against `x.status === CreditStatus.PAID` rather than `'paid'`: the
 * literal form already type-checks, but the named form is greppable and renames
 * in one edit.
 */

type ValueOf<T> = T[keyof T];

// ── Records ───────────────────────────────────────────────────────────────

export const RecordType = {
  INCOME: 'income',
  EXPENSE: 'expense',
} as const;
export type RecordType = ValueOf<typeof RecordType>;

// ── Debts ─────────────────────────────────────────────────────────────────

/** `LENT` = money owed to the user, `BORROWED` = money the user owes. */
export const DebtDirection = {
  LENT: 'lent',
  BORROWED: 'borrowed',
} as const;
export type DebtDirection = ValueOf<typeof DebtDirection>;

export const DebtMovementType = {
  BORROW: 'borrow',
  REPAY: 'repay',
} as const;
export type DebtMovementType = ValueOf<typeof DebtMovementType>;

// ── Credits ───────────────────────────────────────────────────────────────

export const CreditType = {
  CONSUMER: 'consumer',
  AUTO: 'auto',
  MORTGAGE: 'mortgage',
} as const;
export type CreditType = ValueOf<typeof CreditType>;

/** A credit ends as `PAID`; a deposit ends as `CLOSED`. Not interchangeable. */
export const CreditStatus = {
  ACTIVE: 'active',
  PAID: 'paid',
} as const;
export type CreditStatus = ValueOf<typeof CreditStatus>;

export const EarlyRepaymentOption = {
  TERM: 'term',
  AMOUNT: 'amount',
} as const;
export type EarlyRepaymentOption = ValueOf<typeof EarlyRepaymentOption>;

/** How the credit down payment was entered: an absolute sum or a share of the price. */
export const DownPaymentType = {
  AMOUNT: 'amount',
  PERCENT: 'percent',
} as const;
export type DownPaymentType = ValueOf<typeof DownPaymentType>;

// ── Deposits ──────────────────────────────────────────────────────────────

export const DepositType = {
  TERM: 'term',
  DEMAND: 'demand',
  SAVINGS: 'savings',
} as const;
export type DepositType = ValueOf<typeof DepositType>;

export const DepositStatus = {
  ACTIVE: 'active',
  CLOSED: 'closed',
} as const;
export type DepositStatus = ValueOf<typeof DepositStatus>;

export const DepositAccrualType = {
  TO_ACCOUNT: 'to_account',
  CAPITALIZATION: 'capitalization',
} as const;
export type DepositAccrualType = ValueOf<typeof DepositAccrualType>;

// ── Schedules (credit payments and deposit accruals share these) ──────────

export const PaymentStatus = {
  PENDING: 'pending',
  PAID: 'paid',
} as const;
export type PaymentStatus = ValueOf<typeof PaymentStatus>;

// ── Currency exchange ─────────────────────────────────────────────────────

export const CurrencyOperationType = {
  BUY: 'buy',
  SELL: 'sell',
  ADD: 'add',
  SPEND: 'spend',
} as const;
export type CurrencyOperationType = ValueOf<typeof CurrencyOperationType>;

// ── Account Modes / Tabs ──────────────────────────────────────────────────

export const AccountMode = {
  OVERVIEW: 'overview',
  RECORDS: 'records',
  DEBTS: 'debts',
  CREDITS: 'credits',
  DEPOSITS: 'deposits',
  CURRENCY: 'currency',
} as const;
export type AccountMode = ValueOf<typeof AccountMode>;

// ── Markdown Code Block Languages ─────────────────────────────────────────

export const CODE_BLOCK_LANGUAGES = [
  'finance-account',
  'finance-manager',
] as const;
export type CodeBlockLanguage = (typeof CODE_BLOCK_LANGUAGES)[number];

// ── Locale formatting ─────────────────────────────────────────────────────

/** Default locale for number formatting. Centralized to avoid hardcoded 'ru-RU' strings. */
export const DEFAULT_NUMBER_LOCALE = 'ru-RU';

// ── CSS Classes ───────────────────────────────────────────────────────────

/** CSS class names used in DOM manipulation and component rendering. */
export const CSS_CLASS = {
  // State modifiers
  ACTIVE: 'active',
  IS_ACTIVE: 'is-active',
  IS_VISIBLE: 'is-visible',
  IS_HIDDEN: 'is-hidden',

  // Type modifiers
  INCOME: 'income',
  EXPENSE: 'expense',
  INCOME_COLOR: 'income-color',
  EXPENSE_COLOR: 'expense-color',
  LENT: 'lent',
  BORROWED: 'borrowed',

  // Top-20 UI components
  FINANCE_FIELD_LABEL: 'finance-field-label',
  FINANCE_INPUT: 'finance-input',
  FINANCE_FILTER_LABEL: 'finance-filter-label',
  FINANCE_TD: 'finance-td',
  FINANCE_SECTION_TITLE: 'finance-section-title',
  FINANCE_FILTER_INPUT: 'finance-filter-input',
  FINANCE_MOV_TABLE: 'finance-mov-table',
  FINANCE_FILTER_SELECT: 'finance-filter-select',
  FINANCE_EMPTY_TEXT: 'finance-empty-text',
  FINANCE_CHART_TITLE: 'finance-chart-title',
  FINANCE_BTN_SAVE: 'finance-btn-save',
  FINANCE_BTN_CANCEL: 'finance-btn-cancel',
  FINANCE_EMPTY_SUB: 'finance-empty-sub',
  FINANCE_ACTION_BTN: 'finance-action-btn',
  FINANCE_DELETE_BTN: 'finance-delete-btn',
  FINANCE_ACCENT_BTN: 'finance-accent-btn',
  FINANCE_ADD_BTN: 'finance-add-btn',
  FINANCE_CHART_CLICKABLE: 'finance-chart-clickable',
  FINANCE_TH: 'finance-th',
  FINANCE_CHECKBOX: 'finance-checkbox',
  BTN_ICON: 'btn-icon',
} as const;

// ── Date Format Lengths ───────────────────────────────────────────────────

/** String slice indices for extracting date/time components from ISO strings. */
export const DATE_FORMAT_LENGTH = {
  ISO_DATE: 10,        // YYYY-MM-DD
  YEAR_MONTH: 7,       // YYYY-MM
  YEAR: 4,             // YYYY
  TIME: 5,             // HH:MM
  DATETIME_MIN: 16,    // YYYY-MM-DDTHH:MM
} as const;

// ── String Separators ─────────────────────────────────────────────────────

/** Delimiters used in date/time/path parsing and formatting. */
export const STRING_SEPARATOR = {
  DATE: '-',
  DATETIME: 'T',
  TIME: ':',
  PATH: '/',
  DOT: '.',
  COMMA: ',',
  NEWLINE: '\n',
  SPACE: ' ',
} as const;

/** Decimal separator conventions: user input vs normalized form for parseFloat. */
export const DECIMAL_SEPARATOR = {
  INPUT: ',',          // User input: 1,5
  NORMALIZED: '.',     // JS parseFloat: 1.5
} as const;

// ── Sort Directions ───────────────────────────────────────────────────────

export const SORT_DIR = {
  ASC: 'asc' as const,
  DESC: 'desc' as const,
} as const;

// ── Math Constants ────────────────────────────────────────────────────────

export const MONTHS_IN_QUARTER = 3;
export const MONTHS_IN_YEAR = 12;
export const DECIMAL_PLACES = 2;
export const DIGIT_CHARS = '0123456789';

// ── HTML Input Attributes ─────────────────────────────────────────────────

export const INPUT_ATTR = {
  INPUTMODE_DECIMAL: 'decimal',
  PLACEHOLDER_ZERO: '0',
  AUTOCOMPLETE_OFF: 'off',
  MIN_ONE: '1',
} as const;

// ── SVG Attributes ────────────────────────────────────────────────────────

export const SVG_ATTR = {
  STROKE_DASHARRAY_DASHED: '3 4',
  TEXT_ANCHOR_END: 'end',
  TEXT_ANCHOR_MIDDLE: 'middle',
} as const;

// ── Export / JSON ─────────────────────────────────────────────────────────

export const JSON_INDENT_SPACES = 2;
export const EXPORT_PREVIEW_MAX_LENGTH = 600;
export const ZERO_TIMEOUT_MS = 0;
