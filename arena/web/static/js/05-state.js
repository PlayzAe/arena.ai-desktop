  /* State normalizers and common UI state                                 */
  /* ---------------------------------------------------------------------- */
  function validMode(value) { return VALID_MODES.includes(value) ? value : null; }
  function validModality(value) {
    // Older chats and the server's initial state use API aliases. Auto is a
    // real Battle work type now, not an alias for Text.
    const canonical = ({ chat: 'text', webdev: 'code' })[value] || value;
    return VALID_MODALITIES.includes(canonical) ? canonical : null;
  }
  function validPermissionMode(value) { return VALID_PERMISSION_MODES.includes(value) ? value : null; }

  function selectionIssue(mode, modality) {
    // Agent never blocks on the work type: it runs as Text while its
    // work-type selector is hidden, exactly like arena.ai.
    if (mode === 'agent') return '';
    if (modality === 'video' && mode !== 'battle') return 'Video is available only in Battle Mode; Arena selects both models.';
    if (modality === 'auto' && mode !== 'battle') return 'Auto is available only in Battle Mode.';
    return '';
  }
  function isValidSelection(mode, modality) { return !selectionIssue(mode, modality); }
  function normalizeSelection(mode, modality) {
    const nextMode = validMode(mode) || 'battle';
    let nextModality = validModality(modality) || 'text';
    if (nextMode === 'agent') nextModality = 'text';
    else if ((nextModality === 'video' || nextModality === 'auto') && nextMode !== 'battle') nextModality = 'text';
    return { mode: nextMode, modality: nextModality };
  }
  function modalityOptionsForMode(mode) {
    if (mode === 'agent') return [];
    if (mode === 'battle') return MODALITIES;
    return MODALITIES.filter((item) => item.id !== 'video' && item.id !== 'auto');
  }
  function allowsManualModels(mode = state.mode, modality = state.modality) {
    return (mode === 'direct' || mode === 'side-by-side') && modality !== 'video';
  }
  function chatLocked() {
    // After the first message, a chat keeps its mode, modality and models
    // (like arena.ai): the selection controls only apply to new chats.
    return Boolean(state.activeChatId)
      && (state.messages || []).some((turn) => turn && (turn.user || Object.keys(turn.lanes || {}).length));
  }
  function lockedNotice(what) {
    toast(`${what} Recorded after the first message — like on arena.ai. Create a new chat to make changes.`,
      'info', "Chat already started");
  }
  function modeMeta(value) { return MODES.find((item) => item.id === value) || MODES.find((item) => item.id === 'direct'); }
  function modalityMeta(value) { return MODALITIES.find((item) => item.id === value) || MODALITIES.find((item) => item.id === 'text'); }
  function permissionMeta(value) { return PERMISSION_MODES.find((item) => item.id === value) || PERMISSION_MODES[0]; }

  function normalizeWorkspace(raw) {
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'object') {
      const value = raw.path ?? raw.workspace ?? raw.directory ?? raw.cwd;
      return typeof value === 'string' ? value : '';
    }
    return '';
  }

  function normalizeEngine(raw) {
    if (raw === null || raw === undefined) return { known: false, open: false, share: 0.42 };
    if (typeof raw === 'boolean') return { known: true, open: raw, share: 0.42 };
    if (typeof raw === 'string') return { known: true, open: ['open', 'shown', 'docked', 'visible', 'true'].includes(raw.toLowerCase()), share: 0.42 };
    if (typeof raw === 'object') {
      const open = Boolean(raw.open ?? raw.shown ?? raw.visible ?? raw.docked ?? raw.is_open);
      const shareCandidate = Number(raw.share ?? raw.width_share ?? raw.split);
      return { known: true, open, share: Number.isFinite(shareCandidate) && shareCandidate > 0 ? shareCandidate : 0.42 };
    }
    return { known: false, open: false, share: 0.42 };
  }

  function normalizeStatus(raw) {
    const data = raw && typeof raw === 'object' ? raw : {};
    return {
      authenticated: Boolean(data.authenticated ?? data.logged_in ?? data.auth),
      email: typeof data.email === 'string' ? data.email : '',
      full_name: typeof (data.full_name ?? data.fullName ?? data.name) === 'string' ? (data.full_name ?? data.fullName ?? data.name) : '',
      avatar_url: typeof (data.avatar_url ?? data.avatarUrl) === 'string' ? (data.avatar_url ?? data.avatarUrl) : '',
      loading: Boolean(data.loading),
      engine_loading: Boolean(data.engine_loading ?? data.loading),
      generating: Boolean(data.generating ?? data.busy),
      offline: Boolean(data.offline),
      session_error: data.session_error ?? data.sessionError ?? null,
      mode: validMode(data.mode),
      modality: validModality(data.modality),
      desktop: Boolean(data.desktop),
      engine: data.engine,
      permission_mode: validPermissionMode(data.permission_mode ?? data.permissionMode),
      workspace: normalizeWorkspace(data.workspace),
      workspace_chosen: Boolean(data.workspace_chosen),
      app_version: typeof data.app_version === 'string' ? data.app_version : '',
      pending_permissions: Number.isFinite(Number(data.pending_permissions ?? data.pendingPermissions)) ? Number(data.pending_permissions ?? data.pendingPermissions) : 0,
      generating_chat_ids: Array.isArray(data.generating_chat_ids) ? data.generating_chat_ids : null,
      accounts: Array.isArray(data.accounts) ? data.accounts : null,
      current_account_id: data.current_account_id ?? null,
      challenge: data.challenge ?? null,
      gateway: data.gateway ?? null
    };
  }

  function normalizeChat(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = raw.id ?? raw.chat_id ?? raw.uuid;
    if (!id) return null;
    return {
      id: String(id),
      title: String(raw.title ?? raw.name ?? "New chat"),
      updated_at: raw.updated_at ?? raw.updatedAt ?? raw.modified_at ?? raw.created_at ?? null,
      created_at: raw.created_at ?? raw.createdAt ?? null,
      mode: validMode(raw.mode),
      modality: validModality(raw.modality),
      agent_backend: raw.agent_backend === 'arena' ? 'arena' : raw.agent_backend === 'local' ? 'local' : null,
      pinned: Boolean(raw.pinned ?? raw.starred),
      source: raw.source === 'arena' ? 'arena' : 'local',
      eval_id: typeof raw.eval_id === 'string' ? raw.eval_id : null,
      parent_id: raw.parent_id ? String(raw.parent_id) : null,
      children: Array.isArray(raw.children) ? raw.children.map((kid) => normalizeChat(kid)).filter(Boolean) : [],
      raw
    };
  }

  function normalizeModel(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = raw.id ?? raw.model_id ?? raw.slug ?? raw.model;
    if (id === null || id === undefined || id === '') return null;
    const orgValue = raw.org_display ?? raw.org ?? raw.organization ?? raw.provider;
    const org = typeof orgValue === 'string' ? orgValue : textValue(orgValue?.display_name ?? orgValue?.name ?? '');
    let capabilities = raw.capabilities ?? raw.tags ?? [];
    if (typeof capabilities === 'string') capabilities = capabilities.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
    if (!Array.isArray(capabilities)) capabilities = [];
    return {
      id: String(id),
      name: String(raw.name ?? raw.display_name ?? raw.label ?? id),
      org,
      org_display: org,
      color: safeColor(raw.color),
      capabilities,
      provider: String(raw.provider ?? ''),
      user_selectable: raw.user_selectable !== false,
      is_router: Boolean(raw.is_router),
      icon_url: typeof (raw.icon_url ?? raw.iconUrl ?? raw.logo_url) === 'string' ? (raw.icon_url ?? raw.iconUrl ?? raw.logo_url) : '',
      fixed: Boolean(raw.fixed),
      rank: Number.isFinite(Number(raw.rank)) ? Number(raw.rank) : null,
      arena_score: Number.isFinite(Number(raw.arena_score ?? raw.score)) ? Number(raw.arena_score ?? raw.score) : null,
      raw
    };
  }

  function modelArray(payload) {
    const list = Array.isArray(payload) ? payload : (Array.isArray(payload?.models) ? payload.models : []);
    return list.map(normalizeModel).filter(Boolean);
  }

  function getModel(id) {
    if (id === null || id === undefined) return null;
    return state.models.find((model) => String(model.id) === String(id)) || null;
  }
  function currentModelA() { return getModel(state.modelAId); }
  function currentModelB() { return getModel(state.modelBId); }

  function modelName(id, fallback = "Model") {
    return getModel(id)?.name || fallback;
  }

  function ensureModelSelections() {
    const validIds = new Set(state.models.map((model) => String(model.id)));
    if (state.modelAId !== null && !validIds.has(String(state.modelAId))) state.modelAId = null;
    if (state.modelBId !== null && !validIds.has(String(state.modelBId))) state.modelBId = null;
    if (state.mode === 'battle') {
      state.modelAId = null;
      state.modelBId = null;
      return;
    }
    if (state.mode === 'agent') {
      state.modelAId = null;
      state.modelBId = null;
      return;
    }
    if (!allowsManualModels() || !state.models.length) return;
    if (!state.modelAId) state.modelAId = state.models[0].id;
    if (state.mode === 'side-by-side') {
      if (!state.modelBId || String(state.modelBId) === String(state.modelAId)) {
        const candidate = state.models.find((model) => String(model.id) !== String(state.modelAId));
        state.modelBId = candidate ? candidate.id : null;
      }
    } else {
      state.modelBId = null;
    }
  }

  function requiredModelsReady() {
    if (!isValidSelection(state.mode, state.modality)) return false;
    if (state.mode === 'battle' || state.mode === 'agent') return true;
    if (state.modelsLoading || state.modelsError) return false;
    if (!state.models.length) return false;
    if (!getModel(state.modelAId)) return false;
    if (state.mode === 'side-by-side' && (!getModel(state.modelBId) || String(state.modelAId) === String(state.modelBId))) return false;
    return true;
  }

  function workspaceName() {
    return state.workspace ? baseName(state.workspace) : "Choose folder";
  }

  /* ---------------------------------------------------------------------- */
  /* Markdown: a safe DOM renderer. Source text is never assigned to HTML. */
  /* ---------------------------------------------------------------------- */
  function appendInline(parent, source, depth = 0) {
    const text = String(source ?? '');
    if (depth > 6) {
      append(parent, text);
      return;
    }
    const pattern = /(`[^`\n]+`|\*\*[^\n]+?\*\*|__[^\n]+?__|~~[^\n]+?~~|\[[^\]\n]+\]\([^)\s]+\)|\*[^*\n]+?\*|_[^_\n]+?_)/g;
    let last = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > last) append(parent, text.slice(last, match.index));
      const token = match[0];
      if (token.startsWith('`')) {
        parent.appendChild(el('code', { class: 'inline-code', text: token.slice(1, -1) }));
      } else if (token.startsWith('**') || token.startsWith('__')) {
        const strong = el('strong');
        appendInline(strong, token.slice(2, -2), depth + 1);
        parent.appendChild(strong);
      } else if (token.startsWith('~~')) {
        parent.appendChild(el('del', { text: token.slice(2, -2) }));
      } else if (token.startsWith('*') || token.startsWith('_')) {
        const emphasis = el('em');
        appendInline(emphasis, token.slice(1, -1), depth + 1);
        parent.appendChild(emphasis);
      } else {
        const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          const label = linkMatch[1];
          const url = safeUrl(linkMatch[2]);
          if (url) {
            parent.appendChild(el('a', {
              href: url,
              target: url.startsWith('/') ? '_self' : '_blank',
              rel: 'noopener noreferrer',
              title: url,
              text: label
            }));
          } else {
            append(parent, label);
          }
        } else {
          append(parent, token);
        }
      }
      last = pattern.lastIndex;
    }
    if (last < text.length) append(parent, text.slice(last));
  }

  function codeBlock(language, code) {
    const wrapper = el('div', { class: 'code-block' });
    const copyButton = el('button', {
      class: 'code-copy', type: 'button', 'data-copy-code': '1',
      'aria-label': "Copy code"
    }, iconEl('copy'), el('span', { text: "Copy" }));
    const head = el('div', { class: 'code-block-head' },
      el('span', { text: language || 'code' }),
      copyButton
    );
    const pre = el('pre');
    pre.appendChild(el('code', { text: code }));
    wrapper.append(head, pre);
    return wrapper;
  }

  function isTableDivider(line) {
    return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(String(line));
  }

  function tableCells(line) {
    let value = String(line).trim();
    if (value.startsWith('|')) value = value.slice(1);
    if (value.endsWith('|')) value = value.slice(0, -1);
    return value.split('|').map((cell) => cell.trim());
  }

  function renderMarkdown(source) {
    const fragment = document.createDocumentFragment();
    const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
    let index = 0;
    let paragraph = [];

    const flushParagraph = () => {
      if (!paragraph.length) return;
      const p = el('p');
      appendInline(p, paragraph.join('\n'));
      fragment.appendChild(p);
      paragraph = [];
    };

    while (index < lines.length) {
      const line = lines[index];
      const trimmed = line.trim();

      if (!trimmed) {
        flushParagraph();
        index += 1;
        continue;
      }

      const fence = line.match(/^\s{0,3}(```|~~~)\s*([^\s`]*)\s*$/);
      if (fence) {
        flushParagraph();
        const marker = fence[1];
        const language = fence[2] || '';
        const codeLines = [];
        index += 1;
        while (index < lines.length && !new RegExp(`^\\s{0,3}${marker === '```' ? '```' : '~~~'}\\s*$`).test(lines[index])) {
          codeLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        fragment.appendChild(codeBlock(language, codeLines.join('\n')));
        continue;
      }

      if (isTableDivider(lines[index + 1] || '') && line.includes('|')) {
        flushParagraph();
        const headers = tableCells(line);
        const table = el('table');
        const thead = el('thead');
        const headerRow = el('tr');
        headers.forEach((cell) => {
          const th = el('th');
          appendInline(th, cell);
          headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        const tbody = el('tbody');
        table.append(thead, tbody);
        index += 2;
        while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
          const cells = tableCells(lines[index]);
          if (!cells.some(Boolean)) break;
          const row = el('tr');
          headers.forEach((_, cellIndex) => {
            const td = el('td');
            appendInline(td, cells[cellIndex] || '');
            row.appendChild(td);
          });
          tbody.appendChild(row);
          index += 1;
        }
        fragment.appendChild(table);
        continue;
      }

      const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        flushParagraph();
        const headingNode = el(`h${Math.min(6, heading[1].length)}`);
        appendInline(headingNode, heading[2]);
        fragment.appendChild(headingNode);
        index += 1;
        continue;
      }

      if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        flushParagraph();
        fragment.appendChild(el('hr'));
        index += 1;
        continue;
      }

      if (/^\s*>\s?/.test(line)) {
        flushParagraph();
        const quote = el('blockquote');
        const quoteLines = [];
        while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
          quoteLines.push(lines[index].replace(/^\s*>\s?/, ''));
          index += 1;
        }
        const p = el('p');
        appendInline(p, quoteLines.join('\n'));
        quote.appendChild(p);
        fragment.appendChild(quote);
        continue;
      }

      const unorderedMatch = line.match(/^\s*[-*+]\s+(.+)$/);
      const orderedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (unorderedMatch || orderedMatch) {
        flushParagraph();
        const list = el(orderedMatch ? 'ol' : 'ul');
        const matcher = orderedMatch ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/;
        while (index < lines.length) {
          const itemMatch = lines[index].match(matcher);
          if (!itemMatch) break;
          const item = el('li');
          appendInline(item, itemMatch[1]);
          list.appendChild(item);
          index += 1;
        }
        fragment.appendChild(list);
        continue;
      }

      if (/^\s*\|/.test(line) && line.trim().endsWith('|')) {
        flushParagraph();
        const pre = el('pre', { class: 'plain-pre', text: line });
        fragment.appendChild(pre);
        index += 1;
        continue;
      }

      paragraph.push(line);
      index += 1;
    }
    flushParagraph();
    return fragment;
  }

  /* ---------------------------------------------------------------------- */
  /* Source / media / activity normalizers                                 */
  /* ---------------------------------------------------------------------- */
  function normalizeSource(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const url = safeUrl(raw.url ?? raw.link ?? raw.href ?? '');
    const title = String(raw.title ?? raw.name ?? raw.label ?? hostOf(url) ?? "Source");
    if (!title && !url) return null;
    return {
      title: title || "Source",
      url: url || '',
      snippet: String(raw.snippet ?? raw.description ?? raw.text ?? ''),
      domain: hostOf(url)
    };
  }

  function normalizeMedia(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const kindRaw = String(raw.kind ?? raw.type ?? raw.media_type ?? '').toLowerCase();
    const kind = kindRaw.includes('video') ? 'video' : kindRaw.includes('audio') ? 'audio' : 'image';
    const url = safeUrl(raw.url ?? raw.src ?? raw.media_url ?? raw.file ?? '', { image: true });
    const poster = safeUrl(raw.poster ?? raw.thumbnail ?? raw.preview ?? '', { image: true });
    if (!url && !poster) return null;
    return {
      kind,
      url: url || '',
      poster: poster || '',
      title: String(raw.title ?? raw.alt ?? raw.name ?? (kind === 'video' ? "Video" : "Image")),
      alt: String(raw.alt ?? raw.title ?? "Media from server response"),
      demo: Boolean(raw.demo)
    };
  }

  function normalizeMediaChoice(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const attributionByIndex = new Map();
    const attributionRaw = Array.isArray(raw.attribution) ? raw.attribution : [];
    attributionRaw.forEach((item, position) => {
      if (!item || typeof item !== 'object') return;
      const index = Number.isFinite(Number(item.index)) ? Number(item.index) : position;
      attributionByIndex.set(index, {
        index,
        model_name: textValue(item.model_name ?? item.modelName ?? item.name ?? ''),
        organization: textValue(item.organization ?? item.org ?? ''),
        is_private: Boolean(item.is_private ?? item.isPrivate)
      });
    });
    const candidates = (Array.isArray(raw.candidates) ? raw.candidates : []).map((candidate, position) => {
      if (!candidate || typeof candidate !== 'object') return null;
      const index = Number.isFinite(Number(candidate.index)) ? Number(candidate.index) : position;
      const reveal = attributionByIndex.get(index) || {};
      const hash = textValue(candidate.hash || '');
      let url = safeUrl(candidate.url ?? candidate.src ?? '', { image: true });
      if (!url && /^[A-Za-z0-9_-]{43}$/.test(hash)) url = `/api/native-cas/${hash}`;
      return {
        index,
        hash,
        url,
        title: textValue(candidate.title ?? candidate.filename ?? `Option ${index + 1}`),
        model_name: textValue(candidate.model_name ?? candidate.modelName ?? reveal.model_name ?? ''),
        organization: textValue(candidate.organization ?? candidate.org ?? reveal.organization ?? ''),
        is_private: Boolean(candidate.is_private ?? candidate.isPrivate ?? reveal.is_private)
      };
    }).filter(Boolean);
    if (!candidates.length) return null;
    const selectedRaw = raw.selected_index ?? raw.selectedIndex;
    const selectedIndex = selectedRaw === null || selectedRaw === undefined || selectedRaw === ''
      ? null : (Number.isFinite(Number(selectedRaw)) ? Number(selectedRaw) : null);
    const status = textValue(raw.status || (selectedIndex !== null ? 'completed' : 'awaiting_user_response'));
    return {
      id: raw.id ? String(raw.id) : null,
      toolCallId: textValue(raw.tool_call_id ?? raw.toolCallId ?? ''),
      chatId: raw.chat_id ?? raw.chatId ?? null,
      kind: 'image',
      status,
      prompt: textValue(raw.prompt || ''),
      filePath: textValue(raw.file_path ?? raw.filePath ?? ''),
      candidates,
      selectedIndex,
      selectionMethod: textValue(raw.selection_method ?? raw.selectionMethod ?? ''),
      attribution: [...attributionByIndex.values()]
    };
  }

  function mediaChoiceIsPending(choice) {
    return Boolean(choice && choice.selectedIndex === null
      && !['completed', 'cancelled', 'error'].includes(String(choice.status || '').toLowerCase()));
  }

  function sameMediaChoice(left, right) {
    if (!left || !right) return false;
    if (left.id && right.id && String(left.id) === String(right.id)) return true;
    return Boolean(left.toolCallId && right.toolCallId && left.toolCallId === right.toolCallId);
  }

  function mergeMediaChoice(existing, incoming) {
    if (!existing) return incoming;
    if (!incoming) return existing;
    const merged = { ...existing, ...incoming };
    // A completed stream event can be keyed only by tool-call id; preserve
    // the broker id already shown in the waiting card whenever possible.
    merged.id = existing.id || incoming.id;
    merged.chatId = existing.chatId || incoming.chatId;
    merged.toolCallId = existing.toolCallId || incoming.toolCallId;
    if (!incoming.candidates?.length) merged.candidates = existing.candidates;
    else if (existing.candidates?.length) {
      const oldByIndex = new Map(existing.candidates.map((candidate) => [candidate.index, candidate]));
      merged.candidates = incoming.candidates.map((candidate) => {
        const old = oldByIndex.get(candidate.index) || {};
        return {
          ...old,
          ...candidate,
          url: candidate.url || old.url || '',
          model_name: candidate.model_name || old.model_name || '',
          organization: candidate.organization || old.organization || ''
        };
      });
    }
    const attribution = new Map();
    [...(existing.attribution || []), ...(incoming.attribution || [])].forEach((item) => {
      if (item && Number.isFinite(Number(item.index))) attribution.set(Number(item.index), item);
    });
    merged.attribution = [...attribution.values()];
    merged.candidates = (merged.candidates || []).map((candidate) => {
      const reveal = attribution.get(candidate.index) || {};
      return {
        ...candidate,
        model_name: candidate.model_name || reveal.model_name || '',
        organization: candidate.organization || reveal.organization || '',
        is_private: Boolean(candidate.is_private || reveal.is_private)
      };
    });
    return merged;
  }

  function upsertLaneMediaChoice(lane, raw) {
    const incoming = normalizeMediaChoice(raw);
    if (!incoming || !lane) return null;
    if (!Array.isArray(lane.mediaChoices)) lane.mediaChoices = [];
    const existingIndex = lane.mediaChoices.findIndex((choice) => sameMediaChoice(choice, incoming));
    if (existingIndex >= 0) {
      lane.mediaChoices[existingIndex] = mergeMediaChoice(lane.mediaChoices[existingIndex], incoming);
      return lane.mediaChoices[existingIndex];
    }
    lane.mediaChoices.push(incoming);
    return incoming;
  }

  function applyMediaReveal(lane, event) {
    if (!lane) return null;
    if (event?.media_choice?.candidates?.length) return upsertLaneMediaChoice(lane, event.media_choice);
    if (!Array.isArray(lane.mediaChoices) || !lane.mediaChoices.length) return null;
    const toolCallId = textValue(event?.tool_call_id ?? event?.toolCallId ?? '');
    const choice = lane.mediaChoices.find((item) => toolCallId && item.toolCallId === toolCallId)
      || lane.mediaChoices[lane.mediaChoices.length - 1];
    if (!choice) return null;
    const normalized = normalizeMediaChoice({
      ...choice,
      candidates: choice.candidates,
      selected_index: choice.selectedIndex,
      selection_method: choice.selectionMethod,
      file_path: choice.filePath,
      tool_call_id: choice.toolCallId,
      chat_id: choice.chatId,
      attribution: event?.attribution || []
    });
    const merged = mergeMediaChoice(choice, normalized);
    const index = lane.mediaChoices.indexOf(choice);
    if (index >= 0) lane.mediaChoices[index] = merged;
    return merged;
  }

  function normalizeActivity(raw, type = 'tool') {
    if (!raw || typeof raw !== 'object') return null;
    const input = raw.input && typeof raw.input === 'object' ? raw.input : {};
    const command = String(raw.command ?? input.command ?? raw.cmd ?? '');
    const path = String(raw.path ?? input.path ?? input.file_path ?? input.file ?? '');
    const name = String(raw.name ?? raw.tool ?? raw.title ?? (type === 'sandbox' ? "Sandbox" : "Tool"));
    const detail = String(raw.detail ?? raw.description ?? raw.message ?? raw.note ?? raw.output ?? '');
    return {
      id: raw.id ? String(raw.id) : `activity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: type,
      name,
      command,
      path,
      detail,
      output: String(raw.output ?? ''),
      status: String(raw.status ?? 'running'),
      url: safeUrl(raw.url ?? ''),
      raw
    };
  }

  function normalizeArtifact(raw, kind = 'file') {
    if (typeof raw === 'string') {
      return { path: raw, name: baseName(raw), url: '', kind, demo: false };
    }
    if (!raw || typeof raw !== 'object') return null;
    const path = String(raw.path ?? raw.file ?? raw.name ?? raw.filename ?? '');
    const url = safeUrl(raw.url ?? raw.preview ?? raw.href ?? '');
    if (!path && !url) return null;
    return {
      path,
      name: String(raw.name ?? baseName(path) ?? "File"),
      url,
      title: String(raw.title ?? raw.name ?? path ?? "Artifact"),
      kind,
      note: String(raw.note ?? raw.description ?? ''),
      demo: Boolean(raw.demo)
    };
  }

  function normalizePermission(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const source = raw.permission && typeof raw.permission === 'object' ? { ...raw, ...raw.permission } : raw;
    const input = source.input && typeof source.input === 'object' ? source.input : {};
    const diff = typeof source.diff === 'string' ? source.diff : (source.diff ? textValue(source.diff) : '');
    return {
      id: source.id ?? source.permission_id ?? source.request_id ?? null,
      title: String(source.title ?? source.name ?? (source.command ? "Execute the command?" : "Allow action?")),
      description: String(source.description ?? source.summary ?? source.reason ?? source.message ?? ''),
      command: String(source.command ?? input.command ?? source.cmd ?? ''),
      path: String(source.path ?? input.path ?? input.file_path ?? source.file ?? ''),
      cwd: String(source.cwd ?? source.workspace ?? ''),
      category: String(source.category ?? source.permission_type ?? source.scope ?? "actions"),
      diff,
      lane: source.model === 'b' || source.lane === 'b' ? 'b' : 'a',
      chatId: source.chat_id ?? source.chatId ?? null,
      status: 'pending',
      demo: Boolean(source.demo),
      raw: source
    };
  }

  function permissionDetail(permission) {
    const value = permission.command || permission.path || permission.cwd;
    if (value) return value;
    if (permission.raw && typeof permission.raw === 'object') {
      try { return JSON.stringify(permission.raw, null, 2); } catch { return "Details not provided."; }
    }
    return "Details not provided by the server.";
  }

  /* ---------------------------------------------------------------------- */
  /* API-driven loading                                                    */