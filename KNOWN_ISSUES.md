# Known issues

Things that are broken or unfinished in Arena Desktop. Fixes and pull requests are welcome.

## Code mode (arena.ai's sandbox)

- **Your local files are not in arena's sandbox.** The model builds in arena.ai's own sandbox, so it only sees files it made there. Arena Desktop copies what it creates and edits into your folder, and sends back the files *it* wrote that you changed. Files it never wrote (for example an old `kimi-k3.txt`) are not sent, so asking it to edit one makes it create a new file instead.
- **No file tree, editor or "Building..." view yet.** arena.ai shows a file tree, a code editor and a live preview while it builds. The app only shows the activity rows ("Created src/App.tsx") and the preview link.
- **Commands and media stay in the sandbox.** In Arena Agent mode (arena.ai's own agent), `bash` steps (like `npm install`) and `fetch_media` images run only in arena's sandbox (`/home/user`), not on your computer. To run commands on your computer, use Agent mode with a local folder (Arena Desktop's own tools); its `run_cmd` runs in your folder.
- **Background commands are per app session.** Dev servers started with `<background>true</background>` stop when the app closes. Their logs stay in `.arena-artifacts/bg<N>.log`. The ids restart at `bg1` after a restart.
- **Shell commands are Windows `cmd.exe` syntax on Windows.** Bash-only syntax (`$(...)`, `export X=1`) fails there; the agent guide tells the model which shell it has.
- **Preview link:** the `<id>.arena.site` link is picked up when arena.ai sends it in the stream; when arena finishes building after the stream ends, the link may not appear yet.
- **Battle in Code mode** writes each model's files to `option-a` and `option-b`. Not tested live yet.

## Chats

- Switching models inside a chat now keeps the same arena.ai conversation, like arena's own follow-up box. Not tested live yet; if arena.ai refuses it, the app starts a new conversation.
- Some models (seen with glm-5.3-flash and in Battle) use arena.ai's built-in tools instead of the app's file tools. Their file writes are copied from the stream into your folder; reads of your local files still need the app's tools.

## Workspace

- **Tree does not auto-refresh.** Changing files outside the app (e.g. in VS Code) does not update the workspace panel until you manually navigate or refresh.
- **Workspace preview runs scripts in a sandbox.** As of v1.3.0, `allow-scripts` is re-enabled with an opaque origin. Scripts run but cannot access the app's cookies or API token.

## Security (v1.5.0)

- **Connector OAuth widget loads from a CDN without SRI (analyzed 2026-11-10).** The Arena-connector link flow injects `https://ah-cdn.merge.dev/initialize.js` (Merge Link, arena.ai's own connector vendor — the link token comes from arena.ai's API) into the arena.ai engine window. Subresource integrity cannot realistically secure it: the URL is unversioned and rotates on Merge's schedule (`cache-control: max-age=120`), and the loader then fetches the rest of the widget from the same vendor, so pinning a hash would only break "Connect GitHub/Notion" on every vendor deploy without containing a compromised vendor. Mitigations in place: the widget loads only on an explicit user action, with `crossorigin="anonymous"` (no credentials to the CDN), and the trust decision mirrors arena.ai's own web connector flow. Durable fix (needs live verification of Merge token origin policy): run the widget outside the arena.ai origin, or pin a hash if Merge publishes a versioned loader URL.
- **Release binary is unsigned.** No code signature, no SBOM, no CI pipeline yet. SmartScreen will warn.
- **Dependencies are unpinned.** `requirements.txt` uses lower bounds only. `pip-compile --generate-hashes` planned.
- **Cookie plaintext fallback.** If DPAPI fails, cookies are stored unencrypted. Low risk on single-user Windows desktops.
- **No rate limiting on localhost API.** Mitigated by per-launch random token and localhost binding.
- **SSRF: media-save is TOCTOU-safe; three download paths still re-resolve.** `/api/media/save` now validates every resolved address and connects to the exact IP it validated (`_pinned_https_get`), so DNS rebinding cannot win there. The three model-output download paths (Arena Agent file sync, generated-media save, sandbox mirror downloads) are validated against the private/loopback/link-local/CGNAT/multicast blocklist but still fetch via `requests.get`, which re-resolves DNS at connect time. Routing them through the pinned transport (while keeping their test seams) is the remaining work.

## Testing

- The full pytest suite is green as of 2026-11-10 (364 passed, 22 environment-dependent skips on machines without browsers, 0 failures). Run it with `PYTHONPATH=. python -m pytest tests/ -q`.
- The live test scripts close `arena-ai.exe` and change the shared folder setting while they run. Close the app before running them.

## Logs

- `%USERPROFILE%\.arena-personal\desktop.log`: every send, its HTTP status, human checks and each sandbox step.
- Start the app with `ARENA_STREAM_DUMP=1` to save every raw stream line to `%USERPROFILE%\.arena-personal\streams\`.

## Arena Agent → local folder (v1.5.0)

- Only file-tool writes and `cat > file << 'EOF'` heredocs are copied. Files made by other commands in Arena's cloud (`npm create`, `git clone`, `unzip`, generated builds) are not. Use the Local Agent for those, or ask the agent to write the files with its file tool.
- Old Arena Agent chats saved before v1.5.0 have no tool input/output, so their rows show only the tool name.
