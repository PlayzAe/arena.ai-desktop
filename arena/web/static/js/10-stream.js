  /* Stream generation                                                      */
  /* ---------------------------------------------------------------------- */
  function turnLane(turn, key, event = {}) {
    if (!turn.lanes[key]) {
      const rawModel = event.model && typeof event.model === 'object' ? event.model : null;
      turn.lanes[key] = emptyLane(key, rawModel ? normalizeModel(rawModel) : null);
    }
    return turn.lanes[key];
  }

  function eventLaneKey(event) {
    return event?.model === 'b' || event?.lane === 'b' ? 'b' : 'a';
  }

  function addArtifactRecord(artifact, laneKey) {
    if (!artifact) return;
    const key = `${artifact.kind}:${artifact.path || artifact.url || artifact.name}`;
    if (state.artifacts.some((item) => `${item.kind}:${item.path || item.url || item.name}` === key)) return;
    state.artifacts.push({ ...artifact, chatId: state.activeChatId, lane: laneKey });
    updateArtifactCount();
  }

  function addActivity(turn, lane, event, kind) {
    const activity = normalizeActivity(event, kind);
    if (!activity) return null;
    const id = activity.id;
    const existing = lane.activities.find((item) => String(item.id) === String(id));
    if (existing) {
      Object.assign(existing, { status: activity.status, detail: activity.detail || existing.detail, command: activity.command || existing.command, path: activity.path || existing.path, url: activity.url || existing.url, output: activity.output || existing.output });
      // The complete call replaces the empty first one; the row keeps its place in the text.
      const at = existing.raw && Number.isFinite(existing.raw.at) ? existing.raw.at : activity.raw.at;
      existing.raw = { ...(existing.raw || {}), ...activity.raw, at };
      return existing;
    }
    lane.activities.push(activity);
    return activity;
  }

  function handleStreamEvent(event, generation) {
    if (!event || typeof event !== 'object') return;
    const type = String(event.type || '').toLowerCase();
    const turn = generation.turn;
    if (type === 'ping') return;
    if (type === 'meta') {
      const rawModels = event.models ?? event.data?.models;
      const normalizeMetaModel = (value) => {
        if (!value) return null;
        if (typeof value === 'string') {
          const known = getModel(value);
          return known || { id: value, name: value, org: '', color: '', capabilities: [] };
        }
        return normalizeModel(value);
      };
      let metaModels = {};
      if (Array.isArray(rawModels)) {
        metaModels.a = normalizeMetaModel(rawModels[0]);
        metaModels.b = normalizeMetaModel(rawModels[1]);
      } else if (rawModels && typeof rawModels === 'object') {
        metaModels.a = normalizeMetaModel(rawModels.a);
        metaModels.b = normalizeMetaModel(rawModels.b);
      } else {
        metaModels.a = normalizeMetaModel(event.model_a);
        metaModels.b = normalizeMetaModel(event.model_b);
      }
      if (event.name && metaModels.a && !metaModels.a.name) metaModels.a.name = String(event.name);
      if (event.model_name_a || event.model_name_b) {
        if (!metaModels.a) metaModels.a = { id: 'a', name: String(event.model_name_a || "Model A"), org: '', color: '', capabilities: [] };
        else if (event.model_name_a) metaModels.a.name = String(event.model_name_a);
        if (event.model_name_b) {
          if (!metaModels.b) metaModels.b = { id: 'b', name: String(event.model_name_b), org: '', color: '', capabilities: [] };
          else metaModels.b.name = String(event.model_name_b);
        }
      }
      // The existing backend emits names as {a, b}, not a models array.
      if (event.names?.a && !metaModels.a) metaModels.a = { id: 'a', name: String(event.names.a), org: '', color: '', capabilities: [] };
      if (event.names?.b && !metaModels.b) metaModels.b = { id: 'b', name: String(event.names.b), org: '', color: '', capabilities: [] };
      const activeModel = event.model_id ? normalizeModel(event.model_id) : null;
      const modelA = metaModels.a || activeModel;
      if (modelA) {
        const lane = turnLane(turn, 'a');
        lane.modelId = modelA.id;
        lane.modelName = modelA.name;
        lane.modelOrg = modelA.org;
        lane.modelColor = modelA.color;
      }
      if (metaModels.b) {
        const lane = turnLane(turn, 'b');
        lane.modelId = metaModels.b.id;
        lane.modelName = metaModels.b.name;
        lane.modelOrg = metaModels.b.org;
        lane.modelColor = metaModels.b.color;
        lane.streaming = true;
      }
      if (event.mode) turn.mode = event.mode;
      if (event.modality) turn.modality = event.modality;
      if (event.chat_id && !state.activeChatId) state.activeChatId = String(event.chat_id);
      void setupChatProject(String(event.chat_id || generation.chatId || ''), String(event.modality || turn.modality || ''));
      if (!generation._chatsReloaded) {
        // The backend has saved this chat by now (it does so before the
        // stream starts), so refresh the sidebar with the real entry.
        generation._chatsReloaded = true;
        void loadChats({ silent: true });
      }
      scheduleChatRender();
      return;
    }

    const key = eventLaneKey(event);
    const lane = turnLane(turn, key, event);

    if (type === 'text_replace') {
      // The stream broke and the server read the finished reply from
      // arena.ai's copy of the chat: it replaces what had streamed so far.
      lane.text = textValue(event.text ?? '');
      clearRetryNote(lane);
      scheduleChatRender();
      return;
    }
    if (type === 'text' || type === 'message') {
      const delta = textValue(event.text ?? event.delta ?? event.content ?? '');
      if (delta) {
        lane.text += delta;
        clearRetryNote(lane);
      }
      if (event.model_id && !lane.modelId) {
        const model = normalizeModel(event.model_id);
        if (model) {
          lane.modelId = model.id;
          lane.modelName = model.name;
          lane.modelOrg = model.org;
          lane.modelColor = model.color;
        }
      }
      scheduleChatRender();
      return;
    }
    if (type === 'reasoning') {
      const delta = textValue(event.text ?? event.delta ?? event.reasoning ?? '');
      if (delta) lane.reasoning += delta;
      scheduleChatRender();
      return;
    }
    if (type === 'source') {
      const payload = Array.isArray(event.sources) ? event.sources : [event.source ?? event.data ?? event];
      payload.forEach((item) => {
        const source = normalizeSource(item);
        if (source) lane.sources.push(source);
      });
      scheduleChatRender();
      return;
    }
    if (type === 'media') {
      const payload = Array.isArray(event.media) ? event.media : [event.media ?? event.data ?? event];
      payload.forEach((item) => {
        const media = normalizeMedia(item);
        if (media) lane.media.push(media);
      });
      scheduleChatRender();
      return;
    }
    if (type === 'media_choice') {
      const rawChoice = event.media_choice && typeof event.media_choice === 'object' ? event.media_choice : event;
      const choice = upsertLaneMediaChoice(lane, {
        ...rawChoice,
        id: event.id || rawChoice.id,
        tool_call_id: event.tool_call_id || rawChoice.tool_call_id || rawChoice.toolCallId,
        chat_id: event.chat_id || generation.chatId || rawChoice.chat_id || rawChoice.chatId
      });
      if (choice && mediaChoiceIsPending(choice)) {
        const pendingIndex = state.pendingMediaChoices.findIndex((item) => sameMediaChoice(item, choice));
        if (pendingIndex >= 0) state.pendingMediaChoices[pendingIndex] = choice;
        else state.pendingMediaChoices.push(choice);
        if (String(choice.chatId || generation.chatId) !== String(state.activeChatId)) {
          toast('Arena Agent is waiting for an image choice in another chat.', 'warning', 'Image choice');
        } else {
          announce('Arena Agent generated image options. Choose one to continue.');
        }
      }
      updatePendingPermissionsBadge();
      scheduleChatRender();
      return;
    }
    if (type === 'media_choice_done') {
      const rawChoice = event.media_choice && typeof event.media_choice === 'object' ? event.media_choice : event;
      const choice = upsertLaneMediaChoice(lane, {
        ...rawChoice,
        id: rawChoice.id || event.id,
        tool_call_id: event.tool_call_id || rawChoice.tool_call_id || rawChoice.toolCallId,
        chat_id: event.chat_id || generation.chatId || rawChoice.chat_id || rawChoice.chatId
      });
      state.pendingMediaChoices = state.pendingMediaChoices.filter((item) => !sameMediaChoice(item, choice || {
        id: event.id, toolCallId: event.tool_call_id || ''
      }));
      updatePendingPermissionsBadge();
      scheduleChatRender();
      return;
    }
    if (type === 'media_reveal') {
      applyMediaReveal(lane, event);
      scheduleChatRender();
      return;
    }
    if (type === 'tool_call') {
      addActivity(turn, lane, event, 'tool');
      scheduleChatRender();
      return;
    }
    if (type === 'tool_result') {
      if (/write|edit|patch|create|delete|remove|move|rename|mkdir|bash|shell|command|run/i.test(String(event.tool || event.name || ''))) {
        scheduleWorkspaceTreeRefresh();
      }
      const id = event.id ?? event.tool_call_id ?? event.call_id;
      // Backend tool_result has no call id: match the most recent pending call by tool.
      const existing = id ? lane.activities.find((item) => String(item.id) === String(id)) :
        [...lane.activities].reverse().find((item) => item.kind === 'tool'
          && (item.tool === event.tool || item.name === event.tool)
          && (!item.status || item.status === 'running' || item.status === 'pending'));
      const output = textValue(event.output ?? event.result ?? event.text ?? event.message ?? '');
      if (existing) {
        existing.status = event.status || 'ok';
        // Keep the call's input (command, path) and its result apart: the
        // row shows the input in its title and the result underneath.
        if (output) existing.output = output;
      } else {
        addActivity(turn, lane, { ...event, name: event.name || "Tool result", output, status: event.status || 'ok' }, 'tool');
      }
      scheduleChatRender();
      return;
    }
    if (type === 'component_missing') {
      promptComponentInstall(event);
      return;
    }
    if (type === 'tool_progress') {
      const id = event.id ?? event.tool_call_id;
      const existing = id ? lane.activities.find((item) => String(item.id) === String(id))
        : [...lane.activities].reverse().find((item) => item.kind === 'tool' && item.status === 'running');
      if (existing) {
        existing.output = textValue(event.output ?? '');
        scheduleChatRender();
      }
      return;
    }
    if (type === 'subagent') {
      const act = [...lane.activities].reverse().find((item) => item.raw?.child_id && String(item.raw.child_id) === String(event.child_id));
      if (act) {
        act.raw = { ...act.raw, model_name: event.model_name || act.raw.model_name, mode: event.mode || act.raw.mode };
        if (event.status === 'started' && event.task) act.detail = event.task;
        if (event.status === 'tool' && event.summary) {
          act.detail = `${act.detail ? act.detail + '\n' : ''}\u2022 ${event.summary}`.slice(-2400);
        }
      }
      scheduleChatRender();
      return;
    }
    if (type === 'question') {
      const q = {
        id: String(event.id), chatId: event.chat_id || generation.chatId, lane: key,
        question: textValue(event.question),
        options: Array.isArray(event.options) ? event.options.map(textValue).filter(Boolean) : [],
        custom: event.custom !== false, subagent: event.subagent || null,
        kind: event.kind === 'plan' ? 'plan' : 'question', plan: textValue(event.plan)
      };
      if (!state.pendingQuestions.some((x) => x.id === q.id)) state.pendingQuestions.push(q);
      updatePendingPermissionsBadge();
      if (String(q.chatId) !== String(state.activeChatId)) {
        toast(q.kind === 'plan' ? 'The model proposed a plan in another chat.' : 'The model is asking a question in another chat.', 'warning', q.kind === 'plan' ? 'Plan' : 'Question');
      } else {
        announce(q.kind === 'plan' ? 'The model proposed a plan. Review it to continue.' : 'The model asks a question. Your answer is needed.');
      }
      scheduleChatRender();
      return;
    }
    if (type === 'todos') {
      const tchat = String(event.chat_id || generation.chatId || '');
      if (tchat && Array.isArray(event.items)) {
        state.chatTodos[tchat] = event.items.map((it) => ({
          text: textValue(it?.text),
          status: it?.status === 'done' ? 'done' : (it?.status === 'doing' ? 'doing' : 'pending')
        })).filter((it) => it.text);
      }
      scheduleChatRender();
      return;
    }
    if (type === 'question_done') {
      state.pendingQuestions = state.pendingQuestions.filter((x) => x.id !== String(event.id));
      updatePendingPermissionsBadge();
      scheduleChatRender();
      return;
    }
    if (type === 'permission') {
      const permissionPayload = event.permission ?? event.data ?? event;
      const permission = normalizePermission(event.permission || event.data ? { ...event, ...permissionPayload } : event);
      if (!permission) return;
      permission.lane = key;
      if (!permission.chatId && generation.chatId) permission.chatId = generation.chatId;
      if (permission.id) {
        const existingGlobal = state.pendingPermissions.find((item) => String(item.id) === String(permission.id));
        if (existingGlobal) Object.assign(existingGlobal, permission);
        else state.pendingPermissions.push(permission);
        state.permissionCount = Math.max(state.permissionCount, state.pendingPermissions.length);
      }
      if (!lane.permissions.some((item) => permission.id && String(item.id) === String(permission.id))) lane.permissions.push(permission);
      updatePendingPermissionsBadge();
      announce("New permission request. Your decision is needed.");
      toast(permission.title || "Permission request", 'warning', "Decision required");
      scheduleChatRender();
      return;
    }
    if (type === 'permission_done') {
      const id = event.id ?? event.permission_id;
      const decision = String(event.decision ?? event.status ?? 'done');
      state.pendingPermissions = state.pendingPermissions.filter((item) => String(item.id) !== String(id));
      state.permissionCount = state.pendingPermissions.length;
      // The reply's own turn too: it is not in state.messages while another
      // chat is open.
      [...state.messages, turn].forEach((messageTurn) => {
        Object.values(messageTurn?.lanes || {}).forEach((messageLane) => {
          (messageLane.permissions || []).forEach((permission) => {
            if (id && String(permission.id) === String(id)) permission.status = decision;
          });
        });
      });
      updatePendingPermissionsBadge();
      scheduleChatRender();
      state.settingsRerender?.();
      return;
    }
    if (type === 'file_preview') {
      if (event.html && event.path) {
        const artifact = normalizeArtifact({
          path: event.path,
          name: event.path.split('/').pop(),
          title: event.path.split('/').pop(),
          url: previewLink(event.path),
          note: 'Live HTML preview'
        }, 'preview');
        if (artifact) {
          lane.artifacts.push(artifact);
          addArtifactRecord(artifact, key);
        }
      }
      scheduleChatRender();
      return;
    }
    if (type === 'sandbox' || type === 'sandbox_done') {
      scheduleChatProjectRefresh();
      addActivity(turn, lane, {
        ...event,
        name: event.title ?? event.name ?? (event.status === 'done' ? "Sandbox completed" : "Sandbox"),
        status: type === 'sandbox_done' ? (event.ok === false ? 'error' : 'done') : (event.status || 'running'),
        detail: event.note ?? event.message ?? event.detail ?? ''
      }, 'sandbox');
      if (type === 'sandbox' && event.path && (event.verb === 'Edited' || event.verb === 'Created')) {
        const ext = (event.path || '').split('.').pop().toLowerCase();
        if (['html', 'htm', 'css', 'js'].includes(ext)) {
          setTimeout(refreshAllHtmlPreviews, 300);
        }
      }
      scheduleChatRender();
      return;
    }
    if (type === 'webdev') {
      addActivity(turn, lane, {
        ...event,
        name: event.title ?? "Web development",
        status: event.status || 'running',
        detail: event.message ?? event.description ?? event.output ?? event.url ?? ''
      }, 'webdev');
      if (event.url) {
        const artifact = normalizeArtifact({ ...event, title: event.title ?? "Preview" }, 'preview');
        if (artifact) {
          lane.artifacts.push(artifact);
          addArtifactRecord(artifact, key);
        }
      }
      scheduleChatRender();
      return;
    }
    if (type === 'files_written' || type === 'files') {
      scheduleChatProjectRefresh();
      const list = Array.isArray(event.files) ? event.files : Array.isArray(event.data) ? event.data : Array.isArray(event.paths) ? event.paths : [];
      list.forEach((file) => {
        const artifact = normalizeArtifact(file, 'file');
        if (!artifact) return;
        lane.artifacts.push(artifact);
        addArtifactRecord(artifact, key);
      });
      if (list.length) scheduleWorkspaceTreeRefresh();
      scheduleChatRender();
      return;
    }
    if (type === 'preview') {
      const previewData = event.preview && typeof event.preview === 'object' ? event.preview : event;
      const artifact = normalizeArtifact({
        path: previewData.path ?? previewData.title ?? '',
        name: previewData.title ?? "Preview",
        title: previewData.title ?? "Preview",
        url: previewData.url ?? previewData.preview_url ?? event.url ?? '',
        note: "Link from preview event"
      }, 'preview');
      if (artifact) {
        lane.artifacts.push(artifact);
        addArtifactRecord(artifact, key);
      }
      scheduleChatRender();
      return;
    }
    if (type === 'agent') {
      const stage = textValue(event.stage ?? event.status ?? event.message ?? '');
      if (stage && !lane.agentStages.includes(stage)) lane.agentStages.push(stage);
      if (event.message && event.stage && event.message !== event.stage && !lane.notices.includes(event.message)) lane.notices.push(textValue(event.message));
      scheduleChatRender();
      return;
    }
    if (type === 'round') {
      const round = Number(event.round ?? event.n ?? event.number ?? event.value);
      if (Number.isFinite(round)) turn.round = round;
      if (event.message) lane.notices.push(textValue(event.message));
      scheduleChatRender();
      return;
    }
    if (type === 'notice') {
      const message = textValue(event.message ?? event.text ?? event.notice ?? event.data);
      if (message && !lane.notices.includes(message)) lane.notices.push(message);
      scheduleChatProjectRefresh();
      scheduleChatRender();
      return;
    }
    if (type === 'challenge') {
      state.challenge = { message: textValue(event.message ?? event.text ?? event.detail ?? "Manual verification required."), raw: event };
      renderChallenge();
      showChallengeModal();
      if (state.view === 'chat') renderMessages();
      announce("The server reports a challenge. Open a separate window and verify login manually.");
      toast("The server requires manual login verification. Automatic bypass is not performed.", 'warning', 'Challenge');
      return;
    }
    if (type === 'challenge_done') {
      const wasChallenge = state.challenge;
      state.challenge = null;
      renderChallenge();
      closeChallengeModal();
      if (wasChallenge) lane.notices.push("Login verification marked by the server as completed.");
      scheduleChatRender();
      return;
    }
    if (type === 'auto_retry') {
      // The server discarded an interrupted attempt and is continuing:
      // drop its partial text so the retry does not duplicate it.
      const dropped = event.dropped || {};
      ['a', 'b'].forEach((k) => {
        const n = Number(dropped[k]) || 0;
        if (n > 0) {
          const lobj = turnLane(turn, k);
          if (lobj.text) lobj.text = lobj.text.slice(0, Math.max(0, lobj.text.length - n));
        }
      });
      // Shown only while the retry runs: new text, done or Stop removes it,
      // so a stopped chat never claims it will continue.
      clearRetryNote(lane);
      const msg = `The reply was interrupted — retrying (${event.attempt || 1}/${event.max || 2})…`;
      lane.notices.push(msg);
      lane.retryNote = msg;
      scheduleChatRender();
      return;
    }
    if (type === 'chats_changed') {
      void loadChats({ silent: true });
      return;
    }
    if (type === 'account_switched') {
      void loadStatus({ quiet: true }).then(() => { updateAccountUI(); updateConnectionUI(); });
      return;
    }
    if (type === 'error') {
      const message = textValue(event.message ?? event.error ?? event.detail ?? 'The server reported an error.');
      generation.hadError = true;
      if (event.code === 'rate_limit' && Number(event.wait) > 0) {
        // Informational only (v5.1): drives the switch-account hint.
        // Sending is never blocked - the limit may be per-modality or
        // already reset, and the user decides when to continue.
        state.rateLimitUntil = Date.now() + Number(event.wait) * 1000;
        if (!state._rateLimitTimer) {
          state._rateLimitTimer = window.setInterval(() => {
            if (Date.now() >= state.rateLimitUntil) {
              window.clearInterval(state._rateLimitTimer);
              state._rateLimitTimer = null;
              state.rateLimitUntil = 0;
            }
            updateComposerState();
          }, 1000);
        }
      }
      if (event.model === 'a' || event.model === 'b' || event.lane === 'a' || event.lane === 'b' || event.ui_lane === 'a' || event.ui_lane === 'b') {
        // Lane-scoped error: only this model's card fails. A surviving
        // Battle lane keeps streaming to its own terminal event.
        lane.error = true;
        if (!lane.errors.includes(message)) lane.errors.push(message);
        lane.streaming = false;
        lane.done = true;
      } else if (!turn.error) {
        // Global backend error: show it once at turn level instead of
        // attributing it to Model A or pretending a card generated it.
        turn.error = message;
      }
      toast(message, 'error', 'Generation error');
      scheduleChatRender();
      return;
    }
    if (type === 'usage') {
      void refreshPulse();
      if (event.remaining != null) state.usageRemaining = Number(event.remaining);
      if (event.reset != null) state.usageReset = Number(event.reset);
      if (event.modality) state.usageModality = String(event.modality);
      if (event.sends_today != null) state.usageSendsToday = Number(event.sends_today);
      if (event.rate_limits_today != null) state.usageRateLimitsToday = Number(event.rate_limits_today);
      renderUsageBar();
      return;
    }
    if (type === 'done') {
      generation.done = true;
      if (typeof event.history_chars === 'number' && String(event.chat_id) === String(state.activeChatId)) {
        state.historyChars = event.history_chars;
      }
      if (event.arena_message_ids && typeof event.arena_message_ids === 'object') {
        turn.arenaIds = event.arena_message_ids;
      }
      if (event.checkpoints) turn.checkpoints = event.checkpoints;
      if (typeof event.msg_index === 'number') turn.msgEnd = event.msg_index;
      if (event.error) {
        generation.hadError = true;
        const message = textValue(event.error);
        const laneScoped = event.model === 'a' || event.model === 'b' || event.lane === 'a' || event.lane === 'b' || event.ui_lane === 'a' || event.ui_lane === 'b';
        if (laneScoped || Object.keys(turn.lanes).length <= 1) {
          lane.error = true;
          if (message && !lane.errors.includes(message)) lane.errors.push(message);
        } else if (message && !turn.error) {
          turn.error = message;
        }
      }
      Object.values(turn.lanes).forEach((laneItem) => {
        laneItem.streaming = false;
        laneItem.done = true;
      });
      const controller = generation.controller;
      window.setTimeout(() => {
        if (!generation.finished && controller) {
          try { controller.abort(); } catch { /* already closed */ }
        }
      }, 900);
      scheduleChatRender();
      return;
    }
    if (type === 'title' && (event.title || event.text)) {
      state.activeChatTitle = String(event.title ?? event.text);
      renderChatHead();
      updateTopbarTitle();
      return;
    }
    // Unknown event types are deliberately ignored, not guessed or rendered as HTML.
  }

  function makeGenerationTurn(message, chatId, attachments = []) {
    const mode = state.mode;
    const lanes = {};
    const laneA = emptyLane('a', mode === 'agent' ? null : currentModelA());
    if (mode === 'agent') {
      laneA.modelId = null;
      laneA.modelName = 'Agent';
      laneA.modelOrg = "Automatic model selection";
    }
    laneA.streaming = true;
    laneA.typewriterUntil = Date.now() + 1800;
    lanes.a = laneA;
    if (mode === 'battle' || mode === 'side-by-side') {
      const laneB = emptyLane('b', currentModelB());
      laneB.streaming = true;
      laneB.typewriterUntil = Date.now() + 1800;
      lanes.b = laneB;
    }
    return {
      user: { content: message, created_at: new Date().toISOString(), attachments: attachments || [] },
      lanes,
      notices: [],
      error: null,
      round: null,
      vote: null,
      arenaIds: null,
      revealed: false,
      chatId,
      mode,
      modality: state.modality
    };
  }

  function clearRetryNote(lane) {
    if (!lane || !lane.retryNote) return;
    lane.notices = (lane.notices || []).filter((note) => note !== lane.retryNote);
    lane.retryNote = null;
  }

  function markGenerationError(generation, message) {
    if (!generation || generation.finished) return;
    generation.hadError = true;
    const entries = Object.entries(generation.turn.lanes);
    // A global transport/backend error belongs to the turn, not to Model A.
    // If exactly one Battle lane already carries this same error, keep the
    // error there and let the other card simply say no answer was received.
    const matching = entries.filter(([, lane]) => message && lane.errors.includes(message));
    if (entries.length <= 1) {
      const primary = generation.turn.lanes[entries[0]?.[0]] || (generation.turn.lanes.a = emptyLane('a'));
      primary.error = true;
      if (message && !primary.errors.includes(message)) primary.errors.push(message);
    } else if (!matching.length && message && !generation.turn.error) {
      generation.turn.error = message;
    }
    entries.forEach(([, lane]) => {
      lane.streaming = false;
      lane.done = true;
      const hasReceived = lane.text || lane.errors.length || (lane.media || []).length || lane.stopped;
      if (entries.length > 1 && !hasReceived) lane.notices.push('No answer was received from this model.');
    });
  }

  function finishGeneration(generation, { aborted = false } = {}) {
    if (!generation || generation.finished) return;
    generation.finished = true;
    const wasStopped = Boolean(generation.stopRequested);
    if (generation.abortTimer) {
      clearTimeout(generation.abortTimer);
      generation.abortTimer = null;
    }
    Object.values(generation.turn.lanes || {}).forEach((lane) => {
      const wasStreaming = lane.streaming;
      lane.streaming = false;
      lane.done = true;
      if (wasStopped && wasStreaming) lane.stopped = true;
      if (!wasStopped && !generation.done && !lane.error && !generation.hadError) {
        lane.notices.push("Stream ended without a done event. The result may be incomplete.");
      }
      if (!wasStopped && aborted && !generation.hadError) lane.notices.push("Stream connection was terminated locally.");
    });
    if (aborted && wasStopped) {
      const lane = Object.values(generation.turn.lanes)[0];
      if (lane && !lane.text) lane.notices.push("Generation stopped before text was received.");
    }
    const genChatId = generation.chatId ? String(generation.chatId) : null;
    // A finished or stopped reply asks nothing any more: the server denied
    // whatever was still waiting, so its approval cards must not linger
    // (or show up in another chat).
    Object.values(generation.turn.lanes || {}).forEach((laneItem) => {
      clearRetryNote(laneItem);
      (laneItem.permissions || []).forEach((permission) => {
        if (!permission.status || permission.status === 'pending') permission.status = wasStopped ? 'stopped' : 'expired';
      });
    });
    if (genChatId) {
      state.pendingPermissions = state.pendingPermissions.filter((item) => String(item.chatId || '') !== genChatId);
      state.permissionCount = state.pendingPermissions.length;
      updatePendingPermissionsBadge();
    }
    if (genChatId) state.generations.delete(genChatId);
    if (genChatId && generation.done && !wasStopped) {
      // The backend swaps a new chat's provisional title for the summary
      // title Arena generates; pick it up without a manual refresh.
      [10, 30, 60, 100].forEach((secs) => setTimeout(() => { void loadChats({ silent: true }); }, secs * 1000));
    }
    const isOpenChat = genChatId && String(state.activeChatId) === genChatId;
    if (genChatId && !isOpenChat && !generation.hadError && !wasStopped && generation.done) {
      // Finished in the background: the sidebar shows a check until opened.
      state.unreadDone.add(genChatId);
      saveUnreadDone();
      const finishedChat = state.chats.find((item) => item.id === genChatId);
      toast(`“${truncate(finishedChat?.title || 'Chat', 40)}” is done.`, 'success', 'Generation finished');
    }
    syncGenerationState();
    maybePlayDoneSound(generation, { wasStopped });
    if (!wasStopped && !generation.hadError && generation.done) flushQueuedMessage(genChatId);
    if (isOpenChat && state.view === 'chat') renderMessages();
    announce(generation.hadError ? "Generation completed with an error." : wasStopped ? "Generation stopped." : "Generation completed.");
    window.setTimeout(() => {
      if (!state.serverError) {
        void loadChats({ silent: true });
        void loadStatus({ quiet: true });
        void loadPermissions({ quiet: true });
        if (state.workspacePanelOpen) void loadWorkspaceTree('.', { force: true });
      }
    }, 280);
  }

  /* ---------------------------------------------------------------------- */
  /* Composer attachments                                                  */
  /* ---------------------------------------------------------------------- */
  const ATTACH_EXT_MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    gif: 'image/gif', pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown',
    csv: 'text/csv', html: 'text/html', htm: 'text/html', xml: 'text/xml',
    css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json'
  };
  const AGENT_ATTACH_MIME = ['image/png', 'image/webp', 'image/jpeg', 'image/gif', 'text/plain',
    'text/markdown', 'text/csv', 'text/html', 'text/xml', 'text/css', 'text/javascript',
    'application/json', 'application/xml', 'application/javascript', 'application/pdf'];
  const EVAL_ATTACH_MIME = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
  // v1.5.0 upload middleman (app.py _convert_attachment): these are converted
  // on the way up - images to PNG everywhere, code/text files to text/plain in Agent Mode.
  const CONVERT_IMAGE_EXT = ['bmp', 'dib', 'tif', 'tiff', 'ico', 'avif', 'tga', 'ppm', 'pgm', 'pbm',
    'jfif', 'pjpeg', 'gif', 'jp2', 'psd', 'pcx'];
  const TEXTLIKE_EXT = ['py', 'pyw', 'ts', 'tsx', 'jsx', 'java', 'go', 'rs', 'c', 'h', 'cpp', 'cc', 'hpp', 'cs',
    'rb', 'php', 'swift', 'kt', 'kts', 'scala', 'sh', 'bash', 'zsh', 'ps1', 'psm1', 'bat', 'cmd', 'sql', 'yaml',
    'yml', 'toml', 'ini', 'cfg', 'conf', 'log', 'r', 'lua', 'pl', 'dart', 'vue', 'svelte', 'scss', 'sass', 'less',
    'gradle', 'properties', 'tex', 'rst', 'svg', 'ipynb', 'tsv', 'srt', 'vtt', 'env', 'gitignore', 'dockerfile',
    'mk', 'asm', 's', 'm', 'jl', 'ex', 'exs', 'erl', 'hs', 'clj', 'fs', 'vb', 'zig', 'nim', 'sol', 'proto', 'graphql'];
  const fileExt = (file) => String(file?.name || '').split('.').pop()?.toLowerCase() || '';
  function convertibleHere(file, mediaType, kind) {
    const ext = fileExt(file);
    if (ext === 'heic' || ext === 'heif') return false;
    if (CONVERT_IMAGE_EXT.includes(ext) || (mediaType.startsWith('image/') && mediaType !== 'image/svg+xml')) return true;
    return kind === 'agent' && (TEXTLIKE_EXT.includes(ext) || mediaType.startsWith('text/'));
  }
  let attachmentSeq = 0;
  let uploadChain = Promise.resolve();

  function attachmentKind() {
    return state.mode === 'agent' && state.agentKind === 'native' ? 'agent' : 'evaluation';
  }
  function attachmentsAllowedHere() {
    if (attachmentKind() === 'agent') return true;
    return state.modality !== 'search';
  }
  function fileMediaType(file) {
    const ext = String(file?.name || '').split('.').pop()?.toLowerCase() || '';
    const byExt = ATTACH_EXT_MIME[ext];
    const declared = String(file?.type || '').split(';')[0].trim().toLowerCase();
    if (byExt && (!declared || declared === 'application/octet-stream' || declared === 'text/plain'
      || byExt.startsWith('text/') || byExt === 'application/json')) return byExt;
    return declared || byExt || 'application/octet-stream';
  }
  function attachmentAccept() {
    if (attachmentKind() === 'agent') {
      return '';  // anything text-like or an image: the middleman converts what Arena refuses
    }
    const images = '.png,.jpg,.jpeg,.webp,' + CONVERT_IMAGE_EXT.map((e) => '.' + e).join(',');
    if (state.modality === 'text' || state.modality === 'auto') return images + ',.pdf';
    return images;
  }
  function attachmentHint() {
    if (attachmentKind() === 'agent') {
      return 'Images, PDF, text and code files (other image types become PNG, code becomes text) · up to 25 MB per file (PDF 10 MB), 50 MB per message';
    }
    if (state.modality === 'video') return 'PNG, JPEG, WebP · up to 10 MB per file';
    if (state.modality === 'text' || state.modality === 'auto') return 'PNG, JPEG, WebP, PDF · up to 15 MB per file';
    return 'PNG, JPEG, WebP · up to 15 MB per file';
  }
  function attachmentProblem(file, mediaType, pending) {
    const kind = attachmentKind();
    const list = pending || state.attachments;
    if (!attachmentsAllowedHere()) return 'Files cannot be attached in Web Search. Switch the work type to attach files.';
    if (kind === 'agent') {
      if (!AGENT_ATTACH_MIME.includes(mediaType) && !convertibleHere(file, mediaType, kind)) return `${file.name} is not a supported file type. Agent Mode accepts PNG, WebP, JPEG, GIF, PDF, TXT, MD, CSV, HTML, XML, CSS, JS and JSON.`;
      if (mediaType === 'application/pdf' && file.size > 10 * 1024 * 1024) return `${file.name} is over the 10 MB PDF limit for Agent Mode.`;
      if (file.size > 25 * 1024 * 1024) return `${file.name} is over the 25 MB per-file limit for Agent Mode.`;
      if (list.length >= 20) return 'Agent Mode accepts up to 20 files per message.';
      const total = list.reduce((sum, item) => sum + (item.size || 0), 0) + file.size;
      if (total > 50 * 1024 * 1024) return 'Agent Mode accepts up to 50 MB of files per message.';
      return null;
    }
    if (!EVAL_ATTACH_MIME.includes(mediaType) && !convertibleHere(file, mediaType, kind)) return `${file.name} is not supported here. This mode accepts PNG, JPEG, WebP and PDF — Agent Mode accepts more types.`;
    if (mediaType === 'application/pdf' && state.modality !== 'text' && state.modality !== 'auto') {
      return 'PDF files attach in Text (and Battle Auto). Switch the work type, or use Agent Mode.';
    }
    const limit = state.modality === 'video' ? 10 * 1024 * 1024 : 15 * 1024 * 1024;
    if (file.size > limit) return `${file.name} is over the ${limit / (1024 * 1024)} MB per-file limit.`;
    if (list.length >= 10) return 'Attach up to 10 files per message.';
    return null;
  }
  function attachmentsBusy() {
    return state.attachments.some((item) => item.status === 'uploading');
  }
  function attachmentsFailed() {
    return state.attachments.some((item) => item.status === 'error');
  }
  function readyAttachments() {
    return state.attachments.filter((item) => item.status === 'ready' && item.result);
  }
  function renderAttachmentStrip() {
    const strip = els.attachmentStrip;
    if (!strip) return;
    clear(strip);
    strip.hidden = !state.attachments.length;
    state.attachments.forEach((item) => {
      const chip = el('div', { class: `attachment-chip${item.status === 'error' ? ' is-error' : ''}` });
      if (item.previewUrl) {
        chip.appendChild(el('img', { class: 'attachment-thumb', src: item.previewUrl, alt: '' }));
      } else {
        chip.appendChild(el('span', { class: 'attachment-file-icon' }, iconEl(item.mediaType === 'application/pdf' ? 'file-text' : 'file')));
      }
      chip.appendChild(el('span', { class: 'attachment-copy' },
        el('span', { class: 'attachment-name', text: item.name, title: item.name }),
        el('span', { class: 'attachment-meta', text: item.status === 'error' ? (item.error || 'Upload failed') : formatBytes(item.size) })
      ));
      if (item.status === 'uploading') chip.appendChild(el('span', { class: 'mini-spinner', 'aria-hidden': 'true' }));
      const remove = el('button', { class: 'attachment-remove', type: 'button', 'aria-label': `Remove ${item.name}`, title: 'Remove' }, iconEl('x'));
      remove.addEventListener('click', () => removeAttachment(item.id));
      chip.appendChild(remove);
      strip.appendChild(chip);
    });
  }
  function removeAttachment(id) {
    const index = state.attachments.findIndex((item) => item.id === id);
    if (index < 0) return;
    const [item] = state.attachments.splice(index, 1);
    if (item.previewUrl) { try { URL.revokeObjectURL(item.previewUrl); } catch { /* already gone */ } }
    renderAttachmentStrip();
    updateComposerState();
  }
  function clearAttachments() {
    state.attachments.forEach((item) => {
      if (item.previewUrl) { try { URL.revokeObjectURL(item.previewUrl); } catch { /* already gone */ } }
    });
    state.attachments = [];
    renderAttachmentStrip();
  }
  function pruneAttachmentsForSelection() {
    if (!state.attachments.length) return;
    const kind = attachmentKind();
    const kept = [];
    let dropped = 0;
    for (const item of state.attachments) {
      const fake = { name: item.name, size: item.size, type: item.mediaType };
      if (item.kind === kind && !attachmentProblem(fake, item.mediaType, kept)) kept.push(item);
      else {
        dropped += 1;
        if (item.previewUrl) { try { URL.revokeObjectURL(item.previewUrl); } catch { /* already gone */ } }
      }
    }
    if (dropped) {
      state.attachments = kept;
      renderAttachmentStrip();
      toast('Attached files were removed: they do not fit the new mode or work type.', 'info', 'Attachments removed');
    }
  }
  async function attachWorkspaceFile(path) {
    try {
      const blob = await API.downloadWorkspaceFile(path);
      const name = String(path || 'file').split(/[\\/]/).pop() || 'file';
      addFiles([new File([blob], name, { type: blob.type || '' })]);
    } catch (error) {
      toast(errorMessage(error), 'error', 'Could not attach the workspace file');
    }
  }

  function addFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => file && typeof file.size === 'number');
    if (!files.length) return;
    if (state.generating) {
      toast('Wait for the current answer before attaching files.', 'warning');
      return;
    }
    if (!attachmentsAllowedHere()) {
      toast('Files cannot be attached in Web Search. Switch the work type to attach files.', 'warning', 'Attachments unavailable');
      return;
    }
    let firstProblem = null;
    const kind = attachmentKind();
    for (const file of files) {
      const mediaType = fileMediaType(file);
      const problem = attachmentProblem(file, mediaType, state.attachments);
      if (problem) { if (!firstProblem) firstProblem = problem; continue; }
      const item = {
        id: `att-${++attachmentSeq}`,
        file,
        kind,
        name: file.name || (mediaType.startsWith('image/') ? 'pasted-image.png' : 'file'),
        size: file.size,
        mediaType,
        status: 'uploading',
        error: null,
        result: null,
        previewUrl: mediaType.startsWith('image/') ? URL.createObjectURL(file) : null
      };
      state.attachments.push(item);
      uploadChain = uploadChain.then(() => uploadOneAttachment(item)).catch(() => undefined);
    }
    if (firstProblem) toast(firstProblem, 'warning', 'File not attached');
    renderAttachmentStrip();
    updateComposerState();
  }
  async function uploadOneAttachment(item) {
    if (!state.attachments.includes(item)) return;
    try {
      const result = await API.uploadAttachment(item.file, item.kind, item.kind === 'evaluation' ? state.modality : '');
      item.result = result;
      item.status = 'ready';
    } catch (error) {
      item.status = 'error';
      item.error = errorMessage(error);
      toast(item.error, 'error', `Could not attach ${item.name}`);
    }
    renderAttachmentStrip();
    updateComposerState();
  }
  function turnAttachmentsFromComposer() {
    return readyAttachments().map((item) => ({
      name: item.result.name || item.result.filename || item.name,
      contentType: item.result.contentType || item.result.mediaType || item.mediaType,
      mediaType: item.result.mediaType || item.result.contentType || item.mediaType,
      url: item.result.url,
      size: item.result.size ?? item.size,
      previewUrl: item.previewUrl || null
    }));
  }
  function normalizeUserAttachments(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter((item) => item && typeof item === 'object' && (item.url || item.name || item.filename)).map((item) => ({
      name: String(item.name || item.filename || 'File'),
      contentType: String(item.contentType || item.mediaType || ''),
      mediaType: String(item.mediaType || item.contentType || ''),
      url: typeof item.url === 'string' ? item.url : '',
      size: Number(item.size) || 0,
      previewUrl: null
    }));
  }

  function askCodeWorkspaceSync() {
    const chatKey = String(state.activeChatId || 'new');
    const hasFolder = Boolean(state.workspaceChosen);
    const resend = () => { state.codeSyncAskedFor = chatKey; window.setTimeout(() => { void sendMessage(); }, 0); };
    mountModal({
      title: 'Save the generated files on this computer?',
      subtitle: 'Workspace Sync',
      size: 'small',
      content: el('div', {},
        el('p', { class: 'modal-copy', text: 'Code chats build a project on Arena’s servers. Workspace Sync copies the files the AI writes into the folder you chose on this computer, so you can open and run them here.' }),
        el('p', { class: 'modal-copy', text: hasFolder
          ? 'Workspace Sync is off, so the files would only exist on Arena’s sandbox (you can still preview them on arena.ai).'
          : 'No folder is chosen yet, so the files would only exist on Arena’s sandbox (you can still preview them on arena.ai).' })),
      actions: [
        { label: 'Cancel', variant: 'quiet' },
        { label: 'Send without saving files', variant: 'quiet', onClick: () => { resend(); } },
        { label: hasFolder ? 'Turn on Workspace Sync' : 'Choose a folder', variant: 'primary', autofocus: true,
          onClick: () => {
            if (hasFolder) { setWorkspaceSync(true); resend(); }
            else { state.directTools = true; openWorkspacePopover(els.workspaceButton); }
          } }
      ]
    });
  }

  async function sendMessage() {
    if (state.starting) return;
    if (chatIsGenerating(state.activeChatId)) {
      const queuedText = els.prompt?.value.trim() || '';
      if (queuedText && state.activeChatId) {
        queuedMessages.set(String(state.activeChatId), queuedText);
        if (els.prompt) { els.prompt.value = ''; saveComposerDraft(); }
        updateComposerState();
        renderQueuedBar();
        toast("Queued — it sends itself when this chat finishes the current answer.", 'info', "Message queued");
      } else {
        toast("This chat is still working on the previous message. You can use other chats meanwhile.", 'warning', "Generation is already in progress");
      }
      return;
    }
    const text = els.prompt?.value.trim() || '';
    if (!text) {
      focusComposer();
      updateComposerState();
      return;
    }
    if (attachmentsBusy()) {
      toast('Files are still uploading. The message sends when they finish — try again in a moment.', 'info', 'Uploading files');
      return;
    }
    if (attachmentsFailed()) {
      toast('One file did not upload. Remove it (×) and send again.', 'warning', 'Attachment failed');
      return;
    }
    if (state.modality === 'video' && text.length > 2500) {
      toast('Video prompts can be up to 2,500 characters. Shorten the prompt and send again.', 'warning', 'Prompt too long');
      return;
    }
    if (state.historyLoading) {
      toast("Wait for the dialog history to load.", 'info');
      return;
    }
    if (state.historyError) {
      toast("Dialog history not loaded. Reload to avoid sending a request in an incomplete context.", 'warning', "History unavailable");
      return;
    }
    if (state.serverError || state.networkOffline) {
      toast(state.serverError || "No connection to the local server. Request not sent.", 'error', "Server unavailable");
      return;
    }
    if (state.status && !state.authenticated) {
      toast("Log in first in a separate window or using cookies.", 'warning', "Not signed in");
      openSettings('connection');
      return;
    }
    if (state.demo && !demoStore.authenticated) {
      toast("Logged out of the demo profile. Log in to send a demo message.", 'warning', "Not signed in");
      openSettings('connection');
      return;
    }
    state.starting = true;
    updateComposerState();
    try {
      if (state.pendingChanges > 0) {
        toast("First apply the changes to the mode and task type.", 'info', "Synchronization of settings");
        while (state.pendingChanges > 0) {
          await state.transitionQueue.catch(() => undefined);
        }
      }
      if (state.modelsPromise) await state.modelsPromise.catch(() => undefined);
      if (state.pendingChanges > 0) {
        toast("Settings are still being applied. Please resend.", 'warning', "Please wait");
        return;
      }
      if (state.serverError) {
        toast(state.serverError, 'error', "Server unavailable");
        return;
      }
      if (!requiredModelsReady()) {
        if (state.mode !== 'battle') {
          toast(state.modelsError || (state.modelsLoading ? "Wait for the models to load." : "Select a model to send."), 'warning', "Model is not ready");
          openModelPicker(state.mode === 'side-by-side' && state.modelAId ? 'b' : 'a');
        } else {
          toast("The server is not yet ready for Battle.", 'warning');
        }
        return;
      }

      // First Code message while Workspace Sync cannot save files here: the
      // generated project would stay on Arena's sandbox. Explain and ask once.
      if (state.modality === 'code' && state.mode !== 'agent' && !chatLocked()
          && !(state.directTools && state.workspaceChosen)
          && state.codeSyncAskedFor !== String(state.activeChatId || 'new')) {
        askCodeWorkspaceSync();
        return;
      }

      let chatId = state.activeChatId;
      if (!chatId) {
        const raw = await API.newChat();
        chatId = raw?.chat_id ?? raw?.id ?? raw?.chat?.id;
        if (!chatId) throw new ApiError("The server did not return a chat ID.");
        chatId = String(chatId);
        state.activeChatId = chatId;
        state.activeChatTitle = String(raw?.title ?? "New chat");
        state.messages = [];
        state.artifacts = [];
        state.historyError = null;
        state.historyLoading = false;
        state.challenge = null;
        updateArtifactCount();
        void loadChats({ silent: true });
      }

      // The visible composer selection travels with the request itself, so a
      // late status/chat response can never reroute this send to another mode.
      const body = { message: text, chat_id: chatId, mode: state.mode, modality: state.modality };
      try { body.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* optional */ }
      if (state.mode === 'agent') {
        // 'arena' = native Arena Agent Mode streamed in-app; 'local' = the
        // folder-tools loop.  A saved chat keeps its own backend server-side.
        body.agent_backend = state.agentKind === 'native' ? 'arena' : 'local';
      }
      // Workspace Sync: the composer switch decides whether models get the
      // automatic folder-tools loop on this computer. It applies to Direct,
      // Side by Side, Battle and the Local Agent alike.
      body.tools = Boolean(state.directTools);
      // Only Direct and Side by Side have user-chosen models.  Battle sends
      // no ids, Video is Battle-only, and Agent is always automatic.
      if (allowsManualModels()) {
        if (!state.modelAId) throw new ApiError("Model A not selected.");
        body.model_id = state.modelAId;
      }
      if (state.mode === 'side-by-side') {
        if (!state.modelBId) throw new ApiError("Model B not selected.");
        body.model_id_b = state.modelBId;
      }
      const sentAttachments = turnAttachmentsFromComposer();
      if (state.mode === 'direct' && Array.isArray(state.fanoutModels) && state.fanoutModels.length >= 2) {
        body.fanout_models = [...state.fanoutModels];
      }
      if (sentAttachments.length) body.attachments = sentAttachments;

      const turn = makeGenerationTurn(text, chatId, sentAttachments);
      if (!state.activeChatTitle || state.activeChatTitle === "New chat") {
        state.activeChatTitle = truncate(text, 52);
        const chat = state.chats.find((item) => item.id === String(chatId));
        if (chat) chat.title = state.activeChatTitle;
        else {
          state.chats.unshift({ id: String(chatId), title: state.activeChatTitle, updated_at: new Date().toISOString(), mode: state.mode, modality: state.modality });
        }
      }
      state.messages.push(turn);
      state.artifacts = state.artifacts.filter((artifact) => artifact.chatId !== null || artifact.chatId === chatId);
      if (els.prompt) els.prompt.value = '';
      state.draft = '';
      saveComposerDraft();
      // The turn keeps its own preview URLs; the composer starts clean.
      state.attachments = [];
      renderAttachmentStrip();
      resetPromptHeight();
      const controller = new AbortController();
      const generation = { turn, controller, chatId: String(chatId), hadError: false, done: false, finished: false, abortTimer: null, stopRequested: false };
      state.generations.set(generation.chatId, generation);
      state.chatTurns[generation.chatId] = state.messages;
      markChatSeen(generation.chatId);
      state.starting = false;
      syncGenerationState();
      setView('chat');
      renderChatArea();
      renderChats();
      updateComposerState();
      if (els.content) els.content.scrollTop = els.content.scrollHeight;
      announce("Request sent. Awaiting response.");
      try {
        await API.streamChat(body, (event) => handleStreamEvent(event, generation), controller.signal);
      } catch (error) {
        if (!generation.done && !(generation.stopRequested && error?.name === 'AbortError')) {
          markGenerationError(generation, errorMessage(error));
          toast(errorMessage(error), 'error', "Generation interrupted");
        } else if (generation.stopRequested) {
          Object.values(turn.lanes).forEach((lane) => { lane.stopped = true; lane.streaming = false; });
        }
      } finally {
        finishGeneration(generation, { aborted: controller.signal.aborted });
      }
    } catch (error) {
      toast(errorMessage(error), 'error', "Request not sent");
    } finally {
      state.starting = false;
      updateComposerState();
    }
  }

  async function stopGeneration() {
    if (state.stopping) return;
    const generation = state.activeGeneration;
    if (!generation && !state.remoteBusy) return;
    state.stopping = true;
    if (generation) generation.stopRequested = true;
    state.stopRequested = Boolean(generation);
    updateComposerState();
    try {
      await API.stop(generation ? generation.chatId : null);
      if (generation) {
        toast("Stop signal sent to the server. Waiting for the thread to finish.", 'info', "Stopping");
        generation.abortTimer = window.setTimeout(() => {
          if (!generation.finished) {
            try { generation.controller.abort(); } catch { /* already closed */ }
          }
        }, 4200);
      } else {
        toast("Stop signal sent to the local server.", 'info', "Stopping");
        window.setTimeout(() => { state.stopping = false; void loadStatus({ quiet: true }); }, 700);
      }
    } catch (error) {
      state.stopping = false;
      if (generation) generation.stopRequested = false;
      state.stopRequested = false;
      updateComposerState();
      toast(errorMessage(error), 'error', "Failed to stop generation");
    } finally {
      if (!state.generating) {
        state.stopping = false;
        updateComposerState();
      }
    }
  }

  async function retryPendingHistory() {
    if (state.activeChatId) await openChat(state.activeChatId, { retry: true });
  }

  /* ---------------------------------------------------------------------- */
  /* Popovers                                                              */