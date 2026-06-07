import { App, Notice, Platform } from 'obsidian';
import { FinanceStorage } from './storage';
import {
  AccountData, FinanceRecord, PluginSettings,
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

    this.data = await this.storage.load(this.notePath);
    this.ctx.data = this.data;

    this.renderHeader();

    const body = this.root.createDiv('finance-body');

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

    const rawName = this.data?.name;
    const displayName = rawName?.trim() ? rawName : noteFilename(this.notePath);
    const nameEl     = left.createEl('h2', { text: displayName, cls: 'finance-title' });
    nameEl.title     = this.ctx.tr.clickToRename;
    nameEl.addEventListener('click', () => this.startNameEdit(nameEl));

    const curWrap = left.createDiv('finance-currency-badge');
    curWrap.title = this.ctx.tr.changeCurrency;
    this.renderCurrencyBadge(curWrap);

    const right  = header.createDiv('finance-header-right');

    const incBtn = right.createEl('button', { cls: 'finance-add-btn finance-income-btn' });
    incBtn.innerHTML = `<span class="btn-icon">↑</span><span>${this.ctx.tr.typeIncome}</span>`;

    const expBtn = right.createEl('button', { cls: 'finance-add-btn finance-expense-btn' });
    expBtn.innerHTML = `<span class="btn-icon">↓</span><span>${this.ctx.tr.typeExpense}</span>`;

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
        mkDropdownItem('📄', this.ctx.tr.records, 'records');
        mkDropdownItem('💳', this.ctx.tr.debts, 'debts');
        mkDropdownItem('🏦', this.ctx.tr.credits, 'credits');
        mkDropdownItem('📈', this.ctx.tr.deposits, 'deposits');
        dropdown.createDiv('finance-dropdown-separator');
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
        ? '2px solid var(--ft-accent)'
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
    await this.checkAutoTransactions();
    this.renderBodyContent();
  }

  private startNameEdit(el: HTMLElement): void {
    const current = el.textContent || '';
    el.contentEditable = 'true';
    el.addClass('finance-title-editing');
    el.focus();

    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const finish = async () => {
      el.contentEditable = 'false';
      el.removeClass('finance-title-editing');
      const val = el.textContent?.trim() || current;
      if (val !== current && this.data) {
        this.data.name = val;
        await this.storage.updateMeta(this.notePath, { name: val });
      }
      el.textContent = val;
    };

    el.addEventListener('blur', finish, { once: true });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') { el.textContent = current; el.blur(); }
    });
  }

  private renderCurrencyBadge(wrap: HTMLElement): void {
    const cur = this.ctx.currency;
    wrap.empty();

    const applyCurrency = async (newCur: string) => {
      if (newCur !== cur && this.data) {
        this.data.currency = newCur;
        await this.storage.updateMeta(this.notePath, { currency: newCur });
        this.ctx.data = this.data;
      }
      this.renderCurrencyBadge(wrap);
    };

    const badge = wrap.createEl('span', { text: cur, cls: 'finance-cur-badge' });

    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const existing = wrap.querySelector('.finance-cur-popup');
      if (existing) { existing.remove(); return; }

      const popup = wrap.createDiv('finance-cur-popup');

      const currencies = this.settings.customCurrencies;
      currencies.forEach(c => {
        const btn = popup.createEl('button', { text: c, cls: 'finance-cur-option' });
        if (c === cur) btn.addClass('active');
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          applyCurrency(c);
        });
      });

      const close = (ev: MouseEvent) => {
        if (!popup.contains(ev.target as Node)) {
          popup.remove();
          document.removeEventListener('click', close);
        }
      };
      setTimeout(() => document.addEventListener('click', close), 0);
    });
  }

  private applyAccentColor(color: string): void {
    this.root.style.setProperty('--ft-accent', color);
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
        new Notice(this.ctx.tr.recordAdded);
      },
    }).open();
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
        const monthlyRate = deposit.interestRate / 100 / 12;

        if (deposit.accrualType === 'capitalization') {
          let currentAmount = deposit.amount;
          for (let i = 1; i <= deposit.termMonths; i++) {
            const dueDate = new Date(startDate);
            dueDate.setMonth(dueDate.getMonth() + i);
            const dueDateStr = dueDate.toISOString().split('T')[0];
            const interest = currentAmount * monthlyRate;
            currentAmount += interest;
            const isPast = dueDateStr <= today;
            deposit.accruals.push({
              id: crypto.randomUUID(),
              amount: Math.round(interest * 100) / 100,
              dueDate: dueDateStr,
              status: isPast ? 'paid' : 'pending',
              paidDate: isPast ? dueDateStr : undefined,
            });
          }
          const pastPaidSum = deposit.accruals
            .filter(a => a.status === 'paid')
            .reduce((s, a) => s + a.amount, 0);
          if (pastPaidSum > 0) {
            deposit.amount = Math.round((deposit.amount + pastPaidSum) * 100) / 100;
          }
        } else {
          const baseAmount = deposit.amount;
          for (let i = 1; i <= deposit.termMonths; i++) {
              const dueDate = new Date(startDate);
              dueDate.setMonth(dueDate.getMonth() + i);
              const dueDateStr = dueDate.toISOString().split('T')[0];
              const interest = Math.round(baseAmount * monthlyRate * 100) / 100;
              const isPast = dueDateStr <= today;
              deposit.accruals.push({
                id: crypto.randomUUID(),
                amount: interest,
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
                  amount: interest,
                  category: 'Проценты по вкладу',
                  tag: '',
                  payer: deposit.bankName,
                  note: `Начисление процентов по вкладу "${deposit.name}"`,
                  attachmentPath: '',
                  linkedId: deposit.id,
                });
                recordsChanged = true;
              }
          }
        }
      }
      depositsChanged = true;

    if (deposit.status !== 'active') continue;

    for (const accrual of deposit.accruals) {
      if (accrual.status === 'pending' && accrual.dueDate <= today) {
        accrual.status = 'paid';
        accrual.paidDate = accrual.dueDate;

        if (deposit.accrualType === 'capitalization') {
          deposit.amount += accrual.amount;
          depositsChanged = true;
        } else {
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
    }

    const allAccrualsPaid = deposit.accruals.length > 0 && deposit.accruals.every(a => a.status === 'paid');
    if (allAccrualsPaid) {
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
