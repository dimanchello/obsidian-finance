import { App } from 'obsidian';

export type Locale = 'ru' | 'en';

export const LOCALES: Record<Locale, string> = {
  ru: 'Русский',
  en: 'English',
};

export interface Translations {
  pluginTitle: string;
  pluginDesc: string;
  defaultCurrency: string;
  defaultCurrencyDesc: string;
  pageSize: string;
  attachmentsFolder: string;
  attachmentsFolderDesc: string;
  howToUse: string;
  usage1: string;
  usage2: string;
  usage3: string;
  usage4: string;
  loading: string;
  recordAdded: string;
  recordUpdated: string;
  deleted: string;
  fileNotFound: string;
  confirmDelete: string;
  bulkSelect: string;
  confirmDeleteSelectedRecords: string;
  confirmDeleteSelectedDebts: string;
  confirmDeleteSelectedCredits: string;
  confirmDeleteSelectedDeposits: string;
  enterYes: string;
  allDataDeleted: string;
  debtAdded: string;
  debtUpdated: string;
  repaymentRecorded: string;
  debtAmountIncreased: string;
  debtDeleted: string;
  saveError: string;
  invalidAmount: string;
  exportSuccess: string;
  importError: string;
  arrayNotFound: string;
  tagNotFound: string;
  importSuccess: string;
  importSkipped: string;
  income: string;
  expense: string;
  debts: string;
  credits: string;
  deposits: string;
  newDebt: string;
  newCredit: string;
  newDeposit: string;
  search: string;
  type: string;
  allTypes: string;
  category: string;
  from: string;
  to: string;
  payer: string;
  tag: string;
  reset: string;
  sortBy: string;
  sortAdded: string;
  sortDate: string;
  sortAmount: string;
  sortCategory: string;
  sortPerson: string;
  overview: string;
  records: string;
  noRecords: string;
  noRecordsFilter: string;
  tryChangeFilters: string;
  addRecord: string;
  settings: string;
  chartView: string;
  barChart: string;
  pieChart: string;
  groupBy: string;
  byCategory: string;
  byPayer: string;
  byWeek: string;
  byMonth: string;
  byYear: string;
  showData: string;
  noChartData: string;
  other: string;
  weekLetter: string;
  noData: string;
  total: string;
  amountRequired: string;
  calculatorTitle: string;
  calculatorError: string;
  exchangeRateQuestion: string;
  exchangeRateExample: string;
  exchangeRateHide: string;
  exchangeRateShow: string;
  dateTime: string;
  internalOpDesc: string;
  notePlaceholder: string;
  autofillFromDate: string;
  notSelected: string;
  amountLabel: string;
  interestRateLabel: string;
  totalReturnLent: string;
  totalReturnBorrowed: string;
  specifyPerson: string;
  borrowAmountLabel: string;
  repayAmountLabel: string;
  debtNotePlaceholder: string;
  fieldDescSum: string;
  fieldDescRate: string;
  fieldDescStartDate: string;
  fieldDescTerm: string;
  fieldDescType: string;
  fieldDescAccrual: string;
  fieldDescFrequency: string;
  fieldDescNote: string;
  pageSizeLabel: string;
  accentColor: string;
  resetColor: string;
  importExport: string;
  export: string;
  import: string;
  dangerZone: string;
  confirmDeleteAll: string;
  deleteAllData: string;
  save: string;
  cancel: string;
  sum: string;
  date: string;
  time: string;
  note: string;
  attachment: string;
  newRecord: string;
  editRecord: string;
  allStatuses: string;
  unpaid: string;
  paid: string;
  direction: string;
  allDirections: string;
  lent: string;
  borrowed: string;
  person: string;
  originalAmount: string;
  remaining: string;
  who: string;
  dateCreated: string;
  dueDate: string;
  addMovement: string;
  increaseDebt: string;
  repayDebt: string;
  history: string;
  showHistory: string;
  hideHistory: string;
  noDebts: string;
  addNewDebt: string;
  noDebtsFiltered: string;
  selectCurrency: string;
  ownCurrency: string;
  analytics: string;
  balance: string;
  incomeStat: string;
  expenseStat: string;
  typeIncome: string;
  typeExpense: string;
  clickToRename: string;
  changeCurrency: string;
  dataSubstituted: string;
  mapFields: string;
  selectFormat: string;
  selectFile: string;
  jsonPath: string;
  jsonPathDesc: string;
  xmlTag: string;
  xmlTagDesc: string;
  detectType: string;
  typeByField: string;
  typeBySign: string;
  typeAllIncome: string;
  typeAllExpense: string;
  fieldMapping: string;
  sourceField: string;
  targetField: string;
  importBtn: string;
  exportFormat: string;
  exported: string;
  imported: string;
  bankName: string;
  interestRate: string;
  monthlyPayment: string;
  startDate: string;
  paymentDayLabel: string;
  creditPayments: string;
  depositAccruals: string;
  earlyRepayment: string;
  repayAmount: string;
  repayTerm: string;
  partialRepayment: string;
  partialPaymentNote: string;
  fullRepayment: string;
  creditActive: string;
  creditPaid: string;
  depositActive: string;
  depositClosed: string;
  creditTypeCredit: string;
  creditTypeAuto: string;
  creditTypeMortgage: string;
  creditTypeConsumer: string;
  depositTypeTerm: string;
  depositTypeDemand: string;
  depositTypeSavings: string;
  accrualToAccount: string;
  accrualCapitalization: string;
  paymentFrequencyMonthly: string;
  accumulatedIncome: string;
  accrualIncluded: string;
  accrualPaidToAccount: string;
  noCredits: string;
  noCreditsFiltered: string;
  noDeposits: string;
  noDepositsFiltered: string;
  creditAdded: string;
  creditUpdated: string;
  creditDeleted: string;
  depositAdded: string;
  depositUpdated: string;
  depositDeleted: string;
  creditPaymentRecorded: string;
  depositAccrualRecorded: string;
  name: string;
  repaymentDate: string;
  allCreditTypes: string;
  allDepositTypes: string;
  edit: string;
  delete: string;
  status: string;
  filters: string;
  settingsPanel: string;
  searchPlaceholder: string;
  all: string;
  noOptions: string;
  openAttachment: string;
  download: string;
  topUp: string;
  withdraw: string;
  closeAccount: string;
  repay: string;
  borrowMore: string;
  movementHistory: string;
  payments: string;
  accruals: string;
  paidStatus: string;
  pendingStatus: string;
  editMovement: string;
  deleteMovement: string;
  deleteConfirm: string;
  confirm: string;
  accruedIncome: string;
  totalTopUps: string;
  totalWithdrawals: string;
  noScheduledPayments: string;
  noScheduledAccruals: string;
  fromLower: string;
  columnSettings: string;
  categories: string;
  internalOnly: string;
  internal: string;
  showInternal: string;
  allBanks: string;
  rate: string;
  percent: string;
  opened: string;
  endDate: string;
  percentPerAnnum: string;
  paymentLabel: string;
  noRecordsPage: string;
  searchAllFields: string;
  searchByName: string;
  debtCount_one: string;
  debtCount_few: string;
  debtCount_many: string;
  creditCount_one: string;
  creditCount_few: string;
  creditCount_many: string;
  depositCount_one: string;
  depositCount_few: string;
  depositCount_many: string;
  profitLabel: string;
  activeCards: string;
  paidCards: string;
  closedCards: string;
  summaryAmount: string;
  summaryProfit: string;
  withInterest: string;
  dueBy: string;
  gaveMore: string;
  tookMore: string;
  returned: string;
  repaymentAct: string;
  paymentsCount: string;
  topUpsHeader: string;
  withdrawalsHeader: string;
  accrualsHeader: string;
  noRecordsFilterTip: string;
  addNewRecord: string;
  optional: string;
  available: string;
  depositAvailable: string;
  remainingCredit: string;
  remainingPayments: string;
  withdrawalAmountLabel: string;
  paymentDateLabel: string;
  earlyRepaymentAmount: string;
  reduceTermLabel: string;
  somethingWentWrong: string;
  termLabel: string;
  depositType: string;
  accrualType: string;
  frequency: string;
  currency: string;
  close: string;
  fieldDescriptions: string;
  fieldDescriptionsSub: string;
  currencyManagement: string;
  addCurrency: string;
  addCurrencyDesc: string;
  currencyPlaceholder: string;
  templateInserted: string;
  commandInsertTemplate: string;
  commandFindOrphans: string;
  blockInvalidIdTitle: string;
  blockInvalidIdDesc: string;
  blockReadOnlyTitle: string;
  blockReadOnlyDesc: string;
  orphansTitle: string;
  orphansDesc: string;
  orphansNone: string;
  orphanDeleted: string;
  uncategorized: string;
  notSpecified: string;
  lentGiven: string;
  borrowedTaken: string;
  creditDefaultCat: string;
  creditPaymentCat: string;
  creditReceiptNote: string;
  creditPaymentNote: string;
  depositDefaultCat: string;
  depositInterestCat: string;
  depositRefundCat: string;
  depositOpeningCat: string;
  depositOpenNote: string;
  depositInterestNote: string;
  depositRefundNote: string;
  depositTopUpNote: string;
  depositWithdrawNote: string;
  debtDefaultCat: string;
  debtLentCat: string;
  debtRepaidCat: string;
  debtBorrowedNote: string;
  debtLentNote: string;
  debtRepayNote: string;
  debtBorrowMoreNote: string;
  remainingCreditLabel: string;
  monthlyPaymentLabel: string;
  remainingPaymentsLabel: string;
  repayAmountShort: string;
  repayTermShort: string;
  addBtn: string;
  specifyBank: string;
  specifyValidDate: string;
  creditTypeLabel: string;
  topUpAmountLabel: string;
  exceedsBalance: string;
  confirmDeleteDebt: string;
  confirmDeleteMovement: string;
  confirmDeleteCredit: string;
  confirmDeleteDeposit: string;
  confirmDeleteTopUp: string;
  confirmDeleteWithdrawal: string;
  confirmCloseDeposit: string;
  closeDepositRefund: string;
  confirmDeleteRecord: string;
  purchasePriceLabel: string;
  downPaymentLabel: string;
  downPaymentDateLabel: string;
  downPaymentDateRequired: string;
  downPaymentAmountRequired: string;
  finalAmountLabel: string;
  downPaymentNotePrefix: string;
  fileNotFoundWithPath: string;
  creditFieldDescriptionsSub: string;
  debtFieldDescriptionsSub: string;
  fieldDescCreditAmount: string;
  fieldDescCreditRate: string;
  fieldDescCreditStartDate: string;
  fieldDescCreditPaymentDay: string;
  fieldDescCreditTerm: string;
  fieldDescCreditType: string;
  fieldDescCreditMonthlyPayment: string;
  fieldDescCreditBank: string;
  isEscrowLabel: string;
  isEscrowDesc: string;
  fieldDescDebtAmount: string;
  fieldDescDebtRate: string;
  fieldDescDebtDateCreated: string;
  fieldDescDebtDueDate: string;
  fieldDescDebtPerson: string;
  fieldDescDebtDirection: string;
  fieldDescCurrencyType: string;
  fieldDescCurrencyDateTime: string;
  fieldDescCurrencyTarget: string;
  fieldDescCurrencyTargetAmount: string;
  fieldDescCurrencyAccountAmount: string;
  fieldDescCurrencyRate: string;
  fieldDescCurrencyFee: string;
  fieldDescCurrencyProvider: string;
  fieldDescCurrencyCategory: string;
  importStep1: string;
  importStep1b: string;
  importStep2: string;
  importNoFile: string;
  importOpenFile: string;
  importJsonPathHint: string;
  importNext: string;
  importFirstRecord: string;
  importFieldMapping: string;
  importAccountField: string;
  importFileField: string;
  importSampleValue: string;
  importTypeDetection: string;
  importByFieldValue: string;
  importByAmountSign: string;
  importAllIncome: string;
  importAllExpense: string;
  importFieldDate: string;
  importFieldTime: string;
  importFieldType: string;
  importFieldAmount: string;
  importFieldCategory: string;
  importFieldTag: string;
  importFieldPayer: string;
  importFieldNote: string;
  importFieldExchangeRate: string;
  importNotImport: string;
  importTypeField: string;
  importIncomeValue: string;
  importExpenseValue: string;
  importParseError: string;
  importFileFilterData: string;
  importFileFilterAll: string;
  importEmptyFile: string;
  exportFormatCsv: string;
  exportFormatJson: string;
  // Analytics shared
  dateRange: string;
  groupByType: string;
  groupByBank: string;
  groupByQuarter: string;
  list: string;
  // Credits analytics
  creditAnalytics: string;
  creditTotalBorrowed: string;
  creditTotalRemaining: string;
  creditTotalPaid: string;
  creditTotalInterest: string;
  creditPrincipalPaid: string;
  creditInterestPaid: string;
  creditPrincipal: string;
  creditInterest: string;
  creditRepaymentProgress: string;
  creditPaymentSchedule: string;
  creditByType: string;
  creditNoAnalyticsData: string;
  // Deposits analytics
  depositAnalytics: string;
  depositTotalBalance: string;
  depositTotalAccrued: string;
  depositProjectedIncome: string;
  depositAvgRate: string;
  depositInterestSchedule: string;
  depositMaturityTimeline: string;
  depositByType: string;
  depositNoAnalyticsData: string;
  depositMaturitySoon: string;
  depositActiveList: string;
  depositExpectedProfit: string;
  // Currency
  currencyExchange: string;
  currencyBuy: string;
  currencySell: string;
  currencyAdd: string;
  currencySpendOp: string;
  newCurrencyExchange: string;
  buy: string;
  sell: string;
  add: string;
  spend: string;
  buyButton: string;
  sellButton: string;
  addButton: string;
  spendButton: string;
  amountSpent: string;
  amountReceived: string;
  amountAdded: string;
  targetAmount: string;
  targetAmountBuy: string;
  targetAmountSell: string;
  targetAmountAdd: string;
  targetAmountSpend: string;
  inAccountCurrency: string;
  rateLabel: string;
  provider: string;
  sourceLabel: string;
  whereSpent: string;
  feeLabel: string;
  feeIncluded: string;
  placeholderBuy: string;
  placeholderSell: string;
  placeholderAdd: string;
  placeholderSpend: string;
  currencyBalance: string;
  availableBalance: string;
  insufficientBalance: string;
  currencyExchangeAdded: string;
  currencyExchangeUpdated: string;
  currencyExchangeDeleted: string;
  noRecordCreated: string;
  totalBought: string;
  totalAdded: string;
  totalSold: string;
  totalSpent: string;
  averageRate: string;
  valueInAccountCurrency: string;
  currencyExchangeCat: string;
  currencySaleCat: string;
  currencySpendCat: string;
  currencyPurchase: string;
  currencySale: string;
  currencySpend: string;
  confirmDeleteSelectedExchanges: string;
  categoryRequired: string;
  allOperationTypes: string;
  allCategories: string;
  balanceAfter: string;
  categoryColumn: string;
  helpCurrencyBuy: string;
  helpCurrencySell: string;
  helpCurrencyAdd: string;
  helpCurrencySpend: string;
  recordPreview: string;
  expenseRecord: string;
  incomeRecord: string;
  fetchingRates: string;
  rateFromAPI: string;
  rateAPIError: string;
  overviewAssets: string;
  overviewLiabilities: string;
  overviewCreditBurden: string;
  overviewUpcomingPayments: string;
  overviewMoneyFlow: string;
  overviewCreditBurdenChart: string;
  overviewAssetLiabilityTrend: string;
}

const ru: Translations = {
  pluginTitle: '💰 Finance Tracker',
  pluginDesc: 'Глобальные настройки плагина. Валюта и название счёта настраиваются прямо в заметке.',
  defaultCurrency: 'Валюта по умолчанию',
  defaultCurrencyDesc: 'Используется для новых счетов. Уже существующие счета имеют свою валюту.',
  pageSize: 'Записей на странице',
  attachmentsFolder: 'Папка для вложений',
  attachmentsFolderDesc: 'Куда сохраняются фото чеков и документы.',
  howToUse: 'Как использовать',
  usage1: 'Создайте заметку для каждого счёта (Наличные, Карта, Крипто-кошелёк).',
  usage2: 'Вставьте в заметку блок кода с языком finance-account.',
  usage3: 'Название счёта и валюта редактируются прямо в шапке блока.',
  usage4: 'Данные хранятся в .obsidian/plugins/obsidian-finance/accounts/',
  loading: 'Загрузка…',
  recordAdded: '✅ Запись добавлена',
  recordUpdated: '✅ Запись обновлена',
  deleted: '🗑️ Удалено',
  fileNotFound: '⚠️ Файл не найден',
  confirmDelete: 'Удалить запись?',
  bulkSelect: 'Выбор',
  confirmDeleteSelectedRecords: 'Удалить выбранные записи ({count})?',
  confirmDeleteSelectedDebts: 'Удалить выбранные долги ({count})?',
  confirmDeleteSelectedCredits: 'Удалить выбранные кредиты ({count})?',
  confirmDeleteSelectedDeposits: 'Удалить выбранные вклады ({count})?',
  enterYes: '⚠️ Введите "Yes" для подтверждения',
  allDataDeleted: '🗑️ Все данные удалены',
  debtAdded: '✅ Долг добавлен',
  debtUpdated: '✅ Долг обновлён',
  repaymentRecorded: '✅ Погашение записано',
  debtAmountIncreased: '✅ Сумма долга увеличена',
  debtDeleted: '🗑️ Долг удалён',
  saveError: '⚠️ Не удалось сохранить вложение',
  invalidAmount: '⚠️ Укажите сумму больше нуля',
  exportSuccess: '✅ Экспортировано',
  importError: 'Ошибка открытия файла',
  arrayNotFound: '⚠️ По указанному пути не найден массив',
  tagNotFound: '⚠️ Тег не найден',
  importSuccess: '✅ Импортировано',
  importSkipped: 'пропущено строк: {count}',
  income: '↑ Доход',
  expense: '↓ Расход',
  debts: 'Долги',
  credits: 'Кредиты',
  deposits: 'Вклады',
  newDebt: 'Новый долг',
  newCredit: 'Новый кредит',
  newDeposit: 'Новый вклад',
  search: 'Поиск',
  type: 'Тип',
  allTypes: 'Все типы',
  category: 'Категория',
  from: 'С',
  to: 'По',
  payer: 'Плательщик',
  tag: 'Тег',
  reset: '✕ Сбросить',
  sortBy: 'Сортировка:',
  sortAdded: 'Добавлена',
  sortDate: 'Дата',
  sortAmount: 'Сумма',
  sortCategory: 'Категория',
  sortPerson: 'Кому',
  overview: 'Обзор',
  records: 'Записи',
  noRecords: 'Записей не найдено',
  noRecordsFilter: 'Нажмите «Доход» или «Расход»',
  tryChangeFilters: 'Попробуйте изменить фильтры',
  addRecord: 'Добавить запись',
  settings: '⚙️ Настройки',
  pageSizeLabel: 'Записей на странице',
  accentColor: 'Цвет акцента счёта',
  resetColor: 'Сбросить',
  importExport: 'Импорт / Экспорт',
  export: '📤 Экспорт',
  import: '📥 Импорт',
  dangerZone: 'ОПАСНАЯ ЗОНА',
  confirmDeleteAll: 'Введите "Yes" и нажмите кнопку ниже, чтобы удалить ВСЕ записи и долги безвозвратно.',
  deleteAllData: '🗑️ Удалить ВСЕ данные',
  save: 'Сохранить',
  cancel: 'Отмена',
  sum: 'Сумма',
  date: 'Дата',
  time: 'Время',
  note: 'Примечание',
  attachment: 'Вложение',
  newRecord: 'Новая запись',
  editRecord: 'Редактирование записи',
  allStatuses: 'Все',
  unpaid: 'Не погашены',
  paid: 'Погашены',
  direction: 'Направление',
  allDirections: 'Все',
  lent: 'Мне должны',
  borrowed: 'Я должен',
  person: 'Кому',
  originalAmount: 'Сумма',
  remaining: 'Остаток',
  who: 'Кто',
  dateCreated: 'Дата создания',
  dueDate: 'Дата возврата',
  addMovement: 'Добавить движение',
  increaseDebt: 'Увеличить долг',
  repayDebt: 'Погасить',
  history: 'История',
  showHistory: 'Показать историю',
  hideHistory: 'Скрыть историю',
  noDebts: 'Нет долгов',
  addNewDebt: 'Новый долг',
  noDebtsFiltered: 'Долгов не найдено',
  selectCurrency: 'Изменить валюту',
  ownCurrency: 'Своя…',
  analytics: 'Аналитика',
  balance: 'Баланс',
  incomeStat: 'Доходы',
  expenseStat: 'Расходы',
  typeIncome: 'Доход',
  typeExpense: 'Расход',
  clickToRename: 'Нажмите чтобы переименовать',
  changeCurrency: 'Изменить валюту',
  dataSubstituted: '✨ данные подставлены',
  mapFields: 'Сопоставьте поля',
  selectFormat: 'Выберите формат',
  selectFile: 'Выберите файл',
  jsonPath: 'Путь к массиву в JSON',
  jsonPathDesc: 'например data.records',
  xmlTag: 'Тег записи в XML',
  xmlTagDesc: 'автоопределяется',
  detectType: 'Определение типа',
  typeByField: 'По значению поля',
  typeBySign: 'По знаку суммы',
  typeAllIncome: 'Все доходы',
  typeAllExpense: 'Все расходы',
  fieldMapping: 'Сопоставление полей',
  sourceField: 'Поле из файла',
  targetField: 'Поле в счёте',
  importBtn: 'Импортировать',
  exportFormat: 'Формат экспорта',
  exported: 'записей',
  imported: 'записей',
  bankName: 'Банк',
  interestRate: 'Процентная ставка',
  monthlyPayment: 'Ежемесячный платёж',
  startDate: 'Дата начала',
  paymentDayLabel: 'День платежа',
  creditPayments: 'Платежи',
  depositAccruals: 'Начисления',
  earlyRepayment: 'Досрочное погашение',
  repayAmount: 'Гасить сумму',
  repayTerm: 'Гасить срок',
  partialRepayment: 'Частичное',
  partialPaymentNote: 'Частичная оплата',
  fullRepayment: 'Полное',
  creditActive: 'Активен',
  creditPaid: 'Погашен',
  depositActive: 'Активен',
  depositClosed: 'Закрыт',
  creditTypeCredit: 'Кредит',
  creditTypeAuto: 'Автокредит',
  creditTypeMortgage: 'Ипотека',
  creditTypeConsumer: 'Потребительский',
  depositTypeTerm: 'Срочный',
  depositTypeDemand: 'До востребования',
  depositTypeSavings: 'Накопительный',
  accrualToAccount: 'На счёт',
  accrualCapitalization: 'С капитализацией',
  paymentFrequencyMonthly: 'Ежемесячно',
  accumulatedIncome: 'Накопленный доход',
  accrualIncluded: '✓ Включено в сумму вклада',
  accrualPaidToAccount: '✓ Начислено',
  noCredits: 'Нет кредитов',
  noCreditsFiltered: 'Кредитов не найдено',
  noDeposits: 'Нет вкладов',
  noDepositsFiltered: 'Вкладов не найдено',
  creditAdded: '✅ Кредит добавлен',
  creditUpdated: '✅ Кредит обновлён',
  creditDeleted: '🗑️ Кредит удалён',
  depositAdded: '✅ Вклад добавлен',
  depositUpdated: '✅ Вклад обновлён',
  depositDeleted: '🗑️ Вклад удалён',
  creditPaymentRecorded: '✅ Платёж записан',
  depositAccrualRecorded: '✅ Начисление записано',
  name: 'Название',
  repaymentDate: 'Дата погашения',
  allCreditTypes: 'Все типы',
  allDepositTypes: 'Все типы',
  edit: 'Редактировать',
  delete: 'Удалить',
  status: 'Статус',
  filters: 'Фильтры',
  settingsPanel: 'Настройки',
  searchPlaceholder: 'Поиск…',
  all: 'Все',
  noOptions: 'Нет вариантов',
  openAttachment: 'Открыть вложение',
  download: 'Скачать',
  topUp: 'Пополнить',
  withdraw: 'Снять',
  closeAccount: 'Закрыть вклад',
  repay: 'Погасить',
  borrowMore: '➕ Взять ещё',
  movementHistory: 'История операций',
  payments: 'Платежи',
  accruals: 'Начисления',
  paidStatus: '✓ Оплачено',
  pendingStatus: '⏳ Ожидает',
  editMovement: 'Редактировать движение',
  deleteMovement: 'Удалить движение',
  deleteConfirm: 'Удалить',
  confirm: 'Подтвердить',
  accruedIncome: 'Накопленный доход',
  totalTopUps: 'Всего пополнений',
  totalWithdrawals: 'Всего снятий',
  noScheduledPayments: 'Нет запланированных платежей',
  noScheduledAccruals: 'Нет запланированных начислений',
  fromLower: 'из',
  columnSettings: 'Настройка колонок',
  categories: 'Категории',
  internalOnly: 'Показать только внутренние операции',
  internal: 'Внутренние',
  showInternal: 'Только внутр.',
  allBanks: 'Все банки',
  rate: 'Курс',
  percent: 'Процент',
  opened: 'Открыт',
  endDate: 'Окончание',
  percentPerAnnum: '% годовых',
  paymentLabel: 'Платёж',
  noRecordsPage: 'Нет записей на этой странице',
  searchAllFields: 'Поиск по всем полям…',
  searchByName: 'Поиск по названию или банку…',
  debtCount_one: 'долг',
  debtCount_few: 'долга',
  debtCount_many: 'долгов',
  creditCount_one: 'кредит',
  creditCount_few: 'кредита',
  creditCount_many: 'кредитов',
  depositCount_one: 'вклад',
  depositCount_few: 'вклада',
  depositCount_many: 'вкладов',
  profitLabel: 'Прибыль',
  activeCards: 'Активные',
  paidCards: 'Погашенные',
  closedCards: 'Закрытые',
  summaryAmount: 'Сумма',
  summaryProfit: 'Прибыль',
  withInterest: 'Сумма + %',
  dueBy: '📅 до',
  gaveMore: '➕ Дал ещё',
  tookMore: '➕ Взял ещё',
  returned: '💰 Вернули',
  repaymentAct: '💰 Погашение',
  paymentsCount: 'платежей',
  topUpsHeader: '💰 Пополнения',
  withdrawalsHeader: '📤 Снятия',
  accrualsHeader: '📊 Начисления',
  noRecordsFilterTip: 'Нажмите «Доход» или «Расход»',
  addNewRecord: 'Добавить запись',
  optional: 'Необязательно',
  available: 'Доступно',
  depositAvailable: 'Доступно для снятия',
  remainingCredit: 'Остаток кредита',
  remainingPayments: 'Осталось платежей',
  withdrawalAmountLabel: 'Сумма снятия',
  paymentDateLabel: 'Дата платежа',
  earlyRepaymentAmount: 'Сумма досрочного погашения',
  reduceTermLabel: 'На сколько месяцев сократить срок?',
  somethingWentWrong: 'Что-то пошло не так',
  termLabel: 'Срок (мес)',
  depositType: 'Тип вклада',
  accrualType: 'Тип начисления',
  frequency: 'Периодичность',
  currency: 'Валюта',
  close: 'Закрыть',
  fieldDescriptions: 'Описание полей',
  fieldDescriptionsSub: 'Краткое описание каждого поля формы вклада',
  currencyManagement: 'Управление валютами',
  addCurrency: 'Добавить свою валюту',
  addCurrencyDesc: 'Только добавленные здесь валюты будут доступны для выбора в счетах.',
  currencyPlaceholder: 'напр. CNY, KRW, INR…',
  templateInserted: '✅ Шаблон счёта вставлен',
  commandInsertTemplate: 'Вставить шаблон счёта',
  commandFindOrphans: 'Найти брошенные счета',
  blockInvalidIdTitle: 'Некорректный идентификатор счёта',
  blockInvalidIdDesc: 'Значение «{id}» не похоже на идентификатор счёта (12 шестнадцатеричных символов). Данные не потеряны: исправьте опечатку, чтобы вернуть счёт. Если удалить строку id, будет создан новый пустой счёт.',
  blockReadOnlyTitle: 'Счёт доступен только для чтения',
  blockReadOnlyDesc: 'В этом представлении заметка недоступна для записи, поэтому идентификатор счёта не может быть выдан. Откройте заметку обычным способом.',
  orphansTitle: 'Брошенные счета',
  orphansDesc: 'Папки с данными, чей идентификатор не встречается ни в одном блоке finance-account. Удаление необратимо.',
  orphansNone: 'Брошенных счетов не найдено',
  orphanDeleted: 'Счёт удалён',
  uncategorized: 'Без категории',
  notSpecified: 'Не указан',
  lentGiven: 'Дано в долг',
  borrowedTaken: 'Взято в долг',
  creditDefaultCat: 'Кредит',
  creditPaymentCat: 'Платёж по кредиту',
  creditReceiptNote: 'Получение кредита',
  creditPaymentNote: 'Платёж по кредиту',
  depositDefaultCat: 'Вклад',
  depositInterestCat: 'Проценты по вкладу',
  depositRefundCat: 'Возврат вклада',
  depositOpeningCat: 'Возврат вклада (открытие)',
  depositOpenNote: 'Открытие вклада',
  depositInterestNote: 'Начисление процентов по вкладу',
  depositRefundNote: 'Возврат вклада',
  depositTopUpNote: 'Пополнение вклада',
  depositWithdrawNote: 'Снятие с вклада',
  debtDefaultCat: 'Долг',
  debtLentCat: 'Дано в долг',
  debtRepaidCat: 'Возврат долга',
  debtBorrowedNote: 'Взято в долг',
  debtLentNote: 'Дано в долг',
  debtRepayNote: 'Возврат долга',
  debtBorrowMoreNote: 'Дополнительно взято',
  remainingCreditLabel: 'Остаток кредита',
  monthlyPaymentLabel: 'Ежемесячный платёж',
  remainingPaymentsLabel: 'Осталось платежей',
  repayAmountShort: 'Гасить сумму',
  repayTermShort: 'Гасить срок',
  addBtn: 'Добавить',
  specifyBank: '⚠️ Укажите банк',
  specifyValidDate: '⚠️ Укажите корректную дату начала',
  creditTypeLabel: 'Тип кредита',
  topUpAmountLabel: 'Сумма пополнения',
  exceedsBalance: '⚠️ Сумма превышает доступный остаток ({max} {currency})',
  confirmDeleteDebt: 'Удалить долг?',
  confirmDeleteMovement: 'Удалить движение?',
  confirmDeleteCredit: 'Удалить кредит?',
  confirmDeleteDeposit: 'Удалить вклад?',
  confirmDeleteTopUp: 'Удалить пополнение?',
  confirmDeleteWithdrawal: 'Удалить снятие?',
  confirmCloseDeposit: 'Закрыть вклад?',
  closeDepositRefund: 'Сумма {amount} будет возвращена на счёт.',
  confirmDeleteRecord: 'Удалить запись?',
  purchasePriceLabel: 'Стоимость покупки *',
  downPaymentLabel: 'Первоначальный взнос',
  downPaymentDateLabel: 'Дата первоначального взноса',
  downPaymentDateRequired: '⚠️ Необходимо указать дату первоначального взноса',
  downPaymentAmountRequired: '⚠️ Сумма первоначального взноса должна быть больше нуля',
  finalAmountLabel: 'Итого сумма кредита',
  downPaymentNotePrefix: 'Первоначальный взнос — ',
  fileNotFoundWithPath: '⚠️ Файл не найден: {path}',
  chartView: 'Вид:',
  barChart: '▮▮ Столбцы',
  pieChart: '◕ Пирог',
  groupBy: 'Группировка:',
  byCategory: 'По категории',
  byPayer: 'По плательщику',
  byWeek: 'По неделе',
  byMonth: 'По месяцу',
  byYear: 'По году',
  showData: 'Данные:',
  noChartData: '📊 Нет данных для отображения',
  other: 'Другое',
  weekLetter: 'Н',
  noData: 'Нет данных',
  total: 'Итого',
  amountRequired: 'Сумма * ({currency})',
  calculatorTitle: 'Калькулятор',
  calculatorError: 'Ошибка',
  exchangeRateQuestion: 'Курс (1 {currency} = ?)',
  exchangeRateExample: 'напр. 95,50',
  exchangeRateHide: '− Курс',
  exchangeRateShow: '+ Курс',
  dateTime: 'Дата и время',
  internalOpDesc: 'Внутренняя операция (не учитывается в статистике)',
  notePlaceholder: 'Необязательно — любой комментарий к записи…',
  autofillFromDate: '✨ Подставлено из записи от {date}',
  notSelected: 'Не выбран',
  amountLabel: 'Сумма *',
  interestRateLabel: 'Процент (%)',
  totalReturnLent: 'Итого мне вернут',
  totalReturnBorrowed: 'Итого к возврату',
  specifyPerson: '⚠️ Укажите кому',
  borrowAmountLabel: 'Сумма (увеличить долг) *',
  repayAmountLabel: 'Сумма (погашение) *',
  debtNotePlaceholder: 'Необязательно — любой комментарий…',
  fieldDescSum: 'Основная сумма вклада. При капитализации будет расти за счёт процентов.',
  fieldDescRate: 'Годовая процентная ставка. Для ежемесячного расчёта делится на 12.',
  fieldDescStartDate: 'Дата открытия вклада. Если указана в прошлом, будут рассчитаны пропущенные начисления.',
  fieldDescTerm: 'Срок вклада в месяцах. По окончании вклад закрывается.',
  fieldDescType: 'Метка для группировки и фильтрации. На расчёты не влияет.',
  fieldDescAccrual: 'На счёт: проценты выплачиваются на основной счёт. С капитализацией: проценты увеличивают сумму вклада.',
  fieldDescFrequency: 'Как часто начисляются проценты. Для «На счёт»: ежемесячно или в конце срока. При капитализации всегда ежемесячно.',
  fieldDescNote: 'Необязательное примечание.',
  creditFieldDescriptionsSub: 'Краткое описание каждого поля формы кредита',
  debtFieldDescriptionsSub: 'Краткое описание каждого поля формы долга',
  fieldDescCreditAmount: 'Сумма основного долга — то, что вы взяли в банке. Проценты и ежемесячные платежи рассчитываются от этой суммы.',
  fieldDescCreditRate: 'Годовая процентная ставка. Используется для расчёта ежемесячного платежа.',
  fieldDescCreditStartDate: 'Дата выдачи кредита банком. Используется как точка отсчёта для графика платежей — от неё считаются месяцы.',
  fieldDescCreditPaymentDay: 'Число месяца, в которое нужно вносить ежемесячный платёж. Например, 15 — платёж будет 15-го каждого месяца. Если не указано, число берётся из даты начала кредита.',
  fieldDescCreditTerm: 'Срок кредита в месяцах. От него зависит сумма ежемесячного платежа и общая переплата.',
  fieldDescCreditType: 'Тип кредита: потребительский, автокредит или ипотека. Влияет на группировку и фильтрацию.',
  fieldDescCreditMonthlyPayment: 'Фиксированная сумма, которую нужно платить каждый месяц. Рассчитывается автоматически на основе суммы, ставки и срока.',
  fieldDescCreditBank: 'Название банка, в котором оформлен кредит. Используется для группировки и фильтрации.',
  isEscrowLabel: 'Средства на эскроу-счёт',
  isEscrowDesc: 'Деньги перечислены банком застройщику через эскроу-счёт и не поступают на баланс счёта',
  fieldDescDebtAmount: 'Сумма долга. Если указан процент, итоговая сумма будет увеличена на процент.',
  fieldDescDebtRate: 'Процент за пользование деньгами. Итоговая сумма долга = сумма + процент.',
  fieldDescDebtDateCreated: 'Дата, когда долг был оформлен.',
  fieldDescDebtDueDate: 'Крайний срок возврата долга. Если не указана, долг считается бессрочным.',
  fieldDescDebtPerson: 'Кому вы должны или кто должен вам. Зависит от выбранного направления.',
  fieldDescDebtDirection: '«Мне должны» — вы дали в долг. «Я должен» — вы взяли в долг.',
  fieldDescCurrencyType: 'Тип операции: Покупка/Продажа (с конвертацией), Добавление/Трата (без конвертации основной валюты).',
  fieldDescCurrencyDateTime: 'Дата и время совершения операции.',
  fieldDescCurrencyTarget: 'Валюта, с которой производится операция (например, USD, EUR).',
  fieldDescCurrencyTargetAmount: 'Сумма в целевой валюте.',
  fieldDescCurrencyAccountAmount: 'Сумма в основной валюте счёта.',
  fieldDescCurrencyRate: 'Курс конвертации. Рассчитывается автоматически при вводе обеих сумм.',
  fieldDescCurrencyFee: 'Комиссия за операцию (в основной валюте).',
  fieldDescCurrencyProvider: 'Место или способ обмена/покупки (например, Банк, Обменник).',
  fieldDescCurrencyCategory: 'Категория для учёта расходов/доходов.',
  importStep1: 'Шаг 1 — Выберите файл (CSV, JSON)',
  importStep1b: 'Шаг 1б — Укажите путь к массиву записей',
  importStep2: 'Шаг 2 — Соотнесение полей  (найдено {count} записей)',
  importNoFile: 'Файл не выбран',
  importOpenFile: 'Открыть файл…',
  importJsonPathHint: 'Например: records  или  data.transactions',
  importNext: 'Далее →',
  importFirstRecord: 'Первая запись из файла:',
  importFieldMapping: 'Настройте соответствие полей:',
  importAccountField: 'Поле счёта',
  importFileField: 'Поле из файла',
  importSampleValue: 'Значение (1-я запись)',
  importTypeDetection: 'Как определять тип (доход/расход):',
  importByFieldValue: 'По значению поля (income/expense, приход/расход и т.п.)',
  importByAmountSign: 'По знаку суммы (+ = доход, − = расход)',
  importAllIncome: 'Все записи — доходы',
  importAllExpense: 'Все записи — расходы',
  importFieldDate: 'Дата (YYYY-MM-DD)',
  importFieldTime: 'Время (HH:MM)',
  importFieldType: 'Тип (income/expense)',
  importFieldAmount: 'Сумма',
  importFieldCategory: 'Категория',
  importFieldTag: 'Тег',
  importFieldPayer: 'Плательщик',
  importFieldNote: 'Примечание',
  importFieldExchangeRate: 'Курс',
  importNotImport: '— Не импортировать —',
  importTypeField: 'Поле типа',
  importIncomeValue: 'Значение для «Доход»',
  importExpenseValue: 'Значение для «Расход»',
  importParseError: '⚠️ Ошибка разбора файла: {error}',
  importFileFilterData: 'Таблицы и данные',
  importFileFilterAll: 'Все файлы',
  importEmptyFile: 'Файл пустой',
  exportFormatCsv: 'CSV',
  exportFormatJson: 'JSON',
  dateRange: 'Диапазон дат',
  groupByType: 'По типу',
  groupByBank: 'По банку',
  groupByQuarter: 'По кварталу',
  list: 'Список',
  creditAnalytics: 'Аналитика кредитов',
  creditTotalBorrowed: 'Итого взято',
  creditTotalRemaining: 'Остаток долга',
  creditTotalPaid: 'Уже выплачено',
  creditTotalInterest: 'Переплата',
  creditPrincipalPaid: 'Выплачено долга',
  creditInterestPaid: 'Выплачено процентов',
  creditPrincipal: 'Основной долг',
  creditInterest: 'Проценты банку',
  creditRepaymentProgress: 'Прогресс погашения',
  creditPaymentSchedule: 'График платежей',
  creditByType: 'По типу кредита',
  creditNoAnalyticsData: 'Нет данных для аналитики',
  depositAnalytics: 'Аналитика вкладов',
  depositTotalBalance: 'Итого на вкладах',
  depositTotalAccrued: 'Начислено %',
  depositProjectedIncome: 'Прогноз дохода',
  depositAvgRate: 'Средняя ставка',
  depositInterestSchedule: 'График начислений',
  depositMaturityTimeline: 'Сроки закрытия',
  depositByType: 'По типу вклада',
  depositNoAnalyticsData: 'Нет данных для аналитики',
  depositMaturitySoon: 'Закрытие в ближайшие 6 мес.',
  depositActiveList: 'Действующие вклады',
  depositExpectedProfit: 'Ожидаемый доход',
  currencyExchange: 'Валюты',
  currencyBuy: 'Покупка валюты',
  currencySell: 'Продажа валюты',
  currencyAdd: 'Добавление валюты',
  currencySpendOp: 'Трата валюты',
  newCurrencyExchange: 'Новая операция',
  buy: 'Покупка',
  sell: 'Продажа',
  add: 'Добавление',
  spend: 'Трата',
  buyButton: 'Купить',
  sellButton: 'Продать',
  addButton: 'Добавить',
  spendButton: 'Потратить',
  amountSpent: 'Потрачено',
  amountReceived: 'Получено',
  amountAdded: 'Добавлено',
  targetAmount: 'Количество',
  targetAmountBuy: 'Получено ({currency})',
  targetAmountSell: 'Продано ({currency})',
  targetAmountAdd: 'Добавлено ({currency})',
  targetAmountSpend: 'Потрачено ({currency})',
  inAccountCurrency: 'В рублях ({currency})',
  rateLabel: '1 {currency} = ? {accountCurrency}',
  provider: 'Место обмена',
  sourceLabel: 'Источник',
  whereSpent: 'Где потратили',
  feeLabel: 'Комиссия',
  feeIncluded: 'Уже включена в сумму',
  placeholderBuy: 'Например: Покупка для поездки в Турцию',
  placeholderSell: 'Например: Продажа после возвращения',
  placeholderAdd: 'Например: Привёз из командировки',
  placeholderSpend: 'Например: Оплата отеля',
  currencyBalance: 'Баланс валюты',
  availableBalance: 'Доступно: {amount} {currency}',
  insufficientBalance: 'Недостаточно валюты',
  currencyExchangeAdded: 'Операция добавлена',
  currencyExchangeUpdated: 'Операция обновлена',
  currencyExchangeDeleted: 'Операция удалена',
  noRecordCreated: 'Запись в журнале НЕ будет создана',
  totalBought: 'Всего куплено',
  totalAdded: 'Всего добавлено',
  totalSold: 'Всего продано',
  totalSpent: 'Всего потрачено',
  averageRate: 'Средний курс',
  valueInAccountCurrency: 'Стоимость в {currency}',
  currencyExchangeCat: 'Покупка валюты',
  currencySaleCat: 'Продажа валюты',
  currencySpendCat: 'Трата валюты',
  currencyPurchase: 'Покупка',
  currencySale: 'Продажа',
  currencySpend: 'Трата',
  confirmDeleteSelectedExchanges: 'Удалить выбранные операции?',
  categoryRequired: 'Выберите категорию для траты',
  allOperationTypes: 'Все типы',
  allCategories: 'Все категории',
  balanceAfter: 'Баланс после',
  categoryColumn: 'Категория',
  helpCurrencyBuy: 'Покупка валюты через банк/обменник. Создаёт расход в основной валюте.',
  helpCurrencySell: 'Продажа валюты обратно. Создаёт доход в основной валюте.',
  helpCurrencyAdd: 'Добавление наличной валюты, которая уже есть у вас (из поездки, подарок). Не создаёт записей в журнале.',
  helpCurrencySpend: 'Трата наличной валюты. Создаёт расход в пересчёте на основную валюту.',
  recordPreview: 'Будет создана запись:',
  expenseRecord: 'Расход',
  incomeRecord: 'Доход',
  fetchingRates: 'Загрузка курсов...',
  rateFromAPI: 'Курс от {date}',
  rateAPIError: 'Не удалось загрузить курс',
  overviewAssets: 'Активы',
  overviewLiabilities: 'Обязательства',
  overviewCreditBurden: 'Кредитная нагрузка',
  overviewUpcomingPayments: 'Предстоящие платежи',
  overviewMoneyFlow: 'Денежный поток',
  overviewCreditBurdenChart: 'Динамика кредитной нагрузки',
  overviewAssetLiabilityTrend: 'Динамика активов и обязательств',
};

const en: Translations = {
  pluginTitle: '💰 Finance Tracker',
  pluginDesc: 'Global plugin settings. Currency and account name are configured directly in the note.',
  defaultCurrency: 'Default Currency',
  defaultCurrencyDesc: 'Used for new accounts. Existing accounts have their own currency.',
  pageSize: 'Records per page',
  attachmentsFolder: 'Attachments folder',
  attachmentsFolderDesc: 'Where receipt photos and documents are saved.',
  howToUse: 'How to use',
  usage1: 'Create a note for each account (Cash, Card, Crypto wallet).',
  usage2: 'Insert a code block with language finance-account.',
  usage3: 'Account name and currency are edited directly in the block header.',
  usage4: 'Data is stored in .obsidian/plugins/obsidian-finance/accounts/',
  loading: 'Loading…',
  recordAdded: '✅ Record added',
  recordUpdated: '✅ Record updated',
  deleted: '🗑️ Deleted',
  fileNotFound: '⚠️ File not found',
  confirmDelete: 'Delete record?',
  bulkSelect: 'Select',
  confirmDeleteSelectedRecords: 'Delete selected records ({count})?',
  confirmDeleteSelectedDebts: 'Delete selected debts ({count})?',
  confirmDeleteSelectedCredits: 'Delete selected credits ({count})?',
  confirmDeleteSelectedDeposits: 'Delete selected deposits ({count})?',
  enterYes: '⚠️ Enter "Yes" to confirm',
  allDataDeleted: '🗑️ All data deleted',
  debtAdded: '✅ Debt added',
  debtUpdated: '✅ Debt updated',
  repaymentRecorded: '✅ Repayment recorded',
  debtAmountIncreased: '✅ Debt amount increased',
  debtDeleted: '🗑️ Debt deleted',
  saveError: '⚠️ Failed to save attachment',
  invalidAmount: '⚠️ Specify amount greater than zero',
  exportSuccess: '✅ Exported',
  importError: 'Error opening file',
  arrayNotFound: '⚠️ Array not found at specified path',
  tagNotFound: '⚠️ Tag not found',
  importSuccess: '✅ Imported',
  importSkipped: 'skipped rows: {count}',
  income: '↑ Income',
  expense: '↓ Expense',
  debts: 'Debts',
  credits: 'Credits',
  deposits: 'Deposits',
  newDebt: 'New debt',
  newCredit: 'New credit',
  newDeposit: 'New deposit',
  search: 'Search',
  type: 'Type',
  allTypes: 'All types',
  category: 'Category',
  from: 'From',
  to: 'To',
  payer: 'Payer',
  tag: 'Tag',
  reset: '✕ Reset',
  sortBy: 'Sort by:',
  sortAdded: 'Added',
  sortDate: 'Date',
  sortAmount: 'Amount',
  sortCategory: 'Category',
  sortPerson: 'Person',
  overview: 'Overview',
  records: 'Records',
  noRecords: 'No records found',
  noRecordsFilter: 'Click "Income" or "Expense"',
  tryChangeFilters: 'Try changing filters',
  addRecord: 'Add record',
  settings: '⚙️ Settings',
  pageSizeLabel: 'Records per page',
  accentColor: 'Account accent color',
  resetColor: 'Reset',
  importExport: 'Import / Export',
  export: '📤 Export',
  import: '📥 Import',
  dangerZone: 'DANGER ZONE',
  confirmDeleteAll: 'Enter "Yes" and click the button below to permanently delete ALL records and debts.',
  deleteAllData: '🗑️ Delete ALL data',
  save: 'Save',
  cancel: 'Cancel',
  sum: 'Amount',
  date: 'Date',
  time: 'Time',
  note: 'Note',
  attachment: 'Attachment',
  newRecord: 'New record',
  editRecord: 'Edit record',
  allStatuses: 'All',
  unpaid: 'Unpaid',
  paid: 'Paid',
  direction: 'Direction',
  allDirections: 'All',
  lent: 'Owed to me',
  borrowed: 'I owe',
  person: 'Person',
  originalAmount: 'Amount',
  remaining: 'Remaining',
  who: 'Who',
  dateCreated: 'Date created',
  dueDate: 'Due date',
  addMovement: 'Add movement',
  increaseDebt: 'Increase debt',
  repayDebt: 'Repay',
  history: 'History',
  showHistory: 'Show history',
  hideHistory: 'Hide history',
  noDebts: 'No debts',
  addNewDebt: 'Add new debt',
  noDebtsFiltered: 'No debts found',
  selectCurrency: 'Change currency',
  ownCurrency: 'Custom…',
  analytics: 'Analytics',
  balance: 'Balance',
  incomeStat: 'Income',
  expenseStat: 'Expense',
  typeIncome: 'Income',
  typeExpense: 'Expense',
  clickToRename: 'Click to rename',
  changeCurrency: 'Change currency',
  dataSubstituted: '✨ data substituted',
  mapFields: 'Map fields',
  selectFormat: 'Select format',
  selectFile: 'Select file',
  jsonPath: 'JSON array path',
  jsonPathDesc: 'e.g. data.records',
  xmlTag: 'XML record tag',
  xmlTagDesc: 'auto-detected',
  detectType: 'Type detection',
  typeByField: 'By field value',
  typeBySign: 'By amount sign',
  typeAllIncome: 'All income',
  typeAllExpense: 'All expense',
  fieldMapping: 'Field mapping',
  sourceField: 'Source field',
  targetField: 'Target field',
  importBtn: 'Import',
  exportFormat: 'Export format',
  exported: 'records',
  imported: 'records',
  bankName: 'Bank',
  interestRate: 'Interest rate',
  monthlyPayment: 'Monthly payment',
  startDate: 'Start date',
  paymentDayLabel: 'Payment day',
  creditPayments: 'Payments',
  depositAccruals: 'Accruals',
  earlyRepayment: 'Early repayment',
  repayAmount: 'Repay amount',
  repayTerm: 'Repay term',
  partialRepayment: 'Partial',
  partialPaymentNote: 'Partial payment',
  fullRepayment: 'Full',
  creditActive: 'Active',
  creditPaid: 'Paid',
  depositActive: 'Active',
  depositClosed: 'Closed',
  creditTypeCredit: 'Credit',
  creditTypeAuto: 'Auto loan',
  creditTypeMortgage: 'Mortgage',
  creditTypeConsumer: 'Consumer',
  depositTypeTerm: 'Term',
  depositTypeDemand: 'Demand',
  depositTypeSavings: 'Savings',
  accrualToAccount: 'To account',
  accrualCapitalization: 'Capitalization',
  paymentFrequencyMonthly: 'Monthly',
  accumulatedIncome: 'Accumulated income',
  accrualIncluded: '✓ Included in deposit amount',
  accrualPaidToAccount: '✓ Accrued',
  noCredits: 'No credits',
  noCreditsFiltered: 'No credits found',
  noDeposits: 'No deposits',
  noDepositsFiltered: 'No deposits found',
  creditAdded: '✅ Credit added',
  creditUpdated: '✅ Credit updated',
  creditDeleted: '🗑️ Credit deleted',
  depositAdded: '✅ Deposit added',
  depositUpdated: '✅ Deposit updated',
  depositDeleted: '🗑️ Deposit deleted',
  creditPaymentRecorded: '✅ Payment recorded',
  depositAccrualRecorded: '✅ Accrual recorded',
  name: 'Name',
  repaymentDate: 'Repayment date',
  allCreditTypes: 'All types',
  allDepositTypes: 'All types',
  edit: 'Edit',
  delete: 'Delete',
  status: 'Status',
  filters: 'Filters',
  settingsPanel: 'Settings',
  searchPlaceholder: 'Search…',
  all: 'All',
  noOptions: 'No options',
  openAttachment: 'Open attachment',
  download: 'Download',
  topUp: 'Top up',
  withdraw: 'Withdraw',
  closeAccount: 'Close account',
  repay: 'Repay',
  borrowMore: 'Borrow more',
  movementHistory: 'Movement history',
  payments: 'Payments',
  accruals: 'Accruals',
  paidStatus: '✓ Paid',
  pendingStatus: '⏳ Pending',
  editMovement: 'Edit movement',
  deleteMovement: 'Delete movement',
  deleteConfirm: 'Delete',
  confirm: 'Confirm',
  accruedIncome: 'Accrued income',
  totalTopUps: 'Total top-ups',
  totalWithdrawals: 'Total withdrawals',
  noScheduledPayments: 'No scheduled payments',
  noScheduledAccruals: 'No scheduled accruals',
  fromLower: 'of',
  columnSettings: 'Column settings',
  categories: 'Categories',
  internalOnly: 'Show internal operations only',
  internal: 'Internal',
  showInternal: 'Internal only',
  allBanks: 'All banks',
  rate: 'Rate',
  percent: 'Percent',
  opened: 'Opened',
  endDate: 'End date',
  percentPerAnnum: '% p.a.',
  paymentLabel: 'Payment',
  noRecordsPage: 'No records on this page',
  searchAllFields: 'Search all fields…',
  searchByName: 'Search by name or bank…',
  debtCount_one: 'debt',
  debtCount_few: 'debts',
  debtCount_many: 'debts',
  creditCount_one: 'credit',
  creditCount_few: 'credits',
  creditCount_many: 'credits',
  depositCount_one: 'deposit',
  depositCount_few: 'deposits',
  depositCount_many: 'deposits',
  profitLabel: 'Profit',
  activeCards: 'Active',
  paidCards: 'Paid',
  closedCards: 'Closed',
  summaryAmount: 'Amount',
  summaryProfit: 'Profit',
  withInterest: 'Amount + %',
  dueBy: '📅 due',
  gaveMore: '➕ Lent more',
  tookMore: '➕ Borrowed more',
  returned: '💰 Returned',
  repaymentAct: '💰 Repayment',
  paymentsCount: 'payments',
  topUpsHeader: '💰 Top-ups',
  withdrawalsHeader: '📤 Withdrawals',
  accrualsHeader: '📊 Accruals',
  noRecordsFilterTip: 'Click "Income" or "Expense"',
  addNewRecord: 'Add record',
  optional: 'Optional',
  available: 'Available',
  depositAvailable: 'Available for withdrawal',
  remainingCredit: 'Remaining credit',
  remainingPayments: 'Remaining payments',
  withdrawalAmountLabel: 'Withdrawal amount',
  paymentDateLabel: 'Payment date',
  earlyRepaymentAmount: 'Early repayment amount',
  reduceTermLabel: 'Reduce term by how many months?',
  somethingWentWrong: 'Something went wrong',
  termLabel: 'Term (months)',
  depositType: 'Deposit type',
  accrualType: 'Accrual type',
  frequency: 'Frequency',
  currency: 'Currency',
  close: 'Close',
  fieldDescriptions: 'Field descriptions',
  fieldDescriptionsSub: 'Brief description of each deposit form field',
  currencyManagement: 'Currency management',
  addCurrency: 'Add custom currency',
  addCurrencyDesc: 'Only currencies added here will be available for selection in accounts.',
  currencyPlaceholder: 'e.g. CNY, KRW, INR…',
  templateInserted: '✅ Account template inserted',
  commandInsertTemplate: 'Insert account template',
  commandFindOrphans: 'Find orphaned accounts',
  blockInvalidIdTitle: 'Invalid account id',
  blockInvalidIdDesc: 'The value "{id}" is not an account id (12 hexadecimal characters). No data was lost: fix the typo to restore the account. Removing the id line creates a new empty account.',
  blockReadOnlyTitle: 'Account is read-only',
  blockReadOnlyDesc: 'This view cannot write to the note, so an account id cannot be assigned. Open the note normally.',
  orphansTitle: 'Orphaned accounts',
  orphansDesc: 'Data folders whose id appears in no finance-account block. Deletion cannot be undone.',
  orphansNone: 'No orphaned accounts found',
  orphanDeleted: 'Account deleted',
  uncategorized: 'Uncategorized',
  notSpecified: 'Not specified',
  lentGiven: 'Given as debt',
  borrowedTaken: 'Taken as debt',
  creditDefaultCat: 'Credit',
  creditPaymentCat: 'Credit payment',
  creditReceiptNote: 'Credit receipt',
  creditPaymentNote: 'Credit payment',
  depositDefaultCat: 'Deposit',
  depositInterestCat: 'Deposit interest',
  depositRefundCat: 'Deposit refund',
  depositOpeningCat: 'Deposit refund (opening)',
  depositOpenNote: 'Deposit opening',
  depositInterestNote: 'Deposit interest accrual',
  depositRefundNote: 'Deposit refund',
  depositTopUpNote: 'Deposit top-up',
  depositWithdrawNote: 'Deposit withdrawal',
  debtDefaultCat: 'Debt',
  debtLentCat: 'Lent',
  debtRepaidCat: 'Debt repayment',
  debtBorrowedNote: 'Borrowed',
  debtLentNote: 'Lent',
  debtRepayNote: 'Debt repayment',
  debtBorrowMoreNote: 'Additional borrowing',
  remainingCreditLabel: 'Remaining credit',
  monthlyPaymentLabel: 'Monthly payment',
  remainingPaymentsLabel: 'Remaining payments',
  repayAmountShort: 'Repay amount',
  repayTermShort: 'Repay term',
  addBtn: 'Add',
  specifyBank: '⚠️ Specify a bank',
  specifyValidDate: '⚠️ Specify a valid start date',
  creditTypeLabel: 'Credit type',
  topUpAmountLabel: 'Top-up amount',
  exceedsBalance: '⚠️ Amount exceeds available balance ({max} {currency})',
  confirmDeleteDebt: 'Delete debt?',
  confirmDeleteMovement: 'Delete movement?',
  confirmDeleteCredit: 'Delete credit?',
  confirmDeleteDeposit: 'Delete deposit?',
  confirmDeleteTopUp: 'Delete top-up?',
  confirmDeleteWithdrawal: 'Delete withdrawal?',
  confirmCloseDeposit: 'Close deposit?',
  closeDepositRefund: 'Amount {amount} will be refunded to account.',
  confirmDeleteRecord: 'Delete record?',
  purchasePriceLabel: 'Purchase price *',
  downPaymentLabel: 'Down payment',
  downPaymentDateLabel: 'Down payment date',
  downPaymentDateRequired: '⚠️ Please specify the down payment date',
  downPaymentAmountRequired: '⚠️ Down payment amount must be greater than zero',
  finalAmountLabel: 'Final credit amount',
  downPaymentNotePrefix: 'Down payment — ',
  fileNotFoundWithPath: '⚠️ File not found: {path}',
  chartView: 'View:',
  barChart: '▮▮ Bars',
  pieChart: '◕ Pie',
  groupBy: 'Group by:',
  byCategory: 'By category',
  byPayer: 'By payer',
  byWeek: 'By week',
  byMonth: 'By month',
  byYear: 'By year',
  showData: 'Show:',
  noChartData: '📊 No data to display',
  other: 'Other',
  weekLetter: 'W',
  noData: 'No data',
  total: 'Total',
  amountRequired: 'Amount * ({currency})',
  calculatorTitle: 'Calculator',
  calculatorError: 'Error',
  exchangeRateQuestion: 'Rate (1 {currency} = ?)',
  exchangeRateExample: 'e.g. 95.50',
  exchangeRateHide: '− Rate',
  exchangeRateShow: '+ Rate',
  dateTime: 'Date and time',
  internalOpDesc: 'Internal operation (not counted in statistics)',
  notePlaceholder: 'Optional — any comment on this record…',
  autofillFromDate: '✨ Filled from record {date}',
  notSelected: 'Not selected',
  amountLabel: 'Amount *',
  interestRateLabel: 'Interest (%)',
  totalReturnLent: 'Total to be returned',
  totalReturnBorrowed: 'Total to repay',
  specifyPerson: '⚠️ Specify a person',
  borrowAmountLabel: 'Amount (increase debt) *',
  repayAmountLabel: 'Amount (repayment) *',
  debtNotePlaceholder: 'Optional — any comment…',
  fieldDescSum: 'Principal deposit amount. With capitalization, it grows due to interest.',
  fieldDescRate: 'Annual interest rate. Divided by 12 for monthly calculation.',
  fieldDescStartDate: 'Deposit opening date. If set in the past, missed accruals will be calculated.',
  fieldDescTerm: 'Deposit term in months. At the end, the deposit is closed.',
  fieldDescType: 'Label for grouping and filtering. Does not affect calculations.',
  fieldDescAccrual: 'To account: interest is paid to the main account. Capitalization: interest increases the deposit amount.',
  fieldDescFrequency: 'How often interest is accrued. For "To account": monthly or at term end. Capitalization is always monthly.',
  fieldDescNote: 'Optional note.',
  creditFieldDescriptionsSub: 'Brief description of each credit form field',
  debtFieldDescriptionsSub: 'Brief description of each debt form field',
  fieldDescCreditAmount: 'Principal loan amount — what you borrowed from the bank. Interest and monthly payments are calculated from this amount.',
  fieldDescCreditRate: 'Annual interest rate. Used to calculate the monthly payment.',
  fieldDescCreditStartDate: 'Loan origination date — when the bank issued the loan. Used as the starting point for the payment schedule: months are counted from this date.',
  fieldDescCreditPaymentDay: 'Day of the month on which the monthly payment is due. For example, 15 means payment falls on the 15th each month. If not set, the day is taken from the start date.',
  fieldDescCreditTerm: 'Loan term in months. Affects the monthly payment amount and total overpayment.',
  fieldDescCreditType: 'Credit type: consumer, auto loan, or mortgage. Used for grouping and filtering.',
  fieldDescCreditMonthlyPayment: 'Fixed monthly payment amount. Calculated automatically based on amount, rate, and term.',
  fieldDescCreditBank: 'Bank name where the loan was taken. Used for grouping and filtering.',
  isEscrowLabel: 'Funds via escrow account',
  isEscrowDesc: 'Funds are transferred by the bank to the developer via escrow and do not appear in your account balance',
  fieldDescDebtAmount: 'Debt amount. If interest is set, the total amount is increased by the interest.',
  fieldDescDebtRate: 'Interest rate for borrowing. Total debt = amount + interest.',
  fieldDescDebtDateCreated: 'Date when the debt was created.',
  fieldDescDebtDueDate: 'Deadline for debt repayment. If not set, the debt is considered indefinite.',
  fieldDescDebtPerson: 'Who you owe or who owes you. Depends on the chosen direction.',
  fieldDescDebtDirection: '«They owe me» — you lent money. «I owe» — you borrowed money.',
  fieldDescCurrencyType: 'Operation type: Buy/Sell (with conversion), Add/Spend (without main currency conversion).',
  fieldDescCurrencyDateTime: 'Date and time of the operation.',
  fieldDescCurrencyTarget: 'Target currency of the operation (e.g. USD, EUR).',
  fieldDescCurrencyTargetAmount: 'Amount in target currency.',
  fieldDescCurrencyAccountAmount: 'Amount in main account currency.',
  fieldDescCurrencyRate: 'Exchange rate. Calculated automatically when both amounts are entered.',
  fieldDescCurrencyFee: 'Exchange fee (in main account currency).',
  fieldDescCurrencyProvider: 'Place or method of exchange (e.g. Bank, Exchange).',
  fieldDescCurrencyCategory: 'Category for expense/income tracking.',
  importStep1: 'Step 1 — Select a file (CSV, JSON)',
  importStep1b: 'Step 1b — Specify the path to the records array',
  importStep2: 'Step 2 — Field mapping  ({count} records found)',
  importNoFile: 'No file selected',
  importOpenFile: 'Open file…',
  importJsonPathHint: 'e.g. records  or  data.transactions',
  importNext: 'Next →',
  importFirstRecord: 'First record from file:',
  importFieldMapping: 'Configure field mapping:',
  importAccountField: 'Account field',
  importFileField: 'File field',
  importSampleValue: 'Value (1st record)',
  importTypeDetection: 'Type detection (income/expense):',
  importByFieldValue: 'By field value (income/expense, revenue/expense, etc.)',
  importByAmountSign: 'By amount sign (+ = income, − = expense)',
  importAllIncome: 'All records — income',
  importAllExpense: 'All records — expense',
  importFieldDate: 'Date (YYYY-MM-DD)',
  importFieldTime: 'Time (HH:MM)',
  importFieldType: 'Type (income/expense)',
  importFieldAmount: 'Amount',
  importFieldCategory: 'Category',
  importFieldTag: 'Tag',
  importFieldPayer: 'Payer',
  importFieldNote: 'Note',
  importFieldExchangeRate: 'Exchange rate',
  importNotImport: '— Do not import —',
  importTypeField: 'Type field',
  importIncomeValue: 'Income value',
  importExpenseValue: 'Expense value',
  importParseError: '⚠️ File parse error: {error}',
  importFileFilterData: 'Tables and data',
  importFileFilterAll: 'All files',
  importEmptyFile: 'File is empty',
  exportFormatCsv: 'CSV',
  exportFormatJson: 'JSON',
  dateRange: 'Date range',
  groupByType: 'By type',
  groupByBank: 'By bank',
  groupByQuarter: 'By quarter',
  list: 'List',
  creditAnalytics: 'Credit analytics',
  creditTotalBorrowed: 'Total borrowed',
  creditTotalRemaining: 'Total remaining',
  creditTotalPaid: 'Total paid',
  creditTotalInterest: 'Total interest',
  creditPrincipalPaid: 'Principal paid',
  creditInterestPaid: 'Interest paid',
  creditPrincipal: 'Principal',
  creditInterest: 'Bank interest',
  creditRepaymentProgress: 'Repayment progress',
  creditPaymentSchedule: 'Payment schedule',
  creditByType: 'By credit type',
  creditNoAnalyticsData: 'No analytics data',
  depositAnalytics: 'Deposit analytics',
  depositTotalBalance: 'Total balance',
  depositTotalAccrued: 'Total accrued',
  depositProjectedIncome: 'Projected income',
  depositAvgRate: 'Average rate',
  depositInterestSchedule: 'Accrual schedule',
  depositMaturityTimeline: 'Maturity timeline',
  depositByType: 'By deposit type',
  depositNoAnalyticsData: 'No analytics data',
  depositMaturitySoon: 'Closing within 6 months',
  depositActiveList: 'Active deposits',
  depositExpectedProfit: 'Expected profit',
  currencyExchange: 'Currency Exchange',
  currencyBuy: 'Buy Currency',
  currencySell: 'Sell Currency',
  currencyAdd: 'Add Currency',
  currencySpendOp: 'Spend Currency',
  newCurrencyExchange: 'New Exchange',
  buy: 'Buy',
  sell: 'Sell',
  add: 'Add',
  spend: 'Spend',
  buyButton: 'Buy',
  sellButton: 'Sell',
  addButton: 'Add',
  spendButton: 'Spend',
  amountSpent: 'Spent',
  amountReceived: 'Received',
  amountAdded: 'Added',
  targetAmount: 'Amount',
  targetAmountBuy: 'Received ({currency})',
  targetAmountSell: 'Sold ({currency})',
  targetAmountAdd: 'Added ({currency})',
  targetAmountSpend: 'Spent ({currency})',
  inAccountCurrency: 'In {currency}',
  rateLabel: '1 {currency} = ? {accountCurrency}',
  provider: 'Exchange place',
  sourceLabel: 'Source',
  whereSpent: 'Where Spent',
  feeLabel: 'Fee',
  feeIncluded: 'Already included in amount',
  placeholderBuy: 'e.g. Buying for trip to Turkey',
  placeholderSell: 'e.g. Selling after return',
  placeholderAdd: 'e.g. Brought from business trip',
  placeholderSpend: 'e.g. Hotel payment',
  currencyBalance: 'Currency Balance',
  availableBalance: 'Available: {amount} {currency}',
  insufficientBalance: 'Insufficient balance',
  currencyExchangeAdded: 'Exchange added',
  currencyExchangeUpdated: 'Exchange updated',
  currencyExchangeDeleted: 'Exchange deleted',
  noRecordCreated: 'No journal entry will be created',
  totalBought: 'Total Bought',
  totalAdded: 'Total Added',
  totalSold: 'Total Sold',
  totalSpent: 'Total Spent',
  averageRate: 'Average Rate',
  valueInAccountCurrency: 'Value in {currency}',
  currencyExchangeCat: 'Currency Purchase',
  currencySaleCat: 'Currency Sale',
  currencySpendCat: 'Currency Spending',
  currencyPurchase: 'Bought',
  currencySale: 'Sold',
  currencySpend: 'Spent',
  confirmDeleteSelectedExchanges: 'Delete selected exchanges?',
  categoryRequired: 'Select a category for spending',
  allOperationTypes: 'All Types',
  allCategories: 'All Categories',
  balanceAfter: 'Balance After',
  categoryColumn: 'Category',
  helpCurrencyBuy: 'Buying currency via bank/exchange. Creates an expense in main currency.',
  helpCurrencySell: 'Selling currency back. Creates an income in main currency.',
  helpCurrencyAdd: 'Adding cash currency you already have (from trip, gift). Creates no journal entries.',
  helpCurrencySpend: 'Spending cash currency. Creates an expense converted to main currency.',
  recordPreview: 'Record will be created:',
  expenseRecord: 'Expense',
  incomeRecord: 'Income',
  fetchingRates: 'Fetching rates...',
  rateFromAPI: 'Rate from {date}',
  rateAPIError: 'Failed to fetch rate',
  overviewAssets: 'Assets',
  overviewLiabilities: 'Liabilities',
  overviewCreditBurden: 'Credit Burden',
  overviewUpcomingPayments: 'Upcoming Payments',
  overviewMoneyFlow: 'Money Flow',
  overviewCreditBurdenChart: 'Credit Burden Dynamics',
  overviewAssetLiabilityTrend: 'Assets & Liabilities Trend',
};

const translations: Record<Locale, Translations> = { ru, en };

export function getLocale(lang: string | undefined): Locale {
  if (lang?.toLowerCase().startsWith('en')) return 'en';
  return 'ru';
}

export function getLocaleFromApp(app: App): Locale {
  try {
    const fromHtml = document.documentElement.lang;
    if (fromHtml) return getLocale(fromHtml);
  } catch {}
  try {
    const fromLocal = localStorage.getItem('language');
    if (fromLocal) return getLocale(fromLocal);
  } catch {}
  try {
    const fromConfig = (app.vault as any).getConfig?.('language');
    if (fromConfig) return getLocale(fromConfig);
  } catch {}
  return getLocale(navigator.language);
}

export function t(locale: Locale): Translations {
  return translations[locale];
}