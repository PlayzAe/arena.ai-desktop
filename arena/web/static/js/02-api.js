  /* ---------------------------------------------------------------------- */
  /* API layer: relative URLs only, no token, no arena.ai requests.         */
  /* ---------------------------------------------------------------------- */
  class ApiError extends Error {
    constructor(message, status = 0, details = null) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.details = details;
    }
  }

  function extractError(payload, status) {
    let message = '';
    if (typeof payload === 'string') {
      const trimmed = payload.trim();
      const looksLikeMarkup = /^<!doctype|^<html|<\/body>|<\/html>/i.test(trimmed);
      if (!looksLikeMarkup && trimmed.length <= 500) message = trimmed;
    } else if (payload && typeof payload === 'object') {
      const value = payload.error ?? payload.detail ?? payload.message ?? payload.status_message;
      if (typeof value === 'string') message = value.slice(0, 700);
      else if (value && typeof value === 'object') message = textValue(value.message ?? value.detail ?? value.error).slice(0, 700);
    }
    if (!message) message = status ? `Server returned an error ${status}. Check that the local application is running.` : "It was not possible to execute the request.";
    return message;
  }

  async function parseResponsePayload(response) {
    const text = await response.text().catch(() => '');
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
  }

  let _apiToken = document.querySelector('meta[name="api-token"]')?.content || '';
  const _previewToken = document.querySelector('meta[name="preview-token"]')?.content || '';

  // Workspace file preview URL. The read-only key is part of the path, so the
  // page's relative CSS/JS/images load too, in the app, an iframe or a browser.
  function previewLink(path, { absolute = false } = {}) {
    const rel = String(path || '').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
    const url = _previewToken
      ? `/preview/${encodeURIComponent(_previewToken)}/${rel}`
      : `/api/workspace/preview/${rel}?token=${encodeURIComponent(_apiToken)}`;
    return absolute ? new URL(url, window.location.origin).href : url;
  }

  // Open a site preview: its own WebView2 window in the desktop app (arena.site
  // pages refuse to load inside frames), a new browser tab otherwise.
  function openPreview(url, title = 'Preview') {
    const href = new URL(String(url || ''), window.location.origin).href;
    const api = window.pywebview?.api;
    if (api?.open_preview) {
      Promise.resolve(api.open_preview(href, title)).then((ok) => {
        if (!ok) window.open(href, '_blank', 'noopener');
      }).catch(() => window.open(href, '_blank', 'noopener'));
      return;
    }
    window.open(href, '_blank', 'noopener');
  }

  const liveApi = {
    async request(path, { method = 'GET', body, signal } = {}) {
      const options = {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'X-Arena-Token': _apiToken },
        signal
      };
      if (body !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
      }
      let response;
      try {
        response = await fetch(path, options);
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        throw new ApiError("The local application server is unavailable. Check that the application is running and try again.", 0, error);
      }
      const payload = await parseResponsePayload(response);
      if (!response.ok) throw new ApiError(extractError(payload, response.status), response.status, payload);
      return payload ?? {};
    },
    getStatus() { return this.request('/api/status'); },
    getSettings() { return this.request('/api/settings'); },
    saveSettings(body) { return this.request('/api/settings', { method: 'POST', body }); },
    login() { return this.request('/api/login', { method: 'POST', body: { method: 'window' } }); },
    loginCookie(cookie) { return this.request('/api/login', { method: 'POST', body: { method: 'manual', cookie } }); },
    loginPoll() { return this.request('/api/login/poll'); },
    engineShow() { return this.request('/api/engine/show', { method: 'POST', body: {} }); },
    engineHide() { return this.request('/api/engine/hide', { method: 'POST', body: {} }); },
    logout() { return this.request('/api/logout', { method: 'POST', body: {} }); },
    getModels(modality, mode, force = false) { return this.request(`/api/models?mode=${encodeURIComponent(mode || '')}&modality=${encodeURIComponent(modality)}${force ? '&force=1' : ''}`); },
    setMode(mode) { return this.request('/api/mode', { method: 'POST', body: { mode } }); },
    setModality(modality) { return this.request('/api/modality', { method: 'POST', body: { modality } }); },
    newChat() { return this.request('/api/new', { method: 'POST', body: {} }); },
    getChats() { return this.request('/api/chats'); },
    getArenaChats() { return this.request('/api/arena-chats?limit=50'); },
    openArenaChat(id, type, title) { return this.request(`/api/arena-chats/${encodeURIComponent(id)}/open`, { method: 'POST', body: { type, title } }); },
    archiveArenaChat(id, type) { return this.request(`/api/arena-chats/${encodeURIComponent(id)}/archive`, { method: 'POST', body: { type } }); },
    vote(chatId, body) { return this.request(`/api/chats/${encodeURIComponent(chatId)}/vote`, { method: 'POST', body }); },
    getChat(id) { return this.request(`/api/chats/${encodeURIComponent(id)}`); },
    refreshChat(id) { return this.request(`/api/chats/${encodeURIComponent(id)}/refresh`, { method: 'POST', body: {} }); },
    deleteChat(id) { return this.request(`/api/chats/${encodeURIComponent(id)}/delete`, { method: 'POST', body: {} }); },
    compactChat(id) { return this.request(`/api/chats/${encodeURIComponent(id)}/compact`, { method: 'POST', body: {} }); },
    getMemory() { return this.request('/api/memory'); },
    saveMemory(body) { return this.request('/api/memory', { method: 'POST', body }); },
    updateCheck(force = false) { return this.request(`/api/update-check${force ? '?force=1' : ''}`); },
    updateDownload() { return this.request('/api/update/download', { method: 'POST', body: {} }); },
    updateStatus() { return this.request('/api/update/status'); },
    updateApply() { return this.request('/api/update/apply', { method: 'POST', body: {} }); },
    whatsNew() { return this.request('/api/update/whatsnew'); },
    clearWhatsNew() { return this.request('/api/update/whatsnew', { method: 'DELETE' }); },
    exportSettings() { return this.request('/api/settings/export'); },
    importSettings(bundle) { return this.request('/api/settings/import', { method: 'POST', body: bundle }); },
    diagnostics() { return this.request('/api/diagnostics'); },
    diagnosticsRun() { return this.request('/api/diagnostics/run'); },
    getUsage() { return this.request('/api/usage'); },
    getPulse() { return this.request('/api/usage/pulse'); },
    syncProject(chatId) { return this.request(`/api/chats/${encodeURIComponent(chatId)}/sync-project`, { method: 'POST', body: {} }); },
    getGateway() { return this.request('/api/gateway'); },
    startGateway() { return this.request('/api/gateway/start', { method: 'POST', body: {} }); },
    stopGateway() { return this.request('/api/gateway/stop', { method: 'POST', body: {} }); },
    getComponents() { return this.request('/api/components'); },
    installComponent(id) { return this.request('/api/components/install', { method: 'POST', body: { id } }); },
    getQuestions() { return this.request('/api/questions'); },
    answerQuestion(id, answer) { return this.request(`/api/questions/${encodeURIComponent(id)}`, { method: 'POST', body: { answer } }); },
    getMediaChoices() { return this.request('/api/media-choices'); },
    answerMediaChoice(id, body) { return this.request(`/api/media-choices/${encodeURIComponent(id)}`, { method: 'POST', body }); },
    searchChats(q) { return this.request(`/api/search?q=${encodeURIComponent(q)}`); },
    forkChat(id, messageIndex) { return this.request(`/api/chats/${encodeURIComponent(id)}/fork`, { method: 'POST', body: { message_index: messageIndex } }); },
    restoreCheckpoint(id) { return this.request(`/api/checkpoints/${encodeURIComponent(id)}/restore`, { method: 'POST', body: {} }); },
    workspaceSnapshot(paths) { return this.request('/api/workspace/snapshot', { method: 'POST', body: { paths } }); },
    getElo() { return this.request('/api/elo'); },
    getAutomations() { return this.request('/api/automations'); },
    saveAutomation(body) { return this.request('/api/automations', { method: 'POST', body }); },
    deleteAutomation(id) { return this.request(`/api/automations/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
    runAutomation(id) { return this.request(`/api/automations/${encodeURIComponent(id)}/run`, { method: 'POST', body: {} }); },
    getHistory() { return this.request('/api/history'); },
    getPermissions() { return this.request('/api/permissions'); },
    decidePermission(id, decision) {
      return this.request(`/api/permissions/${encodeURIComponent(id)}`, { method: 'POST', body: { decision } });
    },
    getPermissionMode() { return this.request('/api/permission-mode'); },
    setPermissionMode(mode) { return this.request('/api/permission-mode', { method: 'POST', body: { mode } }); },
    getWorkspace() { return this.request('/api/workspace'); },
    setWorkspace(path) { return this.request('/api/workspace/set', { method: 'POST', body: { path } }); },
    clearWorkspace() { return this.request('/api/workspace/set', { method: 'POST', body: { clear: true } }); },
    runLocal(path) { return this.request('/api/workspace/run-local', { method: 'POST', body: { path } }); },
    runLocalState(id) { return this.request(`/api/workspace/run-local/${encodeURIComponent(id)}`); },
    stopRunLocal(id) { return this.request(`/api/workspace/run-local/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
    async uploadAttachment(file, kind, modality) {
      const form = new FormData();
      form.append('file', file, file.name);
      form.append('kind', kind || 'evaluation');
      if (modality) form.append('modality', modality);
      let response;
      try {
        response = await fetch('/api/uploads', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { Accept: 'application/json', 'X-Arena-Token': _apiToken }, body: form
        });
      } catch (error) {
        throw new ApiError("The local application server is unavailable. The file was not uploaded.", 0, error);
      }
      const payload = await parseResponsePayload(response);
      if (!response.ok) throw new ApiError(extractError(payload, response.status), response.status, payload);
      return payload ?? {};
    },
    saveWorkspace(chatId, lane) { return this.request('/api/workspace/save', { method: 'POST', body: { chat_id: chatId, lane } }); },
    openWorkspace(path) { return this.request('/api/workspace/open', { method: 'POST', body: { path } }); },
    getWorkspaceTree(path = '.') { return this.request(`/api/workspace/tree?path=${encodeURIComponent(path)}`); },
    async uploadToWorkspace(files) {
      const fd = new FormData();
      for (const f of files) fd.append('files', f, f.webkitRelativePath || f.name);
      const resp = await fetch('/api/workspace/upload', { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-Arena-Token': _apiToken } });
      if (!resp.ok) throw new ApiError('Upload failed', resp.status);
      return resp.json();
    },
    getWorkspaceFile(path) { return this.request(`/api/workspace/file?path=${encodeURIComponent(path)}`); },
    async downloadWorkspaceFile(path) {
      let response;
      try {
        response = await fetch(`/api/workspace/download?path=${encodeURIComponent(path)}`, { credentials: 'same-origin', cache: 'no-store', headers: { 'X-Arena-Token': _apiToken } });
      } catch (error) {
        throw new ApiError('The local application server is unavailable.', 0, error);
      }
      if (!response.ok) {
        const payload = await parseResponsePayload(response);
        throw new ApiError(extractError(payload, response.status), response.status, payload);
      }
      return response.blob();
    },
    getConnectors() { return this.request('/api/connectors'); },
    reloadConnectors() { return this.request('/api/connectors/reload', { method: 'POST', body: {} }); },
    openConnectorConfig() { return this.request('/api/connectors/config/open', { method: 'POST', body: {} }); },
    installConnectorPreset(presetId, values, connect = true) { return this.request('/api/connectors/preset', { method: 'POST', body: { preset_id: presetId, values, connect } }); },
    addConnectorCli(body) { return this.request('/api/connectors/cli', { method: 'POST', body }); },
    connectConnector(name) { return this.request(`/api/connectors/${encodeURIComponent(name)}/connect`, { method: 'POST', body: {} }); },
    disconnectConnector(name) { return this.request(`/api/connectors/${encodeURIComponent(name)}/disconnect`, { method: 'POST', body: {} }); },
    setConnectorEnabled(name, enabled) { return this.request(`/api/connectors/${encodeURIComponent(name)}/enabled`, { method: 'POST', body: { enabled } }); },
    deleteConnector(name) { return this.request(`/api/connectors/${encodeURIComponent(name)}/delete`, { method: 'POST', body: {} }); },
    getArenaConnectors() { return this.request('/api/arena-connectors'); },
    openNativeAgent(message) { return this.request('/api/agent/native', { method: 'POST', body: { message } }); },
    connectArenaConnector(slug) { return this.request(`/api/arena-connectors/${encodeURIComponent(slug)}/connect`, { method: 'POST', body: {} }); },
    pollArenaConnector(slug) { return this.request(`/api/arena-connectors/${encodeURIComponent(slug)}/connect/poll`); },
    disconnectArenaConnector(slug) { return this.request(`/api/arena-connectors/${encodeURIComponent(slug)}/disconnect`, { method: 'POST', body: {} }); },
    saveMedia(url) { return this.request('/api/media/save', { method: 'POST', body: { url } }); },
    getDoctor() { return this.request('/api/doctor'); },
    async workspaceZip(path) {
      let response;
      try {
        response = await fetch(`/api/workspace/zip?path=${encodeURIComponent(path)}`, { credentials: 'same-origin', cache: 'no-store', headers: { 'X-Arena-Token': _apiToken } });
      } catch (error) {
        throw new ApiError("The local application server is unavailable.", 0, error);
      }
      if (!response.ok) {
        const payload = await parseResponsePayload(response);
        throw new ApiError(extractError(payload, response.status), response.status, payload);
      }
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const payload = await response.json().catch(() => null);
        throw new ApiError(extractError(payload, response.status), response.status, payload);
      }
      return response.blob();
    },
    async stop(chatId) { return this.request('/api/stop', { method: 'POST', body: chatId ? { chat_id: chatId } : {} }); },
    getAccounts() { return this.request('/api/accounts'); },
    switchAccount(id) { return this.request('/api/accounts/switch', { method: 'POST', body: { id } }); },
    addAccount() { return this.request('/api/accounts/add', { method: 'POST', body: {} }); },
    removeAccount(id) { return this.request('/api/accounts/remove', { method: 'POST', body: { id } }); },
    async streamChat(body, onEvent, signal) {
      let response;
      try {
        response = await fetch('/api/chat', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json', 'X-Arena-Token': _apiToken },
          body: JSON.stringify(body),
          signal
        });
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        throw new ApiError("The local application server is unavailable. Check that the application is running and try again.", 0, error);
      }
      if (!response.ok) {
        const payload = await parseResponsePayload(response);
        throw new ApiError(extractError(payload, response.status), response.status, payload);
      }
      if (!response.body) throw new ApiError("The server opened an empty response stream.", response.status);
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      const parser = new SSEParser(onEvent, (raw) => {
        onEvent({ type: 'notice', message: "A damaged flow event was missed." });
      });
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          parser.push(decoder.decode(value, { stream: true }));
        }
        parser.push(decoder.decode());
        parser.flush();
      } finally {
        try { reader.releaseLock(); } catch { /* already released */ }
      }
    }
  };

  /**
   * SSE parser for fetch + ReadableStream.
   * Handles partial chunks, CRLF boundaries, UTF-8 decoding, multiline data.
   */
  class SSEParser {
    constructor(onEvent, onMalformed) {
      this.buffer = '';
      this.onEvent = onEvent;
      this.onMalformed = onMalformed;
      this.closed = false;
    }
    push(chunk) {
      if (this.closed) return;
      this.buffer += chunk;
      this.buffer = this.buffer.replace(/\r\n/g, '\n');
      let index;
      while ((index = this.buffer.indexOf('\n\n')) !== -1) {
        const block = this.buffer.slice(0, index);
        this.buffer = this.buffer.slice(index + 2);
        this.parseBlock(block);
      }
    }
    flush() {
      if (this.buffer.trim()) this.parseBlock(this.buffer);
      this.buffer = '';
    }
    parseBlock(block) {
      const dataLines = [];
      for (const line of block.split('\n')) {
        if (!line || line.startsWith(':')) continue;
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? '' : line.slice(colon + 1);
        if (value.startsWith(' ')) value = value.slice(1);
        if (field === 'data') dataLines.push(value);
      }
      if (!dataLines.length) return;
      const raw = dataLines.join('\n');
      if (raw.trim() === '[DONE]') {
        this.onEvent({ type: 'done' });
        return;
      }
      try {
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return;
        if (!data.type && (data.error || data.detail)) data.type = 'error';
        this.onEvent(data);
      } catch (error) {
        if (this.onMalformed) this.onMalformed(raw, error);
      }
    }
  }

  /* ---------------------------------------------------------------------- */