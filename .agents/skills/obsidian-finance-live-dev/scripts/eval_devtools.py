#!/usr/bin/env python3
"""
eval_devtools.py
Safely evaluates JavaScript inside the running Obsidian DevTools console and returns the output.
Usage:
    python3 eval_devtools.py "<js_expression>"
    python3 eval_devtools.py - (reads JS from stdin)
Example:
    python3 eval_devtools.py "app.vault.getName()"
    python3 eval_devtools.py "document.querySelector('.finance-manager').getBoundingClientRect()"
"""

import sys
import os
import subprocess
import time

try:
    from Xlib import X, display, XK
    from Xlib.ext import xtest
except ImportError:
    print("Error: python3-xlib is required. Install via pip or apt.", file=sys.stderr)
    sys.exit(1)

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 eval_devtools.py \"<js_expression>\" (or - for stdin)")
        sys.exit(1)

    if sys.argv[1] == "-":
        js_code = sys.stdin.read().strip()
    else:
        js_code = " ".join(sys.argv[1:]).strip()

    # Find DevTools window
    try:
        lines = subprocess.check_output(["wmctrl", "-l"]).decode("utf-8").splitlines()
    except subprocess.CalledProcessError as e:
        print(f"Error executing wmctrl: {e}", file=sys.stderr)
        sys.exit(1)

    devtools_id = None
    for line in lines:
        parts = line.split(maxsplit=3)
        if len(parts) >= 4 and "developer tools" in parts[3].lower():
            devtools_id = parts[0]
            break

    if not devtools_id:
        print("Error: DevTools window not found in wmctrl -l.", file=sys.stderr)
        sys.exit(1)

    # Wrap JS into async IIFE that writes result or error to electron clipboard
    wrapped = f"""(async () => {{
  try {{
    const __fn = async () => {{ {js_code} }};
    let res = await __fn();
    if (res === undefined) {{
      try {{ res = eval({repr(js_code)}); }} catch (_) {{}}
    }}
    if (res === undefined) {{
      require("electron").clipboard.writeText("undefined");
    }} else if (typeof res === "string") {{
      require("electron").clipboard.writeText(res);
    }} else {{
      require("electron").clipboard.writeText(JSON.stringify(res, null, 2));
    }}
  }} catch (e) {{
    require("electron").clipboard.writeText("EVAL_ERROR: " + (e ? (e.message || String(e)) : "unknown"));
  }}
}})()""".replace("\n", " ")

    # Load wrapped command into clipboard
    p = subprocess.Popen(["xclip", "-selection", "clipboard", "-in"], stdin=subprocess.PIPE)
    p.communicate(input=wrapped.encode("utf-8"))

    # Activate DevTools window
    subprocess.run(["wmctrl", "-i", "-a", devtools_id], check=True)
    time.sleep(0.25)

    d = display.Display()
    ctrl = d.keysym_to_keycode(XK.string_to_keysym("Control_L"))
    a = d.keysym_to_keycode(XK.string_to_keysym("a"))
    v = d.keysym_to_keycode(XK.string_to_keysym("v"))
    bs = d.keysym_to_keycode(XK.string_to_keysym("BackSpace"))
    enter = d.keysym_to_keycode(XK.string_to_keysym("Return"))

    # Clear current prompt: Ctrl+A, Backspace
    xtest.fake_input(d, X.KeyPress, ctrl)
    xtest.fake_input(d, X.KeyPress, a)
    xtest.fake_input(d, X.KeyRelease, a)
    xtest.fake_input(d, X.KeyRelease, ctrl)
    d.sync()
    time.sleep(0.04)

    xtest.fake_input(d, X.KeyPress, bs)
    xtest.fake_input(d, X.KeyRelease, bs)
    d.sync()
    time.sleep(0.04)

    # Paste code: Ctrl+V
    xtest.fake_input(d, X.KeyPress, ctrl)
    xtest.fake_input(d, X.KeyPress, v)
    xtest.fake_input(d, X.KeyRelease, v)
    xtest.fake_input(d, X.KeyRelease, ctrl)
    d.sync()
    time.sleep(0.05)

    # Execute code: Enter
    xtest.fake_input(d, X.KeyPress, enter)
    xtest.fake_input(d, X.KeyRelease, enter)
    d.sync()

    # Wait for execution and clipboard write
    time.sleep(0.5)

    out = subprocess.check_output(["xclip", "-selection", "clipboard", "-out"]).decode("utf-8")
    print(out)

if __name__ == "__main__":
    main()
