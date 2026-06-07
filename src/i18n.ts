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
  uncategorized: string;
  notSpecified: string;
  lentGiven: string;
  borrowedTaken: string;
  creditDefaultCat: string;
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
  fileNotFoundWithPath: string;
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
  rate: 'Ставка',
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
  uncategorized: 'Без категории',
  notSpecified: 'Не указан',
  lentGiven: 'Дано в долг',
  borrowedTaken: 'Взято в долг',
  creditDefaultCat: 'Кредит',
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
  uncategorized: 'Uncategorized',
  notSpecified: 'Not specified',
  lentGiven: 'Given as debt',
  borrowedTaken: 'Taken as debt',
  creditDefaultCat: 'Credit',
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