import { vi } from 'vitest';

export const normalizePath = (path: string) => path.replace(/[\\/:"*?<>|]/g, '_');
export const Notice = vi.fn();
export const Platform = { isMobile: false };
export class TFile {}
export class App {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export function TextComponent() {}
export function DropdownComponent() {}
