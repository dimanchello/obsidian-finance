import { MarkdownPostProcessorContext, Notice, Plugin, PluginSettingTab, App, Setting, TFile } from 'obsidian';
import { FinanceStorage } from './src/storage';
import { AccountView }    from './src/AccountView';
import { PluginSettings, DEFAULT_SETTINGS, MINT_GUARD_MS } from './src/types';
import { getLocaleFromApp, t } from './src/i18n';
import { collectAccountIds, insertAccountId, newAccountId, parseAccountId } from './src/domain/accountId';
import { OrphanedAccountsModal } from './src/OrphanedAccountsModal';

type ResolvedAccountId =
  | { kind: 'ok'; id: string }
  | { kind: 'invalid'; raw: string }
  | { kind: 'unwritable' };

export default class FinanceTrackerPlugin extends Plugin {
  settings!: PluginSettings;
  storage!:  FinanceStorage;
  private styleEl?: HTMLStyleElement;
  /** Guards against the re-render our own note write triggers. */
  private mintedBlocks = new Set<string>();

  override async onload(): Promise<void> {
    await this.loadSettings();
    this.storage = new FinanceStorage(this.app, this.manifest.id, this.settings.defaultCurrency);

    // Inject styles dynamically to avoid Obsidian CSS caching issues
    await this.injectStyles();

    this.registerMarkdownCodeBlockProcessor(
      'finance-account',
      async (source, el, ctx) => {
        const resolved = await this.resolveAccountId(source, el, ctx);
        if (resolved.kind !== 'ok') {
          this.renderBlockError(el, resolved);
          return;
        }
        const view = new AccountView(this.app, el, resolved.id, ctx.sourcePath, this.storage, this.settings, this.manifest.id);
        ctx.addChild(view);
        await view.render();
      },
    );

    this.addCommand({
      id: 'find-orphaned-accounts',
      name: t(getLocaleFromApp(this.app)).commandFindOrphans,
      icon: 'search',
      callback: () => { void this.reportOrphanedAccounts(); },
    });

    this.addCommand({
      id: 'insert-finance-account-template',
      name: t(getLocaleFromApp(this.app)).commandInsertTemplate,
      icon: 'wallet',
      editorCallback: (editor) => {
        const template = '```finance-account\n\n```';
        editor.replaceSelection(template);
        const cursor = editor.getCursor();
        editor.setCursor(cursor.line - 1, 0);        const tr = t(getLocaleFromApp(this.app));
        new Notice(tr.templateInserted);
      },
    });

    this.addSettingTab(new FinanceSettingTab(this.app, this));
  }

  override async onunload(): Promise<void> {
    await this.storage.flush();
    this.styleEl?.remove();
  }

  /**
   * Resolves the account id from the block source, minting and writing one on first render.
   * Writing into a user's note is the riskiest thing this plugin does, so it only happens
   * when the id is absent, the section bounds are known, and the block has not been served yet.
   */
  private async resolveAccountId(
    source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext,
  ): Promise<ResolvedAccountId> {
    const parsed = parseAccountId(source);
    if (parsed.kind === 'ok') {
      void this.storage.touchSourcePath(parsed.id, ctx.sourcePath);
      return parsed;
    }
    if (parsed.kind === 'invalid') return parsed;

    const section = ctx.getSectionInfo(el);
    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    // Embedded/exported views give no section info and no writable note. Creating an
    // account here would leave an orphan folder, so refuse rather than guess.
    if (!section || !(file instanceof TFile)) return { kind: 'unwritable' };

    const blockKey = `${ctx.sourcePath}:${section.lineStart}`;
    if (this.mintedBlocks.has(blockKey)) return { kind: 'unwritable' };
    this.mintedBlocks.add(blockKey);
    // Only guards the re-render our own write triggers; a later deliberate removal
    // of the id line must be able to mint a fresh one.
    window.setTimeout(() => this.mintedBlocks.delete(blockKey), MINT_GUARD_MS);

    const id = newAccountId(crypto.randomUUID());
    let written = false;
    await this.app.vault.process(file, (data) => {
      const next = insertAccountId(data, section.lineStart, section.lineEnd, id);
      if (next === null) return data;
      written = true;
      return next;
    });

    if (!written) {
      this.mintedBlocks.delete(blockKey);
      return { kind: 'unwritable' };
    }
    void this.storage.touchSourcePath(id, ctx.sourcePath);
    return { kind: 'ok', id };
  }

  private renderBlockError(el: HTMLElement, resolved: ResolvedAccountId): void {
    const tr = t(getLocaleFromApp(this.app));
    el.empty();
    el.addClass('finance-tracker');
    const box = el.createDiv('finance-block-error');
    if (resolved.kind === 'invalid') {
      box.createEl('strong', { text: tr.blockInvalidIdTitle });
      box.createEl('p', { text: tr.blockInvalidIdDesc.replace('{id}', resolved.raw) });
    } else {
      box.createEl('strong', { text: tr.blockReadOnlyTitle });
      box.createEl('p', { text: tr.blockReadOnlyDesc });
    }
  }

  private async reportOrphanedAccounts(): Promise<void> {
    const tr = t(getLocaleFromApp(this.app));
    const liveIds = new Set<string>();
    for (const file of this.app.vault.getMarkdownFiles()) {
      for (const id of collectAccountIds(await this.app.vault.cachedRead(file))) {
        liveIds.add(id);
      }
    }

    const orphans = await this.storage.findOrphanedAccounts(liveIds);
    if (!orphans.length) {
      new Notice(tr.orphansNone);
      return;
    }
    new OrphanedAccountsModal(this.app, orphans, this.storage).open();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.storage?.setDefaultCurrency(this.settings.defaultCurrency);
  }

  private async injectStyles(): Promise<void> {
    // Remove old style element if exists
    this.styleEl?.remove();

    // Create new style element
    this.styleEl = document.createElement('style');
    this.styleEl.id = 'finance-tracker-styles-v4';

    // Try to load styles from plugin folder
    const configDir = this.app.vault.configDir;
    const stylePaths = [
      `${configDir}/plugins/obsidian-finance/styles.css`,
      `${configDir}/plugins/obsidian-finance/dist/styles.css`,
    ];

    for (const path of stylePaths) {
      try {
        const css = await this.app.vault.adapter.read(path);
        this.styleEl.textContent = css;
        document.head.appendChild(this.styleEl);
        return;
      } catch {
        // Try next path
      }
    }
  }
}

class FinanceSettingTab extends PluginSettingTab {
  plugin: FinanceTrackerPlugin;

  constructor(app: App, plugin: FinanceTrackerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('finance-settings');

    const tr = t(getLocaleFromApp(this.app));

    containerEl.createEl('h2', { text: tr.pluginTitle });
    containerEl.createEl('p', {
      text: tr.pluginDesc,
      cls: 'finance-settings-desc',
    });

    new Setting(containerEl)
      .setName(tr.defaultCurrency)
      .setDesc(tr.defaultCurrencyDesc)
      .addText(t => t.setPlaceholder('₽').setValue(this.plugin.settings.defaultCurrency)
        .onChange(async v => { this.plugin.settings.defaultCurrency = v || '₽'; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName(tr.pageSize)
      .addDropdown(d => d
        .addOptions({ '25':'25','50':'50','100':'100','200':'200','500':'500' })
        .setValue(String(this.plugin.settings.defaultPageSize))
        .onChange(async v => { this.plugin.settings.defaultPageSize = parseInt(v); await this.plugin.saveSettings(); }));

    containerEl.createEl('h3', { text: tr.currencyManagement });

    const currencyListEl = containerEl.createDiv('finance-currency-list');

    const renderCurrencyList = () => {
      currencyListEl.empty();

      this.plugin.settings.customCurrencies.forEach((c, i) => {
        const row = currencyListEl.createDiv('finance-currency-row');
        row.draggable = true;
        row.setAttribute('data-index', String(i));

        row.createEl('span', { text: '⠿', cls: 'finance-currency-grip' });
        row.createSpan({ text: c });
        const rmBtn = row.createEl('button', { text: '×', cls: 'finance-currency-remove' });
        rmBtn.addEventListener('click', async () => {
          this.plugin.settings.customCurrencies.splice(i, 1);
          await this.plugin.saveSettings();
          renderCurrencyList();
        });

        row.addEventListener('dragstart', (e) => {
          row.addClass('finance-currency-dragging');
          e.dataTransfer!.effectAllowed = 'move';
          e.dataTransfer!.setData('text/plain', String(i));
        });

        row.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer!.dropEffect = 'move';
          currencyListEl.querySelectorAll('.finance-currency-row').forEach(el => el.removeClass('finance-currency-drop-target'));
          row.addClass('finance-currency-drop-target');
        });

        row.addEventListener('dragleave', () => {
          row.removeClass('finance-currency-drop-target');
        });

        row.addEventListener('drop', (e) => {
          e.preventDefault();
          row.removeClass('finance-currency-drop-target');
          const fromIdx = parseInt(e.dataTransfer!.getData('text/plain'));
          const toIdx = parseInt(row.getAttribute('data-index')!);
          if (isNaN(fromIdx) || isNaN(toIdx) || fromIdx === toIdx) return;
          const currencies = this.plugin.settings.customCurrencies;
          const [moved] = currencies.splice(fromIdx, 1);
          if (!moved) return;
          currencies.splice(toIdx, 0, moved);
          this.plugin.saveSettings();
          renderCurrencyList();
        });

        row.addEventListener('dragend', () => {
          currencyListEl.querySelectorAll('.finance-currency-row').forEach(el => el.removeClass('finance-currency-dragging finance-currency-drop-target'));
        });
      });
    };
    renderCurrencyList();

    new Setting(containerEl)
      .setName(tr.addCurrency)
      .setDesc(tr.addCurrencyDesc)
      .addText(t => {
        const input = t;
        t.setPlaceholder(tr.currencyPlaceholder);
        t.inputEl.addEventListener('keydown', async (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const v = t.getValue().trim();
            if (v && !this.plugin.settings.customCurrencies.includes(v)) {
              this.plugin.settings.customCurrencies.push(v);
              await this.plugin.saveSettings();
              renderCurrencyList();
              t.setValue('');
            }
          }
        });
        return input;
      })
      .addButton(btn => btn.setButtonText('+').onClick(async () => {
        const inputEl = btn.buttonEl.parentElement?.querySelector('input');
        const v = inputEl?.value?.trim() || '';
        if (v && !this.plugin.settings.customCurrencies.includes(v)) {
          this.plugin.settings.customCurrencies.push(v);
          await this.plugin.saveSettings();
          renderCurrencyList();
          if (inputEl) inputEl.value = '';
        }
      }));

    containerEl.createEl('h3', { text: tr.howToUse });
    const ul = containerEl.createEl('ul', { cls: 'finance-settings-list' });
    [tr.usage1, tr.usage2, tr.usage3, tr.usage4].forEach(t => ul.createEl('li', { text: t }));
  }
}
