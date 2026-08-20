import { Modal } from 'obsidian';
import type { Translations } from '../i18n';

export abstract class FinanceBaseModal extends Modal {
  protected abstract tr: Translations;

  override onClose(): void {
    this.contentEl.empty();
  }

  protected openHeader(title: string): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('finance-modal');
    contentEl.createEl('h2', { text: title, cls: 'finance-modal-title' });
  }
}
