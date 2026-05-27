import { App, MarkdownView, Notice, Platform } from 'obsidian';
import { FinanceStorage } from './storage';
import {
  AccountData, FinanceRecord, PluginSettings, COMMON_CURRENCIES,
  MOBILE_BREAKPOINT,
} from './types';
import { noteFilename } from './utils';
import { RecordModal } from './RecordModal';
import { ViewContext } from './context';
import { RecordsTab } from './tabs/RecordsTab';
import { DebtsTab } from './tabs/DebtsTab';
import { CreditsTab } from './tabs/CreditsTab';
import { DepositsTab } from './tabs/DepositsTab';

export class AccountView {
  private app:      App;
  private root:     HTMLElement;
  private notePath: string;
  private storage:  FinanceStorage;
  private settings: PluginSettings;
  private pluginId: string;
  private ctx:      ViewContext;

  private data:     AccountData | null = null;
  private mode:     'records' | 'debts' | 'credits' | 'deposits' = 'records';
  private isMobile = false;

  private recordsTab!:  RecordsTab;
  private debtsTab!:    DebtsTab;
  private creditsTab!:  CreditsTab;
  private depositsTab!: DepositsTab;

  private recordsBodyEl?: HTMLElement;
  private debtsBodyEl?:   HTMLElement;
  private creditsBodyEl?: HTMLElement;
  private depositsBodyEl?: HTMLElement;

  constructor(app: App, root: HTMLElement, notePath: string, storage: FinanceStorage, settings: PluginSettings, pluginId: string) {
    this.app = app; this.root = root; this.notePath = notePath;
    this.storage = storage; this.settings = settings; this.pluginId = pluginId;
    this.ctx = new ViewContext(app, storage, notePath, pluginId, settings, root);
  }

  async render(): Promise<void> {
    this.root.empty();
    this.root.addClass('finance-tracker');

    this.isMobile = Platform.isMobile || window.innerWidth <= MOBILE_BREAKPOINT;
    this.ctx.isMobile = this.isMobile;
    if (this.isMobile) this.root.addClass('finance-tracker--mobile');

    this.renderHeader();

    const body = this.root.createDiv('finance-body');

    this.data = await this.storage.load(this.notePath);
    this.ctx.data = this.data;

    if (this.data?.accentColor) {
      this.applyAccentColor(this.data.accentColor);
    }

    await this.checkAutoTransactions();

    body.empty();
    this.renderBodyContent();
  }

  private renderHeader(): void {
    const header = this.root.createDiv('finance-header');
    const left   = header.createDiv('finance-header-left');

    const nameWrap   = left.createDiv('finance-account-name-wrap');
    const displayName = this.data?.name ?? noteFilename(this.notePath);
    const nameEl     = nameWrap.createEl('h2', { text: displayName, cls: 'finance-title' });
    nameEl.title     = 'Нажмите чтобы переименовать';
    nameEl.addEventListener('click', () => this.startNameEdit(nameEl));

    const curWrap = left.createDiv('finance-currency-badge');
    curWrap.title = 'Изменить валюту';
    this.renderCurrencyBadge(curWrap);

    const right  = header.createDiv('finance-header-right');

    const incBtn = right.createEl('button', { cls: 'finance-add-btn finance-income-btn' });
    incBtn.innerHTML = '<span class="btn-icon">↑</span><span>Доход</span>';

    const expBtn = right.createEl('button', { cls: 'finance-add-btn finance-expense-btn' });
    expBtn.innerHTML = '<span class="btn-icon">↓</span><span>Расход</span>';

    const moreWrap = right.createDiv('finance-more-dropdown');
    const moreBtn = moreWrap.createEl('button', { cls: 'finance-add-btn finance-more-btn' });
    moreBtn.innerHTML = this.isMobile ? '•••' : '•••';

    const dropdown = moreWrap.createDiv('finance-dropdown-menu');
    dropdown.style.display = 'none';

    const mkDropdownItem = (icon: string, label: string, targetMode: string) => {
      const item = dropdown.createDiv(`finance-dropdown-item${this.mode === targetMode ? ' active' : ''}`);
      item.innerHTML = `${icon} ${label}`;
      if (this.mode !== targetMode) {
        item.addEventListener('click', () => {
          this.mode = targetMode as 'records' | 'debts' | 'credits' | 'deposits';
          this.updateHeaderButtons();
          this.renderBodyContent();
          dropdown.style.display = 'none';
        });
      }
    };

    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdown.style.display === 'none') {
        dropdown.innerHTML = '';
        mkDropdownItem('📄', 'Записи', 'records');
        mkDropdownItem('💳', 'Долги', 'debts');
        mkDropdownItem('🏦', 'Кредиты', 'credits');
        mkDropdownItem('📈', 'Вклады', 'deposits');
        dropdown.createDiv('finance-dropdown-separator');
        const tmplItem = dropdown.createDiv('finance-dropdown-item');
        tmplItem.innerHTML = '📋 Вставить шаблон';
        tmplItem.addEventListener('click', () => {
          this.insertTemplate();
          dropdown.style.display = 'none';
        });
        dropdown.style.display = 'block';
      } else {
        dropdown.style.display = 'none';
      }
    });

    document.addEventListener('click', () => { dropdown.style.display = 'none'; });

    incBtn.addEventListener('click', () => { this.mode = 'records'; this.renderBodyContent(); this.openAddModal('income'); });
    expBtn.addEventListener('click', () => { this.mode = 'records'; this.renderBodyContent(); this.openAddModal('expense'); });
  }

  private updateHeaderButtons(): void {
    const moreBtn = this.root.querySelector<HTMLElement>('.finance-more-btn');
    if (moreBtn) {
      const isActive = this.mode === 'debts' || this.mode === 'credits' || this.mode === 'deposits';
      moreBtn.style.border = isActive
        ? '2px solid var(--color-accent, #7c3aed)'
        : '2px solid transparent';
    }
  }

  private renderBodyContent(): void {
    const body = this.root.querySelector<HTMLElement>('.finance-body');
    if (!body) return;
    body.empty();

    if (this.mode === 'debts') {
      this.renderDebtsTab(body);
    } else if (this.mode === 'credits') {
      this.renderCreditsTab(body);
    } else if (this.mode === 'deposits') {
      this.renderDepositsTab(body);
    } else {
      this.renderRecordsTab(body);
    }
  }

  private renderRecordsTab(body: HTMLElement): void {
    if (!this.recordsTab) {
      this.recordsTab = new RecordsTab(this.ctx, body);
    } else {
      this.recordsTab = new RecordsTab(this.ctx, body);
    }
    this.recordsBodyEl = body;
    this.recordsTab.render();
  }

  private renderDebtsTab(body: HTMLElement): void {
    if (!this.debtsTab) {
      this.debtsTab = new DebtsTab(this.ctx, body);
    } else {
      this.debtsTab = new DebtsTab(this.ctx, body);
    }
    this.debtsBodyEl = body;
    this.debtsTab.onUpdate = () => this.refreshAndRender();
    this.debtsTab.render();
  }

  private renderCreditsTab(body: HTMLElement): void {
    if (!this.creditsTab) {
      this.creditsTab = new CreditsTab(this.ctx, body);
    } else {
      this.creditsTab = new CreditsTab(this.ctx, body);
    }
    this.creditsBodyEl = body;
    this.creditsTab.render();
  }

  private renderDepositsTab(body: HTMLElement): void {
    if (!this.depositsTab) {
      this.depositsTab = new DepositsTab(this.ctx, body);
    } else {
      this.depositsTab = new DepositsTab(this.ctx, body);
    }
    this.depositsBodyEl = body;
    this.depositsTab.onUpdate = () => this.refreshAndRender();
    this.depositsTab.render();
  }

  private async refreshAndRender(): Promise<void> {
    this.data = await this.storage.load(this.notePath);
    this.ctx.data = this.data;
    this.renderBodyContent();
  }

  private startNameEdit(el: HTMLElement): void {
    const current = el.textContent || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = current;
    input.className = 'finance-title-input';
    input.style.fontSize = '1.3em';
    input.style.fontWeight = '600';

    el.innerHTML = '';
    el.appendChild(input);
    input.focus();
    input.select();

    const finish = async () => {
      const val = input.value.trim() || current;
      if (val !== current && this.data) {
        this.data.name = val;
        await this.storage.updateMeta(this.notePath, { name: val });
      }
      el.textContent = val;
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') { input.blur(); }
      if (e.key === 'Escape') { el.textContent = current; }
    });
  }

  private renderCurrencyBadge(wrap: HTMLElement): void {
    const cur = this.ctx.currency;
    wrap.empty();
    const badge = wrap.createEl('span', { text: cur, cls: 'finance-currency-label' });

    badge.addEventListener('click', async (e) => {
      e.stopPropagation();
      const select = document.createElement('select');
      select.className = 'finance-currency-select';
      COMMON_CURRENCIES.forEach(c => {
        const o = document.createElement('option');
        o.value = c; o.textContent = c;
        if (c === cur) o.selected = true;
        select.appendChild(o);
      });
      const customOpt = document.createElement('option');
      customOpt.value = '__custom__'; customOpt.textContent = 'Своя…';
      select.appendChild(customOpt);

      badge.innerHTML = '';
      badge.appendChild(select);
      select.focus();

      select.addEventListener('change', async () => {
        let newCur = select.value;
        if (newCur === '__custom__') {
          newCur = prompt('Введите валюту:', cur) ?? cur;
        }
        if (newCur !== cur && this.data) {
          this.data.currency = newCur;
          await this.storage.updateMeta(this.notePath, { currency: newCur });
          this.ctx.data = this.data;
        }
        this.renderCurrencyBadge(wrap);
      });
    });
  }

  private applyAccentColor(color: string): void {
    this.root.style.setProperty('--finance-accent', color);
  }

  private openAddModal(type: 'income' | 'expense'): void {
    if (!this.data) return;
    new RecordModal(this.app, {
      initial: { type },
      records: this.data.records,
      categories: this.data.categories,
      tags: this.data.tags,
      payers: this.data.payers,
      currency: this.ctx.currency,
      settings: this.settings,
      pluginId: this.pluginId,
      onSave: async rec => {
        await this.storage.addRecord(this.notePath, rec);
        this.data = await this.storage.load(this.notePath);
        this.ctx.data = this.data;
        this.renderBodyContent();
        new Notice('✅ Запись добавлена');
      },
    }).open();
  }

  private insertTemplate(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice('⚠️ Откройте заметку для вставки');
      return;
    }
    const editor = view.editor;
    const template = '```finance-account\n\n```';
    editor.replaceSelection(template);
    const cursor = editor.getCursor();
    editor.setCursor(cursor.line - 1, 0);
    new Notice('✅ Шаблон счёта вставлен');
  }

  private async checkAutoTransactions(): Promise<void> {
    if (!this.data) return;
    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toTimeString().slice(0, 5);
    let depositsChanged = false;
    let creditsChanged = false;
    let recordsChanged = false;

    for (const deposit of this.data.deposits) {
      if (!deposit.accruals) deposit.accruals = [];
      if (!deposit.accruals.length && deposit.termMonths > 0 && deposit.amount > 0 && deposit.startDate) {
        const startDate = new Date(deposit.startDate);
        const termMonths = deposit.termMonths;
        const createAccruals = (accrualType: string) => {
          if (accrualType === 'capitalization' || accrualType === 'capitalization_at_end') {
            const monthsStep = deposit.paymentFrequency === 'monthly' ? 1 : 3;
            for (let i = monthsStep; i <= termMonths; i += monthsStep) {
              const dueDate = new Date(startDate);
              dueDate.setMonth(dueDate.getMonth() + i);
              const dueDateStr = dueDate.toISOString().split('T')[0];
              const interestAmount = (deposit.amount * deposit.interestRate / 100) * (monthsStep / 12);
              const isPast = dueDateStr <= today;
              deposit.accruals.push({
                id: crypto.randomUUID(),
                amount: Math.round(interestAmount * 100) / 100,
                dueDate: dueDateStr,
                status: isPast ? 'paid' : 'pending',
                paidDate: isPast ? dueDateStr : undefined,
              });
              if (isPast && deposit.status === 'active') {
                this.data!.records.push({
                  id: crypto.randomUUID(),
                  createdAt: Date.now(),
                  date: dueDateStr,
                  time: nowTime,
                  type: 'income',
                  amount: Math.round(interestAmount * 100) / 100,
                  category: 'Проценты по вкладу',
                  tag: '',
                  payer: deposit.bankName,
                  note: `Начисление процентов по вкладу "${deposit.name}"`,
                  attachmentPath: '',
                });
                recordsChanged = true;
              }
            }
          } else if (accrualType === 'end_of_term') {
            const endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + termMonths);
            const endDateStr = endDate.toISOString().split('T')[0];
            const totalInterest = (deposit.amount * deposit.interestRate / 100) * (termMonths / 12);
            const isPast = endDateStr <= today;
            deposit.accruals.push({
              id: crypto.randomUUID(),
              amount: Math.round(totalInterest * 100) / 100,
              dueDate: endDateStr,
              status: isPast ? 'paid' : 'pending',
              paidDate: isPast ? endDateStr : undefined,
            });
            if (isPast && deposit.status === 'active') {
              this.data!.records.push({
                id: crypto.randomUUID(),
                createdAt: Date.now(),
                date: endDateStr,
                time: nowTime,
                type: 'income',
                amount: Math.round(totalInterest * 100) / 100,
                category: 'Проценты по вкладу',
                tag: '',
                payer: deposit.bankName,
                note: `Начисление процентов по вкладу "${deposit.name}"`,
                attachmentPath: '',
              });
              recordsChanged = true;
            }
          }
        };
        createAccruals(deposit.accrualType);
        depositsChanged = true;
      }

      if (deposit.status !== 'active') continue;
      for (const accrual of deposit.accruals) {
        if (accrual.status === 'pending' && accrual.dueDate <= today) {
          accrual.status = 'paid';
          accrual.paidDate = accrual.dueDate;

          const record: FinanceRecord = {
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            date: accrual.dueDate,
            time: nowTime,
            type: 'income',
            amount: accrual.amount,
            category: 'Проценты по вкладу',
            tag: '',
            payer: deposit.bankName,
            note: `Начисление процентов по вкладу "${deposit.name}"`,
            attachmentPath: '',
            linkedId: deposit.id,
          };
          this.data.records.push(record);
          recordsChanged = true;
        }
      }
      const allPastAccrued = deposit.accruals.length > 0 && deposit.accruals.every(a => a.dueDate <= today && a.status === 'paid');
      if (allPastAccrued) {
        deposit.status = 'closed';
        depositsChanged = true;

        const refundRec: FinanceRecord = {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          date: today,
          time: nowTime,
          type: 'income',
          amount: deposit.amount,
          category: 'Возврат вклада',
          tag: '',
          payer: deposit.bankName,
          note: `Возврат вклада "${deposit.name}"`,
          attachmentPath: '',
          linkedId: deposit.id,
        };
        this.data.records.push(refundRec);
        recordsChanged = true;
      }
    }

    for (const credit of this.data.credits) {
      if (credit.status !== 'active') continue;
      if (!credit.payments) credit.payments = [];
      if (!credit.payments.length && credit.monthlyPayment > 0 && credit.startDate) {
        const startDate = new Date(credit.startDate);
        const termMonths = credit.termMonths;
        for (let i = 1; i <= termMonths; i++) {
          const dueDate = new Date(startDate);
          dueDate.setMonth(dueDate.getMonth() + i);
          const dueDateStr = dueDate.toISOString().split('T')[0];
          const isPast = dueDateStr <= today;
          credit.payments.push({
            id: crypto.randomUUID(),
            amount: credit.monthlyPayment,
            dueDate: dueDateStr,
            status: isPast ? 'paid' : 'pending',
            paidDate: isPast ? dueDateStr : undefined,
          });
          if (isPast) {
            const rec: FinanceRecord = {
              id: crypto.randomUUID(),
              createdAt: Date.now(),
              date: dueDateStr,
              time: nowTime,
              type: 'expense',
              amount: credit.monthlyPayment,
              category: 'Кредит',
              tag: '',
              payer: credit.bankName,
              note: `Платёж по кредиту "${credit.name}"`,
              attachmentPath: '',
              linkedId: credit.id,
            };
            this.data.records.push(rec);
            recordsChanged = true;
          }
        }
        creditsChanged = true;
      }

      for (const payment of credit.payments) {
        if (payment.status === 'pending' && payment.dueDate <= today) {
          payment.status = 'paid';
          payment.paidDate = payment.dueDate;

          if (this.data) {
            this.data.records.push({
              id: crypto.randomUUID(),
              createdAt: Date.now(),
              date: payment.dueDate,
              time: nowTime,
              type: 'expense',
              amount: payment.amount,
              category: 'Кредит',
              tag: '',
              payer: credit.bankName,
              note: `Платёж по кредиту "${credit.name}"`,
              attachmentPath: '',
              linkedId: credit.id,
            });
            recordsChanged = true;
          }
        }
      }

      const paidAmount = credit.payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
      if (paidAmount >= credit.originalAmount) {
        credit.status = 'paid';
        creditsChanged = true;
      }
    }

    if (recordsChanged || depositsChanged || creditsChanged) {
      await this.storage.saveAllRecords(this.notePath, this.data.records);
      if (depositsChanged) await this.storage.saveAllDeposits(this.notePath, this.data.deposits);
      if (creditsChanged) await this.storage.saveAllCredits(this.notePath, this.data.credits);
    }
  }
}
