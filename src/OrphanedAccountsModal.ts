import { App, Notice } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';
import { FinanceStorage } from './storage';
import { FinanceBaseModal } from './ui/FinanceBaseModal';

export class OrphanedAccountsModal extends FinanceBaseModal {
  protected tr: Translations;
  private ids: string[];
  private storage: FinanceStorage;

  constructor(app: App, ids: string[], storage: FinanceStorage) {
    super(app);
    this.tr = t(getLocaleFromApp(app));
    this.ids = ids;
    this.storage = storage;
  }

  override onOpen(): void {
    this.openBody();
    const { contentEl } = this;

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
}
