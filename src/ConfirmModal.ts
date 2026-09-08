import { App } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';
import { FinanceBaseModal } from './ui/FinanceBaseModal';

export class ConfirmModal extends FinanceBaseModal {
  protected tr: Translations;
  constructor(
    app: App,
    private message: string,
    private onConfirm: () => void,
  ) { super(app); this.tr = t(getLocaleFromApp(app)); }

  override onOpen(): void {
    const { contentEl } = this;
    // Confirmations use their own compact skin, not the standard `.finance-modal` body.
    contentEl.addClass('finance-confirm-modal');
    contentEl.createEl('p', { text: this.message, cls: 'finance-confirm-message' });
    const btns = contentEl.createDiv('finance-confirm-btns');
    btns.createEl('button', { text: this.tr.cancel, cls: 'finance-btn-cancel' })
        .addEventListener('click', () => this.close());
    btns.createEl('button', { text: this.tr.deleteConfirm, cls: 'finance-btn-danger' })
        .addEventListener('click', () => { this.onConfirm(); this.close(); });
  }
}
