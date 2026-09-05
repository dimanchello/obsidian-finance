# Obsidian Finance Development Guide

Этот документ описывает процесс разработки для Obsidian Finance плагина с использованием AI-навыков.

## Доступные навыки

Навыки находятся в `.claude/skills/` внутри проекта и доступны только при работе с этим репозиторием.

### 1. `/obsidian-finance-plan`
**Назначение:** Создание плана реализации новой функции или значительного изменения.

**Когда использовать:**
- Добавление новой функциональности
- Значительные рефакторинги
- Изменения, затрагивающие несколько подсистем
- Когда неясна архитектура решения

**Что делает:**
- Анализирует `CODEBASE.md` для понимания архитектуры
- Определяет затронутые модули и зависимости
- Создаёт пошаговый план реализации
- Документирует edge cases и open questions
- Оценивает сложность (Low/Medium/High)

**Результат:** Файл `implementation-plan-[feature-name].md` с детальным планом.

---

### 2. `/obsidian-finance-implement`
**Назначение:** Реализация функции по плану или небольших изменений.

**Когда использовать:**
- После утверждения плана из `/obsidian-finance-plan`
- Для bug fixes
- Для небольших доработок

**Что делает:**
- Читает `CODEBASE.md` для навигации
- Следует установленным паттернам архитектуры
- Реализует изменения пошагово
- Проверяет каждый шаг (lint, build, test)
- Следует всем conventions из `CLAUDE.md`

**Результат:** Рабочий код, прошедший все проверки.

---

### 3. `/obsidian-finance-sync-docs`
**Назначение:** Синхронизация `CODEBASE.md` после реализации.

**Когда использовать:**
- После завершения реализации новой функции
- После значительного рефакторинга
- Когда добавлены новые модули или изменены execution flows

**Что делает:**
- Обновляет "Core Modules" для новых модулей
- Добавляет символы в "Symbol Index"
- Обновляет "Execution Flows" при изменении потоков
- Документирует новые паттерны в "Architecture" или "Non-obvious Details"

**Результат:** Актуальный `CODEBASE.md`, отражающий текущую архитектуру.

---

### 4. `/obsidian-finance-review`
**Назначение:** Код-ревью и проверка покрытия тестами.

**Когда использовать:**
- После завершения реализации (перед коммитом)
- Для проверки PR
- Для аудита существующего кода
- Для проверки покрытия тестами

**Что делает:**
- Проверяет соответствие архитектуре (паттерны из `CODEBASE.md`)
- Проверяет качество кода (типы, константы, именование)
- Проверяет корректность бизнес-логики (расчёты, edge cases)
- **Проверяет покрытие тестами:**
  - Domain logic: 90%+
  - Storage: 80%+
  - Auto-transactions: 85%+
  - Critical paths (money/date math): 100%
- Проверяет mobile support (<480px)
- Проверяет i18n completeness (ru + en)
- Выявляет отсутствующие тесты
- Создаёт структурированный отчёт

**Результат:** Детальный отчёт с оценкой (✅ Approved / ⚠️ Needs Changes / ❌ Major Issues) и списком required changes.

---

## Workflow для разных задач

### Сценарий 1: Новая большая функция (новая вкладка, новая сущность)

```bash
# Шаг 1: Планирование (AI ЗАДАСТ ВОПРОСЫ если что-то неясно!)
/obsidian-finance-plan

# AI создаст файл implementation-plan-[feature].md
# Просмотри план, задай вопросы, утверди

# Шаг 2: Реализация
/obsidian-finance-implement

# AI реализует по плану, проверит lint/build/test

# Шаг 3: Код-ревью и тесты
/obsidian-finance-review

# AI проверит архитектуру, качество, покрытие тестами
# Исправь issues, добавь недостающие тесты

# Шаг 4: Синхронизация документации
/obsidian-finance-sync-docs

# AI обновит CODEBASE.md
```

**Пример:** Добавление вкладки "Бюджеты" с категориями, лимитами и аналитикой.

---

### Сценарий 2: Средняя доработка (новая модалка, новый domain модуль)

```bash
# Можно сразу начать с реализации
/obsidian-finance-implement

# Опционально: если нужен план
/obsidian-finance-plan

# После реализации — ревью
/obsidian-finance-review

# Исправить issues, добавить тесты

# Синхронизация документации
/obsidian-finance-sync-docs
```

**Пример:** Добавление поля "Контрагент" к записям доходов/расходов.

---

### Сценарий 3: Bug fix или мелкая доработка

```bash
# Просто исправить
/obsidian-finance-implement

# Опционально: ревью если исправление сложное
/obsidian-finance-review

# Обычно CODEBASE.md не требует обновления
```

**Пример:** Исправление бага с сортировкой по дате.

---

### Сценарий 4: Код-ревью существующего кода

```bash
# Ревью без изменений
/obsidian-finance-review

# AI проанализирует код и выдаст отчёт
# Особое внимание на покрытие тестами
```

**Пример:** Проверка покрытия тестами для модуля autoTransactions.

---

## Как AI использует документацию

### До начала работы:
1. Читает `CODEBASE.md` → понимает архитектуру, находит нужные модули
2. Читает `CLAUDE.md` → понимает conventions, паттерны, правила
3. Читает план (если есть) → следует пошаговой инструкции

### Во время работы:
- Использует Symbol Index для поиска определений
- Следует Execution Flows для понимания потоков данных
- Применяет паттерны из Architecture sections
- Проверяет Non-obvious Details на подводные камни

### После работы:
- Обновляет `CODEBASE.md` если изменилась архитектура
- Обновляет `README.md` если изменилась функциональность

---

## Ключевые правила

### ✅ Обязательно

1. **Всегда читать `CODEBASE.md` перед началом работы**
2. **Следовать паттернам из существующего кода** (не изобретать новые)
3. **Проверять lint/build/test после каждого изменения**
4. **Использовать AccountCommands для операций с linkedId**
5. **Добавлять все строки UI в i18n.ts (ru + en)**
6. **Тестировать mobile layout (<480px)**
7. **Обновлять CODEBASE.md при архитектурных изменениях**

### ❌ Запрещено

1. **Сканировать весь src/ без причины** (используй CODEBASE.md для навигации)
2. **Изобретать новую архитектуру** (следуй существующей)
3. **Вызывать storage напрямую** если есть linkedId (используй AccountCommands)
4. **Хардкодить magic numbers** (все в константы)
5. **Хардкодить UI строки** (только через i18n)
6. **Игнорировать mobile** (обязательная адаптация)
7. **Пушить без проверок** (lint + build + test обязательны)

---

## Типичные паттерны

### Добавление новой сущности с linked records

1. **Types** (`src/types.ts`): добавить interface
2. **Storage** (`src/storage/index.ts`): добавить FileStore + CRUD
3. **Domain** (`src/domain/AccountCommands.ts`): добавить transactional методы
4. **Domain** (`src/domain/linkedRecords.ts`): функции создания linked records
5. **Tab** (`src/tabs/NewTab.ts`): использовать DataTable + AccountCommands
6. **Modal** (`src/NewModal.ts`): extends EntityModal
7. **Wire** (`src/AccountView.ts`, `src/AccountHeader.ts`): интеграция
8. **i18n** (`src/i18n.ts`): все строки UI

### Добавление авто-транзакций (scheduled records)

1. Реализовать в `src/domain/autoTransactions.ts`:
   - `processEntity()` функция
   - Интеграция с `applyAutoTransactions()`
2. Использовать `RecordMirror` для idempotency
3. Генерировать schedule через `src/domain/schedule.ts`

### Добавление фильтра/сортировки

1. **Types**: добавить поля в FilterState/SortState
2. **Domain** (`src/domain/viewState.ts`): defaults
3. **Tab**: 
   - `filterControls()` → добавить FilterControl
   - `getFiltered()` → применить фильтр

---

## Проверка качества

### Перед коммитом:

```bash
# 1. Lint (0 ошибок, warnings OK только no-explicit-any)
npm run lint

# 2. Build (должен пройти чисто)
npm run build

# 3. Tests (все зелёные)
npm test
```

### Ручное тестирование:

- [ ] Функция работает на desktop
- [ ] Функция работает на mobile (<480px)
- [ ] Русский язык работает
- [ ] Английский язык работает
- [ ] Состояние сохраняется (перезагрузка заметки)
- [ ] Linked records синхронизируются (если применимо)
- [ ] Auto-transactions работают (если применимо)

---

## Структура файлов проекта

```
obsidian-finance/
├── CODEBASE.md                    # Архитектурный индекс (навигация)
├── CLAUDE.md                      # Conventions и правила
├── AGENTS.md                      # Устаревшая документация (reference only)
├── README.md / README.en.md       # Пользовательская документация
├── main.ts                        # Plugin entry point
├── styles.css                     # Все стили
├── src/
│   ├── types.ts                   # Все TypeScript типы
│   ├── constants.ts               # Константы
│   ├── i18n.ts                    # Переводы (ru, en)
│   ├── utils.ts                   # Shared utilities
│   ├── context.ts                 # ViewContext
│   ├── AccountView.ts             # Main view controller
│   ├── AccountHeader.ts           # Header component
│   ├── AutoTxScheduler.ts         # Hourly scheduler
│   ├── domain/                    # Business logic (pure functions)
│   │   ├── AccountCommands.ts     # Transactional CRUD
│   │   ├── autoTransactions.ts    # Schedule generation
│   │   ├── linkedRecords.ts       # Linked record helpers
│   │   ├── schedule.ts            # Credit/deposit schedules
│   │   ├── *Calculations.ts       # Math operations
│   │   ├── validate.ts            # Parsers
│   │   └── viewState.ts           # State parsing
│   ├── storage/                   # Persistence layer
│   │   ├── index.ts               # FinanceStorage facade
│   │   ├── AccountRepo.ts         # FileStore + FlushScheduler
│   │   ├── AccountFiles.ts        # Path calculations
│   │   └── VaultAdapter.ts        # Obsidian vault wrapper
│   ├── tabs/                      # Tab implementations
│   │   ├── OverviewTab.ts         # Dashboard
│   │   ├── RecordsTab.ts          # Income/expense
│   │   ├── DebtsTab.ts            # Debts
│   │   ├── CreditsTab.ts          # Credits
│   │   ├── DepositsTab.ts         # Deposits
│   │   └── CurrencyTab.ts         # Currency exchanges
│   ├── ui/                        # Reusable UI components
│   │   ├── EntityModal.ts         # Base modal class
│   │   ├── DataTable.ts           # Generic table component
│   │   ├── AmountInput.ts         # Money input
│   │   ├── formHelpers.ts         # Form utilities
│   │   └── chartHelpers.ts        # Chart rendering
│   ├── __tests__/                 # Vitest tests
│   └── [Modals].ts                # Entity modals (15+)
└── .claude/skills/               # AI навыки (локальные для проекта)
    ├── obsidian-finance-plan.md
    ├── obsidian-finance-implement.md
    ├── obsidian-finance-sync-docs.md
    └── obsidian-finance-review.md
```

---

## Примеры использования

### Пример 1: Добавить категории бюджета

```
Пользователь: "Нужно добавить бюджеты по категориям. Пользователь задаёт 
месячный лимит на категорию и видит, сколько потратил из лимита."

AI: /obsidian-finance-plan

AI создаст план:
- Новый интерфейс BudgetRecord
- FileStore для budgets.json
- BudgetsTab с DataTable
- BudgetModal для CRUD
- Интеграция с RecordsTab для отображения прогресса

Пользователь утверждает план

AI: /obsidian-finance-implement
[реализует по шагам из плана]

AI: /obsidian-finance-sync-docs
[обновляет CODEBASE.md]
```

### Пример 2: Исправить баг с сортировкой

```
Пользователь: "Сортировка по дате не работает, когда время пустое"

AI: [читает CODEBASE.md → находит RecordsTab]
    [читает src/tabs/RecordsTab.ts]
    [находит баг в compareValues]
    [исправляет]
    [запускает npm run lint && npm run build && npm test]
    
Готово. CODEBASE.md обновлять не нужно (архитектура не изменилась).
```

### Пример 3: Добавить поле "Примечание" к долгам

```
Пользователь: "Нужно поле note для DebtRecord"

AI: /obsidian-finance-implement

AI:
1. Добавит note: string в DebtRecord (types.ts)
2. Обновит parseDebts в validate.ts (backfill note ??= '')
3. Добавит поле в DebtModal
4. Проверит lint/build/test

AI: /obsidian-finance-sync-docs
[обновит описание DebtRecord в CODEBASE.md]
```

---

## FAQ

**Q: Когда использовать plan, а когда сразу implement?**  
A: Если изменение затрагивает >5 файлов или вводит новый паттерн — plan. Иначе — сразу implement.

**Q: Нужно ли всегда обновлять CODEBASE.md?**  
A: Только если изменилась архитектура (новые модули, flows, паттерны). Bug fixes обычно не требуют обновления.

**Q: Что делать, если lint/build/test падает?**  
A: Исправить до полного прохождения. Задача не завершена, пока проверки не проходят.

**Q: Можно ли изменить существующую архитектуру?**  
A: Только если есть веская причина. По умолчанию — следуй существующим паттернам.

**Q: Как тестировать mobile?**  
A: В браузере Developer Tools → Toggle Device Toolbar → выбрать mobile устройство или задать ширину <480px.

**Q: Где хранятся данные аккаунтов?**  
A: `.obsidian/plugins/obsidian-finance/accounts/<accountId>/` — 7 JSON файлов на аккаунт.

---

## Поддержка

При проблемах с навыками:
1. Проверь, что `CODEBASE.md` актуален
2. Проверь, что `CLAUDE.md` содержит правильные conventions
3. Посмотри примеры в существующем коде (Reference patterns)

Навыки постоянно улучшаются на основе фидбека.
