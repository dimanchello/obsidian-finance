import { App, TFile, normalizePath, Notice } from 'obsidian';
import type { Translations } from '../i18n';

export interface AttachmentFieldOptions {
  app: App;
  pluginId: string;
  tr: Pick<Translations, 'attachment' | 'selectFile' | 'notSelected' | 'saveError'>;
  initialPath: string;
  onChange: (newPath: string) => void;
}

/**
 * Renders an attachment field into `container`:
 *  - A clickable "📎 filename" button when an attachment already exists (opens it in Obsidian).
 *  - A file-picker (image / PDF) that uploads to the vault and calls `onChange`.
 *  - An inline image preview for image attachments.
 */
export function buildAttachmentField(
  container: HTMLElement,
  opts: AttachmentFieldOptions,
): void {
  const { app, pluginId, tr, initialPath, onChange } = opts;
  let currentPath = initialPath;
  let uploadInProgress = false;

  const g = container.createDiv('finance-field-group');
  g.createEl('label', { text: tr.attachment, cls: 'finance-field-label' });

  // ── Existing-attachment indicator ──────────────────────────────────────────
  const openWrap = g.createDiv('finance-attach-open-wrap');

  const renderOpenIndicator = (path: string) => {
    openWrap.empty();
    if (!path) return;
    const btn = openWrap.createEl('button', { cls: 'finance-attach-open-btn', type: 'button' });
    btn.createEl('span', { text: '📎 ' });
    btn.createEl('span', { text: path.split('/').pop() ?? path, cls: 'finance-attach-open-name' });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const f = app.vault.getAbstractFileByPath(path);
      if (f instanceof TFile) {
        void app.workspace.getLeaf(false).openFile(f);
      }
    });
  };
  renderOpenIndicator(currentPath);

  // ── File picker ────────────────────────────────────────────────────────────
  const wrap = g.createDiv('finance-attach-wrapper');
  const fi = wrap.createEl('input', { type: 'file', cls: 'finance-file-input' });
  fi.accept = 'image/*,.pdf';
  const uid = `ft-${Date.now()}`;
  fi.id = uid;
  const lbl = wrap.createEl('label', { cls: 'finance-attach-label' });
  lbl.setAttribute('for', uid);
  lbl.createEl('span', { text: '📎' });
  lbl.createEl('span', { text: tr.selectFile });
  const nameEl = wrap.createEl('span', {
    text: currentPath
      ? (currentPath.split('/').pop() ?? currentPath)
      : tr.notSelected,
    cls: 'finance-attach-name',
  });

  // ── Inline image preview ───────────────────────────────────────────────────
  const preview = g.createDiv('finance-image-preview is-hidden');
  if (currentPath) {
    const af = app.vault.getAbstractFileByPath(currentPath);
    if (af instanceof TFile) {
      const src = app.vault.getResourcePath(af);
      if (src && /\.(png|jpe?g|gif|webp|svg)$/i.test(currentPath)) {
        preview.removeClass('is-hidden');
        preview.createEl('img', { cls: 'finance-preview-img' }).src = src;
      }
    }
  }

  // ── Upload handler ─────────────────────────────────────────────────────────
  fi.addEventListener('change', async () => {
    if (uploadInProgress) return;
    const file = fi.files?.[0];
    if (!file) return;
    uploadInProgress = true;
    nameEl.textContent = file.name;

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => {
        preview.empty();
        preview.removeClass('is-hidden');
        preview.createEl('img', { cls: 'finance-preview-img' }).src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }

    try {
      const vaultCfg = (app.vault as any).getConfig('attachmentFolderPath') ?? '/';
      let folder: string;
      if (vaultCfg === './' || vaultCfg === '/') {
        folder = pluginId;
      } else {
        folder = normalizePath(`${vaultCfg}/${pluginId}`);
      }
      if (!app.vault.getAbstractFileByPath(folder)) {
        await app.vault.createFolder(folder);
      }
      const dest = normalizePath(
        `${folder}/${Date.now()}_${file.name.replace(/[<>:"/\\|?*]/g, '_')}`,
      );
      await app.vault.createBinary(dest, await file.arrayBuffer());
      currentPath = dest;
      onChange(dest);
      nameEl.textContent = `✓ ${file.name}`;
      nameEl.classList.add('finance-attach-ok');
      renderOpenIndicator(dest);
    } catch {
      new Notice(tr.saveError);
    } finally {
      uploadInProgress = false;
    }
  });
}
