import { App, Notice } from 'obsidian';
import { FinanceBaseModal } from '../ui/FinanceBaseModal';
import { ViewContext } from '../context';
import { FinanceRecord, OVERVIEW_MODAL_PAGE_SIZE } from '../types';
import { RecordType } from '../constants';
import { fmtDate } from '../utils';
import { renderPagination } from '../ui/tabHelpers';
import { RecordModal } from '../RecordModal';
import { ConfirmModal } from '../ConfirmModal';
import type { Translations } from '../i18n';

export interface OverviewRecordsModalOptions {
  ctx: ViewContext;
  title: string;
  subtitle?: string | undefined;
  records: FinanceRecord[];
  onNavigateToRecords?: (() => void) | undefined;
  onRecordUpdated?: (() => void) | undefined;
}

export class OverviewRecordsModal extends FinanceBaseModal {
  protected tr: Translations;
  private ctx: ViewContext;
  private opts: OverviewRecordsModalOptions;
  private records: FinanceRecord[];
  private page = 0;
  private bodyContainer!: HTMLElement;

  constructor(app: App, opts: OverviewRecordsModalOptions) {
    super(app);
    this.opts = opts;
    this.ctx = opts.ctx;
    this.tr = opts.ctx.tr;
    // Filter out internal records and sort descending: date desc, time desc, createdAt desc
    this.records = opts.records
      .filter(r => !r.isInternal)
      .sort((a, b) => {
        const dateCmp = b.date.localeCompare(a.date);
        if (dateCmp !== 0) return dateCmp;
        const timeCmp = (b.time || '').localeCompare(a.time || '');
        if (timeCmp !== 0) return timeCmp;
        return b.createdAt - a.createdAt;
      });
  }

  override onOpen(): void {
    this.modalEl.addClass('finance-overview-records-modal');
    this.openHeader(this.opts.title);

    if (this.opts.subtitle) {
      this.contentEl.createEl('div', {
        text: this.opts.subtitle,
        cls: 'finance-modal-subtitle',
      });
    }

    this.bodyContainer = this.contentEl.createDiv('finance-overview-modal-body');
    this.renderContent();

    this.renderFooterButtons();
  }

  private renderContent(): void {
    this.bodyContainer.empty();

    const income = this.records
      .filter(r => r.type === RecordType.INCOME)
      .reduce((s, r) => s + r.amount, 0);
    const expense = this.records
      .filter(r => r.type === RecordType.EXPENSE)
      .reduce((s, r) => s + r.amount, 0);
    const net = income - expense;

    // Stat bar
    const statBar = this.bodyContainer.createDiv('finance-modal-stat-bar');

    const addStatPill = (label: string, valStr: string, modCls: string) => {
      const pill = statBar.createDiv(`finance-modal-stat-pill ${modCls}`);
      pill.createDiv({ text: label, cls: 'finance-modal-stat-label' });
      pill.createDiv({ text: valStr, cls: 'finance-modal-stat-val' });
    };

    addStatPill(this.tr.typeIncome, `+${this.ctx.fmt(income)}`, 'finance-stat-income');
    addStatPill(this.tr.typeExpense, `−${this.ctx.fmt(expense)}`, 'finance-stat-expense');
    addStatPill(
      this.tr.balance,
      (net >= 0 ? '+' : '−') + this.ctx.fmt(Math.abs(net)),
      net >= 0 ? 'finance-stat-positive' : 'finance-stat-negative'
    );
    addStatPill(this.tr.overviewOperationsCount, String(this.records.length), 'finance-stat-neutral');

    if (this.records.length === 0) {
      this.bodyContainer.createEl('p', {
        text: this.tr.overviewNoRecordsInPeriod,
        cls: 'finance-empty-text',
      });
      return;
    }

    const totalPages = Math.max(1, Math.ceil(this.records.length / OVERVIEW_MODAL_PAGE_SIZE));
    this.page = Math.max(0, Math.min(this.page, totalPages - 1));

    const pageRecords = this.records.slice(
      this.page * OVERVIEW_MODAL_PAGE_SIZE,
      (this.page + 1) * OVERVIEW_MODAL_PAGE_SIZE
    );

    if (this.ctx.isMobile) {
      this.renderMobileList(pageRecords);
    } else {
      this.renderDesktopTable(pageRecords);
    }

    if (totalPages > 1) {
      this.renderPagination(totalPages);
    }
  }

  private renderDesktopTable(pageRecords: FinanceRecord[]): void {
    const tableWrap = this.bodyContainer.createDiv('finance-table-wrapper');
    const table = tableWrap.createEl('table', { cls: 'finance-table finance-overview-records-table' });

    const thead = table.createEl('thead');
    const headRow = thead.createEl('tr');
    [
      this.tr.date,
      this.tr.type,
      this.tr.sum,
      this.tr.category,
      this.tr.payer,
      this.tr.note,
      '',
    ].forEach(text => headRow.createEl('th', { text, cls: 'finance-th' }));

    const tbody = table.createEl('tbody');
    pageRecords.forEach(rec => {
      const tr = tbody.createEl('tr', {
        cls: rec.type === RecordType.INCOME ? 'finance-row-income' : 'finance-row-expense',
      });

      tr.createEl('td', { text: fmtDate(rec.date, rec.time), cls: 'finance-td finance-td-date' });

      const typeTd = tr.createEl('td', { cls: 'finance-td' });
      typeTd.createSpan({
        text: rec.type === RecordType.INCOME ? this.tr.typeIncome : this.tr.typeExpense,
        cls: rec.type === RecordType.INCOME ? 'finance-type-income' : 'finance-type-expense',
      });

      const amountPrefix = rec.type === RecordType.INCOME ? '+' : '−';
      tr.createEl('td', {
        text: amountPrefix + this.ctx.fmt(rec.amount),
        cls: 'finance-td finance-amount-cell ' + (rec.type === RecordType.INCOME ? 'finance-amount-income' : 'finance-amount-expense'),
      });

      tr.createEl('td', { text: rec.category || '—', cls: 'finance-td' });

      const payerTag = rec.payer
        ? (rec.tag ? `${rec.payer} · #${rec.tag}` : rec.payer)
        : (rec.tag ? `#${rec.tag}` : '—');
      tr.createEl('td', { text: payerTag, cls: 'finance-td finance-td-muted' });

      tr.createEl('td', { text: rec.note || '—', cls: 'finance-td finance-note-cell' });

      const actTd = tr.createEl('td', { cls: 'finance-td finance-actions-td' });
      const editBtn = actTd.createEl('button', { cls: 'finance-action-btn', text: '✏️' });
      editBtn.title = this.tr.edit;
      editBtn.addEventListener('click', () => this.openEditModal(rec));

      const delBtn = actTd.createEl('button', { cls: 'finance-action-btn finance-delete-btn', text: '🗑️' });
      delBtn.title = this.tr.delete;
      delBtn.addEventListener('click', () => this.confirmDelete(rec));
    });
  }

  private renderMobileList(pageRecords: FinanceRecord[]): void {
    const listWrap = this.bodyContainer.createDiv('finance-mobile-list');
    pageRecords.forEach(rec => {
      const card = listWrap.createDiv({
        cls: `finance-record-mobile-card ${rec.type === RecordType.INCOME ? 'finance-row-income' : 'finance-row-expense'}`,
      });

      const topRow = card.createDiv('finance-card-top-row');
      topRow.createEl('span', { text: fmtDate(rec.date, rec.time), cls: 'finance-card-date' });

      const amountPrefix = rec.type === RecordType.INCOME ? '+' : '−';
      topRow.createEl('span', {
        text: amountPrefix + this.ctx.fmt(rec.amount),
        cls: 'finance-card-amount ' + (rec.type === RecordType.INCOME ? 'finance-amount-income' : 'finance-amount-expense'),
      });

      const midRow = card.createDiv('finance-card-mid-row');
      midRow.createEl('span', { text: rec.category || this.tr.uncategorized, cls: 'finance-card-category' });
      if (rec.payer) {
        midRow.createEl('span', { text: `👤 ${rec.payer}`, cls: 'finance-card-payer' });
      }
      if (rec.tag) {
        const tagText = rec.tag.startsWith('#') ? rec.tag : `#${rec.tag}`;
        midRow.createEl('span', { text: tagText, cls: 'finance-card-tag' });
      }

      if (rec.note) {
        card.createDiv({ text: rec.note, cls: 'finance-card-note' });
      }

      const actionsRow = card.createDiv('finance-card-actions-row');
      const editBtn = actionsRow.createEl('button', { cls: 'finance-action-btn', text: '✏️' });
      editBtn.title = this.tr.edit;
      editBtn.addEventListener('click', () => this.openEditModal(rec));

      const delBtn = actionsRow.createEl('button', { cls: 'finance-action-btn finance-delete-btn', text: '🗑️' });
      delBtn.title = this.tr.delete;
      delBtn.addEventListener('click', () => this.confirmDelete(rec));
    });
  }

  private renderPagination(totalPages: number): void {
    renderPagination({
      container: this.bodyContainer,
      currentPage: this.page,
      totalPages,
      isMobile: this.ctx.isMobile,
      cls: 'finance-panel-pagination',
      onPageChange: newPage => {
        this.page = newPage;
        this.renderContent();
      },
    });
  }

  private renderFooterButtons(): void {
    const btnsWrap = this.contentEl.createDiv('finance-modal-btns finance-overview-modal-btns');

    if (this.opts.onNavigateToRecords) {
      const navBtn = btnsWrap.createEl('button', {
        text: `↗️ ${this.tr.overviewOpenInRecordsTab}`,
        cls: 'finance-btn-secondary',
      });
      navBtn.addEventListener('click', () => {
        this.close();
        this.opts.onNavigateToRecords?.();
      });
    }

    const closeBtn = btnsWrap.createEl('button', {
      text: this.tr.close,
      cls: 'finance-btn-cancel',
    });
    closeBtn.addEventListener('click', () => this.close());
  }

  private openEditModal(rec: FinanceRecord): void {
    if (!this.ctx.data) return;
    new RecordModal(this.ctx.app, {
      initial: { ...rec },
      records: this.ctx.data.records.filter(r => r.id !== rec.id),
      categories: this.ctx.data.categories,
      tags: this.ctx.data.tags,
      payers: this.ctx.data.payers,
      currency: this.ctx.currency,
      settings: this.ctx.settings,
      pluginId: this.ctx.pluginId,
      onSave: async updated => {
        await this.ctx.storage.updateRecord(this.ctx.accountId, updated);
        this.ctx.data = await this.ctx.storage.load(this.ctx.accountId);
        const idx = this.records.findIndex(r => r.id === updated.id);
        if (idx !== -1) {
          if (updated.isInternal) {
            this.records.splice(idx, 1);
          } else {
            this.records[idx] = updated;
          }
        }
        this.renderContent();
        this.opts.onRecordUpdated?.();
        new Notice(this.tr.recordUpdated);
      },
    }).open();
  }

  private confirmDelete(rec: FinanceRecord): void {
    const amountPrefix = rec.type === RecordType.INCOME ? '+' : '−';
    const label = `${amountPrefix}${this.ctx.fmt(rec.amount)} · ${rec.category || '—'} · ${fmtDate(rec.date, rec.time)}`;
    new ConfirmModal(this.ctx.app, `${this.tr.confirmDeleteRecord}\n${label}`, async () => {
      await this.ctx.storage.deleteRecord(this.ctx.accountId, rec.id);
      this.ctx.data = await this.ctx.storage.load(this.ctx.accountId);
      this.records = this.records.filter(r => r.id !== rec.id);
      this.renderContent();
      this.opts.onRecordUpdated?.();
      new Notice(this.tr.deleted);
    }).open();
  }
}
