# Arena Desktop web backend, part 7 of 11: arena_agent.
# The genuine Arena Agent bridge: native sessions, record streams, ask-user
# and image-choice prompts, the agent run itself, and mirroring sandbox
# files into the local folder.
#
# Not a standalone module: arena/web/app.py runs the parts in order
# inside its own namespace, so names from earlier parts are in scope.

def _native_connected_slugs():
    try:
        items, error, _ = _fetch_arena_connectors()
    except Exception:
        return []
    if error or not items:
        return []
    try:
        off = {str(slug) for slug in (load_config().get("arena_connectors_off") or [])}
    except Exception:
        off = set()
    return [item["slug"] for item in items
            if item.get("connected") and item.get("slug") and item["slug"] not in off]


def _native_pat(session_id, timezone, start=False):
    """Mint or refresh the Trigger session PAT through Arena. Returns (pat, error)."""
    if start:
        data, error, _ = _arena_post_json(
            contracts.PATHS["chat_trigger_session"],
            {"sessionId": session_id, "timezone": timezone or native_agent.DEFAULT_TIMEZONE},
            timeout=35)
        if not error and isinstance(data, dict) and data.get("publicAccessToken"):
            return data["publicAccessToken"], None
        if error:
            return None, error
    data, error, _ = _arena_post_json(
        contracts.PATHS["chat_trigger_token"], {"sessionId": session_id}, timeout=35)
    if not error and isinstance(data, dict) and data.get("token"):
        return data["token"], None
    return None, error or "arena.ai did not return an agent access token"


def _native_headers(client, base):
    headers = dict(base)
    if client.cookie_str:
        headers["Cookie"] = client.cookie_str
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    return headers


def _native_append(client, trigger_address, pat, payload):
    """Append one input record to the agent session. Returns (seq|None, http_status)."""
    try:
        resp = requests.post(
            native_agent.in_url(contracts.ORIGIN, trigger_address),
            headers=_native_headers(client, native_agent.append_headers(pat)),
            json=payload, timeout=30)
    except requests.RequestException:
        return None, 0
    if resp.status_code != 200:
        return None, resp.status_code
    try:
        data = resp.json()
    except ValueError:
        return None, 200
    seq = data.get("seq") if isinstance(data, dict) else None
    return (seq if isinstance(seq, int) else None), 200


def _native_create_session(message, timezone, connectors, files=None):
    """Create the Arena agentic session with a direct API call (like Direct sends).

    Generator: may yield challenge events. Returns (bootstrap|None, error|None).

    The website attaches a ``cx`` client-interaction blob to this request.
    We never synthesize it: ``ENGINE.native_preflight`` asks the page's own
    client-interaction module to compute a genuine one for this submission
    (the same ``a(k())`` pair the site's evaluation submit runs, labelled
    "programmatic" by the site itself).  Creation tries the cx-bearing
    variants first when a blob is available, then cx-less ones, advancing
    only on HTTP 400; every attempt is logged with the response head.
    """
    if not ENGINE.wait_ready(30):
        return None, "arena.ai window is still loading"
    pre = ENGINE.native_preflight(native_agent.RECAPTCHA_V3_ACTION)
    cx = pre.get("cx")
    LOG.info("native create preflight: token_len=%s cx=%s",
             pre.get("token_len"), "genuine" if cx else "unavailable")
    variants = []
    if cx:
        variants += [("genuine-cx+connectors", cx, True), ("genuine-cx", cx, False)]
    variants += [("no-cx+connectors", None, True), ("no-cx", None, False)]
    attempt_headers = {"X-Agent-Browser-Attempt-Id": native_agent.new_uuid()}
    last_error = None
    checks_used = 0  # human checks shown across all variants (keep it humane)
    for label, cx_value, with_connectors in variants:
        v2_token = None
        rounds = 0
        while True:
            body = native_agent.build_create_body(
                message, timezone, connectors if with_connectors else None,
                v2_token=v2_token, cx=cx_value, files=files)
            v2_token = None
            if not ENGINE.wait_ready(30):
                return None, "arena.ai window is still loading"
            r = ENGINE.request(contracts.PATHS["create_chat"], body=body, method="POST",
                               timeout=120, v3_action=native_agent.RECAPTCHA_V3_ACTION,
                               headers=attempt_headers)
            text = r.text
            LOG.info("native create [%s]: HTTP %s %s", label, r.status_code,
                     " ".join((text or "").split())[:300])
            if r.status_code == 200:
                try:
                    payload = json.loads(text)
                except ValueError:
                    return None, "arena.ai returned an unexpected create-chat reply"
                boot = native_agent.parse_bootstrap(payload)
                if not boot["session_id"]:
                    return None, "arena.ai did not return an agent session id"
                LOG.info("native create [%s]: session %s", label, boot["session_id"])
                return boot, None
            err = contracts.classify_error(r.status_code, text if r.status_code else (r.error or ""),
                                           headers=getattr(r, "headers", None))
            if r.status_code == 0 and ENGINE.challenge == "cloudflare":
                err["code"] = "cloudflare"
            last_error = err.get("message") or f"HTTP {r.status_code}"
            rounds += 1
            if rounds > 2:
                break
            if err["code"] in ("challenge", "forbidden") and checks_used < 2:
                checks_used += 1
                ENGINE.request_human_check()
                yield _sse({"type": "challenge", "kind": "recaptcha",
                            "message": "arena.ai wants a quick human check. Tick the box in the "
                                       "arena.ai window; your message is resent right after."})
                token = yield from _wait_for(
                    lambda: ENGINE.take_v2_token() or (ENGINE.challenge != "recaptcha" and "closed"), 300)
                if token == "closed":
                    token = ENGINE.take_v2_token()
                if not token:
                    ENGINE.cancel_check()
                    return None, "The human check was not finished, so nothing was sent."
                yield _sse({"type": "challenge_done"})
                v2_token = token
                continue
            if err["code"] == "cloudflare":
                if ENGINE.ready():
                    ENGINE.show_cloudflare()
                yield _sse({"type": "challenge", "kind": "cloudflare",
                            "message": "arena.ai is showing a Cloudflare check. Finish it in the arena.ai window."})
                if not (yield from _wait_for(ENGINE.ready, 300)):
                    return None, "The Cloudflare check was not finished."
                yield _sse({"type": "challenge_done"})
                continue
            break  # validation/auth/rate-limit: try the next body variant
    return None, last_error or "arena.ai kept refusing the agent session"


def _native_cursor_max(local, remote):
    """The later of two .out stream cursors; never moves consumption back.

    The locally saved cursor points at the last record actually consumed
    (the previous turn's turn-complete record included), while the session
    snapshot's ``lastEventId`` can sit a few records earlier. Blindly
    adopting the snapshot value replays that stale tail into the next turn,
    whose first records then contain the OLD turn-complete — the v5.6.0
    "continued chat finishes instantly empty" bug. Trigger stream ids are
    time-ordered tokens, so same-shape ids compare lexicographically;
    numeric ids compare numerically. Incomparable shapes keep the local
    cursor, which reflects real consumption."""
    if not local:
        return remote
    if not remote or str(remote) == str(local):
        return local
    a, b = str(local), str(remote)
    if a.isdigit() and b.isdigit():
        return a if int(a) >= int(b) else b
    if len(a) == len(b):
        return max(a, b)
    return local


def _native_refresh_cursor(session_id):
    """Authoritative .out cursor from Arena's session snapshot.

    The website resumes a session exactly this way: GET /api/chat/{id}
    returns {messages, lastEventId, ...}.  Using the server cursor avoids
    both replaying the backlog and draining it record by record (draining
    an idle long-poll subscription is what made old chats look frozen).
    Best-effort: returns None on any problem.
    """
    data, error, _ = _arena_get_json(
        contracts.PATHS["chat_session"].format(
            session_id=urllib.parse.quote(str(session_id))), timeout=20)
    if error or not isinstance(data, dict):
        return None
    return history_sync.agentic_last_event_id(data)


def _iter_records_idle(resp, idle_seconds, should_stop=None):
    """Yield stream records, ending the cycle after `idle_seconds` of
    silence (or at once when should_stop() fires).

    The realtime endpoint may hold a caught-up subscription open with
    keepalives; a plain iter_lines loop would block the whole subscribe
    cycle — and the Stop button — on it.  Reading in a daemon thread lets
    the caller enforce an idle bound and react to Stop within a second.
    """
    q: "queue.Queue" = queue.Queue()

    def reader():
        try:
            for record in native_agent.iter_sse_records(resp.iter_lines(decode_unicode=True)):
                q.put(record)
        except Exception:
            pass
        q.put(None)

    threading.Thread(target=reader, daemon=True).start()
    idle = 0.0
    while True:
        if should_stop is not None and should_stop():
            return
        try:
            item = q.get(timeout=1.0)
        except queue.Empty:
            idle += 1.0
            if idle >= idle_seconds:
                return
            continue
        if item is None:
            return
        idle = 0.0
        yield item


def _native_ask_user_hitl(pending: dict):
    """Ask Arena Agent's structured questions in the desktop UI.

    Yields SSE lines and returns ``(output, display)``.  ``output`` is the
    exact object Arena expects in a data-tool-results part; ``None`` means
    the user stopped the turn, so the caller must not append anything.
    """
    chat_id = getattr(_tl, "chat_id", None) or pending.get("chat_id")
    entry = pending.get("entry") if isinstance(pending.get("entry"), dict) else {}
    questions = native_agent.ask_user_questions(pending.get("input"))
    if not questions:
        entry.update({"ok": True, "status": "skipped",
                      "question": "", "answer": "Skipped"})
        yield _sse({"type": "notice", "model": "a",
                    "text": "Arena Agent asked a question in a format Arena Desktop could not read; it was skipped."})
        return {"skipped": True, "answers": []}, {"skipped": True, "questions": []}

    entry.update({
        "tool": "ask_user",
        "summary": "Question: " + (" ".join(questions[0]["question"].split())[:120] or "…"),
        "status": "waiting",
        "questions": questions,
        "answers": [],
    })
    answers = []
    display_answers = []
    for question in questions:
        display_options = []
        by_display = {}
        for option in question["options"]:
            label = option["label"]
            if option.get("description"):
                label = f"{label} — {option['description']}"
            display_options.append(label)
            by_display[label] = option
            by_display[option["label"]] = option
        qid = generate_uuidv7()
        custom = bool(question.get("allowCustomResponse", True))
        with _questions_lock:
            _QUESTIONS[qid] = {
                "id": qid, "chat_id": chat_id, "kind": "question",
                "question": question["question"], "options": display_options,
                "custom": custom, "lane": "a", "subagent": None,
                "answer": None,
            }
        yield _sse({"type": "question", "id": qid, "lane": "a", "model": "a",
                    "kind": "question", "question": question["question"],
                    "options": display_options, "custom": custom,
                    "chat_id": chat_id, "subagent": None})
        _notify("Arena Desktop", "Arena Agent is waiting for your answer.", "question")
        answer_text = yield from _wait_for(
            lambda qid=qid: _question_answer(qid), QUESTION_TIMEOUT)
        with _questions_lock:
            _QUESTIONS.pop(qid, None)
        yield _sse({"type": "question_done", "id": qid, "lane": "a",
                    "answer": answer_text or ""})
        if _stopped():
            entry.update({"ok": False, "status": "cancelled",
                          "question": question["question"],
                          "options": display_options, "answer": ""})
            return None, {"cancelled": True, "questions": questions,
                          "answers": display_answers}
        if not answer_text:
            entry.update({"ok": True, "status": "skipped",
                          "question": "\n\n".join(q["question"] for q in questions),
                          "options": display_options, "answer": "Skipped",
                          "answers": display_answers})
            return {"skipped": True, "answers": []}, {
                "skipped": True, "questions": questions, "answers": display_answers}
        selected = by_display.get(str(answer_text))
        if selected:
            answers.append({
                "questionId": question["id"],
                "selectedOptionId": selected["id"],
                "customResponse": None,
            })
            display_answers.append(selected["label"])
        else:
            clean = str(answer_text).strip()[:2000]
            answers.append({
                "questionId": question["id"],
                "selectedOptionId": None,
                "customResponse": clean,
            })
            display_answers.append(clean)

    entry.update({
        "question": "\n\n".join(q["question"] for q in questions),
        "options": [option["label"] for q in questions for option in q["options"]],
        "answer": "\n".join(display_answers),
        "answers": answers,
        "status": "waiting",
        "ok": True,
    })
    return {"skipped": False, "answers": answers}, {
        "skipped": False, "questions": questions, "answers": display_answers}


def _native_image_choice_hitl(pending: dict):
    """Show native ``generate_image`` candidates and wait for one choice.

    Returns ``(server_output, public_choice)``.  A timeout follows Arena's
    own no-choice path: the first candidate is reported with
    ``selection_method: \"skip\"`` rather than leaving the durable session
    waiting forever.  Stop returns ``(None, public_choice)``.
    """
    chat_id = getattr(_tl, "chat_id", None) or pending.get("chat_id")
    entry = pending.get("entry") if isinstance(pending.get("entry"), dict) else {}
    choice = native_agent.image_choice_from_output(
        pending.get("output"), pending.get("input"))
    if not choice:
        entry.update({"ok": False, "status": "error"})
        yield _sse({"type": "notice", "model": "a",
                    "text": "Arena Agent generated image candidates in a format Arena Desktop could not read."})
        return None, {}
    choice_id = generate_uuidv7()
    public = _public_media_choice(
        choice, choice_id=choice_id,
        tool_call_id=pending.get("tool_call_id"), chat_id=chat_id)
    public["status"] = "awaiting_user_response"
    public["selected_index"] = None
    public["selection_method"] = ""
    entry.update({
        "tool": "generate_image",
        "summary": "Generate image" + (f": {public.get('prompt')}" if public.get("prompt") else ""),
        "status": "waiting",
        "ok": True,
        "media_choice": public,
    })
    with _media_choices_lock:
        _MEDIA_CHOICES[choice_id] = {
            "id": choice_id, "chat_id": chat_id,
            "tool_call_id": pending.get("tool_call_id"),
            "media_choice": copy.deepcopy(public), "answer": None,
        }
    yield _sse({"type": "media_choice", "id": choice_id, "model": "a",
                "lane": "a", "chat_id": chat_id,
                "tool_call_id": pending.get("tool_call_id"),
                "media_choice": copy.deepcopy(public)})
    _notify("Arena Desktop", "Arena Agent is waiting for you to choose an image.", "question")
    answer = yield from _wait_for(
        lambda choice_id=choice_id: _media_choice_answer(choice_id), QUESTION_TIMEOUT)
    with _media_choices_lock:
        _MEDIA_CHOICES.pop(choice_id, None)
    candidate_indexes = [item.get("index") for item in public.get("candidates") or []
                         if isinstance(item, dict)]
    if _stopped():
        public["status"] = "cancelled"
        entry.update({"ok": False, "status": "cancelled", "media_choice": public})
        yield _sse({"type": "media_choice_done", "id": choice_id, "model": "a",
                    "tool_call_id": pending.get("tool_call_id"),
                    "media_choice": copy.deepcopy(public)})
        return None, public
    if not answer:
        selected_index = candidate_indexes[0] if candidate_indexes else 0
        selection_method = "skip"
    else:
        selected_index = answer.get("selected_index")
        if selected_index not in candidate_indexes:
            selected_index = candidate_indexes[0] if candidate_indexes else 0
            selection_method = "skip"
        else:
            selection_method = "skip" if answer.get("selection_method") == "skip" else "user"
    public.update({
        "status": "completed",
        "selected_index": selected_index,
        "selection_method": selection_method,
    })
    entry.update({"media_choice": public, "status": "waiting", "ok": True})
    server_candidates = []
    for candidate in choice.get("candidates") or []:
        clean = {"index": candidate.get("index", 0)}
        if candidate.get("hash"):
            clean["hash"] = candidate["hash"]
        server_candidates.append(clean)
    server_output = {
        "status": "completed",
        "candidates": server_candidates,
        "selected_index": selected_index,
        "file_path": choice.get("file_path") or "",
        "selection_method": selection_method,
    }
    if choice.get("attribution"):
        server_output["attribution"] = choice["attribution"]
    return server_output, public


def _native_apply_media_reveal(result: dict, event: dict) -> Optional[dict]:
    """Persist a model reveal onto the matching generate_image tool entry."""
    attribution = event.get("attribution") or []
    if not attribution:
        return None
    tools = result.get("tools") if isinstance(result, dict) else []
    wanted = str(event.get("tool_call_id") or "")
    fallback = None
    for entry in tools or []:
        if not isinstance(entry, dict) or not isinstance(entry.get("media_choice"), dict):
            continue
        fallback = entry
        if wanted and entry["media_choice"].get("tool_call_id") == wanted:
            fallback = entry
            break
    if fallback is None:
        return None
    return _apply_media_attribution(fallback["media_choice"], attribution)


def _native_drain_cursor(client, session_id, trigger_address, pat, timezone, max_cycles=3):
    """Advance past the backlog of an imported session's .out stream.

    Returns (last_event_id, pat). Subscribes without a cursor and discards
    records until a cycle brings nothing new, so the next turn streams only
    fresh output. Best-effort: any failure simply returns what was
    collected — a partly replayed backlog is annoying, a blocked chat
    would be worse.
    """
    cursor = None
    for _ in range(max_cycles):
        headers = native_agent.stream_headers(pat, cursor)
        headers["Timeout-Seconds"] = "20"  # draining must stay quick
        try:
            resp = requests.get(
                native_agent.out_url(contracts.ORIGIN, trigger_address),
                headers=_native_headers(client, headers),
                stream=True, timeout=(15, 60))
        except requests.RequestException:
            break
        if resp.status_code in (401, 403):
            resp.close()
            pat, _ = _native_pat(session_id, timezone, start=False)
            if not pat:
                break
            continue
        if resp.status_code != 200:
            resp.close()
            break
        got = False
        try:
            for record in _iter_records_idle(resp, 15, _stopped):
                got = True
                if record.get("id"):
                    cursor = record["id"]
                new_pat = native_agent.refreshed_pat(record)
                if new_pat:
                    pat = new_pat
        except requests.RequestException:
            pass
        finally:
            resp.close()
        if not got:
            break  # an empty cycle means we are at the stream head
    return cursor, pat


def _native_agent_run(client, message: str, existing: dict, timezone, result=None, files=None, sync=False):
    """Run one native Arena Agent turn. Yields SSE events; returns a result dict.

    The PAT lives only in memory; the persisted state is
    {backend, session_id, trigger_address, last_event_id, needs_drain}.

    ``result`` may be supplied by the caller: it is mutated as the turn
    progresses (native coordinates the moment they are known, the stream
    cursor on every record) so the caller can persist the chat from a
    finally-block even when the generator is closed early — a Stop or a
    disconnected client must never lose the session, or the next message
    would start a brand-new chat instead of continuing this one.
    """
    if result is None:
        result = {"text": "", "reasoning": "", "tools": [], "files": [], "native": None, "error": None}
    nat = (existing or {}).get("native") or {}
    session_id = nat.get("session_id")
    trigger_address = nat.get("trigger_address")
    last_event_id = nat.get("last_event_id")
    needs_drain = bool(nat.get("needs_drain"))
    connectors = _native_connected_slugs()
    pat = None
    # Workspace Sync: copy the agent's file writes into the chosen local folder.
    sync_root = _chosen_ws() if sync else None
    result.setdefault("previews", [])

    def publish_native():
        if session_id:
            result["native"] = {
                "backend": "arena",
                "session_id": session_id,
                "trigger_address": trigger_address,
                "last_event_id": last_event_id,
                "needs_drain": needs_drain,
                # Workspace Sync file-bridge state survives across turns.
                "file_sync_ok": nat.get("file_sync_ok"),
                "synced_files": nat.get("synced_files") or {},
            }

    def fail(message_text, code="native_agent", retry=True):
        result["error"] = message_text
        return _sse({"type": "error", "code": code, "retry": retry, "message": message_text})

    if not session_id:
        if not _engine_on():
            yield fail("Native Arena Agent works in the desktop app: "
                       "creating a session needs the arena.ai window.", code="engine_required", retry=False)
            return result
        boot, error = yield from _native_create_session(message, timezone, connectors, files=files)
        if error:
            yield fail(error)
            return result
        session_id = boot["session_id"]
        trigger_address = boot["trigger_address"]
        pat = boot["pat"]
        needs_drain = False
        publish_native()  # coordinates must survive even an immediate Stop
        if not trigger_address:
            data, gerr, _ = _arena_get_json(
                contracts.PATHS["chat_session"].format(
                    session_id=urllib.parse.quote(str(session_id))), timeout=35)
            if not gerr and isinstance(data, dict):
                trigger_address = data.get("triggerAddress")
            trigger_address = trigger_address or session_id
        if not pat:
            pat, perr = _native_pat(session_id, timezone, start=True)
            if not pat:
                yield fail(perr or "Could not get an agent session token.")
                return result
        publish_native()  # trigger_address may have been resolved above
    else:
        if not trigger_address:
            trigger_address = session_id
        publish_native()
        if not _engine_on():
            yield fail("Native Arena Agent works in the desktop app: "
                       "sending needs the arena.ai window.", code="engine_required", retry=False)
            return result
        # Direct append, like the website's transport: a fresh genuine cx in
        # the turn metadata when the page can mint one, plain otherwise.
        pre = ENGINE.native_preflight(native_agent.RECAPTCHA_V3_ACTION)
        pat, perr = _native_pat(session_id, timezone, start=True)
        if not pat:
            yield fail(perr or "Could not get an agent session token.")
            return result
        if needs_drain or not last_event_id:
            # Old/imported session: resume the way the website does — take
            # the authoritative cursor from the session snapshot. Only if
            # the snapshot has none do we drain the backlog (bounded).
            yield _sse({"type": "agent", "stage": "Continuing the existing Arena session…"})
            fresh = _native_refresh_cursor(session_id)
            if fresh:
                last_event_id = _native_cursor_max(last_event_id, fresh)
                needs_drain = False
                publish_native()
                LOG.info("native resume: cursor from session snapshot (%s)", fresh)
        if needs_drain and not last_event_id:
            # Imported cloud session: its .out stream still holds the whole
            # past transcript. Skip to the current head first, so old
            # records are not replayed into the new reply.
            last_event_id, pat = _native_drain_cursor(
                client, session_id, trigger_address, pat, timezone)
            needs_drain = False
            publish_native()
            LOG.info("native resume: drained imported session to cursor %s", last_event_id)
        payload = native_agent.build_append_body(message, trigger_address, timezone,
                                                 connectors, cx=pre.get("cx"), files=files)
        _, status = _native_append(client, trigger_address, pat, payload)
        if status in (401, 403):
            pat, _ = _native_pat(session_id, timezone, start=False)
            if pat:
                _, status = _native_append(client, trigger_address, pat, payload)
        if status == 404:
            pat, _ = _native_pat(session_id, timezone, start=True)
            if pat:
                _, status = _native_append(client, trigger_address, pat, payload)
        LOG.info("native append: HTTP %s (cx=%s)", status, "genuine" if pre.get("cx") else "none")
        if status != 200:
            yield fail(f"Could not send the message to the agent (HTTP {status}).")
            return result

    yield _sse({"type": "agent", "stage": "Arena Agent · session active"})
    tool_names: dict = {}
    tool_entries: dict = {}
    tool_inputs: dict = {}
    pending_hitl: list = []
    current_message_id = None
    current_node_id = None
    hitl_pause = {"since": None, "now": False}
    turn_done = False
    saw_record = False
    # Stale-tail guard: a rewound cursor replays the previous turn's tail
    # (finish + turn-complete) before the new turn's own records. Only a
    # turn that has actually begun (start / start-step) or produced content
    # chunks may be ended by a turn-complete / settled stream.
    turn_started = False
    turn_content_seen = False
    last_activity = time.monotonic()
    deadline = time.monotonic() + 1800
    cycles = 0

    def stream_should_stop():
        if _stopped() or hitl_pause.get("now"):
            return True
        since = hitl_pause.get("since")
        # Give records that are already queued for the same model step a
        # brief chance to arrive (a finish-step or another HITL call), then
        # close this subscribe cycle so the user can be asked promptly.
        return bool(since is not None and time.monotonic() - since >= 2)

    def process_pending_hitl():
        """Answer every waiting Arena capability, append the results to the
        same durable session, and reset the subscribe state for its reply."""
        nonlocal pat, turn_done, saw_record, last_activity, deadline, cycles
        nonlocal turn_started, turn_content_seen
        batch = list(pending_hitl)
        pending_hitl.clear()
        hitl_pause.update({"since": None, "now": False})
        if not batch:
            return True
        results = []
        for pending in batch:
            entry = pending.get("entry") if isinstance(pending.get("entry"), dict) else {}
            if _stopped():
                entry.update({"ok": False, "status": "cancelled"})
                return False
            tool_name = pending.get("tool")
            if tool_name == "ask_user":
                output, display = yield from _native_ask_user_hitl(pending)
                pending["display"] = display
            elif tool_name == "generate_image":
                output, public = yield from _native_image_choice_hitl(pending)
                pending["public_choice"] = public
            else:
                entry.update({"ok": False, "status": "error"})
                yield _sse({"type": "notice", "model": "a",
                            "text": (f"Arena Agent is waiting for a {tool_name or 'tool'} response, "
                                     "but Arena Desktop cannot answer that prompt in the app yet. "
                                     "The Arena session is saved so it can be continued on arena.ai.")})
                return False
            if output is None:
                return False
            if not pending.get("request_node_id"):
                entry.update({"ok": False, "status": "error"})
                yield fail("Arena Agent asked for input, but its stream did not identify the request. "
                           "The session is saved; it can be continued on arena.ai.")
                return False
            pending["output"] = output
            results.append({
                "requestNodeId": pending.get("request_node_id"),
                "tool": tool_name,
                "toolCallId": pending.get("tool_call_id"),
                "output": output,
            })
        if _stopped() or not results:
            return False

        cx = None
        if _engine_on():
            try:
                preflight = ENGINE.native_preflight(native_agent.RECAPTCHA_V3_ACTION)
                cx = (preflight or {}).get("cx")
            except Exception:
                LOG.exception("native HITL: preflight failed")
        payload = native_agent.build_hitl_append_body(
            results, trigger_address, timezone, connectors, cx=cx)
        _, append_status = _native_append(client, trigger_address, pat, payload)
        if append_status in (401, 403):
            pat, _ = _native_pat(session_id, timezone, start=False)
            if pat:
                _, append_status = _native_append(client, trigger_address, pat, payload)
        if append_status == 404:
            pat, _ = _native_pat(session_id, timezone, start=True)
            if pat:
                _, append_status = _native_append(client, trigger_address, pat, payload)
        LOG.info("native HITL append: HTTP %s tools=%s cx=%s", append_status,
                 ",".join(item["tool"] for item in results), "genuine" if cx else "none")
        if append_status != 200:
            for pending in batch:
                entry = pending.get("entry") if isinstance(pending.get("entry"), dict) else {}
                entry.update({"ok": False, "status": "error"})
                public = pending.get("public_choice") or {}
                if public:
                    public["status"] = "error"
                    entry["media_choice"] = public
                    yield _sse({"type": "media_choice_done", "id": public.get("id"),
                                "model": "a", "tool_call_id": pending.get("tool_call_id"),
                                "media_choice": copy.deepcopy(public)})
            yield fail(f"Could not send your answer to Arena Agent (HTTP {append_status}). "
                       "The session is saved.")
            return False

        for pending in batch:
            entry = pending.get("entry") if isinstance(pending.get("entry"), dict) else {}
            entry.update({"ok": True, "status": "ok"})
            if pending.get("tool") == "ask_user":
                display = pending.get("display") or {}
                output_text = ("Skipped" if display.get("skipped")
                               else "\n".join(display.get("answers") or []))
            elif pending.get("tool") == "generate_image":
                public = pending.get("public_choice") or {}
                output_text = f"Selected image {(public.get('selected_index') or 0) + 1}"
            else:
                output_text = ""
            yield _sse({
                "type": "tool_result", "id": pending.get("tool_call_id"),
                "tool": pending.get("tool"),
                "name": native_agent.tool_display_name(pending.get("tool")),
                "model": "a", "rel": native_agent.tool_display_name(pending.get("tool")),
                "ok": True, "status": "ok", "output": output_text,
            })
            public = pending.get("public_choice") or {}
            if public:
                yield _sse({"type": "media_choice_done", "id": public.get("id"),
                            "model": "a", "tool_call_id": pending.get("tool_call_id"),
                            "media_choice": copy.deepcopy(public)})
        turn_done = False
        saw_record = False
        turn_started = False
        turn_content_seen = False
        last_activity = time.monotonic()
        deadline = time.monotonic() + 1800
        cycles = 0
        publish_native()
        return True
    while not turn_done and cycles < 24 and time.monotonic() < deadline:
        cycles += 1
        if _stopped():
            _native_append(client, trigger_address, pat, native_agent.STOP_BODY)
            yield _sse({"type": "notice", "text": "Stopped."})
            break
        try:
            resp = requests.get(
                native_agent.out_url(contracts.ORIGIN, trigger_address),
                headers=_native_headers(client, native_agent.stream_headers(pat, last_event_id)),
                stream=True, timeout=(15, 150))
        except requests.RequestException:
            time.sleep(2)
            continue
        if resp.status_code in (401, 403):
            resp.close()
            pat, _ = _native_pat(session_id, timezone, start=False)
            if not pat:
                yield fail("The agent session token expired and did not refresh.")
                break
            continue
        if resp.status_code == 404:
            resp.close()
            pat, _ = _native_pat(session_id, timezone, start=True)
            if not pat:
                yield fail("The agent session was not found on Arena.")
                break
            continue
        if resp.status_code != 200:
            status = resp.status_code
            resp.close()
            if cycles >= 3:
                yield fail(f"The agent stream is unavailable (HTTP {status}).")
                break
            time.sleep(2)
            continue
        settled = resp.headers.get("X-Session-Settled") == "true"
        version = resp.headers.get("X-Stream-Version") or "v1"
        got_record = False
        cycle_records = 0
        try:
            for record in _iter_records_idle(resp, 120, stream_should_stop):
                got_record = True
                saw_record = True
                last_activity = time.monotonic()
                cycle_records += 1
                if record.get("id"):
                    last_event_id = record["id"]
                    if result.get("native"):
                        result["native"]["last_event_id"] = last_event_id
                new_pat = native_agent.refreshed_pat(record)
                if new_pat:
                    pat = new_pat
                chunk = record.get("chunk")
                message_id, node_id = native_agent.message_ids_from_chunk(chunk)
                if isinstance(chunk, dict) and chunk.get("type") == "start":
                    # A new assistant UIMessage must not inherit the previous
                    # message's request node if this one has not named its own.
                    current_message_id = message_id
                    current_node_id = node_id
                elif message_id:
                    current_message_id = message_id
                if node_id:
                    current_node_id = node_id
                    for pending in pending_hitl:
                        if pending.get("message_id") == current_message_id:
                            pending["request_node_id"] = node_id
                if isinstance(chunk, dict) and chunk.get("type") == "tool-input-available":
                    call_id = str(chunk.get("toolCallId") or "")
                    if call_id:
                        tool_inputs[call_id] = chunk.get("input")
                if isinstance(chunk, dict) and not native_agent.is_control(chunk):
                    chunk_type = str(chunk.get("type") or "")
                    if chunk_type in ("start", "start-step"):
                        turn_started = True
                        turn_content_seen = True
                    elif chunk_type in ("finish", "finish-step"):
                        if turn_started:
                            turn_content_seen = True
                    elif chunk_type and chunk_type not in ("message-metadata", "raw"):
                        turn_content_seen = True
                if native_agent.is_turn_complete_record(record):
                    if not turn_content_seen and not pending_hitl:
                        # A turn-complete replayed from before this turn's own
                        # records (rewound cursor): the new reply has not
                        # started yet, so this cannot be its end.
                        LOG.info("native stream: ignoring stale turn-complete before new-turn content")
                        continue
                    LOG.info("native stream: turn-complete record received")
                    if pending_hitl:
                        hitl_pause["now"] = True
                    else:
                        turn_done = True
                    break
                if pending_hitl and isinstance(chunk, dict) and chunk.get("type") in ("finish-step", "finish"):
                    hitl_pause["now"] = True
                    break
                if native_agent.is_control(chunk):
                    continue
                for event in native_agent.map_chunk(chunk, tool_names):
                    if event["type"] == "text":
                        result["text"] += event["text"]
                    elif event["type"] == "reasoning":
                        result["reasoning"] += event["text"]
                    elif event["type"] == "tool_call":
                        entry = {"tool": event["tool"], "summary": event["summary"],
                                 "tool_call_id": event.get("id") or None,
                                 "input": str(event.get("path") or "")[:2000] or None,
                                 "lane": "a", "diff": None, "ok": True, "status": "running"}
                        result["tools"].append(entry)
                        if event.get("id"):
                            tool_entries[event["id"]] = entry
                    elif event["type"] == "tool_result":
                        entry = tool_entries.get(event.get("id") or "")
                        if entry is not None:
                            entry["ok"] = event["ok"]
                            entry["status"] = event["status"]
                            entry["output"] = _history_output(event.get("output"))
                        if sync_root is not None and event.get("ok"):
                            call = str(event.get("id") or "")
                            yield from _native_mirror(event.get("tool") or (entry or {}).get("tool"),
                                                      tool_inputs.get(call), nat, sync_root)
                        for url in _ARENA_SITE.findall(json.dumps(chunk.get("output"), default=str)):
                            if url not in result["previews"]:
                                result["previews"].append(url)
                                yield _sse({"type": "preview", "model": "a", "url": url, "title": "Site preview"})
                    elif event["type"] == "hitl_wait":
                        call_id = str(event.get("tool_call_id") or event.get("id") or "")
                        entry = tool_entries.get(call_id)
                        if entry is not None:
                            entry["status"] = "waiting"
                            entry["tool"] = event.get("tool") or entry.get("tool")
                        pending_hitl.append({
                            "tool": event.get("tool"),
                            "tool_call_id": call_id,
                            "input": copy.deepcopy(tool_inputs.get(call_id)),
                            "output": copy.deepcopy(event.get("output") or {}),
                            "request_node_id": current_node_id or current_message_id,
                            "message_id": current_message_id,
                            "entry": entry,
                            "chat_id": getattr(_tl, "chat_id", None),
                        })
                        if hitl_pause.get("since") is None:
                            hitl_pause["since"] = time.monotonic()
                        continue  # internal event: the UI gets question/media_choice below
                    elif event["type"] == "media_choice_done":
                        call_id = str(event.get("tool_call_id") or event.get("id") or "")
                        entry = tool_entries.get(call_id)
                        incoming = _public_media_choice(
                            event.get("media_choice") or {}, tool_call_id=call_id,
                            chat_id=getattr(_tl, "chat_id", None))
                        if entry is not None:
                            existing_choice = entry.get("media_choice") if isinstance(entry.get("media_choice"), dict) else {}
                            merged_choice = dict(existing_choice)
                            for key, value in incoming.items():
                                if value not in (None, "", [], {}):
                                    merged_choice[key] = value
                            merged_choice = _apply_media_attribution(
                                merged_choice, incoming.get("attribution") or [])
                            entry["media_choice"] = merged_choice
                            event = dict(event, id=merged_choice.get("id") or event.get("id"),
                                         media_choice=copy.deepcopy(merged_choice))
                        else:
                            event = dict(event, media_choice=incoming)
                    elif event["type"] == "media_reveal":
                        updated_choice = _native_apply_media_reveal(result, event)
                        if updated_choice is not None:
                            event = dict(event, id=updated_choice.get("id") or event.get("id"),
                                         media_choice=copy.deepcopy(updated_choice))
                    elif event["type"] == "media" and event.get("url"):
                        known = {item["url"] for item in result["files"]}
                        if event["url"] not in known:
                            result["files"].append({
                                "url": event["url"],
                                "title": event.get("title") or "Agent file",
                                "kind": event.get("kind") or "file",
                            })
                    yield _sse(event)
                if _stopped():
                    _native_append(client, trigger_address, pat, native_agent.STOP_BODY)
                    yield _sse({"type": "notice", "text": "Stopped."})
                    turn_done = True
                    break
        except requests.RequestException:
            pass  # resubscribe from the cursor below
        finally:
            resp.close()
        LOG.info("native stream: cycle %s version=%s settled=%s records=%s done=%s pending=%s",
                 cycles, version, settled, cycle_records, turn_done, len(pending_hitl))
        if pending_hitl:
            answered = yield from process_pending_hitl()
            if not answered:
                if _stopped():
                    _native_append(client, trigger_address, pat, native_agent.STOP_BODY)
                    yield _sse({"type": "notice", "text": "Stopped."})
                turn_done = True
            continue
        if not turn_done and settled and not got_record:
            if turn_content_seen:
                # The session reports itself settled (nothing running) and
                # no new records arrived: the turn is over even if the
                # explicit turn-complete record was missed. The records are
                # durable and the cursor is saved, so nothing is lost.
                LOG.info("native stream: settled after activity; ending the turn")
                turn_done = True
            else:
                time.sleep(2)  # the run may still be booting
        if not turn_done and not turn_content_seen and time.monotonic() - last_activity > 360:
            # Six minutes without a single record: do not spin subscribe
            # cycles for half an hour (the "old chat hangs forever" look).
            # The session state is saved by the caller either way.
            yield fail("The agent has not started responding in this session — the previous turn may still be "
                       "running on Arena. The session is saved; try again a little later.")
            break
    if not turn_done and not _stopped() and result["error"] is None and cycles >= 24:
        yield fail("The agent did not finish the turn in time. The session is saved — "
                   "the next message will pick it up.")
    publish_native()
    return result


_SANDBOX_HOMES = ("/home/user", "/workspace", "/mnt/data", "/mnt/user-data")
_MIRROR_SKIP_DIRS = {"node_modules", ".git", "__pycache__", ".venv", "venv", ".next", ".cache"}
_HEREDOC_HEAD = re.compile(
    r"cat\s+(?:>\s*(?P<p1>[^\s<>|;&]+)\s*<<-?\s*(?P<q1>['\"]?)(?P<t1>[A-Za-z_]\w*)(?P=q1)"
    r"|<<-?\s*(?P<q2>['\"]?)(?P<t2>[A-Za-z_]\w*)(?P=q2)\s*>\s*(?P<p2>[^\s<>|;&]+))[^\n]*\n")
# Live site links an answer may contain: Arena Agent deploys (*.arena.site)
# and Code-mode sandbox previews (e.g. https://3000-<id>.e2b.app).
_ARENA_SITE = re.compile(r"https://(?:[a-z0-9-]+\.arena\.site|\d{2,5}-[a-z0-9]+\.e2b\.(?:app|dev))(?:/[^\s\"'<>)\]`]*)?", re.I)


def _site_links(text: str, limit: int = 5) -> list:
    """Live site URLs in a reply, in order, without duplicates or trailing punctuation."""
    found = []
    for url in _ARENA_SITE.findall(text or ""):
        url = url.rstrip(".,;:!?")
        if url not in found:
            found.append(url)
    return found[:limit]


def _sandbox_rel(path, cwd=None):
    """Map a path in Arena Agent's cloud sandbox to one relative to the local
    folder; None for system paths outside the agent's home or for bulky
    dependency folders (node_modules, .git ...)."""
    import posixpath
    p = str(path or "").replace("\\", "/").strip().strip("'\"")
    base = str(cwd or "/home/user").replace("\\", "/").strip().strip("'\"")
    if not p:
        return None
    if p == "~" or p.startswith("~/"):
        p = "/home/user" + p[1:]
    if base == "~" or base.startswith("~/"):
        base = "/home/user" + base[1:]
    if not base.startswith("/"):
        base = "/home/user/" + base
    if not p.startswith("/"):
        p = base.rstrip("/") + "/" + p
    p = posixpath.normpath(p)
    for home in _SANDBOX_HOMES:
        if p.startswith(home + "/"):
            rel = p[len(home) + 1:]
            break
    else:
        return None
    parts = rel.split("/")
    if not rel or ".." in parts or any(seg in _MIRROR_SKIP_DIRS for seg in parts[:-1]):
        return None
    return rel


def _heredoc_writes(command: str):
    """Files a shell command writes with `cat > f << 'EOF' ... EOF` (the way
    agents often create files): [(path, content, cwd)]. Unquoted heredocs
    whose body the shell would expand ($VAR, backticks) are skipped."""
    found, pos = [], 0
    while True:
        m = _HEREDOC_HEAD.search(command or "", pos)
        if not m:
            return found
        tag = m.group("t1") or m.group("t2")
        quoted = bool(m.group("q1") or m.group("q2"))
        end = re.compile(r"^[ \t]*" + re.escape(tag) + r"[ \t]*$", re.M).search(command, m.end())
        if not end:
            return found
        body = command[m.end():end.start()]
        if quoted or not re.search(r"[$`]", body):
            cds = re.findall(r"(?:^|&&|;|\n)\s*cd\s+([^\s;&|]+)", command[:m.start()])
            found.append(((m.group("p1") or m.group("p2")), body, cds[-1] if cds else None))
        pos = end.end()


def _native_mirror(tool, tool_input, nat, root):
    """Workspace Sync for Arena Agent's own file tools: each write, edit and
    delete it makes in its cloud sandbox is copied into the local folder as it
    happens. Same safety as the Code-mode mirror: one permission per chat, and
    a file changed on this computer is never overwritten or deleted.
    Yields SSE events; returns the relative paths saved."""
    if root is None or not tool_input:
        return []
    args = tool_input
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except ValueError:
            args = {}
    args = args if isinstance(args, dict) else {}
    op = contracts.sandbox_op({"toolName": str(tool or "tool"), "input": args})
    ops = []
    if op.get("kind") in ("write", "edit", "delete"):
        rel = _sandbox_rel(op.get("path"))
        if rel:
            ops.append(dict(op, rel=rel))
    elif op.get("kind") == "run":
        for path, body, cwd in _heredoc_writes(str(args.get("command") or args.get("cmd") or "")):
            rel = _sandbox_rel(path, cwd)
            if rel:
                ops.append({"kind": "write", "rel": rel, "content": body})
    if not ops:
        return []
    if nat.get("file_sync_ok") is None:
        info = {"tool": "write_file", "inside": True, "path": str(root), "rel": ".", "model": "a",
                "summary": f"Copy the files Arena Agent writes into {root.name}"}
        nat["file_sync_ok"] = (yield from _permit(_perm_mode(), "write_file", info)) == "allow"
    if not nat.get("file_sync_ok"):
        return []
    man = _sync_load(root)
    saved = []
    for op in ops:
        try:
            target = workspace._inside(root, op["rel"])
            rel = target.relative_to(root).as_posix()
            current = target.read_bytes() if target.is_file() else None
            if target.exists() and not target.is_file():
                raise ValueError(f"{rel} is a folder on this computer")
            if current is not None and (rel not in man or _digest(current) != man[rel]):
                raise PermissionError(f"{rel} has changes made on this computer, so it was left as is")
            if op["kind"] == "delete":
                if current is not None:
                    info = {"tool": "delete", "inside": True, "path": str(target), "rel": rel, "model": "a",
                            "summary": f"Delete {rel} (Arena Agent deleted it)"}
                    if (yield from _permit(_perm_mode(), "delete", info)) != "allow":
                        continue
                    target.unlink()
                man.pop(rel, None)
                saved.append(rel)
                continue
            if op["kind"] == "edit":
                old = (current or b"").decode("utf-8", errors="replace")
                if current is None or op["old"] not in old:
                    raise ValueError(f"{rel} could not be updated: the local copy differs from Arena's")
                data = old.replace(op["old"], op["new"], 1).encode("utf-8")
            else:
                data = str(op.get("content") or "").encode("utf-8")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            man[rel] = _digest(data)
            saved.append(rel)
        except (OSError, ValueError) as e:
            yield _sse({"type": "notice", "model": "a", "text": f"Workspace Sync: {e}"})
    _sync_save(root, man)
    for rel in saved:
        if rel.lower().endswith((".html", ".htm")) and (root / rel).is_file():
            yield _sse({"type": "file_preview", "model": "a", "path": rel, "html": True})
    if saved:
        yield _sse({"type": "files_written", "model": "a", "root": str(root), "written": saved,
                    "deleted": [], "files": [{"path": rel, "name": rel.rsplit("/", 1)[-1],
                                              "note": f"Saved to {root.name}"} for rel in saved]})
    return saved


def _native_file_bridge(files, native_state):
    """Workspace Sync for the native Arena Agent: download the files it
    created in Arena's cloud workspace into the folder picked on this
    computer. One-way (never deletes), hash-deduped across turns, one
    permission decision per chat. Yields SSE events; returns names written."""
    written = []
    if not files:
        return written
    root = _chosen_ws()
    if root is None:
        names = ", ".join(str(f.get("title") or "file") for f in files[:3])
        yield _sse({"type": "notice", "model": "a",
                    "text": f"Arena Agent created file(s): {names}. Choose a folder on this "
                            "computer to have them downloaded automatically (Workspace Sync)."})
        return written
    if native_state.get("file_sync_ok") is None:
        info = {"tool": "write_file", "inside": True, "path": str(root),
                "summary": f"Download {len(files)} file(s) from Arena Agent into {root.name}"}
        native_state["file_sync_ok"] = (yield from _permit(_perm_mode(), "write_file", info)) == "allow"
    if not native_state.get("file_sync_ok"):
        return written
    synced = dict(native_state.get("synced_files") or {})
    for item in files:
        name = Path(str(item.get("title") or "")).name
        if not name or name in (".", ".."):
            name = "agent-file"
        try:
            r = _media_get(item["url"], timeout=120)
            r.raise_for_status()
            content = r.content
        except (requests.RequestException, OSError, ValueError) as e:
            yield _sse({"type": "notice", "model": "a",
                        "text": f"Could not download {name} from Arena Agent: {e}"})
            continue
        if len(content) > 50 * 1024 * 1024:
            yield _sse({"type": "notice", "model": "a",
                        "text": f"{name} is over 50 MB and was not downloaded."})
            continue
        digest = hashlib.sha256(content).hexdigest()
        target = root / name
        if synced.get(name) == digest and target.exists():
            continue
        try:
            root.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        except OSError as e:
            yield _sse({"type": "notice", "model": "a",
                        "text": f"Could not save {name}: {e}"})
            continue
        synced[name] = digest
        written.append(name)
    native_state["synced_files"] = synced
    if written:
        yield _sse({"type": "files_written", "model": "a", "root": str(root),
                    "written": written, "deleted": []})
        yield _sse({"type": "notice", "model": "a",
                    "text": f"Saved {len(written)} file(s) from Arena Agent to {root}"})
    return written
