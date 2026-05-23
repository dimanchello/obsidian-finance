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
  records: string;
  noRecords: string;
  noRecordsFilter: string;
  tryChangeFilters: string;
  addRecord: string;
  settings: string;
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
  creditPayments: string;
  depositAccruals: string;
  earlyRepayment: string;
  repayAmount: string;
  repayTerm: string;
  partialRepayment: string;
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
  capitalization: string;
  endOfTerm: string;
  capitalizationAtEnd: string;
  paymentFrequencyMonthly: string;
  paymentFrequencyQuarterly: string;
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
  income: '↑ Доход',
  expense: '↓ Расход',
  debts: '💳 Долги',
  credits: '🏦 Кредиты',
  deposits: '📈 Вклады',
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
  lent: '💸 Мне должны',
  borrowed: '💳 Я должен',
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
  analytics: '📈 Аналитика',
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
  creditPayments: 'Платежи',
  depositAccruals: 'Начисления',
  earlyRepayment: 'Досрочное погашение',
  repayAmount: 'Гасить сумму',
  repayTerm: 'Гасить срок',
  partialRepayment: 'Частичное',
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
  capitalization: 'На счёт (капитализация)',
  endOfTerm: 'В конце срока',
  capitalizationAtEnd: 'В конце срока с капитализацией',
  paymentFrequencyMonthly: 'Ежемесячно',
  paymentFrequencyQuarterly: 'Ежеквартально',
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
  income: '↑ Income',
  expense: '↓ Expense',
  debts: '💳 Debts',
  credits: '🏦 Credits',
  deposits: '📈 Deposits',
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
  lent: '💸 Owed to me',
  borrowed: '💳 I owe',
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
  analytics: '📈 Analytics',
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
  creditPayments: 'Payments',
  depositAccruals: 'Accruals',
  earlyRepayment: 'Early repayment',
  repayAmount: 'Repay amount',
  repayTerm: 'Repay term',
  partialRepayment: 'Partial',
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
  capitalization: 'To account (capitalization)',
  endOfTerm: 'At end of term',
  capitalizationAtEnd: 'At end with capitalization',
  paymentFrequencyMonthly: 'Monthly',
  paymentFrequencyQuarterly: 'Quarterly',
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
};

const translations: Record<Locale, Translations> = { ru, en };

export function getLocale(lang: string | undefined): Locale {
  if (lang?.startsWith('en')) return 'en';
  return 'ru';
}

export function t(locale: Locale): Translations {
  return translations[locale];
}