  /* ---------------------------------------------------------------------- */
  function currentViewTitle() {
    if (state.view === 'chat') return state.activeChatTitle || "Conversation";
    return "Home";
  }

  function updateTopbarTitle() {
    if (els.topbarTitle) els.topbarTitle.textContent = currentViewTitle();
    if (els.crumbTitle) els.crumbTitle.textContent = currentViewTitle();
    document.title = `${state.demo ? "Demo · " : ''}${state.view === 'chat' ? `${truncate(state.activeChatTitle || "Conversation", 32)} — ` : ''}Arena Desktop`;
  }

  function setView(view, { focus = false } = {}) {
    state.view = view === 'chat' ? 'chat' : 'welcome';
    if (els.welcomeView) els.welcomeView.hidden = state.view !== 'welcome';
    if (els.chatView) els.chatView.hidden = state.view !== 'chat';
    const mainArea = els.mainArea || document.querySelector('.main-area');
    if (mainArea) mainArea.classList.toggle('is-welcome', state.view === 'welcome');
    // One composer, two homes: centered on the welcome screen (like
    // arena.ai's home page), docked at the bottom inside a chat.
    const shell = els.composerShell || document.querySelector('.composer-shell');
    if (shell) {
      if (state.view === 'welcome' && els.welcomeComposerSlot && shell.parentNode !== els.welcomeComposerSlot) {
        els.welcomeComposerSlot.appendChild(shell);
      } else if (state.view === 'chat' && mainArea && shell.parentNode !== mainArea) {
        mainArea.appendChild(shell);
      }
    }
    updateTopbarTitle();
    if (focus) {
      window.setTimeout(() => {
        if (els.content) els.content.scrollTop = 0;
      }, 0);
    }
  }

  function renderChatHead() {
    if (!els.chatTitle) return;
    const meta = modeMeta(state.mode);
    const modality = modalityMeta(state.modality);
    els.chatTitle.textContent = state.activeChatTitle || "Conversation";
    if (els.chatEyebrow) els.chatEyebrow.textContent = meta.label;
    clear(els.chatMeta);
    els.chatMeta.append(
      el('span', { class: 'meta-chip' }, iconEl('git-branch'), el('span', { text: meta.label })),
      el('span', { class: 'meta-chip' }, iconEl(modality.icon), el('span', { text: modality.label }))
    );
    if (state.mode === 'agent') {
      els.chatMeta.append(el('span', { class: 'meta-chip' }, iconEl('spark'), el('span', { text: "Automatic model selection" })));
    } else if (state.mode !== 'battle') {
      const name = currentModelA()?.name || "No model selected";
      els.chatMeta.append(el('span', { class: 'meta-chip' }, iconEl('spark'), el('span', { text: name })));
      if (state.mode === 'side-by-side') {
        els.chatMeta.append(el('span', { class: 'meta-chip' }, iconEl('spark'), el('span', { text: currentModelB()?.name || "Model B not selected" })));
      }
    } else {
      els.chatMeta.append(el('span', { class: 'meta-chip' }, iconEl('spark'), el('span', { text: "Opponents are selected by the server" })));
    }
    if (state.workspace) {
      els.chatMeta.append(el('span', { class: 'meta-chip' }, iconEl('folder'), el('span', { text: workspaceName() })));
    }
    if (state.activeChatId && state.messages.length) {
      const activeSummary = state.chats.find((chat) => String(chat.id) === String(state.activeChatId));
      const linked = Boolean(state.activeChatEvalId || activeSummary?.eval_id);
      if (linked) {
        const refreshing = String(state.refreshingChatId || '') === String(state.activeChatId);
        const generating = chatIsGenerating(state.activeChatId);
        const refresh = el('button', {
          class: 'meta-chip meta-chip-btn', type: 'button', disabled: refreshing || generating,
          title: generating ? 'Refresh is available when this answer finishes'
            : 'Download newer turns from arena.ai into this chat',
          'aria-label': 'Refresh this chat from arena.ai'
        }, iconEl('refresh'), el('span', { text: refreshing ? 'Refreshing…' : 'Refresh from Arena' }));
        refresh.addEventListener('click', () => { void refreshActiveChat(); });
        els.chatMeta.appendChild(refresh);
      }
      const exp = el('button', { class: 'meta-chip meta-chip-btn', type: 'button', title: 'Download this chat as Markdown' },
        iconEl('download'), el('span', { text: 'Export .md' }));
      exp.addEventListener('click', () => exportChatMd());
      els.chatMeta.appendChild(exp);
    }
  }

  function renderChallenge() {
    if (!els.challengeSlot) return;
    clear(els.challengeSlot);
    if (!state.challenge) {
      els.challengeSlot.hidden = true;
      return;
    }
    const raw = state.challenge;
    const message = typeof raw === 'string' ? raw : String(raw.message ?? raw.title ?? "The server reports a manual login check.");
    const card = el('div', { class: 'challenge-card', role: 'status' },
      el('h3', {}, iconEl('shield-alert'), el('span', { text: "Login verification required" })),
      el('p', { text: `${message} Open a separate arena.ai window and complete the check manually. Automatic bypass is not performed.` }),
      el('button', { class: 'button button-small', type: 'button', 'data-action': 'engine-show' }, iconEl('panel-right'), el('span', { text: "Open window" })),
      el('button', { class: 'button button-small button-quiet', type: 'button', 'data-action': 'settings-connection' }, el('span', { text: "Login status" }))
    );
    els.challengeSlot.appendChild(card);
    els.challengeSlot.hidden = false;
  }

  let challengeModal = null;

  function showChallengeModal() {
    if (challengeModal) return;
    const content = el('div', {},
      el('p', { class: 'modal-note', text: 'Arena paused this message for a quick human check. The arena.ai window with the checkbox was brought to the front: tick the box there (solve the pictures if any) and your message is resent automatically. Nothing is sent until you finish.' }));
    challengeModal = mountModal({
      title: 'Human check needed',
      subtitle: 'arena.ai verification',
      size: 'small',
      content,
      actions: [
        { label: 'Later', variant: 'quiet', onClick: () => {} },
        {
          label: 'Show the check window', variant: 'primary', icon: 'panel-right', autofocus: true,
          onClick: () => { void showEngine(); }
        }
      ],
      onClose: () => { challengeModal = null; }
    });
  }

  function closeChallengeModal() {
    if (!challengeModal) return;
    const modal = challengeModal;
    challengeModal = null;
    modal.close();
  }

  // --- Composer QoL (v5.1.6): per-chat drafts, message queue, done sound ---
  const DRAFTS_KEY = 'arena-drafts-v1';
  const composerDrafts = (() => {
    try { return new Map(Object.entries(JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}'))); }
    catch { return new Map(); }
  })();

  function draftKey() { return state.activeChatId ? String(state.activeChatId) : '__home__'; }

  function persistDrafts() {
    try {
      const entries = [...composerDrafts.entries()].filter(([, value]) => value).slice(-60);
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch { /* storage unavailable */ }
  }

  function saveComposerDraft() {
    if (!els.prompt) return;
    const value = els.prompt.value;
    if (value) composerDrafts.set(draftKey(), value);
    else composerDrafts.delete(draftKey());
    persistDrafts();
  }

  function restoreComposerDraft() {
    if (!els.prompt) return;
    els.prompt.value = composerDrafts.get(draftKey()) || '';
    state.draft = els.prompt.value;
    try { resizePrompt(); } catch { /* autosize unavailable */ }
    updateComposerState();
    renderQueuedBar();
  }

  const queuedMessages = new Map(); // chatId -> text to send when that chat turns idle

  function renderQueuedBar() {
    const shell = els.composerShell;
    if (!shell) return;
    const key = state.activeChatId ? String(state.activeChatId) : null;
    const queued = key ? queuedMessages.get(key) : null;
    let bar = document.getElementById('queuedBar');
    if (!queued) { bar?.remove(); return; }
    if (!bar) {
      bar = el('div', { class: 'queued-bar', id: 'queuedBar' });
      (els.composerCard || shell).before(bar);
    }
    const stamp = `${key}:${queued.length}:${queued.slice(0, 24)}`;
    if (bar.dataset.stamp === stamp) return;
    bar.dataset.stamp = stamp;
    clear(bar);
    bar.append(
      iconEl('clock'),
      el('span', {
        class: 'queued-bar-text',
        text: `Queued: ${truncate(queued, 80)}`,
        title: 'This message sends itself when the current answer finishes.'
      }),
      el('button', {
        class: 'button button-small button-quiet', type: 'button', title: 'Remove the queued message',
        onclick: () => { queuedMessages.delete(key); renderQueuedBar(); focusComposer(); }
      }, iconEl('x'), el('span', { text: 'Cancel' })));
  }

  function flushQueuedMessage(chatId) {
    const key = chatId ? String(chatId) : null;
    if (!key || String(state.activeChatId) !== key) return;
    const text = queuedMessages.get(key);
    if (!text || chatIsGenerating(key) || state.starting || state.historyLoading) return;
    queuedMessages.delete(key);
    renderQueuedBar();
    if (els.prompt) els.prompt.value = text;
    void sendMessage();
  }

  let doneAudio = null;

  function primeDoneAudio() {
    if (doneAudio) { if (doneAudio.state === 'suspended') void doneAudio.resume(); return; }
    try { doneAudio = new (window.AudioContext || window.webkitAudioContext)(); } catch { doneAudio = null; }
  }

  function maybePlayDoneSound(generation, { wasStopped = false } = {}) {
    if (!generation?.done || wasStopped || generation.hadError) return;
    if (state.appSettings?.notify_sound === false) return;
    if (!doneAudio) primeDoneAudio();
    if (!doneAudio) return;
    playChime(doneAudio);
  }

  // Soft three-note bell (C6 - E6 - G6): a sine fundamental plus a quiet
  // inharmonic partial gives a glassy, marimba-like tone instead of a beep.
  function playChime(ctx) {
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      const volume = Math.min(1, Math.max(0, Number(state.appSettings?.notify_volume ?? 0.6)));
      if (!volume) return;
      const t = ctx.currentTime + 0.02;
      const master = ctx.createGain();
      master.gain.value = 0.42 * volume;
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 5200;
      master.connect(tone);
      tone.connect(ctx.destination);
      [[1046.5, 0], [1318.5, 0.09], [1568.0, 0.18]].forEach(([freq, offset], i) => {
        [[1, 1, 'sine'], [2.76, 0.18, 'sine'], [1, 0.22, 'triangle']].forEach(([ratio, level, type]) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = type;
          osc.frequency.value = freq * ratio;
          const start = t + offset;
          const tail = i === 2 ? 1.1 : 0.55;
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(level, start + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + tail * (ratio > 1 ? 0.45 : 1));
          osc.connect(gain);
          gain.connect(master);
          osc.start(start);
          osc.stop(start + tail + 0.05);
        });
      });
    } catch { /* audio unavailable */ }
  }

  // --- Find in chat (Ctrl+F): WebView2 has no built-in page find ---
  let findHits = [];
  let findIndex = -1;

  function clearFindHighlights() {
    document.querySelectorAll('#messageList mark.find-hit').forEach((mark) => {
      mark.replaceWith(document.createTextNode(mark.textContent));
    });
    els.messageList?.normalize();
    findHits = [];
    findIndex = -1;
  }

  function runFind(query) {
    clearFindHighlights();
    const counter = document.querySelector('#findBar .find-counter');
    const needle = String(query || '').trim().toLocaleLowerCase('en');
    if (!needle || !els.messageList) { if (counter) counter.textContent = ''; return; }
    const walker = document.createTreeWalker(els.messageList, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.toLocaleLowerCase('en').includes(needle)) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.closest('script,style,mark,button')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const targets = [];
    while (walker.nextNode()) targets.push(walker.currentNode);
    for (const node of targets) {
      const text = node.nodeValue;
      const lower = text.toLocaleLowerCase('en');
      const frag = document.createDocumentFragment();
      let at = 0;
      let hit = lower.indexOf(needle, at);
      while (hit !== -1) {
        if (hit > at) frag.appendChild(document.createTextNode(text.slice(at, hit)));
        const mark = document.createElement('mark');
        mark.className = 'find-hit';
        mark.textContent = text.slice(hit, hit + needle.length);
        frag.appendChild(mark);
        findHits.push(mark);
        at = hit + needle.length;
        hit = lower.indexOf(needle, at);
      }
      if (at < text.length) frag.appendChild(document.createTextNode(text.slice(at)));
      node.replaceWith(frag);
    }
    if (counter) counter.textContent = findHits.length ? `${findHits.length} found` : 'No matches';
    if (findHits.length) stepFind(1, true);
  }

  function stepFind(direction, fresh = false) {
    findHits = findHits.filter((mark) => mark.isConnected);
    if (!findHits.length) return;
    findIndex = fresh ? 0 : (findIndex + direction + findHits.length) % findHits.length;
    findHits.forEach((mark, i) => mark.classList.toggle('find-hit-current', i === findIndex));
    findHits[findIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
    const counter = document.querySelector('#findBar .find-counter');
    if (counter) counter.textContent = `${findIndex + 1}/${findHits.length}`;
  }

  function closeFindBar() {
    clearFindHighlights();
    document.getElementById('findBar')?.remove();
    focusComposer();
  }

  function toggleFindBar() {
    let bar = document.getElementById('findBar');
    if (bar) { closeFindBar(); return; }
    const input = el('input', { type: 'search', class: 'find-input', placeholder: 'Find in this chat', 'aria-label': 'Find in this chat' });
    input.addEventListener('input', () => runFind(input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); stepFind(event.shiftKey ? -1 : 1); }
      if (event.key === 'Escape') { event.preventDefault(); closeFindBar(); }
    });
    bar = el('div', { class: 'find-bar', id: 'findBar' },
      iconEl('search'), input,
      el('span', { class: 'find-counter', text: '' }),
      el('button', { class: 'icon-button tiny', type: 'button', 'aria-label': 'Previous match', style: { transform: 'rotate(180deg)' }, onclick: () => stepFind(-1) }, iconEl('chevron-down')),
      el('button', { class: 'icon-button tiny', type: 'button', 'aria-label': 'Next match', onclick: () => stepFind(1) }, iconEl('chevron-down')),
      el('button', { class: 'icon-button tiny', type: 'button', 'aria-label': 'Close find', onclick: () => closeFindBar() }, iconEl('x')));
    document.body.appendChild(bar);
    input.focus();
  }

  function userAttachmentsNode(message) {
    const items = normalizeUserAttachments(message?.attachments || message?.experimental_attachments);
    // Live turns carry local previews for freshly attached images.
    const live = Array.isArray(message?.attachments) ? message.attachments : [];
    if (!items.length && !live.length) return null;
    const wrap = el('div', { class: 'user-attachments' });
    const shown = live.length ? live : items;
    shown.forEach((item) => {
      const name = String(item.name || item.filename || 'File');
      const media = String(item.contentType || item.mediaType || '');
      const src = item.previewUrl || (media.startsWith('image/') ? safeUrl(item.url, { image: true }) : null);
      if (src) {
        wrap.appendChild(el('img', { class: 'user-attachment-image', src, alt: name, title: name, loading: 'lazy' }));
        return;
      }
      const href = item.url && /^https?:\/\//.test(item.url) ? safeUrl(item.url) : null;
      const chip = el(href ? 'a' : 'span', {
        class: 'user-attachment-chip',
        ...(href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {})
      }, iconEl(media === 'application/pdf' ? 'file-text' : 'file'),
        el('span', { text: name }),
        item.size ? el('span', { class: 'user-attachment-size', text: formatBytes(item.size) }) : null);
      wrap.appendChild(chip);
    });
    return wrap;
  }

  function userMessageNode(message) {
    const createdAt = message?.created_at || message?.createdAt || message?.timestamp;
    return el('article', { class: 'message message-user' },
      el('div', { class: 'user-bubble' },
        el('div', { class: 'user-meta' },
          el('span', { text: "You" }),
          createdAt ? el('time', { text: formatClock(createdAt), datetime: String(createdAt) }) : null
        ),
        userAttachmentsNode(message),
        el('div', { class: 'user-text', text: textValue(message?.content ?? message?.text ?? message?.message ?? '') })
      )
    );
  }

  function renderSources(lane) {
    if (!Array.isArray(lane.sources) || !lane.sources.length) return null;
    const sourceNodes = lane.sources.map((source, index) => {
      const content = el('span', { class: 'source-copy' },
        el('span', { class: 'source-title', text: source.title || source.domain || "Source" }),
        source.url ? el('span', { class: 'source-url', text: source.domain || source.url }) : null
      );
      const indexEl = el('span', { class: 'source-index', text: String(index + 1) });
      if (source.url) {
        return el('a', {
          class: 'source-card', href: source.url, target: '_blank', rel: 'noopener noreferrer',
          title: source.url
        }, indexEl, content, iconEl('external'));
      }
      return el('div', { class: 'source-card' }, indexEl, content);
    });
    return el('div', { class: 'sources' },
      el('div', { class: 'sources-title' }, iconEl('search'), el('span', { text: lane.demo ? "Sources · demo" : "Sources" })),
      el('div', { class: 'source-list' }, sourceNodes)
    );
  }

  function renderMedia(lane) {
    if (!Array.isArray(lane.media) || !lane.media.length) return null;
    const cards = lane.media.map((media) => {
      const caption = el('div', { class: 'media-caption' },
        el('span', { class: 'media-title', title: media.title, text: media.title }),
        el('button', {
          class: 'media-save', type: 'button', 'data-save-media': media.url || media.poster || '',
          'aria-label': `Save media: ${media.title}`, title: "Save via API"
        }, iconEl('download'))
      );
      let frame;
      if (media.kind === 'audio' && media.url) {
        frame = el('div', { class: 'media-frame is-audio' },
          el('audio', { controls: true, preload: 'metadata', src: media.url, 'aria-label': media.alt }));
      } else if (media.kind === 'video' && media.url) {
        const video = el('video', {
          controls: true, preload: 'metadata', poster: media.poster || false,
          'aria-label': media.alt
        }, el('source', { src: media.url }));
        frame = el('div', { class: 'media-frame' }, video);
      } else if (media.kind === 'video') {
        frame = el('div', { class: 'media-frame is-placeholder' }, iconEl('video'), el('span', { class: 'media-video-badge' }, iconEl('play'), el('span', { text: "Video · event" })));
      } else if (media.url) {
        frame = el('div', { class: 'media-frame' }, el('img', { src: media.url, alt: media.alt, loading: 'lazy', referrerpolicy: 'no-referrer' }));
      } else {
        frame = el('div', { class: 'media-frame is-placeholder' }, iconEl('image'));
      }
      return el('figure', { class: 'media-card' }, frame, caption);
    });
    return el('div', { class: 'media-grid' }, cards);
  }

  function activityStatus(status) {
    const value = String(status || '').toLowerCase();
    if (['ok', 'done', 'success', 'complete', 'completed', 'ready', 'idle'].includes(value)) return { label: "Done", cls: 'is-ok' };
    if (['error', 'failed', 'denied', 'cancelled'].includes(value)
      || /^(denied|blocked|cancel|error|fail|stopped)/.test(value)) return { label: "Error", cls: 'is-err' };
    if (['pending', 'waiting', 'permission'].includes(value)) return { label: "Waiting", cls: 'is-wait' };
    return { label: status || "In progress", cls: '' };
  }

  function renderDiffCard(activity) {
    const raw = activity.raw || {};
    const adds = raw.add || 0;
    const dels = raw.del || 0;
    const verb = raw.verb || 'Edited';
    const path = raw.path || activity.path || '';
    const hasError = Boolean(raw.error);
    const pending = Boolean(raw.pending);
    const name = verb === 'Deleted' ? 'Delete' : verb === 'Created' || verb === 'Writing' ? 'Write' : 'Update';
    const stateCls = hasError ? 'is-err' : (pending || !activityStatus(activity.status).cls) ? 'is-run' : 'is-ok';
    const row = el('div', { class: `tool-row ${stateCls}`, 'data-activity-id': activity.id },
      el('div', { class: 'tool-head', title: path },
        el('span', { class: 'tool-dot', 'aria-hidden': 'true' }),
        el('span', { class: 'tool-name', text: name }),
        el('span', { class: 'tool-arg' }, el('span', { class: 'tool-paren', text: '(' }),
          el('span', { class: 'tool-arg-text', text: path }), el('span', { class: 'tool-paren', text: ')' }))));
    let summary;
    if (hasError) summary = String(raw.error);
    else if (verb === 'Deleted') summary = 'Deleted';
    else if (pending) summary = verb === 'Writing' ? 'Writing…' : 'Editing…';
    else if (verb === 'Created') summary = `Wrote ${plural(adds, 'line')}`;
    else summary = `Added ${plural(adds, 'line')}, removed ${plural(dels, 'line')}`;
    const content = el('div', { class: 'tool-content' }, el('div', { class: `tool-summary${hasError ? ' is-err' : ''}`, text: summary }));
    const expanded = expandedActivities.has(activity.id);
    const diffBox = raw.diff && !pending ? renderDiffLines(raw.diff, expanded ? 400 : 8) : null;
    if (diffBox) {
      content.appendChild(diffBox);
      if (!expanded && String(raw.diff).split('\n').length > 12) {
        content.appendChild(el('button', { class: 'tool-more tool-toggle', type: 'button', 'data-tool-toggle': activity.id, text: '… (click to expand)' }));
      } else if (expanded) {
        content.appendChild(el('button', { class: 'tool-more tool-toggle', type: 'button', 'data-tool-toggle': activity.id, text: 'Collapse' }));
      }
    }
    row.appendChild(el('div', { class: 'tool-body' }, el('span', { class: 'tool-elbow', 'aria-hidden': 'true', text: '⎿' }), content));
    return row;
  }

  const _livePreviewFrames = new Map();

  function renderFilePreview(filePath) {
    const fileName = filePath.split('/').pop() || filePath;
    const ext = fileName.split('.').pop().toLowerCase();
    const isHtml = ['html', 'htm'].includes(ext);
    if (!isHtml) return null;
    const card = el('div', { class: 'file-preview-card' });
    const head = el('div', { class: 'file-preview-head' },
      iconEl('layout'),
      el('span', { class: 'file-preview-name', text: fileName }),
      el('span', { class: 'file-preview-badge', text: 'Live Preview' })
    );
    card.appendChild(head);
    const iframe = document.createElement('iframe');
    iframe.className = 'file-preview-frame';
    iframe.sandbox = 'allow-scripts allow-modals allow-popups';
    iframe.loading = 'lazy';
    iframe.src = previewLink(filePath) + '?t=' + Date.now();
    iframe.title = `Preview of ${fileName}`;
    card.appendChild(iframe);
    _livePreviewFrames.set(filePath, iframe);
    const actions = el('div', { class: 'file-preview-actions' });
    const refreshBtn = el('button', { type: 'button' }, iconEl('refresh'), el('span', { text: 'Refresh' }));
    refreshBtn.addEventListener('click', () => { refreshFilePreview(filePath); });
    actions.appendChild(refreshBtn);
    const openBtn = el('button', { type: 'button' }, iconEl('external'), el('span', { text: 'Open preview' }));
    openBtn.addEventListener('click', () => openPreview(previewLink(filePath, { absolute: true }), fileName));
    actions.appendChild(openBtn);
    card.appendChild(actions);
    return card;
  }

  function refreshFilePreview(filePath) {
    const iframe = _livePreviewFrames.get(filePath);
    if (!iframe) return;
    iframe.src = previewLink(filePath) + '?t=' + Date.now();
  }

  function refreshAllHtmlPreviews() {
    for (const [path] of _livePreviewFrames) refreshFilePreview(path);
  }

  /* ---------------------------------------------------------------------- */
  /* Tool calls, Claude Code style:  ● Bash(npm install)                     */
  /*                                   ⎿  added 120 packages                 */
  /* ---------------------------------------------------------------------- */

  const TOOL_LABELS = {
    run_cmd: 'Bash', bash: 'Bash', shell: 'Bash', execute_command: 'Bash', terminal: 'Bash', run_command: 'Bash',
    read_file: 'Read', read_files: 'Read', read: 'Read', view: 'Read', cat: 'Read',
    write_file: 'Write', write: 'Write', create_file: 'Write', write_project: 'Write',
    edit_file: 'Update', edit: 'Update', str_replace: 'Update', str_replace_editor: 'Update', multi_edit: 'Update',
    ls: 'List', list_files: 'List', list_dir: 'List', list_directory: 'List',
    search: 'Search', grep: 'Search', glob: 'Search', find: 'Search',
    mkdir: 'Create folder', delete: 'Delete', stop_cmd: 'Stop',
    web_search: 'Web search', search_web: 'Web search', web_fetch: 'Fetch', fetch: 'Fetch', fetch_url: 'Fetch',
    generate_image: 'Generate image', edit_image: 'Edit image', generate_video: 'Generate video',
    ask_user: 'Question', propose_plan: 'Plan', set_todos: 'Update todos', todo_write: 'Update todos',
    delegate_task: 'Task', delete_subagent: 'Delete sub-agent', add_voice: 'Choose voice'
  };
  const ARG_KEYS = ['command', 'cmd', 'file_path', 'path', 'filePath', 'pattern', 'query', 'url', 'prompt',
    'question', 'task', 'description', 'id', 'name'];
  const COLLAPSED_LINES = 4;
  const expandedActivities = new Set();

  function toolKey(activity) {
    const raw = activity.raw || {};
    return String(raw.tool || activity.name || '').toLowerCase().replace(/^arena__/, '').replace(/^tool-/, '');
  }

  function toolLabel(activity) {
    const raw = activity.raw || {};
    if (raw.child_id) return 'Task';
    if (raw.mcp) return `${raw.server || 'MCP'} · ${raw.mcp_tool || raw.tool || 'tool'}`;
    const key = toolKey(activity);
    if (TOOL_LABELS[key]) return TOOL_LABELS[key];
    const name = String(activity.name || raw.tool || 'Tool');
    return name.length > 1 ? name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ') : name;
  }

  function parseJsonObject(text) {
    const value = String(text || '').trim();
    if (!value.startsWith('{')) return null;
    try {
      const obj = JSON.parse(value);
      return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
    } catch (_) {
      return null;
    }
  }

  function pickArg(obj) {
    for (const key of ARG_KEYS) {
      const value = obj[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (Array.isArray(value) && value.length && typeof value[0] === 'string') return value.join(', ');
    }
    if (Array.isArray(obj.questions) && obj.questions[0]) {
      const q = obj.questions[0];
      return String(typeof q === 'string' ? q : (q.question || q.text || ''));
    }
    const compact = JSON.stringify(obj);
    return compact === '{}' ? '' : compact;
  }

  function toolArg(activity) {
    const raw = activity.raw || {};
    if (raw.child_id) return raw.model_name || '';
    const key = toolKey(activity);
    if (activity.command && key !== 'stop_cmd') return activity.command;
    const input = raw.input && typeof raw.input === 'object' ? JSON.stringify(raw.input) : String(raw.input || '');
    const source = input || String(activity.path || raw.path || '');
    const obj = parseJsonObject(source);
    if (obj) return pickArg(obj);
    if (key === 'stop_cmd') return activity.command || '';
    // Local tools send an absolute path plus a folder-relative one: show the short one.
    if (raw.rel && raw.rel !== '.' && !raw.mcp) return raw.rel;
    if (['ask_user', 'propose_plan', 'set_todos'].includes(key)) return '';
    return source || (raw.rel === '.' ? '.' : '');
  }

  function toolOutput(activity) {
    const raw = activity.raw || {};
    let out = String(activity.output || '');
    if (!out) {
      const detail = String(activity.detail || '');
      const summary = String(raw.summary || '');
      if (detail && detail !== activity.path && detail !== activity.command && detail !== summary
        && detail !== String(raw.path || '') && !parseJsonObject(detail)) out = detail;
    }
    return out.replace(/\r\n/g, '\n').replace(/\s+$/, '');
  }

  function lineCount(text) {
    return text ? text.split('\n').length : 0;
  }

  function plural(n, word) {
    return `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;
  }

  // Turns raw tool output into what the row shows: an optional one-line
  // summary (Claude Code's "Read 120 lines") and the body text.
  function describeOutput(activity, out) {
    const key = toolKey(activity);
    const label = toolLabel(activity);
    if (!out) return { summary: '', body: '' };
    // Arena Agent's sandbox tools answer with JSON ({stdout, stderr, exitCode}, image records ...).
    const obj = parseJsonObject(out);
    if (obj) {
      const pickText = (value) => (typeof value === 'string' ? value : '');
      if (!obj.error && obj.file && typeof obj.file.content === 'string') {
        out = obj.file.content;   // Read: show the file, not the JSON wrapper
        return { summary: `Read ${plural(lineCount(out), 'line')}`, body: out, folded: true };
      }
      if (!obj.error && Array.isArray(obj.files)) {
        const names = obj.files.map((f) => (typeof f === 'string' ? f : (f && (f.path || f.name)) || '')).filter(Boolean);
        return { summary: `Listed ${plural(names.length, 'file')}`, body: names.join('\n'), folded: true };
      }
      const stdout = pickText(obj.stdout ?? obj.output ?? obj.result ?? obj.text ?? obj.content);
      const stderr = pickText(obj.stderr);
      const code = obj.exitCode ?? obj.exit_code ?? obj.returncode ?? obj.code;
      if (stdout || stderr || typeof obj.stdout === 'string') {
        out = [stdout, stderr].filter((part) => part.trim()).join('\n');
        if (label === 'Bash' && Number.isInteger(code)) out = `exit code ${code}\n${out}`;
      } else if (/^(Generate|Edit) (image|video)$/.test(label)) {
        const what = label.toLowerCase().includes('video') ? 'video' : 'image';
        return { summary: obj.error ? String(obj.error) : (typeof obj.message === 'string' && obj.message ? obj.message : `Generated ${what}`), body: '' };
      } else if (!obj.error && (obj.status === 'success' || obj.success === true || obj.ok === true)
        && Object.keys(obj).every((k) => ['status', 'success', 'ok', 'hash', 'path', 'bytes', 'size', 'message'].includes(k))) {
        // Arena Agent's file tools answer {"status":"success","hash":...}: say it plainly.
        const what = label === 'Write' ? 'Written' : label === 'Update' ? 'Updated' : label === 'Delete' ? 'Deleted' : 'Done';
        return { summary: obj.message ? String(obj.message) : what, body: '' };
      } else {
        out = JSON.stringify(obj, null, 2);
      }
    }
    if (label === 'Bash') {
      let body = out;
      let code = null;
      const head = body.match(/^exit code (-?\d+)\n?/);
      if (head) {
        code = Number(head[1]);
        body = body.slice(head[0].length);
      }
      body = body.replace(/\n?\[Process exited with code -?\d+\]\s*$/, '')
        .replace(/^\(command finished with no output\)$/, '');
      let summary = !body.trim() ? (code === null || code === 0 ? '(No output)' : `Exit code ${code}`) : '';
      let folded = false;
      if (body.trim() && (code === null || code === 0)) {
        // One line for the result people look for: "built in 1.4s", "added 4 packages ... in 3s".
        const hit = body.split('\n').map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').trim())
          .reverse().find((l) => /\bbuilt in [\d.]+m?s\b|^added \d+ packages|\bDone in [\d.]+m?s\b|^\d+ passed|\btests? passed\b/i.test(l));
        if (hit) { summary = hit.replace(/^[✓✔]\s*/, ''); folded = true; }
      }
      return { summary, body, code, folded };
    }
    if (label === 'Read' && !/^(Error|FileNotFoundError|ValueError)/.test(out)) {
      const ranged = out.match(/^\[lines (\d+)-(\d+) of (\d+)\]\n?/);
      const body = ranged ? out.slice(ranged[0].length) : out;
      const n = ranged ? Number(ranged[2]) - Number(ranged[1]) + 1 : lineCount(body);
      return { summary: `Read ${plural(n, 'line')}`, body, folded: true };
    }
    if (label === 'List' && key === 'ls') {
      const n = out === '(empty folder)' ? 0 : lineCount(out);
      return { summary: `Listed ${plural(n, 'entry').replace('entrys', 'entries')}`, body: n ? out : '', folded: true };
    }
    if (label === 'Search' && key === 'search') {
      const n = out === 'no matches' ? 0 : out.split('\n').filter((l) => /:\d+:/.test(l)).length;
      return { summary: n ? `Found ${plural(n, 'match').replace('matchs', 'matches')}` : 'No matches', body: n ? out : '', folded: true };
    }
    return { summary: '', body: out };
  }

  function renderDiffLines(diffText, maxLines) {
    const lines = String(diffText || '').split('\n')
      .filter((line) => line && !line.startsWith('+++') && !line.startsWith('---') && !line.startsWith('@@'));
    if (!lines.length) return null;
    const shown = lines.slice(0, maxLines);
    const box = el('div', { class: 'tool-diff' });
    shown.forEach((line) => {
      const type = line.startsWith('+') ? ' is-add' : line.startsWith('-') ? ' is-del' : '';
      box.appendChild(el('div', { class: `tool-diff-line${type}`, text: line }));
    });
    if (lines.length > shown.length) box.appendChild(el('div', { class: 'tool-more', text: `… +${plural(lines.length - shown.length, 'line')}` }));
    return box;
  }

  function renderToolRow(activity, laneStreaming, awaitingApproval) {
    const raw = activity.raw || {};
    const status = activityStatus(activity.status);
    const label = toolLabel(activity);
    const arg = toolArg(activity);
    const out = toolOutput(activity);
    const running = !status.cls && Boolean(laneStreaming);
    const stateCls = status.cls === 'is-ok' ? 'is-ok' : status.cls === 'is-err' ? 'is-err'
      : (status.cls === 'is-wait' || (running && awaitingApproval)) ? 'is-wait' : (running ? 'is-run' : 'is-idle');
    const row = el('div', { class: `tool-row ${stateCls}`, 'data-activity-id': activity.id });

    const argText = arg.length > 400 ? arg.slice(0, 400) + '…' : arg;
    const head = el('div', { class: 'tool-head', title: arg || label },
      el('span', { class: 'tool-dot', 'aria-hidden': 'true' }),
      el('span', { class: 'tool-name', text: label }),
      argText ? el('span', { class: 'tool-arg' }, el('span', { class: 'tool-paren', text: '(' }),
        el('span', { class: 'tool-arg-text', text: argText.replace(/\s*\n\s*/g, ' ↵ ') }),
        el('span', { class: 'tool-paren', text: ')' })) : null,
      raw.background ? el('span', { class: 'tool-tag', text: 'background' }) : null
    );
    row.appendChild(head);

    const body = el('div', { class: 'tool-body' }, el('span', { class: 'tool-elbow', 'aria-hidden': 'true', text: '⎿' }));
    const content = el('div', { class: 'tool-content' });
    body.appendChild(content);

    const described = describeOutput(activity, out);
    const expanded = expandedActivities.has(activity.id);
    const diff = raw.diff && ['Write', 'Update'].includes(label) ? raw.diff : '';

    if (stateCls === 'is-wait') {
      content.appendChild(el('div', { class: 'tool-summary is-wait', text: 'Waiting for your approval…' }));
    } else if (!out && !diff) {
      if (running) content.appendChild(el('div', { class: 'tool-summary is-muted' }, el('span', { class: 'tool-spinner', 'aria-hidden': 'true' }), el('span', { text: label === 'Bash' ? 'Running…' : 'Working…' })));
      else if (stateCls === 'is-err') content.appendChild(el('div', { class: 'tool-summary is-err', text: String(raw.status && raw.status !== 'error' ? raw.status : activity.status || 'Failed') }));
      else return finishRow(row, activity);
    }

    if (described.summary) {
      content.appendChild(el('div', { class: `tool-summary${stateCls === 'is-err' ? ' is-err' : ''}`, text: described.summary }));
    }
    const text = described.body || '';
    if (text && (!described.folded || expanded)) {
      const lines = text.split('\n');
      const limit = expanded ? 400 : COLLAPSED_LINES;
      // While a command runs, follow the newest output (tail); afterwards show the head.
      const tailMode = running && label === 'Bash';
      const shown = lines.length > limit ? (tailMode ? lines.slice(-limit) : lines.slice(0, limit)) : lines;
      const exitedNormally = label === 'Bash' && described.code !== null && described.code !== undefined;
      const pre = el('pre', { class: `tool-output${stateCls === 'is-err' && !exitedNormally ? ' is-err' : ''}${expanded ? ' is-expanded' : ''}`, text: shown.join('\n') });
      if (tailMode && lines.length > limit) {
        content.appendChild(el('div', { class: 'tool-more', text: `… ${plural(lines.length - limit, 'earlier line')}` }));
      }
      content.appendChild(pre);
      if (!tailMode && lines.length > limit) {
        content.appendChild(el('button', { class: 'tool-more tool-toggle', type: 'button', 'data-tool-toggle': activity.id, text: `… +${plural(lines.length - limit, 'line')} (click to expand)` }));
      } else if (expanded) {
        content.appendChild(el('button', { class: 'tool-more tool-toggle', type: 'button', 'data-tool-toggle': activity.id, text: 'Collapse' }));
      }
    } else if (text && described.folded) {
      content.appendChild(el('button', { class: 'tool-more tool-toggle', type: 'button', 'data-tool-toggle': activity.id, text: 'Show output' }));
    }
    if (diff) {
      const diffBox = renderDiffLines(diff, expanded ? 400 : 12);
      if (diffBox) content.appendChild(diffBox);
    }
    if (label === 'Bash' && described.code && described.code !== 0 && described.body) {
      content.appendChild(el('div', { class: 'tool-summary is-err', text: `Exit code ${described.code}` }));
    }
    row.appendChild(body);
    return finishRow(row, activity);
  }

  function finishRow(row, activity) {
    const raw = activity.raw || {};
    if (activity.url) {
      row.appendChild(el('a', { class: 'tool-link', href: activity.url, target: '_blank', rel: 'noopener noreferrer', title: activity.url },
        iconEl('external'), el('span', { text: activity.url })));
    }
    if (raw.child_id) {
      const openBtn = el('button', { class: 'tool-link subagent-open', type: 'button' },
        iconEl('message'), el('span', { text: 'Open sub-agent chat' }));
      openBtn.addEventListener('click', () => { void openChat(String(raw.child_id)); });
      row.appendChild(openBtn);
    }
    return row;
  }

  function onToolToggle(event) {
    const button = event.target.closest?.('[data-tool-toggle]');
    if (!button) return;
    const id = button.getAttribute('data-tool-toggle');
    if (expandedActivities.has(id)) expandedActivities.delete(id);
    else expandedActivities.add(id);
    scheduleChatRender();
  }
  document.addEventListener('click', onToolToggle);

  function currentToolActivity(lane) {
    const list = Array.isArray(lane.activities) ? lane.activities : [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const status = activityStatus(list[i].status);
      if (!status.cls) return list[i];
      if (status.cls === 'is-wait') return list[i];
      break;
    }
    return null;
  }

  function laneAwaitsApproval(lane) {
    return (lane.permissions || []).some((item) => !item.status || item.status === 'pending');
  }

  function renderActivities(lane, list = lane.activities, tail = null) {
    if (!Array.isArray(list) || !list.length) return null;
    const waitingId = lane.streaming && laneAwaitsApproval(lane) ? currentToolActivity(lane)?.id : null;
    const cards = list.map((activity) => {
      const raw = activity.raw || {};
      if (activity.kind === 'sandbox' && (raw.verb === 'Edited' || raw.verb === 'Created' || raw.verb === 'Deleted') && raw.path) {
        const diffCard = renderDiffCard(activity);
        const ext = (raw.path || '').split('.').pop().toLowerCase();
        if ((raw.verb === 'Created' || raw.verb === 'Edited') && ['html', 'htm'].includes(ext) && !raw.error
            && state.modality !== 'webdev' && state.modality !== 'code') {
          const preview = renderFilePreview(raw.path);
          if (preview) {
            const wrapper = el('div', { class: 'sandbox-file-group' });
            wrapper.appendChild(diffCard);
            wrapper.appendChild(preview);
            return wrapper;
          }
        }
        return diffCard;
      }
      return renderToolRow(activity, lane.streaming, activity.id === waitingId);
    });
    return el('div', { class: 'tool-list' }, cards, tail);
  }

  // Claude Code's status line while a step runs:  ✻ Reading the workspace…
  const RUNNING_VERBS = { Read: 'Reading the workspace', List: 'Reading the workspace', Search: 'Searching the workspace',
    Bash: 'Running a command', Write: 'Writing files', Update: 'Editing files', 'Generate image': 'Generating an image' };
  function renderRunningLine(lane) {
    if (!lane.streaming) return null;
    const list = lane.activities || [];
    const last = list[list.length - 1];
    const running = last && !activityStatus(last.status).cls;
    const verb = running ? (RUNNING_VERBS[toolLabel(last)] || 'Working') : 'Thinking';
    return el('div', { class: 'term-running', role: 'status' },
      el('span', { class: 'term-star', 'aria-hidden': 'true', text: '✻' }), el('span', { text: `${verb}…` }));
  }

  function renderTermHead(turn) {
    const mode = turn.modality === 'webdev' || turn.modality === 'code' || state.modality === 'webdev' ? 'code mode' : 'agent mode';
    const prompt = String(turn.user?.content || turn.user?.text || '').replace(/\s+/g, ' ').trim();
    return el('div', { class: 'term-head' },
      el('div', { class: 'term-title' },
        el('span', { class: 'term-brand', text: 'arena.ai-desktop' }),
        el('span', { class: 'term-meta', text: `${state.appVersion ? ` v${state.appVersion}` : ''} · ${mode}` })),
      prompt ? el('div', { class: 'term-prompt', title: prompt }, el('span', { class: 'term-caret', 'aria-hidden': 'true', text: '>' }), el('span', { text: prompt })) : null);
  }

  function renderSitePreviewCard(artifact) {
    const href = new URL(artifact.url, window.location.origin).href;
    const local = href.startsWith(window.location.origin);
    const host = local ? (artifact.path || artifact.name || 'Local preview') : new URL(href).host;
    const button = (label, icon, run, primary = false) => {
      const b = el('button', { type: 'button', class: `button ${primary ? '' : 'button-quiet '}site-preview-btn` }, iconEl(icon), el('span', { text: label }));
      b.addEventListener('click', run);
      return b;
    };
    return el('div', { class: 'site-preview-card' },
      el('span', { class: 'site-preview-icon' }, iconEl('globe')),
      el('div', { class: 'site-preview-copy' },
        el('span', { class: 'site-preview-title', text: local ? 'Local preview' : 'Live site' }),
        el('span', { class: 'site-preview-url', text: host, title: href })),
      el('div', { class: 'site-preview-actions' },
        button('Preview', 'panel-right', () => openPreview(href, host), true),
        button('Copy link', 'copy', async () => {
          try { await navigator.clipboard.writeText(href); toast('Link copied', 'success'); }
          catch { toast(href, 'info', 'Copy this link'); }
        }),
        local ? null : button('Browser', 'external', () => window.open(href, '_blank', 'noopener'))));
  }

  function renderArtifactsInline(lane) {
    if (!Array.isArray(lane.artifacts) || !lane.artifacts.length) return null;
    const seen = new Set();
    const unique = lane.artifacts.filter((a) => {
      const id = a.url || a.path || a.name;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    const isLocalUrl = (a) => { try { return new URL(a.url, window.location.origin).origin === window.location.origin; } catch { return false; } };
    let previews = unique.filter((a) => a.url && /^(https?:)?\//.test(a.url));
    if (state.modality === 'webdev' || state.modality === 'code' || previews.some((a) => !isLocalUrl(a))) {
      previews = previews.filter((a) => !isLocalUrl(a));
    }
    const files = unique.filter((a) => !previews.includes(a) && !(a.url && isLocalUrl(a) && a.kind === 'preview'));
    const wrap = el('div', { class: 'artifact-stack' });
    previews.slice(0, 3).forEach((a) => wrap.appendChild(renderSitePreviewCard(a)));
    if (files.length) {
      const note = files.find((f) => f.note)?.note || 'Saved to your folder';
      wrap.appendChild(el('div', { class: 'saved-files' },
        el('span', { class: 'saved-files-title' }, iconEl('check'), el('span', { text: `${note} · ${files.length} ${files.length === 1 ? 'file' : 'files'}` })),
        el('span', { class: 'saved-files-list', text: files.slice(0, 12).map((f) => f.path || f.name).join(', ') + (files.length > 12 ? ` +${files.length - 12} more` : '') })));
    }
    return wrap.childNodes.length ? wrap : null;
  }

  function renderPermissionCard(permission) {
    const isDone = permission.status && permission.status !== 'pending';
    const card = el('div', { class: `permission-card${isDone ? ' is-done' : ''}`, 'data-permission-card': permission.id || '' });
    const head = el('div', { class: 'permission-head' },
      el('span', { class: 'permission-icon' }, iconEl('shield-alert')),
      el('div', { class: 'permission-heading' },
        el('p', { class: 'permission-title', text: permission.title }),
        el('p', { class: 'permission-subtitle', text: `${permission.category || "Action"} · request from backend` })
      )
    );
    const body = el('div', { class: 'permission-body' });
    if (permission.description) body.appendChild(el('p', { class: 'permission-note', text: permission.description }));
    if (permission.command) {
      body.appendChild(el('div', { class: 'permission-detail-label', text: "Command" }));
      body.appendChild(el('pre', { class: 'permission-detail', text: permission.command }));
    }
    if (permission.path) {
      body.appendChild(el('div', { class: 'permission-detail-label', text: "Full path" }));
      body.appendChild(el('pre', { class: 'permission-detail', text: permission.path }));
    }
    if (permission.cwd && permission.cwd !== permission.path) {
      body.appendChild(el('div', { class: 'permission-detail-label', text: "Working folder" }));
      body.appendChild(el('pre', { class: 'permission-detail', text: permission.cwd }));
    }
    if (!permission.command && !permission.path && !permission.cwd) {
      body.appendChild(el('div', { class: 'permission-detail-label', text: "Request details" }));
      body.appendChild(el('pre', { class: 'permission-detail', text: permissionDetail(permission) }));
    }
    if (permission.diff) {
      body.appendChild(el('div', { class: 'permission-detail-label', text: 'Diff' }));
      const diff = el('div', { class: 'diff-block' });
      String(permission.diff).split('\n').forEach((line) => {
        const type = line.startsWith('+') && !line.startsWith('+++') ? ' is-add' : line.startsWith('-') && !line.startsWith('---') ? ' is-del' : '';
        diff.appendChild(el('div', { class: `diff-line${type}` },
          el('span', { class: 'diff-marker', text: line[0] || ' ' }),
          el('span', { text: line })
        ));
      });
      body.appendChild(diff);
    }

    if (isDone) {
      const allowed = permission.status === 'allow' || permission.status === 'always' || permission.status === 'allowed';
      const unanswered = { stopped: "Not run: the reply was stopped", expired: "Not run: no answer in time" }[permission.status];
      card.append(head, body, el('div', { class: `permission-result${allowed ? '' : ' is-deny'}` },
        iconEl(allowed ? 'check' : 'x'),
        el('span', { text: allowed ? "Allowed by user" : (unanswered || "Declined by user") })
      ));
      return card;
    }

    const id = permission.id ? String(permission.id) : '';
    const disabled = state.decidingPermissions.has(String(permission.id)) || !id;
    const allow = el('button', {
      class: 'button button-allow permission-decision', type: 'button',
      'data-permission-decision': 'allow', 'data-permission-id': id, disabled
    }, el('span', { text: "Allow once" }));
    const always = el('button', {
      class: 'button button-always permission-decision', type: 'button',
      'data-permission-decision': 'always', 'data-permission-id': id, disabled
    }, el('span', { text: "Allow such actions in this session" }));
    const deny = el('button', {
      class: 'button button-deny permission-decision', type: 'button',
      'data-permission-decision': 'deny', 'data-permission-id': id, disabled
    }, el('span', { text: "Deny" }));
    const actions = el('div', { class: 'permission-actions' }, allow, always, deny,
      el('span', { class: 'permission-scope', text: "\"In this session\" allows the entire category of actions for the current session, not just this file or command. Deny can be selected at any time; there is no automatic choice." })
    );
    if (!id) {
      actions.prepend(el('div', { class: 'note-box is-warning' }, iconEl('alert'), el('span', { text: "The server did not provide a permission ID — actions are unavailable." })));
    }
    if (permission.demo) {
      actions.appendChild(el('span', { class: 'permission-scope', text: "Demo: the decision is processed locally, commands are not executed." }));
    }
    card.append(head, body, actions);
    return card;
  }

  function visibleLaneText(lane) {
    // With folder tools, the model's raw reply contains <tool> call blocks.
    // Those are rendered as tool cards; the answer text must not show the
    // markup itself (nor a half-streamed tag at the end).
    const raw = lane.text || '';
    const hadTools = (lane.activities || []).some((item) => item.kind === 'tool')
      || (lane.permissions || []).length > 0;
    if (!hadTools || !raw.includes('<')) return raw;
    let text = raw
      .replace(/<function_calls>[\s\S]*?<\/function_calls\s*>/gi, '')
      .replace(/<tool\s+name[^>]*>[\s\S]*?<\/tool\s*>/gi, '')
      .replace(/<invoke\s+name[^>]*>[\s\S]*?<\/invoke\s*>/gi, '');
    const partial = text.search(/<(tool\s+name|invoke\s+name|function_calls)[\s\S]*$/i);
    if (partial >= 0) text = text.slice(0, partial);
    return text.replace(/\n{3,}/g, '\n\n');
  }

  function answerFootNote(lane) {
    if (lane.streaming) return null;
    if (!lane.done && !lane.error) return null;
    const bits = [];
    if (lane.stopped) bits.push("Stopped");
    else if (lane.error) bits.push("Completed with errors");
    else bits.push(lane.demo ? "Demo response" : "Response received");
    const visibleLength = visibleLaneText(lane).trim().length;
    if (visibleLength) bits.push(`${visibleLength.toLocaleString('en-US')} chars`);
    return el('div', { class: 'answer-footnote' }, el('span', { class: 'status-dot is-online' }), el('span', { text: bits.join(' · ') }));
  }

  const _laneTypewriters = new WeakMap();
  const _laneStartedAt = new WeakMap();

  function dropLaneTypewriter(lane) {
    const typewriter = _laneTypewriters.get(lane);
    if (!typewriter) return;
    typewriter._destroy?.();
    _laneTypewriters.delete(lane);
    _laneStartedAt.delete(lane);
  }

  // Claude Code style status: "✻ Running Bash… 12s" / "✻ Thinking… 3s".
  function renderGeneratingLabel(lane) {
    if (!_laneStartedAt.has(lane)) _laneStartedAt.set(lane, Date.now());
    const startedAt = _laneStartedAt.get(lane);
    const active = currentToolActivity(lane);
    let text;
    if (laneAwaitsApproval(lane) || (active && activityStatus(active.status).cls === 'is-wait')) text = 'Waiting for your approval';
    else if (active) text = toolLabel(active) === 'Bash' ? 'Running command' : `Running ${toolLabel(active)}`;
    else text = visibleLaneText(lane) ? 'Writing' : 'Thinking';
    const timer = el('span', { class: 'generating-time' });
    let ticks = 0;
    const tick = () => {
      if (ticks++ > 0 && !timer.isConnected) return;
      const secs = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      timer.textContent = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
      setTimeout(tick, 1000);
    };
    tick();
    return el('span', { class: 'generating-label', role: 'status' },
      el('span', { class: 'generating-star', 'aria-hidden': 'true', text: '✻' }),
      el('span', { text: `${text}…` }),
      timer
    );
  }

  function renderAssistantLane(lane, turn, key, totalLanes) {
    const card = el('article', {
      class: `message-assistant assistant-lane${lane.streaming ? ' is-streaming' : ''}`,
      'aria-label': `${lane.modelName || (key === 'b' ? "Model B" : "Model A")}, response`
    });
    const avatarColor = safeColor(lane.modelColor) || '#bdd3c1';
    const laneLogo = modelIconNode({
      name: lane.modelName, org: lane.modelOrg, color: lane.modelColor,
      icon_url: getModel(lane.modelId)?.icon_url || ''
    });
    const avatar = laneLogo
      ? el('span', { class: 'model-avatar has-logo', 'aria-hidden': 'true' }, laneLogo)
      : el('span', {
        class: 'model-avatar',
        style: { background: avatarColor, color: '#1d221e' },
        'aria-hidden': 'true',
        text: initialLetters(lane.modelName || (key === 'b' ? 'Model B' : 'Model A'))
      });
    const label = lane.modelOrg || (lane.modelName ? '' : (key === 'b' ? "Model B" : "Model A"));
    const head = el('div', { class: 'assistant-head' },
      avatar,
      el('div', { class: 'assistant-id' },
        el('span', { class: 'model-name', title: lane.modelName || '', text: lane.modelName || (key === 'b' ? "Model B" : "Model A") }),
        totalLanes > 1 ? el('span', { class: 'lane-badge', text: key.toUpperCase() }) : null,
        turn.vote === (key === 'a' ? 'model_a' : 'model_b')
          ? el('span', { class: 'lane-winner', title: "Your choice in this battle" }, iconEl('trophy'), el('span', { text: "best" }))
          : null,
        label ? el('span', { class: 'option-desc', text: label }) : null
      ),
      lane.streaming ? renderGeneratingLabel(lane) : el('span', { class: 'assistant-spacer' }),
      visibleLaneText(lane) ? el('button', {
        class: 'icon-button answer-copy-button', type: 'button', 'data-copy-answer': key,
        title: "Copy answer", 'aria-label': `Copy model response ${lane.modelName || key.toUpperCase()}`
      }, iconEl('copy')) : null
    );
    card.appendChild(head);

    if (lane.reasoning) {
      const details = el('details', { class: 'reasoning' },
        el('summary', { text: lane.demo ? "Thinking · demo" : "Thinking" }),
        el('div', { class: 'reasoning-content', text: lane.reasoning })
      );
      card.appendChild(details);
    }

    const markdown = el('div', { class: 'markdown' });
    const visibleText = visibleLaneText(lane);
    const inTypewriterWindow = lane.typewriterUntil && Date.now() < lane.typewriterUntil;
    const showTypewriter = lane.streaming && (!visibleText || inTypewriterWindow);
    if (!lane.streaming) dropLaneTypewriter(lane);
    if (showTypewriter) {
      // Reuse one typewriter per lane: every stream event re-renders the
      // card, and a fresh element would restart (and never finish) its phrase.
      let typewriter = _laneTypewriters.get(lane);
      if (!typewriter || typewriter._dead) {
        typewriter = createThinkingTypewriter();
        _laneTypewriters.set(lane, typewriter);
      }
      markdown.appendChild(typewriter);
      if (inTypewriterWindow && visibleText) {
        const remaining = lane.typewriterUntil - Date.now();
        setTimeout(() => { lane.typewriterUntil = 0; scheduleChatRender(); }, remaining);
      }
    } else {
      if (visibleText) markdown.appendChild(renderMarkdown(visibleText));
    }
    if (lane.streaming && visibleText && !showTypewriter) markdown.appendChild(el('span', { class: 'stream-cursor', 'aria-hidden': 'true' }));
    // Claude order: thinking, then the work (tool rows, approvals), then the
    // answer itself at the bottom, then what it produced (media, sources, files).
    const acts = Array.isArray(lane.activities) ? lane.activities : [];
    const termMode = acts.length > 0;
    if (termMode) card.appendChild(renderTermHead(turn));
    // Arena's own order: narration sits between the tool rows it was written between.
    const rawText = lane.text || '';
    const interleave = termMode && rawText && visibleText === rawText
      && acts.some((a) => a.kind === 'sandbox' && Number.isFinite(a.raw?.at));
    let tailNode = null;
    if (interleave) {
      let cursor = 0;
      let group = [];
      const flush = () => { if (group.length) { card.appendChild(renderActivities(lane, group)); group = []; } };
      acts.forEach((a) => {
        const at = Number.isFinite(a.raw?.at) ? Math.min(Math.max(a.raw.at, cursor), rawText.length) : cursor;
        if (at > cursor) {
          flush();
          const piece = rawText.slice(cursor, at);
          if (piece.trim()) card.appendChild(el('div', { class: 'term-say' }, el('span', { class: 'term-say-dot', 'aria-hidden': 'true', text: '●' }), el('div', { class: 'markdown' }, renderMarkdown(piece.trim()))));
          cursor = at;
        }
        group.push(a);
      });
      flush();
      const rest = rawText.slice(cursor);
      markdown.textContent = '';
      if (showTypewriter) markdown.appendChild(_laneTypewriters.get(lane));
      else if (rest.trim()) markdown.appendChild(renderMarkdown(rest.trim()));
      if (lane.streaming && rest.trim() && !showTypewriter) markdown.appendChild(el('span', { class: 'stream-cursor', 'aria-hidden': 'true' }));
      const running = renderRunningLine(lane);
      if (running) card.appendChild(running);
    } else {
      const activities = renderActivities(lane, acts, renderRunningLine(lane));
      if (activities) card.appendChild(activities);
    }
    if (Array.isArray(lane.permissions)) {
      lane.permissions.forEach((permission) => card.appendChild(renderPermissionCard(permission)));
    }
    if (termMode && markdown.childNodes.length) {
      card.appendChild(el('div', { class: 'term-say is-answer' }, el('span', { class: 'term-say-dot', 'aria-hidden': 'true', text: '●' }), markdown));
    } else {
      card.appendChild(markdown);
    }
    const media = renderMedia(lane);
    if (media) card.appendChild(media);
    const mediaChoices = renderMediaChoices(lane);
    if (mediaChoices) card.appendChild(mediaChoices);
    const sources = renderSources(lane);
    if (sources) card.appendChild(sources);
    const artifacts = renderArtifactsInline(lane);
    if (artifacts) card.appendChild(artifacts);

    if (Array.isArray(lane.notices)) {
      lane.notices.forEach((notice) => card.appendChild(el('div', { class: 'message-notice' }, iconEl('info'), el('span', { text: notice }))));
    }
    if (Array.isArray(lane.errors)) {
      lane.errors.forEach((error) => card.appendChild(el('div', { class: 'message-error', role: 'alert' }, iconEl('alert'), el('span', { text: error }))));
    }
    const note = answerFootNote(lane);
    if (note) card.appendChild(note);
    return card;
  }

  const VOTE_OPTIONS = [
    { id: 'model_a', label: "A is better", icon: 'thumbs-up' },
    { id: 'tie', label: "Both are good", icon: 'scale' },
    { id: 'both_bad', label: "Both are bad", icon: 'thumbs-down' },
    { id: 'model_b', label: "B is better", icon: 'thumbs-up' }
  ];

  function renderVoteBar(turn, pairIndex) {
    if (state.mode !== 'battle') return null;
    const laneA = turn.lanes?.a;
    const laneB = turn.lanes?.b;
    if (!laneA || !laneB || laneA.streaming || laneB.streaming || state.generating) return null;
    const hasAnswer = (lane) => Boolean(lane.text || (Array.isArray(lane.media) && lane.media.length));
    if (!hasAnswer(laneA) || !hasAnswer(laneB)) return null;
    if (turn.vote) {
      const chosen = VOTE_OPTIONS.find((option) => option.id === turn.vote);
      return el('div', { class: 'vote-bar is-done' }, iconEl('check'),
        el('span', { text: `Your vote: ${chosen?.label || turn.vote}` }),
        turn.revealed ? el('span', { class: 'vote-revealed-note', text: "· models are revealed in the headings" }) : null);
    }
    if (turn.revealed) return null;
    const bar = el('div', { class: 'vote-bar', role: 'group', 'aria-label': "Voting for the best answer" },
      el('span', { class: 'vote-title', text: "Which answer is better?" }));
    VOTE_OPTIONS.forEach((option) => {
      bar.appendChild(el('button', {
        class: `vote-btn vote-${option.id}`, type: 'button',
        disabled: Boolean(turn.voteBusy),
        title: option.id === 'model_a' ? "The answer on the left (A) is better"
          : option.id === 'model_b' ? "The answer on the right (B) is better" : option.label,
        onclick: () => { void submitVote(turn, pairIndex, option.id); }
      }, iconEl(option.icon), el('span', { text: option.label })));
    });
    bar.appendChild(el('span', { class: 'vote-hint', text: "After voting, the models will be revealed" }));
    return bar;
  }

  async function submitVote(turn, pairIndex, value) {
    if (!state.activeChatId || !turn || turn.vote || turn.voteBusy) return;
    turn.voteBusy = true;
    renderMessages();
    try {
      const result = await API.vote(state.activeChatId, {
        value,
        pair_index: pairIndex >= 0 ? pairIndex : null,
        message_a_id: turn.arenaIds?.a || null,
        message_b_id: turn.arenaIds?.b || null
      });
      turn.vote = result?.vote || value;
      const names = result?.names || {};
      if (names.a || names.b) {
        state.messages.forEach((item) => {
          if (!item || typeof item !== 'object') return;
          if (item.lanes?.a && names.a) item.lanes.a.modelName = names.a;
          if (item.lanes?.b && names.b) item.lanes.b.modelName = names.b;
          if (item.lanes?.a || item.lanes?.b) item.revealed = true;
        });
        turn.revealed = true;
      }
      toast("Vote counted on arena.ai. Models are revealed.", 'success', 'Battle');
      void loadChats({ silent: true });
    } catch (error) {
      toast(errorMessage(error), 'error', "Vote not sent");
    } finally {
      turn.voteBusy = false;
      renderMessages();
    }
  }

  function promptSummary(text) {
    if (!text || text.length < 80) return null;
    const lower = text.toLowerCase().trim();
    const verbs = ['fix', 'add', 'create', 'build', 'write', 'implement', 'make', 'update', 'change', 'remove', 'delete', 'refactor', 'test', 'debug', 'explain', 'help', 'show', 'find', 'search', 'check', 'review', 'set up', 'configure', 'deploy', 'design', 'analyze', 'compare', 'convert', 'generate', 'optimize', 'install', 'run', 'edit', 'modify', 'improve'];
    let summary = '';
    const first = text.split(/[.!?\n]/)[0].trim();
    if (first.length <= 80 && first.length >= 10) {
      summary = first;
    } else {
      for (const verb of verbs) {
        const idx = lower.indexOf(verb);
        if (idx !== -1 && idx < 100) {
          const chunk = text.slice(idx, idx + 70).split(/[.!?\n]/)[0].trim();
          if (chunk.length >= 8) { summary = chunk; break; }
        }
      }
    }
    if (!summary) summary = text.slice(0, 65).trim();
    if (summary.length > 65) summary = summary.slice(0, 62) + '...';
    return summary.charAt(0).toUpperCase() + summary.slice(1);
  }

  function renderTurn(turn, pairIndex = -1) {
    const wrapper = el('section', { class: 'message-turn', 'aria-label': "Dialogue turn" });
    if (turn.msgEnd != null) wrapper.setAttribute('data-msg-end', String(turn.msgEnd));
    if (turn.user) wrapper.appendChild(userMessageNode(turn.user));
    const userText = turn.user?.content || turn.user?.text || '';
    const summary = promptSummary(userText);
    if (summary) {
      const modLabel = turn.modality === 'webdev' ? 'Code' : turn.modality === 'search' ? 'Search' : turn.mode === 'agent' ? 'Agent' : 'Chat';
      wrapper.appendChild(el('div', { class: 'task-summary' },
        el('span', { class: 'task-summary-icon' }, iconEl('spark')),
        el('span', { class: 'task-summary-mode', text: modLabel }),
        el('span', { class: 'task-summary-text', text: summary })
      ));
    }
    const lanes = turn.lanes || {};
    const order = Object.keys(lanes).filter((key) => lanes[key]);
    if (order.length) {
      const grid = el('div', { class: `lane-grid ${order.length > 1 ? 'lanes-2' : 'lanes-1'}` });
      order.forEach((key) => grid.appendChild(renderAssistantLane(lanes[key], turn, key, order.length)));
      wrapper.appendChild(grid);
      const voteBar = renderVoteBar(turn, pairIndex);
      if (voteBar) wrapper.appendChild(voteBar);
    }
    if (Array.isArray(turn.notices)) {
      turn.notices.forEach((notice) => wrapper.appendChild(el('div', { class: 'message-notice' }, iconEl('info'), el('span', { text: notice }))));
    }
    const laneHasError = order.some((key) => lanes[key]?.errors?.length);
    if (turn.error && !laneHasError) {
      wrapper.appendChild(el('div', { class: 'message-error', role: 'alert' }, iconEl('alert'), el('span', { text: turn.error })));
    }
    const turnActions = renderTurnActions(turn);
    if (turnActions) wrapper.appendChild(turnActions);
    return wrapper;
  }

  async function loadQuestions() {
    try {
      const items = await API.getQuestions();
      state.pendingQuestions = (Array.isArray(items) ? items : []).map((q) => ({
        id: String(q.id), chatId: q.chat_id || q.chatId || null, lane: q.lane === 'b' ? 'b' : 'a',
        question: textValue(q.question),
        options: Array.isArray(q.options) ? q.options.map(textValue).filter(Boolean) : [],
        custom: q.custom !== false, subagent: q.subagent || null,
        kind: q.kind === 'plan' ? 'plan' : 'question', plan: textValue(q.plan)
      })).filter((q) => q.id && q.id !== 'undefined');
      updatePendingPermissionsBadge();
      if (state.view === 'chat') renderMessages();
    } catch { /* offline: live questions still arrive over the stream */ }