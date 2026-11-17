  /* ---------------------------------------------------------------------- */
  /* Code-mode project files: a small tree of the chat's own project folder, */
  /* shown above the composer and refreshed while the sandbox writes files.  */
  /* Clicking a file opens the same preview/editor as the workspace panel.   */
  /* ---------------------------------------------------------------------- */

  const chatProject = {
    chatId: null,
    rel: '',
    name: '',
    open: true,
    ready: false,
    loading: false,
    error: '',
    expanded: new Set(),
    dirs: new Map()
  };
  let chatProjectTimer = null;

  function chatProjectPanelEl() {
    return document.getElementById('chatProjectPanel');
  }

  function resetChatProject() {
    chatProject.chatId = null;
    chatProject.rel = '';
    chatProject.name = '';
    chatProject.ready = false;
    chatProject.loading = false;
    chatProject.error = '';
    chatProject.expanded = new Set();
    chatProject.dirs = new Map();
    const panel = chatProjectPanelEl();
    if (panel) panel.hidden = true;
    clear(panel || document.createElement('div'));
  }

  async function setupChatProject(chatId, modality) {
    resetChatProject();
    const canonical = ({ chat: 'text', webdev: 'code' })[modality] || modality;
    if (!chatId || canonical !== 'code') return;
    const panel = chatProjectPanelEl();
    if (!panel) return;
    chatProject.chatId = String(chatId);
    chatProject.loading = true;
    panel.hidden = false;
    renderChatProjectPanel();
    try {
      const info = await API.getChatProject(chatId);
      if (String(chatProject.chatId) !== String(chatId)) return;
      if (!info || info.demo || typeof info.rel === 'string') {
        chatProject.rel = String(info?.rel ?? '.');
        chatProject.name = String(info?.name || 'Project');
        chatProject.ready = true;
        await loadChatProjectDir(chatProject.rel);
      } else {
        chatProject.error = 'The project folder for this chat is not available.';
      }
    } catch (error) {
      if (String(chatProject.chatId) !== String(chatId)) return;
      chatProject.error = errorMessage(error);
    }
    chatProject.loading = false;
    renderChatProjectPanel();
  }

  async function loadChatProjectDir(path) {
    try {
      const data = await API.getWorkspaceTree(path);
      chatProject.dirs.set(path, Array.isArray(data?.entries) ? data.entries : []);
      chatProject.error = '';
    } catch (error) {
      chatProject.error = errorMessage(error);
    }
    renderChatProjectPanel();
  }

  function scheduleChatProjectRefresh() {
    if (!chatProject.ready || !chatProject.chatId) return;
    if (chatProjectTimer) return;
    chatProjectTimer = setTimeout(() => {
      chatProjectTimer = null;
      void refreshChatProject();
    }, 600);
  }

  async function refreshChatProject() {
    if (!chatProject.ready || !chatProject.chatId) return;
    const paths = [chatProject.rel, ...Array.from(chatProject.expanded)];
    await Promise.all(paths.map((path) => loadChatProjectDir(path).catch(() => {})));
    renderChatProjectPanel();
  }

  function chatProjectRow(entry, depth) {
    const row = el('div', {
      class: `chat-project-row${entry.is_dir ? ' is-dir' : ''}`,
      role: 'treeitem',
      'data-path': entry.path,
      style: `padding-left:${depth * 14}px`,
      title: entry.path
    });
    row.appendChild(el('span', { class: 'chat-project-caret', 'aria-hidden': 'true' },
      entry.is_dir ? iconEl('chevron-right') : iconEl('file')));
    row.appendChild(el('span', { class: 'chat-project-name', text: entry.name }));
    if (entry.is_dir) {
      row.addEventListener('click', () => {
        if (chatProject.expanded.has(entry.path)) {
          chatProject.expanded.delete(entry.path);
          renderChatProjectPanel();
        } else {
          chatProject.expanded.add(entry.path);
          renderChatProjectPanel();
          if (!chatProject.dirs.has(entry.path)) void loadChatProjectDir(entry.path);
        }
      });
    } else {
      row.addEventListener('click', () => {
        void openWorkspaceFilePreview(entry);
      });
    }
    return row;
  }

  function chatProjectChildren(path, depth, out) {
    const entries = chatProject.dirs.get(path) || [];
    for (const entry of entries) {
      out.push(chatProjectRow(entry, depth));
      if (entry.is_dir && chatProject.expanded.has(entry.path)) {
        chatProjectChildren(entry.path, depth + 1, out);
      }
    }
  }

  function renderChatProjectPanel() {
    const panel = chatProjectPanelEl();
    if (!panel) return;
    if (!chatProject.chatId) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    clear(panel);
    const head = el('button', {
      class: 'chat-project-head',
      type: 'button',
      'aria-expanded': String(chatProject.open)
    });
    head.appendChild(iconEl('folder', 'chat-project-icon'));
    head.appendChild(el('span', { class: 'chat-project-title', text: chatProject.name || 'Project files' }));
    if (chatProject.loading) head.appendChild(el('span', { class: 'mini-spinner' }));
    head.addEventListener('click', () => {
      chatProject.open = !chatProject.open;
      renderChatProjectPanel();
    });
    const refresh = el('button', {
      class: 'button button-small button-quiet chat-project-refresh',
      type: 'button',
      title: 'Refresh the file tree'
    }, iconEl('refresh'), el('span', { text: 'Refresh' }));
    refresh.addEventListener('click', (event) => {
      event.stopPropagation();
      void refreshChatProject();
    });
    head.appendChild(refresh);
    panel.appendChild(head);
    if (!chatProject.open) return;
    const body = el('div', { class: 'chat-project-body', role: 'tree' });
    if (chatProject.error && !chatProject.dirs.size) {
      body.appendChild(el('div', { class: 'workspace-tree-error', text: chatProject.error }));
    } else {
      const rows = [];
      chatProjectChildren(chatProject.rel, 1, rows);
      if (!rows.length) {
        body.appendChild(el('div', { class: 'workspace-tree-empty',
          text: chatProject.loading ? 'Loading files…' : 'No files yet - they appear here as the AI writes them.' }));
      }
      rows.forEach((row) => body.appendChild(row));
      if (chatProject.error) body.appendChild(el('div', { class: 'workspace-tree-error', text: chatProject.error }));
    }
    panel.appendChild(body);
  }
