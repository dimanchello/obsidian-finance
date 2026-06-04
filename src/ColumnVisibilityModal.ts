import { App, Modal } from 'obsidian';

export interface ColumnVisibilityModalOptions {
  columns: { key: string; label: string }[];
  visibility: Record<string, boolean>;
  onSave: (visibility: Record<string, boolean>) => void;
}

export class ColumnVisibilityModal extends Modal {
  private opts: ColumnVisibilityModalOptions;
  private checkboxes = new Map<string, HTMLInputElement>();

  constructor(app: App, opts: ColumnVisibilityModalOptions) {
    super(app);
    this.opts = opts;
    this.modalEl.addClass('finance-colvis-modal');
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('finance-modal');
    contentEl.createEl('h2', { text: '⚙️ Настройка колонок', cls: 'finance-modal-title' });

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
    btns.createEl('button', { text: 'Отмена', cls: 'finance-btn-cancel' })
      .addEventListener('click', () => this.close());
    btns.createEl('button', { text: 'Сохранить', cls: 'finance-add-btn' })
      .addEventListener('click', () => {
        const result: Record<string, boolean> = {};
        this.checkboxes.forEach((cb, key) => {
          result[key] = cb.checked;
        });
        this.opts.onSave(result);
        this.close();
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
