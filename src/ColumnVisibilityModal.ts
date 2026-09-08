import { App } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';
import { FinanceBaseModal } from './ui/FinanceBaseModal';

export interface ColumnVisibilityModalOptions {
  columns: { key: string; label: string }[];
  visibility: Record<string, boolean>;
  onSave: (visibility: Record<string, boolean>) => void;
  accentColor?: string | undefined;
}

export class ColumnVisibilityModal extends FinanceBaseModal {
  protected tr: Translations;
  private opts: ColumnVisibilityModalOptions;
  private checkboxes = new Map<string, HTMLInputElement>();

  constructor(app: App, opts: ColumnVisibilityModalOptions) {
    super(app);
    this.tr = t(getLocaleFromApp(app));
    this.opts = opts;
    this.modalEl.addClass('finance-colvis-modal');
  }

  override onOpen(): void {
    this.openHeader(this.tr.columnSettings);
    const { contentEl } = this;
    if (this.opts.accentColor) {
      contentEl.style.setProperty('--ft-accent', this.opts.accentColor);
    }

    const list = contentEl.createDiv('finance-colvis-list');

    this.opts.columns.forEach(col => {
      const item = list.createDiv('finance-colvis-item');
      const cb = item.createEl('input', { type: 'checkbox' });
      cb.checked = this.opts.visibility[col.key] !== false;
      this.checkboxes.set(col.key, cb);
      const label = item.createEl('span', { text: col.label, cls: 'finance-colvis-label' });
      label.addEventListener('click', () => {
        cb.checked = !cb.checked;
      });
    });

    const btns = contentEl.createDiv('finance-modal-btns');
    btns.createEl('button', { text: this.tr.cancel, cls: 'finance-btn-cancel' })
      .addEventListener('click', () => this.close());
    btns.createEl('button', { text: this.tr.save, cls: 'finance-accent-btn' })
      .addEventListener('click', () => {
        const result: Record<string, boolean> = {};
        this.checkboxes.forEach((cb, key) => {
          result[key] = cb.checked;
        });
        this.opts.onSave(result);
        this.close();
      });
  }
}
