  }

  async function answerQuestionUI(q, answer, card) {
    const text = String(answer || '').trim();
    if (!text) return;
    card?.querySelectorAll('button, input').forEach((n) => { n.disabled = true; });
    try {
      await API.answerQuestion(q.id, text);
      state.pendingQuestions = state.pendingQuestions.filter((x) => x.id !== q.id);
      updatePendingPermissionsBadge();
      renderMessages();
    } catch (error) {
      toast(errorMessage(error), 'error', 'Question');
      card?.querySelectorAll('button, input').forEach((n) => { n.disabled = false; });
    }
  }

  function renderQuestionCard(q) {
    const card = el('div', { class: 'permission-card question-card', 'data-question-card': q.id });
    const isPlan = q.kind === 'plan';
    const head = el('div', { class: 'permission-head' },
      el('span', { class: 'permission-icon' }, iconEl(isPlan ? 'check' : 'help')),
      el('div', { class: 'permission-heading' },
        el('p', { class: 'permission-title', text: isPlan ? (q.subagent ? 'Sub-agent plan' : 'Proposed plan') : (q.subagent ? 'Sub-agent asks' : 'The model asks') }),
        el('p', { class: 'permission-subtitle', text: isPlan ? 'Approve to let the model execute it' : 'Generation is paused until you answer' })));
    const body = el('div', { class: 'permission-body' },
      isPlan ? el('pre', { class: 'plan-text', text: q.plan || q.question })
             : el('p', { class: 'permission-note', text: q.question }));
    if (q.options.length) {
      const row = el('div', { class: 'question-options' });
      q.options.forEach((opt, idx) => {
        const b = el('button', { class: 'button button-small' + (isPlan && idx > 0 ? ' button-quiet' : ''), type: 'button' }, el('span', { text: opt }));
        b.addEventListener('click', () => { void answerQuestionUI(q, opt, card); });
        row.appendChild(b);
      });
      body.appendChild(row);
    }
    if (q.custom) {
      const input = el('input', { class: 'input', type: 'text', placeholder: isPlan ? 'Describe changes to the plan\u2026' : 'Your answer\u2026', 'aria-label': 'Your answer' });
      const send = el('button', { class: 'button button-small', type: 'button' }, iconEl('check'), el('span', { text: isPlan ? 'Revise' : 'Answer' }));
      send.addEventListener('click', () => { void answerQuestionUI(q, input.value, card); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); void answerQuestionUI(q, input.value, card); }
      });
      body.appendChild(el('div', { class: 'question-custom' }, input, send));
    }
    card.append(head, body);
    return card;
  }

  function renderUnattachedQuestions() {
    const mine = (state.pendingQuestions || []).filter(
      (q) => !q.chatId || String(q.chatId) === String(state.activeChatId));
    if (!mine.length) return null;
    const section = el('section', { class: 'message-turn', 'aria-label': 'Question from the model' });
    mine.forEach((q) => section.appendChild(renderQuestionCard(q)));
    return section;
  }

  async function loadMediaChoices() {
    try {
      const items = await API.getMediaChoices();
      state.pendingMediaChoices = (Array.isArray(items) ? items : [])
        .map((item) => normalizeMediaChoice(item))
        .filter((choice) => choice?.id && mediaChoiceIsPending(choice));
      updatePendingPermissionsBadge();
      if (state.view === 'chat') renderMessages();
    } catch { /* live choices still arrive over the stream */ }
  }

  async function answerMediaChoiceUI(choice, body, card) {
    if (!choice?.id) return;
    const id = String(choice.id);
    if (state.answeringMediaChoices.has(id)) return;
    state.answeringMediaChoices.add(id);
    card?.querySelectorAll('button').forEach((node) => { node.disabled = true; });
    try {
      const result = await API.answerMediaChoice(id, body);
      const selected = Number.isFinite(Number(result?.selected_index))
        ? Number(result.selected_index)
        : (body.skip ? Number(choice.candidates[0]?.index || 0) : Number(body.selected_index));
      const method = result?.selection_method || (body.skip ? 'skip' : 'user');
      const apply = (target) => {
        if (!target) return;
        target.selectedIndex = selected;
        target.selectionMethod = method;
        target.status = state.demo ? 'completed' : 'submitting';
      };
      apply(choice);
      Object.values(state.chatTurns || {}).forEach((turns) => {
        (turns || []).forEach((turn) => {
          Object.values(turn.lanes || {}).forEach((lane) => {
            (lane.mediaChoices || []).forEach((target) => {
              if (sameMediaChoice(target, choice)) apply(target);
            });
          });
        });
      });
      (state.pendingMediaChoices || []).forEach((target) => {
        if (sameMediaChoice(target, choice)) apply(target);
      });
      if (state.demo) {
        state.pendingMediaChoices = state.pendingMediaChoices.filter((target) => !sameMediaChoice(target, choice));
      }
      updatePendingPermissionsBadge();
      renderMessages();
    } catch (error) {
      toast(errorMessage(error), 'error', 'Image choice');
    } finally {
      state.answeringMediaChoices.delete(id);
      if (state.view === 'chat') renderMessages();
    }
  }

  function renderMediaChoiceCard(choice) {
    const pending = mediaChoiceIsPending(choice);
    const submitting = choice.status === 'submitting' || (choice.id && state.answeringMediaChoices.has(String(choice.id)));
    const cancelled = choice.status === 'cancelled';
    const failed = choice.status === 'error';
    const completed = !pending && !cancelled && !failed && choice.selectedIndex !== null;
    const card = el('section', {
      class: `permission-card media-choice-card${completed ? ' is-done' : ''}`,
      'data-media-choice-card': choice.id || choice.toolCallId || ''
    });
    const title = pending ? 'Choose an image'
      : submitting ? 'Sending your choice…'
        : cancelled ? 'Image choice cancelled'
          : failed ? 'Image choice failed' : 'Image chosen';
    const subtitle = pending ? 'Arena Agent is paused until you pick one'
      : submitting ? 'Arena Agent will continue with the selected image'
        : completed ? 'Both options stay in the transcript, with their models revealed'
          : 'This choice is no longer waiting';
    card.appendChild(el('div', { class: 'permission-head' },
      el('span', { class: 'permission-icon' }, iconEl('image')),
      el('div', { class: 'permission-heading' },
        el('p', { class: 'permission-title', text: title }),
        el('p', { class: 'permission-subtitle', text: subtitle }))));

    const body = el('div', { class: 'permission-body media-choice-body' });
    if (choice.prompt) body.appendChild(el('p', { class: 'media-choice-prompt', text: choice.prompt }));
    if (choice.filePath) body.appendChild(el('p', { class: 'media-choice-file', text: choice.filePath }));

    const grid = el('div', { class: 'media-choice-grid' });
    choice.candidates.forEach((candidate) => {
      const selected = choice.selectedIndex !== null && Number(candidate.index) === Number(choice.selectedIndex);
      const figure = el('figure', { class: `media-choice-option${selected ? ' is-selected' : ''}` });
      if (candidate.url) {
        figure.appendChild(el('a', {
          class: 'media-choice-preview', href: candidate.url, target: '_blank', rel: 'noopener noreferrer',
          title: 'Open full size', 'aria-label': `Open image option ${candidate.index + 1} full size`
        }, el('img', { src: candidate.url, alt: `Generated image option ${candidate.index + 1}`, loading: 'lazy' })));
      } else {
        figure.appendChild(el('div', { class: 'media-choice-preview is-placeholder' }, iconEl('image')));
      }
      const caption = el('figcaption', { class: 'media-choice-caption' });
      caption.appendChild(el('div', { class: 'media-choice-caption-head' },
        el('span', { class: 'media-choice-option-label', text: `Option ${candidate.index + 1}` }),
        selected ? el('span', { class: 'media-choice-selected' }, iconEl('check'), el('span', { text: 'Selected' })) : null));
      if (completed || submitting) {
        const model = candidate.model_name || (candidate.is_private ? 'Private model' : 'Model not revealed yet');
        caption.appendChild(el('div', { class: 'media-choice-model', text: candidate.organization ? `${model} · ${candidate.organization}` : model }));
      }
      const actions = el('div', { class: 'media-choice-actions' });
      if (candidate.url) {
        actions.appendChild(el('a', {
          class: 'button button-small button-quiet', href: candidate.url, target: '_blank', rel: 'noopener noreferrer'
        }, iconEl('external'), el('span', { text: 'Full size' })));
      }
      if (pending && choice.id) {
        const use = el('button', {
          class: 'button button-small', type: 'button', disabled: Boolean(submitting),
          'aria-label': `Use image option ${candidate.index + 1}`
        }, iconEl('check'), el('span', { text: 'Use this image' }));
        use.addEventListener('click', () => {
          void answerMediaChoiceUI(choice, { selected_index: candidate.index }, card);
        });
        actions.appendChild(use);
      }
      if (actions.childNodes.length) caption.appendChild(actions);
      figure.appendChild(caption);
      grid.appendChild(figure);
    });
    body.appendChild(grid);

    if (pending && choice.id) {
      const footer = el('div', { class: 'media-choice-footer' });
      const skip = el('button', { class: 'button button-small button-quiet', type: 'button', disabled: Boolean(submitting) },
        el('span', { text: 'Skip choice' }));
      skip.addEventListener('click', () => { void answerMediaChoiceUI(choice, { skip: true }, card); });
      footer.append(skip, el('span', { class: 'media-choice-note', text: 'Skip uses the first image, like Arena does when no choice is made.' }));
      body.appendChild(footer);
    } else if (pending && !choice.id) {
      body.appendChild(el('p', { class: 'media-choice-note', text: 'This saved choice is no longer waiting in the app.' }));
    } else if ((completed || submitting) && !choice.candidates.some((candidate) => candidate.model_name || candidate.is_private)) {
      body.appendChild(el('p', { class: 'media-choice-note', text: 'Waiting for Arena to reveal the models for both images…' }));
    }
    card.appendChild(body);
    return card;
  }

  function renderMediaChoices(lane) {
    if (!Array.isArray(lane.mediaChoices) || !lane.mediaChoices.length) return null;
    const wrap = el('div', { class: 'media-choice-list' });
    lane.mediaChoices.forEach((choice) => wrap.appendChild(renderMediaChoiceCard(choice)));
    return wrap;
  }

  function renderUnattachedMediaChoices() {
    const visible = [];
    (state.messages || []).forEach((turn) => {
      Object.values(turn.lanes || {}).forEach((lane) => visible.push(...(lane.mediaChoices || [])));
    });
    const mine = (state.pendingMediaChoices || []).filter((choice) => {
      if (choice.chatId && String(choice.chatId) !== String(state.activeChatId)) return false;
      return !visible.some((shown) => sameMediaChoice(shown, choice));
    });
    if (!mine.length) return null;
    const section = el('section', { class: 'message-turn', 'aria-label': 'Image choice from Arena Agent' });
    mine.forEach((choice) => section.appendChild(renderMediaChoiceCard(choice)));
    return section;
  }

  async function refreshActiveChat({ silent = false, automatic = false } = {}) {
    const chatId = state.activeChatId;
    if (!chatId || String(state.refreshingChatId || '') === String(chatId)) return;
    if (chatIsGenerating(chatId)) {
      if (!silent) toast('This chat is generating right now. Refresh it when the answer finishes.', 'warning', 'Refresh from Arena');
      return;
    }
    const now = Date.now();
    if (automatic && now - Number(state.refreshCheckedAt[String(chatId)] || 0) < 30000) return;
    state.refreshCheckedAt[String(chatId)] = now;
    state.refreshingChatId = String(chatId);
    renderChatHead();
    try {
      const result = await API.refreshChat(chatId);
      if (String(state.activeChatId) !== String(chatId)) return;
      if (result?.title) state.activeChatTitle = result.title;
      const added = Number(result?.added || 0);
      if (added > 0) {
        state.refreshingChatId = null;
        await openChat(chatId, { skipRefresh: true });
        toast(`Added ${added} newer ${added === 1 ? 'turn' : 'turns'} from arena.ai.`, 'success', 'Refresh from Arena');
      } else {
        void loadChats({ silent: true }).catch(() => undefined);
        if (!silent) toast('This chat is already up to date with arena.ai.', 'info', 'Refresh from Arena');
      }
    } catch (error) {
      if (!silent) toast(errorMessage(error), 'error', 'Refresh from Arena');
    } finally {
      if (String(state.refreshingChatId || '') === String(chatId)) state.refreshingChatId = null;
      if (String(state.activeChatId) === String(chatId)) renderChatHead();
    }
  }

  /* ------- v5: model pins / Elo / chat utilities ------- */
  const FAV_KEY = 'arenaDesktop.modelFavs';
  const HIDDEN_KEY = 'arenaDesktop.modelHidden';

  function modelPinSet(key) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || '[]');
      return new Set(Array.isArray(raw) ? raw.map(String) : []);
    } catch { return new Set(); }
  }

  function toggleModelPin(key, id) {
    const set = modelPinSet(key);
    const sid = String(id);
    if (set.has(sid)) set.delete(sid); else set.add(sid);
    try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* private mode */ }
    return set.has(sid);
  }

  function eloForModel(model) {
    const all = state.eloModels;
    if (!all || !model) return null;
    const slug = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return all[String(model.id || '').toLowerCase()] || all[slug(model.id)] || all[slug(model.name)] || null;
  }

  function ensureElo(rerender) {
    if (state.eloModels !== null || state._eloLoading) return;
    state._eloLoading = true;
    API.getElo().then((data) => {
      state.eloModels = (data && data.enabled !== false && data.models) ? data.models : {};
      state._eloLoading = false;
      if (typeof rerender === 'function') rerender();
    }).catch(() => { state.eloModels = {}; state._eloLoading = false; });
  }

  function exportChatMd() {
    const id = state.activeChatId;
    if (!id) return;
    if (state.demo) {
      const text = state.messages.map((turn) => {
        const parts = [];
        if (turn.user?.content) parts.push(`## User\n\n${turn.user.content}`);
        Object.values(turn.lanes || {}).forEach((lane) => { if (lane.text) parts.push(`## ${lane.modelName || 'Assistant'}\n\n${lane.text}`); });
        return parts.join('\n\n');
      }).join('\n\n');
      const blob = new Blob([`# ${state.activeChatTitle || 'Chat'}\n\n${text}`], { type: 'text/markdown' });
      const a = el('a', { href: URL.createObjectURL(blob), download: 'chat.md' });
      document.body.appendChild(a); a.click(); a.remove();
      return;
    }
    const a = el('a', { href: `/api/chats/${encodeURIComponent(id)}/export.md`, download: '' });
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function openChatAtMessage(chatId, msgIndex) {
    await openChat(chatId);
    window.setTimeout(() => {
      const turns = [...(els.messageList?.querySelectorAll('[data-msg-end]') || [])];
      const target = turns.find((n) => Number(n.dataset.msgEnd) >= Number(msgIndex)) || turns[turns.length - 1];
      if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        target.classList.add('turn-flash');
        window.setTimeout(() => target.classList.remove('turn-flash'), 1600);
      }
    }, 350);
  }

  async function forkFromTurn(turn) {
    if (!state.activeChatId || turn.msgEnd == null) return;
    try {
      const res = await API.forkChat(state.activeChatId, turn.msgEnd);
      if (res?.chat_id) {
        await loadChats({ silent: true }).catch(() => undefined);
        await openChat(res.chat_id);
        toast('Forked into a new chat (fresh Arena session; context carried over as a summary).', 'info', 'Fork created');
      } else {
        toast('Fork is not available in the demo.', 'info');
      }
    } catch (error) { toast(errorMessage(error), 'error', 'Fork failed'); }
  }

  async function undoTurnChanges(turn, button) {
    const ids = Object.values(turn.checkpoints || {}).filter(Boolean);
    if (!ids.length) return;
    if (!button.dataset.armed) {
      button.dataset.armed = '1';
      const label = button.querySelector('span:last-child');
      if (label) label.textContent = 'Click again to undo';
      window.setTimeout(() => { delete button.dataset.armed; renderMessages(); }, 3000);
      return;
    }
    button.disabled = true;
    try {
      let restored = 0; let removed = 0;
      for (const id of ids) {
        const res = await API.restoreCheckpoint(id);
        restored += Number(res?.restored) || 0;
        removed += Number(res?.removed) || 0;
      }
      toast(`Undone: ${restored} file(s) restored, ${removed} created file(s) removed.`, 'info', 'Checkpoint restored');
      if (state.workspacePanelOpen) void loadWorkspaceTree('.', { force: true });
      renderMessages();
    } catch (error) { toast(errorMessage(error), 'error', 'Undo failed'); button.disabled = false; }
  }

  function renderTurnActions(turn) {
    const streaming = Object.values(turn.lanes || {}).some((lane) => lane?.streaming);
    const hasCk = Boolean(turn.checkpoints && Object.values(turn.checkpoints).some(Boolean));
    if (streaming || (!hasCk && turn.msgEnd == null)) return null;
    const row = el('div', { class: 'turn-actions' });
    if (hasCk) {
      const undo = el('button', { class: 'button button-small button-quiet', type: 'button', title: 'Restore the files this turn changed from the checkpoint taken beforehand' },
        iconEl('refresh'), el('span', { text: 'Undo file changes' }));
      undo.addEventListener('click', () => { void undoTurnChanges(turn, undo); });
      row.appendChild(undo);
    }
    if (turn.msgEnd != null) {
      const fork = el('button', { class: 'button button-small button-quiet', type: 'button', title: 'Continue from here in a new chat' },
        iconEl('git-branch'), el('span', { text: 'Fork from here' }));
      fork.addEventListener('click', () => { void forkFromTurn(turn); });
      row.appendChild(fork);
    }
    return row;
  }

  function openAttachMenu() {
    if (!state.workspace) { els.fileInput?.click(); return; }
    const content = el('div');
    const list = el('div', { class: 'popover-list' });
    list.appendChild(popoverOption({
      title: 'Upload files', desc: attachmentHint(), icon: 'plus',
      onClick: () => { closePopover(); els.fileInput?.click(); }
    }));
    list.appendChild(popoverOption({
      title: 'Upload folder to workspace', desc: 'Copy a folder and its contents into the workspace', icon: 'folder',
      onClick: () => { closePopover(); void uploadFolderToWorkspace(); }
    }));
    list.appendChild(popoverOption({
      title: 'Attach workspace files as text', desc: 'Insert file contents into the prompt (works in every mode)', icon: 'file',
      onClick: () => { closePopover(); void openSnapshotPicker(); }
    }));
    content.appendChild(list);
    openPopover(els.attachButton, { title: 'Attach', content });
  }

  async function uploadFolderToWorkspace() {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.addEventListener('change', async () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      toast(`Uploading ${files.length} files to workspace...`, 'info', 'Upload');
      try {
        const result = await API.uploadToWorkspace(files);
        toast(`Uploaded ${result.count || 0} files to workspace`, 'success', 'Upload');
        void refreshWorkspacePanel({ force: true });
      } catch (e) {
        toast(`Upload failed: ${e.message}`, 'error', 'Upload');
      }
    });
    input.click();
  }

  async function collectWorkspaceFiles() {
    const out = [];
    const walk = async (path, depth) => {
      if (depth > 3 || out.length >= 300) return;
      let data;
      try { data = await API.getWorkspaceTree(path); } catch { return; }
      const entries = Array.isArray(data?.entries) ? data.entries : (Array.isArray(data) ? data : []);
      for (const e of entries) {
        const name = String(e?.name || '');
        if (!name || name === '.arena-artifacts' || name === '.git') continue;
        const rel = String(e?.path || (path === '.' ? name : `${path}/${name}`));
        const isDir = Boolean(e?.is_dir ?? e?.dir ?? (e?.type === 'dir') ?? (e?.kind === 'folder'));
        if (isDir) await walk(rel, depth + 1);
        else out.push(rel);
        if (out.length >= 300) break;
      }
    };
    await walk('.', 0);
    return out;
  }

  async function openSnapshotPicker() {
    const content = el('div');
    content.appendChild(el('p', { class: 'modal-copy', text: 'Pick files; their contents are inserted into the prompt as one text block (up to about 40k characters).' }));
    const list = el('div', { class: 'snapshot-list' }, el('span', { class: 'loading-block' }, el('span', { class: 'mini-spinner' }), el('span', { text: 'Loading files…' })));
    content.appendChild(list);
    const addBtn = el('button', { class: 'button button-small', type: 'button', disabled: true }, el('span', { text: 'Insert selected' }));
    content.appendChild(el('div', { class: 'popover-foot' }, el('span'), addBtn));
    openPopover(els.attachButton, { title: 'Workspace files as text', content, wide: true });
    const files = await collectWorkspaceFiles();
    clear(list);
    if (!files.length) { list.appendChild(el('p', { class: 'modal-copy', text: 'No files found in the workspace.' })); return; }
    const picked = new Set();
    files.forEach((rel) => {
      const box = el('input', { type: 'checkbox' });
      box.addEventListener('change', () => {
        if (box.checked) picked.add(rel); else picked.delete(rel);
        addBtn.disabled = !picked.size;
        const label = addBtn.querySelector('span');
        if (label) label.textContent = `Insert selected (${picked.size})`;
      });
      list.appendChild(el('label', { class: 'snapshot-item' }, box, el('span', { text: rel })));
    });
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      try {
        const res = await API.workspaceSnapshot([...picked]);
        if (res?.text && els.prompt) {
          els.prompt.value = `${res.text}\n\n${els.prompt.value}`;
          updateComposerState();
          focusComposer();
          toast(`Inserted ${res.files} file(s), ${res.chars} characters.`, 'info', 'Workspace snapshot');
        }
        closePopover();
      } catch (error) { toast(errorMessage(error), 'error', 'Snapshot failed'); addBtn.disabled = false; }
    });
  }

  function initJumpPill() {
    const content = els.content;
    const list = els.messageList;
    if (!content || !list || document.getElementById('jumpPill')) return;
    const pill = el('div', { class: 'jump-pill', id: 'jumpPill', hidden: true });
    const mk = (label, title, fn) => {
      const b = el('button', { class: 'jump-pill-btn', type: 'button', title, 'aria-label': title }, el('span', { text: label }));
      b.addEventListener('click', fn);
      return b;
    };
    const jump = (dir) => {
      const turns = [...list.querySelectorAll('.message-turn')].filter((n) => n.querySelector('.message-user'));
      if (!turns.length) return;
      const top = content.scrollTop + 80;
      let target = null;
      if (dir < 0) {
        for (let i = turns.length - 1; i >= 0; i -= 1) { if (turns[i].offsetTop < top - 40) { target = turns[i]; break; } }
        target = target || turns[0];
      } else {
        target = turns.find((n) => n.offsetTop > top + 40) || turns[turns.length - 1];
      }
      content.scrollTo({ top: Math.max(0, target.offsetTop - 60), behavior: 'smooth' });
    };
    pill.append(
      mk('↑', 'Previous message', () => jump(-1)),
      mk('↓', 'Next message', () => jump(1)),
      mk('⤓', 'Jump to latest', () => content.scrollTo({ top: content.scrollHeight, behavior: 'smooth' }))
    );
    // One control, sticky inside the chat column (it used to be fixed to the
    // window, floating over the side panel, next to a second "back to bottom").
    content.appendChild(pill);
    content.addEventListener('scroll', () => {
      pill.hidden = content.scrollHeight - content.scrollTop - content.clientHeight < 300;
    }, { passive: true });
  }

  let _rlSwitchBtn = null;
  function syncRateLimitAccountHint(rateLimitLeft) {
    try {
      const others = (state.status?.accounts || []).filter((a) => a && !a.current && a.id);
      const show = rateLimitLeft > 0 && others.length > 0 && !state.demo && els.composerSecondaryHint;
      if (!show) { if (_rlSwitchBtn) _rlSwitchBtn.hidden = true; return; }
      if (!_rlSwitchBtn) {
        _rlSwitchBtn = el('button', { class: 'button button-small button-quiet rl-switch', type: 'button' },
          iconEl('user'), el('span', { text: 'Switch account & resend' }));
        _rlSwitchBtn.addEventListener('click', async () => {
          const other = (state.status?.accounts || []).find((a) => a && !a.current && a.id);
          if (!other) return;
          _rlSwitchBtn.disabled = true;
          try {
            await API.switchAccount(other.id);
            state.rateLimitUntil = 0;
            toast(`Switched to ${other.email || other.name || 'the other account'} — press Send again.`, 'info', 'Account switched');
            await loadStatus().catch(() => undefined);
          } catch (error) { toast(errorMessage(error), 'error', 'Switch failed'); }
          _rlSwitchBtn.disabled = false;
          updateComposerState();
        });
        els.composerSecondaryHint.after(_rlSwitchBtn);
      }
      _rlSwitchBtn.hidden = false;
    } catch { /* decorative hint */ }
  }

  function clockText(epoch) {
    return new Date(epoch * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  async function refreshPulse() {
    if (state.demo || !state.authenticated) return;
    try {
      const p = await API.getPulse();
      if (p && p.ok) state.pulse = p;
    } catch { /* keep the last reading */ }
    renderUsageBar();
    const p = state.pulse;
    if (p && p.left <= 0 && !state.limitToastShown) {
      state.limitToastShown = true;
      toast(`Arena's daily credits are used up.${p.reset ? ` They refresh at ${clockText(p.reset)}.` : ''} Replies stop until then.`, 'warning', 'Daily limit reached');
    }
    if (p && p.left > 0) state.limitToastShown = false;
  }

  // Arena's own meter (/api/me/pulse): the percent of today's credits left. Nothing here is estimated.
  function renderUsageBar() {
    if (!els.usageBarWrap || !els.usageBarFill || !els.usageBarLabel) return;
    const p = state.pulse;
    if (!p || state.demo) {
      els.usageBarWrap.hidden = true;
      return;
    }
    els.usageBarWrap.hidden = false;
    const used = Math.max(0, Math.min(100, 100 - p.left));
    let label;
    if (p.left <= 0) {
      label = `Daily limit reached${p.reset ? ` \u2014 credits refresh at ${clockText(p.reset)}` : ''}`;
    } else {
      label = `${p.left}% of today's credits left`;
      if (p.left <= 15) label += ' \u2014 running low';
      if (p.reset) {
        const diff = p.reset * 1000 - Date.now();
        if (diff > 0) {
          const h = Math.floor(diff / 3600000);
          const m = Math.floor((diff % 3600000) / 60000);
          label += h > 0 ? `, refresh in ${h}h ${m}m` : `, refresh in ${m}m`;
        }
      }
    }
    els.usageBarFill.style.width = `${used}%`;
    els.usageBarFill.classList.toggle('warn', used >= 70 && used < 90);
    els.usageBarFill.classList.toggle('danger', used >= 90);
    els.usageBarLabel.textContent = label;
  }

  function activeTodos() {
    const items = state.chatTodos[String(state.activeChatId || '')];
    return Array.isArray(items) ? items.filter((it) => it && it.text) : [];
  }

  function renderUnattachedTodos() {
    const items = activeTodos();
    if (!items.length) return null;
    const done = items.filter((it) => it.status === 'done').length;
    const section = el('section', { class: 'message-turn', 'aria-label': 'Task checklist' });
    const card = el('div', { class: 'permission-card todos-card' });
    const head = el('div', { class: 'permission-head' },
      el('span', { class: 'permission-icon' }, iconEl('check')),
      el('div', { class: 'permission-heading' },
        el('p', { class: 'permission-title', text: 'Checklist' }),
        el('p', { class: 'permission-subtitle', text: `${done}/${items.length} done` })));
    const list = el('ul', { class: 'todos-list' });
    items.forEach((it) => {
      const mark = it.status === 'done' ? '\u2713' : (it.status === 'doing' ? '\u25B8' : '\u25CB');
      list.appendChild(el('li', { class: `todo-item is-${it.status === 'done' || it.status === 'doing' ? it.status : 'pending'}` },
        el('span', { class: 'todo-mark', text: mark }),
        el('span', { class: 'todo-text', text: it.text })));
    });
    card.append(head, el('div', { class: 'permission-body' }, list));
    section.appendChild(card);
    return section;
  }

  function renderUnattachedPermissions(renderedIds) {
    // Only this chat's approvals: another chat's request waits in that chat
    // (the sidebar badge still counts it) instead of showing up here.
    const here = state.activeChatId ? String(state.activeChatId) : '';
    const remaining = state.pendingPermissions.filter((permission) => (!permission.id || !renderedIds.has(String(permission.id)))
      && (!permission.chatId || String(permission.chatId) === here));
    if (!remaining.length) return null;
    const section = el('section', { class: 'message-turn', 'aria-label': "Pending approval" });
    section.appendChild(el('div', { class: 'activity-head' },
      el('span', { class: 'activity-icon' }, iconEl('shield-alert')),
      el('span', { class: 'activity-title', text: "Awaiting your decision" }),
      el('span', { class: 'activity-status is-wait', text: String(remaining.length) })
    ));
    remaining.forEach((permission) => section.appendChild(renderPermissionCard(permission)));
    return section;
  }

  function renderMessages({ preserveScroll = true } = {}) {
    if (!els.messageList) return;
    const content = els.content;
    const previousScroll = content?.scrollTop || 0;
    const wasNearBottom = content ? content.scrollHeight - content.scrollTop - content.clientHeight < 140 : true;
    clear(els.messageList);

    if (state.historyLoading) {
      const loading = el('div', { class: 'loading-history', 'aria-label': "Loading history" });
      loading.appendChild(el('div', { class: 'skeleton-bar w-35' }));
      loading.appendChild(el('div', { class: 'skeleton-right' }));
      loading.appendChild(el('div', { class: 'message-skeleton' }, el('div', { class: 'skeleton-bar w-80' }), el('div', { class: 'skeleton-bar' }), el('div', { class: 'skeleton-bar w-55' })));
      els.messageList.appendChild(loading);
      updateArtifactCount();
      return;
    }

    if (state.historyError) {
      els.messageList.appendChild(el('div', { class: 'history-error' },
        el('div', { class: 'error-panel' },
          el('h3', { text: "Failed to load dialogue" }),
          el('p', { text: state.historyError }),
          el('button', { class: 'button button-small', type: 'button', 'data-action': 'retry-history' }, iconEl('refresh'), el('span', { text: "Retry" })),
          el('button', { class: 'button button-small button-quiet', type: 'button', 'data-action': 'new-chat' }, el('span', { text: "New chat" }))
        )
      ));
      return;
    }

    if (!state.messages.length) {
      els.messageList.appendChild(el('div', { class: 'history-empty' },
        el('span', { class: 'history-empty-icon' }, iconEl('spark')),
        el('h3', { text: state.activeChatId ? "History is currently empty" : "Start a new dialogue" }),
        el('p', { text: state.activeChatId ? "Send the first message — responses will appear here. Mode and task type settings are visible in the input field." : "Select an existing chat or create a new one." })
      ));
      return;
    }

    const renderedPermissions = new Set();
    let pairIndex = -1;
    state.messages.forEach((turn) => {
      if (turn.lanes) {
        Object.values(turn.lanes).forEach((lane) => {
          (lane.permissions || []).forEach((permission) => {
            if (permission.id) renderedPermissions.add(String(permission.id));
          });
        });
      }
      if (turn.divider) {
        els.messageList.appendChild(el('div', { class: 'chat-divider', role: 'note' },
          iconEl('compress'), el('span', { text: turn.divider })));
        return;
      }
      const isPair = Boolean(turn?.lanes?.a && turn?.lanes?.b);
      if (isPair) pairIndex += 1;
      els.messageList.appendChild(renderTurn(turn, isPair ? pairIndex : -1));
    });
    const unattached = renderUnattachedPermissions(renderedPermissions);
    if (unattached) els.messageList.appendChild(unattached);
    const questions = renderUnattachedQuestions();
    if (questions) els.messageList.appendChild(questions);
    const mediaChoices = renderUnattachedMediaChoices();
    if (mediaChoices) els.messageList.appendChild(mediaChoices);
    const todos = renderUnattachedTodos();
    if (todos) els.messageList.appendChild(todos);

    if (content) {
      if (!preserveScroll || wasNearBottom) {
        requestAnimationFrame(() => {
          if (!content) return;
          content.scrollTop = content.scrollHeight;
        });
      } else {
        content.scrollTop = previousScroll;
      }
    }
    updateArtifactCount();
  }

  function scheduleChatRender() {
    if (state._renderFrame) return;
    state._renderFrame = requestAnimationFrame(() => {
      state._renderFrame = null;
      if (state.view === 'chat') renderMessages();
    });
  }

  function renderChatArea() {
    if (!els.chatView) return;
    renderChatHead();
    renderChallenge();
    renderMessages({ preserveScroll: false });
    setView('chat');
  }

  function updateArtifactCount() {
    const count = state.artifacts.length;
    if (els.artifactCount) {
      els.artifactCount.textContent = String(count);
      els.artifactCount.hidden = !count;
    }
    if (els.artifactsButton) {
      els.artifactsButton.setAttribute('aria-label', count ? `Open dialogue artifacts: ${count}` : "Open dialogue artifacts");
    }
  }

  function renderWelcomeState() {
    setView('welcome');
  }

  /* ---------------------------------------------------------------------- */
  /* Composer and model presentation                                       */