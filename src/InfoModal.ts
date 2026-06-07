import { App, Modal } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';

interface FieldDef { labelKey: keyof Translations; descKey: keyof Translations; }
const FIELDS: FieldDef[] = [
  { labelKey: 'sum', descKey: 'fieldDescSum' },
  { labelKey: 'rate', descKey: 'fieldDescRate' },
  { labelKey: 'startDate', descKey: 'fieldDescStartDate' },
  { labelKey: 'termLabel', descKey: 'fieldDescTerm' },
  { labelKey: 'depositType', descKey: 'fieldDescType' },
  { labelKey: 'accrualType', descKey: 'fieldDescAccrual' },
  { labelKey: 'frequency', descKey: 'fieldDescFrequency' },
  { labelKey: 'note', descKey: 'fieldDescNote' },
];

export class InfoModal extends Modal {
  private tr: Translations;
  constructor(app: App) { super(app); this.tr = t(getLocaleFromApp(app)); }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('finance-modal');

    const container = contentEl.createDiv('finance-form');
    container.style.maxWidth = '480px';
    container.style.margin = '0 auto';

    container.createEl('h3', {
      text: this.tr.fieldDescriptions,
      cls: 'finance-modal-title',
    });
    const subtitle = container.createEl('p', {
      text: this.tr.fieldDescriptionsSub,
    });
    subtitle.style.fontSize = '13px';
    subtitle.style.color = 'var(--text-muted)';
    subtitle.style.marginBottom = '20px';

    FIELDS.forEach(({ labelKey, descKey }) => {
      const card = container.createDiv();
      card.style.marginBottom = '12px';
      card.style.padding = '12px 14px';
      card.style.borderRadius = '8px';
      card.style.background = 'var(--background-secondary)';
      card.style.border = '1px solid var(--background-modifier-border)';

      const labelEl = card.createEl('div', { text: this.tr[labelKey] });
      labelEl.style.fontWeight = '600';
      labelEl.style.fontSize = '13px';
      labelEl.style.marginBottom = '4px';
      labelEl.style.color = 'var(--text-normal)';

      const descEl = card.createEl('div', { text: this.tr[descKey] });
      descEl.style.fontSize = '12px';
      descEl.style.color = 'var(--text-muted)';
      descEl.style.lineHeight = '1.5';
    });

    const btnRow = contentEl.createDiv('finance-modal-btns');
    btnRow.style.marginTop = '8px';
    btnRow.createEl('button', { text: this.tr.close, cls: 'finance-btn-save' })
      .addEventListener('click', () => this.close());
  }

  onClose(): void { this.contentEl.empty(); }
}
