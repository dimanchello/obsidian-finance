import { App, Modal, Notice } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';
import { FinanceStorage } from './storage';

export class OrphanedAccountsModal extends Modal {
  private tr: Translations;
  private ids: string[];
  private storage: FinanceStorage;

  constructor(app: App, ids: string[], storage: FinanceStorage) {
    super(app);
    this.tr = t(getLocaleFromApp(app));
    this.ids = ids;
    this.storage = storage;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('finance-modal');

    contentEl.createEl('h3', { text: this.tr.orphansTitle });
    contentEl.createEl('p', { text: this.tr.orphansDesc, cls: 'finance-modal-desc' });

    const list = contentEl.createDiv('finance-orphan-list');
    this.renderList(list);
  }

  private renderList(list: HTMLElement): void {
    list.empty();
    for (const id of this.ids) {
      const row = list.createDiv('finance-orphan-row');
      row.createSpan({ text: id, cls: 'finance-orphan-id' });
      const del = row.createEl('button', { text: this.tr.delete, cls: 'finance-orphan-delete' });
      del.addEventListener('click', async () => {
        await this.storage.deleteAccount(id);
        this.ids = this.ids.filter(x => x !== id);
        new Notice(this.tr.orphanDeleted);
        if (!this.ids.length) this.close();
        else this.renderList(list);
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
