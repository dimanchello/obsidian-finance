import { vi } from 'vitest';

vi.mock('obsidian', () => ({
  normalizePath: (path: string) => path.replace(/[\\/:"*?<>|]/g, '_'),
  Notice: vi.fn(),
  Platform: { isMobile: false },
  TFile: class TFile {},
  App: class {},
  Plugin: class {},
  PluginSettingTab: class {},
  Setting: class {},
}));