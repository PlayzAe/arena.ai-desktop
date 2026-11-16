  /* ---------------------------------------------------------------------- */
  function cacheElements() {
    els.app = $('#app');
    els.sidebar = $('#sidebar');
    els.collapseSidebar = $('#collapseSidebar');
    els.newChatBtn = $('#newChatBtn');
    els.modelsNavBtn = $('#modelsNavBtn');
    els.modelsNavCount = $('#modelsNavCount');
    els.searchNavBtn = $('#searchNavBtn');
    els.workspacePanelNavBtn = $('#workspacePanelNavBtn');
    els.connectorsNavBtn = $('#connectorsNavBtn');
    els.connectorsNavCount = $('#connectorsNavCount');
    els.recentsToggle = $('#recentsToggle');
    els.recentsBody = $('#recentsBody');
    els.chatCount = $('#chatCount');
    els.refreshChats = $('#refreshChats');
    els.chatSearchWrap = $('#chatSearchWrap');
    els.chatSearch = $('#chatSearch');
    els.clearChatSearch = $('#clearChatSearch');
    els.chatList = $('#chatList');
    els.accountButton = $('#accountButton');
    els.accountAvatar = $('#accountAvatar');
    els.accountName = $('#accountName');
    els.accountState = $('#accountState');
    els.accountDot = $('#accountDot');
    els.sidebarScrim = $('#sidebarScrim');
    els.mobileMenuBtn = $('#mobileMenuBtn');
    els.topbarTitle = $('#topbarTitle');
    els.crumbTitle = $('.crumb-title');
    els.demoChip = $('#demoChip');
    els.workspacePanelTopButton = $('#workspacePanelTopButton');
    els.engineTopButton = $('#engineTopButton');
    els.connectionBanner = $('#connectionBanner');
    els.bannerTitle = $('#bannerTitle');
    els.bannerText = $('#bannerText');
    els.bannerRetry = $('#bannerRetry');
    els.bannerDemo = $('#bannerDemo');
    els.demoBanner = $('#demoBanner');
    els.demoExitBtn = $('#demoExitBtn');
    els.footerConnectionDot = $('#footerConnectionDot');
    els.footerConnectionText = $('#footerConnectionText');
    els.content = $('#content');
    els.welcomeView = $('#welcomeView');
    els.chatView = $('#chatView');
    els.chatEyebrow = $('#chatEyebrow');
    els.chatTitle = $('#chatTitle');
    els.chatMeta = $('#chatMeta');
    els.chatSettingsButton = $('#chatSettingsButton');
    els.challengeSlot = $('#challengeSlot');
    els.messageList = $('#messageList');
    els.composerForm = $('#composerForm');
    els.composerCard = $('.composer-card');
    els.usageBarWrap = $('#usageBarWrap');
    els.usageBarFill = $('#usageBarFill');
    els.usageBarLabel = $('#usageBarLabel');
    els.composerShell = $('.composer-shell');
    els.welcomeComposerSlot = $('#welcomeComposerSlot');
    els.mainArea = $('.main-area');
    els.prompt = $('#prompt');
    els.attachButton = $('#attachButton');
    els.fileInput = $('#fileInput');
    els.attachmentStrip = $('#attachmentStrip');
    els.dropOverlay = $('#dropOverlay');
    els.modelStrip = $('#modelStrip');
    els.modeBar = $('#modeBar');
    els.modalityBar = $('#modalityBar');
    els.composerContext = $('#composerContext');
    els.contextMode = $('#contextMode');
    els.contextModality = $('#contextModality');
    els.contextModel = $('#contextModel');
    els.contextPending = $('#contextPending');
    els.workspaceButton = $('#workspaceButton');
    els.workspaceLabel = $('#workspaceLabel');
    els.modeButton = $('#modeButton');
    els.modeLabel = $('#modeLabel');
    els.modalityButton = $('#modalityButton');
    els.modalityLabel = $('#modalityLabel');
    els.sidebarResize = $('#sidebarResize');
    els.workspaceResize = $('#workspaceResize');
    els.workspaceSplitResize = $('#workspaceSplitResize');
    els.permissionButton = $('#permissionButton');
    els.workspaceSyncChip = $('#workspaceSyncChip');
    els.workspaceSyncToggle = $('#workspaceSyncToggle');
    els.compactButton = $('#compactButton');
    els.gatewayChip = $('#gatewayChip');
    els.compactDot = $('#compactDot');
    els.permissionLabel = $('#permissionLabel');
    els.pendingPermissionsBadge = $('#pendingPermissionsBadge');
    els.sendButton = $('#sendButton');
    els.stopButton = $('#stopButton');
    els.composerHint = $('#composerHint');
    els.composerSecondaryHint = $('#composerSecondaryHint');
    els.workspacePanel = $('#workspacePanel');
    els.workspacePanelRoot = $('#workspacePanelRoot');
    els.workspacePanelClose = $('#workspacePanelClose');
    els.workspaceTree = $('#workspaceTree');
    els.workspaceOpenButton = $('#workspaceOpenButton');
    els.workspaceRunButton = $('#workspaceRunButton');
    els.workspaceRunStatus = $('#workspaceRunStatus');
    els.workspaceRefreshButton = $('#workspaceRefreshButton');
    els.connectorsPane = $('#connectorsPane');
    els.connectorList = $('#connectorList');
    els.addConnectorButton = $('#addConnectorButton');
    els.openMcpJsonButton = $('#openMcpJsonButton');
    els.reloadConnectorsButton = $('#reloadConnectorsButton');
    els.dockPane = $('#dockPane');
    els.dockTitle = $('#dockTitle');
    els.dockSubtitle = $('#dockSubtitle');
    els.dockCloseButton = $('#dockCloseButton');
    els.dockRefreshButton = $('#dockRefreshButton');
    els.dockHideButton = $('#dockHideButton');
    els.dockDescription = $('#dockDescription');
    els.dockNote = $('#dockNote');
    els.popoverRoot = $('#popoverRoot');
    els.modalRoot = $('#modalRoot');
    els.toastRoot = $('#toastRoot');
    els.liveRegion = $('#liveRegion');
    els.helpButton = $('#helpTopButton');
  }

  function ensureBypassWarning() {
    if (!els.composerContext || !els.composerContext.parentNode) return null;
    let warning = $('#permissionDangerBanner');
    if (!warning) {
      warning = el('div', { class: 'composer-warning', id: 'permissionDangerBanner', role: 'alert', hidden: true });
      warning.append(iconEl('shield-alert'), el('span', { text: "Permission bypass enabled: backend can perform actions without confirmation. This is dangerous outside an isolated environment." }));
      els.composerContext.insertAdjacentElement('afterend', warning);
    }
    warning.hidden = state.permissionMode !== 'bypassPermissions';
    return warning;
  }

  function restoreSidebarPreference() {
    try {
      const stored = localStorage.getItem('arenaPersonal.sidebarCollapsed.v4');
      if (stored === '1') setSidebarCollapsed(true);
      else setSidebarCollapsed(false);
    } catch {
      setSidebarCollapsed(false);
    }
  }

  function setupNativeBridge() {
    const markReady = () => {
      const api = window.pywebview?.api;
      if (!api) return;
      if (state.nativeReady) return;
      state.nativeReady = true;
      if (state.settingsTab === 'workspace') state.settingsRerender?.();
      announce("Native pywebview integration is ready. Folder selection is available.");
    };
    window.addEventListener('pywebviewready', markReady);
    document.addEventListener('pywebviewready', markReady);
    if (window.pywebview?.api) window.setTimeout(markReady, 0);
  }

  function bindEvents() {
    els.composerForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      void sendMessage();
    });
    els.prompt?.addEventListener('input', () => {
      state.draft = els.prompt.value;
      saveComposerDraft();
      resizePrompt();
      updateComposerState();
    });
    document.addEventListener('pointerdown', primeDoneAudio);
    document.addEventListener('keydown', primeDoneAudio);
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey
        && event.key.toLowerCase() === 'f' && state.view === 'chat') {
        event.preventDefault();
        toggleFindBar();
      }
    });
    els.prompt?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      void sendMessage();
    });
    els.prompt?.addEventListener('focus', () => {
      els.prompt?.parentElement?.classList.add('is-focused');
    });
    els.prompt?.addEventListener('blur', () => {
      els.prompt?.parentElement?.classList.remove('is-focused');
    });

    els.newChatBtn?.addEventListener('click', () => { void createNewChat(); });
    els.collapseSidebar?.addEventListener('click', () => setSidebarCollapsed(!state.sidebarCollapsed));
    els.mobileMenuBtn?.addEventListener('click', () => {
      if (els.app?.classList.contains('mobile-sidebar-open')) closeMobileSidebar();
      else openMobileSidebar();
    });
    els.sidebarScrim?.addEventListener('click', closeMobileSidebar);
    els.refreshChats?.addEventListener('click', async () => {
      if (state.chatsLoading) return;
      els.refreshChats.classList.add('is-spinning');
      await loadChats();
      els.refreshChats.classList.remove('is-spinning');
    });
    els.recentsToggle?.addEventListener('click', () => {
      const expanded = els.recentsToggle.getAttribute('aria-expanded') !== 'false';
      els.recentsToggle.setAttribute('aria-expanded', String(!expanded));
      els.recentsBody.hidden = expanded;
    });
    els.searchNavBtn?.addEventListener('click', () => {
      setChatSearchVisible(true);
      if (els.recentsToggle.getAttribute('aria-expanded') === 'false') {
        els.recentsToggle.setAttribute('aria-expanded', 'true');
        els.recentsBody.hidden = false;
      }
    });
    els.modelsNavBtn?.addEventListener('click', () => {
      if (!allowsManualModels()) {
        toast("In this mode, model selection is disabled.", 'info');
        return;
      }
      if (state.generating) {
        toast("Models can be changed after generation is complete.", 'info');
        return;
      }
      openModelPicker('a', els.modelsNavBtn);
    });
    els.chatSearch?.addEventListener('input', () => {
      state.chatFilter = els.chatSearch.value;
      els.clearChatSearch.hidden = !state.chatFilter;
      renderChats();
      window.clearTimeout(state._searchTimer);
      const q = state.chatFilter.trim();
      if (q.length >= 2) {
        state._searchTimer = window.setTimeout(async () => {
          try {
            const hits = await API.searchChats(q);
            if (state.chatFilter.trim() === q) {
              state.searchResults = Array.isArray(hits) ? hits : [];
              renderChats();
            }
          } catch { /* server offline: title filter still works */ }
        }, 300);
      } else if (state.searchResults.length) {
        state.searchResults = [];
      }
    });
    initJumpPill();
    window.__quickAsk = (text) => {
      const t = String(text || '').trim();
      if (!t) return;
      const begin = () => {
        if (els.prompt) { els.prompt.value = t; updateComposerState(); void sendMessage(); }
      };
      Promise.resolve(createNewChat({ focus: false })).then(begin).catch(begin);
    };
    els.clearChatSearch?.addEventListener('click', () => {
      if (!els.chatSearch) return;
      els.chatSearch.value = '';
      state.chatFilter = '';
      els.clearChatSearch.hidden = true;
      els.chatSearch.focus();
      renderChats();
    });
    els.accountButton?.addEventListener('click', () => openAccountMenu());
    els.bannerRetry?.addEventListener('click', () => { void retryConnection(); });
    els.demoExitBtn?.addEventListener('click', () => { window.location.href = window.location.pathname; });
    els.bannerDemo?.addEventListener('click', () => { /* Navigation to ?demo=1 is the explicit opt-in. */ });

    els.workspaceButton?.addEventListener('click', () => openWorkspacePopover(els.workspaceButton));
    els.workspaceOpenButton?.addEventListener('click', () => { void openWorkspaceFolder(state.workspacePanelRoot || state.workspace); });
    els.workspaceRunButton?.addEventListener('click', () => { void startRunLocal(); });
    els.workspaceRefreshButton?.addEventListener('click', async () => {
      els.workspaceRefreshButton.classList.add('is-spinning');
      try { await loadWorkspaceTree('.', { force: true }); }
      finally { els.workspaceRefreshButton.classList.remove('is-spinning'); }
    });
    els.addConnectorButton?.addEventListener('click', () => openAddConnectorModal());
    els.openMcpJsonButton?.addEventListener('click', async () => {
      const path = await openConnectorConfig({ silent: true });
      if (path) openConnectorJsonOpenedModal(path);
    });
    els.reloadConnectorsButton?.addEventListener('click', async () => {
      els.reloadConnectorsButton.classList.add('is-spinning');
      try {
        await Promise.allSettled([
          loadConnectors({ reload: true }),
          state.authenticated ? loadArenaConnectors({ silent: true }) : Promise.resolve()
        ]);
        toast("Connectors updated: MCP reread, Arena list pulled from the account.", 'success');
      } finally {
        els.reloadConnectorsButton.classList.remove('is-spinning');
      }
    });
    els.modeButton?.addEventListener('click', () => {
      if (!els.modeButton.disabled) openModePopover();
    });
    els.modalityButton?.addEventListener('click', () => {
      if (!els.modalityButton.disabled) openModalityPopover();
    });
    els.permissionButton?.addEventListener('click', () => {
      if (!els.permissionButton.disabled) openPermissionModePopover();
    });
    els.workspaceSyncToggle?.addEventListener('change', () => setWorkspaceSync(els.workspaceSyncToggle.checked));
    els.compactButton?.addEventListener('click', confirmCompact);
    els.gatewayChip?.addEventListener('click', () => openSettings('gateway'));
    els.sendButton?.setAttribute('type', 'submit');
    els.stopButton?.addEventListener('click', () => { void stopGeneration(); });
    els.chatSettingsButton?.addEventListener('click', () => openSettings('permissions'));

    /* Attachments: +, file picker, paste, drag & drop */
    els.attachButton?.addEventListener('click', () => {
      if (!els.attachButton.disabled) openAttachMenu();
    });
    els.fileInput?.addEventListener('change', () => {
      addFiles(els.fileInput.files);
      els.fileInput.value = '';
      focusComposer();
    });
    els.prompt?.addEventListener('paste', (event) => {
      const files = event.clipboardData?.files;
      if (files && files.length) {
        event.preventDefault();
        addFiles(files);
      }
    });
    const dropCard = els.composerCard;
    if (dropCard) {
      const hasFiles = (event) => Array.from(event.dataTransfer?.types || [])
        .some((t) => t === 'Files' || String(t).toLowerCase() === 'application/x-arena-workspace-path');
      const showOverlay = () => { if (els.dropOverlay) els.dropOverlay.hidden = false; };
      const hideOverlay = () => { if (els.dropOverlay) els.dropOverlay.hidden = true; };
      dropCard.addEventListener('dragenter', (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        showOverlay();
      });
      dropCard.addEventListener('dragover', (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        showOverlay();
      });
      dropCard.addEventListener('dragleave', (event) => {
        if (event.currentTarget === dropCard && !dropCard.contains(event.relatedTarget)) hideOverlay();
      });
      dropCard.addEventListener('drop', (event) => {
        event.preventDefault();
        hideOverlay();
        const workspacePath = event.dataTransfer?.getData('application/x-arena-workspace-path');
        if (workspacePath) { void attachWorkspaceFile(workspacePath); return; }
        addFiles(event.dataTransfer?.files);
      });
    }
    window.addEventListener('dragover', (event) => event.preventDefault());
    window.addEventListener('drop', (event) => event.preventDefault());

    els.dockCloseButton?.addEventListener('click', () => { void hideEngine(); });
    els.dockHideButton?.addEventListener('click', () => { void hideEngine(); });
    els.dockRefreshButton?.addEventListener('click', () => { void showEngine(); });

    document.addEventListener('click', handleDelegatedClick);
    document.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('resize', () => {
      closePopover(false);
      if (!window.matchMedia('(max-width: 900px)').matches) closeMobileSidebar();
    });
    window.addEventListener('offline', () => {
      state.networkOffline = true;
      updateConnectionUI();
      updateComposerState();
      toast("Network unavailable. Local interface remains open, but sending is blocked.", 'warning', "Offline");
    });
    window.addEventListener('online', () => {
      state.networkOffline = false;
      updateConnectionUI();
      updateComposerState();
      toast("Connection to the network restored. Check the local server.", 'info');
    });
    window.addEventListener('beforeunload', (event) => {
      if (!anyGenerationRunning()) return;
      event.preventDefault();
      event.returnValue = "Generation is still in progress.";
      return event.returnValue;
    });
  }

  function handleDelegatedClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const actionNode = target.closest('[data-action]');
    if (actionNode) {
      const action = actionNode.dataset.action;
      if (action) event.preventDefault();
      switch (action) {
        case 'home':
          if (state.generating) {
            toast("Stop generation before going to the main page.", 'warning');
          } else {
            state.historyRequest = (state.historyRequest || 0) + 1;
            state.activeChatId = null;
            state.activeChatTitle = '';
            state.messages = [];
            state.artifacts = [];
            state.historyError = null;
            state.historyLoading = false;
            state.challenge = null;
            updateArtifactCount();
            updateComposerState();
            renderChats();
            renderWelcomeState();
            closeMobileSidebar();
          }
          break;
        case 'new-chat':
          void createNewChat();
          break;
        case 'models':
          openModelPicker('a', actionNode);
          break;
        case 'workspace':
          openWorkspacePopover(els.workspaceButton || actionNode);
          break;
        case 'workspace-panel':
          setWorkspacePanelOpen(!state.workspacePanelOpen);
          closeMobileSidebar();
          break;
        case 'connectors-panel':
          setWorkspacePanelOpen(true, { focusConnectors: true });
          closeMobileSidebar();
          break;
        case 'workspace-panel-close':
          setWorkspacePanelOpen(false);
          break;
        case 'settings':
        case 'account':
        case 'settings-connection':
          openSettings('connection');
          break;
        case 'help':
          openHelp();
          break;
        case 'about':
        case 'limits':
        case 'transfer':
          openSettings('about');
          break;
        case 'engine-show':
          void showEngine();
          break;
        case 'engine-hide':
          void hideEngine();
          break;
        case 'retry-connection':
          void retryConnection();
          break;
        case 'retry-chats':
          void loadChats();
          break;
        case 'retry-arena-chats':
          void loadArenaChats();
          break;
        case 'retry-models':
          void loadModels(state.modality);
          break;
        case 'retry-history':
          void retryPendingHistory();
          break;
        default:
          break;
      }
      return;
    }

    const cloudChatDelete = target.closest('[data-cloud-chat-delete]');
    if (cloudChatDelete) {
      event.preventDefault();
      event.stopPropagation();
      const id = cloudChatDelete.dataset.cloudChatDelete;
      const entry = (state.cloudChats || []).find((item) => String(item.eval_id || item.id || '') === String(id));
      if (entry) confirmArchiveCloudChat(entry);
      return;
    }

    const cloudChatOpen = target.closest('[data-cloud-chat-open]');
    if (cloudChatOpen) {
      const id = cloudChatOpen.dataset.cloudChatOpen;
      const entry = state.cloudChats.find((item) => String(item.eval_id || item.id) === String(id))
        || { eval_id: id, id, type: cloudChatOpen.dataset.cloudChatType || 'evaluation' };
      void openArenaChat(entry);
      return;
    }
    const chatOpen = target.closest('[data-chat-open]');
    if (chatOpen) {
      void openChat(chatOpen.dataset.chatOpen);
      return;
    }
    const chatDelete = target.closest('[data-chat-delete]');
    if (chatDelete) {
      event.preventDefault();
      event.stopPropagation();
      if (chatIsGenerating(chatDelete.dataset.chatDelete)) {
        toast("First stop generation in this chat.", 'warning');
        return;
      }
      confirmDeleteChat(chatDelete.dataset.chatDelete);
      return;
    }

    const codeCopy = target.closest('[data-copy-code]');
    if (codeCopy) {
      const pre = codeCopy.closest('.code-block')?.querySelector('pre');
      if (!pre) return;
      void copyText(pre.textContent || '').then((ok) => {
        if (!ok) {
          toast("Failed to copy code.", 'error');
          return;
        }
        const label = codeCopy.querySelector('span:last-child');
        if (label) {
          const previous = label.textContent;
          label.textContent = "Copied and copied";
          window.setTimeout(() => { if (label.isConnected) label.textContent = previous; }, 1500);
        }
        announce("Code copied.");
      });
      return;
    }

    const answerCopy = target.closest('[data-copy-answer]');
    if (answerCopy) {
      const lane = answerCopy.closest('.assistant-lane');
      const answerText = lane?.querySelector('.markdown')?.textContent || '';
      if (!answerText) return;
      void copyText(answerText).then((ok) => {
        toast(ok ? "Response text copied to clipboard." : "Failed to copy the response.", ok ? 'success' : 'error');
      });
      return;
    }

    const modelPicker = target.closest('[data-model-picker]');
    if (modelPicker) {
      openModelPicker(modelPicker.dataset.modelPicker || 'a', modelPicker);
      return;
    }

    const permissionButton = target.closest('[data-permission-decision]');
    if (permissionButton) {
      const id = permissionButton.dataset.permissionId;
      const decision = permissionButton.dataset.permissionDecision;
      if (id && decision) void decidePermission(id, decision);
      return;
    }

    const mediaSave = target.closest('[data-save-media]');
    if (mediaSave) {
      void saveMediaFromEvent(mediaSave.dataset.saveMedia, mediaSave);
    }
  }

  function handleGlobalKeydown(event) {
    if (event.key === 'F1') {
      event.preventDefault();
      openHelp();
      return;
    }
    if (event.key === 'Escape') {
      if (state.activeModal) return;
      if (activePopover) {
        closePopover();
        return;
      }
      if (window.matchMedia('(max-width: 900px)').matches) closeMobileSidebar();
      if (!els.chatSearchWrap?.hidden) setChatSearchVisible(false);
      return;
    }
    if (state.activeModal) return;
    const modifier = event.ctrlKey || event.metaKey;
    if (!modifier || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'k') {
      event.preventDefault();
      setChatSearchVisible(true);
      if (els.recentsToggle.getAttribute('aria-expanded') === 'false') {
        els.recentsToggle.setAttribute('aria-expanded', 'true');
        els.recentsBody.hidden = false;
      }
    } else if (key === 'n') {
      event.preventDefault();
      void createNewChat();
    } else if (event.key === '/') {
      event.preventDefault();
      focusComposer();
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Boot                                                                  */
  /* ---------------------------------------------------------------------- */
  /* ---------------------------------------------------------------------- */
  /* One-time first-run setup: checks what the app needs, offers installs.  */
  /* ---------------------------------------------------------------------- */
  async function runFirstRunSetup() {
    let settings = {};
    try { settings = await API.getSettings(); } catch { return; }
    if (settings?.setup_done || navigator.webdriver) return; // automated browsers (tests) never see the one-time overlay

    const overlay = el('div', { class: 'setup-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'setupTitle' });
    const list = el('ol', { class: 'setup-steps' });
    const finish = el('button', { class: 'button setup-finish', type: 'button', disabled: true }, el('span', { text: 'Checking…' }));
    overlay.appendChild(el('div', { class: 'setup-panel' },
      el('h2', { class: 'setup-title', id: 'setupTitle', text: 'Setting up Arena Desktop' }),
      el('p', { class: 'setup-sub', text: 'A one-time check of what this computer has. Optional tools can be installed now or later in Settings → Components.' }),
      list,
      el('div', { class: 'setup-actions' }, finish)));
    document.body.appendChild(overlay);

    const addStep = (label) => {
      const status = el('span', { class: 'setup-status is-run' }, el('span', { class: 'tool-spinner', 'aria-hidden': 'true' }));
      const detail = el('span', { class: 'setup-detail', text: '' });
      const row = el('li', { class: 'setup-step' }, status, el('div', { class: 'setup-copy' }, el('span', { class: 'setup-label', text: label }), detail));
      list.appendChild(row);
      return {
        row,
        done(text, kind = 'ok') {
          status.className = `setup-status is-${kind}`;
          status.replaceChildren(iconEl(kind === 'ok' ? 'check' : kind === 'warn' ? 'alert' : 'x'));
          detail.textContent = text || '';
        }
      };
    };
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const app = addStep('App settings and data folder');
    await pause(250);
    app.done(state.appVersion ? `Version ${state.appVersion}` : 'Ready');

    const folder = addStep('Workspace folder');
    await pause(200);
    const ws = typeof state.workspace === 'string' ? state.workspace : '';
    folder.done(ws ? `${ws}${state.workspaceChosen ? '' : ' (default — change it from the folder menu)'}` : 'Pick one from the folder menu when you need it', ws ? 'ok' : 'warn');

    let components = [];
    try { components = (await API.getComponents())?.components || []; } catch { components = []; }
    const find = (id) => components.find((c) => c.id === id);
    const offer = (id, label, why) => {
      const step = addStep(label);
      const comp = find(id);
      if (!comp) { step.done('Could not check', 'warn'); return; }
      if (comp.installed) { step.done(comp.version ? `Installed · ${comp.version}` : 'Installed'); return; }
      step.done(`Not installed — ${why}`, 'warn');
      const install = el('button', { class: 'button button-quiet setup-install', type: 'button' }, el('span', { text: 'Install' }));
      install.addEventListener('click', async () => {
        install.disabled = true;
        install.firstChild.textContent = 'Starting…';
        try {
          const res = await API.installComponent(id);
          if (res?.open_url) window.open(res.open_url, '_blank', 'noopener');
          install.firstChild.textContent = res?.open_url ? 'Opened download page' : 'Installer started';
        } catch (err) {
          install.disabled = false;
          install.firstChild.textContent = 'Retry';
          toast(errorMessage(err), 'error', label);
        }
      });
      step.row.appendChild(install);
    };
    await pause(150);
    offer('webview2', 'Window engine (WebView2)', 'needed to draw the app window');
    offer('node', 'Node.js', 'needed for npm / npx commands and most MCP servers');
    offer('python', 'Python', 'needed for Python scripts the agent runs');

    // Battle mode (the default) has no model list by design, so ask for the
    // Direct-chat list to prove the arena.ai connection really works.
    const account = addStep('Arena account');
    for (let i = 0; i < 40 && engineStarting(state.status); i += 1) {
      await pause(500);
      await loadStatus({ quiet: true }).catch(() => null);
    }
    if (!state.authenticated) {
      account.done('Not signed in yet. Use Sign in at the bottom left.', 'warn');
    } else {
      let count = 0;
      try { count = modelArray(await API.getModels('text', 'direct')).length; } catch { count = 0; }
      const who = state.email ? `Signed in as ${state.email}` : 'Signed in';
      account.done(count ? `${who} · ${count} models available` : `${who} · model list did not load, it retries when you pick a model`, count ? 'ok' : 'warn');
    }

    finish.disabled = false;
    finish.firstChild.textContent = 'Get started';
    playChime(doneAudio || (primeDoneAudio(), doneAudio) || { state: 'closed' });
    finish.focus();
    await new Promise((resolve) => finish.addEventListener('click', resolve, { once: true }));
    try { await API.saveSettings({ setup_done: true }); } catch { /* shown again next launch */ }
    overlay.classList.add('is-leaving');
    setTimeout(() => overlay.remove(), 180);
  }

  function engineStarting(status) {
    const engine = status?.engine;
    return Boolean(status && (status.loading || status.engine_loading
      || (engine && typeof engine === 'object' && (engine.ready === false || engine.challenge))));
  }

  // Cold start: the arena.ai session loads in the background for a few
  // seconds. Poll until it is ready, then load account, history and models,
  // so nobody has to press Refresh after launching the app.
  function watchEngineUntilReady() {
    let tries = 0;
    const tick = async () => {
      tries += 1;
      const status = await loadStatus({ quiet: true }).catch(() => null);
      if (status && !engineStarting(status)) {
        await Promise.allSettled([loadChats({ silent: true }), loadModels(state.modality, { quiet: true })]);
        updateAccountUI();
        renderChats();
        return;
      }
      if (tries < 120) window.setTimeout(tick, 1500);
    };
    window.setTimeout(tick, 1200);
  }

  async function boot() {
    loadUnreadDone();
    cacheElements();
    hydrateIcons();
    ensureBypassWarning();
    setupNativeBridge();
    restoreSidebarPreference();
    restoreWorkspacePanelPreference();
    setupLayoutResize();
    bindEvents();
    state.view = 'welcome';
    if (state.engineOpen) syncDock(false);
    if (state.demo) {
      document.documentElement.dataset.demo = 'true';
      document.body.classList.add('demo-mode');
      document.title = "Demo · Arena Desktop";
      if (els.demoChip) els.demoChip.hidden = false;
      if (els.demoBanner) els.demoBanner.hidden = false;
    }
    updateConnectionUI();
    updateAccountUI();
    renderChats();
    renderWorkspaceTreePanel();
    renderConnectorsPanel();
    renderModelStrip();
    renderModelsNavCount();
    updatePendingPermissionsBadge();
    updateComposerState();
    setView('welcome');
    resizePrompt();

    try {
      const status = await loadStatus({ initial: true });
      if (status) {
        await Promise.allSettled([
          loadChats(),
          loadModels(state.modality, { quiet: true }),
          refreshWorkspacePanel(),
          loadLayoutSettings()
        ]);
        await loadPermissions({ quiet: true });
        if (status.engine && normalizeEngine(status.engine).open) syncDock(false);
        updateComposerState();
        if (!state.demo && (engineStarting(status) || state.cloudChatsError)) watchEngineUntilReady();
        if (!state.demo) void runFirstRunSetup().catch(() => { document.querySelector('.setup-overlay')?.remove(); });
      } else {
        state.chatsLoading = false;
        state.chatsError = state.serverError || "Local server is unavailable.";
        state.modelsLoading = false;
        state.modelsError = state.serverError || "Model list unavailable.";
        state.chats = [];
        state.models = [];
        renderChats();
        renderModelStrip();
        renderModelsNavCount();
        updateComposerState();
        updateConnectionUI();
      }
    } catch (error) {
      state.serverError = errorMessage(error);
      state.phase = 'offline';
      state.chatsLoading = false;
      state.modelsLoading = false;
      state.chatsError = state.serverError;
      state.modelsError = state.serverError;
      updateAllUI();
    } finally {
      state.booted = true;
      state.phase = state.serverError ? 'offline' : 'ready';
      ensureBypassWarning();
      updateAllUI();
      if (!state.demo) {
        document.documentElement.classList.remove('demo-mode');
      }
      // Nothing fake is inserted when status/API loading failed.
      if (state.serverError) {
        announce("Local server unavailable. The interface shows the actual status and offers demo separately.");
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { void boot(); }, { once: true });
  } else {
    void boot();
  }