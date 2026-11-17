#!/usr/bin/env python3
"""Concatenate JS source parts into arena/web/static/app.js.

Run from repo root:  python scripts/build-js.py
"""
import pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
JS_DIR = ROOT / "arena" / "web" / "static" / "js"
OUT = ROOT / "arena" / "web" / "static" / "app.js"

HEADER = """\
/* Arena Desktop — local interface controller
 * Unofficial client shell. No direct requests to arena.ai.
 * The only optional simulated data lives behind ?demo=1.
 *
 * AUTO-GENERATED — edit source files in js/ instead.
 * Rebuild: python scripts/build-js.py
 */
(() => {
  'use strict';

  if (window.__arenaDesktopApp) return;
  window.__arenaDesktopApp = true;
"""

FOOTER = """
})();
"""

PARTS = [
    "01-core.js",
    "02-api.js",
    "03-demo.js",
    "04-demo-api.js",
    "05-state.js",
    "06-data.js",
    "07-render.js",
    "08-render2.js",
    "09-composer.js",
    "10-stream.js",
    "11-ui.js",
    "12-settings.js",
    "13-connectors.js",
    "14-boot.js",
    "15-project.js",
]

def build():
    lines = [HEADER]
    for name in PARTS:
        path = JS_DIR / name
        if not path.exists():
            print(f"MISSING: {name}", file=sys.stderr)
            sys.exit(1)
        src = path.read_text(encoding="utf-8")
        lines.append(f"\n  // ═══ {name} ═══\n")
        lines.append(src)
    lines.append(FOOTER)
    OUT.write_text("".join(lines), encoding="utf-8")
    total = sum(1 for c in "".join(lines) if c == "\n")
    print(f"Built {OUT.name}: {total} lines from {len(PARTS)} parts")

if __name__ == "__main__":
    build()
