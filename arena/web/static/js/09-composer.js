  /* ---------------------------------------------------------------------- */
  function setAgentKind(kind) {
    if (kind !== 'native' && kind !== 'local') return;
    state.agentKind = kind;
    try { window.localStorage.setItem('ap-agent-kind', kind); } catch { /* private mode */ }
    pruneAttachmentsForSelection();
    renderModelStrip();
    renderComposerContext();
    updateComposerState();
  }

  function syncWorkspaceSyncToggle() {
    // Workspace Sync is always in the toolbar, in every mode: it decides
    // whether chats may work in the folder selected on this computer.
    const chip = els.workspaceSyncChip;
    const input = els.workspaceSyncToggle;
    if (!chip || !input) return;
    chip.hidden = false;
    const on = state.mode === 'agent'
      ? Boolean(state.directTools)
      : Boolean(state.directTools && state.workspaceChosen);
    input.checked = on;
    input.disabled = state.generating;
    chip.classList.toggle('is-on', on);
    chip.classList.toggle('is-disabled', state.generating);
    if (state.mode === 'agent') {
      chip.title = on
        ? "Workspace Sync is on: the Local Agent works in the folder selected on this computer, and files the Arena Agent creates are downloaded into that folder."
        : "Workspace Sync is off: the Local Agent answers without touching this computer, and Arena Agent files stay in Arena's workspace.";
    } else if (state.workspaceChosen) {
      chip.title = on
        ? "Workspace Sync is on: the models can run commands and use tools in the folder selected on this computer, and the results return to them automatically. Actions follow the permission mode."
        : "Workspace Sync is off: the models only chat and cannot touch the folder selected on this computer.";
    } else {
      chip.title = "Workspace Sync: first choose a folder on this computer (the workspace chip on the left), then the models can work in it like an agent.";
    }
  }

  function setWorkspaceSync(on) {
    if (on && !state.workspaceChosen && state.mode !== 'agent') {
      state.directTools = false;
      syncWorkspaceSyncToggle();
      toast("Choose a folder on this computer first — Workspace Sync lets the models work in that folder like an agent.", 'info', "Workspace Sync");
      openWorkspacePopover(els.workspaceButton);
      return;
    }
    state.directTools = Boolean(on);
    try { window.localStorage.setItem('ap-direct-tools', state.directTools ? '1' : '0'); } catch { /* private mode */ }
    syncWorkspaceSyncToggle();
    toast(state.directTools
      ? "Workspace Sync is on: models can run commands and use tools in the folder selected on this computer, and the results return to them automatically."
      : "Workspace Sync is off: models answer with regular text and cannot touch the folder on this computer.", 'info', "Workspace Sync");
  }


  const CONTEXT_WARN_CHARS = 80000;

  function syncGatewayChip() {
    const chip = els.gatewayChip;
    if (!chip) return;
    const active = Boolean(state.gateway?.active);
    chip.hidden = !active;
    if (active) chip.title = `Agent Gateway is ON — ${state.gateway?.servers || 0} local MCP server(s) reachable by the Arena Agent. Click to manage.`;
  }

  let gatewaySetupPrompted = false;

  function maybeGatewaySetupPrompt() {
    if (gatewaySetupPrompted || state.demo) return;
    if (state.gateway?.state !== 'needs_cloudflared') return;
    if (!state.appSettings?.gateway_enabled) return;
    gatewaySetupPrompted = true;
    showCloudflaredInstallModal(() => {
      toast('cloudflared installed — the gateway starts with your next new Agent chat.', 'success', 'Agent Gateway');
    });
  }

  let gatewayWarmAttempted = false;
  let gatewayWasActive = false;

  function maybeWarmGateway() {
    const cfg = state.appSettings || {};
    const wanted = state.mode === 'agent' && state.directTools
      && cfg.gateway_enabled === true && cfg.gateway_auto === true && !state.demo;
    if (!wanted) { gatewayWarmAttempted = false; return; }
    if (state.gateway?.active) { gatewayWasActive = true; gatewayWarmAttempted = true; return; }
    // A session that was live and then stopped (Stop button, idle expiry)
    // must not strand the latch: the next Agent send warms a fresh tunnel.
    if (gatewayWasActive) { gatewayWasActive = false; gatewayWarmAttempted = false; }
    if (gatewayWarmAttempted) return;
    gatewayWarmAttempted = true;
    void API.startGateway().catch(() => undefined); // problems surface via status/JIT
  }

  function estimateHistoryChars() {
    let total = 0;
    for (const turn of state.messages || []) {
      if (!turn) continue;
      const user = turn.user;
      total += String(typeof user === 'string' ? user : (user?.text ?? user?.content ?? '')).length;
      for (const lane of Object.values(turn.lanes || {})) total += String(lane?.text || '').length;
    }
    return total;
  }

  const CONTEXT_MAX_CHARS = 800000;

  function syncCompactChip() {
    const button = els.compactButton;
    if (!button) return;
    const show = Boolean(state.activeChatId) && state.view === 'chat'
      && !['image', 'video'].includes(state.modality)
      && (state.messages || []).length > 0;
    button.hidden = !show;
    if (!show) return;
    const warn = (state.historyChars || 0) >= CONTEXT_WARN_CHARS;
    const chars = Math.max(state.historyChars || 0, estimateHistoryChars());
    const sizeLabel = button.querySelector('.chip-label');
    if (sizeLabel) sizeLabel.textContent = chars >= 1000 ? `Compact · ~${Math.round(chars / 1000)}k` : 'Compact';
    button.classList.toggle('is-warn', warn);
    button.disabled = state.generating;
    if (els.compactDot) els.compactDot.hidden = !warn;
    button.title = warn
      ? `This conversation is ~${Math.round((state.historyChars || 0) / 1000)}k characters and likely close to Arena's context limit. Compact continues it in a fresh session with a summary, so replies keep working.`
      : "Compact: continue this chat in a fresh Arena session with a summary of everything so far. Use it when a long conversation starts returning empty replies.";
    syncContextMeter(chars);
  }

  function syncContextMeter(chars) {
    let meter = document.getElementById('contextMeter');
    if (!meter) {
      meter = el('div', { class: 'context-meter', id: 'contextMeter' });
      const barWrap = el('div', { class: 'context-bar-wrap' });
      const barFill = el('div', { class: 'context-bar-fill', id: 'contextBarFill' });
      barWrap.appendChild(barFill);
      const label = el('span', { class: 'context-bar-label', id: 'contextBarLabel' });
      meter.appendChild(barWrap);
      meter.appendChild(label);
      const toolbar = document.querySelector('.composer-toolbar');
      const spacer = toolbar?.querySelector('.toolbar-spacer');
      if (spacer) spacer.before(meter);
      else if (toolbar) toolbar.appendChild(meter);
    }
    const pct = Math.min(100, Math.round((chars / CONTEXT_MAX_CHARS) * 100));
    const tokens = Math.round(chars / 4);
    const fill = document.getElementById('contextBarFill');
    const label = document.getElementById('contextBarLabel');
    if (fill) {
      fill.style.width = `${Math.max(1, pct)}%`;
      fill.className = 'context-bar-fill' + (pct >= 80 ? ' is-danger' : pct >= 50 ? ' is-warn' : '');
    }
    if (label) {
      label.textContent = tokens >= 1000 ? `~${Math.round(tokens / 1000)}k tokens` : `~${tokens} tokens`;
      label.title = `Context: ~${pct}% used (${Math.round(chars / 1000)}k chars, ~${Math.round(tokens / 1000)}k tokens of ~200k)`;
    }
    meter.hidden = chars < 500;
  }

  function confirmCompact() {
    const chatId = state.activeChatId;
    if (!chatId || state.generating) return;
    const warn = (state.historyChars || 0) >= CONTEXT_WARN_CHARS;
    const lines = [
      warn
        ? `This conversation is about ${Math.round((state.historyChars || 0) / 1000)}k characters and is likely close to Arena's context limit \u2014 that is when replies start coming back empty. Compact keeps you working in this same chat.`
        : "Compact keeps this chat going when Arena's context gets full.",
      "Your next message will open a fresh Arena session, seeded with a summary: the original task, files changed, and the most recent exchanges. The full transcript above stays here; on arena.ai the continuation appears as a new conversation."
    ];
    if (state.workspaceChosen) lines.push("The summary is also appended to MEMORY.md in the selected folder, so future chats in this project inherit it (Settings \u2192 Memory).");
    if (state.mode === 'battle' || state.mode === 'side-by-side') lines.push("Note: after compacting you can no longer vote on the last pair of replies.");
    mountModal({
      title: 'Compact conversation',
      content: el('div', {}, ...lines.map((text) => el('p', { class: 'modal-copy', text }))),
      actions: [
        { label: 'Cancel', variant: 'quiet' },
        { label: 'Compact', variant: 'primary', icon: 'compress', autofocus: true,
          onClick: async () => { await runCompact(chatId); } }
      ]
    });
  }

  async function runCompact(chatId) {
    const result = await API.compactChat(chatId);
    if (String(state.activeChatId) !== String(chatId)) return;
    state.historyChars = Number(result?.history_chars ?? result?.digest_chars ?? 0);
    const notice = result?.notice || "Context compacted \u2014 this conversation continues in a fresh Arena session with a summary of everything above.";
    state.messages.push({ user: null, lanes: {}, notices: [], error: null, round: null, divider: notice });
    renderMessages({ preserveScroll: false });
    syncCompactChip();
    toast(result?.memory_saved
      ? "Compacted. Your next message continues in a fresh session with a summary \u2014 also saved to MEMORY.md in the selected folder."
      : "Compacted. Your next message continues in a fresh session with a summary of everything so far.", 'success', "Compact");
  }

  function renderModeBars() {
    // Arena-style dropdown triggers in the composer toolbar (no segmented
    // bars). The work-type trigger is hidden while Agent Mode is selected.
    const locked = chatLocked();
    const busy = state.generating;
    if (els.modeButton) {
      const meta = modeMeta(state.mode);
      els.modeButton.disabled = busy;
      els.modeButton.title = locked ? 'Change mode' : meta.desc;
      const modeIconNode = els.modeButton.querySelector(':scope > .icon');
      if (modeIconNode) modeIconNode.innerHTML = icon(meta.icon);
    }
    if (els.modalityButton) {
      const hiddenForAgent = state.mode === 'agent';
      els.modalityButton.hidden = hiddenForAgent;
      els.modalityButton.disabled = busy || hiddenForAgent;
      els.modalityButton.title = locked
        ? 'Changing the work type starts a new chat'
        : modalityMeta(state.modality).desc;
    }
  }

  function renderModelStrip() {
    if (!els.modelStrip) return;
    clear(els.modelStrip);
    const mode = state.mode;
    if (mode === 'battle') {
      els.modelStrip.append(
        el('span', { class: 'model-pill' }, el('span', { class: 'lane-letter', text: 'A' }), el('span', { class: 'model-pill-label', text: "Model A" })),
        el('span', { class: 'model-pill' }, el('span', { class: 'lane-letter', text: 'B' }), el('span', { class: 'model-pill-label', text: "Model B" })),
        el('span', { class: 'model-strip-note', text: "Battle selects opponents randomly on the server" })
      );
      return;
    }
    if (mode === 'agent') {
      // Like arena.ai/agent: no model pill and no backend switch in the
      // composer. The Agent backend for NEW chats is chosen in Settings;
      // a started chat keeps the backend it was created with. As on
      // arena.ai, a started Agent chat shows a disabled "Auto" pill whose
      // tooltip says the selection can only change in a new chat.
      if (chatLocked()) {
        els.modelStrip.appendChild(el('span', {
          class: 'model-pill model-pill-locked', 'aria-disabled': 'true', tabindex: '0',
          title: 'Create a new chat to change the mode.'
        }, el('span', { class: 'model-pill-label', text: 'Auto' })));
      }
      return;
    }
    if (state.modelsLoading && !state.models.length) {
      els.modelStrip.appendChild(el('span', { class: 'loading-block' }, el('span', { class: 'mini-spinner' }), el('span', { text: "Loading model list…" })));
      return;
    }
    if (state.modelsError) {
      const retry = el('button', { class: 'model-pill model-pill-error', type: 'button', 'data-action': 'retry-models', title: state.modelsError },
        iconEl('alert'), el('span', { class: 'model-pill-label', text: "Models unavailable · retry" }));
      els.modelStrip.appendChild(retry);
      return;
    }

    const modelButton = (laneKey, modelId) => {
      const model = getModel(modelId);
      const label = model ? model.name : (laneKey === 'b' ? "Select model B" : "Select a model");
      const color = safeColor(model?.color) || '#b9cabd';
      return el('button', {
        class: `model-pill${model ? '' : ' model-pill-empty'}`, type: 'button',
        'data-model-picker': laneKey, 'aria-label': `Select a model ${laneKey.toUpperCase()}: ${label}`,
        disabled: state.generating
      },
        el('span', { class: 'lane-letter', text: laneKey.toUpperCase() }),
        model ? (modelIconNode(model) || el('span', { class: 'model-dot', style: { background: color } })) : el('span', { class: 'model-dot', style: { background: color } }),
        el('span', { class: 'model-pill-label', text: label }),
        iconEl('chevron-down')
      );
    };

    if (mode === 'side-by-side') {
      els.modelStrip.append(modelButton('a', state.modelAId), modelButton('b', state.modelBId));
    } else {
      els.modelStrip.appendChild(modelButton('a', state.modelAId));
    }

    if (state.modelsLoading) {
      els.modelStrip.appendChild(el('span', { class: 'model-strip-note' }, el('span', { class: 'mini-spinner' }), el('span', { text: "Refreshing" })));
    } else if (!state.models.length) {
      els.modelStrip.appendChild(el('span', { class: 'model-strip-note', text: "The server did not return models for this type." }));
    } else if (mode === 'agent') {
      els.modelStrip.appendChild(el('span', { class: 'model-strip-note', text: "Agent actions require permission" }));
    }
  }

  function renderModelsNavCount() {
    if (!els.modelsNavCount) return;
    const manual = allowsManualModels();
    els.modelsNavCount.textContent = manual && state.modelsLoading ? '…' : (manual && state.models.length ? String(state.models.length) : '—');
    if (els.modelsNavBtn) {
      els.modelsNavBtn.disabled = !manual;
      els.modelsNavBtn.title = manual ? "Select a model for the current mode and task type" : "In this mode, model selection is disabled";
      els.modelsNavBtn.setAttribute('aria-disabled', String(!manual));
    }
  }

  function renderComposerContext() {
    if (!els.contextMode) return;
    const isAgent = state.mode === 'agent';
    els.contextMode.textContent = modeMeta(state.mode).label;
    els.contextModality.textContent = modalityMeta(state.modality).label;
    // Like arena.ai, Agent Mode simply has no work-type selector (or label).
    els.contextModality.hidden = isAgent;
    if (els.contextModality.previousElementSibling) els.contextModality.previousElementSibling.hidden = isAgent;
    if (els.contextModel.previousElementSibling) els.contextModel.previousElementSibling.hidden = isAgent;
    els.contextModel.hidden = isAgent;
    if (state.mode === 'battle') {
      els.contextModel.textContent = 'Arena selects 2 models';
    } else if (state.mode === 'side-by-side') {
      els.contextModel.textContent = `${currentModelA()?.name || 'A not selected'} ↔ ${currentModelB()?.name || 'B not selected'}`;
    } else if (!isAgent) {
      els.contextModel.textContent = (state.mode === 'direct' && state.fanoutModels?.length >= 2)
        ? `${state.fanoutModels.length} models · fan-out`
        : (currentModelA()?.name || 'Select a model');
    }
    if (els.contextPending) els.contextPending.hidden = !(state.pendingChanges > 0);
  }

  function updateComposerState() {
    if (!els.prompt) return;
    const meta = modeMeta(state.mode);
    const mod = modalityMeta(state.modality);
    if (els.modeLabel) els.modeLabel.textContent = meta.label;
    if (els.modalityLabel) els.modalityLabel.textContent = mod.label;
    const modalityIconNode = els.modalityButton?.querySelector(':scope > .icon');
    if (modalityIconNode) modalityIconNode.innerHTML = icon(mod.icon);
    const permission = permissionMeta(state.permissionMode);
    if (els.permissionLabel) els.permissionLabel.textContent = permission.short;
    els.permissionButton?.classList.toggle('is-danger', state.permissionMode === 'bypassPermissions');
    els.permissionButton?.setAttribute('title', permission.desc);
    if (els.workspaceLabel) {
      els.workspaceLabel.textContent = state.workspace ? workspaceName() : "Choose folder";
      els.workspaceButton.title = state.workspace || "Working folder not selected";
    }
    renderComposerContext();
    maybeWarmGateway();
    renderModelStrip();
    renderModeBars();
    renderModelsNavCount();

    const text = els.prompt.value.trim();
    const busy = state.generating;
    const transitions = state.pendingChanges > 0;
    const noServer = Boolean(state.serverError) || state.networkOffline;
    const noAuth = state.status && state.authenticated === false;
    let disabledReason = '';
    const rateLimitLeft = Math.max(0, Math.ceil((state.rateLimitUntil - Date.now()) / 1000));
    if (busy) disabledReason = "Wait for the current generation to complete";
    else if (state.stopping) disabledReason = "Stopping generation";
    else if (transitions) disabledReason = "Applying settings";
    else if (noServer) disabledReason = "No connection to the local server";
    else if (state.historyLoading) disabledReason = "Loading dialogue history";
    else if (state.historyError) disabledReason = "History not loaded — please try again";
    else if (!isValidSelection(state.mode, state.modality)) disabledReason = selectionIssue(state.mode, state.modality);
    else if (attachmentsBusy()) disabledReason = "Uploading files…";
    else if (attachmentsFailed()) disabledReason = "Remove the failed file to send";
    else if (noAuth) disabledReason = "First, log in in a separate window or using cookies";
    else if (!text) disabledReason = "Enter a message";
    else if (!requiredModelsReady()) disabledReason = state.modelsLoading ? "Loading models"
      : state.modelsError ? "Models unavailable"
        : "Select a model";
    else if (state.pendingPermissions.some((item) => !item.chatId || String(item.chatId) === String(state.activeChatId))) disabledReason = "First, resolve the permission request in this chat";
    else if (state.generating) disabledReason = "Generation in progress";

    const send = els.sendButton;
    if (send) {
      // While this chat is generating, typed text can be queued instead:
      // Send becomes the queue button next to Stop.
      const canQueue = busy && Boolean(text) && !state.stopping && !state.starting;
      send.disabled = canQueue ? false : (Boolean(disabledReason) || state.starting);
      send.title = canQueue ? "Queue: send when the current answer finishes" : (disabledReason || "Send message");
      send.hidden = busy && !canQueue;
      send.classList.toggle('is-stopping', state.stopping);
    }
    if (els.stopButton) {
      els.stopButton.hidden = !busy;
      els.stopButton.disabled = state.stopping;
      const label = els.stopButton.querySelector('span:last-child');
      if (label) label.textContent = state.stopping ? "Stopping…" : "Stop";
    }
    if (els.attachButton) {
      const allowed = attachmentsAllowedHere();
      els.attachButton.disabled = busy || !allowed;
      els.attachButton.title = allowed ? `Attach files — ${attachmentHint()}` : 'Files cannot be attached in Web Search';
      els.attachButton.setAttribute('aria-label', allowed ? `Attach files. ${attachmentHint()}` : 'Attach files (unavailable in Web Search)');
    }
    if (els.fileInput) els.fileInput.accept = attachmentAccept();
    els.composerCard?.classList.toggle('is-generating', busy);
    els.composerCard?.setAttribute('aria-busy', String(busy));
    els.prompt.setAttribute('aria-label', `Message for models. ${meta.label}, ${mod.label}. ${disabledReason && !text ? disabledReason : ''}`);

    if (els.composerSecondaryHint) {
      if (state.demo) els.composerSecondaryHint.textContent = "Demo: no requests to arena.ai";
      else if (state.pendingChanges) els.composerSecondaryHint.textContent = "Waiting for settings to apply";
      else if (state.remoteBusy) els.composerSecondaryHint.textContent = "Server is busy with the current generation";
      else if (state.serverError) els.composerSecondaryHint.textContent = "No connection with the local server";
      else if (noAuth) els.composerSecondaryHint.textContent = "Not signed in";
      else if (!requiredModelsReady() && state.modelsError) els.composerSecondaryHint.textContent = "Models unavailable";
      else if (state.modelsLoading) els.composerSecondaryHint.textContent = "Loading models";
      else if (allowsManualModels() && !currentModelA()) els.composerSecondaryHint.textContent = "Select a model";
      else if (state.pendingPermissions.length) els.composerSecondaryHint.textContent = "Permission request exists";
      else els.composerSecondaryHint.textContent = "Attachments are not supported by the server";
    }

    syncRateLimitAccountHint(rateLimitLeft);
    renderUsageBar();
    const locked = chatLocked();
    syncWorkspaceSyncToggle();
    syncCompactChip();
    els.modeButton.disabled = busy;
    els.modalityButton.disabled = busy || state.mode === 'agent';
    els.permissionButton.disabled = busy || transitions;
    $$('[data-model-picker]', els.modelStrip || document).forEach((button) => { button.disabled = busy; });
    ensureBypassWarning();
  }

  function updatePendingPermissionsBadge() {
    if (!els.pendingPermissionsBadge) return;
    const count = Math.max(Number(state.permissionCount) || 0, state.pendingPermissions.length)
      + (state.pendingQuestions?.length || 0)
      + ((state.pendingMediaChoices || []).filter(mediaChoiceIsPending).length || 0);
    els.pendingPermissionsBadge.hidden = !count;
    els.pendingPermissionsBadge.textContent = String(count);
    els.pendingPermissionsBadge.title = `Awaiting your decision: ${count}`;
    els.pendingPermissionsBadge.setAttribute('aria-label', `Awaiting your decision: ${count}`);
  }

  function renderPendingPermissionsUI() {
    updatePendingPermissionsBadge();
    updateComposerState();
    if (state.view === 'chat') {
      scheduleChatRender();
    }
  }

  function resizePrompt() {
    if (!els.prompt) return;
    els.prompt.style.height = 'auto';
    const next = clamp(els.prompt.scrollHeight, 50, 190);
    els.prompt.style.height = `${next}px`;
    els.prompt.style.overflowY = els.prompt.scrollHeight > 190 ? 'auto' : 'hidden';
  }

  function resetPromptHeight() {
    if (!els.prompt) return;
    els.prompt.style.height = '';
    els.prompt.style.overflowY = 'hidden';
  }

  /* ---------------------------------------------------------------------- */
  /* Global UI state                                                       */
  /* ---------------------------------------------------------------------- */
  function dotState(node, tone) {
    if (!node) return;
    node.classList.remove('is-online', 'is-pending', 'is-offline', 'is-demo');
    if (tone) node.classList.add(`is-${tone}`);
  }

  function connectionPresentation() {
    if (state.demo) return { tone: 'demo', label: "Demo mode", title: "Demonstration data and events" };
    if (state.networkOffline) return { tone: 'offline', label: "Offline", title: "No network connection" };
    if (state.phase === 'loading' && !state.status) return { tone: 'pending', label: "Server check", title: "Checking local backend" };
    if (state.serverError) return { tone: 'offline', label: "Server unavailable", title: state.serverError };
    if (!state.backendReached) return { tone: 'pending', label: "No data", title: "Server status unknown" };
    if (state.loginPending) return { tone: 'pending', label: "Waiting for sign-in", title: "Complete login in a separate window" };
    if (state.status?.session_error) return { tone: 'offline', label: "Session error", title: String(textValue(state.status.session_error)) };
    if (state.status?.offline) return { tone: 'pending', label: "arena.ai offline", title: "Local backend is available, arena.ai page reports offline" };
    if (state.status && !state.authenticated) return { tone: 'pending', label: "Not signed in", title: "Log in in a separate window or using cookies" };
    return { tone: 'online', label: "Local server", title: "Local backend is available" };
  }

  function updateConnectionUI() {
    const presentation = connectionPresentation();
    const iconTone = presentation.tone === 'offline' ? 'offline' : presentation.tone === 'online' ? 'online' : presentation.tone === 'demo' ? 'demo' : 'pending';
    if (els.footerConnectionText) els.footerConnectionText.textContent = presentation.label;
    dotState(els.footerConnectionDot, iconTone);

    if (els.demoChip) els.demoChip.hidden = !state.demo;
    if (els.demoBanner) els.demoBanner.hidden = !state.demo;
    if (els.connectionBanner) {
      const show = !state.demo && (state.networkOffline || Boolean(state.serverError));
      els.connectionBanner.hidden = !show;
      if (show) {
        if (els.bannerTitle) els.bannerTitle.textContent = state.networkOffline ? "No network connection" : "Local server is unavailable";
        if (els.bannerText) {
          els.bannerText.textContent = state.networkOffline
            ? "The interface works locally, but the network is unavailable. Try again after the connection is restored."
            : (state.serverError || "Launch the Arena Desktop application and try again. Demo mode is available separately.");
        }
        if (els.bannerRetry) els.bannerRetry.disabled = state.retrying || state.networkOffline;
        if (els.bannerDemo) els.bannerDemo.hidden = state.demo;
      }
    }
    if (els.topbarTitle) els.topbarTitle.textContent = currentViewTitle();
  }

  function updateAccountUI() {
    let name;
    let sub;
    let avatarClass = '';
    if (state.demo) {
      name = state.authenticated ? (state.fullName || 'Demo User') : 'Not signed in';
      sub = state.authenticated ? 'Simulation · no tokens' : 'Demo mode';
      avatarClass = 'is-demo';
    } else if (state.authenticated) {
      // Before the arena.ai session finishes starting, show the saved account
      // and "Connecting" instead of a nameless "Connected / Signed in".
      const saved = (state.accounts || []).find((a) => a.id === state.currentAccountId || a.current) || {};
      const email = state.email || saved.email || '';
      name = state.fullName || email || 'arena.ai account';
      sub = engineStarting(state.status) ? 'Connecting to arena.ai…'
        : state.status?.session_error ? 'Session error' : state.status?.offline ? 'arena.ai offline'
        : (email && state.fullName ? email : 'Signed in');
      avatarClass = '';
    } else {
      name = state.serverError ? 'Server unavailable' : 'Not signed in';
      sub = state.serverError ? 'Check the local backend' : state.loginPending ? 'Waiting for sign-in…' : 'Sign in to continue';
      avatarClass = 'is-anonymous';
    }
    if (els.accountName) els.accountName.textContent = name;
    if (els.accountState) els.accountState.textContent = sub;
    if (els.accountAvatar) {
      els.accountAvatar.classList.toggle('is-anonymous', avatarClass === 'is-anonymous');
      els.accountAvatar.classList.toggle('is-demo', avatarClass === 'is-demo');
      if (state.demo && state.authenticated) {
        delete els.accountAvatar.dataset.avatarUrl;
        els.accountAvatar.textContent = 'D';
      } else {
        fillAvatarNode(els.accountAvatar);
      }
    }
    if (els.accountDot) {
      els.accountDot.classList.toggle('is-online', state.authenticated && !state.serverError);
      els.accountDot.classList.toggle('is-error', Boolean(state.serverError) || Boolean(state.status?.session_error));
    }
    if (els.accountButton) {
      els.accountButton.setAttribute('aria-label', `Profile: ${name}. ${sub}. Open accounts`);
      els.accountButton.setAttribute('aria-haspopup', 'menu');
    }
  }

  function updateAllUI() {
    syncWorkspacePanelVisibility();
    updateConnectionUI();
    updateAccountUI();
    updateComposerState();
    renderChats();
    renderModelsNavCount();
    updatePendingPermissionsBadge();
    updateTopbarTitle();
    if (state.view === 'chat') {
      renderChatHead();
      renderChallenge();
    }
  }

  function toast(message, kind = 'info', title = '', action = null) {
    if (!els.toastRoot) return;
    const iconName = kind === 'error' ? 'alert' : kind === 'warning' ? 'shield-alert' : kind === 'success' ? 'check' : 'info';
    const node = el('div', { class: `toast is-${kind}`, role: kind === 'error' ? 'alert' : 'status' });
    const actionButton = action && action.label ? el('button', {
      class: 'button toast-action', type: 'button',
      onclick: async () => { node.remove(); try { await action.run(); } catch (err) { toast(err?.message || String(err), 'error', title); } }
    }, el('span', { text: action.label })) : null;
    node.append(
      iconEl(iconName),
      el('div', { class: 'toast-copy' }, title ? el('strong', { text: title }) : null, el('span', { text: String(message || '') }), actionButton),
      el('button', {
        class: 'icon-button toast-close', type: 'button', 'aria-label': "Dismiss notification",
        onclick: () => node.remove()
      }, iconEl('x'))
    );
    els.toastRoot.appendChild(node);
    const items = $$('.toast', els.toastRoot);
    if (items.length > 3) items.slice(0, items.length - 3).forEach((item) => item.remove());
    window.setTimeout(() => {
      node.style.opacity = '0';
      node.style.transform = 'translateY(4px)';
      window.setTimeout(() => node.remove(), 220);
    }, action ? 20000 : (kind === 'error' ? 7500 : 5000));
  }

  // Offer to install a missing tool (Node.js, Python ...) the moment something needs it.
  const _componentPrompted = new Set();
  function promptComponentInstall(event) {
    const id = String(event?.component || '');
    if (!id || _componentPrompted.has(id)) return;
    _componentPrompted.add(id);
    const name = String(event.name || id);
    toast(`${event.reason || 'A command needs it'}. Install ${name} on this computer?`, 'warning', `${name} is not installed`, {
      label: `Install ${name}`,
      run: async () => {
        const res = await API.installComponent(id);
        if (res?.open_url) window.open(res.open_url, '_blank', 'noopener');
        toast(res?.already ? `${name} is already installed.` : `${name} installer started. Finish it, then retry the command.`, 'info', name);
        _componentPrompted.delete(id);
      }
    });
  }

  function tabNotice(message, kind = 'info', title = '') { toast(message, kind, title); }

  /* ---------------------------------------------------------------------- */
  /* History normalization                                                 */
  /* ---------------------------------------------------------------------- */
  function emptyLane(key, model = null) {
    return {
      modelId: model?.id || null,
      modelName: model?.name || (key === 'b' ? "Model B" : "Model A"),
      modelOrg: model?.org || '',
      modelColor: model?.color || '',
      text: '',
      reasoning: '',
      sources: [],
      media: [],
      mediaChoices: [],
      activities: [],
      permissions: [],
      notices: [],
      errors: [],
      artifacts: [],
      agentStages: [],
      streaming: false,
      done: false,
      stopped: false,
      error: false,
      demo: state.demo
    };
  }

  function normalizeHistory(raw) {
    const messages = Array.isArray(raw) ? raw : (Array.isArray(raw?.messages) ? raw.messages : []);
    const turns = [];
    let current = null;
    let assistantOrdinal = 0;

    const newTurn = (user = null) => {
      current = { user, lanes: {}, notices: [], error: null, round: null };
      turns.push(current);
      assistantOrdinal = 0;
      return current;
    };

    const addLane = (item, keyHint = null) => {
      if (!current) newTurn();
      let key = keyHint;
      if (!key) {
        const explicit = item.lane ?? (item.model === 'a' || item.model === 'b' ? item.model : null);
        if (explicit === 'a' || explicit === 'b') key = explicit;
        else if (state.mode === 'battle' || state.mode === 'side-by-side') key = assistantOrdinal % 2 === 0 ? 'a' : 'b';
        else key = 'a';
      }
      assistantOrdinal += 1;
      if (!current.lanes[key]) {
        const modelById = item.model_id ? getModel(item.model_id) : null;
        let providedName = item.model_name ?? item.name ?? null;
        if (!providedName && item.model && item.model !== 'a' && item.model !== 'b') providedName = item.model;
        current.lanes[key] = emptyLane(key, modelById);
        current.lanes[key].modelName = providedName || modelById?.name || (key === 'b' ? "Model B" : "Model A");
        current.lanes[key].modelOrg = modelById?.org || String(item.org_display ?? item.org ?? '');
        current.lanes[key].modelColor = modelById?.color || safeColor(item.color);
      }
      const lane = current.lanes[key];
      const text = textValue(item.content ?? item.text ?? item.message ?? '');
      if (text) lane.text += `${lane.text ? '\n\n' : ''}${text}`;
      if (item.reasoning) lane.reasoning += textValue(item.reasoning);
      if (Array.isArray(item.sources)) lane.sources.push(...item.sources.map(normalizeSource).filter(Boolean));
      if (Array.isArray(item.media)) lane.media.push(...item.media.map(normalizeMedia).filter(Boolean));
      const rawMediaChoices = item.media_choices ?? item.mediaChoices;
      if (Array.isArray(rawMediaChoices)) rawMediaChoices.forEach((choice) => upsertLaneMediaChoice(lane, choice));
      if (Array.isArray(item.tools)) item.tools.forEach((step) => {
        if (step?.media_choice || step?.mediaChoice) upsertLaneMediaChoice(lane, step.media_choice || step.mediaChoice);
      });
      if (Array.isArray(item.artifacts)) lane.artifacts.push(...item.artifacts.map((artifact) => normalizeArtifact(artifact)).filter(Boolean));
      if (Array.isArray(item.permissions)) lane.permissions.push(...item.permissions.map(normalizePermission).filter(Boolean));
      if (Array.isArray(item.notices)) lane.notices.push(...item.notices.map(textValue).filter(Boolean));
      if (Array.isArray(item.errors)) lane.errors.push(...item.errors.map(textValue).filter(Boolean));
      if (item.error) lane.errors.push(textValue(item.error));
      if (lane.errors.length) lane.error = true;
      lane.demo = lane.demo || Boolean(item.demo);
      lane.done = true;
      return lane;
    };

    for (const item of messages) {
      if (!item || typeof item !== 'object') continue;
      const role = String(item.role ?? item.type ?? '').toLowerCase();
      if (role === 'notice') {
        // Compaction marker: a divider between the old context and the
        // fresh Arena session that follows it.
        turns.push({ user: null, lanes: {}, notices: [], error: null, round: null,
                     divider: textValue(item.text ?? item.content ?? '') });
        current = null;
        assistantOrdinal = 0;
        continue;
      }
      if (role === 'user' || role === 'human') {
        const userText = textValue(item.content ?? item.text ?? item.message);
        const isSystemInjection = userText.startsWith('[Arena Desktop]') || userText.startsWith('[Arena Desktop memory');
        const isToolResult = /^Tool results:\n?\[?\d/m.test(userText);
        const isToolContinue = userText.startsWith('Continue the task.');
        if (isSystemInjection || isToolResult || isToolContinue) {
          if (!current) newTurn();
          current.notices.push(isSystemInjection ? '(system context)' : '(tool exchange)');
          continue;
        }
        newTurn({
          content: userText,
          created_at: item.created_at ?? item.createdAt ?? item.timestamp,
          attachments: normalizeUserAttachments(item.attachments || item.experimental_attachments)
        });
        continue;
      }
      if (role === 'assistant' || role === 'model' || role === 'ai' || (!role && (item.text || item.content))) {
        // The Flask backend persists both replies in a single assistant record.
        const hasBackendLanes = Object.prototype.hasOwnProperty.call(item, 'text_b');
        if (hasBackendLanes) {
          const laneErrors = item.lane_errors && typeof item.lane_errors === 'object' ? item.lane_errors : null;
          addLane({
            ...item,
            errors: Array.isArray(laneErrors?.a) ? laneErrors.a : item.errors,
            // A combined record's plain `error` is a whole-turn failure; do
            // not attribute it to Model A on reload.
            error: null,
            model_name: item.names?.a || item.model_name
          }, 'a');
          if (item.text_b || state.mode === 'battle' || state.mode === 'side-by-side') {
            addLane({
              ...item,
              content: undefined,
              text: item.text_b || '',
              reasoning: item.reasoning_b || '',
              sources: undefined,
              media: undefined,
              media_choices: undefined,
              mediaChoices: undefined,
              tools: undefined,
              artifacts: undefined,
              permissions: undefined,
              notices: undefined,
              errors: Array.isArray(laneErrors?.b) ? laneErrors.b : undefined,
              model_name: item.names?.b || null,
              error: null
            }, 'b');
          }
          if (item.error) current.error = textValue(item.error);
          current.msgEnd = messages.indexOf(item);
          if (item.checkpoints) current.checkpoints = item.checkpoints;
          current.vote = item.vote || null;
          current.arenaIds = item.arena_message_ids || null;
          current.revealed = Boolean(item.names?.a || item.names?.b);
          for (const step of (Array.isArray(item.tools) ? item.tools : [])) {
            const key = step.lane === 'b' ? 'b' : 'a';
            const lane = current.lanes[key] || (current.lanes[key] = emptyLane(key));
            const stepDetail = step.tool === 'ask_user' && step.question
              ? `${step.question}${step.answer ? `\n\u2192 ${step.answer}` : ''}`
              : (step.tool === 'propose_plan' && step.plan
                ? `${step.plan}${step.answer ? `\n\u2192 ${step.answer}` : ''}`
                : step.summary);
            const stepName = step.tool === 'ask_user' ? 'Question'
              : (step.tool === 'propose_plan' ? 'Plan'
                : (step.tool === 'generate_image' ? 'Generate image'
                  : (step.tool === 'set_todos' ? 'Checklist' : step.name)));
            const activity = normalizeActivity({ ...step, name: stepName, detail: stepDetail, status: step.status || (step.ok ? 'ok' : 'error') }, 'tool');
            if (activity) lane.activities.push(activity);
            if (step.media_choice || step.mediaChoice) {
              upsertLaneMediaChoice(lane, step.media_choice || step.mediaChoice);
            }
            if (step.tool === 'set_todos' && Array.isArray(step.todos) && step.todos.length) {
              const hid = String(raw?.chat_id || raw?.id || state.activeChatId || '');
              if (hid) state.chatTodos[hid] = step.todos;
            }
          }
          for (const step of (Array.isArray(item.sandbox) ? item.sandbox : [])) {
            const key = step.model === 'b' ? 'b' : 'a';
            const lane = current.lanes[key] || (current.lanes[key] = emptyLane(key));
            const activity = normalizeActivity({ ...step, status: step.ok === false ? 'error' : (step.ok === true ? 'done' : 'running') }, 'sandbox');
            if (activity) lane.activities.push(activity);
          }
          // Site previews (arena.site links) saved with the reply.
          if (Array.isArray(item.previews) && item.previews.length) {
            const lane = current.lanes.a || (current.lanes.a = emptyLane('a'));
            item.previews.forEach((url) => {
              const artifact = normalizeArtifact({ url, title: 'Site preview', name: 'Site preview' }, 'preview');
              if (artifact) lane.artifacts.push(artifact);
            });
          }
        } else {
          addLane(item);
          if (current) {
            current.msgEnd = messages.indexOf(item);
            if (item.checkpoints) current.checkpoints = item.checkpoints;
          }
        }
        continue;
      }
      if (role === 'system') {
        if (!current) newTurn();
        current.notices.push(textValue(item.content ?? item.text ?? item.message));
        continue;
      }
      if (role === 'tool') {
        if (!current) newTurn();
        addLane(item);
      }
    }

    const artifacts = [];
    turns.forEach((turn) => {
      Object.entries(turn.lanes).forEach(([laneKey, lane]) => {
        lane.artifacts.forEach((artifact) => {
          artifacts.push({ ...artifact, chatId: state.activeChatId, lane: laneKey });
        });
      });
    });
    state.artifacts = artifacts;
    return turns;
  }

  /* ---------------------------------------------------------------------- */
  /* Chat navigation and empty/error states                                */
  /* ---------------------------------------------------------------------- */
  async function openChat(chatId, { retry = false, skipRefresh = false } = {}) {
    if (!chatId) return;
    if (state.creatingChat) return;
    closePopover(false);
    closeMobileSidebar();
    if (String(state.activeChatId) !== String(chatId)) stashActiveTurns();
    saveComposerDraft();
    markChatSeen(chatId);
    const known = state.chats.find((chat) => chat.id === String(chatId));
    state.activeChatId = String(chatId);
    state.activeChatEvalId = known?.eval_id || null;
    state.activeChatSource = known?.source || 'local';
    restoreComposerDraft();
    syncGenerationState();
    const historyToken = (state.historyRequest || 0) + 1;
    state.historyRequest = historyToken;
    state.activeChatTitle = known?.title || (retry ? state.activeChatTitle : "Conversation");
    state.messages = [];
    state.artifacts = [];
    state.challenge = null;
    state.historyError = null;
    state.historyLoading = true;
    state.view = 'chat';
    renderChats();
    renderChatHead();
    renderChallenge();
    renderMessages({ preserveScroll: false });
    setView('chat');
    if (els.content) els.content.scrollTop = 0;

    try {
      const chatRaw = await API.getChat(chatId);
      if (historyToken !== state.historyRequest || String(state.activeChatId) !== String(chatId)) return;
      const chat = normalizeChat(chatRaw);
      if (chat) {
        state.activeChatTitle = chat.title || state.activeChatTitle;
        state.activeChatEvalId = chat.eval_id || chat.raw?.eval_id || null;
        state.activeChatSource = chat.source || 'local';
        const selection = normalizeSelection(chat.mode || state.mode, chat.modality || state.modality);
        state.mode = selection.mode;
        state.modality = selection.modality;
        state.selectionTouched = true;
        if (chat.agent_backend) state.agentKind = chat.agent_backend === 'arena' ? 'native' : 'local';
        // Each chat keeps the folder it worked in. Opening it switches back to
        // that folder, so "continue" never runs in the folder of whichever
        // chat was opened last.
        const chatFolder = typeof chat.raw?.workspace === 'string' ? chat.raw.workspace : '';
        if (chatFolder && chatFolder !== state.workspace && !chatIsGenerating(chatId)) {
          applyWorkspacePath(chatFolder)
            .then(() => toast(`Folder: ${chatFolder}`, 'info', "Switched to this chat's folder"))
            .catch(() => toast(`This chat worked in ${chatFolder}, which is not available now.`, 'warning', 'Folder missing'));
        }
        state.historyChars = Number(chat.raw?.history_chars || 0);
        // Restore manual selections saved by Flask only in modes where Arena
        // permits them.  Battle ignores ids and Agent never exposes one.
        if (allowsManualModels()) {
          if (Object.prototype.hasOwnProperty.call(chat.raw, 'model_a')) state.modelAId = chat.raw.model_a || null;
          if (Object.prototype.hasOwnProperty.call(chat.raw, 'model_b')) state.modelBId = chat.raw.model_b || null;
        } else {
          state.modelAId = null;
          state.modelBId = null;
        }
        const existing = state.chats.find((item) => item.id === chat.id);
        if (existing) Object.assign(existing, chat);
      }
      if (state.modelsMode !== state.mode || state.modelsModality !== state.modality
        || ((allowsManualModels() || state.mode === 'agent') && !state.models.length)) {
        void loadModels(state.modality, { quiet: true });
      } else {
        ensureModelSelections();
      }
      updateComposerState();
      const liveTurns = chatIsGenerating(chatId) ? state.chatTurns[String(chatId)] : null;
      if (Array.isArray(liveTurns) && liveTurns.length) {
        // This chat is generating right now: keep showing the live stream
        // instead of the server's last saved snapshot.
        state.messages = liveTurns;
      } else {
        const historyRaw = await API.getHistory();
        if (historyToken !== state.historyRequest || String(state.activeChatId) !== String(chatId)) return;
        state.messages = normalizeHistory(historyRaw);
        state.chatTurns[String(chatId)] = state.messages;
      }
      state.historyError = null;
      state.historyLoading = false;
      flushQueuedMessage(chatId);
      state.activeChatTitle = state.activeChatTitle || "Conversation";
      renderChats();
      updateTopbarTitle();
      renderChatHead();
      updateComposerState();
      renderMessages({ preserveScroll: false });
      syncGenerationState();
      void loadQuestions();
      void loadMediaChoices();
      if (!skipRefresh && state.activeChatEvalId && !chatIsGenerating(chatId)) {
        void refreshActiveChat({ silent: true, automatic: true });
      }
      announce(`Dialog “${state.activeChatTitle}” loaded.`);
    } catch (error) {
      if (historyToken !== state.historyRequest) return;
      state.historyLoading = false;
      state.historyError = errorMessage(error);
      updateComposerState();
      renderMessages({ preserveScroll: false });
      toast(state.historyError, 'error', "Dialog not loaded");
    }
  }

  async function createNewChat({ focus = true } = {}) {
    if (state.creatingChat) return null;
    if (state.serverError || state.networkOffline) {
      toast("Local server unavailable. New chat not created.", 'error', "No connection");
      return null;
    }
    state.creatingChat = true;
    els.newChatBtn?.classList.add('is-spinning');
    els.newChatBtn?.setAttribute('aria-busy', 'true');
    try {
      const raw = await API.newChat();
      const chatId = raw?.chat_id ?? raw?.id ?? raw?.chat?.id;
      if (!chatId) throw new ApiError("The server did not return the new chat ID.");
      stashActiveTurns();
      saveComposerDraft();
      state.activeChatId = String(chatId);
      state.activeChatEvalId = null;
      state.activeChatSource = 'local';
      restoreComposerDraft();
      state.activeChatTitle = String(raw?.title ?? raw?.chat?.title ?? "New chat");
      state.messages = [];
      state.artifacts = [];
      state.historyError = null;
      state.historyLoading = false;
      state.challenge = null;
      state.view = 'chat';
      renderChatArea();
      syncGenerationState();
      closeMobileSidebar();
      void loadChats({ silent: true });
      if (focus) window.setTimeout(focusComposer, 20);
      announce("New chat created.");
      return state.activeChatId;
    } catch (error) {
      toast(errorMessage(error), 'error', "New chat not created");
      return null;
    } finally {
      state.creatingChat = false;
      els.newChatBtn?.classList.remove('is-spinning');
      els.newChatBtn?.removeAttribute('aria-busy');
      updateComposerState();
      updateTopbarTitle();
    }
  }

  function confirmDeleteChat(chatId) {
    const chat = state.chats.find((item) => item.id === String(chatId));
    if (!chat) return;
    const error = el('p', { class: 'form-error', role: 'alert' });
    const result = mountModal({
      title: "Delete chat?",
      subtitle: "Action confirmation",
      size: 'small',
      content: el('div', {},
        el('p', { class: 'modal-copy', text: `Chat “${chat.title}” will be deleted here and archived on arena.ai, so it disappears from both histories. This cannot be undone here.` }),
        el('div', { class: 'note-box is-warning' }, iconEl('alert'), el('span', { text: "Archived chats can still be found under Archived on arena.ai." })),
        error),
      actions: [
        { label: "Cancel", variant: 'quiet', autofocus: true },
        {
          label: "Delete", variant: 'danger',
          onClick: async ({ button }) => {
            button.disabled = true;
            try {
              const outcome = await API.deleteChat(chatId);
              state.chats = state.chats.filter((item) => item.id !== String(chatId));
              state.cloudChats = (state.cloudChats || []).filter((item) =>
                String(item.local_chat_id || '') !== String(chatId)
                && (!chat.eval_id || String(item.eval_id || item.id || '') !== String(chat.eval_id)));
              if (String(state.activeChatId) === String(chatId)) {
                state.activeChatId = null;
                state.activeChatTitle = '';
                state.messages = [];
                state.artifacts = [];
                state.historyError = null;
                state.historyLoading = false;
                state.challenge = null;
                updateArtifactCount();
                renderWelcomeState();
                updateComposerState();
              }
              renderChats();
              if (outcome?.arena === 'archived') {
                toast(`Chat “${chat.title}” deleted and archived on Arena.`, 'success');
              } else if (outcome?.arena === 'failed' || outcome?.arena === 'skipped') {
                toast(outcome.arena_error || 'Deleted here, but it could not be archived on Arena.', 'warning', 'Deleted here only');
              } else {
                toast(`Chat “${chat.title}” deleted.`, 'success');
              }
              void loadChats({ silent: true });
              return true;
            } catch (apiError) {
              error.textContent = errorMessage(apiError);
              button.disabled = false;
              return false;
            }
          }
        }
      ]
    });
    return result;
  }

  function confirmArchiveCloudChat(entry) {
    if (!entry) return;
    const sessionId = entry.eval_id || entry.id;
    const error = el('p', { class: 'form-error', role: 'alert' });
    return mountModal({
      title: "Delete chat?",
      subtitle: "Action confirmation",
      size: 'small',
      content: el('div', {},
        el('p', { class: 'modal-copy', text: `Chat “${entry.title}” will be archived on arena.ai and disappear from the history here and on the website.` }),
        el('div', { class: 'note-box is-warning' }, iconEl('alert'), el('span', { text: "Archived chats can still be found under Archived on arena.ai." })),
        error),
      actions: [
        { label: "Cancel", variant: 'quiet', autofocus: true },
        {
          label: "Delete", variant: 'danger',
          onClick: async ({ button }) => {
            button.disabled = true;
            try {
              await API.archiveArenaChat(sessionId, entry.type || 'evaluation');
              state.cloudChats = (state.cloudChats || []).filter((item) =>
                String(item.eval_id || item.id || '') !== String(sessionId));
              renderChats();
              toast(`Chat “${entry.title}” archived on Arena.`, 'success');
              void loadChats({ silent: true });
              return true;
            } catch (apiError) {
              error.textContent = errorMessage(apiError);
              button.disabled = false;
              return false;
            }
          }
        }
      ]
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Mode, modality and permission transitions                             */
  /* ---------------------------------------------------------------------- */
  function queueTransition(task) {
    state.pendingChanges += 1;
    updateComposerState();
    const run = state.transitionQueue.then(task);
    state.transitionQueue = run.then(() => undefined, () => undefined).finally(() => {
      state.pendingChanges = Math.max(0, state.pendingChanges - 1);
      updateComposerState();
    });
    return run;
  }

  async function changeMode(nextMode) {
    if (!VALID_MODES.includes(nextMode) || nextMode === state.mode) return true;
    if (state.generating) {
      toast('Stop the current generation first.', 'warning', 'Mode not changed');
      return false;
    }
    // Like arena.ai: choosing another mode inside a started chat opens a
    // new chat in that mode; the started chat stays as it was.
    if (chatLocked() && !(await createNewChat())) return false;
    // Picking a mode never requires fixing the work type first. Agent runs
    // as Text with the work-type selector hidden; leaving Agent restores
    // the work type that was selected before it.
    const beforeModality = state.modality;
    if (nextMode === 'agent' && state.mode !== 'agent') state.savedModality = state.modality;
    const desiredModality = state.mode === 'agent' && nextMode !== 'agent'
      ? (state.savedModality || state.modality)
      : state.modality;
    const pair = normalizeSelection(nextMode, desiredModality);
    try {
      await queueTransition(async () => {
        const response = await API.setMode(nextMode);
        state.mode = validMode(response?.mode) || pair.mode;
        const responseModality = validModality(response?.modality);
        state.modality = responseModality || beforeModality;
        if (pair.modality !== state.modality) {
          // The mode endpoint normalizes against the backend's current
          // modality (Text while Agent was active). Restoring the saved
          // pre-Agent work type is a second, explicit step.
          const modalityResponse = await API.setModality(pair.modality);
          state.modality = validModality(modalityResponse?.modality) || pair.modality;
        }
        state.selectionTouched = true;
        state.modelAId = null;
        state.modelBId = null;
        await loadModels(state.modality, { quiet: true });
      });
      ensureModelSelections();
      pruneAttachmentsForSelection();
      updateComposerState();
      renderChatHead();
      renderModelStrip();
      announce(`Mode: ${modeMeta(state.mode).label}`);
      return true;
    } catch (error) {
      toast(errorMessage(error), 'error', 'Could not change the mode');
      updateComposerState();
      return false;
    }
  }

  async function changeModality(nextModality) {
    if (!VALID_MODALITIES.includes(nextModality) || nextModality === state.modality) return true;
    if (state.mode === 'agent') return true; // no work-type selector in Agent Mode
    const issue = selectionIssue(state.mode, nextModality);
    if (issue) {
      toast(issue, 'warning', 'Combination not available in Arena');
      return false;
    }
    if (state.generating) {
      toast('Stop the current generation first.', 'warning', 'Work type not changed');
      return false;
    }
    if (chatLocked()) {
      // arena.ai asks first, then opens a new chat for the new modality.
      mountModal({
        title: 'Start new chat session?',
        size: 'small',
        content: el('p', { class: 'modal-copy',
          text: 'Changing modalities will start a new chat session. Your current session will be saved in your chat history.' }),
        actions: [
          { label: 'Cancel', variant: 'quiet' },
          { label: 'Continue', variant: 'primary', autofocus: true,
            onClick: async () => {
              if (await createNewChat()) await changeModality(nextModality);
            } }
        ]
      });
      return false;
    }
    const previous = state.modality;
    let serverChanged = false;
    try {
      await queueTransition(async () => {
        const response = await API.setModality(nextModality);
        serverChanged = true;
        state.modality = validModality(response?.modality) || nextModality;
        state.selectionTouched = true;
        state.modelAId = null;
        state.modelBId = null;
        await loadModels(state.modality, { quiet: true });
      });
      state.savedModality = state.modality;
      pruneAttachmentsForSelection();
      updateComposerState();
      renderChatHead();
      announce(`Work type: ${modalityMeta(state.modality).label}`);
      return true;
    } catch (error) {
      if (!serverChanged) state.modality = previous;
      updateComposerState();
      toast(errorMessage(error), 'error', 'Could not change the work type');
      return false;
    }
  }

  async function changePermissionMode(nextMode) {
    if (!VALID_PERMISSION_MODES.includes(nextMode) || nextMode === state.permissionMode) return true;
    try {
      await queueTransition(async () => {
        const response = await API.setPermissionMode(nextMode);
        state.permissionMode = validPermissionMode(response?.mode) || nextMode;
      });
      if (state.permissionMode === 'bypassPermissions') {
        toast("Permission bypass enabled. The backend can perform actions without confirmation. Use only in an isolated environment.", 'warning', "Dangerous mode");
      } else {
        toast(`Permission mode: ${permissionMeta(state.permissionMode).label}.`, 'success');
      }
      updateComposerState();
      state.settingsRerender?.();
      return true;
    } catch (error) {
      toast(errorMessage(error), 'error', "Permission mode not changed");
      state.settingsRerender?.();
      return false;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Model selection                                                       */
  /* ---------------------------------------------------------------------- */
  const RECENT_MODELS_KEY = 'arena-recent-models-v1';

  function recentModelIds() {
    try {
      const raw = JSON.parse(localStorage.getItem(RECENT_MODELS_KEY) || '[]');
      return Array.isArray(raw) ? raw.map(String) : [];
    } catch { return []; }
  }

  function noteRecentModel(id) {
    if (id == null) return;
    try {
      const ids = [String(id), ...recentModelIds().filter((x) => x !== String(id))].slice(0, 6);
      localStorage.setItem(RECENT_MODELS_KEY, JSON.stringify(ids));
    } catch { /* storage unavailable */ }
  }

  function selectModel(lane, modelId) {
    if (!allowsManualModels()) return false;
    // Direct and Side by Side may swap models between messages on arena.ai.
    const model = getModel(modelId);
    if (!model) return false;
    if (lane === 'b') {
      if (String(modelId) === String(state.modelAId)) {
        toast("For comparison, select a model different from model A.", 'warning', "Two different models required");
        return false;
      }
      state.modelBId = modelId;
    } else {
      state.modelAId = modelId;
    }
    if (state.mode === 'side-by-side' && lane === 'a' && String(state.modelBId) === String(modelId)) {
      const candidate = state.models.find((item) => String(item.id) !== String(modelId));
      state.modelBId = candidate?.id || null;
    }
    noteRecentModel(modelId);
    updateComposerState();
    renderChatHead();
    announce(`Model ${lane.toUpperCase()}: ${model.name}`);
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* Permission decisions                                                  */
  /* ---------------------------------------------------------------------- */
  function findPermissionLane(id) {
    if (!id) return null;
    for (const turn of state.messages) {
      for (const lane of Object.values(turn.lanes || {})) {
        const permission = (lane.permissions || []).find((item) => String(item.id) === String(id));
        if (permission) return { turn, lane, permission };
      }
    }
    return null;
  }

  async function decidePermission(permissionId, decision) {
    if (!permissionId) {
      toast("The server did not provide a permission ID. Action unavailable.", 'error');
      return;
    }
    if (state.decidingPermissions.has(String(permissionId))) return;
    const local = state.pendingPermissions.find((item) => String(item.id) === String(permissionId));
    const located = findPermissionLane(permissionId);
    if (!local && !located) return;
    state.decidingPermissions.add(String(permissionId));
    renderPendingPermissionsUI();
    if (state.view === 'chat') renderMessages();
    try {
      await API.decidePermission(permissionId, decision);
      const laneRecord = located || findPermissionLane(permissionId);
      if (laneRecord?.lane) {
        const permission = laneRecord.permission || laneRecord.lane.permissions.find((item) => String(item.id) === String(permissionId));
        if (permission) permission.status = decision;
      }
      state.pendingPermissions = state.pendingPermissions.filter((item) => String(item.id) !== String(permissionId));
      state.permissionCount = state.pendingPermissions.length;
      const label = decision === 'deny' ? "Action denied." : decision === 'always' ? "Category allowed for the current session." : "Allowed once.";
      toast(label, decision === 'deny' ? 'warning' : 'success', "Permission decision");
      announce(label);
    } catch (error) {
      toast(errorMessage(error), 'error', "Decision not sent");
    } finally {
      state.decidingPermissions.delete(String(permissionId));
      renderPendingPermissionsUI();
      if (state.view === 'chat') renderMessages();
      state.settingsRerender?.();
    }
  }

  /* ---------------------------------------------------------------------- */