# Known issues

Things that are broken or unfinished in Arena Desktop. Fixes and pull requests are welcome.

## Code mode (arena.ai's sandbox)

- **Your local files are not in arena's sandbox.** The model builds in arena.ai's own sandbox, so it only sees files it made there. Arena Desktop copies what it creates and edits into your folder, and sends back the files *it* wrote that you changed. Files it never wrote (for example an old `kimi-k3.txt`) are not sent, so asking it to edit one makes it create a new file instead.
- **No file tree, editor or "Building..." view yet.** arena.ai shows a file tree, a code editor and a live preview while it builds. The app only shows the activity rows ("Created src/App.tsx") and the preview link.
- **Commands and media stay in the sandbox.** `bash` steps (like `npm install`) and `fetch_media` images run only in arena's sandbox. Run `npm install` in your folder yourself.
- **Preview link:** the `<id>.arena.site` link is picked up when arena.ai sends it in the stream; when arena finishes building after the stream ends, the link may not appear yet.
- **Battle in Code mode** writes each model's files to `option-a` and `option-b`. Not tested live yet.

## Chats

- Switching models inside a chat now keeps the same arena.ai conversation, like arena's own follow-up box. Not tested live yet; if arena.ai refuses it, the app starts a new conversation.
- Some models (seen with glm-5.3-flash and in Battle) use arena.ai's built-in tools instead of the app's file tools. Their file writes are copied from the stream into your folder; reads of your local files still need the app's tools.

## Testing

- The live test scripts close `arena-ai.exe` and change the shared folder setting while they run. Close the app before running them.

## Logs

- `%USERPROFILE%\.arena-cli\desktop.log`: every send, its HTTP status, human checks and each sandbox step.
- Start the app with `ARENA_STREAM_DUMP=1` to save every raw stream line to `%USERPROFILE%\.arena-cli\streams\`.
