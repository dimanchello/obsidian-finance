import { App, Modal } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';

export class ConfirmModal extends Modal {
  private tr: Translations;
  constructor(
    app: App,
    private message: string,
    private onConfirm: () => void,
  ) { super(app); this.tr = t(getLocaleFromApp(app)); }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('finance-confirm-modal');
    contentEl.createEl('p', { text: this.message, cls: 'finance-confirm-message' });
    const btns     = contentEl.createDiv('finance-confirm-btns');
    btns.createEl('button', { text: this.tr.cancel,  cls: 'finance-btn-cancel' })
        .addEventListener('click', () => this.close());
    btns.createEl('button', { text: this.tr.deleteConfirm, cls: 'finance-btn-danger' })
        .addEventListener('click', () => { this.onConfirm(); this.close(); });
  }

  onClose(): void { this.contentEl.empty(); }
}
