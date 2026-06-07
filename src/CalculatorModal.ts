import { App, Modal } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';

export class CalculatorModal extends Modal {
  private tr: Translations;
  private displayEl!: HTMLElement;
  private display = '0';
  private previousValue: number | null = null;
  private operation: string | null = null;
  private clearOnNextDigit = false;
  private justEvaluated = false;

  constructor(
    app: App,
    private onResult: (value: number) => void,
    initialValue?: string,
  ) {
    super(app);
    this.tr = t(getLocaleFromApp(app));
    if (initialValue) {
      const parsed = parseFloat(initialValue.replace(',', '.'));
      if (!isNaN(parsed)) {
        this.display = String(parsed);
      }
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass('finance-calculator-modal');

    this.displayEl = contentEl.createDiv('finance-calc-display');
    this.updateDisplay();

    const grid = contentEl.createDiv('finance-calc-grid');

    this.addBtn(grid, '7');
    this.addBtn(grid, '8');
    this.addBtn(grid, '9');
    this.addBtn(grid, '÷');

    this.addBtn(grid, '4');
    this.addBtn(grid, '5');
    this.addBtn(grid, '6');
    this.addBtn(grid, '×');

    this.addBtn(grid, '1');
    this.addBtn(grid, '2');
    this.addBtn(grid, '3');
    this.addBtn(grid, '-');

    this.addBtn(grid, '0');
    this.addBtn(grid, '.');
    const cBtn = grid.createEl('button', { text: 'C', cls: 'finance-calc-btn finance-calc-clear' });
    cBtn.addEventListener('click', () => this.handleInput('C'));
    this.addBtn(grid, '+');

    const eqBtn = grid.createEl('button', { text: '=', cls: 'finance-calc-btn finance-calc-eq' });
    eqBtn.addEventListener('click', () => this.handleEquals());

    const btns = contentEl.createDiv('finance-modal-btns');
    btns.createEl('button', { text: this.tr.cancel, cls: 'finance-btn-cancel' })
      .addEventListener('click', () => this.close());
    btns.createEl('button', { text: this.tr.confirm, cls: 'finance-btn-save' })
      .addEventListener('click', () => this.handleOk());
  }

  private addBtn(parent: HTMLElement, label: string): void {
    const btn = parent.createEl('button', { text: label, cls: 'finance-calc-btn' });
    btn.addEventListener('click', () => this.handleInput(label));
  }

  private handleInput(label: string): void {
    if ('0123456789'.includes(label)) {
      if (this.clearOnNextDigit) {
        this.display = label;
        this.clearOnNextDigit = false;
        this.justEvaluated = false;
      } else {
        this.display = this.display === '0' ? label : this.display + label;
      }
    } else if (label === '.') {
      if (this.clearOnNextDigit) {
        this.display = '0.';
        this.clearOnNextDigit = false;
        this.justEvaluated = false;
      } else if (!this.display.includes('.')) {
        this.display += '.';
      }
    } else if (label === 'C') {
      this.display = '0';
      this.previousValue = null;
      this.operation = null;
      this.clearOnNextDigit = false;
      this.justEvaluated = false;
    } else if ('+-×÷'.includes(label)) {
      const current = parseFloat(this.display);
      if (this.operation !== null && !this.justEvaluated) {
        this.evaluate();
      } else {
        this.previousValue = current;
      }
      this.operation = label;
      this.clearOnNextDigit = true;
      this.justEvaluated = false;
    }
    this.updateDisplay();
  }

  private handleEquals(): void {
    if (this.operation === null) return;
    this.evaluate();
    this.operation = null;
    this.clearOnNextDigit = true;
    this.justEvaluated = true;
    this.updateDisplay();
  }

  private evaluate(): void {
    const current = parseFloat(this.display);
    const prev = this.previousValue ?? 0;
    let result = 0;
    switch (this.operation) {
      case '+': result = prev + current; break;
      case '-': result = prev - current; break;
      case '×': result = prev * current; break;
      case '÷': result = current !== 0 ? prev / current : 0; break;
    }
    this.display = String(result);
    this.previousValue = result;
  }

  private handleOk(): void {
    const value = parseFloat(this.display);
    if (!isNaN(value)) {
      this.onResult(value);
    }
    this.close();
  }

  private updateDisplay(): void {
    this.displayEl.textContent = this.display;
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
