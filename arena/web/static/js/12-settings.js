  /* ---------------------------------------------------------------------- */

  async function loadPermissionModeFromServer({ quiet = true } = {}) {
    if (state.serverError) return null;
    try {
      const raw = await API.getPermissionMode();
      const candidate = validPermissionMode(raw?.mode ?? raw?.permission_mode ?? raw);
      if (candidate) {
        state.permissionMode = candidate;
        updateComposerState();
      }
      return state.permissionMode;
    } catch (error) {
      if (!quiet) toast(errorMessage(error), 'error', "Permission mode not obtained");
      return null;
    }
  }

  async function loadWorkspaceFromServer({ quiet = true } = {}) {
    if (state.serverError) return state.workspace;
    try {
      const raw = await API.getWorkspace();
      const path = normalizeWorkspace(raw);
      if (path && path !== state.workspace) {
        state.workspace = path;
        state.workspacePanelRoot = '';
        resetWorkspaceTree();
        updateComposerState();
        renderWorkspaceTreePanel();
        scheduleWorkspaceTreeRefresh(0);
      }
      return state.workspace;
    } catch (error) {
      if (!quiet) toast(errorMessage(error), 'error', "Working folder not received");
      return state.workspace;
    }
  }

  function settingsActionButton(label, icon, onClick, { variant = 'quiet', disabled = false, title = '' } = {}) {
    const button = el('button', {
      class: `button button-small${variant === 'quiet' ? ' button-quiet' : variant === 'danger' ? ' button-danger' : ''}`,
      type: 'button',
      disabled,
      title: title || false
    }, icon ? iconEl(icon) : null, el('span', { text: label }));
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await onClick({ button }); } catch (error) { toast(errorMessage(error), 'error'); }
      finally { if (button.isConnected) button.disabled = false; }
    });
    return button;
  }


  function openSettings(initialTab = 'connection') {
    const tabDefs = [
      { id: 'connection', label: 'Account', icon: 'user' },
      { id: 'permissions', label: 'Permissions', icon: 'shield' },
      { id: 'workspace', label: 'Folder', icon: 'folder' },
      { id: 'memory', label: 'Memory', icon: 'layers' },
      { id: 'automations', label: 'Automations', icon: 'clock' },
      { id: 'usage', label: 'Usage', icon: 'chart' },
      { id: 'gateway', label: 'Gateway', icon: 'globe' },
      { id: 'components', label: 'Components', icon: 'package' },
      { id: 'about', label: 'About', icon: 'info' }
    ];
    let currentTab = tabDefs.some((tab) => tab.id === initialTab) ? initialTab : 'connection';
    state.settingsTab = currentTab;
    const hydrated = {};
    const tabsBar = el('div', { class: 'settings-tabs', role: 'tablist', 'aria-label': 'Settings sections', 'aria-orientation': 'vertical' });
    const panel = el('div', { class: 'settings-panels', role: 'tabpanel', id: 'settings-panel' });
    const layout = el('div', { class: 'settings-layout' }, tabsBar, panel);
    const tabButtons = {};

    tabDefs.forEach((tab) => {
      const button = el('button', {
        class: 'settings-tab',
        type: 'button', role: 'tab', id: `settings-tab-${tab.id}`,
        'aria-selected': String(tab.id === currentTab), 'aria-controls': 'settings-panel',
        tabindex: tab.id === currentTab ? '0' : '-1'
      }, iconEl(tab.icon), el('span', { text: tab.label }));
      button.addEventListener('click', () => selectTab(tab.id, true));
      tabButtons[tab.id] = button;
      tabsBar.appendChild(button);
    });
    tabsBar.addEventListener('keydown', (event) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = tabDefs.findIndex((tab) => tab.id === currentTab);
      let nextIndex = index;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (index + 1) % tabDefs.length;
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = (index - 1 + tabDefs.length) % tabDefs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabDefs.length - 1;
      selectTab(tabDefs[nextIndex].id, true);
    });

    function renderConnectionPanel() {
      const wrap = el('div');
      const account = el('div', { class: 'account-status-card' },
        accountAvatarNode(),
        el('div', { class: 'account-status-copy' },
          el('span', { class: 'account-status-name', text: state.authenticated ? (state.fullName || state.email || 'Signed in') : 'Not signed in' }),
          el('span', { class: 'account-status-email', text: state.loginPending ? 'Waiting for sign-in…' : state.demo ? 'Demo profile' : state.authenticated ? (state.email || 'Signed in to Arena') : 'Sign in to chat on Arena' })
        ),
        el('span', { class: 'status-dot ' + (state.authenticated ? 'is-online' : 'is-pending'), 'aria-hidden': 'true' })
      );
      wrap.appendChild(account);

      const actions = el('div', { class: 'setting-actions' });
      if (!state.authenticated) {
        actions.appendChild(settingsActionButton(
          state.loginPending ? 'Waiting for sign-in…' : 'Sign in',
          state.loginPending ? 'refresh' : 'login',
          async () => { await startLogin(); refreshPanel(); },
          { variant: 'primary', disabled: state.loginPending || Boolean(state.serverError) || state.networkOffline }
        ));
      } else {
        actions.appendChild(settingsActionButton('Log out', 'logout', async () => { await logoutAccount(); refreshPanel(); }));
      }
      actions.appendChild(settingsActionButton('Open arena.ai window', 'external', async () => {
        if (state.engineOpen) await hideEngine(); else await showEngine();
      }, { disabled: Boolean(state.serverError) }));
      wrap.appendChild(actions);
      wrap.appendChild(el('p', { class: 'setting-desc', text: 'Sign-in and human checks open in their own window and close by themselves when you are done.' }));

      if (!state.demo) {
        wrap.appendChild(el('h3', { class: 'modal-section-title', text: state.authenticated ? 'Add an account with cookies' : 'Sign in with cookies' }));
        wrap.appendChild(el('p', { class: 'modal-copy', text: 'On arena.ai in your browser: DevTools → Application → Cookies → arena.ai. Copy the arena-auth-prod-v1 lines as name=value pairs and paste them here.' + (state.authenticated ? ' The new account becomes current; your saved accounts stay in the account menu.' : '') }));
        const cookieField = el('textarea', { class: 'input mono cookie-field', rows: '3', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
          'aria-label': 'Arena cookies', placeholder: 'arena-auth-prod-v1.0=…; arena-auth-prod-v1.1=…' });
        const importButton = settingsActionButton(state.authenticated ? 'Add account with cookies' : 'Sign in with cookies', 'login', async () => {
          const cookie = cookieField.value.trim();
          cookieField.value = '';
          if (!cookie) { toast('Paste the cookies first.', 'warning'); return; }
          await loginWithCookie(cookie);
        }, { disabled: state.loginPending || Boolean(state.serverError) || state.networkOffline });
        wrap.append(cookieField, el('div', { class: 'setting-actions', style: { marginTop: '8px' } }, importButton));
        wrap.appendChild(el('p', { class: 'field-help', text: 'Cookies give full access to your account — never share them. They are stored only on this computer.' }));
      }
      if (state.serverError) {
        wrap.appendChild(el('div', { class: 'note-box is-danger', style: { marginTop: '10px' } }, iconEl('wifi-off'), el('span', { text: state.serverError })));
      } else if (state.status?.session_error) {
        wrap.appendChild(el('div', { class: 'note-box is-danger', style: { marginTop: '10px' } }, iconEl('alert'), el('span', { text: `Session error: ${textValue(state.status.session_error)}` })));
      }
      return wrap;
    }

    function renderPermissionsPanel() {
      const wrap = el('div');
      wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'Local Agent permissions' }));
      wrap.appendChild(el('p', { class: 'modal-copy', text: 'What the Local Agent may do in your folder without asking. The same switch sits under the message box.' }));
      const controlsDisabled = anyGenerationRunning() || state.remoteBusy || state.pendingChanges > 0;
      const cards = el('div', { class: 'radio-cards' });
      PERMISSION_MODES.forEach((mode) => {
        const selected = state.permissionMode === mode.id;
        const label = el('label', { class: `radio-card${selected ? ' is-selected' : ''}${mode.danger ? ' is-danger-card' : ''}` });
        const input = el('input', {
          type: 'radio', name: 'permission-mode', value: mode.id,
          checked: selected, disabled: controlsDisabled,
          'aria-label': mode.label
        });
        input.addEventListener('change', async () => {
          if (!input.checked) return;
          input.disabled = true;
          await changePermissionMode(mode.id);
          refreshPanel();
        });
        label.append(input,
          el('span', { class: 'radio-indicator', 'aria-hidden': 'true' }),
          el('span', { class: 'radio-copy' },
            el('span', { class: 'radio-title' }, el('span', { text: mode.label }), mode.danger ? el('span', { class: 'radio-tag', text: 'Dangerous' }) : null),
            el('span', { class: 'radio-desc', text: mode.desc })
          )
        );
        cards.appendChild(label);
      });
      wrap.appendChild(cards);
      if (state.permissionMode === 'bypassPermissions') {
        wrap.appendChild(el('div', { class: 'note-box is-danger', style: { marginTop: '8px' } }, iconEl('shield-alert'),
          el('span', { text: 'Bypass is on: the Local Agent can change files and run commands in your folder without asking.' })));
      }

      wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'Agent for new chats' }));
      wrap.appendChild(el('p', { class: 'modal-copy', text: 'Which agent new Agent Mode chats use. A started chat keeps its own agent.' }));
      const agentCards = el('div', { class: 'radio-cards' });
      [
        { id: 'native', label: 'Arena Agent', desc: "Arena's own agent: cloud workspace, search, files and Arena connectors. Recommended." },
        { id: 'local', label: 'Local Agent', desc: 'Works in the folder you pick, on this computer, under the permissions above.' }
      ].forEach((kind) => {
        const selected = state.agentKind === kind.id;
        const label = el('label', { class: `radio-card${selected ? ' is-selected' : ''}` });
        const input = el('input', {
          type: 'radio', name: 'agent-kind', value: kind.id,
          checked: selected, disabled: controlsDisabled, 'aria-label': kind.label
        });
        input.addEventListener('change', () => { if (input.checked) setAgentKind(kind.id); });
        label.append(input,
          el('span', { class: 'radio-indicator', 'aria-hidden': 'true' }),
          el('span', { class: 'radio-copy' },
            el('span', { class: 'radio-title' }, el('span', { text: kind.label })),
            el('span', { class: 'radio-desc', text: kind.desc })));
        agentCards.appendChild(label);
      });
      wrap.appendChild(agentCards);

      if (state.pendingPermissions.length) {
        wrap.appendChild(el('h3', { class: 'modal-section-title', text: `Waiting for your answer (${state.pendingPermissions.length})` }));
        const pendingWrap = el('div', { class: 'permissions-list' });
        state.pendingPermissions.forEach((permission) => {
          const item = el('div', { class: 'permission-mini' },
            el('div', { class: 'permission-mini-head' }, iconEl('shield-alert'), el('span', { text: permission.title || 'Permission request' })),
            el('div', { class: 'permission-mini-detail', text: permissionDetail(permission) }),
            el('div', { class: 'permission-mini-actions' },
              el('button', { class: 'button button-small button-allow', type: 'button', disabled: state.decidingPermissions.has(String(permission.id) || ''), onclick: () => decidePermission(permission.id, 'allow') }, el('span', { text: 'Allow once' })),
              el('button', { class: 'button button-small button-always', type: 'button', disabled: state.decidingPermissions.has(String(permission.id) || ''), onclick: () => decidePermission(permission.id, 'always') }, el('span', { text: 'Allow in this chat' })),
              el('button', { class: 'button button-small button-deny', type: 'button', disabled: state.decidingPermissions.has(String(permission.id) || ''), onclick: () => decidePermission(permission.id, 'deny') }, el('span', { text: 'Deny' }))
            )
          );
          pendingWrap.appendChild(item);
        });
        wrap.appendChild(pendingWrap);
      }
      return wrap;
    }

    function renderWorkspacePanel() {
      const wrap = el('div');
      wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'Working folder' }));
      wrap.appendChild(el('div', { class: 'setting-value', text: state.workspace || 'No folder selected.' }));
      const actions = el('div', { class: 'setting-actions' },
        settingsActionButton('Select folder…', 'folder',
          async () => { await chooseNativeFolder(); refreshPanel(); },
          { variant: 'primary', disabled: anyGenerationRunning() || state.remoteBusy || Boolean(state.serverError) || !state.nativeReady }),
        settingsActionButton('Open', 'external', async () => { await openWorkspaceFolder(); }, { disabled: !state.workspace }),
        settingsActionButton('Download ZIP', 'archive', async () => { await downloadWorkspaceZip(); }, { disabled: !state.workspace })
      );
      if (state.workspaceChosen) {
        actions.appendChild(settingsActionButton('Use default folder', 'x', async () => {
          const result = await API.clearWorkspace();
          state.workspace = normalizeWorkspace(result?.workspace ?? result?.path) || state.workspace;
          state.workspaceChosen = false;
          state.workspacePanelRoot = '';
          resetWorkspaceTree();
          updateComposerState();
          renderWorkspaceTreePanel();
          scheduleWorkspaceTreeRefresh(0);
          refreshPanel();
        }));
      }
      wrap.appendChild(actions);
      wrap.appendChild(el('p', { class: 'setting-desc', text: 'The Local Agent reads and writes in this folder, and Code answers are saved here. Arena Agent uses its own cloud workspace.' }));

      if (!state.nativeReady) {
        wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'Folder path' }));
        const form = el('form', { novalidate: true });
        const input = el('input', {
          class: 'input mono', type: 'text', value: state.workspace,
          placeholder: 'C:\\Projects\\My project', autocomplete: 'off', spellcheck: 'false',
          'aria-label': 'Full folder path'
        });
        const error = el('p', { class: 'form-error', role: 'alert' });
        const saveButton = el('button', { class: 'button button-small', type: 'submit' }, iconEl('check'), el('span', { text: 'Use this folder' }));
        form.append(input, error, el('div', { class: 'setting-actions' }, saveButton));
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          error.textContent = '';
          input.classList.remove('is-invalid');
          saveButton.disabled = true;
          try {
            await applyWorkspacePath(input.value);
            refreshPanel();
          } catch (saveError) {
            error.textContent = errorMessage(saveError);
            input.classList.add('is-invalid');
            input.focus();
          } finally {
            saveButton.disabled = false;
          }
        });
        wrap.appendChild(form);
      }
      return wrap;
    }

    function renderMemoryPanel() {
      const wrap = el('div');
      const data = state.memoryData || null;
      wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'Memory across chats' }));
      wrap.appendChild(el('p', { class: 'setting-desc', text: "Short Markdown notes that travel with the first message of every new conversation, so models remember your projects between chats \u2014 like Claude Code's memory. General memory applies everywhere. Project memory lives in MEMORY.md inside the selected folder: models working there can update it, and Compact appends a session summary to it." }));
      if (!data) {
        wrap.appendChild(el('p', { class: 'setting-desc', text: 'Loading memory\u2026' }));
        return wrap;
      }
      const toggle = el('input', { type: 'checkbox', class: 'switch-input', checked: data.enabled !== false, 'aria-label': 'Use memory in chats' });
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Use memory in chats' }),
        el('span', { class: 'switch' }, toggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))));

      wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'General memory (all projects)' }));
      const globalField = el('textarea', { class: 'input mono memory-field', rows: '6', spellcheck: 'false',
        'aria-label': 'General memory', placeholder: '- Prefer short, direct answers\n- Explain trade-offs before big changes' });
      globalField.value = data.global || '';
      wrap.appendChild(globalField);

      wrap.appendChild(el('h3', { class: 'modal-section-title', text: data.folder ? `Project memory \u2014 MEMORY.md in ${data.folder}` : 'Project memory (MEMORY.md)' }));
      const wsField = el('textarea', { class: 'input mono memory-field', rows: '8', spellcheck: 'false',
        'aria-label': 'Project memory', disabled: !data.folder,
        placeholder: data.folder ? '# Project memory\n- Stack: \u2026\n- Conventions: \u2026' : 'Select a folder first \u2014 project memory is stored as MEMORY.md inside it.' });
      wsField.value = data.workspace || '';
      wrap.appendChild(wsField);
      if (!data.folder) wrap.appendChild(el('p', { class: 'setting-desc', text: 'Choose a folder in the Folder tab to keep per-project memory next to the project itself.' }));

      const save = settingsActionButton('Save memory', 'check', async () => {
        const body = { global: globalField.value, enabled: toggle.checked };
        if (data.folder) body.workspace = wsField.value;
        const result = await API.saveMemory(body);
        state.memoryData = { ...data, global: globalField.value,
          workspace: data.folder ? wsField.value : data.workspace, enabled: result?.enabled !== false };
        toast('Memory saved. It applies from the next new conversation, or right away in a chat you compact.', 'success', 'Memory');
        refreshPanel();
      }, { variant: 'primary' });
      wrap.appendChild(el('div', { class: 'setting-actions' }, save));
      wrap.appendChild(el('p', { class: 'setting-desc', text: 'Tip: in any chat with Workspace Sync on, just tell the model \u201cremember this\u201d \u2014 it will write it to MEMORY.md itself.' }));
      return wrap;
    }

    function renderAutomationsPanel() {
      const wrap = el('div');
      wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'Automations' }));
      wrap.appendChild(el('p', { class: 'setting-desc', text: 'Scheduled Local Agent runs. Each run becomes its own chat. Unattended runs use the permission mode picked per automation (Plan = read-only).' }));
      const listWrap = el('div', { class: 'automations-list' });
      wrap.appendChild(listWrap);

      const nameIn = el('input', { class: 'input', type: 'text', placeholder: 'Name (e.g. Morning report)' });
      const promptIn = el('textarea', { class: 'input', rows: '3', placeholder: 'Prompt for the agent…' });
      const kindSel = el('select', { class: 'input' },
        el('option', { value: 'daily', text: 'Daily at…' }),
        el('option', { value: 'hourly', text: 'Hourly' }),
        el('option', { value: 'every', text: 'Every N minutes' }));
      const timeIn = el('input', { class: 'input', type: 'time', value: '09:00' });
      const minsIn = el('input', { class: 'input', type: 'number', value: '120', min: '5' });
      const permSel = el('select', { class: 'input' },
        el('option', { value: 'plan', text: 'Plan (read-only)' }),
        el('option', { value: 'bypassPermissions', text: 'Full access (unattended)' }));
      const syncKind = () => {
        timeIn.hidden = kindSel.value !== 'daily';
        minsIn.hidden = kindSel.value !== 'every';
      };
      kindSel.addEventListener('change', syncKind);
      let editingId = null;
      const saveBtn = settingsActionButton('Add automation', 'plus', async () => {
        const schedule = kindSel.value === 'daily' ? `daily ${timeIn.value || '09:00'}`
          : kindSel.value === 'hourly' ? 'hourly' : `every ${Math.max(5, Number(minsIn.value) || 60)}m`;
        try {
          const body = { name: nameIn.value.trim(), prompt: promptIn.value.trim(), schedule, permission: permSel.value, enabled: true };
          if (editingId) body.id = editingId;
          await API.saveAutomation(body);
          nameIn.value = ''; promptIn.value = '';
          if (editingId) {
            editingId = null;
            saveBtn.querySelector('span').textContent = 'Add automation';
            formTitle.textContent = 'New automation';
          }
          toast('Automation saved.', 'info', 'Automations');
          void fill();
        } catch (error) { toast(errorMessage(error), 'error', 'Automations'); }
      }, { variant: 'primary' });
      const formTitle = el('h3', { class: 'modal-section-title', text: 'New automation' });
      wrap.appendChild(formTitle);
      wrap.appendChild(el('div', { class: 'automation-form' }, nameIn, promptIn,
        el('div', { class: 'automation-form-row' }, kindSel, timeIn, minsIn, permSel), saveBtn));
      syncKind();

      const fill = async () => {
        clear(listWrap);
        let items = [];
        try { items = (await API.getAutomations())?.items || []; } catch { /* offline */ }
        if (!items.length) {
          listWrap.appendChild(el('p', { class: 'setting-desc', text: 'No automations yet.' }));
          return;
        }
        items.forEach((item) => {
          const last = item.last_run ? new Date(Number(item.last_run) * 1000).toLocaleString() : 'never';
          const enabledBox = el('input', { type: 'checkbox', class: 'switch-input', checked: item.enabled !== false, 'aria-label': 'Enabled' });
          enabledBox.addEventListener('change', async () => {
            try { await API.saveAutomation({ ...item, enabled: enabledBox.checked }); }
            catch (error) { toast(errorMessage(error), 'error', 'Automations'); }
          });
          const row = el('div', { class: 'automation-row' },
            el('div', { class: 'automation-main' },
              el('span', { class: 'automation-name', text: item.name || 'Automation' }),
              el('span', { class: 'setting-desc', text: `${item.schedule} · ${item.permission === 'bypassPermissions' ? 'full access' : 'plan'} · last run: ${last}` }),
              el('span', { class: 'automation-prompt', text: item.prompt || '' })),
            el('label', { class: 'switch' }, enabledBox, el('span', { class: 'switch-track', 'aria-hidden': 'true' })),
            settingsActionButton('Edit', 'sliders', async () => {
              editingId = item.id;
              nameIn.value = item.name || '';
              promptIn.value = item.prompt || '';
              permSel.value = item.permission === 'bypassPermissions' ? 'bypassPermissions' : 'plan';
              const sched = String(item.schedule || '');
              if (sched.startsWith('daily')) {
                kindSel.value = 'daily';
                timeIn.value = (sched.match(/\d{2}:\d{2}/) || ['09:00'])[0];
              } else if (sched === 'hourly') kindSel.value = 'hourly';
              else { kindSel.value = 'every'; minsIn.value = (sched.match(/\d+/) || ['60'])[0]; }
              syncKind();
              saveBtn.querySelector('span').textContent = 'Save changes';
              formTitle.textContent = 'Edit automation';
              nameIn.focus();
            }),
            settingsActionButton('Run now', 'play', async () => {
              try { await API.runAutomation(item.id); toast('Automation started — its chat appears in the list shortly.', 'info', 'Automations'); }
              catch (error) { toast(errorMessage(error), 'error', 'Automations'); }
            }),
            settingsActionButton('Delete', 'trash', async () => {
              try { await API.deleteAutomation(item.id); void fill(); }
              catch (error) { toast(errorMessage(error), 'error', 'Automations'); }
            }));
          listWrap.appendChild(row);
        });
      };
      void fill();
      return wrap;
    }

    function installCardShell(title) {
    document.getElementById('installCard')?.remove();
    const body = el('div', { class: 'install-card-body' });
    const card = el('div', { class: 'install-card', id: 'installCard', role: 'status' },
      el('div', { class: 'install-card-head' },
        el('strong', { text: title }),
        el('button', {
          class: 'icon-button tiny', type: 'button', 'aria-label': 'Close',
          onclick: () => card.remove()
        }, iconEl('x'))),
      body);
    document.body.appendChild(card);
    return { card, body };
  }

  function runComponentInstall(id, name, onDone) {
    const { card, body } = installCardShell(`Installing ${name}`);
    const fillBar = el('div', { class: 'install-progress-fill' });
    const note = el('p', { class: 'modal-note', text: 'Starting…' });
    body.append(note, el('div', { class: 'install-progress' }, fillBar));
    let timer = null;
    const finish = (ok, message) => {
      if (timer) clearInterval(timer);
      note.textContent = message;
      if (ok) {
        fillBar.style.width = '100%';
        try { onDone?.(); } catch { /* noop */ }
        setTimeout(() => card.remove(), 1400);
      }
    };
    void (async () => {
      try {
        const result = await API.installComponent(id);
        if (result?.open_url) {
          window.open(result.open_url, '_blank', 'noopener');
          finish(false, 'The official download page opened in your browser. Install it there — Settings → Components detects it afterwards.');
          return;
        }
        timer = setInterval(() => {
          if (!card.isConnected) { clearInterval(timer); return; }
          void (async () => {
            try {
              const data = await API.getComponents();
              const job = data?.jobs?.[id] || {};
              if (typeof job.progress === 'number') fillBar.style.width = `${job.progress}%`;
              if (job.state === 'done') finish(true, `${name} is installed.`);
              else if (job.state === 'installer_started') finish(false, job.hint || 'Complete the installer window — Components detects it afterwards.');
              else if (job.state === 'error') finish(false, job.error || 'Installation failed.');
              else note.textContent = `Downloading… ${Math.round(job.progress || 0)}%`;
            } catch { /* keep polling */ }
          })();
        }, 700);
      } catch (error) {
        finish(false, errorMessage(error));
      }
    })();
  }

  function showCloudflaredInstallModal(onDone) {
    const { card, body } = installCardShell('Component needed: cloudflared');
    body.append(
      el('p', { class: 'modal-note', text: 'The Agent Gateway reaches this computer through a temporary Cloudflare tunnel. That needs cloudflared — a single official Cloudflare file (about 53 MB), downloaded once into the app\u2019s data folder and verified by checksum. No administrator rights, nothing else is installed.' }),
      el('div', { class: 'install-card-actions' },
        el('button', { class: 'button button-small button-quiet', type: 'button', onclick: () => card.remove() },
          el('span', { text: 'Not now' })),
        el('button', {
          class: 'button button-small', type: 'button',
          onclick: () => runComponentInstall('cloudflared', 'cloudflared', onDone)
        }, iconEl('download'), el('span', { text: 'Install cloudflared' }))));
  }

  function renderComponentsPanel() {
    const wrap = el('div', { class: 'memory-panel' });
    const listHost = el('div', {}, el('p', { class: 'modal-note', text: 'Checking components…' }));
    const fill = async () => {
      let data = null;
      try { data = await API.getComponents(); } catch (_err) { /* below */ }
      if (!wrap.isConnected) return;
      clear(listHost);
      if (!data?.components) {
        listHost.appendChild(el('p', { class: 'modal-note', text: 'Component status is unavailable right now.' }));
        return;
      }
      data.components.forEach((comp) => {
        const job = data.jobs?.[comp.id] || {};
        const installing = job.state === 'downloading';
        const status = el('span', {
          class: `component-pill${comp.installed ? ' is-on' : ''}`,
          text: comp.installed ? `Installed${comp.version ? ` · ${comp.version}` : ''}` : 'Not installed'
        });
        const action = comp.installed ? null : el('button', {
          class: 'button button-small', type: 'button', disabled: installing,
          onclick: () => runComponentInstall(comp.id, comp.name, () => { void fill(); })
        }, iconEl('download'), el('span', { text: installing ? 'Installing…' : 'Install' }));
        const details = [comp.purpose, comp.source ? `Source: ${comp.source}.` : '', comp.note || '']
          .filter(Boolean).join(' ');
        listHost.appendChild(el('div', { class: 'component-row' },
          el('div', { class: 'component-main' },
            el('div', { class: 'component-head' },
              el('span', { class: 'component-name', text: comp.name }), status),
            el('p', { class: 'modal-note', text: details })),
          action));
      });
    };
    wrap.append(
      el('h3', { class: 'modal-section-title', text: 'Components' }),
      el('p', { class: 'modal-note', text: 'Optional. Only installed when you ask.' }),
      el('div', { class: 'modal-field-row' },
        el('span', { class: 'modal-field-label', text: 'Status' }),
        el('button', { class: 'btn ghost small', type: 'button', onclick: () => { void fill(); } },
          el('span', { text: 'Check again' }))),
      listHost);
    requestAnimationFrame(() => { void fill(); });
    return wrap;
  }

  function renderGatewayPanel() {
    const wrap = el('div', { class: 'memory-panel' });
    wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'Agent Gateway' }));
    wrap.appendChild(el('p', { class: 'modal-note', text: 'Connects Arena Agent to your local MCP servers and Workspace folder via a temporary Cloudflare tunnel. Off by default.' }));
    const host = el('div', {}, el('p', { class: 'modal-note', text: 'Loading gateway status…' }));
    wrap.appendChild(host);
    let poll = null;
    const stopPoll = () => { if (poll) { clearInterval(poll); poll = null; } };

    const toggleRow = (label, checked, aria, onChange, disabled = false) => {
      const input = el('input', { type: 'checkbox', class: 'switch-input', checked: Boolean(checked), disabled: Boolean(disabled), 'aria-label': aria });
      input.addEventListener('change', () => { void onChange(input); });
      return el('label', { class: 'setting-toggle-row' },
        el('span', { text: label }),
        el('span', { class: 'switch' }, input, el('span', { class: 'switch-track', 'aria-hidden': 'true' })));
    };

    const fill = async () => {
      let data = null;
      try { data = await API.getGateway(); } catch (_err) { /* below */ }
      if (!wrap.isConnected) { stopPoll(); return; }
      clear(host);
      if (!data) {
        host.appendChild(el('p', { class: 'modal-note', text: 'Gateway status is unavailable right now.' }));
        return;
      }
      const session = data.session || {};
      const cfg = state.appSettings || {};
      host.appendChild(toggleRow('Enable Agent Gateway', data.enabled, 'Enable Agent Gateway', async (input) => {
        await API.saveSettings({ gateway_enabled: input.checked });
        state.appSettings = { ...cfg, gateway_enabled: input.checked };
        if (input.checked) {
          try {
            const comps = await API.getComponents();
            const cf = (comps?.components || []).find((c) => c.id === 'cloudflared');
            if (cf && !cf.installed) showCloudflaredInstallModal(() => { void fill(); });
          } catch { /* install offer is best-effort */ }
        } else if (session.state === 'on') {
          await API.stopGateway().catch(() => undefined);
        }
        void fill();
      }));
      host.appendChild(toggleRow('Start automatically with Workspace Sync (Agent chats)', data.auto, 'Auto-start gateway', async (input) => {
        await API.saveSettings({ gateway_auto: input.checked });
        state.appSettings = { ...(state.appSettings || {}), gateway_auto: input.checked };
        if (input.checked) toast('Agent chats will start the gateway when needed and hand the address to the agent automatically while Workspace Sync is on.', 'info', 'Agent Gateway');
        void fill();
      }, !data.enabled));

      host.appendChild(el('h4', { class: 'modal-mini-title', text: 'MCP servers to expose' }));
      const available = (data.available || []).filter((s) => (s.transport || 'stdio') === 'stdio');
      if (!available.length) {
        host.appendChild(el('p', { class: 'modal-note', text: 'No local MCP servers configured yet. Add one in the Connectors panel (Local MCP), then come back here.' }));
      } else {
        const chosenSet = new Set(Array.isArray(data.chosen) ? data.chosen : available.filter((s) => s.enabled).map((s) => s.name));
        const list = el('div', { class: 'gateway-servers' });
        available.forEach((server) => {
          const box = el('input', { type: 'checkbox', checked: chosenSet.has(server.name), disabled: !server.enabled || !data.enabled });
          box.addEventListener('change', async () => {
            const picks = [...list.querySelectorAll('input[type="checkbox"]')]
              .filter((i) => i.checked).map((i) => i.dataset.server);
            await API.saveSettings({ gateway_servers: picks });
            state.appSettings = { ...(state.appSettings || {}), gateway_servers: picks };
            if (session.state === 'on') toast('Server selection applies to the next gateway session.', 'info', 'Agent Gateway');
          });
          box.dataset.server = server.name;
          list.appendChild(el('label', { class: 'gateway-server-row' }, box,
            el('span', { text: server.name }),
            server.enabled ? null : el('span', { class: 'muted', text: ' (disabled in Connectors)' })));
        });
        host.appendChild(list);
      }

      host.appendChild(el('h4', { class: 'modal-mini-title', text: 'Workspace folder' }));
      const ws = data.workspace || {};
      host.appendChild(toggleRow('Expose the picked Workspace folder (files + shell inside it)', ws.exposed !== false, 'Expose workspace folder', async (input) => {
        await API.saveSettings({ gateway_workspace: input.checked });
        state.appSettings = { ...(state.appSettings || {}), gateway_workspace: input.checked };
        if (session.state === 'on') toast('Workspace exposure applies to the next gateway session.', 'info', 'Agent Gateway');
        void fill();
      }, !data.enabled || !ws.available));
      host.appendChild(el('p', { class: 'modal-note', text: ws.available
        ? `Folder: ${ws.folder}. The agent can list, read, search, write and edit files inside it and run shell commands there — paths cannot escape the folder, and changes follow your Permissions mode.`
        : 'No folder picked yet — choose one in the composer Workspace menu, then it can be exposed here.' }));

      host.appendChild(el('h4', { class: 'modal-mini-title', text: 'Session' }));
      if (session.state === 'on') {
        const expires = session.expires_at ? new Date(session.expires_at * 1000).toLocaleTimeString() : '';
        const copyRow = (label, value) => el('div', { class: 'modal-field-row' },
          el('span', { class: 'modal-field-label', text: label }),
          el('span', { class: 'muted gateway-mono', text: value || '', title: value || '' }),
          el('button', {
            class: 'button button-small button-quiet', type: 'button',
            onclick: async () => { await copyText(value || ''); toast(`${label} copied.`, 'success'); }
          }, iconEl('copy'), el('span', { text: 'Copy' })));
        host.append(
          el('p', { class: 'modal-note', text: `Running${expires ? ` · ends by ${expires}` : ''} · ${(session.servers || []).length} server(s) exposed. Agent chats receive these automatically${data.auto ? '' : ' when auto-start is on'}; you can also paste them into an arena.ai Agent chat manually.` }),
          copyRow('Gateway URL', session.url),
          copyRow('Pairing code', session.pairing));
        const recent = (session.calls || []).slice(0, 8);
        if (recent.length) {
          host.appendChild(el('h4', { class: 'modal-mini-title', text: 'Recent calls' }));
          recent.forEach((call) => {
            host.appendChild(el('div', { class: 'modal-field-row' },
              el('span', { class: 'modal-field-label', text: call.ts ? new Date(call.ts * 1000).toLocaleTimeString() : '' }),
              el('span', { class: 'muted', text: `${call.server}:${call.tool} · ${call.ok ? 'ok' : 'failed'} · ${call.ms} ms` })));
          });
        }
        host.appendChild(el('button', {
          class: 'button button-danger', type: 'button',
          onclick: async () => { await API.stopGateway().catch(() => undefined); toast('Gateway session stopped and pairing revoked.', 'info', 'Agent Gateway'); void fill(); }
        }, iconEl('x'), el('span', { text: 'Stop & revoke' })));
      } else {
        if (session.error) host.appendChild(el('p', { class: 'modal-note', text: `Last session: ${session.error}` }));
        const startBtn = el('button', {
          class: 'button', type: 'button', disabled: !data.enabled,
          onclick: async () => {
            startBtn.disabled = true;
            startBtn.querySelector('span:last-child').textContent = 'Starting tunnel…';
            try {
              await API.startGateway();
              toast('Gateway session is live. Open an Agent chat.', 'success', 'Agent Gateway');
            } catch (error) {
              if (error?.details?.code === 'cloudflared_missing') {
                showCloudflaredInstallModal(() => { void fill(); });
              } else {
                toast(errorMessage(error), 'error', 'Agent Gateway');
              }
            }
            void fill();
          }
        }, iconEl('globe'), el('span', { text: 'Start session now' }));
        host.append(startBtn,
          el('p', { class: 'modal-note', text: data.enabled
            ? 'A session lasts until you stop it, the app closes, 45 idle minutes pass, or 8 hours elapse.'
            : 'Enable the gateway above first.' }));
      }
    };
    requestAnimationFrame(() => { void fill(); });
    poll = setInterval(() => { if (!wrap.isConnected) { stopPoll(); return; } void fill(); }, 5000);
    return wrap;
  }

  function renderUsagePanel() {
    const wrap = el('div', 'memory-panel');
    const humanWait = (w) => {
      const s = Number(w) || 0;
      if (!s) return '';
      if (s < 90) return `resets in ~${Math.round(s)}s`;
      if (s < 5400) return `resets in ~${Math.round(s / 60)}m`;
      return `resets in ~${Math.round(s / 3600)}h`;
    };
    const fill = async () => {
      const body = $('#usageBody', wrap);
      if (!body) return;
      let data = null;
      try { data = await API.getUsage(); } catch (_err) { /* shown below */ }
      if (!data || !data.days) {
        body.innerHTML = '<p class="modal-note">Usage data is unavailable right now.</p>';
        return;
      }
      const days = data.days || {};
      const todayKey = data.today || '';
      const today = days[todayKey] || {};
      const accountRow = (id, a) => {
        const models = Object.entries(a.models || {})
          .sort((x, y) => y[1] - x[1]).slice(0, 5)
          .map(([m, n]) => `${m} \u00D7${n}`).join(', ');
        const byMod = a.by_modality || {};
        const bits = [`${a.sends || 0} sends`,
          `text ${byMod.text || 0}`, `media ${byMod.media || 0}`,
          `${a.rate_limits || 0} rate limits`];
        return `<div class="modal-field-row" style="align-items:flex-start">
          <span class="modal-field-label">${esc(a.email || id)}</span>
          <span class="muted">${esc(bits.join(' \u00B7 '))}${models ? `<br>${esc(models)}` : ''}</span></div>`;
      };
      const BUCKET_NAMES = { evaluation: 'Chat, Code, Direct, Battle', agent: 'Agent' };
      const buckets = (data.buckets || {})[data.current_account] || {};
      const bucketRows = Object.entries(buckets).map(([name, b]) => {
        const left = b.remaining != null ? `<strong class="tabular">${esc(b.remaining)}</strong>${b.limit != null ? ` of ${esc(b.limit)}` : ''} left` : 'Limit reported';
        const reset = b.reset ? ` \u00B7 resets in ${esc(humanWait(b.reset - Date.now() / 1000))}` : '';
        return `<div class="modal-field-row"><span class="modal-field-label">${esc(BUCKET_NAMES[name] || name)}</span>
          <span>${left}${reset}<br><span class="muted">as of ${esc(new Date(b.ts * 1000).toLocaleTimeString())}</span></span></div>`;
      }).join('');
      const liveHtml = bucketRows
        ? bucketRows + '<p class="modal-note">Arena reports each limit with its replies, so a bucket shows after you send in that mode.</p>'
        : '<p class="modal-note">Arena reports your remaining requests with each reply. Send a message to see it here.</p>';
      const todayHtml = Object.keys(today).length
        ? Object.entries(today).map(([id, a]) => accountRow(id, a)).join('')
        : '<p class="modal-note">No sends recorded yet today.</p>';
      const past = Object.entries(days).filter(([d]) => d !== todayKey).sort((x, y) => (x[0] < y[0] ? 1 : -1));
      const pastHtml = past.map(([d, accts]) => {
        const sends = Object.values(accts).reduce((n, a) => n + (a.sends || 0), 0);
        const limits = Object.values(accts).reduce((n, a) => n + (a.rate_limits || 0), 0);
        return `<div class="modal-field-row"><span class="modal-field-label">${esc(d)}</span><span class="muted">${sends} sends \u00B7 ${limits} rate limits</span></div>`;
      }).join('');
      const eventsHtml = (data.events || []).slice(0, 10).map((ev) => {
        const when = ev.ts ? new Date(ev.ts * 1000).toLocaleString() : '';
        const what = [ev.modality, ev.model].filter(Boolean).join(' \u00B7 ');
        return `<div class="modal-field-row" style="align-items:flex-start">
          <span class="modal-field-label">${esc(when)}</span>
          <span class="muted">${esc([what, humanWait(ev.wait)].filter(Boolean).join(' \u00B7 '))}${ev.message ? `<br>${esc(String(ev.message).slice(0, 140))}` : ''}</span></div>`;
      }).join('') || '<p class="modal-note">No rate limits recorded. Nice.</p>';
      body.innerHTML = `
        <h4 class="modal-mini-title">Arena limit</h4>
        ${liveHtml}
        <h4 class="modal-mini-title">Today</h4>
        ${todayHtml}
        <h4 class="modal-mini-title">Recent rate limits</h4>
        ${eventsHtml}
        ${past.length ? `<h4 class="modal-mini-title">Previous days</h4>${pastHtml}` : ''}`;
    };
    wrap.innerHTML = `
      <h3 class="modal-section-title">Usage &amp; Arena limits</h3>
      <p class="modal-note">Arena has a daily balance per account. Heavier models cost more. Agent mode re-sends history each round.</p>
      <details class="limits-details">
        <summary class="limits-summary">Rate limit details</summary>
        <ul class="limits-list compact">
          <li><strong>Daily balance</strong> \u2014 resets every 24h. Heavy models drain faster.</li>
          <li><strong>Battle</strong> \u2014 counts as 2 sends. Votes are free.</li>
          <li><strong>Video / images</strong> \u2014 heavily limited, few per day.</li>
          <li><strong>429s</strong> \u2014 auto-retried when pacing is on.</li>
        </ul>
      </details>
      <div class="modal-field-row"><span class="modal-field-label">Send log</span>
        <button class="btn ghost small" id="usageRefresh" type="button">Refresh</button></div>
      <div id="usageBody"><p class="modal-note">Loading usage\u2026</p></div>`;
    const safeFill = () => fill().catch((err) => {
      const body = $('#usageBody', wrap);
      if (body) body.innerHTML = `<p class="modal-note">Could not show usage: ${esc(err?.message || err)}</p>`;
    });
    $('#usageRefresh', wrap)?.addEventListener('click', () => { void safeFill(); });
    requestAnimationFrame(() => { void safeFill(); });
    return wrap;
  }

  function renderAboutPanel() {
      const wrap = el('div');
      const logoMark = el('div', { class: 'about-mark' });
      logoMark.innerHTML = '<svg viewBox="0 0 512 512" width="56" height="56" style="border-radius:12px"><rect width="512" height="512" rx="96" fill="#1a1f1e"/><g transform="translate(256,180)"><rect x="-100" y="-60" width="24" height="110" rx="5" fill="#F4F0EB"/><rect x="-52" y="-100" width="24" height="150" rx="5" fill="#F4F0EB"/><rect x="-12" y="-130" width="24" height="180" rx="5" fill="#F4F0EB"/><rect x="28" y="-100" width="24" height="150" rx="5" fill="#F4F0EB"/><rect x="76" y="-60" width="24" height="110" rx="5" fill="#F4F0EB"/><line x1="-110" y1="55" x2="110" y2="55" stroke="#F4F0EB" stroke-width="6" stroke-linecap="round"/></g><rect x="244" y="310" width="14" height="14" rx="2" fill="#34d399"/><text x="256" y="356" text-anchor="middle" fill="#F4F0EB" font-family="system-ui,sans-serif" font-size="42" font-weight="700" letter-spacing="6">ARENA</text><text x="256" y="388" text-anchor="middle" fill="#9db6a0" font-family="system-ui,sans-serif" font-size="22" font-weight="500" letter-spacing="8">CLI</text></svg>';
      wrap.appendChild(logoMark);
      wrap.appendChild(el('h3', { class: 'about-title', text: 'Arena Desktop' }));
      wrap.appendChild(el('p', { class: 'about-sub', text: state.appVersion ? `Version ${state.appVersion}` : 'Desktop client' }));
      wrap.appendChild(el('p', { class: 'modal-copy', text: 'Unofficial desktop client for arena.ai. Not affiliated with Arena.' }));
      wrap.appendChild(el('div', { class: 'setting-actions' },
        settingsActionButton('GitHub', 'external', async () => { window.open('https://github.com/PlayzAe/arena.ai-desktop', '_blank', 'noopener'); }),
        settingsActionButton('Terms of Use', 'external', async () => { window.open('https://help.arena.ai/articles/5629909088-terms-of-use', '_blank', 'noopener'); }),
        settingsActionButton('Privacy Policy', 'external', async () => { window.open('https://help.arena.ai/articles/3765052346-privacy-policy', '_blank', 'noopener'); })
      ));

      wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'App' }));
      const info = state.updateInfo;
      const cfg = state.appSettings || {};
      if (info?.update) {
        wrap.appendChild(el('p', { class: 'setting-desc', text: `Version ${info.latest} is available (you have ${info.current}).` }));
      }
      const updActions = el('div', { class: 'setting-actions' });
      if (info?.update && info?.url) {
        updActions.appendChild(settingsActionButton(info.can_install ? `Update to ${info.latest}` : `Get ${info.latest}`, 'download', async () => {
          if (info.can_install) openUpdateModal(info); else window.open(info.url, '_blank', 'noopener');
        }, { variant: 'primary' }));
      }
      updActions.appendChild(settingsActionButton('Check for updates', 'refresh', async () => {
        const fresh = await API.updateCheck(true);
        state.updateInfo = fresh;
        toast(fresh?.update ? `Version ${fresh.latest} is available.` : fresh?.error ? `Could not check: ${fresh.error}` : 'You are up to date.', fresh?.error ? 'warning' : 'info', 'Updates');
        refreshPanel();
      }));
      wrap.appendChild(updActions);
      const updToggle = el('input', { type: 'checkbox', class: 'switch-input', checked: cfg.update_check !== false, 'aria-label': 'Check for updates automatically' });
      updToggle.addEventListener('change', async () => {
        await API.saveSettings({ update_check: updToggle.checked });
        state.appSettings = { ...(state.appSettings || {}), update_check: updToggle.checked };
        if (state.updateInfo) state.updateInfo = { ...state.updateInfo, enabled: updToggle.checked };
      });
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Check for updates automatically' }),
        el('span', { class: 'switch' }, updToggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))));
      const betaToggle = el('input', { type: 'checkbox', class: 'switch-input', checked: Boolean(cfg.beta_updates), 'aria-label': 'Beta update channel' });
      betaToggle.addEventListener('change', async () => {
        await API.saveSettings({ beta_updates: betaToggle.checked });
        state.appSettings = { ...(state.appSettings || {}), beta_updates: betaToggle.checked };
        const fresh = await API.updateCheck(true).catch(() => null);
        if (fresh) state.updateInfo = fresh;
        toast(betaToggle.checked ? 'Beta channel on: pre-releases count as updates.' : 'Back to stable releases only.', 'info', 'Updates');
        refreshPanel();
      });
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Beta update channel (include pre-releases)' }),
        el('span', { class: 'switch' }, betaToggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))));
      const eloToggle = el('input', { type: 'checkbox', class: 'switch-input', checked: cfg.elo_enabled !== false, 'aria-label': 'Leaderboard Elo in model picker' });
      eloToggle.addEventListener('change', async () => {
        await API.saveSettings({ elo_enabled: eloToggle.checked });
        state.appSettings = { ...(state.appSettings || {}), elo_enabled: eloToggle.checked };
        state.eloModels = eloToggle.checked ? null : {};
      });
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Show leaderboard Elo in the model picker' }),
        el('span', { class: 'switch' }, eloToggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))));
      const acToggle = el('input', { type: 'checkbox', class: 'switch-input', checked: cfg.auto_continue !== false, 'aria-label': 'Auto-continue on error' });
      acToggle.addEventListener('change', async () => {
        await API.saveSettings({ auto_continue: acToggle.checked });
        state.appSettings = { ...(state.appSettings || {}), auto_continue: acToggle.checked };
      });
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Auto-continue on error (up to 2 attempts)' }),
        el('span', { class: 'switch' }, acToggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))));
      const soundToggle = el('input', { type: 'checkbox', class: 'switch-input', checked: cfg.notify_sound !== false, 'aria-label': 'Sound when a chat finishes in the background' });
      soundToggle.addEventListener('change', async () => {
        await API.saveSettings({ notify_sound: soundToggle.checked });
        state.appSettings = { ...(state.appSettings || {}), notify_sound: soundToggle.checked };
      });
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Sound when a chat finishes while the window is in the background' }),
        el('span', { class: 'switch' }, soundToggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))));
      const pacingToggle = el('input', { type: 'checkbox', class: 'switch-input', checked: cfg.pacing !== false, 'aria-label': 'Pace requests to avoid Arena rate limits' });
      const pacingPreset = el('select', { class: 'input', 'aria-label': 'Pacing strength' },
        el('option', { value: 'gentle', text: 'Gentle' }),
        el('option', { value: 'strict', text: 'Strict' }));
      pacingPreset.value = cfg.pacing_preset === 'strict' ? 'strict' : 'gentle';
      pacingPreset.disabled = cfg.pacing === false;
      pacingToggle.addEventListener('change', async () => {
        await API.saveSettings({ pacing: pacingToggle.checked });
        state.appSettings = { ...(state.appSettings || {}), pacing: pacingToggle.checked };
        pacingPreset.disabled = !pacingToggle.checked;
      });
      pacingPreset.addEventListener('change', async () => {
        await API.saveSettings({ pacing_preset: pacingPreset.value });
        state.appSettings = { ...(state.appSettings || {}), pacing_preset: pacingPreset.value };
      });
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Pace requests (avoid Arena rate limits)' }),
        el('span', { class: 'switch' }, pacingToggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))));
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Pacing strength' }), pacingPreset));
      wrap.appendChild(el('p', { class: 'setting-desc', text: 'Spaces out requests and auto-retries 429s.' }));
      const cheapToggle = el('input', { type: 'checkbox', class: 'switch-input', checked: cfg.cheap_subagents !== false, 'aria-label': 'Lighter models for research subagents' });
      cheapToggle.addEventListener('change', async () => {
        await API.saveSettings({ cheap_subagents: cheapToggle.checked });
        state.appSettings = { ...(state.appSettings || {}), cheap_subagents: cheapToggle.checked };
      });
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Lighter models for research subagents' }),
        el('span', { class: 'switch' }, cheapToggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))));
      const failoverToggle = el('input', { type: 'checkbox', class: 'switch-input', checked: cfg.account_failover === true, 'aria-label': 'Continue on another account at daily limit' });
      failoverToggle.addEventListener('change', async () => {
        await API.saveSettings({ account_failover: failoverToggle.checked });
        state.appSettings = { ...(state.appSettings || {}), account_failover: failoverToggle.checked };
        if (failoverToggle.checked) toast('When a daily limit hits mid-task, the app will switch to another saved account and continue in a fresh session. Rotating accounts to work around a daily cap conflicts with Arena fair-use expectations and may flag the accounts \u2014 use only if you understand the risk.', 'info', 'Account failover');
      });
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Continue on another account at daily limit' }),
        el('span', { class: 'switch' }, failoverToggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))));
      wrap.appendChild(el('p', { class: 'setting-desc', text: 'Off by default. Same-IP accounts may share limits.' }));
      const trayToggle = el('input', { type: 'checkbox', class: 'switch-input', checked: Boolean(cfg.tray_enabled), 'aria-label': 'Keep in system tray when closed' });
      trayToggle.addEventListener('change', async () => {
        await API.saveSettings({ tray_enabled: trayToggle.checked });
        state.appSettings = { ...(state.appSettings || {}), tray_enabled: trayToggle.checked };
        toast('Tray setting saved \u2014 it takes effect on the next launch. While the tray is on, closing the window hides it and Ctrl+Alt+A shows or hides it.', 'info', 'System tray');
      });
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Keep in system tray when closed' }),
        el('span', { class: 'switch' }, trayToggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))));

      wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'Quick diagnostics' }));
      const diagList = el('div', { class: 'diag-list' });
      const testNames = ['Arena.ai connection', 'Account health', 'Encryption (DPAPI)', 'Workspace access', 'Update server (GitHub)'];
      testNames.forEach(name => {
        diagList.appendChild(el('div', { class: 'diag-row diag-pending' },
          el('span', { class: 'diag-dot' }),
          el('span', { class: 'diag-name', text: name }),
          el('span', { class: 'diag-ms' })
        ));
      });
      const runBtn = settingsActionButton('Run all tests', 'play', async () => {
        runBtn.disabled = true;
        diagList.querySelectorAll('.diag-row').forEach(r => { r.className = 'diag-row diag-running'; r.querySelector('.diag-ms').textContent = ''; });
        try {
          const data = await API.diagnosticsRun();
          const rows = diagList.querySelectorAll('.diag-row');
          (data?.results || []).forEach((r, i) => {
            if (!rows[i]) return;
            rows[i].className = 'diag-row ' + (r.ok === true ? 'diag-pass' : r.ok === false ? 'diag-fail' : 'diag-skip');
            rows[i].querySelector('.diag-ms').textContent = r.ok === null ? (r.detail || '—') : r.ms + 'ms';
            if (r.detail && r.ok === false) rows[i].title = r.detail;
          });
        } catch { diagList.querySelectorAll('.diag-row').forEach(r => { r.className = 'diag-row diag-fail'; }); }
        runBtn.disabled = false;
      });
      const diagActions = el('div', { class: 'setting-actions' });
      diagActions.appendChild(runBtn);
      wrap.appendChild(diagActions);
      wrap.appendChild(diagList);

      wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'Settings backup' }));
      const ioActions = el('div', { class: 'setting-actions' });
      ioActions.appendChild(settingsActionButton('Export settings', 'download', async () => { await exportSettingsFile(); }));
      const importInput = el('input', { type: 'file', accept: 'application/json,.json', hidden: true, 'aria-hidden': 'true', tabindex: '-1' });
      importInput.addEventListener('change', async () => {
        const file = importInput.files?.[0];
        importInput.value = '';
        if (file) await importSettingsFile(file);
      });
      ioActions.appendChild(settingsActionButton('Import settings\u2026', 'folder', async () => { importInput.click(); }));
      ioActions.appendChild(settingsActionButton('Copy diagnostics', 'copy', async () => {
        const data = await API.diagnostics();
        await copyDiagnosticsText(data?.text || '');
      }));
      wrap.appendChild(ioActions);
      wrap.appendChild(importInput);
      wrap.appendChild(el('p', { class: 'setting-desc', text: 'Export includes settings, memory and connectors. Never cookies.' }));
      return wrap;
    }

    function contentFor(tab) {
      if (tab === 'permissions') return renderPermissionsPanel();
      if (tab === 'workspace') return renderWorkspacePanel();
      if (tab === 'memory') return renderMemoryPanel();
      if (tab === 'automations') return renderAutomationsPanel();
      if (tab === 'usage') return renderUsagePanel();
      if (tab === 'gateway') return renderGatewayPanel();
      if (tab === 'components') return renderComponentsPanel();
      if (tab === 'about') return renderAboutPanel();
      return renderConnectionPanel();
    }

    function hydrateTab(tab) {
      if (hydrated[tab]) return;
      hydrated[tab] = true;
      if (state.serverError || state.networkOffline) return;
      if (tab === 'permissions') {
        Promise.allSettled([loadPermissionModeFromServer({ quiet: true }), loadPermissions({ quiet: true })])
          .then(() => { if (state.settingsTab === 'permissions') refreshPanel(); });
      } else if (tab === 'workspace') {
        loadWorkspaceFromServer({ quiet: true }).then(() => { if (state.settingsTab === 'workspace') refreshPanel(); });
      } else if (tab === 'memory') {
        API.getMemory().then((data) => { state.memoryData = data; if (state.settingsTab === 'memory') refreshPanel(); }).catch(() => {});
      } else if (tab === 'about') {
        API.getSettings().then((data) => { state.appSettings = data; if (state.settingsTab === 'about') refreshPanel(); }).catch(() => {});
      }
    }

    function refreshPanel() {
      if (!panel.isConnected) return;
      clear(panel);
      panel.id = 'settings-panel';
      panel.setAttribute('aria-labelledby', `settings-tab-${currentTab}`);
      panel.appendChild(contentFor(currentTab));
      tabDefs.forEach((tab) => {
        const button = tabButtons[tab.id];
        const selected = tab.id === currentTab;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
    }

    function selectTab(tabId, moveFocus = false) {
      if (!tabDefs.some((tab) => tab.id === tabId)) return;
      currentTab = tabId;
      state.settingsTab = tabId;
      refreshPanel();
      if (moveFocus) tabButtons[tabId]?.focus();
      hydrateTab(tabId);
    }

    const mounted = mountModal({
      title: 'Settings',
      size: 'large',
      content: layout,
      actions: [
        { label: 'Done', variant: 'primary' }
      ],
      onMount: () => {
        selectTab(currentTab, false);
      },
      onClose: () => {
        if (state.settingsRerender === refreshPanel) state.settingsRerender = null;
      }
    });
    state.settingsRerender = refreshPanel;
    state.settingsFetched = hydrated;
    return mounted;
  }

  /* ---------------------------------------------------------------------- */
  /* Right Workspace / Connectors panel                                    */