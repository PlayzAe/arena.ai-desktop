  /* ---------------------------------------------------------------------- */
  function formatBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return '';
    if (value < 1024) return `${Math.round(value)} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(value >= 10 * 1024 ? 0 : 1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  function normalizeWorkspaceEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const path = String(raw.path ?? raw.rel_path ?? raw.name ?? '');
    if (!path) return null;
    return {
      name: String(raw.name ?? baseName(path) ?? path),
      path,
      is_dir: Boolean(raw.is_dir ?? raw.isDir ?? raw.directory),
      size: Number(raw.size ?? 0) || 0,
      modified_at: raw.modified_at ?? raw.modifiedAt ?? null,
      raw
    };
  }

  function workspaceFileIcon(entry) {
    if (entry.is_dir) return 'folder';
    const name = String(entry.name || '').toLocaleLowerCase('en');
    if (/\.(png|jpe?g|gif|webp|svg|bmp|ico)$/.test(name)) return 'image';
    if (/\.(mp4|webm|mov|mkv)$/.test(name)) return 'video';
    if (/\.(zip|7z|rar|tar|gz)$/.test(name)) return 'archive';
    if (/\.(py|js|ts|tsx|jsx|html|css|json|md|txt|yml|yaml|toml|xml|csv|rs|go|java|c|cpp|h|sh|ps1|bat)$/.test(name)) return 'file-text';
    return 'file';
  }

  function resetWorkspaceTree() {
    state.workspaceTree = [];
    state.workspaceTreeLoaded = false;
    state.workspaceTreeError = null;
    state.workspaceTreeTruncated = false;
    state.workspaceChildren = {};
    state.workspaceExpanded = new Set();
    state.workspaceLoadingPaths = new Set();
    state.workspaceRequest += 1;
  }

  // The Workspace panel follows the folder by itself: a folder being chosen or
  // changed, and files the AI writes or edits (tool results, saved files), all
  // schedule one debounced reload of the root and of every expanded folder.
  let workspaceTreeTimer = null;
  function scheduleWorkspaceTreeRefresh(delay = 350) {
    if (workspaceTreeTimer) window.clearTimeout(workspaceTreeTimer);
    workspaceTreeTimer = window.setTimeout(async () => {
      workspaceTreeTimer = null;
      if (!state.workspacePanelOpen || state.serverError) return;
      await loadWorkspaceTree('.', { force: true });
      const expanded = [...(state.workspaceExpanded || [])];
      await Promise.allSettled(expanded.map((path) => loadWorkspaceTree(path, { force: true })));
    }, delay);
  }

  function syncWorkspacePanelVisibility() {
    const open = Boolean(state.workspacePanelOpen);
    if (els.app) els.app.dataset.workspacePanel = open ? 'open' : 'closed';
    if (els.workspacePanel) els.workspacePanel.hidden = !open;
    if (els.workspacePanelTopButton) els.workspacePanelTopButton.setAttribute('aria-pressed', String(open));
    if (els.workspacePanelNavBtn) els.workspacePanelNavBtn.setAttribute('aria-pressed', String(open));
    if (els.workspacePanelRoot) {
      const label = state.workspacePanelRoot || state.workspace || "Loading folder…";
      els.workspacePanelRoot.textContent = label;
      els.workspacePanelRoot.title = label;
    }
  }

  function setWorkspacePanelOpen(open, { focusConnectors = false, persist = true, load = true } = {}) {
    state.workspacePanelOpen = Boolean(open);
    syncWorkspacePanelVisibility();
    if (persist) {
      try { localStorage.setItem('arenaPersonal.workspacePanelOpen.v4', state.workspacePanelOpen ? '1' : '0'); } catch { /* storage unavailable */ }
    }
    if (!state.workspacePanelOpen) return;
    renderWorkspaceTreePanel();
    renderConnectorsPanel();
    if (load) void refreshWorkspacePanel({ force: true });
    if (focusConnectors) {
      window.setTimeout(() => {
        els.connectorsPane?.scrollIntoView({ block: 'nearest' });
        try { els.addConnectorButton?.focus({ preventScroll: true }); } catch { els.addConnectorButton?.focus(); }
      }, 40);
    }
  }

  function restoreWorkspacePanelPreference() {
    let open = window.innerWidth >= 1180;
    try {
      const stored = localStorage.getItem('arenaPersonal.workspacePanelOpen.v4');
      if (stored === '1') open = true;
      else if (stored === '0') open = false;
    } catch { /* use width default */ }
    setWorkspacePanelOpen(open, { persist: false, load: false });
  }

  const LAYOUT_LIMITS = {
    sidebarWidth: { min: 220, max: 420, fallback: 276 },
    workspaceWidth: { min: 260, max: 560, fallback: 332 },
    connectorsShare: { min: 22, max: 68, fallback: 38 }
  };

  function clampLayoutValue(key, value) {
    const limits = LAYOUT_LIMITS[key];
    const number = Number(value);
    if (!Number.isFinite(number)) return limits.fallback;
    return Math.round(Math.min(limits.max, Math.max(limits.min, number)));
  }

  function applyLayout() {
    const layout = state.layout || {};
    state.layout = {
      sidebarWidth: clampLayoutValue('sidebarWidth', layout.sidebarWidth),
      workspaceWidth: clampLayoutValue('workspaceWidth', layout.workspaceWidth),
      connectorsShare: clampLayoutValue('connectorsShare', layout.connectorsShare)
    };
    const root = document.documentElement.style;
    // The grid reads --sidebar-w / --workspace-panel-w; setting differently
    // named variables was why dragging the handles changed nothing.
    root.setProperty('--sidebar-w', `${state.layout.sidebarWidth}px`);
    root.setProperty('--sidebar-width', `${state.layout.sidebarWidth}px`);
    root.setProperty('--workspace-panel-w', `${state.layout.workspaceWidth}px`);
    root.setProperty('--workspace-width', `${state.layout.workspaceWidth}px`);
    root.setProperty('--connectors-share', `${state.layout.connectorsShare}%`);
    const syncHandle = (node, key) => {
      if (!node) return;
      const limits = LAYOUT_LIMITS[key];
      node.setAttribute('aria-valuemin', String(limits.min));
      node.setAttribute('aria-valuemax', String(limits.max));
      node.setAttribute('aria-valuenow', String(state.layout[key]));
    };
    syncHandle(els.sidebarResize, 'sidebarWidth');
    syncHandle(els.workspaceResize, 'workspaceWidth');
    syncHandle(els.workspaceSplitResize, 'connectorsShare');
    try { localStorage.setItem('arenaDesktop.layout.v1', JSON.stringify(state.layout)); } catch { /* storage unavailable */ }
  }

  function restoreLayoutFromCache() {
    try {
      const saved = JSON.parse(localStorage.getItem('arenaDesktop.layout.v1') || 'null');
      if (saved && typeof saved === 'object') state.layout = { ...state.layout, ...saved };
    } catch { /* use defaults */ }
    applyLayout();
  }

  let layoutSaveTimer = 0;
  function persistLayout() {
    applyLayout();
    window.clearTimeout(layoutSaveTimer);
    layoutSaveTimer = window.setTimeout(() => {
      layoutSaveTimer = 0;
      API.saveSettings({ layout: { ...state.layout } }).catch(() => {});
    }, 320);
  }

  async function loadLayoutSettings() {
    try {
      const payload = await API.getSettings();
      const layout = payload?.settings?.layout || payload?.layout;
      if (layout && typeof layout === 'object') {
        state.layout = { ...state.layout, ...layout };
        applyLayout();
      }
      const off = payload?.arena_connectors_off ?? payload?.settings?.arena_connectors_off;
      if (Array.isArray(off)) {
        state.arenaConnectorsOff = new Set(off.map(String));
        refreshConnectorSurfaces();
      }
    } catch { /* cached layout remains active */ }
  }

  function setupPanelResize(handle, { key, orientation = 'vertical', valueFromEvent, label }) {
    if (!handle || handle.dataset.resizeReady === '1') return;
    handle.dataset.resizeReady = '1';
    handle.setAttribute('tabindex', '0');
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', orientation);
    if (label) handle.setAttribute('aria-label', label);
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const startValue = state.layout[key];
      const panelRect = els.workspacePanel?.getBoundingClientRect();
      document.body.classList.add('is-resizing');
      handle.classList.add('is-dragging');
      handle.setPointerCapture?.(event.pointerId);
      const move = (pointerEvent) => {
        state.layout[key] = clampLayoutValue(key, valueFromEvent({
          startValue,
          dx: pointerEvent.clientX - startX,
          dy: pointerEvent.clientY - startY,
          panelRect
        }));
        applyLayout();
      };
      const finish = () => {
        document.body.classList.remove('is-resizing');
        handle.classList.remove('is-dragging');
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', finish);
        handle.removeEventListener('pointercancel', finish);
        persistLayout();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', finish);
      handle.addEventListener('pointercancel', finish);
    });
    handle.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 16 : 6;
      let delta = 0;
      if (orientation === 'vertical') {
        if (event.key === 'ArrowLeft') delta = key === 'workspaceWidth' ? step : -step;
        if (event.key === 'ArrowRight') delta = key === 'workspaceWidth' ? -step : step;
      } else {
        if (event.key === 'ArrowUp') delta = step;
        if (event.key === 'ArrowDown') delta = -step;
      }
      if (!delta) return;
      event.preventDefault();
      state.layout[key] = clampLayoutValue(key, state.layout[key] + delta);
      persistLayout();
    });
    handle.addEventListener('dblclick', () => {
      state.layout[key] = LAYOUT_LIMITS[key].fallback;
      persistLayout();
    });
  }

  function setupLayoutResize() {
    restoreLayoutFromCache();
    setupPanelResize(els.sidebarResize, {
      key: 'sidebarWidth', label: 'Resize sidebar',
      valueFromEvent: ({ startValue, dx }) => startValue + dx
    });
    setupPanelResize(els.workspaceResize, {
      key: 'workspaceWidth', label: 'Resize workspace panel',
      valueFromEvent: ({ startValue, dx }) => startValue - dx
    });
    setupPanelResize(els.workspaceSplitResize, {
      key: 'connectorsShare', orientation: 'horizontal', label: 'Resize connectors section',
      valueFromEvent: ({ startValue, dy, panelRect }) => {
        const height = Math.max(1, panelRect?.height || els.workspacePanel?.clientHeight || 1);
        return startValue - (dy / height) * 100;
      }
    });
  }

  async function refreshWorkspacePanel({ force = false } = {}) {
    const jobs = [];
    if (force || !state.connectors) jobs.push(loadConnectors({ reload: force, silent: true }));
    if (state.authenticated && (force || !state.arenaConnectors)) jobs.push(loadArenaConnectors({ silent: true }));
    if (state.workspacePanelOpen && (force || !state.workspaceTreeLoaded)) jobs.push(loadWorkspaceTree('.', { force }));
    await Promise.allSettled(jobs);
  }

  async function loadWorkspaceTree(path = '.', { force = false } = {}) {
    const target = String(path || '.');
    if (state.serverError) {
      if (target === '.') state.workspaceTreeError = state.serverError;
      renderWorkspaceTreePanel();
      return [];
    }
    if (target !== '.') {
      if (!force && Array.isArray(state.workspaceChildren[target])) {
        renderWorkspaceTreePanel();
        return state.workspaceChildren[target];
      }
      if (state.workspaceLoadingPaths.has(target)) return state.workspaceChildren[target] || [];
      state.workspaceLoadingPaths.add(target);
      renderWorkspaceTreePanel();
      try {
        const raw = await API.getWorkspaceTree(target);
        const entries = (Array.isArray(raw?.entries) ? raw.entries : []).map(normalizeWorkspaceEntry).filter(Boolean);
        state.workspaceChildren[target] = entries;
        if (raw?.root) state.workspacePanelRoot = String(raw.root);
        return entries;
      } catch (error) {
        state.workspaceExpanded.delete(target);
        toast(errorMessage(error), 'error', "Folder not opened");
        return [];
      } finally {
        state.workspaceLoadingPaths.delete(target);
        syncWorkspacePanelVisibility();
        renderWorkspaceTreePanel();
      }
    }

    if (state.workspaceTreeLoading && !force) return state.workspaceTree;
    const requestId = ++state.workspaceRequest;
    state.workspaceTreeLoading = true;
    if (force) state.workspaceTreeError = null;
    renderWorkspaceTreePanel();
    try {
      const raw = await API.getWorkspaceTree('.');
      if (requestId !== state.workspaceRequest) return state.workspaceTree;
      const nextRoot = String(raw?.root || state.workspacePanelRoot || state.workspace || '');
      if (state.workspacePanelRoot && nextRoot && state.workspacePanelRoot !== nextRoot) {
        state.workspaceChildren = {};
        state.workspaceExpanded = new Set();
      }
      state.workspacePanelRoot = nextRoot;
      state.workspaceTree = (Array.isArray(raw?.entries) ? raw.entries : []).map(normalizeWorkspaceEntry).filter(Boolean);
      state.workspaceTreeTruncated = Boolean(raw?.truncated);
      state.workspaceTreeLoaded = true;
      state.workspaceTreeError = null;
      return state.workspaceTree;
    } catch (error) {
      if (requestId === state.workspaceRequest) state.workspaceTreeError = errorMessage(error);
      return [];
    } finally {
      if (requestId === state.workspaceRequest) state.workspaceTreeLoading = false;
      syncWorkspacePanelVisibility();
      renderWorkspaceTreePanel();
    }
  }

  function workspaceTreeNode(entry, depth = 0) {
    const fragment = document.createDocumentFragment();
    const expanded = entry.is_dir && state.workspaceExpanded.has(entry.path);
    const loading = entry.is_dir && state.workspaceLoadingPaths.has(entry.path);
    const activate = () => {
      if (entry.is_dir) void toggleWorkspaceDirectory(entry);
      else void openWorkspaceFilePreview(entry);
    };
    const row = el('div', {
      class: `workspace-tree-row${entry.is_dir ? ' is-dir' : ''}`,
      role: 'treeitem',
      tabindex: '0',
      'aria-expanded': entry.is_dir ? String(expanded) : false,
      'aria-label': `${entry.is_dir ? "Folder" : "File"}: ${entry.path}`,
      title: entry.path,
      style: { paddingLeft: `${6 + depth * 13}px` },
      onclick: activate,
      onkeydown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      }
    },
      entry.is_dir
        ? el('span', { class: 'workspace-tree-caret', 'aria-hidden': 'true' }, iconEl('chevron-right'))
        : el('span', { class: 'workspace-tree-caret', 'aria-hidden': 'true' }),
      iconEl(workspaceFileIcon(entry), entry.is_dir ? 'workspace-entry-icon is-folder' : 'workspace-entry-icon is-file'),
      el('span', { class: 'workspace-tree-name', text: entry.name }),
      loading ? el('span', { class: 'mini-spinner', 'aria-hidden': 'true' }) : null
    );
    if (!entry.is_dir) {
      row.draggable = true;
      row.title = `${entry.path} — drag into the composer to attach`;
      row.addEventListener('dragstart', (event) => {
        if (!event.dataTransfer) return;
        event.dataTransfer.setData('application/x-arena-workspace-path', entry.path);
        event.dataTransfer.effectAllowed = 'copy';
      });
    }
    fragment.appendChild(row);
    if (entry.is_dir && expanded) {
      const childrenWrap = el('div', { class: 'workspace-tree-children', role: 'group' });
      const children = state.workspaceChildren[entry.path];
      if (loading && !Array.isArray(children)) {
        childrenWrap.appendChild(el('div', { class: 'workspace-tree-empty', text: "Loading…" }));
      } else if (Array.isArray(children) && children.length) {
        children.forEach((child) => childrenWrap.appendChild(workspaceTreeNode(child, depth + 1)));
      } else if (Array.isArray(children)) {
        childrenWrap.appendChild(el('div', { class: 'workspace-tree-empty', text: "Folder is empty" }));
      }
      fragment.appendChild(childrenWrap);
    }
    return fragment;
  }

  function renderWorkspaceTreePanel() {
    syncWorkspacePanelVisibility();
    const node = els.workspaceTree;
    if (!node) return;
    const scrollTop = node.scrollTop;
    clear(node);
    node.setAttribute('aria-busy', String(state.workspaceTreeLoading));
    if (state.workspaceTreeLoading && !state.workspaceTreeLoaded) {
      node.appendChild(el('div', { class: 'workspace-tree-empty' }, el('span', { class: 'mini-spinner' }), el('span', { text: " Loading files…" })));
    } else if (state.workspaceTreeError && !state.workspaceTree.length) {
      node.append(
        el('div', { class: 'workspace-tree-error', text: state.workspaceTreeError }),
        el('button', { class: 'button button-small button-quiet', type: 'button', onclick: () => void loadWorkspaceTree('.', { force: true }) },
          iconEl('refresh'), el('span', { text: "Retry" }))
      );
    } else if (!state.workspaceTree.length) {
      node.appendChild(el('div', { class: 'workspace-tree-empty', text: state.workspaceTreeLoaded ? "There are no files in this folder yet." : "Click refresh to load the file tree." }));
    } else {
      const rootName = baseName(state.workspacePanelRoot || state.workspace || '') || 'Workspace';
      node.appendChild(el('div', {
        class: 'workspace-tree-row workspace-tree-root is-dir',
        role: 'treeitem', 'aria-expanded': 'true',
        title: state.workspacePanelRoot || state.workspace || rootName
      },
        el('span', { class: 'workspace-tree-caret', 'aria-hidden': 'true' }, iconEl('chevron-right')),
        iconEl('folder', 'workspace-entry-icon is-folder'),
        el('span', { class: 'workspace-tree-name', text: rootName })));
      state.workspaceTree.forEach((entry) => node.appendChild(workspaceTreeNode(entry, 1)));
      if (state.workspaceTreeTruncated) node.appendChild(el('div', { class: 'workspace-tree-empty', text: "The first items of the folder are shown; the rest are hidden by the preview limit." }));
      if (state.workspaceTreeError) node.appendChild(el('div', { class: 'workspace-tree-error', text: state.workspaceTreeError }));
    }
    node.scrollTop = scrollTop;
  }

  async function toggleWorkspaceDirectory(entry) {
    if (!entry?.is_dir) return;
    if (state.workspaceExpanded.has(entry.path)) {
      state.workspaceExpanded.delete(entry.path);
      renderWorkspaceTreePanel();
      return;
    }
    state.workspaceExpanded.add(entry.path);
    renderWorkspaceTreePanel();
    await loadWorkspaceTree(entry.path);
  }

  const PREVIEW_KINDS = {
    image: new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico']),
    audio: new Set(['mp3', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'flac', 'aac']),
    video: new Set(['mp4', 'webm', 'mov', 'm4v', 'mkv']),
    html: new Set(['html', 'htm', 'xhtml']),
    markdown: new Set(['md', 'markdown', 'mdx']),
    pdf: new Set(['pdf'])
  };

  function previewKindFor(name) {
    const ext = String(name || '').toLowerCase().split('.').pop();
    for (const [kind, set] of Object.entries(PREVIEW_KINDS)) if (set.has(ext)) return kind;
    return 'text';
  }

  function workspacePreviewUrl(path) {
    return previewLink(path);
  }

  async function openWorkspaceFilePreview(entry) {
    if (!entry || entry.is_dir) return;
    const kind = previewKindFor(entry.name || entry.path);
    const downloadAction = {
      label: 'Download', variant: 'quiet', icon: 'download',
      onClick: async () => {
        try {
          const blob = await API.downloadWorkspaceFile(entry.path);
          const url = URL.createObjectURL(blob);
          const link = el('a', { href: url, download: entry.name || 'file' });
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
        } catch (error) { toast(errorMessage(error), 'error', 'Download failed'); }
        return false;
      }
    };
    const open = (bodyNodes, actions) => mountModal({
      title: entry.name,
      subtitle: `${entry.path}${entry.size ? ` \u00B7 ${formatBytes(entry.size)}` : ''}`,
      size: 'large',
      content: el('div', {}, ...bodyNodes),
      actions: actions || [downloadAction, { label: 'Close', variant: 'primary', autofocus: true }]
    });
    try {
      if (kind === 'image') {
        const src = state.demo
          ? URL.createObjectURL(await API.downloadWorkspaceFile(entry.path))
          : workspacePreviewUrl(entry.path);
        open([el('div', { class: 'file-preview-media' }, el('img', { src, alt: entry.name }))]);
        return;
      }
      if (kind === 'audio' || kind === 'video') {
        const src = state.demo
          ? URL.createObjectURL(await API.downloadWorkspaceFile(entry.path))
          : workspacePreviewUrl(entry.path);
        const media = kind === 'audio'
          ? el('audio', { controls: true, src, preload: 'metadata' })
          : el('video', { controls: true, src, preload: 'metadata' });
        open([el('div', { class: 'file-preview-media' }, media)]);
        return;
      }
      if (kind === 'pdf' && !state.demo) {
        open([el('iframe', { class: 'file-preview-frame', src: workspacePreviewUrl(entry.path), title: entry.name })]);
        return;
      }
      if (kind === 'html') {
        if (state.demo) {
          const raw = await API.getWorkspaceFile(entry.path);
          open([el('iframe', { class: 'file-preview-frame', sandbox: 'allow-scripts', srcdoc: String(raw?.content ?? ''), title: entry.name })]);
        } else {
          open([
            el('div', { class: 'note-box' }, iconEl('shield'), el('span', { text: 'Rendered in a sandboxed frame: scripts run, but the page cannot reach the app or your Arena account.' })),
            el('iframe', { class: 'file-preview-frame', sandbox: 'allow-scripts allow-modals allow-popups', src: workspacePreviewUrl(entry.path), title: entry.name })
          ]);
        }
        return;
      }
      const raw = await API.getWorkspaceFile(entry.path);
      const content = String(raw?.content ?? '');
      if (kind === 'markdown') {
        const rendered = el('div', { class: 'markdown file-preview-markdown' });
        rendered.appendChild(renderMarkdown(content.slice(0, 250000)));
        open([
          el('div', { class: 'note-box' }, iconEl('info'), el('span', { text: 'Rendered Markdown preview (read-only).' })),
          rendered
        ], [
          {
            label: 'Copy', variant: 'quiet', icon: 'copy',
            onClick: async () => {
              const ok = await copyText(content);
              toast(ok ? 'File content copied.' : 'Failed to copy the file.', ok ? 'success' : 'error');
              return false;
            }
          },
          downloadAction,
          { label: 'Close', variant: 'primary', autofocus: true }
        ]);
        return;
      }
      const shown = content.length > 250000 ? `${content.slice(0, 250000)}\n\n… [preview truncated]` : content;
      open([
        el('div', { class: 'note-box' }, iconEl('info'), el('span', { text: 'Preview is read-only. To modify the file, open the folder in your editor.' })),
        el('pre', { class: 'file-preview-pre', text: shown || '[empty file]' })
      ], [
        {
          label: 'Copy', variant: 'quiet', icon: 'copy',
          onClick: async () => {
            const ok = await copyText(content);
            toast(ok ? 'File content copied.' : 'Failed to copy the file.', ok ? 'success' : 'error');
            return false;
          }
        },
        downloadAction,
        { label: 'Close', variant: 'primary', autofocus: true }
      ]);
    } catch (error) {
      if (kind === 'text' || kind === 'pdf') {
        open([el('div', { class: 'note-box' }, iconEl('info'),
          el('span', { text: 'This file cannot be previewed in the app. Download it to open with another program.' }))]);
        return;
      }
      toast(errorMessage(error), 'error', 'File is not open');
    }
  }

  function connectorServersList() {
    return Array.isArray(state.connectors?.servers) ? state.connectors.servers : [];
  }

  function connectorPresetsList() {
    return Array.isArray(state.connectors?.presets) ? state.connectors.presets : [];
  }

  function applyConnectorsPayload(payload) {
    if (payload && typeof payload === 'object' && (Array.isArray(payload.servers) || Array.isArray(payload.presets))) {
      state.connectors = payload;
      state.connectorsError = payload.config_error || null;
    }
    renderConnectorsPanel();
    return state.connectors;
  }

  async function loadConnectors({ reload = false, silent = false } = {}) {
    const requestId = ++state.connectorRequest;
    state.connectorsLoading = true;
    renderConnectorsPanel();
    try {
      const raw = reload ? await API.reloadConnectors() : await API.getConnectors();
      if (requestId === state.connectorRequest) applyConnectorsPayload(raw);
      return state.connectors;
    } catch (error) {
      if (requestId === state.connectorRequest) state.connectorsError = errorMessage(error);
      if (!silent) toast(errorMessage(error), 'error', "Connectors are unavailable");
      return null;
    } finally {
      if (requestId === state.connectorRequest) state.connectorsLoading = false;
      renderConnectorsPanel();
    }
  }

  /* Official Arena account connectors (live catalog from arena.ai) */
  let addConnectorModalRender = null;

  function arenaConnectorsList() {
    return Array.isArray(state.arenaConnectors) ? state.arenaConnectors : [];
  }

  function refreshConnectorSurfaces() {
    renderConnectorsPanel();
    if (addConnectorModalRender) {
      try { addConnectorModalRender(); } catch { /* modal already gone */ }
    }
  }

  function applyArenaConnectorsPayload(payload) {
    if (payload && typeof payload === 'object' && Array.isArray(payload.connectors)) {
      state.arenaConnectors = payload.connectors;
      state.arenaConnectorsError = null;
    }
    refreshConnectorSurfaces();
    return state.arenaConnectors;
  }

  async function loadArenaConnectors({ silent = false } = {}) {
    const requestId = ++state.arenaConnectorRequest;
    state.arenaConnectorsLoading = true;
    renderConnectorsPanel();
    try {
      const raw = await API.getArenaConnectors();
      if (requestId === state.arenaConnectorRequest) applyArenaConnectorsPayload(raw);
      return state.arenaConnectors;
    } catch (error) {
      if (requestId === state.arenaConnectorRequest) state.arenaConnectorsError = errorMessage(error);
      if (!silent && error?.status !== 401) toast(errorMessage(error), 'error', "Arena connectors are unavailable");
      return null;
    } finally {
      if (requestId === state.arenaConnectorRequest) state.arenaConnectorsLoading = false;
      refreshConnectorSurfaces();
    }
  }

  function arenaConnectorStatusLabel(item) {
    if (item?.auth_status === 'connected' || item?.connected) {
      return state.arenaConnectorsOff.has(item.slug) ? "Connected to account · Off" : "Connected to account";
    }
    if (item?.auth_status === 'unusable') return "Unavailable";
    return "Not connected";
  }

  function setArenaConnectorEnabled(item, enabled) {
    if (!item?.slug) return;
    if (enabled) state.arenaConnectorsOff.delete(item.slug);
    else state.arenaConnectorsOff.add(item.slug);
    API.saveSettings({ arena_connectors_off: [...state.arenaConnectorsOff] }).catch(() => {});
    refreshConnectorSurfaces();
    toast(enabled ? `${item.name} will be available to Arena Agent.` : `${item.name} is off: Arena Agent will not use it.`, 'success');
  }

  function stopArenaConnectorPoll() {
    if (state.arenaConnectorPoll) state.arenaConnectorPoll.cancelled = true;
    state.arenaConnectorPoll = null;
  }

  /* Connecting opens Merge's hosted sign-in page in the user's default
     browser (the embedded Arena window blocks third-party cookies, which
     breaks Merge's widget with "CSRF verification failed"). The server keeps
     checking the connector status; this dialog closes by itself on success. */
  async function pollArenaConnectorFlow(slug, name, token, dialog) {
    const deadline = Date.now() + 10 * 60 * 1000;
    while (!token.cancelled && Date.now() < deadline) {
      await sleep(state.demo ? 600 : 2500);
      if (token.cancelled) return;
      let result = null;
      try {
        result = await API.pollArenaConnector(slug);
      } catch {
        continue;
      }
      if (token.cancelled) return;
      if (Array.isArray(result?.connectors)) applyArenaConnectorsPayload(result);
      if (result?.done) {
        void loadArenaConnectors({ silent: true });
        void loadStatus({ quiet: true });
        if (result.connected) {
          dialog.showSuccess();
          toast(`Connector "${name}" is connected to the Arena account.`, 'success');
          await sleep(1800);
          dialog.close();
        } else {
          dialog.close();
          toast("Timeout expired. Refresh the list to check the status.", 'warning', name);
        }
        return;
      }
    }
    if (!token.cancelled) {
      dialog.close();
      toast("Connection is not yet complete. Check the status later with the refresh button.", 'warning', name);
    }
  }

  function mountArenaConnectorDialog(name, { token, authUrl = '' } = {}) {
    const status = el('p', { class: 'modal-copy', role: 'status', 'aria-live': 'polite',
      text: "Waiting for you to finish in your browser…" });
    const content = el('div', {},
      el('p', { class: 'modal-copy', text: `The ${name} sign-in page was opened in your default browser. Finish connecting there.` }),
      el('p', { class: 'modal-copy', text: "If the page shows an error or stays blank, turn off your ad blocker or Brave Shields for it (Brave: click the lion icon in the address bar and switch Shields off), then reload the page." }),
      authUrl ? el('p', { class: 'modal-copy', text: "The browser could not be opened automatically. Copy this link into your browser:" }) : null,
      authUrl ? el('input', { class: 'input', type: 'text', readonly: true, value: authUrl, 'aria-label': "Sign-in link" }) : null,
      status
    );
    const modal = mountModal({
      title: `Connect ${name}`,
      subtitle: "Continue in your browser",
      size: 'small',
      content,
      actions: [{ label: "Cancel", variant: 'quiet' }],
      onClose: () => { token.cancelled = true; }
    });
    return {
      close: modal.close,
      showSuccess() {
        content.replaceChildren(el('p', { class: 'modal-copy', role: 'status', text: "All done, connected successfully" }));
        modal.footer.replaceChildren();
      }
    };
  }

  async function connectArenaConnectorFlow(connector) {
    const slug = String(connector?.slug || '');
    if (!slug || state.arenaConnectorBusy.has(slug)) return;
    stopArenaConnectorPoll();
    state.arenaConnectorBusy.add(slug);
    refreshConnectorSurfaces();
    try {
      const result = await API.connectArenaConnector(slug);
      if (result?.pending) {
        const name = connector.name || slug;
        const token = { slug, cancelled: false };
        state.arenaConnectorPoll = token;
        const dialog = mountArenaConnectorDialog(name, { token, authUrl: result.opened === false ? String(result.auth_url || '') : '' });
        await pollArenaConnectorFlow(slug, name, token, dialog);
      } else {
        await loadArenaConnectors({ silent: true });
      }
    } catch (error) {
      toast(errorMessage(error), 'error', connector.name || slug);
    } finally {
      state.arenaConnectorBusy.delete(slug);
      refreshConnectorSurfaces();
    }
  }

  function disconnectArenaConnectorFlow(connector) {
    const slug = String(connector?.slug || '');
    if (!slug) return;
    mountModal({
      title: "Disconnect the Arena connector?",
      subtitle: connector.name || slug,
      size: 'small',
      content: el('p', { class: 'modal-copy', text: 'The connector will be disconnected from your arena.ai account and will no longer be available to Arena Agent. You can connect it again at any time.' }),
      actions: [
        { label: "Cancel", variant: 'quiet' },
        {
          label: "Disconnect", variant: 'danger',
          onClick: async () => {
            if (state.arenaConnectorBusy.has(slug)) return;
            state.arenaConnectorBusy.add(slug);
            refreshConnectorSurfaces();
            try {
              const payload = await API.disconnectArenaConnector(slug);
              if (Array.isArray(payload?.connectors) && payload.connectors.length) applyArenaConnectorsPayload(payload);
              else await loadArenaConnectors({ silent: true });
              toast(`Connector "${connector.name || slug}" is disconnected from the Arena account.`, 'success');
            } catch (error) {
              toast(errorMessage(error), 'error', connector.name || slug);
            } finally {
              state.arenaConnectorBusy.delete(slug);
              refreshConnectorSurfaces();
            }
          }
        }
      ]
    });
  }

  function arenaConnectorRow(item) {
    const busy = state.arenaConnectorBusy.has(item.slug);
    const connected = Boolean(item.connected || item.auth_status === 'connected');
    const enabled = connected && !state.arenaConnectorsOff.has(item.slug);
    const unusable = item.auth_status === 'unusable';
    const logo = connectorLogoNode(item);
    const main = el('div', { class: 'arena-connector-main' },
      el('div', { class: 'connector-main' },
        el('span', { class: 'connector-status-dot', 'aria-hidden': 'true' }),
        el('span', { class: 'connector-name', title: item.name, text: item.name }),
        el('span', { class: 'connector-meta', text: busy ? "Connecting…" : arenaConnectorStatusLabel(item) })
      ),
      item.description ? el('p', { class: 'connector-desc', text: item.description }) : null
    );
    const actions = el('div', { class: 'connector-actions' });
    if (connected) {
      const toggle = el('input', {
        type: 'checkbox', class: 'switch-input', checked: enabled, disabled: busy,
        'aria-label': `Use ${item.name} in Agent Mode`
      });
      toggle.addEventListener('change', () => setArenaConnectorEnabled(item, toggle.checked));
      actions.appendChild(el('label', { class: 'switch-row', title: 'Available to Arena Agent in Agent Mode' },
        el('span', { class: 'switch-label', text: enabled ? 'On' : 'Off' }),
        el('span', { class: 'switch' }, toggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))
      ));
      actions.appendChild(el('button', {
        class: 'button button-quiet', type: 'button', disabled: busy,
        onclick: () => disconnectArenaConnectorFlow(item)
      }, el('span', { text: busy ? "Turning off…" : "Disconnect" })));
    } else {
      actions.appendChild(el('button', {
        class: 'button', type: 'button', disabled: busy || unusable,
        onclick: () => void connectArenaConnectorFlow(item)
      }, el('span', { text: busy ? "Connecting…" : (unusable ? "Unavailable" : "Connect") })));
    }
    return el('article', { class: `connector-card arena-connector-row${connected ? ' is-connected' : ''}${connected && !enabled ? ' is-off' : ''}` },
      el('div', { class: 'arena-connector-head' }, logo, main),
      actions
    );
  }

  function renderArenaConnectorsInto(node) {
    node.appendChild(el('div', { class: 'connector-group-title' },
      el('span', { text: 'Arena connectors' }),
      el('span', { class: 'connector-group-hint', text: 'Cloud apps for the Arena Agent' })));
    node.appendChild(el('div', { class: 'connector-group-note', text: "Agent Mode only — these work with Arena Agent. The switch picks which connected ones it may use." }));
    if (state.arenaConnectorsLoading && !state.arenaConnectors) {
      node.appendChild(el('div', { class: 'connector-empty' }, el('span', { class: 'mini-spinner' }), el('span', { text: " Loading account connectors…" })));
      return;
    }
    if (!state.authenticated) {
      node.appendChild(el('div', { class: 'connector-empty', text: "Log in to Arena to see the official connectors of your account. New Arena connectors will appear here automatically." }));
      return;
    }
    if (!state.arenaConnectors && state.arenaConnectorsError) {
      node.append(
        el('div', { class: 'connector-empty', text: state.arenaConnectorsError }),
        el('button', { class: 'button button-small button-quiet', type: 'button', onclick: () => void loadArenaConnectors() },
          iconEl('refresh'), el('span', { text: "Retry" }))
      );
      return;
    }
    if (!state.arenaConnectors) {
      node.append(
        el('div', { class: 'connector-empty', text: "The list of official connectors is taken from your arena.ai account." }),
        el('button', { class: 'button button-small button-quiet', type: 'button', onclick: () => void loadArenaConnectors() },
          iconEl('refresh'), el('span', { text: "Load Arena list" }))
      );
      return;
    }
    const list = arenaConnectorsList();
    if (!list.length) {
      node.appendChild(el('div', { class: 'connector-empty', text: "Arena did not return a list of connectors for this account." }));
      return;
    }
    list.forEach((item) => node.appendChild(arenaConnectorRow(item)));
    node.appendChild(el('div', { class: 'connector-note', text: 'The list and statuses come from your arena.ai account: new connectors appear automatically. The Local Agent uses the MCP servers below instead.' }));
  }

  function connectorStatusLabel(server) {
    if (!server?.enabled) return "Off";
    if (server.status === 'connected' || server.running) return "Connected";
    if (server.status === 'unsupported') return "HTTP not supported.";
    if (server.status === 'error') return "Error";
    return "Not connected";
  }

  function renderConnectorsPanel() {
    const servers = connectorServersList();
    const arenaList = arenaConnectorsList();
    const connected = servers.filter((server) => server.running || server.status === 'connected').length
      + arenaList.filter((item) => item.connected || item.auth_status === 'connected').length;
    const total = servers.length + arenaList.length;
    if (els.connectorsNavCount) {
      els.connectorsNavCount.textContent = (state.connectors || state.arenaConnectors) ? `${connected}/${total}` : '—';
      els.connectorsNavCount.title = total ? `Connected connectors: ${connected} from ${total} (Arena and local MCP)` : "Connectors not added";
    }
    const node = els.connectorList;
    if (!node) return;
    const scrollTop = node.scrollTop;
    clear(node);
    node.setAttribute('aria-busy', String(state.connectorsLoading || state.arenaConnectorsLoading));
    renderArenaConnectorsInto(node);
    node.appendChild(el('div', { class: 'connector-group-title connector-group-row' },
      el('span', { class: 'connector-group-name' },
        el('span', { text: 'Local MCP servers' }),
        el('span', { class: 'connector-group-hint', text: 'Run on this computer, from mcp.json' })),
      el('span', { class: 'connector-group-actions' },
        el('button', {
          class: 'button button-small button-quiet', type: 'button', title: 'Edit mcp.json',
          onclick: () => els.openMcpJsonButton?.click()
        }, iconEl('braces'), el('span', { text: 'mcp.json' })),
        el('button', {
          class: 'button button-small', type: 'button',
          onclick: () => openAddConnectorModal('local')
        }, iconEl('plus'), el('span', { text: 'Add' })))
    ));
    if (state.connectorsLoading && !state.connectors) {
      node.appendChild(el('div', { class: 'connector-empty' }, el('span', { class: 'mini-spinner' }), el('span', { text: " Loading connectors…" })));
      return;
    }
    if (!state.connectors && state.connectorsError) {
      node.append(
        el('div', { class: 'connector-empty', text: state.connectorsError }),
        el('button', { class: 'button button-small button-quiet', type: 'button', onclick: () => void loadConnectors({ reload: true }) },
          iconEl('refresh'), el('span', { text: "Retry" }))
      );
      return;
    }
    if (state.connectors?.config_error) {
      node.appendChild(el('div', { class: 'connector-card is-error' },
        el('div', { class: 'connector-name', text: "Error in mcp.json" }),
        el('p', { class: 'connector-error', text: state.connectors.config_error }),
        el('p', { class: 'connector-desc', text: "Fix the JSON and click the reread button below." })
      ));
    }
    if (!servers.length) {
      node.appendChild(el('div', { class: 'connector-empty', text: "Local MCP not added yet. Click \"Add\": there are ready servers, a special JSON, and a CLI command." }));
      return;
    }
    servers.forEach((server) => {
      const name = String(server.name || server.id || '');
      const busy = state.connectorBusy.has(name);
      const isConnected = Boolean(server.running || server.status === 'connected');
      const tools = Array.isArray(server.tools) ? server.tools : [];
      const toolsLabel = tools.length
        ? `${tools.slice(0, 6).map((tool) => tool.name).filter(Boolean).join(', ')}${tools.length > 6 ? ` and also ${tools.length - 6}` : ''}`
        : '';
      const unsupported = server.status === 'unsupported' || server.transport === 'http';
      const card = el('article', {
        class: `connector-card${isConnected ? ' is-connected' : ''}${server.status === 'error' || server.error ? ' is-error' : ''}${!server.enabled ? ' is-disabled' : ''}`
      },
        el('div', { class: 'connector-main' },
          connectorLogoNode(server),
          el('span', { class: 'connector-status-dot', 'aria-hidden': 'true' }),
          el('span', { class: 'connector-name', title: name, text: name }),
          el('span', { class: 'connector-meta', text: `${connectorStatusLabel(server)}${isConnected ? ` · ${tools.length} tools` : ''}` })
        ),
        server.description ? el('p', { class: 'connector-desc', text: server.description }) : null,
        server.command_display ? el('div', { class: 'connector-command', title: server.command_display, text: server.command_display }) : null,
        toolsLabel ? el('div', { class: 'connector-tools', title: tools.map((tool) => tool.name).join(', '), text: `Tools: ${toolsLabel}` }) : null,
        unsupported ? el('p', { class: 'connector-error', text: "Remote HTTP/SSE MCP is not supported by this version yet. Add the same server as a local STDIO CLI command." }) : null,
        server.error ? el('p', { class: 'connector-error', text: String(server.error) }) : null
      );
      const actions = el('div', { class: 'connector-actions' });
      const addAction = (label, handler, { disabled = false, danger = false } = {}) => {
        const button = el('button', {
          class: `button${danger ? ' button-danger' : ' button-quiet'}`, type: 'button', disabled,
          onclick: () => void handler()
        }, el('span', { text: label }));
        actions.appendChild(button);
        return button;
      };
      addAction(busy ? "Connecting…" : (isConnected ? "Check" : (server.status === 'error' ? "Retry" : "Connect")),
        () => runConnectorAction(name, () => API.connectConnector(name), `Connector ${name} connected.`),
        { disabled: busy || !server.enabled || unsupported });
      if (isConnected) {
        addAction("Disconnect", () => runConnectorAction(name, () => API.disconnectConnector(name), `Connector ${name} stopped.`), { disabled: busy });
      }
      addAction(server.enabled ? "Turn off" : "Turn on",
        () => runConnectorAction(name, () => API.setConnectorEnabled(name, !server.enabled), server.enabled ? `Connector ${name} off.` : `Connector ${name} on.`),
        { disabled: busy });
      addAction("Delete", () => confirmDeleteConnector(server), { disabled: busy, danger: true });
      card.appendChild(actions);
      node.appendChild(card);
    });
    node.scrollTop = scrollTop;
  }

  async function runConnectorAction(name, action, successMessage = '') {
    if (!name || state.connectorBusy.has(name)) return null;
    state.connectorBusy.add(name);
    renderConnectorsPanel();
    try {
      const payload = await action();
      if (payload && typeof payload === 'object' && (Array.isArray(payload.servers) || payload.server)) {
        applyConnectorsPayload(payload);
      } else {
        await loadConnectors({ silent: true });
      }
      const server = payload?.server || connectorServersList().find((item) => String(item.name) === String(name));
      if (server?.status === 'error') {
        toast(server.error || "MCP server did not start. Check the command and installed dependencies.", 'warning', `Connector ${name}`);
      } else if (server?.status === 'unsupported') {
        toast("Remote HTTP/SSE MCP is not supported yet; a local STDIO server is needed.", 'warning', `Connector ${name}`);
      } else if (successMessage) {
        toast(successMessage, 'success');
      }
      return payload;
    } catch (error) {
      toast(errorMessage(error), 'error', `Connector ${name}`);
      await loadConnectors({ silent: true });
      return null;
    } finally {
      state.connectorBusy.delete(name);
      renderConnectorsPanel();
    }
  }

  function confirmDeleteConnector(server) {
    const name = String(server?.name || server?.id || '');
    if (!name) return;
    mountModal({
      title: "Delete the connector?",
      subtitle: name,
      size: 'small',
      content: el('p', { class: 'modal-copy', text: "The entry will be deleted from ~/.arena-personal/mcp.json, and the running MCP process stopped. The installed software and its files will not be deleted." }),
      actions: [
        { label: "Cancel", variant: 'quiet' },
        {
          label: "Delete", variant: 'danger', icon: 'trash',
          onClick: async () => { await runConnectorAction(name, () => API.deleteConnector(name), `Connector ${name} deleted.`); }
        }
      ]
    });
  }

  async function openConnectorConfig({ silent = false } = {}) {
    try {
      const result = await API.openConnectorConfig();
      const path = String(result?.path || state.connectors?.config_path || '~/.arena-personal/mcp.json');
      if (!silent) toast(`File opened: ${path}. After saving, click reread list.`, 'success', 'MCP JSON');
      return path;
    } catch (error) {
      toast(errorMessage(error), 'error', "MCP JSON is not open");
      return null;
    }
  }

  function parseEnvTextarea(value) {
    const env = {};
    String(value || '').split(/\r?\n/).forEach((line, index) => {
      const clean = line.trim();
      if (!clean || clean.startsWith('#')) return;
      const eq = clean.indexOf('=');
      if (eq <= 0) throw new ApiError(`env line ${index + 1}: required format NAME=value.`);
      const key = clean.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new ApiError(`env line ${index + 1}: incorrect variable name.`);
      let item = clean.slice(eq + 1).trim();
      if ((item.startsWith('"') && item.endsWith('"')) || (item.startsWith("'") && item.endsWith("'"))) item = item.slice(1, -1);
      env[key] = item;
    });
    return env;
  }

  function openConnectorJsonOpenedModal(path) {
    const content = el('div', {},
      el('div', { class: 'note-box' }, iconEl('check'), el('span', { text: "The special MCP file is already open in the system editor." })),
      el('p', { class: 'modal-copy', text: "Add servers to the mcpServers object, save the file, then come back here and click 'Reload'. Local STDIO servers with command, args, env, and cwd are supported." }),
      el('div', { class: 'permission-detail-label', text: "File path" }),
      el('pre', { class: 'permission-detail', text: path })
    );
    mountModal({
      title: "MCP JSON is open",
      subtitle: 'Arena Desktop · ~/.arena-personal/mcp.json',
      size: 'medium',
      content,
      actions: [
        { label: "Close", variant: 'quiet' },
        {
          label: "I saved it — reload", variant: 'primary', icon: 'refresh', autofocus: true,
          onClick: async () => {
            await loadConnectors({ reload: true });
            setWorkspacePanelOpen(true, { focusConnectors: true, load: false });
            toast("MCP configuration reloaded.", 'success');
          }
        }
      ]
    });
  }

  function openAddConnectorModal(section = 'all') {
    const localOnly = section === 'local';
    const wrap = el('div');
    const render = () => {
      clear(wrap);
      if (!localOnly) {
      wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'Official Arena connectors' }));
      const arenaBox = el('div', { class: 'arena-connector-list' });
      if (!state.authenticated) {
        arenaBox.appendChild(el('div', { class: 'connector-empty', text: "Log in to Arena to connect official connectors to your account directly from the app." }));
      } else if (state.arenaConnectorsLoading && !state.arenaConnectors) {
        arenaBox.appendChild(el('div', { class: 'connector-empty' }, el('span', { class: 'mini-spinner' }), el('span', { text: " Loading Arena catalog…" })));
      } else if (!state.arenaConnectors && state.arenaConnectorsError) {
        arenaBox.append(
          el('div', { class: 'connector-empty', text: state.arenaConnectorsError }),
          el('button', { class: 'button button-small button-quiet', type: 'button', onclick: () => void loadArenaConnectors().then(render) },
            iconEl('refresh'), el('span', { text: "Retry" }))
        );
      } else if (!arenaConnectorsList().length) {
        arenaBox.appendChild(el('div', { class: 'connector-empty', text: "Arena did not return a list of connectors for this account." }));
      } else {
        arenaConnectorsList().forEach((item) => arenaBox.appendChild(arenaConnectorRow(item)));
      }
      wrap.appendChild(arenaBox);
      wrap.appendChild(el('p', { class: 'field-help', text: 'The catalog and statuses come live from your arena.ai account: new official connectors appear automatically. Connected connectors are available to Arena Agent here.' }));
      }

      wrap.appendChild(el('div', { class: 'note-box' }, iconEl('plug'), el('span', {
        text: "Local MCP servers run on your computer under your user rights. Their tools will appear in the local Agent; external and modifying actions still go through the permission mode."
      })));
      wrap.appendChild(el('h3', { class: 'modal-section-title', text: "Ready local MCP servers" }));
      const grid = el('div', { class: 'connector-preset-grid' });
      const presets = connectorPresetsList();
      if (!presets.length) {
        grid.appendChild(el('div', { class: 'connector-empty', text: state.connectorsLoading ? "Loading MCP list…" : (state.connectorsError || "MCP preset list not available.") }));
      }
      presets.forEach((preset) => {
        const installed = Boolean(preset.installed || connectorServersList().some((server) => server.preset_id === preset.id || server.name === preset.id));
        const docs = safeUrl(preset.docs || '');
        const main = el('div', { class: 'connector-preset-main' },
          el('div', { class: 'connector-preset-title', text: `${preset.name}${preset.vendor ? ` · ${preset.vendor}` : ''}` }),
          el('p', { class: 'connector-preset-desc', text: preset.description || '' }),
          preset.requirements ? el('p', { class: 'connector-preset-desc', text: `Required: ${preset.requirements}` }) : null,
          docs ? el('a', { href: docs, target: '_blank', rel: 'noopener noreferrer', text: "Documentation" }) : null
        );
        const button = el('button', {
          class: 'button button-small', type: 'button', disabled: installed,
          onclick: () => openPresetConnectorModal(preset)
        }, el('span', { text: installed ? "Added" : "Connect" }));
        grid.appendChild(el('div', { class: `connector-preset${installed ? ' is-configured' : ''}` }, main, button));
      });
      wrap.appendChild(grid);

      wrap.appendChild(el('h3', { class: 'modal-section-title', text: "Add MCP" }));
      const methods = el('div', { class: 'connector-method-cards' },
        el('button', {
          class: 'connector-method-card', type: 'button',
          onclick: async () => {
            const path = await openConnectorConfig({ silent: true });
            if (path) openConnectorJsonOpenedModal(path);
          }
        }, iconEl('braces'), el('span', {},
          el('strong', { text: "Special JSON file" }),
          el('span', { text: "~/.arena-personal/mcp.json will open automatically. Add mcpServers and save." }))),
        el('button', {
          class: 'connector-method-card', type: 'button',
          onclick: () => openCliConnectorModal()
        }, iconEl('terminal'), el('span', {},
          el('strong', { text: "CLI command" }),
          el('span', { text: "For example: npx -y @modelcontextprotocol/server-filesystem C:\\Projects or uvx mcp-server-fetch." })))
      );
      wrap.appendChild(methods);
      if (state.connectors?.config_path) {
        wrap.appendChild(el('p', { class: 'field-help', text: `Configuration file: ${state.connectors.config_path}` }));
      }
      const reloadRow = el('div', { class: 'setting-actions' },
        el('button', {
          class: 'button button-small button-quiet', type: 'button',
          onclick: async () => { await loadConnectors({ reload: true }); render(); toast("MCP configuration reloaded.", 'success'); }
        }, iconEl('refresh'), el('span', { text: "Reload mcp.json" }))
      );
      wrap.appendChild(reloadRow);
    };
    addConnectorModalRender = render;
    render();
    mountModal({
      title: localOnly ? 'Add MCP server' : 'Add connector',
      subtitle: localOnly ? 'Ready-made presets, JSON config or a CLI command' : 'Official Arena connectors and local MCP servers',
      size: 'large',
      content: wrap,
      actions: [{ label: 'Close', variant: 'primary', autofocus: true }]
    });
    if (!state.connectors) void loadConnectors({ silent: true }).then(render);
    if (!localOnly && state.authenticated && !state.arenaConnectors) void loadArenaConnectors({ silent: true }).then(render);
  }

  function connectorFieldInput(field) {
    const type = String(field?.type || 'text');
    if (type === 'checkbox') {
      return el('input', { type: 'checkbox', checked: field.default !== false });
    }
    return el('input', {
      class: `input${type === 'password' || field.key === 'path' ? ' mono' : ''}`,
      type: type === 'password' ? 'password' : 'text',
      value: field.default ?? '',
      autocomplete: type === 'password' ? 'new-password' : 'off',
      spellcheck: 'false'
    });
  }

  function openPresetConnectorModal(preset) {
    const Fields = Array.isArray(preset.Fields) ? preset.Fields : (Array.isArray(preset.fields) ? preset.fields : []);
    const refs = {};
    const wrap = el('div', {},
      el('p', { class: 'modal-copy', text: preset.description || '' }),
      preset.requirements ? el('div', { class: 'note-box' }, iconEl('info'), el('span', { text: `Before connecting, the following must be installed: ${preset.requirements}. Arena Desktop does not install Node.js, uv, or Docker automatically.` })) : null
    );
    Fields.forEach((field) => {
      const input = connectorFieldInput(field);
      refs[field.key] = { field, input };
      const id = `connector-field-${preset.id}-${field.key}`;
      input.id = id;
      if (field.type === 'checkbox') {
        wrap.appendChild(el('label', { class: 'field-label', for: id }, input, el('span', { text: ` ${field.label || field.key}` })));
      } else {
        wrap.append(
          el('label', { class: 'field-label', for: id, text: field.label || field.key }),
          input,
          field.help ? el('p', { class: 'field-help', text: field.help }) : null
        );
      }
    });
    if (preset.id === 'github') {
      wrap.appendChild(el('div', { class: 'note-box is-warning' }, iconEl('lock'), el('span', {
        text: "If you insert the token here, it will be saved locally in ~/.arena-personal/mcp.json in plain text. It is safer to leave the field blank and set the system variable GITHUB_PERSONAL_ACCESS_TOKEN."
      })));
    }
    const connectNow = el('input', { type: 'checkbox', checked: true, id: `connector-connect-${preset.id}` });
    wrap.appendChild(el('label', { class: 'field-label', for: connectNow.id }, connectNow, el('span', { text: " Connect and check immediately" })));
    mountModal({
      title: preset.name,
      subtitle: preset.vendor ? `Ready local MCP · ${preset.vendor}` : "Ready local MCP",
      size: 'medium',
      content: wrap,
      actions: [
        { label: "Cancel", variant: 'quiet' },
        {
          label: "Add", variant: 'primary', icon: 'plug', autofocus: !Fields.length,
          onClick: async () => {
            const values = {};
            for (const [key, ref] of Object.entries(refs)) {
              const value = ref.field.type === 'checkbox' ? Boolean(ref.input.checked) : String(ref.input.value || '').trim();
              if (ref.field.required && !value) throw new ApiError(`Fill in the field "${ref.field.label || key}».`);
              values[key] = value;
            }
            const payload = await API.installConnectorPreset(preset.id, values, Boolean(connectNow.checked));
            applyConnectorsPayload(payload);
            setWorkspacePanelOpen(true, { focusConnectors: true, load: false });
            const server = payload?.server;
            if (connectNow.checked && server?.status === 'error') toast(server.error || "Server added, but did not start.", 'warning', preset.name);
            else if (connectNow.checked) toast(`Connector ${preset.name} connected.`, 'success');
            else toast(`Connector ${preset.name} added. Click 'Connect' when you are ready.`, 'success');
          }
        }
      ]
    });
  }

  function openCliConnectorModal() {
    const nameInput = el('input', { class: 'input mono', type: 'text', placeholder: 'my-server', autocomplete: 'off', spellcheck: 'false' });
    const commandInput = el('textarea', { class: 'input mono', rows: '3', placeholder: 'npx -y @modelcontextprotocol/server-filesystem C:\\Projects', spellcheck: 'false' });
    const cwdInput = el('input', { class: 'input mono', type: 'text', placeholder: "Optional — default Workspace", autocomplete: 'off', spellcheck: 'false' });
    const envInput = el('textarea', { class: 'input mono', rows: '4', placeholder: 'API_KEY=${MY_API_KEY}\nDEBUG=0', spellcheck: 'false' });
    const descInput = el('input', { class: 'input', type: 'text', placeholder: "What this server does (optional)", autocomplete: 'off' });
    const connectNow = el('input', { type: 'checkbox', checked: true });
    const wrap = el('div', {},
      el('div', { class: 'note-box is-warning' }, iconEl('shield-alert'), el('span', {
        text: "This command will run locally when connected and when using the Agent. Add only MCP servers you trust."
      })),
      el('label', { class: 'field-label', text: "Name" }), nameInput,
      el('p', { class: 'field-help', text: "Latin letters, numbers, period, hyphen, and underscore." }),
      el('label', { class: 'field-label', text: "MCP STDIO CLI command" }), commandInput,
      el('p', { class: 'field-help', text: "The command must communicate via MCP through stdin/stdout. Remote URL is not suitable here." }),
      el('label', { class: 'field-label', text: "Working folder (optional)" }), cwdInput,
      el('label', { class: 'field-label', text: "Environment variables (one per line)" }), envInput,
      el('p', { class: 'field-help', text: "For secrets, links of the form ${VARIABLE_NAME} are preferable: the value will be taken from the system environment and will not appear in mcp.json." }),
      el('label', { class: 'field-label', text: "Description" }), descInput,
      el('label', { class: 'field-label' }, connectNow, el('span', { text: " Connect and check immediately" }))
    );
    mountModal({
      title: "Add MCP via CLI",
      subtitle: "Local STDIO server in ~/.arena-personal/mcp.json",
      size: 'large',
      content: wrap,
      actions: [
        { label: "Cancel", variant: 'quiet' },
        {
          label: "Add", variant: 'primary', icon: 'plug',
          onClick: async () => {
            const name = nameInput.value.trim();
            const command = commandInput.value.trim();
            if (!name) throw new ApiError("Enter the connector name.");
            if (!command) throw new ApiError("Enter the CLI command.");
            const payload = await API.addConnectorCli({
              name,
              command,
              cwd: cwdInput.value.trim(),
              env: parseEnvTextarea(envInput.value),
              description: descInput.value.trim(),
              connect: Boolean(connectNow.checked)
            });
            applyConnectorsPayload(payload);
            setWorkspacePanelOpen(true, { focusConnectors: true, load: false });
            const server = payload?.server;
            if (connectNow.checked && server?.status === 'error') toast(server.error || "Server added, but did not start.", 'warning', name);
            else if (connectNow.checked) toast(`Connector ${name} connected.`, 'success');
            else toast(`Connector ${name} added.`, 'success');
          }
        }
      ]
    });
    window.setTimeout(() => nameInput.focus(), 30);
  }

  /* ---------------------------------------------------------------------- */
  /* Elements and event wiring                                             */