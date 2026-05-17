import { Plugin, PluginSettingTab, App, Setting } from 'obsidian';
import { FinanceStorage } from './src/storage';
import { AccountView }    from './src/AccountView';
import { PluginSettings, DEFAULT_SETTINGS } from './src/types';

export default class FinanceTrackerPlugin extends Plugin {
  settings: PluginSettings;
  storage:  FinanceStorage;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.storage = new FinanceStorage(this.app, this.manifest.id, this.settings.defaultCurrency);

    this.registerMarkdownCodeBlockProcessor(
      'finance-account',
      async (source, el, ctx) => {
        const view = new AccountView(this.app, el, ctx.sourcePath, this.storage, this.settings);
        await view.render();
      },
    );

    this.addSettingTab(new FinanceSettingTab(this.app, this));
  }

  async onunload(): Promise<void> {
    await this.storage.flush();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.storage?.setDefaultCurrency(this.settings.defaultCurrency);
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

    new Setting(containerEl)
      .setName('Папка для вложений')
      .setDesc('Куда сохраняются фото чеков и документы.')
      .addText(t => t.setPlaceholder('Finance/Attachments').setValue(this.plugin.settings.attachmentsFolder)
        .onChange(async v => { this.plugin.settings.attachmentsFolder = v || 'Finance/Attachments'; await this.plugin.saveSettings(); }));

    containerEl.createEl('h3', { text: 'Как использовать' });
    const ul = containerEl.createEl('ul', { cls: 'finance-settings-list' });
    [
      'Создайте заметку для каждого счёта (Наличные, Карта, Крипто-кошелёк).',
      'Вставьте в заметку блок кода с языком finance-account.',
      'Название счёта и валюта редактируются прямо в шапке блока.',
      'Данные хранятся в .obsidian/plugins/obsidian-finance/accounts/',
    ].forEach(t => ul.createEl('li', { text: t }));
  }
}
