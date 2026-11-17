  /* ---------------------------------------------------------------------- */
  function setServerError(error) {
    state.serverError = errorMessage(error);
    state.backendReached = false;
    state.phase = 'offline';
    updateConnectionUI();
    updateComposerState();
    if (state.view === 'welcome') renderWelcomeState();
    renderChats();
  }

  function clearServerError() {
    state.serverError = null;
    state.backendReached = true;
    state.phase = 'ready';
  }

  function applyStartModeParam() {
    try {
      const wanted = new URLSearchParams(window.location.search).get('mode');
      if (!wanted || state.activeChatId) return;
      if (!['battle', 'agent', 'side-by-side', 'direct'].includes(wanted)) return;
      if (wanted !== state.mode) {
        state.mode = wanted;
        state.selectionTouched = true;
        Promise.resolve(API.setMode?.(wanted)).catch(() => {});
        updateComposerState();
      }
    } catch { /* malformed URL: ignore */ }
  }

  function checkForUpdatesOnce() {
    if (state.demo || state.updateInfo) return;
    API.updateCheck().then((info) => {
      state.updateInfo = info;
      if (info?.enabled !== false && info?.update && info?.latest) {
        showUpdateIsland(info.latest, info.url, info);
      }
    }).catch(() => {});
  }

  function showWhatsNewOnce() {
    if (state.demo) return;
    API.whatsNew().then((data) => {
      if (!data?.version) return;
      const notes = Array.isArray(data.notes) ? data.notes : [];
      const content = el('div', {},
        el('p', { class: 'modal-copy', text: `Arena Desktop updated from ${data.from || 'the previous version'} to ${data.version}.` }),
        notes.length
          ? el('ul', { class: 'update-notes' }, ...notes.map((n) => el('li', { text: n })))
          : el('p', { class: 'modal-note', text: 'No release notes were published for this version.' }));
      setTimeout(() => mountModal({
        title: `Updated to ${data.version}`, subtitle: 'Here is what is new', content,
        actions: [{ label: 'Got it', variant: 'primary', autofocus: true }],
        onClose: () => { API.clearWhatsNew().catch(() => {}); }
      }), 900);
    }).catch(() => {});
  }

  function openUpdateModal(info) {
    const notes = Array.isArray(info.notes) ? info.notes : [];
    const hint = el('p', { class: 'modal-note', text: info.can_install
      ? 'One click: the app downloads the update, closes, installs it and opens again by itself. Your chats and settings stay.'
      : 'Open the download page to get this version.' });
    const content = el('div', {},
      el('p', { class: 'modal-copy', text: `Version ${info.latest} is ready. You have ${info.current}.` }),
      notes.length ? el('h3', { class: 'modal-section-title', text: 'What is new' }) : null,
      notes.length ? el('ul', { class: 'update-notes' }, ...notes.map((n) => el('li', { text: n }))) : null,
      hint);
    const fill = el('span', { class: 'update-bar-fill' });
    const bar = el('div', { class: 'update-bar is-wait', hidden: true, role: 'progressbar', 'aria-label': 'Download progress' }, fill);
    content.appendChild(bar);
    const install = async () => {
      bar.hidden = false;
      const start = await API.updateDownload();
      if (!start?.ok) throw new Error(start?.error || 'Could not start the download.');
      for (;;) {
        await new Promise((r) => setTimeout(r, 400));
        const st = await API.updateStatus();
        if (st.state === 'error') throw new Error(st.error || 'Download failed.');
        if (st.state === 'ready') break;
        const pct = st.total ? Math.floor((st.done / st.total) * 100) : 0;
        bar.classList.toggle('is-wait', pct === 0);
        fill.style.width = `${pct}%`;
        bar.setAttribute('aria-valuenow', String(pct));
        const mb = (n) => (n / 1048576).toFixed(1);
        hint.textContent = st.total ? `Downloading… ${mb(st.done)} of ${mb(st.total)} MB` : 'Starting the download…';
      }
      bar.classList.remove('is-wait'); fill.style.width = '100%';
      hint.textContent = 'Installing and restarting…';
      const res = await API.updateApply();
      if (!res?.ok) throw new Error(res?.error || 'Could not start the update.');
      return false;
    };
    mountModal({
      title: 'Update available', subtitle: `Arena Desktop ${info.latest}`, content,
      actions: [
        { label: 'Later' },
        info.can_install
          ? { label: 'Update now', variant: 'primary', icon: 'download', autofocus: true, onClick: install }
          : { label: 'Open download page', variant: 'primary', icon: 'external', onClick: async () => { window.open(info.url, '_blank', 'noopener'); } }
      ]
    });
  }

  function showUpdateIsland(version, url, info) {
    const existing = document.querySelector('.update-island');
    if (existing) existing.remove();
    const island = el('div', { class: 'update-island', title: 'Click to download the update' });
    island.appendChild(el('span', { class: 'island-dot' }));
    island.appendChild(el('span', { text: 'Update available \u2014 ' }));
    island.appendChild(el('span', { class: 'island-ver', text: `v${version}` }));
    const close = el('span', { class: 'island-close', text: '\u00d7' });
    close.addEventListener('click', (e) => { e.stopPropagation(); island.remove(); });
    island.appendChild(close);
    island.addEventListener('click', () => {
      if (info?.can_install) openUpdateModal(info);
      else if (url) window.open(url, '_blank', 'noopener');
      else openSettings('about');
    });
    document.body.appendChild(island);
  }

  async function exportSettingsFile() {
    const bundle = await API.exportSettings();
    const ui = {};
    try {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i);
        if (k && (k.startsWith('arenaDesktop.') || k.startsWith('ap-'))) ui[k] = window.localStorage.getItem(k);
      }
    } catch { /* storage unavailable */ }
    const blob = new Blob([JSON.stringify({ ...bundle, ui }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: 'arena-desktop-settings.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Settings exported (no account cookies inside).', 'success', 'Settings');
  }

  async function importSettingsFile(file) {
    let bundle;
    try {
      bundle = JSON.parse(await file.text());
    } catch {
      toast('That file is not valid JSON.', 'error', 'Import settings');
      return;
    }
    if (bundle?.ui && typeof bundle.ui === 'object') {
      try {
        Object.entries(bundle.ui).forEach(([k, v]) => {
          if ((k.startsWith('arenaDesktop.') || k.startsWith('ap-')) && typeof v === 'string') window.localStorage.setItem(k, v);
        });
      } catch { /* ignore */ }
    }
    await API.importSettings(bundle);
    state.memoryData = null;
    toast('Settings imported. Restart the app if the folder or tray setting changed.', 'success', 'Settings');
  }

  async function copyDiagnosticsText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Diagnostics copied \u2014 versions and state only, no prompts or cookies.', 'success', 'Diagnostics');
    } catch {
      const area = el('textarea', { class: 'input mono memory-field', rows: '14', readonly: true });
      area.value = text;
      mountModal({ title: 'Diagnostics', content: area, actions: [{ label: 'Done', variant: 'primary' }] });
    }
  }

  async function loadStatus({ initial = false, quiet = false } = {}) {
    if (!quiet) {
      if (!state.backendReached) state.phase = 'loading';
      updateConnectionUI();
    }
    try {
      const raw = await API.getStatus();
      const status = normalizeStatus(raw);
      const oldMode = state.mode;
      const oldModality = state.modality;
      state.status = status;
      state.backendReached = true;
      state.serverError = null;
      state.phase = 'ready';
      state.authenticated = status.authenticated;
      state.email = status.email;
      state.fullName = status.full_name || '';
      state.avatarUrl = status.avatar_url || '';
      state.desktop = status.desktop;
      // status.loading only means the Arena engine/session is loading.
      // remoteBusy now means "a generation this window does not track"
      // (e.g. started in another window); chats tracked locally never
      // block work in other chats.
      const serverBusyIds = Array.isArray(status.generating_chat_ids)
        ? status.generating_chat_ids.map(String) : null;
      state.remoteBusy = serverBusyIds
        ? serverBusyIds.some((id) => !state.generations.has(id))
        : Boolean(status.generating && !anyGenerationRunning());
      if (Array.isArray(status.accounts)) {
        state.accounts = status.accounts;
        state.currentAccountId = status.current_account_id
          || (status.accounts.find((a) => a.current) || {}).id || null;
      }
      state.permissionCount = status.pending_permissions;
      if (status.workspace) state.workspace = status.workspace;
      state.workspaceChosen = Boolean(status.workspace_chosen);
      if (status.workspace_missing && !state.missingFolderShown) {
        state.missingFolderShown = true;
        toast('The folder you chose no longer exists. Pick another one with the folder button above the message box.', 'warning', 'Folder not found');
      } else if (!status.workspace_missing) { state.missingFolderShown = false; }
      if (status.app_version) {
        state.appVersion = status.app_version;
        const versionNode = document.querySelector('.status-desktop');
        if (versionNode) versionNode.textContent = `Arena Desktop · v${status.app_version}`;
      }
      // Adopt the server's mode only until the user (or an opened chat) makes
      // a selection.  After that the composer is authoritative: a slow status
      // answer must not silently flip Agent back to Direct/Battle.
      if (!state.selectionTouched && !state.generating && state.pendingChanges === 0) {
        const selection = normalizeSelection(status.mode || state.mode, status.modality || state.modality);
        state.mode = selection.mode;
        state.modality = selection.modality;
      }
      if (status.permission_mode) state.permissionMode = status.permission_mode;
      const engine = normalizeEngine(status.engine);
      state.engineKnown = engine.known;
      if (engine.known) {
        state.dockShare = clamp(engine.share, 0.24, 0.7);
        state.engineOpen = engine.open;
        syncDock(false);
      }
      if (status.challenge) {
        state.challenge = typeof status.challenge === 'object' ? status.challenge : { message: textValue(status.challenge) };
      }
      state.gateway = status.gateway || null;
      syncGatewayChip();
      maybeGatewaySetupPrompt();
      if (!status.authenticated) {
        state.modelAId = null;
        state.modelBId = null;
      }
      updateAllUI();
      if (initial) {
        applyStartModeParam();
        checkForUpdatesOnce();
        void refreshPulse();
        setInterval(() => { if (!document.hidden) void refreshPulse(); }, 60000);
        showWhatsNewOnce();
      }
      if (!initial && (oldMode !== state.mode || oldModality !== state.modality)) loadModels(state.modality, { quiet: true });
      return status;
    } catch (error) {
      state.backendReached = false;
      state.phase = 'offline';
      state.serverError = errorMessage(error);
      state.status = null;
      updateAllUI();
      return null;
    }
  }

  async function retryConnection() {
    if (state.retrying) return;
    state.retrying = true;
    state.phase = 'loading';
    updateConnectionUI();
    updateComposerState();
    renderChats();
    try {
      const status = await loadStatus();
      if (status) {
        await Promise.allSettled([
          loadChats(),
          state.authenticated ? loadModels(state.modality) : Promise.resolve(),
          loadPermissions({ quiet: true }),
          refreshWorkspacePanel({ force: true })
        ]);
        tabNotice("Connection restored.", 'success');
        announce("Connection to the local server restored.");
      }
    } finally {
      state.retrying = false;
      updateAllUI();
    }
  }

  async function loadPermissions({ quiet = false } = {}) {
    if (state.serverError || state.networkOffline) return;
    try {
      const raw = await API.getPermissions();
      const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.permissions) ? raw.permissions : []);
      const normalized = list.map(normalizePermission).filter(Boolean);
      const seen = new Set();
      state.pendingPermissions = normalized.filter((item) => {
        const key = item.id ? String(item.id) : `${item.title}:${item.command}:${item.path}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      state.permissionCount = state.pendingPermissions.length;
      renderPendingPermissionsUI();
      if (!quiet && normalized.length) toast(`Awaiting permissions: ${normalized.length}`, 'warning', "Your decision is needed");
    } catch (error) {
      if (!quiet) toast(errorMessage(error), 'error', "Failed to obtain permission");
    }
  }

  async function refreshStatusSilently() {
    if (state.demo) return loadStatus({ quiet: true });
    return loadStatus({ quiet: true });
  }

  async function loadChats({ silent = false } = {}) {
    if (!silent) {
      state.chatsLoading = true;
      state.chatsError = null;
      renderChats();
    }
    if (state.serverError) {
      state.chatsLoading = false;
      state.chatsError = state.serverError;
      renderChats();
      return;
    }
    try {
      const raw = await API.getChats();
      const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.chats) ? raw.chats : []);
      const serverChats = list.map(normalizeChat).filter(Boolean);
      const serverIds = new Set(serverChats.map((chat) => chat.id));
      const keptLocal = (state.chats || []).filter((chat) =>
        !serverIds.has(chat.id)
        && (state.generations.has(chat.id) || chat.id === String(state.activeChatId)));
      state.chats = [...keptLocal, ...serverChats].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const left = new Date(a.updated_at || a.created_at || 0).getTime();
        const right = new Date(b.updated_at || b.created_at || 0).getTime();
        return right - left;
      });
      state.chatsLoading = false;
      state.chatsError = null;
      if (state.activeChatId) {
        const active = state.chats.find((chat) => chat.id === String(state.activeChatId));
        if (active) state.activeChatTitle = active.title;
      }
      renderChats();
      updateTopbarTitle();
      if (state.authenticated) await loadArenaChats({ silent: true });
      else { state.cloudChats = []; state.cloudChatsError = null; renderChats(); }
      return state.chats;
    } catch (error) {
      state.chatsLoading = false;
      state.chatsError = errorMessage(error);
      renderChats();
      if (!silent) toast(state.chatsError, 'error', "Chat list unavailable");
      return [];
    }
  }

  function normalizeArenaChat(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = raw.eval_id ?? raw.id;
    if (!id) return null;
    const apiMode = ({ 'direct-battle': 'direct' })[raw.mode] || raw.mode;
    return {
      id: String(id),
      eval_id: String(id),
      type: raw.type === 'agentic' ? 'agentic' : 'evaluation',
      title: String(raw.title ?? raw.name ?? "arena.ai Chat"),
      updated_at: raw.updated_at ?? raw.modified_at ?? raw.created_at ?? null,
      created_at: raw.created_at ?? null,
      mode: raw.type === 'agentic' ? 'agent' : validMode(apiMode),
      modality: validModality(raw.modality),
      local_chat_id: raw.local_chat_id ? String(raw.local_chat_id) : null,
      local_mode: validMode(raw.local_mode) || null,
      message_count: Number.isFinite(Number(raw.message_count)) ? Number(raw.message_count) : null,
      raw
    };
  }

  async function loadArenaChats({ silent = false } = {}) {
    if (!state.authenticated) {
      state.cloudChats = [];
      state.cloudChatsError = null;
      state.cloudChatsLoading = false;
      renderChats();
      return [];
    }
    state.cloudChatsLoading = true;
    if (!silent) { state.cloudChatsError = null; renderChats(); }
    try {
      const raw = await API.getArenaChats();
      const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.entries) ? raw.entries : []);
      state.cloudChats = list.map(normalizeArenaChat).filter(Boolean);
      state.cloudChatsError = raw?.ok === false ? errorMessage(new ApiError(raw.error || "arena.ai history is unavailable", 0, raw)) : null;
      return state.cloudChats;
    } catch (error) {
      state.cloudChatsError = errorMessage(error);
      if (!silent) toast(state.cloudChatsError, 'error', "arena.ai chats are unavailable");
      return [];
    } finally {
      state.cloudChatsLoading = false;
      renderChats();
    }
  }

  async function openArenaChat(entry) {
    if (!entry) return;
    if (entry.local_chat_id) { await openChat(entry.local_chat_id); return; }
    try {
      const result = await API.openArenaChat(entry.eval_id || entry.id, entry.type || 'evaluation', entry.title || '');
      if (result?.external) {
        toast('Arena Agent chat imported.', 'info');
        return;
      }
      const chatId = result?.chat_id || result?.id;
      if (!chatId) throw new ApiError("The server did not return the ID of the imported chat.", 0, result);
      await loadChats({ silent: true });
      await openChat(chatId);
      if (result.imported) toast("Chat imported from arena.ai into local history.", 'success');
    } catch (error) {
      const url = error?.details?.url;
      toast(errorMessage(error), 'error', "Failed to open arena.ai chat");
      if (url && state.demo) window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  async function loadModels(modality = state.modality, { quiet = false, mode = state.mode, force = false } = {}) {
    const requestId = ++state.modelsRequest;
    const selectionProblem = selectionIssue(mode, modality);
    if (selectionProblem || mode === 'battle' || mode === 'agent' || modality === 'video') {
      state.models = [];
      state.modelsMode = mode;
      state.modelsModality = modality;
      state.modelsLoading = false;
      state.modelsError = selectionProblem || null;
      state.modelsPromise = null;
      ensureModelSelections();
      renderModelStrip();
      renderModelsNavCount();
      updateComposerState();
      return [];
    }
    state.modelsLoading = true;
    if (!quiet) state.modelsError = null;
    renderModelStrip();
    updateComposerState();
    const promise = (async () => {
      try {
        const raw = await API.getModels(modality, mode, force);
        if (requestId !== state.modelsRequest) return;
        state.models = modelArray(raw);
        state.modelsMode = mode;
        state.modelsModality = modality;
        state.modelsError = null;
        ensureModelSelections();
        renderModelStrip();
        renderModelsNavCount();
        return state.models;
      } catch (error) {
        if (requestId !== state.modelsRequest) return;
        state.models = [];
        state.modelsMode = mode;
        state.modelsModality = modality;
        state.modelsError = errorMessage(error);
        state.modelAId = null;
        state.modelBId = null;
        renderModelStrip();
        renderModelsNavCount();
        if (!quiet) toast(state.modelsError, 'error', "Models unavailable");
        return [];
      } finally {
        if (requestId === state.modelsRequest) {
          state.modelsLoading = false;
          if (state.modelsPromise === promise) state.modelsPromise = null;
          renderModelStrip();
          updateComposerState();
        }
      }
    })();
    state.modelsPromise = promise;
    return promise;
  }

  /* ---------------------------------------------------------------------- */
  /* Chat list                                                             */
  /* ---------------------------------------------------------------------- */
  function chatMatchesFilter(chat) {
    const query = state.chatFilter.trim().toLocaleLowerCase('en');
    return !query || String(chat.title || '').toLocaleLowerCase('en').includes(query);
  }

  function filteredChats() {
    return state.chats.filter(chatMatchesFilter);
  }

  function dedupedArenaChats() {
    const localIds = new Set(state.chats.map((chat) => String(chat.id)));
    const localEvalIds = new Set(state.chats.map((chat) => String(chat.eval_id || '')).filter(Boolean));
    return state.cloudChats.filter((entry) => {
      if (entry.local_chat_id && localIds.has(String(entry.local_chat_id))) return false;
      if (entry.eval_id && (localIds.has(String(entry.eval_id)) || localEvalIds.has(String(entry.eval_id)))) return false;
      return true;
    });
  }

  function filteredArenaChats() {
    return dedupedArenaChats().filter(chatMatchesFilter);
  }

  function chatGroupTitle(icon, text) {
    return el('div', { class: 'chat-group-title', role: 'presentation' }, iconEl(icon), el('span', { text }));
  }

  function chatStatusEl(chatId) {
    // Fixed-width status slot: a spinning half-moon while the chat works,
    // a green check when it finished and has not been opened since.
    const slot = el('span', { class: 'chat-row-status', 'aria-hidden': 'true' });
    if (chatIsGenerating(chatId)) {
      slot.appendChild(el('span', { class: 'run-dot', title: 'Working…' }));
      slot.removeAttribute('aria-hidden');
      slot.setAttribute('role', 'status');
      slot.setAttribute('aria-label', 'Working');
    } else if (state.unreadDone.has(String(chatId))) {
      slot.appendChild(el('span', { class: 'done-dot', title: 'Finished — not opened yet' }, iconEl('check')));
      slot.removeAttribute('aria-hidden');
      slot.setAttribute('role', 'status');
      slot.setAttribute('aria-label', 'Finished, not opened yet');
    }
    return slot;
  }

  function localChatRow(chat) {
    const active = String(state.activeChatId) === String(chat.id);
    const running = chatIsGenerating(chat.id);
    const unread = !running && state.unreadDone.has(String(chat.id));
    const row = el('div', { class: `chat-row${active ? ' is-active' : ''}${running ? ' is-running' : ''}${unread ? ' is-unread' : ''}`, role: 'listitem' });
    const metaBits = [];
    if (chat.mode) metaBits.push(modeMeta(chat.mode).label);
    metaBits.push(relativeTime(chat.updated_at || chat.created_at));
    const openButton = el('button', {
      class: 'chat-row-main chat-row-open',
      type: 'button',
      'data-chat-open': chat.id,
      'aria-label': `Open chat: ${chat.title}${running ? ' (working)' : unread ? ' (finished, not opened yet)' : ''}`,
      'aria-current': active ? 'page' : false
    },
      el('span', { class: 'chat-row-title', text: chat.title }),
      el('span', { class: 'chat-row-meta', text: metaBits.filter(Boolean).join(' · ') })
    );
    const deleteButton = el('button', {
      class: 'chat-row-delete', type: 'button', 'data-chat-delete': chat.id,
      'aria-label': `Delete chat: ${chat.title}`, title: "Delete chat"
    }, iconEl('trash'));
    row.append(chatStatusEl(chat.id), openButton, deleteButton);
    return row;
  }

  function arenaChatRow(entry) {
    const localId = entry.local_chat_id || null;
    const active = localId && String(state.activeChatId) === String(localId);
    const row = el('div', { class: `chat-row${active ? ' is-active' : ''}`, role: 'listitem' });
    const metaBits = [relativeTime(entry.updated_at || entry.created_at)];
    if (entry.type === 'agentic') metaBits.push('Agent');
    else if (entry.local_mode) metaBits.push(modeMeta(entry.local_mode).label);
    else if (entry.mode) metaBits.push(modeMeta(entry.mode).label);
    const attrs = {
      class: 'chat-row-main chat-row-open',
      type: 'button',
      'aria-label': `${entry.type === 'agentic' ? 'Open Agent chat' : 'Import and open chat'}: ${entry.title}`,
      'aria-current': active ? 'page' : false
    };
    if (localId) attrs['data-chat-open'] = localId;
    else {
      attrs['data-cloud-chat-open'] = entry.eval_id || entry.id;
      attrs['data-cloud-chat-type'] = entry.type || 'evaluation';
    }
    metaBits.push('arena.ai');
    const openButton = el('button', attrs,
      el('span', { class: 'chat-row-title', text: entry.title }),
      el('span', { class: 'chat-row-meta', text: metaBits.filter(Boolean).join(' · ') }));
    const deleteButton = el('button', {
      class: 'chat-row-delete', type: 'button',
      'data-cloud-chat-delete': entry.eval_id || entry.id || '',
      'aria-label': `Delete chat on Arena: ${entry.title}`, title: "Delete (archive on Arena)"
    }, iconEl('trash'));
    row.append(chatStatusEl(localId), openButton, deleteButton);
    return row;
  }

  function renderChats() {
    const listNode = els.chatList;
    if (!listNode) return;
    const filtered = filteredChats();
    const cloudFiltered = filteredArenaChats();
    const totalVisibleKinds = state.chats.length + dedupedArenaChats().length;
    if (els.chatCount) els.chatCount.textContent = totalVisibleKinds ? String(totalVisibleKinds) : '';
    listNode.setAttribute('aria-busy', String(state.chatsLoading || state.cloudChatsLoading));
    clear(listNode);

    listNode.appendChild(chatGroupTitle('clock', "Recent"));
    if (state.chatsLoading && !state.chats.length) {
      const skeleton = el('div', { class: 'sidebar-skeleton', 'aria-label': "Loading local chats" });
      for (let index = 0; index < 3; index += 1) skeleton.appendChild(el('span', { class: `skeleton-line${index === 1 ? ' short' : ''}` }));
      listNode.appendChild(skeleton);
    } else if (state.chatsError) {
      listNode.appendChild(el('div', { class: 'sidebar-empty sidebar-error' },
        el('strong', { text: state.serverError ? "Server unavailable" : "Failed to load local chats" }),
        el('span', { class: 'inline-error', text: state.chatsError }),
        el('button', { class: 'button button-small button-quiet', type: 'button', 'data-action': state.serverError ? 'retry-connection' : 'retry-chats' },
          iconEl('refresh'), el('span', { text: "Retry" }))
      ));
    } else if (!filtered.length) {
      listNode.appendChild(el('div', { class: 'chat-group-note', text: state.chatFilter
        ? "There is nothing in the local history for this request."
        : "No local chats yet. Create the first dialogue — it will appear here." }));
    } else {
      filtered.forEach((chat) => {
        listNode.appendChild(localChatRow(chat));
        const kids = Array.isArray(chat.children) ? chat.children : [];
        if (kids.length && !state.chatFilter) {
          const wrap = el('div', { class: 'chat-children' });
          kids.forEach((kid) => wrap.appendChild(localChatRow(kid)));
          listNode.appendChild(wrap);
        }
      });
    }

    if (state.chatFilter.trim().length >= 2 && Array.isArray(state.searchResults) && state.searchResults.length) {
      listNode.appendChild(chatGroupTitle('search', "In messages"));
      state.searchResults.slice(0, 20).forEach((hit) => {
        const row = el('button', { class: 'search-hit', type: 'button', title: hit.title || '' },
          el('span', { class: 'search-hit-title', text: hit.title || 'Chat' }),
          el('span', { class: 'search-hit-snippet', text: hit.snippet || '' }));
        row.addEventListener('click', () => { void openChatAtMessage(hit.chat_id, hit.msg_index); });
        listNode.appendChild(row);
      });
    }

    listNode.appendChild(chatGroupTitle('cloud', "Only on arena.ai"));
    if (!state.authenticated) {
      listNode.appendChild(el('div', { class: 'chat-group-note', text: "Log in to Arena to see the account chats from the website. Local dialogues above are available without logging in." }));
    } else if (state.cloudChatsLoading || /still loading|waiting for a check/i.test(String(state.cloudChatsError || ''))) {
      // The arena.ai session is still starting: a loading line, not an error.
      // watchEngineUntilReady() reloads the list the moment it is ready.
      listNode.appendChild(el('div', { class: 'chat-group-note' },
        el('span', { class: 'mini-spinner', 'aria-hidden': 'true' }),
        el('span', { text: " Loading arena.ai history…" })));
    } else if (state.cloudChatsError) {
      listNode.appendChild(el('div', { class: 'sidebar-empty sidebar-error' },
        el('strong', { text: "arena.ai history is unavailable" }),
        el('span', { class: 'inline-error', text: state.cloudChatsError }),
        el('button', { class: 'button button-small button-quiet', type: 'button', 'data-action': 'retry-arena-chats' },
          iconEl('refresh'), el('span', { text: "Retry" }))
      ));
    } else if (!cloudFiltered.length) {
      listNode.appendChild(el('div', { class: 'chat-group-note', text: state.chatFilter
        ? "Nothing found on arena.ai for this request in the last 50 chats."
        : "There are no new chats only on arena.ai. Already imported ones are shown in the local list above." }));
    } else {
      cloudFiltered.forEach((entry) => listNode.appendChild(arenaChatRow(entry)));
    }
  }

  function setChatSearchVisible(visible) {
    if (!els.chatSearchWrap) return;
    if (!visible) {
      state.chatFilter = '';
      if (els.chatSearch) els.chatSearch.value = '';
      els.chatSearchWrap.hidden = true;
      els.clearChatSearch.hidden = true;
      renderChats();
      return;
    }
    els.chatSearchWrap.hidden = false;
    if (state.sidebarCollapsed) setSidebarCollapsed(false);
    if (window.matchMedia('(max-width: 900px)').matches) openMobileSidebar();
    const body = $('#recentsBody');
    if (body) body.hidden = false;
    els.recentsToggle?.setAttribute('aria-expanded', 'true');
    window.setTimeout(() => els.chatSearch?.focus(), 20);
    els.clearChatSearch.hidden = !state.chatFilter;
  }

  function openMobileSidebar() {
    document.body.classList.add('mobile-sidebar-open');
    els.app?.classList.add('mobile-sidebar-open');
    if (els.sidebarScrim) els.sidebarScrim.hidden = false;
    els.mobileMenuBtn?.setAttribute('aria-expanded', 'true');
  }

  function closeMobileSidebar() {
    document.body.classList.remove('mobile-sidebar-open');
    els.app?.classList.remove('mobile-sidebar-open');
    if (els.sidebarScrim) els.sidebarScrim.hidden = true;
    els.mobileMenuBtn?.setAttribute('aria-expanded', 'false');
  }

  function setSidebarCollapsed(collapsed) {
    state.sidebarCollapsed = Boolean(collapsed);
    els.app?.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
    els.collapseSidebar?.setAttribute('aria-expanded', String(!state.sidebarCollapsed));
    els.collapseSidebar?.setAttribute('aria-label', state.sidebarCollapsed ? "Expand the sidebar" : "Collapse the sidebar");
    if (els.collapseSidebar) els.collapseSidebar.title = state.sidebarCollapsed ? "Expand the panel" : "Collapse the panel";
    try { localStorage.setItem('arenaPersonal.sidebarCollapsed.v4', state.sidebarCollapsed ? '1' : '0'); } catch { /* storage unavailable */ }
  }

  function focusComposer() {
    if (!els.prompt) return;
    els.prompt.focus();
    try { els.prompt.setSelectionRange(els.prompt.value.length, els.prompt.value.length); } catch { /* noop */ }
  }

  /* ---------------------------------------------------------------------- */
  /* Chat rendering                                                        */