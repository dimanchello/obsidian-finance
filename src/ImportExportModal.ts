import { App, Modal, Notice } from 'obsidian';
import { getLocaleFromApp, t, Translations } from './i18n';
import { FinanceRecord, RecordType } from './types';

type FileFormat = 'csv' | 'json';

interface OurFieldDef { key: string; labelKey: keyof Translations; }

export interface ImportExportOptions {
  noteName: string;
  currency: string;
  records:  FinanceRecord[];
  onImport: (records: FinanceRecord[]) => void;
  mode:     'export' | 'import';
}

export class ImportExportModal extends Modal {
  private tr: Translations;
  private o:      ImportExportOptions;
  private body!:  HTMLElement;

  constructor(app: App, opts: ImportExportOptions) {
    super(app);this.tr = t(getLocaleFromApp(app));
    this.o   = opts;
    this.modalEl.addClass('finance-ie-modal');
  }

  private getOurFields(): OurFieldDef[] {
    return [
      { key: 'date',     labelKey: 'importFieldDate' },
      { key: 'time',     labelKey: 'importFieldTime' },
      { key: 'type',     labelKey: 'importFieldType' },
      { key: 'amount',   labelKey: 'importFieldAmount' },
      { key: 'category', labelKey: 'importFieldCategory' },
      { key: 'tag',      labelKey: 'importFieldTag' },
      { key: 'payer',    labelKey: 'importFieldPayer' },
      { key: 'note',     labelKey: 'importFieldNote' },
      { key: 'exchangeRate', labelKey: 'importFieldExchangeRate' },
      { key: '_skip',    labelKey: 'importNotImport' },
    ];
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('finance-modal');
    contentEl.createEl('h2', {
      text: this.o.mode === 'export' ? this.tr.export : this.tr.import,
      cls: 'finance-modal-title',
    });

    this.body = contentEl.createDiv('finance-ie-body');
    if (this.o.mode === 'export') this.renderExport();
    else this.renderImport();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORT
  // ═══════════════════════════════════════════════════════════════════════════

  private renderExport(): void {
    const b = this.body;
    b.createEl('p', { text: `${this.tr.exported}: ${this.o.records.length}`, cls: 'finance-ie-desc' });

    const fmts: { fmt: FileFormat; labelKey: keyof Translations; icon: string }[] = [
      { fmt: 'csv',  labelKey: 'exportFormatCsv',  icon: '📊' },
      { fmt: 'json', labelKey: 'exportFormatJson', icon: '{ }' },
    ];

    const grid = b.createDiv('finance-export-grid');
    fmts.forEach(({ fmt, labelKey, icon }) => {
      const card = grid.createDiv('finance-export-card');
      card.createEl('div',    { text: icon,  cls: 'finance-export-icon' });
      card.createEl('strong', { text: this.tr[labelKey] });
      const btn  = card.createEl('button', { text: this.tr.download, cls: 'finance-btn-save finance-export-btn' });
      btn.addEventListener('click', () => this.doExport(fmt));
    });
  }

  private doExport(fmt: FileFormat): void {
    const recs = this.o.records;
    let content = '';
    let mime    = 'text/plain';
    let ext     = fmt;

    if (fmt === 'csv') {
      const headers = ['id','createdAt','date','time','type','amount','category','tag','payer','note','exchangeRate','attachmentPath'];
      const escape  = (v: unknown) => { const s = v == null ? '' : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : ''; return `"${s.replace(/"/g, '""')}"`; };
      content = [headers.join(','), ...recs.map(r => headers.map(h => escape(r[h as keyof FinanceRecord])).join(','))].join('\n');
      mime    = 'text/csv;charset=utf-8;';

    } else if (fmt === 'json') {
      content = JSON.stringify({ account: this.o.noteName, currency: this.o.currency, records: recs }, null, 2);
      mime    = 'application/json';

    }

    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${this.o.noteName.replace(/[^\w\s-]/g, '')}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    new Notice(`${this.tr.exportSuccess} — ${recs.length} ${this.tr.exported}`);
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
  private typeField = '';

  private tpl(s: string, params: Record<string, string | number>): string {
    let r = s;
    for (const [k, v] of Object.entries(params)) r = r.replace(`{${k}}`, String(v));
    return r;
  }

  private renderImport(): void {
    const b = this.body;

    // ── Step 1: File picker ────────────────────────────────────────────────
    const step1 = b.createDiv('finance-import-step');
    step1.createEl('div', { text: this.tr.importStep1, cls: 'finance-step-title' });

    const pickWrap = step1.createDiv('finance-attach-wrapper');
    const nameEl   = pickWrap.createEl('span', { text: this.tr.importNoFile, cls: 'finance-attach-name' });

    // Button — opens native Electron dialog (bypasses all browser file-API restrictions)
    const openBtn = pickWrap.createEl('label', { cls: 'finance-attach-label' });
    openBtn.innerHTML = `<span>📂</span><span>${this.tr.importOpenFile}</span>`;

    // Steps 2+ appear here after file load
    const stepsContainer = b.createDiv('finance-import-steps');

    openBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const electron = (window as any).require('electron');
        const fs       = (window as any).require('fs');

        const result = await electron.remote.dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [
            { name: this.tr.importFileFilterData, extensions: ['csv', 'json'] },
            { name: this.tr.importFileFilterAll,  extensions: ['*'] },
          ],
        });

        if (result.canceled || !result.filePaths.length) return;

        const filePath = result.filePaths[0];
        const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
        nameEl.textContent = fileName;

        const text = fs.readFileSync(filePath, 'utf8') as string;

        const fmt = fileName.endsWith('.csv') ? 'csv' : 'json';

        this.rawData   = [];
        this.srcFields = [];
        this.mapping   = {};
        stepsContainer.empty();

        try {
          if (fmt === 'csv')  this.parseCSV(text);
          if (fmt === 'json') this.parseJSON(text, stepsContainer);

          if (fmt !== 'json') {
            this.renderMappingStep(stepsContainer);
          }
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          stepsContainer.createEl('p', {
            text: this.tpl(this.tr.importParseError, { error: errMsg }),
            cls: 'finance-error',
          });
        }

      } catch (err) {
        new Notice(`${this.tr.importError}: ${String(err)}`);
      }
    });
  }

  // ── parsers ───────────────────────────────────────────────────────────────

  private parseCSV(text: string): void {
    const lines   = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) throw new Error(this.tr.importEmptyFile);
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
    step.createEl('div', { text: this.tr.importStep1b, cls: 'finance-step-title' });
    step.createEl('small', { text: this.tr.importJsonPathHint, cls: 'finance-hint-text' });

    const row  = step.createDiv('finance-filters-row');
    const inp  = row.createEl('input', { type: 'text', cls: 'finance-input', placeholder: 'records' });
    inp.style.flex = '1';
    const btn  = row.createEl('button', { text: this.tr.importNext, cls: 'finance-btn-save' });
    btn.style.marginTop = 'auto';

    btn.addEventListener('click', () => {
      const path  = inp.value.trim();
      let   node: unknown = parsed;
      if (path) path.split('.').forEach(k => { node = (node as any)?.[k]; });
      const arr = tryArr(node);
      if (!arr) { new Notice(this.tr.arrayNotFound); return; }
      this.setRawData(arr);
      const next = container.createDiv();
      this.renderMappingStep(next);
    });
  }

  private setRawData(rows: Record<string, unknown>[]): void {
    this.rawData   = rows.map(r => {
      const out: Record<string, string> = {};
      Object.entries(r).forEach(([k, v]) => { out[k] = v == null ? '' : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : ''; });
      return out;
    });
    this.srcFields = Object.keys(this.rawData[0] ?? {});
  }

  // ── mapping step ──────────────────────────────────────────────────────────

  private renderMappingStep(container: HTMLElement): void {
    if (!this.rawData.length) { container.createEl('p', { text: this.tr.noRecords, cls: 'finance-error' }); return; }

    const step = container.createDiv('finance-import-step');
    step.createEl('div', {
      text: this.tpl(this.tr.importStep2, { count: this.rawData.length }),
      cls: 'finance-step-title',
    });

    const sample = this.rawData[0];
    step.createEl('p', { text: this.tr.importFirstRecord, cls: 'finance-hint-text' });
    const sampleBox = step.createEl('pre', { cls: 'finance-sample-box' });
    sampleBox.textContent = JSON.stringify(sample, null, 2).slice(0, 600);

    // Mapping table
    step.createEl('p', { text: this.tr.importFieldMapping, cls: 'finance-hint-text' });
    const tbl  = step.createDiv('finance-mapping-table');

    // header row
    const hRow = tbl.createDiv('finance-mapping-row finance-mapping-header');
    hRow.createEl('div', { text: this.tr.importAccountField, cls: 'finance-mapping-cell' });
    hRow.createEl('div', { text: this.tr.importFileField,    cls: 'finance-mapping-cell' });
    hRow.createEl('div', { text: this.tr.importSampleValue,  cls: 'finance-mapping-cell' });

    const notImport = this.tr.importNotImport;
    const srcOptions = [notImport, ...this.srcFields];

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
        exchangeRate: ['exchangerate','курс','rate','exchange_rate','fx'],
      };
      const lc = (this.srcFields.map(f => f.toLowerCase()));
      const alts = aliases[ourKey] ?? [ourKey];
      for (const a of alts) {
        const idx = lc.indexOf(a);
        if (idx !== -1) return this.srcFields[idx];
      }
      return '';
    };

    this.getOurFields().filter(f => f.key !== '_skip').forEach(f => {
      const row = tbl.createDiv('finance-mapping-row');

      row.createEl('div', { text: this.tr[f.labelKey], cls: 'finance-mapping-cell finance-mapping-label' });

      const selWrapper = row.createDiv('finance-mapping-cell');
      const sel        = selWrapper.createEl('select', { cls: 'finance-filter-select' });
      srcOptions.forEach(opt => {
        const o = sel.createEl('option', { text: opt });
        o.value = opt === notImport ? '' : opt;
      });
      const guessed = guess(f.key);
      sel.value = guessed || '';
      this.mapping[f.key] = guessed;
      sel.addEventListener('change', () => { this.mapping[f.key] = sel.value; this.updatePreviewCell(previewEl, f.key, sel.value, sample); });

      const previewEl = row.createEl('div', { cls: 'finance-mapping-cell finance-mapping-preview' });
      this.updatePreviewCell(previewEl, f.key, guessed, sample);
    });

    // Type interpretation
    step.createEl('p', { text: this.tr.importTypeDetection, cls: 'finance-step-title finance-step-title-sm' });
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
        selG.createEl('label', { text: this.tr.importTypeField, cls: 'finance-filter-label-sm' });
        const sel  = selG.createEl('select', { cls: 'finance-filter-select' });
        this.srcFields.forEach(f => { const o = sel.createEl('option',{text:f}); o.value=f; });
        sel.value      = this.mapping.type || this.srcFields[0] || '';
        this.typeField = sel.value;
        sel.addEventListener('change', () => { this.typeField = sel.value; });

        const incG = row.createDiv('finance-filter-group');
        incG.createEl('label', { text: this.tr.importIncomeValue, cls: 'finance-filter-label-sm' });
        const incI = incG.createEl('input', { type: 'text', cls: 'finance-input', placeholder: 'income' });
        incI.value = 'income';
        incI.addEventListener('input', () => { this.typeMap.incomeVal = incI.value; });

        const expG = row.createDiv('finance-filter-group');
        expG.createEl('label', { text: this.tr.importExpenseValue, cls: 'finance-filter-label-sm' });
        const expI = expG.createEl('input', { type: 'text', cls: 'finance-input', placeholder: 'expense' });
        expI.value = 'expense';
        expI.addEventListener('input', () => { this.typeMap.expenseVal = expI.value; });
      }
    };

    mkRadio('field',       this.tr.importByFieldValue).addEventListener('change', () => { this.typeMode='field';       renderExtra('field'); });
    mkRadio('sign',        this.tr.importByAmountSign).addEventListener('change', () => { this.typeMode='sign';        extraContainer.empty(); });
    mkRadio('all_income',  this.tr.importAllIncome).addEventListener('change',  () => { this.typeMode='all_income';  extraContainer.empty(); });
    mkRadio('all_expense', this.tr.importAllExpense).addEventListener('change', () => { this.typeMode='all_expense'; extraContainer.empty(); });
    renderExtra('field');

    // Import button
    const btnRow = step.createDiv('finance-modal-btns');
    const impBtn = btnRow.createEl('button', {
      text: `${this.tr.importBtn} ${this.rawData.length} ${this.tr.imported}`,
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
      const rawEr  = get('exchangeRate').replace(',', '.').replace(/[^\d.]/g, '');
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
        exchangeRate:   parseFloat(rawEr) || undefined,
        attachmentPath: '',
        linkedId:       '',
      };
    });

    const valid = records.filter(r => r.amount > 0);
    this.o.onImport(valid);
    new Notice(`${this.tr.importSuccess} — ${valid.length} ${this.tr.imported}`);
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
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // MM/DD/YYYY
  const m2 = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m2) return `${m2[3]}-${m2[1].padStart(2,'0')}-${m2[2].padStart(2,'0')}`;
  // Try native Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return new Date().toISOString().split('T')[0];
}
