---
name: obsidian-finance-live-dev
description: Live visual development and interactive debugging of the obsidian-finance plugin inside a running Obsidian instance. Use for UI/UX changes, layout/styling fixes, theme compatibility, modal inspection, and hot-reloading with real-time DevTools and visual screenshot verification.
---

# Obsidian Finance: Live Visual Development

This skill defines the workflow for **interactive, visual pair-programming and debugging** of the Obsidian Finance plugin directly inside a live running instance of Obsidian on Linux (X11).

Use this skill whenever you need to:
- Inspect, tweak, or fix UI layout, paddings, margins, responsive breakpoints, and visual alignment.
- Debug Obsidian theme interactions (e.g. Minimal Theme table margin overrides, dark/light contrast).
- Verify modal window widths, element placement, button wrapping, and scrolling.
- Emulate mobile mode live (`app.emulateMobile(true)`) to verify card layouts and touch ergonomics.
- Hot-reload changes into a running Obsidian vault with immediate visual feedback via screenshots.

---

## 1. Vault Selection & Safety Protocol (Mandatory First Step)

### ❓ Clarify Target Vault with the User
Before performing any live modifications, copying files, or reloading plugins, the agent **MUST** confirm which vault to use:

1. **Check User Prompt**: If the user already specified the test vault (e.g. "в хранилище ForTest"), use it.
2. **Detect Available Vaults**: If not specified, inspect open Obsidian windows:
   ```bash
   wmctrl -l | grep -i obsidian
   ```
   Or query the currently attached DevTools window:
   ```bash
   python3 .agents/skills/obsidian-finance-live-dev/scripts/eval_devtools.py "app.vault.getName() + ' (' + app.vault.adapter.basePath + ')'"
   ```
3. **Ask the User**: If there are multiple vaults or ambiguity, explicitly ask:
   > *"Уточните, пожалуйста, в каком тестовом хранилище тестировать изменения: `<VaultName>` или в другом? И есть ли хранилище-эталон, которое нельзя изменять?"*
4. **Strict Isolation**:
   - **Target Test Sandbox**: The confirmed test vault (e.g. `ForTest`). All builds and live updates go ONLY here.
   - **Read-Only Benchmark**: Any reference or personal vault (e.g. `My`) must **NEVER** be edited, modified, or written to.
5. **BRAT Auto-update Check**:
   - Check if the target test vault uses the `obsidian42-brat` community plugin (`<vault>/.obsidian/plugins/obsidian42-brat/data.json`).
   - If the repository plugin is listed under `"pluginList"` with `"updateAtStartup": true`, BRAT will overwrite local files on every Obsidian restart. Temporarily remove it from BRAT during development.

---

## 2. Bundled Automation Scripts

The skill provides standalone, vault-agnostic helper scripts located in `./scripts/`:

### A. Window Screenshot: `scripts/screenshot_window.py`
Finds a window by title substring (e.g. vault name like `ForTest`, `My`, or `Developer Tools`), brings it to the front, and saves a crisp screenshot to a PNG file.

```bash
python3 .agents/skills/obsidian-finance-live-dev/scripts/screenshot_window.py <vault_name> /tmp/vault.png
```
Inspect the resulting image immediately using the `view_file` tool:
```json
{ "AbsolutePath": "/tmp/vault.png" }
```

### B. DevTools JS Evaluation: `scripts/eval_devtools.py`
Executes JavaScript expressions or async statements inside Obsidian's Developer Tools console and returns the output via clipboard bridge.

```bash
# Query active vault name and path
python3 .agents/skills/obsidian-finance-live-dev/scripts/eval_devtools.py "app.vault.getName() + ': ' + app.vault.adapter.basePath"

# Inspect bounding rect of an element
python3 .agents/skills/obsidian-finance-live-dev/scripts/eval_devtools.py "document.querySelector('.finance-manager').getBoundingClientRect()"

# Read computed styles
python3 .agents/skills/obsidian-finance-live-dev/scripts/eval_devtools.py "window.getComputedStyle(document.querySelector('.finance-manager')).marginLeft"
```

### C. Fast Hot-Reload: `scripts/hot_reload.py`
Builds the bundle, copies distribution assets (`dist/main.js`, `dist/manifest.json`, `dist/styles.css`) to `<vault>/.obsidian/plugins/<pluginId>/`, and re-injects styles or toggles the plugin live.

```bash
# Standard hot-reload with explicit vault:
python3 .agents/skills/obsidian-finance-live-dev/scripts/hot_reload.py --vault <vault_path_or_name>

# Auto-detect active vault from Obsidian DevTools:
python3 .agents/skills/obsidian-finance-live-dev/scripts/hot_reload.py

# Style-only quick reload (skip TypeScript build if only styles.css was changed):
python3 .agents/skills/obsidian-finance-live-dev/scripts/hot_reload.py --vault <vault> --no-build

# Full plugin restart (disables and re-enables plugin inside Obsidian):
python3 .agents/skills/obsidian-finance-live-dev/scripts/hot_reload.py --vault <vault> --restart-plugin
```

---

## 3. Step-by-Step Live Development Workflow

### Step 1: Clarify & Confirm Target Vault
Ensure you and the user are aligned on the target test vault name/path.

### Step 2: Capture Baseline State
Visually inspect the active UI in the target vault:
```bash
python3 .agents/skills/obsidian-finance-live-dev/scripts/screenshot_window.py <vault_name> /tmp/baseline.png
```
View `/tmp/baseline.png` with `view_file`.

If diagnosing a styling or sizing bug, query the computed properties directly:
```bash
python3 .agents/skills/obsidian-finance-live-dev/scripts/eval_devtools.py "(() => {
  const el = document.querySelector('.finance-credit-detail-modal');
  const cs = window.getComputedStyle(el);
  return { width: cs.width, maxWidth: cs.maxWidth, rect: el.getBoundingClientRect() };
})()"
```

### Step 3: Implement Changes
Edit source files or `styles.css` while following all conventions in `AGENTS.md`:
- Domain constants strictly from `src/constants.ts` (re-exported in `src/types.ts`).
- No magic numbers: extract all semantic numeric values to named constants.
- Bilingual UI: all strings in `src/i18n.ts` (`Translations`, `ru`, `en`).
- Data versioning: preserve `DATA_VERSION = 1` and provide defaults (`??=`).
- Responsive layout: ensure mobile adaptations support $\le 480\text{px}$.

### Step 4: Run Verification Gate
Before testing in Obsidian, ensure code passes the test and lint suites:
```bash
npm run lint   # 0 errors
npm run build  # Clean tsc + esbuild
npm test       # All vitest unit tests green
```

### Step 5: Hot-Reload into the Target Vault
Deploy changes:
```bash
python3 .agents/skills/obsidian-finance-live-dev/scripts/hot_reload.py --vault <vault>
```
If you changed TS code (e.g. modals, buttons, view logic), use `--restart-plugin`:
```bash
python3 .agents/skills/obsidian-finance-live-dev/scripts/hot_reload.py --vault <vault> --restart-plugin
```

### Step 6: Visual Verification & Interaction
1. **Capture New Screenshot**:
   ```bash
   python3 .agents/skills/obsidian-finance-live-dev/scripts/screenshot_window.py <vault_name> /tmp/verified.png
   ```
2. **View and Inspect**: Use `view_file` to review `/tmp/verified.png`.
3. **Simulate Interactions**:
   - **Click Elements / Open Modals**:
     ```bash
     python3 .agents/skills/obsidian-finance-live-dev/scripts/eval_devtools.py "document.querySelector('.finance-deposit-overview-card').click()"
     ```
   - **Scroll inside containers**:
     ```python
     python3 -c "
     from Xlib import X, display
     from Xlib.ext import xtest
     import time
     d = display.Display()
     xtest.fake_input(d, X.MotionNotify, x=500, y=500)
     for _ in range(10):
         xtest.fake_input(d, X.ButtonPress, 5) # 5 = scroll down, 4 = scroll up
         xtest.fake_input(d, X.ButtonRelease, 5)
         time.sleep(0.04)
     d.sync()
     "
     ```
   - **Press Keys (Escape to close modals, Enter, PageDown)**:
     ```python
     python3 -c "
     from Xlib import X, display, XK
     from Xlib.ext import xtest
     d = display.Display()
     esc = d.keysym_to_keycode(XK.string_to_keysym('Escape'))
     xtest.fake_input(d, X.KeyPress, esc)
     xtest.fake_input(d, X.KeyRelease, esc)
     d.sync()
     "
     ```

### Step 7: Mobile Mode Emulation
Always test mobile responsiveness live:
```bash
# Enable mobile emulation
python3 .agents/skills/obsidian-finance-live-dev/scripts/eval_devtools.py "app.emulateMobile(true)"

# Capture mobile screenshot
python3 .agents/skills/obsidian-finance-live-dev/scripts/screenshot_window.py <vault_name> /tmp/mobile.png

# Disable mobile emulation when done
python3 .agents/skills/obsidian-finance-live-dev/scripts/eval_devtools.py "app.emulateMobile(false)"
```
Verify that:
- Tables switch to card-based block layout.
- Touch target buttons have minimum height $44\text{px}$.
- No horizontal scrollbars or cutoffs occur.

---

## 4. Troubleshooting & Known Quirks

| Symptom | Cause | Solution |
|---|---|---|
| Live Preview content shifts right in Minimal theme | Minimal theme applies `margin-inline: var(--container-table-margin) !important` to `div:has(table)`. | Ensure `styles.css` overrides `.markdown-source-view.mod-cm6 .cm-contentContainer.cm-contentContainer > .cm-content > div:has(.finance-manager)` with `margin-inline: 0 !important; margin-left: 0 !important; margin-right: 0 !important;`. |
| Local changes disappear after restarting Obsidian | Obsidian42 BRAT downloaded the GitHub release and overwrote the plugin folder. | Remove the repository from `<vault>/.obsidian/plugins/obsidian42-brat/data.json`. |
| Modal buttons wrap to a second line | Modal `max-width` is narrower than total width of action buttons + gaps + padding. | Increase modal width (e.g. `.modal.finance-credit-detail-modal { max-width: 800px !important; width: min(96vw, 800px) !important; }`). |
| Injected styles not updating | Obsidian cached old `<style>` tag. | Call `app.plugins.plugins['<pluginId>'].injectStyles()` via `eval_devtools.py`. |
