# Arena.ai CLI — Handoff & Continuation Guide

**Date:** 2026-10-31
**Status:** CLI is functional but the user wants to convert it into a full web-based IDE
**Working directory:** `C:\Users\Moses\Desktop\Dev Code\Pen testing\AI-CHATBOTS\arena.ai`
**GitHub copy:** `C:\Users\Moses\Documents\GitHub\arena.ai-cli` (stale — needs re-copy after changes)
**Usage cap:** 70% weekly, be efficient. No subagents/forks.

---

## What This Project Is

An **unofficial desktop client for [arena.ai](https://arena.ai)** — a free AI platform offering 400+ models (GPT-5, Claude, Gemini, Grok, DeepSeek, etc.) in Battle, Direct, Side-by-Side, and Agent modes. Currently built as a **Python CLI** using Rich + prompt_toolkit. The user wants it **converted into a web-based IDE** that replicates Arena.ai's actual frontend UI.

---

## Current Architecture

```
arena.ai/
├── arena-cli.py              # Entry point (UTF-8 setup, imports arena.cli.main)
├── arena-cli.spec             # PyInstaller spec (icon: assets/arena-cli.ico)
├── arena.bat / start.bat      # Windows launchers
├── requirements.txt           # rich, requests, prompt_toolkit, websocket-client, pyperclip
├── assets/
│   ├── logo.svg               # SVG logo (pillars motif, has leftover amber gradient)
│   ├── logo.png               # 256px raster logo
│   └── arena-cli.ico          # Multi-size ICO for .exe
├── dist/
│   └── arena-cli.exe          # PyInstaller single-file build
├── arena/
│   ├── __init__.py
│   ├── config.py              # Paths (~/.arena-cli/), settings, cookie storage
│   ├── console.py             # Rich Console singleton
│   ├── auth.py                # Browser detection, cookie parsing, CDP launch
│   ├── api.py                 # ArenaClient, CDP chat, reCAPTCHA, SSE stream parser
│   ├── models.py              # Model catalog fetch/cache, org colors, modality routing
│   ├── menu.py                # Arrow-key main menu (prompt_toolkit)
│   ├── cli.py                 # All commands: login, chat, models, settings, mode
│   ├── tools/
│   │   ├── __init__.py        # ToolRegistry, XML tool parser, system prompt
│   │   ├── base.py            # BaseTool abstract class
│   │   ├── file_tools.py      # read_file, write_file, edit_file, search, ls
│   │   ├── shell_tools.py     # run_cmd
│   │   ├── browser_mcp.py     # browser_detect, browser_open_url, browser_list_tabs, browser_exec_js
│   │   └── mcp.py             # MCP stdio client (brave-search integration)
│   └── ui/
│       ├── __init__.py        # Re-exports all UI functions
│       ├── theme.py           # Arena brand colors, mascot frames, spinners
│       ├── banner.py          # Startup banner (pillars + model info)
│       ├── chat_box.py        # prompt_toolkit input with autocomplete
│       └── markdown.py        # Markdown rendering, tool call display
```

---

## Arena.ai Brand Colors (use these everywhere)

```
Dark background:  #242422
Surface/card:     #2C2B28
Primary text:     #F4F0EB (warm cream)
Secondary text:   #C7C2BC
Muted text:       #6B6560
Blue accent:      #299BFF (primary action color)
Success green:    #10B981
Error red:        #EF4444
Warning yellow:   #F59E0B
```

**IMPORTANT:** There are still 2 leftover amber `#D97706` references in `arena/models.py` lines 260 and 262 (`display_available_models` function). Change to `#299BFF`. Also `assets/logo.svg` line 5 has an amber gradient stop — change to `#299BFF`.

---

## How Arena.ai's API Works

### Authentication
- User logs into arena.ai in their browser
- Auth cookies: `arena-auth-prod-v1.0` and `arena-auth-prod-v1.1` (chunked base64 Supabase session)
- Contains `access_token` (JWT Bearer), user email, user ID
- Cookies stored at `~/.arena-cli/cookies.txt`

### CDP (Chrome DevTools Protocol)
- Browser launched with `--remote-debugging-port=9222`
- Uses persistent profile at `~/.arena-cli/cdp_profile/`
- CDP handles: reCAPTCHA Enterprise token generation, cookie extraction (including httpOnly), chat requests through the browser
- **This is the reliable path** — direct HTTP often fails because reCAPTCHA rejects non-browser requests

### Chat API Endpoints
- **New conversation:** `POST https://arena.ai/nextjs-api/stream/create-evaluation`
- **Follow-up:** `POST https://arena.ai/nextjs-api/stream/post-to-evaluation/{eval_id}`
- **Model catalog:** `GET https://arena.ai/nextjs-api/model-catalog`

### Request Body Structure
```json
{
  "id": "<uuidv7 eval_id>",
  "mode": "battle",
  "modelAId": "<model_id>",          // DO NOT SEND for battle mode!
  "userMessageId": "<uuidv7>",
  "modelAMessageId": "<uuidv7>",
  "modelBMessageId": "<uuidv7>",     // Always required
  "userMessage": {
    "content": "<message text>",
    "experimental_attachments": [],
    "metadata": {}
  },
  "modality": "chat",                // "chat" | "webdev" | "search" | "image"
  "recaptchaV3Token": "<token>"
}
```

### SSE Stream Format (Vercel AI SDK)
```
a0:"text chunk"        — Model A text (this is the response to show)
b0:"text chunk"        — Model B text (skip this in battle mode)
ag:"reasoning"         — Chain-of-thought (optional display)
ah:{source object}     — Search citations
a2:[data array]        — Metadata (preview URLs, session IDs)
ad:{"finishReason":..} — End of response
```

### Arena.ai Modes (from the website UI)
1. **Battle** — Two anonymous models compete, user votes. `mode: "battle"`. DO NOT send `modelAId`.
2. **Direct** — Chat with 1 specific model. `mode: "direct"`. Send `modelAId`.
3. **Side by Side** — Compare 2 chosen models. `mode: "side-by-side"`. Send both model IDs.
4. **Agent** — Built for complex tasks. Details TBD (may use different endpoint).

### reCAPTCHA Enterprise
- Site key: `6LeTGMcsAAAAALuIlkVwIxaAuZA8VledA6d3Nnb0`
- Must execute from browser context on an arena.ai page
- `grecaptcha.enterprise.execute(SITE_KEY, {action: 'chat_submit'})`
- `_cdp_ensure_arena_page()` navigates the CDP tab to arena.ai if needed, waits 3s
- Polling loop waits up to 8s for grecaptcha to load

---

## Known Bugs To Fix

### 1. Battle Mode Model Error (CRITICAL)
**Symptom:** `HTTP 400: {"error":"Cannot pass model for battle mode"}`
**Cause:** `modelAId` is sent in the request body even when `mode` is `"battle"`. Battle mode picks models randomly server-side.
**Files:**
- `arena/api.py` line 248: `modelAId: '{model_id}'` in CDP JS — must be omitted when mode is battle
- `arena/api.py` line 464: `"modelAId": model_id` in `send_chat()` — same fix
- `arena/api.py` line 396: `self.active_mode = "battle"` is the hardcoded default — user should be able to set Direct/Side-by-Side
**Fix:** Conditionally include `modelAId` only when `self.active_mode != "battle"`. Add mode switching support (battle/direct/side-by-side).

### 2. Leftover Amber Colors
**Files:**
- `arena/models.py` lines 260, 262: `#D97706` in `display_available_models()` — change to `#299BFF`
- `assets/logo.svg` line 5: amber gradient stop — change to `#299BFF`

### 3. Login Cookie Flow Is Confusing
**Current UX:** "Press F12 → Application tab → Cookies → Ctrl+A → Ctrl+C" — too many steps, unclear.
**User wants:**
1. Open arena.ai in browser
2. Tell user: "Press F12 → Console tab"
3. Tell user to type: `copy(document.cookie)` and press Enter
4. Tell user: "Cookie copied! Come back here and press Ctrl+V"
5. Auto-detect the pasted cookie
6. Print "Successfully authenticated as user@email.com"

**Even better:** With CDP browser already launched, auto-extract cookies via `Network.getAllCookies` (the function `fetch_cookies_via_cdp()` already exists) — make login fully automatic when CDP is connected.

### 4. App Freezes When Selecting Gemini Model
**Symptom:** User selected Gemini, app hangs.
**Likely cause:** The CDP `send_chat_via_cdp()` has a 60s timeout. If the response stream never completes (e.g., model returns empty or arena.ai drops connection), the app blocks on `ws.recv()` indefinitely.
**Fix:** Add proper timeout handling and a loading indicator (spinner) during streaming.

### 5. /help Doesn't Show All Commands
**Missing from /help:** `/login`, `/router`, `/models` (shown but should match the actual available commands list)
**Fix:** Update the help panel in `cli.py` lines 543-558 to include all commands.

### 6. Tab Autocomplete Doesn't Use Tab Key
**Current:** prompt_toolkit WordCompleter shows suggestions but Tab doesn't complete them well.
**User wants:** Type `/sett` → press Tab → completes to `/settings`. Standard shell-style tab completion.

---

## THE BIG TASK: Convert CLI to Web-Based IDE

The user wants to **abandon the terminal CLI** and build a **web-based desktop application** that replicates Arena.ai's actual frontend. This is the primary remaining work.

### What Arena.ai's Web UI Looks Like (from screenshots)

1. **Dark theme** — Background `#1a1a18`, warm cream text, dark sidebar
2. **Left sidebar** — Chat history list, "New Chat", "Leaderboard", "Search" links
3. **Center area** — Large "What would you like to do?" heading, chat input box at bottom
4. **Chat input bar** — Has:
   - Text input field ("Ask anything..." or "Describe the website or app you want to build...")
   - "+" button for file attachments (up to 15MB per file)
   - Mode selector dropdown: Battle, Agent Mode, Side by Side, Direct
   - Model selector dropdown: Searchable list grouped by org, with icons
   - Send button (arrow)
5. **Chat messages** — Markdown rendered, code blocks with syntax highlighting
6. **Model picker** — Dropdown with search bar, filter tabs (text, code, image, search), org-colored model names with "bd" badges and copy icons
7. **Account menu** — Shows email, "Sign Out" button, "Keep me posted" checkbox
8. **Footer** — "Terms of Use", "Privacy Policy", "Cookies" links

### Recommended Approach

**Flask + vanilla HTML/CSS/JS** served locally, opened in the user's browser:

```
arena/
├── web/
│   ├── app.py               # Flask backend
│   │   - GET /              # Serve index.html
│   │   - GET /api/models    # Return model catalog JSON
│   │   - GET /api/settings  # Return settings JSON
│   │   - POST /api/settings # Update settings
│   │   - POST /api/login    # Accept cookie paste, validate, save
│   │   - GET /api/status    # Return auth status, active model, mode
│   │   - POST /api/chat     # Accept message, return SSE stream
│   │   - POST /api/new      # Reset conversation (clear eval_id)
│   │   - GET /api/history   # Return conversation history
│   ├── static/
│   │   ├── index.html       # Main SPA page
│   │   ├── style.css        # Arena.ai dark theme
│   │   └── app.js           # Frontend logic (chat, SSE, model picker)
│   └── templates/           # (optional, if using Jinja2)
```

**Backend (`app.py`):**
- Reuse existing `ArenaClient`, `sync_models`, `fetch_cookies_via_cdp`, auth functions
- SSE endpoint using Flask's `Response(stream_with_context(generate()), mimetype='text/event-stream')`
- Wrap existing `parse_stream()` to yield SSE events to the frontend
- Tool execution stays server-side (file_tools, shell_tools)

**Frontend (`index.html` + `app.js`):**
- Replicate Arena.ai's exact layout: sidebar, chat area, input bar
- Mode selector (Battle, Direct, Side by Side, Agent) as dropdown
- Model picker with search, org-color coding, filter tabs
- SSE `EventSource` for streaming responses
- Markdown rendering via marked.js + highlight.js
- File upload area (attachments)
- Settings modal
- Login modal (paste cookie, or "Auto-detect from browser" button)
- Footer: Terms of Use, Privacy Policy, Cookies (link to arena.ai's pages)
- Chat history in sidebar

**Entry point changes:**
- `arena-cli.py` should detect `--web` flag or default to web mode
- Launch Flask on `localhost:5000` (or a random free port)
- Auto-open browser to `http://localhost:5000`
- Keep CLI mode available with `--cli` flag for backwards compatibility

**New dependency:** Add `flask` to `requirements.txt`

### Key Implementation Details

1. **SSE Streaming:** The backend receives the Arena.ai SSE stream and re-broadcasts it to the frontend. The CDP path (`send_chat_via_cdp`) returns the full response at once (not streaming) — for real-time streaming in web mode, use the direct HTTP path (`send_chat()` + `parse_stream()`) which does stream. The CDP path is the fallback for when reCAPTCHA blocks direct HTTP.

2. **Mode Handling:** The current code hardcodes `self.active_mode = "battle"`. The web UI needs a mode selector that sets `client.active_mode` to `"battle"`, `"direct"`, or `"side-by-side"`. In Direct mode, `modelAId` is sent. In Battle mode, it is NOT sent. In Side by Side mode, both `modelAId` and `modelBId` are sent with user-chosen models.

3. **Model Picker:** The `/api/models` endpoint returns the full catalog (already cached by `sync_models()`). Frontend filters by modality tab (text, code, image, search). Each model has `id`, `name`, `org`, `rank`, `arena`, `capabilities`. Org colors come from `ORG_COLOR_MAP` in `models.py`.

4. **Cookie Auto-Detection:** When CDP browser is running, call `fetch_cookies_via_cdp()` to get cookies automatically. The web UI should have a "Detect from browser" button that hits `/api/login?auto=true`.

5. **Conversation History:** Currently stored in-memory as a list of `{"role": "User"/"Assistant", "text": "..."}` dicts. The web UI should display these as chat bubbles. The `eval_id` on `ArenaClient` tracks the conversation thread with Arena.ai.

6. **Tool Execution Display:** When the model outputs XML tool calls (`<tool name="read_file">...`), the backend parses them, executes them, and sends the results back. The web UI should show tool calls as expandable cards (like Claude Code does).

---

## Files That Need Changes vs. Files to Reuse As-Is

### Reuse as-is (backend logic):
- `arena/config.py` — all config/settings/cookie management
- `arena/auth.py` — browser detection, cookie parsing, CDP launch
- `arena/api.py` — ArenaClient, CDP functions, stream parser (after fixing battle mode bug)
- `arena/models.py` — model catalog, colors (after fixing amber colors)
- `arena/tools/` — entire tools package (file_tools, shell_tools, browser_mcp, mcp)
- `arena/console.py` — Rich console (still used for backend logging)

### Modify:
- `arena/api.py` — Fix battle mode `modelAId` bug (lines 248, 464)
- `arena/models.py` — Fix amber colors (lines 260, 262)
- `arena-cli.py` — Add `--web` flag, launch Flask server
- `requirements.txt` — Add `flask`

### New files to create:
- `arena/web/app.py` — Flask application
- `arena/web/static/index.html` — Main page
- `arena/web/static/style.css` — Arena.ai dark theme
- `arena/web/static/app.js` — Frontend JavaScript
- `arena/web/__init__.py`

### Keep but secondary (CLI mode):
- `arena/cli.py` — Keep for `--cli` backwards compatibility
- `arena/menu.py` — CLI-only
- `arena/ui/` — CLI-only (banner, chat_box, theme, markdown)

---

## PyInstaller Build

After changes, rebuild:
```bash
pip install pyinstaller
pyinstaller arena-cli.spec
```

The spec file points to `icon='assets/arena-cli.ico'` and bundles everything as a single `.exe`.

For web mode, the static files need to be included in the PyInstaller bundle. Add to spec:
```python
datas=[('arena/web/static', 'arena/web/static')]
```

---

## After All Changes

Copy everything to the GitHub directory:
```powershell
$src = "C:\Users\Moses\Desktop\Dev Code\Pen testing\AI-CHATBOTS\arena.ai"
$dst = "C:\Users\Moses\Documents\GitHub\arena.ai-cli"
# Remove old arena/ and assets/, copy fresh, remove __pycache__
```

The user will do `git push` themselves.

---

## Summary of Priority Order

1. **Fix battle mode bug** in `api.py` (conditional `modelAId`)
2. **Fix leftover amber** in `models.py` and `logo.svg`
3. **Build Flask web backend** (`arena/web/app.py`)
4. **Build frontend HTML/CSS/JS** replicating Arena.ai UI
5. **Wire SSE streaming** from backend to frontend
6. **Add mode selector** (Battle/Direct/Side by Side/Agent)
7. **Add model picker** with search and org colors
8. **Better login flow** (auto-detect + clear manual instructions)
9. **Add footer links** (Terms of Use, Privacy Policy, Cookies → arena.ai URLs)
10. **Update entry point** to default to web mode
11. **Rebuild .exe** with web static files bundled
12. **Copy to GitHub repo** directory
