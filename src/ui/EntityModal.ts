import { App } from 'obsidian';
import { getLocaleFromApp, t, Translations } from '../i18n';
import { FinanceBaseModal } from './FinanceBaseModal';
import { buildButtonRow } from './formHelpers';

/**
 * Base class for entity create/edit modals.
 * Provides common structure: header, form area, validation, save/cancel buttons.
 *
 * Usage:
 * ```typescript
 * class MyEntityModal extends EntityModal<MyEntity> {
 *   protected buildForm(form: HTMLElement): void {
 *     // Build form fields
 *   }
 *
 *   protected validate(): string | null {
 *     // Return error message or null if valid
 *   }
 *
 *   protected collectData(): MyEntity {
 *     // Collect form data into entity
 *   }
 * }
 * ```
 */
export abstract class EntityModal<T> extends FinanceBaseModal {
  protected tr: Translations;
  protected entity: T;
  protected isEdit: boolean;
  protected onSave: (entity: T) => void;

  protected formEl!: HTMLElement;
  private saveBtn!: HTMLButtonElement;

  constructor(
    app: App,
    options: {
      entity: T;
      isEdit: boolean;
      onSave: (entity: T) => void;
    }
  ) {
    super(app);
    this.tr = t(getLocaleFromApp(app));
    this.entity = options.entity;
    this.isEdit = options.isEdit;
    this.onSave = options.onSave;
  }

  /**
   * Override to provide modal title
   */
  protected abstract getTitle(): string;

  /**
   * Override to label the save button with something other than save/add
   * (e.g. "Пополнить", "Снять").
   */
  protected getSaveLabel(): string | undefined {
    return undefined;
  }

  /**
   * Override to build form fields inside the form container
   */
  protected abstract buildForm(form: HTMLElement): void;

  /**
   * Override to validate form data
   * @returns Error message if invalid, null if valid
   */
  protected abstract validate(): string | null;

  /**
   * Override to collect form data into entity object
   */
  protected abstract collectData(): T;

  override onOpen(): void {
    this.openHeader(this.getTitle());

    this.formEl = this.contentEl.createDiv('finance-form');
    this.buildForm(this.formEl);

    const btnRow = this.contentEl.createDiv();
    buildButtonRow(btnRow, this.tr, {
      onSave: () => this.handleSave(),
      onCancel: () => this.close(),
      isEdit: this.isEdit,
      ...(this.getSaveLabel() !== undefined ? { saveText: this.getSaveLabel()! } : {}),
    });

    this.saveBtn = btnRow.querySelector('.finance-btn-save')!;

    // Hook Enter key to save
    this.scope.register([], 'Enter', (evt: KeyboardEvent) => {
      if (evt.target instanceof HTMLTextAreaElement) return false;
      evt.preventDefault();
      this.handleSave();
      return false;
    });

    // Hook Escape to cancel
    this.scope.register([], 'Escape', () => {
      this.close();
      return false;
    });

    this.onFormReady();
  }

  /**
   * Override to perform actions after form is built (e.g., focus first field)
   */
  protected onFormReady(): void {
    // Default: focus first input
    const firstInput = this.formEl.querySelector('input, textarea') as HTMLInputElement | null;
    firstInput?.focus();
  }

  private handleSave(): void {
    const errorMsg = this.validate();
    if (errorMsg) {
      this.showError(errorMsg);
      return;
    }

    const entity = this.collectData();
    this.onSave(entity);
    this.close();
  }

  protected showError(message: string): void {
    const existingError = this.contentEl.querySelector('.finance-error-message');
    if (existingError) existingError.remove();

    const errorEl = this.contentEl.createDiv('finance-error-message');
    errorEl.textContent = message;
    this.saveBtn.parentElement?.insertBefore(errorEl, this.saveBtn.parentElement.firstChild);

    setTimeout(() => errorEl.remove(), 5000);
  }

  protected clearError(): void {
    const existingError = this.contentEl.querySelector('.finance-error-message');
    existingError?.remove();
  }

  /**
   * Helper: create a type toggle row (e.g., income/expense, lent/borrowed)
   */
  protected createTypeToggle(
    options: { label: string; value: string; active: boolean }[],
    onChange: (value: string) => void
  ): HTMLElement {
    const row = this.contentEl.createDiv('finance-type-row');

    const buttons: HTMLButtonElement[] = [];

    options.forEach(opt => {
      const btn = row.createEl('button', {
        text: opt.label,
        cls: `finance-type-toggle${opt.active ? ' active' : ''}`,
      });

      btn.addEventListener('click', () => {
        buttons.forEach(b => b.removeClass('active'));
        btn.addClass('active');
        onChange(opt.value);
      });

      buttons.push(btn);
    });

    return row;
  }
}
