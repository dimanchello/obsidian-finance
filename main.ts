import { MarkdownView, Notice, Plugin, PluginSettingTab, App, Setting, TFile } from 'obsidian';
import { FinanceStorage } from './src/storage';
import { AccountView }    from './src/AccountView';
import { PluginSettings, DEFAULT_SETTINGS } from './src/types';
import { getLocaleFromApp, t } from './src/i18n';

export default class FinanceTrackerPlugin extends Plugin {
  settings: PluginSettings;
  storage:  FinanceStorage;
  private styleEl?: HTMLStyleElement;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.storage = new FinanceStorage(this.app, this.manifest.id, this.settings.defaultCurrency);

    // Inject styles dynamically to avoid Obsidian CSS caching issues
    await this.injectStyles();

    this.registerMarkdownCodeBlockProcessor(
      'finance-account',
      async (source, el, ctx) => {
        const view = new AccountView(this.app, el, ctx.sourcePath, this.storage, this.settings, this.manifest.id);
        await view.render();
      },
    );

    this.addCommand({
      id: 'insert-finance-account-template',
      name: t(getLocaleFromApp(this.app)).commandInsertTemplate,
      icon: 'wallet',
      editorCallback: (editor) => {
        const template = '```finance-account\n\n```';
        editor.replaceSelection(template);
        const cursor = editor.getCursor();
        editor.setCursor(cursor.line - 1, 0);
        const tr = t(getLocaleFromApp(this.app));
        new Notice(tr.templateInserted);
      },
    });

    this.registerEvent(
      this.app.vault.on('rename', (file: TFile, oldPath: string) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.storage.renameAccount(oldPath, file.path);
          const oldKey = 'ft-view:' + this.manifest.id + ':' + oldPath;
          const newKey = 'ft-view:' + this.manifest.id + ':' + file.path;
          try {
            const val = localStorage.getItem(oldKey);
            if (val) {
              localStorage.setItem(newKey, val);
              localStorage.removeItem(oldKey);
            }
          } catch { /* ignore */ }
        }
      }),
    );

    this.addSettingTab(new FinanceSettingTab(this.app, this));
  }

  async onunload(): Promise<void> {
    await this.storage.flush();
    this.styleEl?.remove();
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
