import { Modal } from 'obsidian';

const FIELDS = [
  { label: 'Сумма', desc: 'Основная сумма вклада. При капитализации будет расти за счёт процентов.' },
  { label: 'Ставка', desc: 'Годовая процентная ставка. Для ежемесячного расчёта делится на 12.' },
  { label: 'Дата начала', desc: 'Дата открытия вклада. Если указана в прошлом, будут рассчитаны пропущенные начисления.' },
  { label: 'Срок', desc: 'Срок вклада в месяцах. По окончании вклад закрывается.' },
  { label: 'Тип вклада', desc: 'Метка для группировки и фильтрации. На расчёты не влияет.' },
  { label: 'Тип начисления', desc: 'На счёт: проценты выплачиваются на основной счёт. С капитализацией: проценты увеличивают сумму вклада.' },
  { label: 'Периодичность', desc: 'Как часто начисляются проценты. Для «На счёт»: ежемесячно или в конце срока. При капитализации всегда ежемесячно.' },
  { label: 'Примечание', desc: 'Необязательное примечание.' },
];

export class InfoModal extends Modal {
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('finance-modal');

    const container = contentEl.createDiv('finance-form');
    container.style.maxWidth = '480px';
    container.style.margin = '0 auto';

    container.createEl('h3', {
      text: 'Описание полей',
      cls: 'finance-modal-title',
    });
    const subtitle = container.createEl('p', {
      text: 'Краткое описание каждого поля формы вклада',
    });
    subtitle.style.fontSize = '13px';
    subtitle.style.color = 'var(--text-muted)';
    subtitle.style.marginBottom = '20px';

    FIELDS.forEach(({ label, desc }) => {
      const card = container.createDiv();
      card.style.marginBottom = '12px';
      card.style.padding = '12px 14px';
      card.style.borderRadius = '8px';
      card.style.background = 'var(--background-secondary)';
      card.style.border = '1px solid var(--background-modifier-border)';

      const labelEl = card.createEl('div', { text: label });
      labelEl.style.fontWeight = '600';
      labelEl.style.fontSize = '13px';
      labelEl.style.marginBottom = '4px';
      labelEl.style.color = 'var(--text-normal)';

      const descEl = card.createEl('div', { text: desc });
      descEl.style.fontSize = '12px';
      descEl.style.color = 'var(--text-muted)';
      descEl.style.lineHeight = '1.5';
    });

    const btnRow = contentEl.createDiv('finance-modal-btns');
    btnRow.style.marginTop = '8px';
    btnRow.createEl('button', { text: 'Закрыть', cls: 'finance-btn-save' })
      .addEventListener('click', () => this.close());
  }

  onClose(): void { this.contentEl.empty(); }
}
