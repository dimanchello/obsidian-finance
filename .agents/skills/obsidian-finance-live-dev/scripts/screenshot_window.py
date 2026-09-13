#!/usr/bin/env python3
"""
screenshot_window.py
Capture a screenshot of a specific window by title substring (e.g. 'ForTest', 'My', 'Developer Tools').
Usage:
    python3 screenshot_window.py <title_pattern> <output_png_path>
Example:
    python3 screenshot_window.py ForTest /tmp/fortest.png
"""

import sys
import os
import subprocess
import time

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 screenshot_window.py <title_pattern> <output_png_path>")
        sys.exit(1)

    pattern = sys.argv[1].strip()
    out_file = os.path.abspath(sys.argv[2].strip())

    # Find window id via wmctrl
    try:
        lines = subprocess.check_output(["wmctrl", "-l"]).decode("utf-8").splitlines()
    except subprocess.CalledProcessError as e:
        print(f"Error executing wmctrl: {e}")
        sys.exit(1)

    target_id = None
    target_title = None
    for line in lines:
        parts = line.split(maxsplit=3)
        if len(parts) >= 4:
            wid = parts[0]
            title = parts[3]
            if pattern.lower() in title.lower():
                target_id = wid
                target_title = title
                break

    if not target_id:
        print(f"Window matching '{pattern}' not found among open windows.")
        sys.exit(1)

    # Activate window
    subprocess.run(["wmctrl", "-i", "-a", target_id], check=True)
    time.sleep(0.35)

    # Capture window screenshot
    subprocess.run(["gnome-screenshot", "-w", "-f", out_file], check=True)
    print(f"Successfully captured '{target_title}' ({target_id}) -> {out_file}")

if __name__ == "__main__":
    main()
