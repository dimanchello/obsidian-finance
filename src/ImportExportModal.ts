import { App, Modal, Notice } from 'obsidian';
import { FinanceRecord, RecordType } from './types';

type FileFormat = 'csv' | 'json' | 'xml';

// ── Our target fields ─────────────────────────────────────────────────────────
const OUR_FIELDS = [
  { key: 'date',     label: 'Дата (YYYY-MM-DD)' },
  { key: 'time',     label: 'Время (HH:MM)' },
  { key: 'type',     label: 'Тип (income/expense)' },
  { key: 'amount',   label: 'Сумма' },
  { key: 'category', label: 'Категория' },
  { key: 'tag',      label: 'Тег' },
  { key: 'payer',    label: 'Плательщик' },
  { key: 'note',     label: 'Примечание' },
  { key: '_skip',    label: '— Не импортировать —' },
];

export interface ImportExportOptions {
  noteName: string;
  currency: string;
  records:  FinanceRecord[];
  onImport: (records: FinanceRecord[]) => void;
}

export class ImportExportModal extends Modal {
  private o:      ImportExportOptions;
  private tab:    'export' | 'import' = 'export';
  private body!:  HTMLElement;

  constructor(app: App, opts: ImportExportOptions) {
    super(app);
    this.o   = opts;
    this.modalEl.addClass('finance-ie-modal');
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('finance-modal');
    contentEl.createEl('h2', { text: '📤 Импорт / Экспорт', cls: 'finance-modal-title' });

    // Tab bar
    const tabs = contentEl.createDiv('finance-tab-bar');
    const mkTab = (label: string, key: typeof this.tab) => {
      const btn = tabs.createEl('button', { text: label, cls: `finance-tab-btn${this.tab === key ? ' active' : ''}` });
      btn.addEventListener('click', () => { this.tab = key; this.renderBody(); btn.classList.add('active');
        tabs.querySelectorAll('.finance-tab-btn').forEach(b => { if (b !== btn) b.classList.remove('active'); });
      });
    };
    mkTab('📤 Экспорт', 'export');
    mkTab('📥 Импорт',  'import');

    this.body = contentEl.createDiv('finance-ie-body');
    this.renderBody();
  }

  private renderBody(): void {
    this.body.empty();
    this.tab === 'export' ? this.renderExport() : this.renderImport();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORT
  // ═══════════════════════════════════════════════════════════════════════════

  private renderExport(): void {
    const b = this.body;
    b.createEl('p', { text: `Записей для экспорта: ${this.o.records.length}`, cls: 'finance-ie-desc' });

    const fmts: { fmt: FileFormat; label: string; icon: string }[] = [
      { fmt: 'csv',  label: 'CSV',  icon: '📊' },
      { fmt: 'json', label: 'JSON', icon: '{ }' },
      { fmt: 'xml',  label: 'XML',  icon: '🗂️' },
    ];

    const grid = b.createDiv('finance-export-grid');
    fmts.forEach(({ fmt, label, icon }) => {
      const card = grid.createDiv('finance-export-card');
      card.createEl('div',    { text: icon,  cls: 'finance-export-icon' });
      card.createEl('strong', { text: label });
      const btn  = card.createEl('button', { text: 'Скачать', cls: 'finance-btn-save finance-export-btn' });
      btn.addEventListener('click', () => this.doExport(fmt));
    });
  }

  private doExport(fmt: FileFormat): void {
    const recs = this.o.records;
    let content = '';
    let mime    = 'text/plain';
    let ext     = fmt;

    if (fmt === 'csv') {
      const headers = ['id','createdAt','date','time','type','amount','category','tag','payer','note','attachmentPath'];
      const escape  = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      content = [headers.join(','), ...recs.map(r => headers.map(h => escape(r[h as keyof FinanceRecord])).join(','))].join('\n');
      mime    = 'text/csv;charset=utf-8;';

    } else if (fmt === 'json') {
      content = JSON.stringify({ account: this.o.noteName, currency: this.o.currency, records: recs }, null, 2);
      mime    = 'application/json';

    } else {
      const esc   = (v: unknown) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const inner = recs.map(r =>
        `  <record>${['id','createdAt','date','time','type','amount','category','tag','payer','note','attachmentPath']
          .map(k => `<${k}>${esc(r[k as keyof FinanceRecord])}</${k}>`).join('')}</record>`
      ).join('\n');
      content = `<?xml version="1.0" encoding="UTF-8"?>\n<account name="${esc(this.o.noteName)}" currency="${esc(this.o.currency)}">\n${inner}\n</account>`;
      mime    = 'application/xml';
    }

    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${this.o.noteName.replace(/[^\w\s-]/g, '')}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    new Notice(`✅ Экспортировано ${recs.length} записей`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPORT
  // ═══════════════════════════════════════════════════════════════════════════

  // import state
  private rawData:    Record<string, string>[] = [];
  private srcFields:  string[] = [];
  private mapping:    Record<string, string> = {};  // ourField → srcField
  private typeMap:    { incomeVal: string; expenseVal: string } = { incomeVal: 'income', expenseVal: 'expense' };
  private typeMode:   'field' | 'sign' | 'all_income' | 'all_expense' = 'field';
  private typeField:  string = '';

  private renderImport(): void {
    const b = this.body;

    // ── Step 1: File picker ────────────────────────────────────────────────
    const step1 = b.createDiv('finance-import-step');
    step1.createEl('div', { text: 'Шаг 1 — Выберите файл (CSV, JSON, XML)', cls: 'finance-step-title' });

    const pickWrap = step1.createDiv('finance-attach-wrapper');
    const fi       = pickWrap.createEl('input', { type: 'file', cls: 'finance-file-input' });
    fi.accept      = '.csv,.json,.xml';
    const uid      = `ft-imp-${Date.now()}`;
    fi.id          = uid;
    const lbl      = pickWrap.createEl('label', { cls: 'finance-attach-label' });
    lbl.setAttribute('for', uid);
    lbl.innerHTML  = '<span>📂</span><span>Открыть файл…</span>';
    const nameEl   = pickWrap.createEl('span', { text: 'Файл не выбран', cls: 'finance-attach-name' });

    // Steps 2+ appear here after file load
    const stepsContainer = b.createDiv('finance-import-steps');

    fi.addEventListener('change', async () => {
      const file = fi.files?.[0];
      if (!file) return;
      nameEl.textContent = file.name;

      let text = '';
      try {
        const fs = require('fs');
        text = fs.readFileSync((file as any).path, 'utf8');
      } catch (err) {
        // Fallback for mobile devices or environments without node 'fs'
        try {
          text = await file.text();
        } catch (fallbackErr) {
          new Notice('Ошибка чтения файла. Проверьте права доступа.');
          return;
        }
      }

      const fmt  = file.name.endsWith('.csv') ? 'csv'
                 : file.name.endsWith('.xml') ? 'xml'
                 : 'json';
      this.rawData   = [];
      this.srcFields = [];
      this.mapping   = {};
      stepsContainer.empty();

      try {
        if (fmt === 'csv')  this.parseCSV(text);
        if (fmt === 'json') this.parseJSON(text, stepsContainer);
        if (fmt === 'xml')  this.parseXML(text, stepsContainer);

        if (fmt !== 'json' && fmt !== 'xml') {
          this.renderMappingStep(stepsContainer);
        }
      } catch (e) {
        stepsContainer.createEl('p', { text: `⚠️ Ошибка разбора файла: ${e}`, cls: 'finance-error' });
      }
    });
  }

  // ── parsers ───────────────────────────────────────────────────────────────

  private parseCSV(text: string): void {
    const lines   = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) throw new Error('Файл пустой');
    const headers = this.csvRow(lines[0]);
    this.srcFields= headers;
    this.rawData  = lines.slice(1).map(l => {
      const vals = this.csvRow(l);
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
      return obj;
    });
  }

  private csvRow(line: string): string[] {
    const result: string[] = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i+1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        result.push(cur); cur = '';
      } else { cur += ch; }
    }
    result.push(cur);
    return result;
  }

  private parseJSON(text: string, container: HTMLElement): void {
    const parsed = JSON.parse(text);

    const tryArr = (obj: unknown): Record<string, string>[] | null => {
      if (Array.isArray(obj) && obj.length && typeof obj[0] === 'object') return obj as any;
      return null;
    };

    if (tryArr(parsed)) {
      this.setRawData(tryArr(parsed)!);
      this.renderMappingStep(container);
      return;
    }

    // Object — need to pick path
    const step = container.createDiv('finance-import-step');
    step.createEl('div', { text: 'Шаг 1б — Укажите путь к массиву записей', cls: 'finance-step-title' });
    step.createEl('small', { text: 'Например: records  или  data.transactions', cls: 'finance-hint-text' });

    const row  = step.createDiv('finance-filters-row');
    const inp  = row.createEl('input', { type: 'text', cls: 'finance-input', placeholder: 'records' });
    inp.style.flex = '1';
    const btn  = row.createEl('button', { text: 'Далее →', cls: 'finance-btn-save' });
    btn.style.marginTop = 'auto';

    btn.addEventListener('click', () => {
      const path  = inp.value.trim();
      let   node: unknown = parsed;
      if (path) path.split('.').forEach(k => { node = (node as any)?.[k]; });
      const arr = tryArr(node);
      if (!arr) { new Notice('⚠️ По указанному пути не найден массив'); return; }
      this.setRawData(arr);
      const next = container.createDiv();
      this.renderMappingStep(next);
    });
  }

  private parseXML(text: string, container: HTMLElement): void {
    const doc  = new DOMParser().parseFromString(text, 'application/xml');
    const err  = doc.querySelector('parseerror');
    if (err) throw new Error('Невалидный XML');

    // Auto-detect: find the most-repeated tag
    const counts: Record<string, number> = {};
    doc.querySelectorAll('*').forEach(el => { counts[el.tagName] = (counts[el.tagName] ?? 0) + 1; });
    const autoTag = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

    const step = container.createDiv('finance-import-step');
    step.createEl('div', { text: 'Шаг 1б — Тег одной записи', cls: 'finance-step-title' });

    const row = step.createDiv('finance-filters-row');
    const inp = row.createEl('input', { type: 'text', cls: 'finance-input', placeholder: 'record' });
    inp.value      = autoTag;
    inp.style.flex = '1';
    const btn = row.createEl('button', { text: 'Далее →', cls: 'finance-btn-save' });
    btn.style.marginTop = 'auto';

    btn.addEventListener('click', () => {
      const tag   = inp.value.trim();
      const nodes = Array.from(doc.querySelectorAll(tag));
      if (!nodes.length) { new Notice('⚠️ Тег не найден'); return; }
      const data  = nodes.map(n => {
        const obj: Record<string, string> = {};
        Array.from(n.children).forEach(c => { obj[c.tagName] = c.textContent ?? ''; });
        // also check attributes
        Array.from(n.attributes).forEach(a => { obj[`@${a.name}`] = a.value; });
        return obj;
      });
      this.setRawData(data);
      const next = container.createDiv();
      this.renderMappingStep(next);
    });
  }

  private setRawData(rows: Record<string, unknown>[]): void {
    this.rawData   = rows.map(r => {
      const out: Record<string, string> = {};
      Object.entries(r).forEach(([k, v]) => { out[k] = String(v ?? ''); });
      return out;
    });
    this.srcFields = Object.keys(this.rawData[0] ?? {});
  }

  // ── mapping step ──────────────────────────────────────────────────────────

  private renderMappingStep(container: HTMLElement): void {
    if (!this.rawData.length) { container.createEl('p', { text: '⚠️ Записей не обнаружено', cls: 'finance-error' }); return; }

    const step = container.createDiv('finance-import-step');
    step.createEl('div', {
      text: `Шаг 2 — Соотнесение полей  (найдено ${this.rawData.length} записей)`,
      cls: 'finance-step-title',
    });

    const sample = this.rawData[0];
    step.createEl('p', { text: 'Первая запись из файла:', cls: 'finance-hint-text' });
    const sampleBox = step.createEl('pre', { cls: 'finance-sample-box' });
    sampleBox.textContent = JSON.stringify(sample, null, 2).slice(0, 600);

    // Mapping table
    step.createEl('p', { text: 'Настройте соответствие полей:', cls: 'finance-hint-text' });
    const tbl  = step.createDiv('finance-mapping-table');

    // header row
    const hRow = tbl.createDiv('finance-mapping-row finance-mapping-header');
    hRow.createEl('div', { text: 'Поле счёта',       cls: 'finance-mapping-cell' });
    hRow.createEl('div', { text: 'Поле из файла',    cls: 'finance-mapping-cell' });
    hRow.createEl('div', { text: 'Значение (1-я запись)', cls: 'finance-mapping-cell' });

    const srcOptions = ['— не импортировать —', ...this.srcFields];

    // Auto-guess mapping by name similarity
    const guess = (ourKey: string): string => {
      const aliases: Record<string, string[]> = {
        date:     ['date','дата','dt','datetime'],
        time:     ['time','время','tm'],
        type:     ['type','тип','kind'],
        amount:   ['amount','сумма','sum','total','value'],
        category: ['category','категория','cat'],
        tag:      ['tag','тег','label'],
        payer:    ['payer','плательщик','from','who','sender'],
        note:     ['note','примечание','desc','description','comment'],
      };
      const lc = (this.srcFields.map(f => f.toLowerCase()));
      const alts = aliases[ourKey] ?? [ourKey];
      for (const a of alts) {
        const idx = lc.indexOf(a);
        if (idx !== -1) return this.srcFields[idx];
      }
      return '';
    };

    OUR_FIELDS.filter(f => f.key !== '_skip').forEach(f => {
      const row = tbl.createDiv('finance-mapping-row');

      row.createEl('div', { text: f.label, cls: 'finance-mapping-cell finance-mapping-label' });

      const selWrapper = row.createDiv('finance-mapping-cell');
      const sel        = selWrapper.createEl('select', { cls: 'finance-filter-select' });
      srcOptions.forEach(opt => {
        const o = sel.createEl('option', { text: opt });
        o.value = opt === '— не импортировать —' ? '' : opt;
      });
      const guessed = guess(f.key);
      sel.value = guessed || '';
      this.mapping[f.key] = guessed;
      sel.addEventListener('change', () => { this.mapping[f.key] = sel.value; this.updatePreviewCell(previewEl, f.key, sel.value, sample); });

      const previewEl = row.createEl('div', { cls: 'finance-mapping-cell finance-mapping-preview' });
      this.updatePreviewCell(previewEl, f.key, guessed, sample);
    });

    // Type interpretation
    step.createEl('p', { text: 'Как определять тип (доход/расход):', cls: 'finance-step-title finance-step-title-sm' });
    const typeSec = step.createDiv('finance-type-mode-section');

    const mkRadio = (value: string, label: string) => {
      const wrap = typeSec.createEl('label', { cls: 'finance-radio-wrap' });
      const inp  = wrap.createEl('input', { type: 'radio', cls: 'finance-radio' });
      inp.name   = 'ftTypeMode';
      inp.value  = value;
      inp.checked= value === 'field';
      wrap.createEl('span', { text: label });
      return inp;
    };

    const extraContainer = typeSec.createDiv('finance-type-extra');

    const renderExtra = (mode: string) => {
      extraContainer.empty();
      if (mode === 'field') {
        const row  = extraContainer.createDiv('finance-filters-row');
        const selG = row.createDiv('finance-filter-group');
        selG.createEl('label', { text: 'Поле типа', cls: 'finance-filter-label' });
        const sel  = selG.createEl('select', { cls: 'finance-filter-select' });
        this.srcFields.forEach(f => { const o = sel.createEl('option',{text:f}); o.value=f; });
        sel.value      = this.mapping['type'] || this.srcFields[0] || '';
        this.typeField = sel.value;
        sel.addEventListener('change', () => { this.typeField = sel.value; });

        const incG = row.createDiv('finance-filter-group');
        incG.createEl('label', { text: 'Значение для «Доход»', cls: 'finance-filter-label' });
        const incI = incG.createEl('input', { type: 'text', cls: 'finance-input', placeholder: 'income' });
        incI.value = 'income';
        incI.addEventListener('input', () => { this.typeMap.incomeVal = incI.value; });

        const expG = row.createDiv('finance-filter-group');
        expG.createEl('label', { text: 'Значение для «Расход»', cls: 'finance-filter-label' });
        const expI = expG.createEl('input', { type: 'text', cls: 'finance-input', placeholder: 'expense' });
        expI.value = 'expense';
        expI.addEventListener('input', () => { this.typeMap.expenseVal = expI.value; });
      }
    };

    mkRadio('field',       'По значению поля (income/expense, приход/расход и т.п.)').addEventListener('change', () => { this.typeMode='field';       renderExtra('field'); });
    mkRadio('sign',        'По знаку суммы (+ = доход, − = расход)').addEventListener('change', () => { this.typeMode='sign';        extraContainer.empty(); });
    mkRadio('all_income',  'Все записи — доходы').addEventListener('change',  () => { this.typeMode='all_income';  extraContainer.empty(); });
    mkRadio('all_expense', 'Все записи — расходы').addEventListener('change', () => { this.typeMode='all_expense'; extraContainer.empty(); });
    renderExtra('field');

    // Import button
    const btnRow = step.createDiv('finance-modal-btns');
    const impBtn = btnRow.createEl('button', {
      text: `📥 Импортировать ${this.rawData.length} записей`,
      cls:  'finance-btn-save',
    });
    impBtn.addEventListener('click', () => this.doImport());
  }

  private updatePreviewCell(el: HTMLElement, _field: string, srcField: string, sample: Record<string, string>): void {
    el.textContent = srcField ? (sample[srcField] ?? '—') : '—';
  }

  // ── do import ─────────────────────────────────────────────────────────────

  private doImport(): void {
    const m   = this.mapping;
    const now = Date.now();

    const records: FinanceRecord[] = this.rawData.map((row, i) => {
      const get = (key: string) => (m[key] ? row[m[key]] ?? '' : '');

      let type: RecordType = 'expense';
      if      (this.typeMode === 'all_income')  type = 'income';
      else if (this.typeMode === 'all_expense') type = 'expense';
      else if (this.typeMode === 'sign') {
        const v = parseFloat(get('amount'));
        type    = v >= 0 ? 'income' : 'expense';
      } else {
        const tv = (this.typeField ? row[this.typeField] : get('type')) ?? '';
        type     = tv.toLowerCase() === this.typeMap.incomeVal.toLowerCase() ? 'income' : 'expense';
      }

      const rawAmt = get('amount').replace(',', '.').replace(/[^\d.-]/g, '');
      return {
        id:             crypto.randomUUID(),
        createdAt:      now + i,
        date:           normalizeDate(get('date')),
        time:           get('time').slice(0, 5),
        type,
        amount:         Math.abs(parseFloat(rawAmt) || 0),
        category:       get('category'),
        tag:            get('tag'),
        payer:          get('payer'),
        note:           get('note'),
        attachmentPath: '',
      };
    });

    const valid = records.filter(r => r.amount > 0);
    this.o.onImport(valid);
    new Notice(`✅ Импортировано ${valid.length} записей`);
    this.close();
  }

  onClose(): void { this.contentEl.empty(); }
}

// ── date normalizer ───────────────────────────────────────────────────────────
function normalizeDate(s: string): string {
  if (!s) return new Date().toISOString().split('T')[0];
  // already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD.MM.YYYY or DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // MM/DD/YYYY
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m2) return `${m2[3]}-${m2[1].padStart(2,'0')}-${m2[2].padStart(2,'0')}`;
  // Try native Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return new Date().toISOString().split('T')[0];
}
