[🇷🇺 Русский](README.md)

---

# 💰 Finance Tracker — Obsidian plugin

Track income and expenses directly in your Obsidian notes.  
Each note is a separate **account** (cash, card, crypto wallet, etc.).

**Version:** 2.0.0 | **Min Obsidian Version:** 1.4.0

---

## Installation

### Option 1: Manual

```bash
npm install
npm run build
```

Copy the contents of `dist/` to `.obsidian/plugins/obsidian-finance/`

Then: Obsidian Settings → Community plugins → enable **Finance Tracker**.

### Option 2: Via BRAT

1. Install **BRAT** plugin (Beta Reviewers Auto-update Tool)
2. Run command: `BRAT: Add a beta plugin for testing`
3. Enter repo: `https://github.com/dimanchello/obsidian-finance`
4. Confirm → plugin installs automatically

---

## Language

Plugin auto-detects language from Obsidian settings:
- 🇷🇺 **Russian** (default)
- 🇬🇧 **English**

---

## Usage

Insert in any note:

````markdown
```finance-account
```
````

Use `Insert account template` command from the command palette.

<img src="assets/screenshots/records_usage.png" width="700" alt="Finance-account code block in a note">

---

## Features

### Tab Navigation
Each account has four tabs, switched via the `•••` menu:

- **Records** — income and expenses
- **Debts** — debt tracking
- **Credits** — loans with payment schedules
- **Deposits** — savings with interest accruals

### Account
| | |
|---|---|
| **Name** | Click the title → edit inline |
| **Currency** | Click the badge next to the title → select from list or custom |
| **Accent color** | Picker in the account header |

<img src="assets/screenshots/account-header.png" width="700" alt="Account header: name, currency, accent color">

### Records
- Only **Amount** is required
- **Date** and **Time** side by side
- **Smart autocomplete**: entering a category or payer auto-fills amount, tag, and the other field from the last matching record (shows "✨ data substituted" badge)
- **Note** — visually highlighted with accent color
- **Internal operations**: 🔄 button in the "Payer" field marks a record as internal — excluded from stats. Filter "Internal" in the filter panel shows only such records.
- **Calculator**: 🧮 button in the amount field opens a built-in calculator

<img src="assets/screenshots/records_add.png" width="700" alt="Add record modal">

### Table
- Desktop: full table with sticky header
- Mobile: each record renders as a card with field labels
- **Column visibility**: show/hide columns via ⚙️ menu

<img src="assets/screenshots/records-table.png" width="700" alt="Records table on desktop">
<img src="assets/screenshots/mobile-cards.png" width="700" alt="Mobile card layout">

### Filters & Sorting
- Search across all fields
- Filter by type (income/expense), category, tag, payer, dates
- Sort by date, amount, category, date added
- Filter state persists per note

<img src="assets/screenshots/filters.png" width="700" alt="Filters and sorting panel">

### Analytics
- Statistics: income, expenses, balance (including debts)
- Charts by category and month

<img src="assets/screenshots/analytics.png" width="700" alt="Analytics charts">

### Attachments
- Photo receipts and documents
- Attached to records and open in Obsidian

### Import / Export
**Export:** CSV, JSON, XML

**Import:**
1. Select file (.csv / .json / .xml)
2. For JSON — specify array path (e.g. `data.records`)
3. For XML — specify record tag (auto-detected)
4. Map file fields to account fields
5. Choose type detection: by field, by amount sign, or all income/expense
6. Click "Import"

<img src="assets/screenshots/import.png" width="700" alt="Import window with field mapping">

### Debts
- Two directions: "Owed to me" (lent) and "I owe" (borrowed)
- Payment tracking: borrow → repay
- Auto-calculated balance
- Interest rate and due date
- Filters by status (paid/unpaid), direction, person, dates
- Movement history for each debt

<img src="assets/screenshots/debts.png" width="700" alt="Debts tab">

### Credits
- Types: consumer, auto loan, mortgage
- Monthly payment schedule
- Automatic payment creation and expense records
- Early repayment (reduce amount or term)
- Status tracking: active / paid

<img src="assets/screenshots/credits.png" width="700" alt="Credits tab">

### Deposits
- Types: term, demand, savings
- Automatic monthly interest calculation
- Accrual type: to account or capitalization
- Top-ups and partial withdrawals
- Automatic income records on interest accrual
- Automatic deposit closure at term end

<img src="assets/screenshots/deposits.png" width="700" alt="Deposits tab">

### Plugin Settings
- **Default currency** for new accounts
- **Currency management**: add, remove, reorder currencies via drag-and-drop
- **Records per page**

---

## Data Structure

Data is stored in `.obsidian/plugins/obsidian-finance/accounts/` in separate files per account:

```
.obsidian/plugins/obsidian-finance/accounts/
  Finance_Accounts_Cash.md/
    meta.json       # name, currency, accent color
    records.json    # income/expense records
    debts.json      # debts
    credits.json    # credits
    deposits.json   # deposits
```

### meta.json
```json
{
  "version": 4,
  "name": "Sberbank Card",
  "currency": "₽",
  "accentColor": "#7c3aed"
}
```

### records.json
```json
{
  "version": 4,
  "records": [
    {
      "id": "uuid",
      "createdAt": 1700000000000,
      "date": "2024-11-15",
      "time": "14:30",
      "type": "expense",
      "amount": 1500.00,
      "category": "Groceries",
      "tag": "food",
      "payer": "Ivan",
      "note": "Supermarket",
      "attachmentPath": "",
      "isInternal": false
    }
  ],
  "categories": ["Groceries", "Transport"],
  "tags": ["food"],
  "payers": ["Ivan"]
}
```

---

## Development

```bash
npm run dev     # Watch mode
npm run build   # Build to dist/
npm test        # Unit tests
npm run lint    # ESLint check
```

---

## Roadmap

- [x] CRUD records with date and time
- [x] Inline account name editing
- [x] Per-account currency
- [x] Filters and sorting with persistence
- [x] Pagination
- [x] Statistics (income/expenses/balance)
- [x] Smart autocomplete
- [x] Attachments (photo receipts)
- [x] Import CSV/JSON/XML with field mapping
- [x] Export CSV/JSON/XML
- [x] Mobile responsive layout
- [x] Debt system
- [x] Analytics with charts
- [x] Multi-language (RU/EN)
- [x] Internal operations (excluded from stats)
- [x] Credit management
- [x] Deposit management
- [x] Auto-accruals for deposits and payments for credits
- [x] Table column visibility
- [x] Built-in calculator

---

## License

MIT
