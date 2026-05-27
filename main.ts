import { MarkdownView, Notice, Plugin, PluginSettingTab, App, Setting, TFile } from 'obsidian';
import { FinanceStorage } from './src/storage';
import { AccountView }    from './src/AccountView';
import { PluginSettings, DEFAULT_SETTINGS } from './src/types';

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
      name: 'Вставить шаблон счёта',
      icon: 'wallet',
      editorCallback: (editor) => {
        const template = '```finance-account\n\n```';
        editor.replaceSelection(template);
        const cursor = editor.getCursor();
        editor.setCursor(cursor.line - 1, 0);
        new Notice('✅ Шаблон счёта вставлен');
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
    containerEl.createEl('h2', { text: '💰 Finance Tracker' });
    containerEl.createEl('p', {
      text: 'Глобальные настройки плагина. Валюта и название счёта настраиваются прямо в заметке.',
      cls: 'finance-settings-desc',
    });

    new Setting(containerEl)
      .setName('Валюта по умолчанию')
      .setDesc('Используется для новых счетов. Уже существующие счета имеют свою валюту.')
      .addText(t => t.setPlaceholder('₽').setValue(this.plugin.settings.defaultCurrency)
        .onChange(async v => { this.plugin.settings.defaultCurrency = v || '₽'; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('Записей на странице')
      .addDropdown(d => d
        .addOptions({ '25':'25','50':'50','100':'100','200':'200','500':'500' })
        .setValue(String(this.plugin.settings.defaultPageSize))
        .onChange(async v => { this.plugin.settings.defaultPageSize = parseInt(v); await this.plugin.saveSettings(); }));

    containerEl.createEl('h3', { text: 'Как использовать' });
    const ul = containerEl.createEl('ul', { cls: 'finance-settings-list' });
    [
      'Создайте заметку для каждого счёта (Наличные, Карта, Крипто-кошелёк).',
      'Вставьте в заметку блок кода с языком finance-account.',
      'Название счёта и валюта редактируются прямо в шапке блока.',
      'Данные хранятся в .obsidian/plugins/obsidian-finance/accounts/{название_заметки}/',
    ].forEach(t => ul.createEl('li', { text: t }));
  }
}
