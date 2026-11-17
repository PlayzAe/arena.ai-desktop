  const demoApi = {
    async getSettings() { await sleep(40); return { ...demoStore.settings }; },
    async saveSettings(body) { Object.assign(demoStore.settings, body || {}); await sleep(40); return { ok: true }; },
    async getStatus() {
      await sleep(180);
      const current = demoStore.accounts.find((a) => a.id === demoStore.currentAccountId) || null;
      return {
        authenticated: demoStore.authenticated,
        email: demoStore.authenticated && current ? current.email : demoStore.email,
        full_name: demoStore.authenticated && current ? current.name : null,
        avatar_url: null,
        loading: false,
        engine_loading: false,
        generating: demoStore.streams.size > 0,
        generating_chat_ids: [...demoStore.streams].map((stream) => stream.chatId).filter(Boolean),
        accounts: demoStore.accounts.map((a) => ({ ...a, current: a.id === demoStore.currentAccountId && demoStore.authenticated })),
        current_account_id: demoStore.authenticated ? demoStore.currentAccountId : null,
        offline: demoStore.offline,
        session_error: demoStore.sessionError,
        mode: demoStore.mode,
        modality: demoStore.modality,
        desktop: true,
        engine: demoStore.engineOpen,
        permission_mode: demoStore.permissionMode,
        workspace: demoStore.workspace,
        workspace_chosen: true,
        app_version: '5.6.1',
        pending_permissions: demoStore.pendingPermissions.length,
        demo: true
      };
    },
    async login() { demoStore.pendingAdd = false; demoStore.loginAt = Date.now(); await sleep(220); return { ok: true, pending: true }; },
    async addAccount() { demoStore.pendingAdd = true; demoStore.loginAt = Date.now(); await sleep(220); return { ok: true, pending: true }; },
    async getAccounts() {
      await sleep(60);
      return { accounts: demoStore.accounts.map((a) => ({ ...a, current: a.id === demoStore.currentAccountId && demoStore.authenticated })), current_id: demoStore.authenticated ? demoStore.currentAccountId : null };
    },
    async switchAccount(id) {
      await sleep(160);
      const account = demoStore.accounts.find((a) => a.id === id);
      if (!account) throw new ApiError('That account is not saved in this app.', 404, { accounts: demoStore.accounts });
      if (account.expired) throw new ApiError('arena.ai rejected this session. Sign in to it again.', 401, { expired: true, accounts: demoStore.accounts.map((a) => ({ ...a, current: a.id === demoStore.currentAccountId })) });
      demoStore.currentAccountId = account.id;
      demoStore.authenticated = true;
      demoStore.email = account.email;
      return { ok: true, accounts: demoStore.accounts.map((a) => ({ ...a, current: a.id === account.id })) };
    },
    async removeAccount(id) {
      await sleep(80);
      demoStore.accounts = demoStore.accounts.filter((a) => a.id !== id);
      return { ok: true, accounts: demoStore.accounts.map((a) => ({ ...a, current: a.id === demoStore.currentAccountId && demoStore.authenticated })) };
    },
    async loginPoll() {
      await sleep(260);
      if (!demoStore.loginAt) return { done: false };
      if (Date.now() - demoStore.loginAt < 1700) return { done: false, pending: true };
      if (demoStore.pendingAdd) {
        demoStore.pendingAdd = false;
        let added = demoStore.accounts.find((a) => a.id === 'demo-acc-added');
        if (!added) {
          added = { id: 'demo-acc-added', email: 'added@local.invalid', name: 'Added User', avatar_url: null, expired: false };
          demoStore.accounts.push(added);
        }
        added.expired = false;
        demoStore.currentAccountId = added.id;
        demoStore.email = added.email;
      } else if (!demoStore.currentAccountId || !demoStore.accounts.some((a) => a.id === demoStore.currentAccountId)) {
        demoStore.currentAccountId = 'demo-acc-1';
        if (!demoStore.accounts.some((a) => a.id === 'demo-acc-1')) {
          demoStore.accounts.unshift({ id: 'demo-acc-1', email: 'demo@local.invalid', name: 'Demo User', avatar_url: null, expired: false });
        }
        demoStore.email = 'demo@local.invalid';
      }
      demoStore.authenticated = true;
      return { done: true, ok: true, authenticated: true };
    },
    async engineShow() { demoStore.engineOpen = true; await sleep(160); return { ok: true, engine: true, demo: true }; },
    async engineHide() { demoStore.engineOpen = false; await sleep(120); return { ok: true, engine: false, demo: true }; },
    async logout() {
      demoStore.accounts = demoStore.accounts.filter((a) => a.id !== demoStore.currentAccountId);
      demoStore.currentAccountId = null;
      demoStore.authenticated = false;
      demoStore.email = '';
      await sleep(180);
      return { ok: true };
    },
    async getModels(modality, mode) {
      await sleep(150);
      demoValidateSelection(mode || demoStore.mode, modality || demoStore.modality);
      if ((mode || demoStore.mode) === 'battle' || (modality || demoStore.modality) === 'video') return [];
      if ((mode || demoStore.mode) === 'agent') return [];
      const list = demoDefaultModels(modality).slice();
      return ((mode || demoStore.mode) === 'direct' && (modality || demoStore.modality) === 'text')
        ? [demoRouter, ...list] : list;
    },
    async setMode(mode) {
      const pair = normalizeSelection(mode, demoStore.modality);
      demoStore.mode = pair.mode;
      demoStore.modality = pair.modality;
      await sleep(180);
      return { ok: true, mode: pair.mode, modality: pair.modality };
    },
    async setModality(modality) {
      const next = demoStore.mode === 'agent' ? 'text' : modality;
      demoValidateSelection(demoStore.mode, next);
      demoStore.modality = next;
      await sleep(160);
      return { ok: true, modality: next };
    },
    async newChat() {
      demoStore.serial += 1;
      const id = `demo-chat-${Date.now()}-${demoStore.serial}`;
      demoStore.activeChatId = id;
      demoStore.messages[id] = [];
      demoStore.chats.unshift({ id, title: "New chat", updated_at: new Date().toISOString(), mode: demoStore.mode, modality: demoStore.modality, account: demoStore.currentAccountId || 'demo-acc-1' });
      await sleep(130);
      return { ok: true, chat_id: id };
    },
    async getChats() {
      await sleep(100);
      const current = demoStore.currentAccountId || 'demo-acc-1';
      return demoStore.chats.filter((chat) => (chat.account || 'demo-acc-1') === current).map((chat) => ({ ...chat }));
    },
    async getArenaChats() {
      await sleep(120);
      if (!demoStore.authenticated) throw new ApiError("Logged out of the profile in the demo.", 401);
      return {
        ok: true,
        entries: demoStore.cloudChats.map((entry) => {
          const local = demoStore.chats.find((chat) => chat.id === entry.eval_id || chat.eval_id === entry.eval_id);
          return { ...entry, local_chat_id: local?.id || null, local_mode: local?.mode || null };
        })
      };
    },
    async openArenaChat(id, type) {
      await sleep(160);
      const existing = demoStore.chats.find((chat) => chat.id === id || chat.eval_id === id);
      if (existing) return { ok: true, chat_id: existing.id, imported: false, demo: true };
      const entry = demoStore.cloudChats.find((item) => item.eval_id === id || item.id === id);
      if (!entry) throw new ApiError("Demo chat arena.ai not found.", 404);
      const chat = {
        id: entry.eval_id, eval_id: entry.eval_id, title: entry.title, updated_at: entry.updated_at,
        created_at: entry.created_at, mode: entry.mode, modality: entry.modality, source: 'arena',
        agent_backend: type === 'agentic' ? 'arena' : null
      };
      demoStore.chats.unshift(chat);
      demoStore.messages[chat.id] = demoClone(demoStore.cloudMessages[entry.eval_id] || []);
      return { ok: true, chat_id: chat.id, imported: true, demo: true };
    },
    async uploadAttachment(file, kind) {
      await sleep(260);
      const mediaType = file?.type || 'application/octet-stream';
      if (kind === 'agent') {
        return { ok: true, kind: 'agent', filename: file?.name || 'file', mediaType, url: 'demo://agent-file', size: file?.size || 0, demo: true };
      }
      return { ok: true, kind: 'evaluation', name: file?.name || 'file', contentType: mediaType, url: 'demo://file', size: file?.size || 0, demo: true };
    },
    async downloadWorkspaceFile(path) {
      await sleep(60);
      return new Blob([`Demo content of ${path}`], { type: 'text/plain' });
    },
    async vote(chatId, body) {
      await sleep(240);
      const messages = demoStore.messages[chatId] || [];
      // Pairs appear either as one dual record (text_b) or as consecutive
      // lane records 'a' + 'b' written by the demo stream.
      const pairs = [];
      for (let i = 0; i < messages.length; i += 1) {
        const item = messages[i];
        if (!item || item.role !== 'assistant') continue;
        if ('text_b' in item) pairs.push(item);
        else if (item.lane === 'a') {
          const next = messages[i + 1];
          if (next && next.role === 'assistant' && next.lane === 'b') pairs.push(item);
        }
      }
      const pairIndex = Number.isInteger(body?.pair_index) && body.pair_index >= 0 && body.pair_index < pairs.length
        ? body.pair_index : pairs.length - 1;
      const msg = pairs[pairIndex];
      if (!msg) throw new ApiError("There is no paired answer for voting in the demo chat.", 422);
      if (msg.vote) throw new ApiError("This answer has already been voted on.", 409);
      msg.vote = body?.value || 'tie';
      msg.names = { a: "Demo model A", b: "Demo model B" };
      return { ok: true, vote: msg.vote, names: msg.names, model_a: 'demo-a', model_b: 'demo-b', demo: true };
    },
    async getChat(id) {
      demoStore.activeChatId = id;
      const chat = demoStore.chats.find((item) => item.id === id);
      await sleep(110);
      if (!chat) throw new ApiError("Demo chat not found.", 404);
      if (chat.mode) demoStore.mode = chat.mode;
      if (chat.modality) demoStore.modality = chat.modality;
      const histChars = (demoStore.messages[chat.id] || []).reduce((sum, m) => sum + String(m.text || '').length + String(m.text_b || '').length, 0);
      return { ...chat, history_chars: histChars };
    },
    async refreshChat(id) {
      await sleep(80);
      return { ok: true, chat_id: id, added: 0, total: (demoStore.messages[id] || []).length, demo: true };
    },
    async deleteChat(id) {
      const chat = demoStore.chats.find((item) => item.id === id);
      demoStore.chats = demoStore.chats.filter((item) => item.id !== id);
      if (chat?.eval_id) demoStore.cloudChats = demoStore.cloudChats.filter((item) => item.eval_id !== chat.eval_id);
      delete demoStore.messages[id];
      await sleep(120);
      return { ok: true, arena: chat?.eval_id || chat?.source === 'arena' ? 'archived' : 'none', demo: true };
    },
    async compactChat(id) {
      await sleep(150);
      const list = demoStore.messages[id] || (demoStore.messages[id] = []);
      const notice = "Context compacted \u2014 this conversation continues in a fresh Arena session with a summary of everything above.";
      list.push({ role: 'notice', compact: true, digest_chars: 1200, text: notice });
      return { ok: true, digest_chars: 1200, history_chars: 1200, memory_saved: Boolean(demoStore.workspace), notice, demo: true };
    },
    async getMemory() {
      await sleep(80);
      return { enabled: demoStore.memoryEnabled !== false, folder: demoStore.workspace || null,
               global: demoStore.memoryGlobal || '', workspace: demoStore.memoryWorkspace ?? '', demo: true };
    },
    async saveMemory(body = {}) {
      await sleep(80);
      if (typeof body.global === 'string') demoStore.memoryGlobal = body.global;
      if (typeof body.workspace === 'string') demoStore.memoryWorkspace = body.workspace;
      if ('enabled' in body) demoStore.memoryEnabled = Boolean(body.enabled);
      return { ok: true, enabled: demoStore.memoryEnabled !== false, demo: true };
    },
    async getPulse() { return { ok: false }; },
    async syncProject() { return { ok: false }; },
    async updateDownload() { return { ok: false, error: 'Updates are disabled in demo mode.', demo: true }; },
    async updateStatus() { return { state: 'idle', demo: true }; },
    async updateApply() { return { ok: false, demo: true }; },
    async whatsNew() { return {}; },
    async clearWhatsNew() { return { ok: true }; },
    async updateCheck() { await sleep(60); return { enabled: true, current: 'demo', latest: null, update: false, url: null, demo: true }; },
    async exportSettings() { await sleep(60); return { app: 'Arena Desktop', version: 1, config: {}, memory_global: demoStore.memoryGlobal || '', memory_workspace: demoStore.memoryWorkspace || '', mcp: null, demo: true }; },
    async importSettings(bundle = {}) { await sleep(60); if (typeof bundle.memory_global === 'string') demoStore.memoryGlobal = bundle.memory_global; return { ok: true, backup: 'demo', demo: true }; },
    async diagnostics() { await sleep(60); return { text: 'Arena Desktop (demo)\nDiagnostics are illustrative in demo mode.', demo: true }; },
    async getUsage() {
      await sleep(40);
      const today = new Date().toISOString().slice(0, 10);
      return { today, current_account: 'demo',
        days: { [today]: { demo: { email: 'demo@local.invalid', sends: 42, by_modality: { text: 38, media: 4 }, models: { 'gpt-x-mini': 20, 'opus-max': 12 }, rate_limits: 1 } } },
        events: [{ ts: Math.floor(Date.now() / 1000) - 3600, account: 'demo@local.invalid', modality: 'text', model: 'opus-max', wait: 7200, message: "You've reached your Arena daily usage limit." }], demo: true };
    },
    async getGateway() {
      await sleep(40);
      const s = demoStore.gatewaySession || null;
      return { enabled: Boolean(demoStore.settings?.gateway_enabled), auto: Boolean(demoStore.settings?.gateway_auto),
        chosen: null,
        available: [{ name: 'blender', enabled: true, transport: 'stdio' }, { name: 'roblox_studio', enabled: true, transport: 'stdio' }],
        workspace: { available: true, folder: 'C:\\Users\\Demo\\Project', exposed: demoStore.settings?.gateway_workspace !== false },
        session: s || { state: 'off', url: null, servers: [], calls: [], error: null }, demo: true };
    },
    async startGateway() {
      await sleep(300);
      if (!demoStore.componentsInstalled?.cloudflared) {
        const err = new Error('cloudflared is not installed');
        err.details = { code: 'cloudflared_missing' };
        throw err;
      }
      demoStore.gatewaySession = { state: 'on', url: 'https://demo-gateway.trycloudflare.com', pairing: 'demo-pairing-code',
        servers: ['blender', 'roblox_studio'], started_at: Date.now() / 1000, expires_at: Date.now() / 1000 + 8 * 3600,
        calls: [{ ts: Date.now() / 1000 - 30, server: 'blender', tool: 'get_scene_info', ok: true, ms: 142 }], error: null };
      return { ok: true, session: demoStore.gatewaySession, demo: true };
    },
    async stopGateway() { await sleep(120); demoStore.gatewaySession = null; return { ok: true, demo: true }; },
    async getComponents() {
      await sleep(40);
      const installed = demoStore.componentsInstalled || {};
      const jobs = {};
      if (demoStore.componentJob) jobs[demoStore.componentJob.id] = demoStore.componentJob;
      return { components: [
        { id: 'cloudflared', name: 'cloudflared (Cloudflare Tunnel)', purpose: 'Agent Gateway tunnel.', installed: Boolean(installed.cloudflared), version: installed.cloudflared ? '2026.10.7' : null, install_kind: 'download', size_mb: 53, source: 'github.com/cloudflare/cloudflared', note: 'Demo data.' },
        { id: 'node', name: 'Node.js', purpose: 'npx-based local MCP servers.', installed: true, version: 'v22.0.0', install_kind: 'winget', source: 'winget', note: '' },
        { id: 'python', name: 'Python', purpose: 'Python MCP servers.', installed: false, version: null, install_kind: 'link', source: 'python.org', note: '' },
        { id: 'webview2', name: 'Microsoft Edge WebView2 Runtime', purpose: 'App window rendering.', installed: true, version: '141.0.0.0', install_kind: 'bootstrapper', source: 'Microsoft', note: '' }
      ], jobs, demo: true };
    },
    installComponent(id) {
      demoStore.componentJob = { id, state: 'downloading', progress: 20, error: null };
      setTimeout(() => { if (demoStore.componentJob) demoStore.componentJob.progress = 65; }, 500);
      setTimeout(() => {
        demoStore.componentJob = { id, state: 'done', progress: 100, error: null };
        demoStore.componentsInstalled = { ...(demoStore.componentsInstalled || {}), [id]: true };
      }, 1100);
      return Promise.resolve({ ok: true, demo: true });
    },
    async getQuestions() { await sleep(40); return []; },
    async answerQuestion() { await sleep(40); return { ok: true, demo: true }; },
    async getMediaChoices() { await sleep(40); return demoClone(demoStore.mediaChoices || []); },
    async answerMediaChoice(id, body = {}) {
      await sleep(60);
      const item = (demoStore.mediaChoices || []).find((choice) => String(choice.id) === String(id));
      const selected = Number.isFinite(Number(body.selected_index)) ? Number(body.selected_index)
        : Number(item?.candidates?.[0]?.index || 0);
      if (item) {
        item.status = 'completed';
        item.selected_index = selected;
        item.selection_method = body.skip ? 'skip' : 'user';
      }
      demoStore.mediaChoices = (demoStore.mediaChoices || []).filter((choice) => String(choice.id) !== String(id));
      return { ok: true, selected_index: selected, selection_method: body.skip ? 'skip' : 'user', demo: true };
    },
    async searchChats() { await sleep(40); return []; },
    async forkChat() { await sleep(40); return { ok: true, chat_id: null, demo: true }; },
    async restoreCheckpoint() { await sleep(40); return { ok: true, restored: 0, removed: 0, demo: true }; },
    async workspaceSnapshot() { await sleep(40); return { ok: true, text: '[Attached workspace files]\n\n--- demo.txt ---\nDemo file content.\n\n[/Attached workspace files]', chars: 90, files: 1, demo: true }; },
    async getElo() { await sleep(40); return { enabled: true, models: {}, demo: true }; },
    async getAutomations() { await sleep(40); return { items: demoStore.automations || [] }; },
    async saveAutomation(body) { await sleep(40); const item = { id: body?.id || `demo-auto-${Date.now()}`, ...body }; demoStore.automations = [...(demoStore.automations || []).filter((x) => x.id !== item.id), item]; return { ok: true, item, demo: true }; },
    async deleteAutomation(id) { await sleep(40); demoStore.automations = (demoStore.automations || []).filter((x) => x.id !== id); return { ok: true, demo: true }; },
    async runAutomation() { await sleep(40); return { ok: true, demo: true }; },
    async archiveArenaChat(id) {
      demoStore.cloudChats = demoStore.cloudChats.filter((item) => item.eval_id !== id && item.id !== id);
      await sleep(120);
      return { ok: true, arena: 'archived', demo: true };
    },
    async getHistory() {
      await sleep(130);
      return (demoStore.messages[demoStore.activeChatId] || []).map((message) => ({ ...message }));
    },
    async getPermissions() { await sleep(80); return demoStore.pendingPermissions.map((item) => ({ ...item })); },
    async decidePermission(id, decision) {
      const permission = demoStore.pendingPermissions.find((item) => String(item.id) === String(id));
      demoStore.pendingPermissions = demoStore.pendingPermissions.filter((item) => String(item.id) !== String(id));
      if (permission?.resolve) permission.resolve(decision);
      await sleep(160);
      return { ok: true, decision, demo: true };
    },
    async getPermissionMode() { await sleep(90); return { mode: demoStore.permissionMode }; },
    async setPermissionMode(mode) { demoStore.permissionMode = mode; await sleep(150); return { ok: true, mode }; },
    async getWorkspace() { await sleep(80); return { path: demoStore.workspace, workspace: demoStore.workspace, panel_root: demoStore.workspace }; },
    async setWorkspace(path) { demoStore.workspace = path; await sleep(160); return { ok: true, path }; },
    async runLocal(path) {
      await sleep(400);
      return { ok: true, id: 'bg1', folder: path || demoStore.workspace, cmd: 'npm install && npm run dev',
        running: true, urls: [], log: 'added 312 packages in 9s' };
    },
    async runLocalState(id) {
      await sleep(120);
      return { ok: true, id, running: true, urls: ['http://localhost:3000'], log: '  - Local: http://localhost:3000' };
    },
    async stopRunLocal(id) { await sleep(120); return { ok: true, id, running: false, urls: [], log: '' }; },
    async clearWorkspace() { demoStore.workspace = 'C:\\Users\\Demo\\ArenaProjects\\workspace'; await sleep(120); return { ok: true, workspace: demoStore.workspace, cleared: true }; },
    async saveWorkspace(chatId, lane) {
      await sleep(220);
      return { ok: true, path: `${demoStore.workspace}\\demo-save-${lane || 'a'}`, demo: true };
    },
    async openWorkspace() { await sleep(120); return { ok: true, demo: true, note: "Cannot open demo folder." }; },
    async getWorkspaceTree(path = '.') {
      await sleep(90);
      const key = String(path || '.');
      if (!(key in demoWorkspaceTreeData)) throw new ApiError("Demo folder not found.", 404);
      return { root: demoStore.workspace, path: key, entries: demoClone(demoWorkspaceTreeData[key]), truncated: false, demo: true };
    },
    async getWorkspaceFile(path) {
      await sleep(90);
      const key = String(path || '');
      if (!(key in demoWorkspaceFileData)) throw new ApiError("Demo file not found or unavailable for preview.", 404);
      return { path: key, name: key.split('/').pop(), size: demoWorkspaceFileData[key].length, content: demoWorkspaceFileData[key], demo: true };
    },
    async saveWorkspaceFile(path, content) {
      await sleep(120);
      const key = String(path || '');
      demoWorkspaceFileData[key] = String(content ?? '');
      return { ok: true, path: key, name: key.split('/').pop(), size: demoWorkspaceFileData[key].length, demo: true };
    },
    async getWorkspaceStamp() {
      await sleep(40);
      return { ok: true, stamp: 'demo', path: '.', demo: true };
    },
    async getChatProject() {
      await sleep(60);
      return { root: demoStore.workspace, rel: '.', name: 'Demo', lane: 'a', mode: 'direct', modality: 'webdev', demo: true };
    },
    async getConnectors() { await sleep(110); return demoConnectorsPayload(); },
    async reloadConnectors() { await sleep(110); return demoConnectorsPayload(); },
    async openConnectorConfig() { await sleep(110); return { ok: true, path: 'C:\\Users\\Demo\\.arena-personal\\mcp.json', demo: true }; },
    async installConnectorPreset(presetId, values, connect = true) {
      await sleep(180);
      const preset = demoConnectorPresets().find((item) => item.id === presetId);
      if (!preset) throw new ApiError("Demo connector not found.", 404);
      if (demoStore.connectors.some((server) => server.name === presetId)) throw new ApiError(`Connector already exists: ${presetId}`, 400);
      let command = preset.command;
      if ((presetId === 'filesystem' || presetId === 'git') && values?.path) command = command.replace(demoStore.workspace, String(values.path));
      const server = {
        id: presetId, name: presetId, preset_id: presetId, source: 'official', transport: 'stdio',
        enabled: true, running: false, status: 'stopped', description: `${preset.description} (demo: the process does not start)`,
        command_display: command, tools: [], tools_count: 0, error: null
      };
      demoStore.connectors.push(server);
      const summary = connect ? demoConnectServer(server) : demoConnectorSummary(server);
      return { ...demoConnectorsPayload(), server: summary };
    },
    async addConnectorCli(body) {
      await sleep(180);
      const name = String(body?.name || '').trim();
      const command = String(body?.command || '').trim();
      if (!name || !command) throw new ApiError("Name and CLI command are required.", 400);
      if (demoStore.connectors.some((server) => server.name === name)) throw new ApiError(`Connector already exists: ${name}`, 400);
      const server = {
        id: name, name, preset_id: null, source: 'custom', transport: 'stdio', enabled: true,
        running: false, status: 'stopped', description: String(body.description || "Custom demo MCP. Command not executed."),
        command_display: command, tools: [], tools_count: 0, error: null
      };
      demoStore.connectors.push(server);
      const summary = body.connect === false ? demoConnectorSummary(server) : demoConnectServer(server);
      return { ...demoConnectorsPayload(), server: summary };
    },
    async connectConnector(name) {
      await sleep(180);
      const server = demoStore.connectors.find((item) => item.name === name);
      if (!server) throw new ApiError("Demo connector not found.", 404);
      if (!server.enabled) throw new ApiError("Connector is disabled in demo configuration.", 400);
      return { ...demoConnectorsPayload(), server: demoConnectServer(server) };
    },
    async disconnectConnector(name) {
      await sleep(100);
      const server = demoStore.connectors.find((item) => item.name === name);
      if (server) { server.running = false; server.status = 'stopped'; server.tools = []; }
      return demoConnectorsPayload();
    },
    async setConnectorEnabled(name, enabled) {
      await sleep(120);
      const server = demoStore.connectors.find((item) => item.name === name);
      if (!server) throw new ApiError("Demo connector not found.", 404);
      server.enabled = Boolean(enabled);
      if (!enabled) { server.running = false; server.status = 'disabled'; server.tools = []; }
      else if (server.status === 'disabled') server.status = 'stopped';
      return demoConnectorsPayload();
    },
    async deleteConnector(name) {
      await sleep(120);
      demoStore.connectors = demoStore.connectors.filter((server) => server.name !== name);
      return demoConnectorsPayload();
    },
    async getArenaConnectors() {
      await sleep(110);
      if (!demoStore.authenticated) throw new ApiError("Login not performed (demo).", 401);
      return { ok: true, demo: true, source: 'arena', connectors: demoClone(demoStore.arenaConnectors) };
    },
    async connectArenaConnector(slug) {
      await sleep(180);
      const item = demoStore.arenaConnectors.find((entry) => entry.slug === slug);
      if (!item) throw new ApiError("Demo connector Arena not found.", 404);
      demoStore.arenaConnectorPending[slug] = Date.now();
      return { ok: true, pending: true, slug, demo: true };
    },
    async pollArenaConnector(slug) {
      await sleep(120);
      const item = demoStore.arenaConnectors.find((entry) => entry.slug === slug);
      const started = demoStore.arenaConnectorPending[slug] || 0;
      if (item && started && Date.now() - started > 900) {
        item.auth_status = 'connected';
        item.connected = true;
        delete demoStore.arenaConnectorPending[slug];
        return { ok: true, done: true, connected: true, slug, demo: true, connectors: demoClone(demoStore.arenaConnectors) };
      }
      return { ok: true, done: false, connected: false, slug, demo: true };
    },
    async disconnectArenaConnector(slug) {
      await sleep(140);
      const item = demoStore.arenaConnectors.find((entry) => entry.slug === slug);
      if (item) { item.auth_status = 'disconnected'; item.connected = false; }
      return { ok: true, slug, demo: true, connectors: demoClone(demoStore.arenaConnectors) };
    },
    async openNativeAgent() { await sleep(160); return { ok: true, demo: true, url: 'https://arena.ai/agent' }; },
    async saveMedia() { await sleep(180); return { ok: true, path: `${demoStore.workspace}\\demo-media.png`, demo: true }; },
    async getDoctor() {
      await sleep(220);
      return {
        demo: true,
        backend: "browser simulation",
        python: "unavailable in demo",
        webview2: "checked by the application",
        desktop_bridge: "simulated only for demo",
        workspace: demoStore.workspace,
        official_client: false,
        note: "Demonstration data. Real diagnostics are only available through the local Flask backend."
      };
    },
    async stop(chatId) {
      for (const stream of demoStore.streams) {
        if (!chatId || String(stream.chatId) === String(chatId)) stream.stopped = true;
      }
      for (const permission of demoStore.pendingPermissions) {
        if (permission.resolve && (!chatId || String(permission.chat_id) === String(chatId))) permission.resolve('deny');
      }
      await sleep(100);
      return { ok: true, demo: true };
    },
    async streamChat(body, onEvent, signal) {
      demoStore.loading = true;
      const chatId = body.chat_id || demoStore.activeChatId;
      const controller = {
        stopped: false,
        signal,
        chatId,
        pendingResolvers: new Map()
      };
      demoStore.activeStream = controller;
      demoStore.streams.add(controller);
      const chat = demoStore.chats.find((item) => item.id === chatId);
      let modality = body.modality || demoStore.modality;
      const mode = body.mode || demoStore.mode;
      if (mode === 'battle' && modality === 'auto') modality = 'text'; // demo router resolves to Text
      demoStore.modality = modality;
      demoStore.mode = mode;
      demoValidateSelection(mode, modality);
      const allModels = demoDefaultModels(modality);
      const selectedA = mode === 'agent' ? demoAgentIdentity : (demoFindModel(body.model_id) || allModels[0]);
      const selectedB = demoFindModel(body.model_id_b) || allModels.find((model) => model.id !== selectedA?.id) || allModels[0];
      const laneModels = {
        a: mode === 'battle' ? allModels[0] : selectedA,
        b: mode === 'battle' ? allModels[1] || allModels[0] : selectedB
      };
      const emit = (event) => {
        if (signal?.aborted) return;
        try { onEvent(event); } catch (error) { console.error(error); }
      };
      const checkStop = () => controller.stopped || Boolean(signal?.aborted);
      const stoppedNotice = () => {
        emit({ type: 'notice', message: "Generation stopped. This is a demonstration event." });
        emit({ type: 'done', stopped: true, demo: true });
      };
      const typeOut = async (lane, text, model) => {
        let index = 0;
        while (index < text.length) {
          if (checkStop()) return false;
          const size = 5 + Math.floor(Math.random() * 18);
          emit({ type: 'text', model: lane, text: text.slice(index, index + size) });
          index += size;
          await sleep(14 + Math.floor(Math.random() * 18));
        }
        return true;
      };
      const requestPermission = (permission) => new Promise((resolve) => {
        const record = {
          ...permission,
          demo: true,
          resolve,
          status: 'pending',
          chat_id: chatId
        };
        demoStore.pendingPermissions.push(record);
        emit({ type: 'permission', ...permission, chat_id: chatId });
      });

      try {
        emit({
          type: 'meta',
          mode,
          modality,
          chat_id: chatId,
          models: {
            a: laneModels.a ? { ...laneModels.a } : null,
            b: (mode === 'battle' || mode === 'side-by-side') && laneModels.b ? { ...laneModels.b } : null
          }
        });
        emit({ type: 'reasoning', model: 'a', text: "Demo mode: response " });
        emit({ type: 'reasoning', model: 'a', text: "and events are generated locally. " });
        emit({ type: 'reasoning', model: 'a', text: "No real request to the models was sent." });
        await sleep(160);

        const prompt = body.message.toLowerCase();
        const twoLanes = mode === 'battle' || mode === 'side-by-side';
        const wantsLanding = /landing|website|page/.test(prompt);
        const wantsCode = modality === 'code' || /code|python|javascript|function/.test(prompt);

        const textA = wantsCode || modality === 'code'
          ? `### Demo mode: plan without execution

Below is a **conditional example**, not the result of a real model or sandbox.

1. First, identify the input data and expected behavior.
2. Isolate the problem with a small test.
3. Check edge cases and only then change the implementation.

\`\`\`python
def normalize_name(value: str) -> str:
    """Safe demonstration example."""
    return " ".join(value.strip().split()).casefold()
\`\`\`

The local folder is not fully transferred to the remote sandbox. Files and preview links appear only based on server events.`
          : wantsLanding
            ? `### Calm Page Framework

In the demo, I will show the direction, not the finished published result.

- **Hero:** a large photo and a short phrase.
- **Works:** an airy grid with different proportions.
- **Approach:** one accent color and lots of white space.
- **Mobile version:** single-column rhythm without losing air.

\`\`\`css
.hero {
  display: grid;
  gap: clamp(1.25rem, 4vw, 4rem);
  grid-template-columns: minmax(0, 1.2fr) minmax(220px, .8fr);
}

@media (max-width: 720px) {
  .hero { grid-template-columns: 1fr; }
}
\`\`\`

The next step is to agree on the structure, content, and images.`
            : `### Demonstration Response

Thank you, the request has been received. This is a **interface simulation**: text, models, and events are generated locally, without a request to arena.ai.

- Settings can be changed in the input field.
- A/B responses are displayed side by side in Battle and Side-by-side modes.
- Permissions and sandbox actions require explicit confirmation.

How can I assist further?`;

        const textB = mode === 'battle'
          ? `### Second Demonstration Variant

A more compact approach: start with a single scenario and test it in a narrow window.

1. One key screen.
2. Check at a width of 360 px.
3. Only after that — additional blocks.

This is **not an Arena model evaluation** and not the result of actual generation.`
          : wantsLanding
            ? `### Alternative Presentation

Editorial grid: large typography, photo captions, and one clear contact.

- Studio name instead of an advertising slogan.
- Series of shots with an asymmetric rhythm.
- Dark or paper palette.

All content is for demonstration.`
            : `### Second Direction

You can start with a more structured option: one script, short captions, and a clear next action. This is a simulated demo mode response.`;

        const okA = await typeOut('a', textA);
        if (!okA) { stoppedNotice(); return; }
        if (twoLanes) {
          const okB = await typeOut('b', textB);
          if (!okB) { stoppedNotice(); return; }
        }

        if (modality === 'search') {
          emit({ type: 'source', model: 'a', title: "Demo source: WebView2 overview", url: 'https://example.com/demo/webview2', snippet: "Simulated source card." });
          emit({ type: 'source', model: 'a', title: "Demo source: pywebview documentation", url: 'https://example.com/demo/pywebview', snippet: "The link is marked as a demonstration." });
          emit({ type: 'notice', message: "Sources and links in demo mode are simulated." });
        }

        if (modality === 'image') {
          emit({ type: 'media', model: 'a', kind: 'image', url: demoArtwork("Calm cover", 162, "demo image · without real generation"), title: "Demo cover · 16:10" });
          emit({ type: 'notice', message: "Media in demo mode is created locally, not by the arena.ai server." });
        }

        if (modality === 'video') {
          emit({ type: 'media', model: 'a', kind: 'video', poster: demoArtwork("Video · demo", 205, "no file was created"), title: "Demonstration video event · without file" });
          emit({ type: 'notice', message: "The video file was not created. Only a demonstration event is shown." });
        }

        if (mode === 'agent') {
          emit({ type: 'agent', stage: 'planning', message: "I am making a demonstration plan. Commands are not executed without permission." });
          emit({
            type: 'tool_call', id: 'demo-tool-1', name: 'read_file', model: 'a',
            title: "Read the project file",
            path: `${demoStore.workspace}\\app.py`,
            status: 'running'
          });
          await sleep(480);
          if (checkStop()) { stoppedNotice(); return; }
          emit({ type: 'tool_result', id: 'demo-tool-1', status: 'ok', output: "Demo: the contents of the file were not read or transmitted." });
          emit({ type: 'tool_call', id: 'demo-tool-2', tool: 'run_cmd', model: 'a', command: 'npm install && npm run build', status: 'running' });
          const demoLines = ['added 214 packages, and audited 215 packages in 3s', '', '> demo-site@1.0.0 build', '> vite build',
            'vite v5.4.0 building for production...', 'transforming (12) src/main.js', '✓ 34 modules transformed.',
            'dist/index.html                 0.46 kB', 'dist/assets/index-4f2a.css     2.10 kB', 'dist/assets/index-9c1b.js     48.31 kB',
            '✓ built in 612ms'];
          for (let i = 1; i <= demoLines.length; i += 3) {
            await sleep(260);
            if (checkStop()) { stoppedNotice(); return; }
            emit({ type: 'tool_progress', id: 'demo-tool-2', output: demoLines.slice(0, i).join('\n') });
          }
          emit({ type: 'tool_result', id: 'demo-tool-2', status: 'ok', output: `exit code 0\n${demoLines.join('\n')}` });
          emit({ type: 'tool_call', id: 'demo-tool-3', tool: 'edit_file', model: 'a', rel: 'src/main.js', status: 'running',
            diff: "--- src/main.js\n+++ src/main.js\n@@ -1,3 +1,3 @@\n-const title = 'Hello';\n+const title = 'Engineering portfolio';\n render(title);" });
          emit({ type: 'tool_result', id: 'demo-tool-3', status: 'ok', output: 'Edited src/main.js' });
          emit({ type: 'tool_call', id: 'demo-tool-4', tool: 'run_cmd', model: 'a', command: 'npm test', status: 'running' });
          emit({ type: 'tool_result', id: 'demo-tool-4', status: 'error', output: 'exit code 1\nFAIL src/main.test.js\n  expected "Hello" to be "Engineering portfolio"\n[Process exited with code 1]' });
          const permission = {
            id: `demo-permission-${Date.now()}`,
            kind: 'command',
            category: "Run commands",
            title: "Run tests in the sandbox?",
            description: "Demo request. The command will not be executed on your computer.",
            command: 'python -m pytest -q',
            cwd: demoStore.workspace,
            path: demoStore.workspace,
            diff: null,
            lane: 'a'
          };
          const decision = await requestPermission(permission);
          if (checkStop() && !decision) { stoppedNotice(); return; }
          emit({ type: 'permission_done', id: permission.id, decision });
          if (decision === 'allow' || decision === 'always') {
            emit({ type: 'tool_result', id: `demo-permission-${permission.id}`, status: 'ok', output: "Demo: check marked as allowed. The command was not executed." });
            emit({ type: 'text', model: 'a', text: "\n\nPermission granted in demo. **The real command was not executed.** Permission bypass is not used." });
          } else {
            emit({ type: 'text', model: 'a', text: "\n\nAction denied. **The command was not run**, the working folder was not changed." });
            emit({ type: 'notice', message: "Permission denied by the user in the demo scenario." });
          }
        }

        if (modality === 'code') {
          emit({ type: 'sandbox', id: 'demo-sandbox-1', status: 'ready', title: "Demo sandbox", note: "The local folder did not fully load." });
          emit({ type: 'files_written', model: 'a', lane: 'a', files: [
            { path: 'src/normalize.py', name: 'normalize.py', note: "simulated file" },
            { path: 'tests/test_normalize.py', name: 'test_normalize.py', note: "simulated file" }
          ] });
          emit({ type: 'preview', model: 'a', lane: 'a', title: "Demonstration preview", url: 'https://example.com/demo/preview' });
          emit({ type: 'sandbox_done', id: 'demo-sandbox-1', status: 'idle', message: "The demo sandbox completed the simulation." });
        }

        if (checkStop()) { stoppedNotice(); return; }
        emit({ type: 'done', demo: true });

        if (chat) {
          demoStore.messages[chatId] = demoStore.messages[chatId] || [];
          demoStore.messages[chatId].push({ role: 'user', content: body.message, attachments: Array.isArray(body.attachments) ? body.attachments : [], created_at: new Date().toISOString() });
          const laneA = { role: 'assistant', lane: 'a', model_id: laneModels.a?.id, model_name: laneModels.a?.name || "Model A", content: textA, created_at: new Date().toISOString() };
          demoStore.messages[chatId].push(laneA);
          if (twoLanes) demoStore.messages[chatId].push({ role: 'assistant', lane: 'b', model_id: laneModels.b?.id, model_name: laneModels.b?.name || "Model B", content: textB, created_at: new Date().toISOString() });
          if (chat.title === "New chat") chat.title = truncate(body.message, 48);
          chat.updated_at = new Date().toISOString();
        }
      } catch (error) {
        if (!checkStop()) {
          emit({ type: 'error', message: errorMessage(error) });
          emit({ type: 'done', demo: true });
        }
      } finally {
        demoStore.streams.delete(controller);
        demoStore.loading = demoStore.streams.size > 0;
        if (demoStore.activeStream === controller) demoStore.activeStream = null;
      }
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Application state                                                     */
  /* ---------------------------------------------------------------------- */
  const MODES = [
    { id: 'battle', label: 'Battle Mode', title: 'Battle Mode', desc: 'Battle 2 anonymous models', icon: 'swords' },
    { id: 'agent', label: 'Agent Mode', title: 'Agent Mode', desc: 'Built for complex tasks', icon: 'spark' },
    { id: 'side-by-side', label: 'Side by Side', title: 'Side by Side', desc: 'Compare 2 models of your choice', icon: 'columns' },
    { id: 'direct', label: 'Direct', title: 'Direct', desc: 'Chat with 1 model at a time', icon: 'message' }
  ];
  const MODALITIES = [
    { id: 'video', label: 'Video', icon: 'video', desc: 'Generate Videos' },
    { id: 'image', label: 'Image', icon: 'image', desc: 'Generate Images' },
    { id: 'search', label: 'Web Search', icon: 'globe', desc: 'Search the Web' },
    { id: 'code', label: 'Code', icon: 'code', desc: 'Build Apps and Websites' },
    { id: 'text', label: 'Text', icon: 'type', desc: 'Try Language and Vision models' },
    { id: 'auto', label: 'Auto', icon: 'spark', desc: 'Automatically Detect Modality' }
  ];
  const PERMISSION_MODES = [
    { id: 'default', label: 'Ask', short: 'Ask', icon: 'shield', desc: 'Ask before file changes and commands' },
    { id: 'acceptEdits', label: 'Accept edits', short: 'Accept edits', icon: 'check', desc: 'File edits run automatically, commands still ask' },
    { id: 'auto', label: 'Auto', short: 'Auto', icon: 'spark', desc: 'Safe actions run automatically' },
    { id: 'plan', label: 'Plan only', short: 'Plan only', icon: 'file-text', desc: 'Read and plan — no changes' },
    { id: 'bypassPermissions', label: 'Bypass permissions', short: 'Bypass', icon: 'shield-alert', desc: 'Everything runs without asking', danger: true }
  ];
  const VALID_MODES = MODES.map((item) => item.id);
  const VALID_MODALITIES = MODALITIES.map((item) => item.id);
  const VALID_PERMISSION_MODES = PERMISSION_MODES.map((item) => item.id);

  const state = {
    demo: DEMO,
    booted: false,
    phase: 'loading',
    status: null,
    serverError: null,
    networkOffline: !navigator.onLine,
    retrying: false,
    authenticated: false,
    email: '',
    fullName: '',
    avatarUrl: '',
    backendReached: false,
    mode: 'direct',
    modality: 'text',
    savedModality: 'auto',
    layout: { sidebarWidth: 276, workspaceWidth: 332, connectorsShare: 38 },
    selectionTouched: false,
    // Agent has two honest backends: Arena's native Agent Mode (opens on the
    // site, never a Direct chat) and the local folder-tools loop.
    agentKind: (() => { try { return window.localStorage.getItem('ap-agent-kind') === 'local' ? 'local' : 'native'; } catch { return 'native'; } })(),
    directTools: (() => { try { return window.localStorage.getItem('ap-direct-tools') !== '0'; } catch { return true; } })(),
    rateLimitUntil: 0,
    usageRemaining: null,
    usageReset: null,
    usageModality: null,
    usageSendsToday: 0,
    usageRateLimitsToday: 0,
    historyChars: 0,
    memoryData: null,
    updateInfo: null,
    appSettings: null,
    pendingQuestions: [],
    pendingMediaChoices: [],
    answeringMediaChoices: new Set(),
    activeChatEvalId: null,
    activeChatSource: 'local',
    refreshingChatId: null,
    refreshCheckedAt: {},
    chatTodos: {},
    fanoutModels: [],
    eloModels: null,
    searchResults: [],
    _rateLimitTimer: null,
    appVersion: '',
    workspaceChosen: false,
    permissionMode: 'default',
    workspace: '',
    desktop: false,
    engineOpen: false,
    engineKnown: false,
    nativeReady: false,
    dockShare: 0.42,
    sidebarCollapsed: false,
    chats: [],
    chatsLoading: true,
    chatsError: null,
    cloudChats: [],
    cloudChatsLoading: false,
    cloudChatsError: null,
    chatFilter: '',
    workspacePanelOpen: false,
    workspacePanelRoot: '',
    workspaceTree: [],
    workspaceTreeLoaded: false,
    workspaceTreeLoading: false,
    workspaceTreeError: null,
    workspaceTreeTruncated: false,
    workspaceChildren: {},
    workspaceLoadingPaths: new Set(),
    workspaceExpanded: new Set(),
    workspaceRequest: 0,
    connectors: null,
    connectorsLoading: false,
    connectorsError: null,
    connectorBusy: new Set(),
    connectorRequest: 0,
    arenaConnectors: null,
    arenaConnectorsLoading: false,
    arenaConnectorsError: null,
    arenaConnectorBusy: new Set(),
    arenaConnectorsOff: new Set(),
    arenaConnectorRequest: 0,
    arenaConnectorPoll: null,
    activeChatId: null,
    activeChatTitle: '',
    messages: [],
    historyLoading: false,
    historyError: null,
    view: 'welcome',
    models: [],
    modelsLoading: false,
    modelsError: null,
    modelsMode: null,
    modelsModality: null,
    modelsPromise: null,
    modelsRequest: 0,
    modelAId: null,
    modelBId: null,
    pendingChanges: 0,
    transitionQueue: Promise.resolve(),
    generating: false,
    remoteBusy: false,
    stopping: false,
    stopRequested: false,
    starting: false,
    currentStream: null,
    activeGeneration: null,
    // Per-chat generation state: several chats can work at once.  The
    // legacy Fields above mirror the OPEN chat only (kept in sync by
    // syncGenerationState), while these hold every running chat.
    generations: new Map(),
    chatTurns: {},
    unreadDone: new Set(),
    accounts: [],
    currentAccountId: null,
    accountBusy: false,
    pendingPermissions: [],
    permissionCount: 0,
    decidingPermissions: new Set(),
    artifacts: [],
    attachments: [],
    challenge: null,
    loginPending: false,
    settingsTab: 'connection',
    settingsRerender: null,
    draft: '',
    unread: false
  };

  const API = DEMO ? demoApi : liveApi;
  const els = {};

  const UNREAD_DONE_KEY = 'arenaDesktop.unreadDone.v1';
  function loadUnreadDone() {
    try {
      const raw = JSON.parse(localStorage.getItem(UNREAD_DONE_KEY) || '[]');
      if (Array.isArray(raw)) state.unreadDone = new Set(raw.map(String));
    } catch { /* storage unavailable */ }
  }
  function saveUnreadDone() {
    try { localStorage.setItem(UNREAD_DONE_KEY, JSON.stringify([...state.unreadDone])); } catch { /* noop */ }
  }
  function chatIsGenerating(chatId) {
    return chatId != null && state.generations.has(String(chatId));
  }
  function anyGenerationRunning() { return state.generations.size > 0; }
  function syncGenerationState() {
    const gen = state.activeChatId ? state.generations.get(String(state.activeChatId)) : null;
    state.generating = Boolean(gen);
    state.activeGeneration = gen || null;
    state.currentStream = gen ? gen.controller : null;
    state.stopRequested = Boolean(gen && gen.stopRequested);
    if (!gen) state.stopping = false;
    updateComposerState();
    renderChats();
    renderQueuedBar();
  }
  function stashActiveTurns() {
    if (state.activeChatId && Array.isArray(state.messages) && state.messages.length) {
      state.chatTurns[String(state.activeChatId)] = state.messages;
    }
  }
  function markChatSeen(chatId) {
    if (chatId == null) return;
    if (state.unreadDone.delete(String(chatId))) saveUnreadDone();
  }

  /* ---------------------------------------------------------------------- */