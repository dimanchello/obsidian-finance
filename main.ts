import { MarkdownPostProcessorContext, Notice, Plugin, PluginSettingTab, App, Setting, TFile, SettingDefinitionItem } from 'obsidian';
import { FinanceStorage } from './src/storage';
import { AccountView }    from './src/AccountView';
import { PluginSettings, DEFAULT_SETTINGS, MINT_GUARD_MS, CODE_BLOCK_LANGUAGES } from './src/types';
import { getLocaleFromApp, t } from './src/i18n';
import { collectAccountIds, insertAccountId, newAccountId, parseAccountId } from './src/domain/accountId';
import { OrphanedAccountsModal } from './src/OrphanedAccountsModal';

type ResolvedAccountId =
  | { kind: 'ok'; id: string }
  | { kind: 'invalid'; raw: string }
  | { kind: 'unwritable' };

export default class FinanceManagerPlugin extends Plugin {
  override settings!: PluginSettings;
  storage!:  FinanceStorage;
  /** Guards against the re-render our own note write triggers. */
  private mintedBlocks = new Set<string>();

  override async onload(): Promise<void> {
    await this.loadSettings();
    this.storage = new FinanceStorage(this.app, this.manifest.id, this.settings.defaultCurrency);

    const processAccountBlock = async (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
      const resolved = await this.resolveAccountId(source, el, ctx);
      if (resolved.kind !== 'ok') {
        this.renderBlockError(el, resolved);
        return;
      }
      const view = new AccountView(this.app, el, resolved.id, ctx.sourcePath, this.storage, this.settings, this.manifest.id);
      ctx.addChild(view);
      await view.render();
    };

    CODE_BLOCK_LANGUAGES.forEach(lang => {
      try {
        this.registerMarkdownCodeBlockProcessor(lang, processAccountBlock);
      } catch (err: unknown) {
        console.warn(`[finance] Could not register code block processor for "${lang}":`, err);
      }
    });

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

  override onunload(): void {
    void this.storage.flush();
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
    el.addClass('finance-manager');
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
    const loaded = (await this.loadData()) as Partial<PluginSettings> | null | undefined;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.storage?.setDefaultCurrency(this.settings.defaultCurrency);
  }
}

class FinanceSettingTab extends PluginSettingTab {
  plugin: FinanceManagerPlugin;

  constructor(app: App, plugin: FinanceManagerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  override getControlValue(key: string): unknown {
    if (key === 'defaultPageSize') {
      return String(this.plugin.settings.defaultPageSize);
    }
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === 'defaultPageSize') {
      this.plugin.settings.defaultPageSize = parseInt(value as string, 10) || 50;
    } else if (key === 'defaultCurrency') {
      this.plugin.settings.defaultCurrency = (value as string) || '₽';
    } else {
      (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
    }
    await this.plugin.saveSettings();
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    const tr = t(getLocaleFromApp(this.app));
    return [
      {
        name: tr.defaultCurrency,
        desc: tr.defaultCurrencyDesc,
        control: {
          type: 'text',
          key: 'defaultCurrency',
          defaultValue: '₽',
        },
      },
      {
        name: tr.pageSize,
        control: {
          type: 'dropdown',
          key: 'defaultPageSize',
          defaultValue: String(this.plugin.settings.defaultPageSize),
          options: { '25': '25', '50': '50', '100': '100', '200': '200', '500': '500' },
        },
      },
      {
        name: tr.currencyManagement,
        render: (setting: Setting) => {
          this.renderCurrencySection(setting.settingEl);
        },
      },
      {
        name: tr.howToUse,
        render: (setting: Setting) => {
          this.renderUsageSection(setting.settingEl);
        },
      },
    ];
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('finance-settings');

    const tr = t(getLocaleFromApp(this.app));

    new Setting(containerEl)
      .setName(tr.pluginTitle)
      .setDesc(tr.pluginDesc)
      .setHeading();

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
        .onChange(async v => { this.plugin.settings.defaultPageSize = parseInt(v, 10); await this.plugin.saveSettings(); }));

    this.renderCurrencySection(containerEl);
    this.renderUsageSection(containerEl);
  }

  private renderCurrencySection(containerEl: HTMLElement): void {
    const tr = t(getLocaleFromApp(this.app));
    new Setting(containerEl)
      .setName(tr.currencyManagement)
      .setHeading();

    const currencyListEl = containerEl.createDiv('finance-currency-list');

    const renderCurrencyList = () => {
      currencyListEl.empty();

      this.plugin.settings.customCurrencies.forEach((c, i) => {
        const row = currencyListEl.createDiv('finance-currency-row');
        row.draggable = true;
        row.setAttribute('data-index', String(i));

        row.createSpan({ text: '⠿', cls: 'finance-currency-grip' });
        row.createSpan({ text: c });
        const rmBtn = row.createEl('button', { text: '×', cls: 'finance-currency-remove' });
        rmBtn.addEventListener('click', () => {
          this.plugin.settings.customCurrencies.splice(i, 1);
          void this.plugin.saveSettings();
          renderCurrencyList();
        });

        row.addEventListener('dragstart', (e) => {
          row.addClass('finance-currency-dragging');
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(i));
          }
        });

        row.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
          }
          currencyListEl.querySelectorAll('.finance-currency-row').forEach(el => el.removeClass('finance-currency-drop-target'));
          row.addClass('finance-currency-drop-target');
        });

        row.addEventListener('dragleave', () => {
          row.removeClass('finance-currency-drop-target');
        });

        row.addEventListener('drop', (e) => {
          e.preventDefault();
          row.removeClass('finance-currency-drop-target');
          const rawFrom = e.dataTransfer?.getData('text/plain');
          const fromIdx = rawFrom ? parseInt(rawFrom, 10) : NaN;
          const rawTo = row.getAttribute('data-index');
          const toIdx = rawTo !== null ? parseInt(rawTo, 10) : NaN;
          if (isNaN(fromIdx) || isNaN(toIdx) || fromIdx === toIdx) return;
          const currencies = this.plugin.settings.customCurrencies;
          const [moved] = currencies.splice(fromIdx, 1);
          if (!moved) return;
          currencies.splice(toIdx, 0, moved);
          void this.plugin.saveSettings();
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
        t.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const v = t.getValue().trim();
            if (v && !this.plugin.settings.customCurrencies.includes(v)) {
              this.plugin.settings.customCurrencies.push(v);
              void this.plugin.saveSettings();
              renderCurrencyList();
              t.setValue('');
            }
          }
        });
        return input;
      })
      .addButton(btn => btn.setButtonText('+').onClick(() => {
        const inputEl = btn.buttonEl.parentElement?.querySelector('input');
        const v = inputEl?.value?.trim() || '';
        if (v && !this.plugin.settings.customCurrencies.includes(v)) {
          this.plugin.settings.customCurrencies.push(v);
          void this.plugin.saveSettings();
          renderCurrencyList();
          if (inputEl) inputEl.value = '';
        }
      }));
  }

  private renderUsageSection(containerEl: HTMLElement): void {
    const tr = t(getLocaleFromApp(this.app));
    new Setting(containerEl)
      .setName(tr.howToUse)
      .setHeading();
    const ul = containerEl.createEl('ul', { cls: 'finance-settings-list' });
    const usage4Text = tr.usage4.replace('{configDir}', this.app.vault.configDir);
    [tr.usage1, tr.usage2, tr.usage3, usage4Text].forEach(text => ul.createEl('li', { text }));
  }
}
