# Arena Desktop web backend, part 5 of 11: stream.
# arena.ai cloud chat history, SSE plumbing (_sse, _sse_wrap), the per-chat
# workspace folder, raw sends, live previews, Code-mode sandbox mirroring
# and the stream parser (_line_events).
#
# Not a standalone module: arena/web/app.py runs the parts in order
# inside its own namespace, so names from earlier parts are in scope.

# ---------- arena.ai account history (cloud chats) ----------

_TITLE_LEADIN = re.compile(
    r"^(?:(?:please|pls|hey|hi|hello|ok|okay|so)[,!.]?\s+|(?:can|could|would|will) you\s+|"
    r"i (?:want|need|would like)(?: you)? to\s+|help me(?: to)?\s+|let'?s\s+|i want\s+)+", re.I)


def _smart_title(text: str) -> str:
    """Short sidebar title from the first message, used until Arena names the chat."""
    flat = " ".join(str(text or "").split())
    flat = re.sub(r"https?://\S+", "", flat).strip()
    first = re.split(r"(?<=[.!?])\s", flat, maxsplit=1)[0] if flat else ""
    first = _TITLE_LEADIN.sub("", first).strip(" .!?,:;-\"'")
    words = first.split()
    if not words:
        return "New chat"
    title = " ".join(words[:8]) + ("…" if len(words) > 8 else "")
    return (title[:1].upper() + title[1:])[:60]


def _schedule_arena_title(chat_id: str) -> None:
    """Swap the provisional title for the summary title Arena generates for the
    conversation (the one arena.ai shows in its own sidebar), once it exists."""
    def work():
        for delay in (8, 20, 45, 90):
            time.sleep(delay)
            data = _load_chat(chat_id)
            if not data:
                return
            native = data.get("native") if isinstance(data.get("native"), dict) else {}
            remote = native.get("session_id") or data.get("eval_id")
            if not remote:
                continue
            title = ""
            try:
                if data.get("agent_backend") == "arena" or native.get("session_id"):
                    session, error, _ = _arena_get_json(contracts.PATHS["chat_session"].format(
                        session_id=urllib.parse.quote(str(remote))), timeout=20)
                    title = "" if error else history_sync.agentic_title(session)
                else:
                    session, error, _ = _arena_get_json(contracts.PATHS["evaluation"].format(
                        eval_id=urllib.parse.quote(str(remote))), timeout=20)
                    if not error and isinstance(session, dict):
                        title = str(session.get("title") or "").strip()
            except Exception:
                LOG.debug("arena title fetch failed", exc_info=True)
            title = " ".join(title.split())[:80]
            if history_sync.is_injected_title(title):
                return  # Arena titled the tool guide, not the user's words; keep ours.
            if not title or title.lower() in ("arena chat", "arena agent", "new chat", "untitled"):
                continue
            if _chat_generating(chat_id):
                continue
            fresh = _load_chat(chat_id) or {}
            if fresh.get("title") != title:
                fresh["title"] = title
                try:
                    (CHATS_DIR / chat_id / "chat.json").write_text(
                        json.dumps(fresh, ensure_ascii=False, indent=2), encoding="utf-8")
                except OSError:
                    return
            return
    threading.Thread(target=work, daemon=True, name="arena-title").start()


def _arena_get_json(path: str, timeout: float = 30, method: str = "GET"):
    """Request one Arena API resource through the signed-in engine when present."""
    method = str(method or "GET").upper()
    client = get_client()
    detail = None
    if _engine_on():
        if not ENGINE.ready():
            return None, ("arena.ai is waiting for a check" if ENGINE.challenge
                          else "arena.ai session is still loading"), 0
        response = ENGINE.request(path, method=method, timeout=timeout)
        text = response.text
        status = response.status_code
        detail = response.error
        if status == 200:
            ENGINE.sync_to(client)
    else:
        try:
            raw = client.session.request(method, contracts.ORIGIN + path, timeout=timeout)
        except requests.RequestException as e:
            return None, str(e), 0
        text, status = raw.text, raw.status_code
        if status == 200:
            client.sync_cookies()
    if status == 0:
        return None, (f"Can't reach arena.ai: {detail}" if detail else "Can't reach arena.ai"), status
    if status in (401, 403):
        return None, "Arena session is not signed in or has expired", status
    if status != 200:
        return None, f"arena.ai returned HTTP {status}", status
    try:
        return json.loads(text), None, status
    except ValueError:
        return None, "arena.ai returned an unexpected non-JSON reply", status


def _arena_post_json(path: str, payload: dict, timeout: float = 30):
    """POST JSON to an Arena API resource; returns (data, error, http_status)."""
    client = get_client()
    detail = None
    if _engine_on():
        if not ENGINE.ready():
            return None, ("arena.ai is waiting for a check" if ENGINE.challenge
                          else "arena.ai session is still loading"), 0
        response = ENGINE.request(path, body=payload, method="POST", timeout=timeout)
        text, status = response.text, response.status_code
        detail = response.error
        if status == 200:
            ENGINE.sync_to(client)
    else:
        try:
            raw = client.session.post(contracts.ORIGIN + path, json=payload, timeout=timeout)
        except requests.RequestException as e:
            return None, str(e), 0
        text, status = raw.text, raw.status_code
        if status == 200:
            client.sync_cookies()
    if status == 0:
        return None, (f"Can't reach arena.ai: {detail}" if detail else "Can't reach arena.ai"), status
    if status in (401, 403):
        return None, "Arena session is not signed in or has expired", status
    if status != 200:
        return None, f"arena.ai returned HTTP {status}", status
    try:
        return json.loads(text), None, status
    except ValueError:
        return None, "arena.ai returned an unexpected non-JSON reply", status


def _resolve_auto_modality(message: str, has_image: bool = False) -> str:
    """Ask Arena's own auto-modality router, like Battle+Auto on the website.

    Returns an Arena API modality. Any failure falls back to chat so a router
    hiccup never blocks the message itself.
    """
    try:
        data, error, _status = _arena_post_json(
            contracts.PATHS["auto_modality"],
            {"user_prompt": message, "has_image": bool(has_image)},
            timeout=20)
    except Exception as exc:  # the router must never block the message itself
        LOG.info("auto-modality router unavailable (%s); using chat", exc)
        return "chat"
    if error or not isinstance(data, dict):
        if error:
            LOG.info("auto-modality router unavailable (%s); using chat", error)
        return "chat"
    modality = contracts.pick_auto_modality(data.get("probabilities"), has_image=has_image)
    LOG.info("auto-modality resolved to %s", modality)
    return modality


@app.route("/api/arena-chats")
def api_arena_chats():
    client = get_client()
    if not _signed_in_somewhere(client):
        return jsonify({"ok": False, "entries": [], "error": "Not signed in", "code": "auth"}), 401
    limit_raw = request.args.get("limit", "50")
    try:
        limit = max(1, min(50, int(limit_raw)))
    except ValueError:
        limit = 50
    query = urllib.parse.urlencode({"limit": limit, "includeArchived": "false"})
    data, error, status = _arena_get_json(f"{contracts.PATHS['history_unified']}?{query}", timeout=35)
    if error:
        code = 503 if status == 0 else status
        return jsonify({"ok": False, "entries": [], "error": error, "code": "arena_history"}), code
    raw_entries = data.get("entries") if isinstance(data, dict) else []
    entries = []
    for raw in raw_entries or []:
        summary = history_sync.entry_summary(raw)
        if not summary:
            continue
        local = _find_chat_by_eval(summary["eval_id"])
        summary["local_chat_id"] = local.get("id") if local else None
        # A local Agent conversation is a direct-battle evaluation on
        # Arena's side; label it by the mode the user actually used here.
        # Native Agent chats store the Arena session id as eval_id too, so
        # agentic entries link to their local copy the same way.
        summary["local_mode"] = local.get("mode") if local else None
        entries.append(summary)
    return jsonify({
        "ok": True,
        "entries": entries,
        "pagination": data.get("pagination") if isinstance(data, dict) else None,
        "partial": bool(data.get("partial")) if isinstance(data, dict) else False,
    })


@app.route("/api/arena-chats/<eval_id>/open", methods=["POST"])
def api_arena_chat_open(eval_id):
    if not _validate_chat_id(eval_id):
        return jsonify({"error": "Invalid Arena chat ID"}), 400
    data = request.get_json(silent=True) or {}
    kind = str(data.get("type") or "evaluation")
    if kind == "agentic":
        local = _find_chat_by_eval(eval_id)
        if local:
            return jsonify({"ok": True, "chat_id": local["id"], "imported": False})
        # Import the cloud Arena Agent session as a continuable local chat.
        # The native coordinates are the session id itself (Arena's strict
        # bootstrap guarantees triggerAddress == sessionId); the stream
        # cursor is unknown, so the first continuation drains the backlog
        # before appending (needs_drain). The transcript fetch is
        # best-effort: continuation must work even if it fails.
        title = str(data.get("title") or "").strip()
        messages = []
        cursor = None
        session, error, _status = _arena_get_json(
            contracts.PATHS["chat_session"].format(
                session_id=urllib.parse.quote(str(eval_id))), timeout=35)
        if not error and isinstance(session, dict):
            title = history_sync.agentic_title(session) or title
            messages = history_sync.agentic_messages(session)
            # The snapshot carries the authoritative stream cursor; with it
            # the first continuation subscribes at the head directly and no
            # backlog draining is needed at all.
            cursor = history_sync.agentic_last_event_id(session)
        if not title:
            first_user = next((m for m in messages if m.get("role") == "user"), None)
            title = (first_user["text"][:50] if first_user else "") or "Arena Agent"
        _save_chat(eval_id, title=title, messages=messages, mode="agent", modality="text",
                   model_a=None, model_b=None, eval_id=eval_id, source="arena",
                   agent_backend="arena", stamp=history_sync.last_activity(session) if not error else None,
                   native={"backend": "arena", "session_id": eval_id,
                           "trigger_address": eval_id, "last_event_id": cursor,
                           "needs_drain": cursor is None})
        return jsonify({"ok": True, "chat_id": eval_id, "imported": True})
    local = _find_chat_by_eval(eval_id)
    if local:
        return jsonify({"ok": True, "chat_id": local["id"], "imported": False})
    session, error, status = _arena_get_json(
        contracts.PATHS["evaluation"].format(eval_id=urllib.parse.quote(eval_id)), timeout=45)
    if error:
        code = 503 if status == 0 else status
        return jsonify({"ok": False, "error": error, "code": "arena_history"}), code
    try:
        converted = history_sync.session_to_local(session, model_name=_model_name)
    except Exception as e:
        return jsonify({"ok": False, "error": f"Could not import this Arena chat: {e}"}), 422
    _save_chat(eval_id, title=converted["title"], messages=converted["messages"],
               mode=converted["mode"], modality=converted["modality"],
               model_a=converted.get("model_a"), model_b=converted.get("model_b"),
               eval_id=eval_id, source="arena", stamp=history_sync.last_activity(session))
    return jsonify({"ok": True, "chat_id": eval_id, "imported": True})


LOG = logging.getLogger("arena.desktop")
_tl = threading.local()  # per request: the last error shown to the user, kept in the chat history


def _sse(obj) -> str:
    if obj.get("type") == "error" and obj.get("model") not in ("a", "b"):
        # Lane-scoped model errors are persisted per lane by the caller; the
        # thread-local is reserved for a failure of the whole turn.
        _tl.error = obj.get("message")
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


def _sse_wrap(gen, chat_id=None, workspace_dir=None):
    """A crash must not end the stream silently: report it as an error event."""
    _generation_started(chat_id)
    # Per-chat stop: /api/stop sets this exact event for this chat only.
    _tl.stop_event = _chat_stop_event(chat_id) if chat_id else None
    _tl.chat_id = chat_id
    # The folder this chat works in stays fixed for the whole reply: picking
    # another folder for a different chat must not move this chat's tools
    # (v1.5.1 - a second chat's folder used to leak into a running chat).
    _tl.workspace = Path(workspace_dir) if workspace_dir else None
    try:
        yield from gen
    except Exception as e:
        yield _sse({"type": "error", "code": "internal", "message": "The app hit an internal error.",
                    "detail": f"{type(e).__name__}: {e}", "retry": True})
        yield _sse({"type": "done", "text_a": "", "text_b": ""})
    finally:
        _tl.stop_event = None
        _tl.chat_id = None
        _tl.workspace = None
        _generation_finished(chat_id)


def _workspace_dir() -> Path:
    pinned = getattr(_tl, "workspace", None)
    if pinned is not None:
        return pinned
    raw = load_config().get("workspace_dir")
    return Path(raw).expanduser() if raw else workspace.PROJECTS_DIR / "workspace"


def _chosen_ws() -> Optional[Path]:
    """The folder the user picked in the composer, or None when they have not picked one.
    While a chat is replying: the folder that chat started the reply with."""
    pinned = getattr(_tl, "workspace", None)
    if pinned is not None:
        return pinned
    raw = load_config().get("workspace_dir")
    return Path(raw).expanduser() if raw else None


def _panel_workspace_root() -> Path:
    """Folder shown in the right Workspace panel.

    With no explicitly chosen folder, show ArenaProjects itself so Code-mode
    project folders and the default Agent workspace are both visible.
    """
    chosen = _chosen_ws()
    return (chosen if chosen is not None else workspace.PROJECTS_DIR).expanduser().resolve()


class _HttpStream:
    """A requests response with the EngineResponse interface, for running without the desktop engine."""

    def __init__(self, resp=None, error=None):
        self._r, self.error = resp, error
        self.status_code = resp.status_code if resp is not None else 0
        self.headers = dict(resp.headers) if resp is not None else {}

    def iter_text(self):
        if self._r is None:
            return
        dec = codecs.getincrementaldecoder("utf-8")("replace")
        for chunk in self._r.iter_content(chunk_size=None):
            if chunk:
                yield dec.decode(chunk)
        yield dec.decode(b"", final=True)

    @property
    def text(self) -> str:
        if not hasattr(self, "_text"):
            self._text = "".join(self.iter_text())
        return self._text


def _send(client: ArenaClient, path: str, body: dict):
    # Video Arena may take up to ten minutes.  Keep every other modality on
    # the existing three/five-minute guardrails.
    timeout = 720 if body.get("modality") == "video" else 300
    if _engine_on():
        if not ENGINE.wait_ready(30):
            return _HttpStream(error=f"arena.ai is waiting for a {ENGINE.challenge} check" if ENGINE.challenge
                               else "arena.ai window is still loading")
        # The website attaches a genuine `cx` client-interaction blob to
        # every chat submit; without it Arena treats the send as suspect
        # and rate-limits expensive modalities (Video first).
        return ENGINE.request(path, body, timeout=timeout, cx=True)
    try:
        read_idle = timeout if body.get("modality") == "video" else STREAM_IDLE_TIMEOUT
        r = client.session.post(contracts.ORIGIN + path, json=body, stream=True, timeout=(15, read_idle))
    except requests.RequestException as e:
        return _HttpStream(error=str(e))
    client.sync_cookies()
    return _HttpStream(r)


def _wait_for(check, seconds: int):
    """Poll check() once a second with keep-alive pings; returns its first truthy value."""
    for i in range(seconds):
        value = check()
        if value or _stopped():
            return value
        time.sleep(1)
        if i % 10 == 9:
            yield _sse({"type": "ping"})
    return check()


def _history_output(output) -> str:
    """The part of a tool result kept in chat history for the UI (not the model)."""
    text = str(output or "")
    if len(text) <= 2000:
        return text
    return text[:1200] + "\n...\n" + text[-700:]


def _run_cmd_live(tool_obj, call: dict, lane: str, call_id: str):
    """Run one run_cmd on a worker thread, streaming its output to the UI.

    Yields ``tool_progress`` SSE events (the tail of the output so far) and
    keep-alive pings; returns (ok, output). Stop kills the command."""
    chunks: "queue.Queue[str]" = queue.Queue()
    stop_evt = threading.Event()
    box: dict = {}

    def work():
        try:
            box["res"] = tool_obj.run(call, on_output=chunks.put, should_stop=stop_evt.is_set)
        except Exception as e:  # never leave the generator waiting
            box["res"] = (False, f"{type(e).__name__}: {e}")

    worker = threading.Thread(target=work, daemon=True, name="arena-run-cmd")
    worker.start()
    tail = ""
    last_emit = last_ping = time.monotonic()
    while True:
        worker.join(0.3)
        got = []
        while True:
            try:
                got.append(chunks.get_nowait())
            except queue.Empty:
                break
        if got:
            tail = (tail + "".join(got))[-6000:]
        if _stopped():
            stop_evt.set()
        now = time.monotonic()
        alive = worker.is_alive()
        if got and (now - last_emit >= 0.35 or not alive):
            last_emit = last_ping = now
            yield _sse({"type": "tool_progress", "id": call_id, "model": lane, "tool": "run_cmd",
                        "output": tail[-4000:]})
        elif now - last_ping >= 10:
            last_ping = now
            yield _sse({"type": "ping"})
        if not alive:
            break
    result = box.get("res") or (False, "Error: the command did not report a result")
    try:
        missing = None if result[0] else agent.missing_component(
            (call.get("params") or {}).get("cmd") or "", result[1])
        if missing:
            names = {"node": "Node.js", "python": "Python"}
            yield _sse({"type": "component_missing", "component": missing,
                        "name": names.get(missing, missing),
                        "reason": f"The agent ran a command that needs {names.get(missing, missing)}"})
            result = (result[0], result[1] + f"\n[Arena Desktop] {names.get(missing, missing)} is not "
                      "installed on this computer. The user was offered an installer; do not retry "
                      "this command until they say it is installed.")
    except Exception:
        pass
    return result


def _permit(mode: str, tool: str, info: dict):
    """Apply the permission mode to one action, asking the user when needed.
    Yields SSE events; returns "allow", "deny" (the user said no) or "blocked" (the mode forbids it)."""
    verdict = BROKER.check(mode, tool, info.get("inside", True), info.get("command", ""))
    if verdict == "allow":
        return "allow"
    if verdict == "deny":
        why = "Plan mode is read-only" if mode == "plan" else "This command is never allowed"
        yield _sse({"type": "notice", "level": "warn", "text": f"{why}: {info.get('summary')}"})
        return "blocked"
    # Tag the request with its chat so the UI can keep other chats usable
    # while this one waits for an answer.
    info = dict(info, chat_id=getattr(_tl, "chat_id", None))
    pid = BROKER.ask(dict(info, mode=mode))
    yield _sse(dict(info, type="permission", id=pid, mode=mode))
    answer = yield from _wait_for(lambda: BROKER.wait(pid, 0), 600)
    if not answer:
        BROKER.resolve(pid, "deny")
        BROKER.wait(pid, 0)
        answer = "deny"
    yield _sse({"type": "permission_done", "id": pid, "decision": answer})
    return answer


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


_preview = {"port": None}
_preview_lock = threading.Lock()


def _preview_url(root: Path):
    """Serve generated sites from a separate port (a separate origin) so their scripts cannot call this app's API."""
    if not (Path(root) / "index.html").is_file():
        return None
    base = workspace.PROJECTS_DIR.resolve()
    try:
        rel = Path(root).resolve().relative_to(base).as_posix()
    except ValueError:
        return None
    with _preview_lock:
        if _preview["port"] is None:
            srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(_QuietHandler, directory=str(base)))
            _preview["port"] = srv.server_address[1]
            threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{_preview['port']}/{urllib.parse.quote(rel)}/index.html"


def _save_webdev(lane: str, files: list, conv: dict):
    """Mirror a code answer into its local project folder, asking first unless the mode allows edits."""
    root = workspace.project_dir(conv["chat_id"], conv["title"], lane, base=_chosen_ws())
    plan = workspace.plan_project(root, files)
    mode = _perm_mode()
    write = delete = False
    if plan["writes"]:
        write = (yield from _permit(mode, "write_project", {
            "tool": "write_project", "path": str(root), "rel": root.name, "inside": True,
            "summary": f"Save {len(plan['writes'])} code file(s) from model {lane.upper()} to {root}",
            "files": sorted(plan["writes"])[:50]})) == "allow"
    if plan["deletes"]:
        delete = (yield from _permit(mode, "delete", {
            "tool": "delete", "path": str(root), "rel": root.name, "inside": True,
            "summary": f"Remove {len(plan['deletes'])} file(s) the new answer dropped from {root}",
            "files": plan["deletes"][:50]})) == "allow"
    written, deleted = workspace.apply_project(plan, write=write, delete=delete) if (write or delete) else (0, 0)
    saved = write or not plan["writes"]
    yield _sse({"type": "files_written", "model": lane, "root": str(root), "written": written, "deleted": deleted,
                "unchanged": plan["unchanged"], "skipped": plan["skipped"], "saved": saved,
                "files": plan["files"], "preview": _preview_url(root) if saved else None})


def _webdev_event(lane: str, item: dict, conv: dict):
    event = item.get("event")
    if event == "title" and isinstance(item.get("title"), str):
        conv["title"] = item["title"][:80]
    yield _sse({"type": "webdev", "model": lane, "event": event, "data": item})
    files = workspace.webdev_files(item)
    if files:
        _last_webdev[(conv["chat_id"], lane)] = {"title": conv["title"], "files": files}
        yield from _save_webdev(lane, files, conv)
    url = contracts.find_preview_url(item)
    if event == "preview-ready" or url:
        if url:
            conv["_preview_sent"] = True
        yield _sse({"type": "preview", "model": lane, "url": url, "status": item.get("status"),
                    "message": item.get("message") or item.get("reason")})


def _poll_webdev_preview(client, conv: dict):
    """After a webdev stream ends with no preview URL, poll the evaluation endpoint."""
    ids = conv.get("last_arena_ids") or {}
    msg_id = ids.get("a") or ids.get("b")
    if not msg_id:
        return
    path = contracts.PATHS["webdev"].replace("{message_id}", msg_id)
    delays = [2, 3, 5, 8, 12]
    for wait in delays:
        if _stopped():
            return
        yield _sse({"type": "ping"})
        time.sleep(wait)
        try:
            if _engine_on():
                r = ENGINE.request(path, timeout=10)
                if r.status_code != 200:
                    continue
                body = r.json() if hasattr(r, "json") else {}
            else:
                resp = client.session.get(contracts.ORIGIN + path, timeout=10)
                if resp.status_code != 200:
                    continue
                body = resp.json()
        except Exception:
            continue
        url = contracts.find_preview_url(body)
        if url:
            conv["_preview_sent"] = True
            yield _sse({"type": "preview", "model": "a", "url": url,
                        "status": "ready", "message": "Preview ready"})
            return


# ARENA_STREAM_DUMP=1 writes every raw stream line to ~/.arena-cli/streams/<chat>.txt, to study arena's stream parts.
_DUMP_DIR = (CHATS_DIR.parent / "streams") if os.environ.get("ARENA_STREAM_DUMP") else None


def _dump_line(conv: dict, line) -> None:
    raw = line if isinstance(line, str) else line.decode("utf-8", "replace")
    try:
        _DUMP_DIR.mkdir(parents=True, exist_ok=True)
        with open(_DUMP_DIR / f"{conv['chat_id'][:8]}.txt", "a", encoding="utf-8") as f:
            f.write(raw.rstrip("\r\n") + "\n")
    except OSError:
        pass


def _save_media(m: dict, lane: str, conv: dict):
    """Keep a generated image, video or sound in the folder the user picked (when they picked one)."""
    ws = _chosen_ws()
    done = conv.setdefault("media_saved", set())
    if ws is None or m["url"] in done:
        return
    done.add(m["url"])
    try:
        r = _media_get(m["url"], timeout=120)
        r.raise_for_status()
        ext = Path(urlparse(m["url"]).path).suffix[:6] or mimetypes.guess_extension(
            (r.headers.get("content-type") or "").split(";")[0].strip()) or ".bin"
        ws.mkdir(parents=True, exist_ok=True)
        target = ws / f"{workspace.slug(conv['title'])}-{lane}-{uuid.uuid4().hex[:6]}{ext}"
        target.write_bytes(r.content)
    except (requests.RequestException, OSError, ValueError) as e:
        yield _sse({"type": "notice", "model": lane, "text": f"Could not save the {m.get('kind') or 'file'}: {e}"})
        return
    yield _sse({"type": "notice", "model": lane, "text": f"Saved to {target}"})


def _code_root(chat_id: str, title: str, lane: str, mode: str) -> Path:
    """Where the files an AI builds land: the picked folder (option-a/option-b when two models answer),
    else this chat's own folder under ArenaProjects."""
    ws = _chosen_ws()
    if ws is None:
        return workspace.project_dir(chat_id, title, lane)
    return (ws / agent.LANE_DIRS[lane] if mode in ("battle", "side-by-side") else ws).expanduser().resolve()


def _sync_file(root: Path) -> Path:
    return CHATS_DIR.parent / "sync" / (hashlib.sha1(str(root).lower().encode()).hexdigest()[:16] + ".json")


def _sync_load(root: Path) -> dict:
    """What the AI last wrote to each file in a folder (path -> sha1), to spot the user's own edits."""
    try:
        return json.loads(_sync_file(root).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _sync_save(root: Path, man: dict) -> None:
    try:
        f = _sync_file(root)
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps(man), encoding="utf-8")
    except OSError:
        pass


def _digest(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()


def _line_delta(old: str, new: str):
    """Lines added and removed between two versions of a file."""
    add = rem = 0
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, old.splitlines(), new.splitlines(), autojunk=False).get_opcodes():
        if tag in ("replace", "delete"):
            rem += i2 - i1
        if tag in ("replace", "insert"):
            add += j2 - j1
    return add, rem


def _compact_diff(old: str, new: str, max_lines: int = 40) -> str:
    """Unified diff truncated to max_lines for the frontend."""
    old_lines = old.splitlines(keepends=True)
    new_lines = new.splitlines(keepends=True)
    diff = list(difflib.unified_diff(old_lines, new_lines, lineterm=""))
    if len(diff) > max_lines + 2:
        diff = diff[:max_lines + 2] + [f"... ({len(diff) - max_lines - 2} more lines)"]
    return "\n".join(line.rstrip("\n\r") for line in diff)


_SB_VERB = {"read": "Read", "run": "Ran", "touch": "Changed"}


def _sandbox_call(lane: str, call: dict, conv: dict):
    """arena.ai's model used one of arena's own sandbox tools. Copy file writes, edits, deletes and downloads
    into the local project folder, and show the step as an activity row like arena.ai's."""
    op = contracts.sandbox_op(call)
    LOG.info("chat %s sandbox %s %s %s", conv["chat_id"][:8], lane, op["tool"], op.get("path") or op.get("detail", ""))
    row = {"id": op["id"], "kind": op["kind"], "tool": op["tool"], "path": op.get("path"), "detail": op.get("detail"),
           "verb": _SB_VERB.get(op["kind"], op["tool"])}
    if op["kind"] in ("write", "edit") and not (op.get("content") or op.get("old")):
        # arena.ai streams each call twice: first with empty arguments, then complete. Write on the complete one.
        row.update(verb="Writing" if op["kind"] == "write" else "Editing", pending=True)
    elif op["kind"] in ("write", "edit", "delete", "download"):
        root = _code_root(conv["chat_id"], conv["title"], lane, conv["mode"])
        if op["kind"] != "delete" and conv.get("mirror_ok") is None:
            info = {"tool": "write_file", "summary": f"Copy the files the AI writes into {root}", "inside": True,
                    "path": str(root), "rel": ".", "model": lane}
            conv["mirror_ok"] = (yield from _permit(_perm_mode(), "write_file", info)) == "allow"
        try:
            if op["kind"] != "delete" and not conv["mirror_ok"]:
                raise PermissionError("not copied: the permission mode does not allow it")
            target = workspace._inside(root, op["path"])
            rel = target.relative_to(root).as_posix()
            man = _sync_load(root)
            old = target.read_text(encoding="utf-8", errors="replace") if target.is_file() else None
            if op["kind"] == "delete":
                # A blanket approval to copy edits is not approval to delete.
                # Never remove a user's untracked or locally modified file.
                if target.is_file():
                    if rel not in man or _digest(target.read_bytes()) != man[rel]:
                        raise PermissionError("not deleted: file is untracked or has local changes")
                    info = {"tool": "delete", "summary": f"Delete mirrored file {rel}", "inside": True,
                            "path": str(target), "rel": rel, "model": lane}
                    if (yield from _permit(_perm_mode(), "delete", info)) != "allow":
                        raise PermissionError("not deleted: permission was not granted")
                    if not target.is_file() or _digest(target.read_bytes()) != man[rel]:
                        raise PermissionError("not deleted: file changed while awaiting permission")
                    target.unlink()
                man.pop(rel, None)
                row["verb"] = "Deleted"
            else:
                if target.exists() and (not target.is_file() or rel not in man or _digest(target.read_bytes()) != man[rel]):
                    raise PermissionError("not copied: file is untracked or has local changes")
                if op["kind"] == "download":
                    r = _media_get(op["url"], timeout=60)
                    r.raise_for_status()
                    data = r.content
                    row["verb"] = "Saved"
                else:
                    if op["kind"] == "edit":
                        if old is None or op["old"] not in old:
                            raise ValueError("not copied: your copy of this file differs from the AI's")
                        new = old.replace(op["old"], op["new"], 1)
                    else:
                        new = op["content"]
                    row["add"], row["del"] = _line_delta(old or "", new)
                    row["diff"] = _compact_diff(old or "", new)
                    row["verb"] = "Created" if old is None else "Edited"
                    data = new.encode("utf-8")
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                man[rel] = _digest(data)
            _sync_save(root, man)
            row.update(abs=str(target), root=str(root))
        except (OSError, ValueError, requests.RequestException) as e:
            row["error"] = str(e)[:160]
    rows = conv.setdefault("sandbox", [])
    if row["id"]:
        rows[:] = [r for r in rows if not (r.get("id") == row["id"] and r.get("model") == lane)]
    rows.append(dict(row, model=lane))
    yield _sse(dict(row, type="sandbox", model=lane))
    # present_file or newly written HTML: emit a local preview event
    fpath = op.get("path") or ""
    is_present = "present" in str(op["tool"]).lower()
    is_html_write = row.get("verb") in ("Created", "Edited") and fpath.lower().rsplit(".", 1)[-1] in ("html", "htm")
    if (is_present or is_html_write) and fpath and not row.get("error"):
        yield _sse({"type": "file_preview", "model": lane, "path": fpath,
                     "html": fpath.lower().rsplit(".", 1)[-1] in ("html", "htm")})


def _sandbox_output_text(out) -> str:
    """Readable text of a sandbox tool's result: a command's exit code and
    output, a file's text, or the JSON the tool answered with."""
    if out is None:
        return ""
    if isinstance(out, str):
        return out
    if isinstance(out, dict):
        if isinstance(out.get("stdout"), str) or isinstance(out.get("stderr"), str):
            body = "\n".join(str(out.get(k)) for k in ("stdout", "stderr") if str(out.get(k) or "").strip())
            code = out.get("exitCode", out.get("exit_code"))
            return (f"exit code {code}\n" if isinstance(code, int) else "") + body
        for key in ("content", "text", "output"):
            if isinstance(out.get(key), str) and out[key].strip():
                return out[key]
    try:
        return json.dumps(out, ensure_ascii=False, indent=2)
    except (TypeError, ValueError):
        return str(out)


def _sandbox_result(lane: str, res: dict, conv: dict):
    """A sandbox tool finished: tick its row, and pass on any preview link (<id>.arena.site) it carries."""
    rid = res.get("toolCallId") or res.get("id")
    out = res.get("result", res.get("output"))
    bad = isinstance(out, dict) and bool(out.get("error") or out.get("success") is False or out.get("isError"))
    # Keep what the tool returned, so the chat shows each step's output
    # (Claude Code style) now and after a reload.
    text = _history_output(_sandbox_output_text(out))
    for row in conv.get("sandbox", []):
        if row.get("id") == rid and row.get("model") == lane:
            row["ok"] = not bad
            if text:
                row["output"] = text
    yield _sse({"type": "sandbox_done", "model": lane, "id": rid, "ok": not bad, "output": text})
    url = contracts.find_preview_url(out)
    if url and url not in conv.setdefault("previews", set()):
        conv["previews"].add(url)
        yield _sse({"type": "preview", "model": lane, "url": url})


def _local_edits(root: Path):
    """Files the user changed on disk since the AI last wrote them, as a note in front of the next message."""
    man = _sync_load(root)
    changed, parts, size = [], [], 0
    for rel, digest in list(man.items()):
        try:
            data = (root / rel).read_bytes()
        except OSError:
            continue
        if _digest(data) == digest:
            continue
        changed.append(rel)
        text = data.decode("utf-8", "replace")
        if size + len(text) <= 60_000 and len(parts) < 12:
            parts.append(f"--- {rel} ---\n{text}")
            size += len(text)
        man[rel] = _digest(data)
    if not changed:
        return [], ""
    _sync_save(root, man)
    extra = [r for r in changed if not any(p.startswith(f"--- {r} ---") for p in parts)]
    note = ("I edited these files on my computer since your last change. Update your copy of each one to exactly "
            "this content before you continue:\n\n" + "\n\n".join(parts)
            + (f"\n\nAlso changed (too large to include): {', '.join(extra)}" if extra else "") + "\n\nMy message:\n")
    return changed, note


def _line_events(r, conv: dict):
    """Turn arena's stream into SSE events; returns the answer text per lane."""
    out = {"a": "", "b": ""}
    reasoning = conv.setdefault("reasoning", {"a": "", "b": ""})
    split = contracts.LineSplitter()
    expected = {"a", "b"} if conv.get("mode") in ("battle", "side-by-side") else {"a"}
    finished = set()
    # Code-mode agents narrate between sandbox tool calls; each narration
    # starts a new paragraph instead of running on ("...setup.I will now").
    after_tool = {"a": False, "b": False}

    def handle(line):
        if _DUMP_DIR:
            _dump_line(conv, line)
        parsed = contracts.parse_line(line)
        if not parsed:
            return
        lane, kind, value = parsed
        if kind == "finish":
            finished.add(lane)
            return
        if kind in ("tool_call", "tool_result", "step"):
            after_tool[lane] = True
        if kind == "text":
            value = str(value)
            if after_tool[lane] and value.strip():
                after_tool[lane] = False
                if out[lane].strip() and not out[lane].endswith("\n\n"):
                    value = ("\n" if out[lane].endswith("\n") else "\n\n") + value.lstrip(" ")
            out[lane] += value
            yield _sse({"type": "text", "model": lane, "text": value})
        elif kind == "reasoning":
            reasoning[lane] += str(value)
            yield _sse({"type": "reasoning", "model": lane, "text": str(value)})
        elif kind == "source":
            yield _sse({"type": "source", "model": lane, "data": value})
        elif kind == "error":
            finished.add(lane)  # a lane that errored will not stream more
            # A human check or a full session can also arrive inside a 200
            # stream; name them instead of a generic model error.
            known = contracts.classify_error(200, str(value))
            if known["code"] in ("challenge", "session_full"):
                code, message = known["code"], known["message"]
            else:
                code, message = "model", f"Model {lane.upper()} stopped with an error: {value}"
            conv.setdefault("lane_errors", {"a": [], "b": []}).setdefault(lane, []).append(message)
            yield _sse({"type": "error", "code": code, "model": lane, "retry": True,
                        "message": message})
        elif kind == "tool_call" and isinstance(value, dict):
            yield from _sandbox_call(lane, value, conv)
        elif kind == "tool_result" and isinstance(value, dict):
            yield from _sandbox_result(lane, value, conv)
        elif kind in ("data", "file", "annotation"):
            items = contracts.webdev_items(value)
            for item in items:
                yield from _webdev_event(lane, item, conv)
            if not items:
                for m in contracts.find_media(value):
                    yield _sse(dict(m, type="media", model=lane))
                    yield from _save_media(m, lane, conv)
                url = contracts.find_preview_url(value)
                if url:
                    conv["_preview_sent"] = True
                    yield _sse({"type": "preview", "model": lane, "url": url})

    def _chunks():
        # A silent stream (server hang, dead connection) raises a read
        # timeout here; turn it into a graceful end-of-turn instead of an
        # endless spinner.
        try:
            yield from r.iter_text()
        except requests.RequestException as e:
            if "timed out" in str(e).lower() or "timeout" in str(e).lower():
                yield "\x00stalled"
                return
            raise

    for chunk in _chunks():
        if chunk == "\x00stalled":
            yield _sse({"type": "notice", "level": "warn",
                        "text": f"The model stopped sending data ({STREAM_IDLE_TIMEOUT}s) - "
                                "the stream was closed to avoid a hang. Send 'continue' to resume."})
            return out
        for line in split.feed(chunk):
            yield from handle(line)
        if _stopped():
            yield _sse({"type": "notice", "text": "Stopped."})
            return out
        if expected <= finished:
            # Every lane already sent its finish record: do not sit on a
            # half-open stream until the server decides to close it (the
            # "answer is here but generation never ends" hang).
            for line in split.flush():
                yield from handle(line)
            return out
    for line in split.flush():
        yield from handle(line)
    # The stream closed before arena's finish record (dropped connection,
    # engine read timeout, server hiccup). Flag it: returning quietly used
    # to save a cut-off or empty reply as if it were complete.
    if not (expected <= finished) and not _stopped():
        conv["_unfinished"] = True
    return out
