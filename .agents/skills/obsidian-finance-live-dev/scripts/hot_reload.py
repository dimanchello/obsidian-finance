#!/usr/bin/env python3
"""
hot_reload.py
Builds the plugin, copies dist assets to the specified Obsidian test vault, and triggers
live style or plugin reload inside the running Obsidian instance.

Usage:
    python3 hot_reload.py [--vault <path_or_name>] [--no-build] [--restart-plugin]

Vault Resolution:
    1. CLI argument: --vault <path_or_name>
    2. Environment variable: OBSIDIAN_VAULT
    3. Auto-detected from active Obsidian DevTools instance (app.vault.adapter.basePath)
"""

import sys
import os
import json
import subprocess

def get_repo_root():
    try:
        root = subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"],
            stderr=subprocess.DEVNULL
        ).decode("utf-8").strip()
        if os.path.isdir(root):
            return root
    except Exception:
        pass
    # Fallback to relative path from script location: .agents/skills/obsidian-finance-live-dev/scripts/
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../"))

def get_plugin_id(repo_root):
    manifest_path = os.path.join(repo_root, "manifest.json")
    if os.path.isfile(manifest_path):
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "id" in data:
                    return data["id"]
        except Exception:
            pass
    return "finance-manager"

def eval_in_obsidian(js_code):
    script_path = os.path.join(os.path.dirname(__file__), "eval_devtools.py")
    if not os.path.isfile(script_path):
        return ""
    res = subprocess.run([sys.executable, script_path, js_code], capture_output=True, text=True)
    return res.stdout.strip()

def resolve_vault_path(cli_vault):
    # 1. From CLI flag
    if cli_vault:
        expanded = os.path.abspath(os.path.expanduser(cli_vault))
        if os.path.isdir(expanded):
            return expanded
        # If passed as simple name (e.g. "ForTest"), search in common locations
        common_bases = [
            os.path.expanduser("~/Obsidian"),
            os.path.expanduser("~/Documents/Obsidian"),
            os.path.expanduser("~"),
        ]
        for base in common_bases:
            cand = os.path.join(base, cli_vault)
            if os.path.isdir(cand):
                return cand
        print(f"Warning: Specified vault '{cli_vault}' not found as absolute or common path. Using as '{expanded}'.", file=sys.stderr)
        return expanded

    # 2. From Environment Variable
    env_vault = os.environ.get("OBSIDIAN_VAULT")
    if env_vault:
        expanded = os.path.abspath(os.path.expanduser(env_vault))
        if os.path.isdir(expanded):
            return expanded

    # 3. Auto-detect from active Obsidian DevTools
    detected = eval_in_obsidian("app.vault.adapter.basePath")
    if detected and not detected.startswith("EVAL_ERROR") and os.path.isdir(detected):
        print(f"ℹ️ Auto-detected active vault from Obsidian: {detected}")
        return detected

    return None

def main():
    args = sys.argv[1:]
    no_build = "--no-build" in args
    restart_plugin = "--restart-plugin" in args

    cli_vault = None
    if "--vault" in args:
        idx = args.index("--vault")
        if idx + 1 < len(args):
            cli_vault = args[idx + 1]

    repo_root = get_repo_root()
    plugin_id = get_plugin_id(repo_root)

    vault_path = resolve_vault_path(cli_vault)
    if not vault_path:
        print("❌ Error: Target Obsidian vault could not be resolved.", file=sys.stderr)
        print("Please specify the vault explicitly using --vault <path_or_name> or set OBSIDIAN_VAULT.", file=sys.stderr)
        sys.exit(1)

    plugin_target_dir = os.path.join(vault_path, ".obsidian", "plugins", plugin_id)

    if not no_build:
        print(f"🔨 Building plugin (npm run build) in {repo_root}...")
        subprocess.run(["npm", "run", "build"], cwd=repo_root, check=True)

    print(f"📦 Copying dist assets to {plugin_target_dir}...")
    os.makedirs(plugin_target_dir, exist_ok=True)
    subprocess.run(
        ["cp", "dist/main.js", "dist/manifest.json", "dist/styles.css", plugin_target_dir + "/"],
        cwd=repo_root,
        check=True
    )

    if restart_plugin:
        print(f"🔄 Toggling {plugin_id} plugin in Obsidian...")
        eval_in_obsidian(
            f"(async () => {{ "
            f"await app.plugins.disablePlugin('{plugin_id}'); "
            f"await app.plugins.enablePlugin('{plugin_id}'); "
            f"return 'RELOADED'; }})()"
        )
    else:
        print("🎨 Injecting updated styles into Obsidian...")
        eval_in_obsidian(
            f"(async () => {{ "
            f"const p = app.plugins.plugins['{plugin_id}']; "
            f"if (p) await p.injectStyles(); "
            f"return 'STYLES_INJECTED'; }})()"
        )

    print(f"✅ Hot-reload complete for vault: {vault_path}")

if __name__ == "__main__":
    main()
