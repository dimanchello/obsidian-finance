import { App } from 'obsidian';
import { CSS_CLASS } from './constants';
import { getLocaleFromApp, t, Translations } from './i18n';
import { FinanceBaseModal } from './ui/FinanceBaseModal';

export class ConfirmModal extends FinanceBaseModal {
  protected tr: Translations;
  constructor(
    app: App,
    private message: string,
    private onConfirm: () => void | Promise<void>,
  ) { super(app); this.tr = t(getLocaleFromApp(app)); }

  override onOpen(): void {
    const { contentEl } = this;
    // Confirmations use their own compact skin, not the standard `.finance-modal` body.
    contentEl.addClass('finance-confirm-modal');
    contentEl.createEl('p', { text: this.message, cls: 'finance-confirm-message' });
    const btns = contentEl.createDiv('finance-confirm-btns');
    btns.createEl('button', { text: this.tr.cancel, cls: CSS_CLASS.FINANCE_BTN_CANCEL })
        .addEventListener('click', () => this.close());
    btns.createEl('button', { text: this.tr.deleteConfirm, cls: 'finance-btn-danger' })
        .addEventListener('click', () => { void this.onConfirm(); this.close(); });
  }
}
