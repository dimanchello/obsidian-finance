import { Modal } from 'obsidian';
import type { Translations } from '../i18n';

export abstract class FinanceBaseModal extends Modal {
  protected abstract tr: Translations;

  override onClose(): void {
    this.contentEl.empty();
  }

  /** Resets the body and adds an `h2` title. Use for the standard modal layout. */
  protected openHeader(title: string): void {
    this.openBody();
    this.contentEl.createEl('h2', { text: title, cls: 'finance-modal-title' });
  }

  /**
   * Resets the body without adding a title, for modals that render their own heading
   * (e.g. inside a scrollable container).
   */
  protected openBody(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('finance-modal');
  }
}
