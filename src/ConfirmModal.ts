import { App, Modal } from 'obsidian';

export class ConfirmModal extends Modal {
  constructor(
    app: App,
    private message: string,
    private onConfirm: () => void,
  ) { super(app); }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('finance-confirm-modal');
    contentEl.createEl('p', { text: this.message, cls: 'finance-confirm-message' });
    const btns     = contentEl.createDiv('finance-confirm-btns');
    btns.createEl('button', { text: 'Отмена',  cls: 'finance-btn-cancel' })
        .addEventListener('click', () => this.close());
    btns.createEl('button', { text: 'Удалить', cls: 'finance-btn-danger' })
        .addEventListener('click', () => { this.onConfirm(); this.close(); });
  }

  onClose(): void { this.contentEl.empty(); }
}
