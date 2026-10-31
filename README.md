# Arena CLI — Unofficial CLI Port of Arena.ai

<p align="center">
  <img src="assets/logo.png" width="128" alt="Arena CLI Logo">
</p>

<p align="center">
  <strong>Free agentic AI coding assistant</strong> — access 400+ top LLMs via arena.ai<br>
  GPT-5.5 · Claude Sonnet 5 · Grok 4.6 · DeepSeek · Qwen 3.7 · Gemini 3.8
</p>

<p align="center">
  <img src="https://img.shields.io/badge/models-400+-10B981?style=flat-square" alt="400+ models">
  <img src="https://img.shields.io/badge/cost-free-F59E0B?style=flat-square" alt="Free">
  <img src="https://img.shields.io/badge/platform-Windows-06B6D4?style=flat-square" alt="Windows">
</p>

> **Disclaimer:** This is an unofficial, community-built CLI port. Not affiliated with or endorsed by Arena AI Inc.

---

## Quick Start

**Option 1 — Compiled .exe (no Python needed):**
```cmd
arena-cli.exe
```

**Option 2 — Python script:**
```cmd
pip install -r requirements.txt
python arena-cli.py
```

**Option 3 — Direct CLI:**
```cmd
arena.bat chat
arena.bat mode webdev
arena.bat ask "Explain quantum computing in 2 sentences"
```

---

## Desktop app (arena-ai.exe)

The desktop app is an IDE-style window over arena.ai. A hidden arena.ai window (the engine) sends your chats from arena.ai's own page, so arena's own reCAPTCHA and Cloudflare checks run in a real browser with your real session.

- **Sign in:** press *Sign in with the arena.ai window* and sign in with Google or email; the app picks up the session by itself. Fallback: in your browser run `copy(document.cookie)` in the F12 Console on arena.ai, then press *Paste from clipboard*.
- **Human checks:** when arena.ai asks for a reCAPTCHA checkbox or a Cloudflare check, the app shows the arena.ai window so you can finish it, then resends your message. The app never solves checks for you.
- **Chat modes:** Battle, Side by Side, Direct and Agent; modalities Auto, Text, Code, Search, Image and Video.
- **Agent mode:** one model works in your project folder with `ls`, `read_file`, `search`, `write_file`, `edit_file`, `mkdir`, `delete` and `run_cmd`.
- **Permission modes** (Shift+Tab cycles them), modelled on Claude Code:
  - *Ask before edits:* approve every change and command.
  - *Accept edits:* file edits run freely; deletes and commands ask.
  - *Auto:* free inside the project folder; risky commands ask.
  - *Plan mode:* read only.
  - *Bypass permissions:* never ask; catastrophic commands stay blocked.
- **Code mode:** each answer's project is mirrored to `~/ArenaProjects/<chat>/model-a|b`. Use *Open folder*, *Download zip* or *Local preview*. Previews run on a separate local port, so generated code cannot call the app's API.
- **Media:** generated images, video and audio have a *Save to disk* button (saved to `~/ArenaProjects/media`).
- **Help and diagnostics:** `/help` or F1 shows commands and shortcuts. `/doctor` checks every outside contract the app relies on: arena.ai reachable, reCAPTCHA key, model catalog, engine, session and workspace.
- **Rotation-proof contracts:** the app relies only on endpoint paths and field names, kept in `arena/contracts.py`. It reads the reCAPTCHA key from the live page. If arena.ai moves an endpoint, put the new path in `~/.arena-cli/contracts.json` (`{"paths": {"create": "/new/path"}}`) instead of waiting for an update.

## Features

### 4 Core Modalities

| Modality | Command | Description |
| :--- | :--- | :--- |
| **Text / Chat** | `/mode chat` | General reasoning, multi-turn coding and conversation |
| **Code / Webdev** | `/mode code` | Builds code and deploys interactive web preview sandboxes |
| **Search** | `/mode search` | Real-time web search with live source citations |
| **Image** | `/mode image` | Text-to-image synthesis |

**Max Router** — `/mode router` dynamically routes each prompt to the highest-performing S-tier model.

### Chat Commands

| Command | Description |
| :--- | :--- |
| `/model NAME` | Switch active model |
| `/models` | Browse all 100+ free models |
| `/mode MODE` | Switch modality (chat/code/search/image/router) |
| `/settings` | Interactive settings editor (arrow keys) |
| `/persona TEXT` | Set custom AI persona / system prompt |
| `/login` | Re-authenticate or switch browser |
| `/new` | Start fresh conversation |
| `/tools` | List active developer tools |
| `/cd PATH` | Change working directory |
| `/debug` | Toggle raw stream debug logging |

### Interactive Settings

Arrow-key navigation to configure:
- **Theme** — arena / dark / light
- **Show Reasoning** — display model chain-of-thought
- **Auto Copy** — copy responses to clipboard
- **Max History** — conversation context window
- **CDP Port** — browser debugging port

### Multi-Browser Support (CLI mode, 6 Platforms)

CLI mode only (`arena-ai.exe --cli`). Zero-friction login with automatic cookie detection:
- **Brave Browser** *(Recommended)*
- **Google Chrome**
- **Microsoft Edge**
- **Mozilla Firefox**
- **Opera / Opera GX**
- **Vivaldi**

### Developer Tools & MCP

Built-in agentic tools:
- `read_file` — inspect files with line numbers
- `write_file` — create or replace files
- `edit_file` — precise targeted string replacements
- `run_cmd` — execute shell commands with timeout
- `search` — regex grep across codebase
- `ls` — formatted directory explorer
- `browser_detect` — scan active browser processes
- `browser_open_url` — launch pages in any browser
- `browser_list_tabs` — enumerate open CDP tabs
- `browser_exec_js` — evaluate scripts in browser tabs

---

## How It Works

**Desktop app:** nothing else is launched. Sign-in, chats and any human check happen on an arena.ai page inside the app (Edge WebView2), and the app picks up your session cookie from it.

**CLI mode:** Arena CLI uses Chrome DevTools Protocol (CDP) to proxy API requests through a real browser tab on arena.ai. This handles reCAPTCHA Enterprise validation and Cloudflare cookies automatically — no tokens to manage.

1. **Login** — paste your arena.ai cookies or auto-detect from clipboard
2. **CDP Browser** — a browser launches with `--remote-debugging-port` for reliable API access
3. **Chat** — messages are sent through the browser's authenticated session

---

## Building from Source

```cmd
pip install pyinstaller
pyinstaller arena-cli.spec
```

The .exe appears in `dist/arena-cli.exe`.

---

## Requirements (Python mode)

```
pip install rich requests prompt_toolkit websocket-client pyperclip
```

---

## Project Structure

```
arena.ai-cli/
├── arena/                       # Core Python package
│   ├── api.py                   # Arena API client, CDP proxy, SSE streaming
│   ├── auth.py                  # 6-browser detector, clipboard watcher, cookie parser
│   ├── config.py                # Config persistence (~/.arena-cli)
│   ├── console.py               # UTF-8 safe Rich console
│   ├── models.py                # Dynamic catalog, caching, org colors, modality filters
│   ├── menu.py                  # Arrow-key interactive main menu
│   ├── cli.py                   # CLI commands & agentic tool loops
│   ├── tools/                   # Developer tools, multi-browser MCP
│   └── ui/                      # Banner, chat prompt, streaming markdown
├── assets/                      # Logo and icons
│   ├── logo.svg                 # Vector logo
│   ├── logo.png                 # Raster logo (256px)
│   └── arena-cli.ico            # Windows icon for .exe
├── tests/                       # Automated unit tests
├── requirements.txt             # Python dependencies
├── arena-cli.py                 # Entrypoint
├── arena-cli.spec               # PyInstaller build spec
├── start.bat                    # Interactive menu launcher
└── arena.bat                    # Direct CLI command runner
```

---

## License

MIT

---

*Built for pen testing research and AI exploration.*
