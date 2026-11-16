# Arena Desktop web backend, part 3 of 11: chats.
# Chat routes (new, history, list, load, refresh from arena.ai, compact),
# memory, update check, settings export/import, diagnostics, and the
# ask-user / media-choice question queues.
#
# Not a standalone module: arena/web/app.py runs the parts in order
# inside its own namespace, so names from earlier parts are in scope.

@app.route("/api/new", methods=["POST"])
def api_new_chat():
    global _conversation_history, _current_chat_id
    client = get_client()
    client.eval_id = None
    client.sources.clear()
    _conversation_history = []
    _current_chat_id = str(uuid.uuid4())
    BROKER.reset_always()
    return jsonify({"ok": True, "chat_id": _current_chat_id})


@app.route("/api/history")
def api_history():
    return jsonify(_conversation_history)


@app.route("/api/chats")
def api_chats_list():
    return jsonify(_list_chats())


@app.route("/api/chats/<chat_id>")
def api_chat_load(chat_id):
    global _conversation_history, _current_chat_id, _ui_mode, _ui_modality
    data = _load_chat(chat_id)
    if not data:
        return jsonify({"error": "Chat not found"}), 404
    # Reopening a chat must restore the server-side mode as well as the UI.
    # Otherwise a follow-up could silently be sent as a different type of chat.
    saved_mode, saved_modality = data.get("mode"), data.get("modality")
    if saved_mode in MODE_API_MAP and saved_modality in MODALITY_API_MAP:
        # Legacy chats may contain combinations Arena never supported (for
        # example Direct+Video or Agent+Code).  Normalize the live state and
        # the returned copy; do not silently restore an impossible request.
        _ui_mode, _ui_modality = contracts.normalize_ui_selection(saved_mode, saved_modality)
        if _ui_modality == "auto" and data.get("messages"):
            # Auto only exists before the first message; a started chat was
            # resolved to a concrete modality (legacy saves meant Text).
            _ui_modality = "text"
        data = dict(data, mode=_ui_mode, modality=_ui_modality)
    if data.get("mode") == "agent":
        # The internally assigned Agent model is an implementation detail and
        # is never a user-facing choice or label.  Keep the on-disk copy for
        # server-side continuation, but sanitize the copy sent to the UI.
        clean_messages = []
        for message in data.get("messages") or []:
            if isinstance(message, dict) and message.get("role") == "assistant":
                message = dict(message, names={"a": "Agent", "b": None})
            clean_messages.append(message)
        data = dict(data, model_a=None, model_b=None, messages=clean_messages)
    _current_chat_id = chat_id
    _conversation_history = data.get("messages", [])
    client = get_client()
    client.active_mode = contracts.api_mode(_ui_mode)
    client.active_modality = contracts.api_modality(_ui_modality)
    client.eval_id = data.get("eval_id")
    data = dict(data, title=_chat_title(data), history_chars=_history_chars(data.get("messages") or []))
    return jsonify(data)


def _synced_stamp(session, merged, remote_messages):
    """arena.ai's last-activity time for a refreshed chat, when the local copy
    holds nothing beyond arena's (then arena's time is the chat's real time,
    which also repairs chats an older refresh moved to "just now")."""
    if len(merged) != len(remote_messages):
        return None
    return history_sync.last_activity(session)


@app.route("/api/chats/<chat_id>/refresh", methods=["POST"])
def api_chat_refresh(chat_id):
    """Pull later arena.ai turns into an already-linked local chat.

    Importing used to be a one-time snapshot: if the same conversation was
    continued in a browser, the desktop copy silently stayed behind.  This
    endpoint downloads the authoritative Arena transcript again and merges it
    without duplicating the turns already present locally.  It deliberately
    refuses to pretend a refresh happened when Arena does not return a
    readable transcript for a non-empty local chat.
    """
    global _conversation_history
    if not _validate_chat_id(chat_id):
        return jsonify({"error": "Invalid chat id", "code": "bad_request"}), 400
    data = _load_chat(chat_id)
    if not data:
        return jsonify({"error": "Chat not found", "code": "not_found"}), 404
    if data.get("tools_guide") or data.get("agent_backend") == "local":
        # Local-tool chats: Arena's copy holds the tool guide and every tool
        # result as extra turns. The local transcript is the real one; merging
        # Arena's copy in made those turns bleed into the chat.
        return jsonify({"ok": True, "chat_id": chat_id, "kind": "local", "added": 0,
                        "total": len(data.get("messages") or []), "title": _chat_title(data)})
    if _chat_generating(chat_id):
        return jsonify({"error": "This chat is generating right now. Refresh it when the answer finishes.",
                        "code": "busy"}), 409

    native = data.get("native") if isinstance(data.get("native"), dict) else {}
    session_id = native.get("session_id")
    is_agentic = data.get("agent_backend") == "arena" or bool(session_id)
    remote_id = session_id or data.get("eval_id")
    if not remote_id:
        return jsonify({"error": "This chat is not linked to an arena.ai conversation, so there is nothing to refresh.",
                        "code": "unlinked"}), 422

    local_messages = data.get("messages") if isinstance(data.get("messages"), list) else []
    if is_agentic:
        session, error, status = _arena_get_json(
            contracts.PATHS["chat_session"].format(
                session_id=urllib.parse.quote(str(remote_id))), timeout=45)
        if error:
            code = 503 if status == 0 else status
            return jsonify({"ok": False, "error": error, "code": "arena_refresh"}), code
        if not isinstance(session, dict):
            return jsonify({"ok": False, "error": "Arena did not return a readable Agent transcript.",
                            "code": "arena_refresh"}), 422
        remote_messages = history_sync.agentic_messages(session)
        if local_messages and not remote_messages:
            return jsonify({"ok": False, "error": "Arena did not return a readable Agent transcript.",
                            "code": "arena_refresh"}), 422
        merged, added = history_sync.merge_messages(local_messages, remote_messages)
        title = history_sync.agentic_title(session) or data.get("title") or "Arena Agent"
        cursor = history_sync.agentic_last_event_id(session)
        # The snapshot cursor may lag the locally consumed one by a few
        # control records; rewinding to it replays the previous turn's
        # turn-complete into the next continuation (instant empty reply).
        cursor = _native_cursor_max(native.get("last_event_id"), cursor)
        native_out = dict(native)
        native_out.update({
            "backend": "arena",
            "session_id": str(remote_id),
            "trigger_address": native.get("trigger_address") or str(remote_id),
            "last_event_id": cursor,
            "needs_drain": False if cursor else bool(native.get("needs_drain")),
        })
        _save_chat(chat_id, title=title, messages=merged, mode="agent", modality="text",
                   model_a=None, model_b=None, eval_id=str(remote_id),
                   source=data.get("source") or "arena", agent_backend="arena",
                   native=native_out, touch=False,
                   stamp=_synced_stamp(session, merged, remote_messages))
        kind = "agentic"
    else:
        session, error, status = _arena_get_json(
            contracts.PATHS["evaluation"].format(
                eval_id=urllib.parse.quote(str(remote_id))), timeout=45)
        if error:
            code = 503 if status == 0 else status
            return jsonify({"ok": False, "error": error, "code": "arena_refresh"}), code
        try:
            converted = history_sync.session_to_local(session, model_name=_model_name)
        except Exception as exc:
            return jsonify({"ok": False, "error": f"Could not read this Arena chat: {exc}",
                            "code": "arena_refresh"}), 422
        remote_messages = converted.get("messages") or []
        if local_messages and not remote_messages:
            return jsonify({"ok": False, "error": "Arena did not return a readable transcript.",
                            "code": "arena_refresh"}), 422
        merged, added = history_sync.merge_messages(local_messages, remote_messages)
        title = converted.get("title") or data.get("title") or "Arena chat"
        _save_chat(chat_id, title=title, messages=merged,
                   mode=data.get("mode") or converted.get("mode") or "battle",
                   modality=data.get("modality") or converted.get("modality") or "text",
                   model_a=data.get("model_a") or converted.get("model_a"),
                   model_b=data.get("model_b") or converted.get("model_b"),
                   eval_id=str(remote_id), source=data.get("source") or "arena",
                   touch=False, stamp=_synced_stamp(session, merged, remote_messages))
        kind = "evaluation"

    if _current_chat_id == chat_id:
        _conversation_history = merged
        get_client().eval_id = str(remote_id)
    LOG.info("chat refresh: chat=%s kind=%s added=%s total=%s", chat_id[:8], kind, added, len(merged))
    return jsonify({"ok": True, "chat_id": chat_id, "kind": kind,
                    "added": added, "total": len(merged), "title": title})


@app.route("/api/chats/<chat_id>/compact", methods=["POST"])
def api_chat_compact(chat_id):
    """Arm a context reset: the next message starts a fresh Arena session
    seeded with a digest of everything so far.  The local transcript is
    untouched; only the server-side context restarts."""
    if not _validate_chat_id(chat_id):
        return jsonify({"error": "Invalid chat id", "code": "bad_request"}), 400
    data = _load_chat(chat_id)
    if not data:
        return jsonify({"error": "Chat not found", "code": "not_found"}), 404
    if _chat_generating(chat_id):
        return jsonify({"error": "Wait for the current answer to finish, then compact.",
                        "code": "busy"}), 409
    if (data.get("modality") or "") in ("image", "video"):
        return jsonify({"error": "Compact is for text conversations.",
                        "code": "unsupported"}), 400
    messages = list(data.get("messages") or [])
    real = [m for m in messages if isinstance(m, dict) and m.get("role") in ("user", "assistant")]
    if len(real) < 2:
        return jsonify({"error": "There is nothing to compact yet.",
                        "code": "empty"}), 400
    digest = _build_digest(data)
    memory_path = _append_digest_to_memory(data, digest)
    marker = {"role": "notice", "compact": True, "digest_chars": len(digest),
              "text": "Context compacted \u2014 this conversation continues in a fresh "
                      "Arena session with a summary of everything above."}
    messages.append(marker)
    try:
        _save_chat(chat_id, title=data.get("title") or "Conversation", messages=messages,
                   mode=data.get("mode") or "battle", modality=data.get("modality") or "text",
                   model_a=data.get("model_a"), model_b=data.get("model_b"),
                   eval_id=None, tools_guide=False, mcp_guide_hash="",
                   agent_backend=data.get("agent_backend"), native={},
                   memory_hash="", pending_digest=digest)
    except Exception:
        LOG.exception("compact save failed")
        return jsonify({"error": "Could not save the compacted chat.", "code": "save_failed"}), 500
    return jsonify({"ok": True, "digest_chars": len(digest),
                    "history_chars": len(digest),
                    "memory_saved": bool(memory_path), "notice": marker["text"]})


@app.route("/api/memory")
def api_memory_get():
    folder = _chosen_ws()
    return jsonify({
        "enabled": _memory_enabled(),
        "folder": str(folder) if folder else None,
        "global": _read_memory_file(GLOBAL_MEMORY_FILE, 100_000),
        "workspace": (_read_memory_file(Path(folder) / MEMORY_FILE_NAME, 100_000)
                      if folder else None),
    })


@app.route("/api/memory", methods=["POST"])
def api_memory_save():
    data = request.get_json(silent=True) or {}
    folder = _chosen_ws()
    try:
        if isinstance(data.get("global"), str):
            GLOBAL_MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
            GLOBAL_MEMORY_FILE.write_text(data["global"], encoding="utf-8")
        if isinstance(data.get("workspace"), str) and folder:
            Path(folder).mkdir(parents=True, exist_ok=True)
            (Path(folder) / MEMORY_FILE_NAME).write_text(data["workspace"], encoding="utf-8")
    except OSError as e:
        return jsonify({"error": f"Could not save memory: {e}", "code": "save_failed"}), 500
    if "enabled" in data:
        cfg = load_config()
        cfg["memory_enabled"] = bool(data.get("enabled"))
        save_config(cfg)
    return jsonify({"ok": True, "enabled": _memory_enabled(),
                    "folder": str(folder) if folder else None})


_update_cache = {"t": 0.0, "data": None}
_release_cache: dict = {}


def _version_tuple(v) -> tuple:
    parts = []
    for bit in str(v or "").lstrip("v").split("."):
        try:
            parts.append(int(bit))
        except ValueError:
            parts.append(0)
    return tuple(parts) or (0,)


@app.route("/api/update-check")
def api_update_check():
    """Compare APP_VERSION with the latest GitHub release (cached 6h).

    With the beta channel on, the newest pre-release counts too; each
    channel keeps its own cache slot."""
    cfg = load_config()
    enabled = cfg.get("update_check") is not False
    beta = cfg.get("beta_updates") is True
    channel = "beta" if beta else "stable"
    force = request.args.get("force") == "1"
    now = time.time()
    slot = _update_cache.setdefault(channel, {"t": 0.0, "data": None})
    if not force and slot["data"] and now - slot["t"] < 6 * 3600:
        return jsonify(dict(slot["data"], enabled=enabled, cached=True))
    data = {"current": APP_VERSION, "latest": None, "update": False, "url": None,
            "error": None, "channel": channel, "prerelease": False}
    repo = "https://api.github.com/repos/PlayzAe/arena.ai-desktop"
    url = f"{repo}/releases?per_page=10" if beta else f"{repo}/releases/latest"
    try:
        r = requests.get(url,
                         headers={"Accept": "application/vnd.github+json",
                                  "User-Agent": f"Arena-Desktop/{APP_VERSION}"}, timeout=6)
        if r.status_code == 200:
            payload = r.json()
            if beta:
                payload = next((x for x in payload if isinstance(x, dict) and not x.get("draft")), {})
            latest = str(payload.get("tag_name") or "").lstrip("v")
            data["latest"] = latest or None
            data["url"] = payload.get("html_url")
            data["prerelease"] = bool(payload.get("prerelease"))
            data["update"] = bool(latest) and _version_tuple(latest) > _version_tuple(APP_VERSION)
            data.update(updater.release_info(payload))
            _release_cache[channel] = payload
        else:
            data["error"] = f"GitHub returned {r.status_code}"
    except Exception as e:
        data["error"] = f"{type(e).__name__}: {e}"
    slot.update(t=now, data=data)
    return jsonify(dict(data, enabled=enabled))


@app.route("/api/update/download", methods=["POST"])
def api_update_download():
    beta = load_config().get("beta_updates") is True
    channel = "beta" if beta else "stable"
    info = (_update_cache.get(channel) or {}).get("data")
    release = _release_cache.get(channel)
    if not info or not info.get("update") or not release:
        return jsonify({"ok": False, "error": "Check for updates first."}), 400
    result = updater.start_download(info, release)
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/update/status")
def api_update_status():
    return jsonify(updater.status())


@app.route("/api/update/apply", methods=["POST"])
def api_update_apply():
    result = updater.apply()
    if result.get("ok"):
        threading.Timer(0.8, os._exit, args=(0,)).start()
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/update/whatsnew", methods=["GET", "DELETE"])
def api_update_whatsnew():
    if request.method == "DELETE":
        updater.clear_whatsnew()
        return jsonify({"ok": True})
    return jsonify(updater.read_whatsnew() or {})


def _settings_bundle() -> dict:
    """Everything Settings export carries: config, memory files, MCP config.
    Account cookies are never part of it."""
    bundle = {"app": "Arena Desktop", "version": 1, "config": load_config(),
              "memory_global": _read_memory_file(GLOBAL_MEMORY_FILE, 100_000)}
    folder = _chosen_ws()
    bundle["memory_workspace"] = (
        _read_memory_file(Path(folder) / MEMORY_FILE_NAME, 100_000) if folder else None)
    try:
        mcp_file = connectors._config_path()
        bundle["mcp"] = json.loads(mcp_file.read_text(encoding="utf-8")) if mcp_file.exists() else None
    except Exception:
        bundle["mcp"] = None
    return bundle


@app.route("/api/settings/export")
def api_settings_export():
    return jsonify(_settings_bundle())


@app.route("/api/settings/import", methods=["POST"])
def api_settings_import():
    data = request.get_json(silent=True) or {}
    if data.get("app") != "Arena Desktop" or not isinstance(data.get("config"), dict):
        return jsonify({"error": "That file is not an Arena Desktop settings export.",
                        "code": "bad_file"}), 400
    backup_dir = COOKIE_FILE.parent / "backups"
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    try:
        backup_dir.mkdir(parents=True, exist_ok=True)
        (backup_dir / f"settings-{stamp}.json").write_text(
            json.dumps(_settings_bundle(), ensure_ascii=False, indent=1), encoding="utf-8")
    except OSError as e:
        return jsonify({"error": f"Could not back up the current settings first: {e}",
                        "code": "backup_failed"}), 500
    cfg = load_config()
    for key, val in data["config"].items():
        if key in _SETTINGS_ALLOWLIST:
            cfg[key] = val
    save_config(cfg)
    # Validate workspace_dir through the same rules as /api/workspace/set
    if "workspace_dir" in cfg:
        ws_raw = cfg["workspace_dir"]
        if isinstance(ws_raw, str) and ws_raw.strip():
            ws_path = Path(ws_raw).expanduser().resolve()
            if ws_path == Path(ws_path.anchor) or ws_path == Path.home().resolve():
                cfg.pop("workspace_dir", None)
                save_config(cfg)
    _MEMORY_CAP = 100_000
    warnings = []
    try:
        if isinstance(data.get("memory_global"), str):
            mem = data["memory_global"][:_MEMORY_CAP]
            GLOBAL_MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
            GLOBAL_MEMORY_FILE.write_text(mem, encoding="utf-8")
        folder = _chosen_ws()
        if folder and isinstance(data.get("memory_workspace"), str):
            mem = data["memory_workspace"][:_MEMORY_CAP]
            (Path(folder) / MEMORY_FILE_NAME).write_text(mem, encoding="utf-8")
        # MCP config is NOT imported — it can contain arbitrary commands that
        # auto-start without user approval.  Users must configure MCP servers
        # manually through the UI.
        if isinstance(data.get("mcp"), (dict, list)):
            warnings.append("MCP server config was skipped for security — configure servers manually.")
    except OSError as e:
        return jsonify({"error": f"Import partially failed: {e}", "code": "save_failed"}), 500
    result = {"ok": True, "backup": stamp}
    if warnings:
        result["warnings"] = warnings
    return jsonify(result)


_URL_RE = re.compile(r"(https?://[A-Za-z0-9.\-]+)(/[^\s'\"]*)?")


def _redact_urls(line: str) -> str:
    """Reduce URLs in a log line to scheme+host+path (never the query)."""
    return _URL_RE.sub(lambda m: m.group(1) + (m.group(2) or "").split("?")[0], line)


@app.route("/api/diagnostics")
def api_diagnostics():
    """A copyable support report: versions and state, no prompts or cookies."""
    import platform as _platform
    try:
        signed_in = COOKIE_FILE.exists() and COOKIE_FILE.stat().st_size > 0
    except OSError:
        signed_in = False
    lines = [
        f"Arena Desktop {APP_VERSION}",
        f"Platform: {_platform.platform()}",
        f"Python: {_platform.python_version()}",
        f"Packaged EXE: {bool(getattr(sys, 'frozen', False))}",
        f"Engine window: {_engine_on()}",
        f"Signed in (cookie present): {bool(signed_in)}",
        f"Permission mode: {_perm_mode()}",
        f"Workspace folder chosen: {_chosen_ws() is not None}",
        f"Memory enabled: {_memory_enabled()}",
        f"Local chats: {len(_list_chats())}",
    ]
    try:
        tail = (COOKIE_FILE.parent / "desktop.log").read_text(
            encoding="utf-8", errors="replace").splitlines()[-60:]
    except OSError:
        tail = []
    if tail:
        lines += ["", "--- desktop.log, last lines (URLs reduced to host+path) ---"]
        lines += [_redact_urls(line) for line in tail]
    return jsonify({"text": "\n".join(lines)})


@app.route("/api/diagnostics/run")
def api_diagnostics_run():
    """Run quick health checks and return structured pass/fail results."""
    import time as _t
    results = []

    t0 = _t.monotonic()
    try:
        import urllib.request
        req = urllib.request.Request("https://arena.ai/", method="HEAD")
        req.add_header("User-Agent", f"ArenaDesktop/{APP_VERSION}")
        urllib.request.urlopen(req, timeout=8)
        results.append({"name": "Arena.ai connection", "ok": True, "ms": int((_t.monotonic() - t0) * 1000)})
    except Exception as e:
        results.append({"name": "Arena.ai connection", "ok": False, "ms": int((_t.monotonic() - t0) * 1000), "detail": str(e)[:120]})

    # arena.ai's front page answers even while its chats are down, so ask
    # status.arena.ai whether the service itself works
    t0 = _t.monotonic()
    info = _refresh_arena_status()
    row = {"name": "Arena.ai service status", "ms": int((_t.monotonic() - t0) * 1000)}
    if info["indicator"] == "none":
        row.update(ok=True, detail=info["description"] or "All Systems Operational")
    elif info["indicator"] == "unknown":
        row.update(ok=None, detail="status.arena.ai did not answer")
    else:
        detail = info["description"] or "Incident reported"
        row.update(ok=False, detail=f"{detail}: {info['incident']}" if info["incident"] else detail)
    results.append(row)

    t0 = _t.monotonic()
    try:
        client = get_client()
        if not _signed_in_somewhere(client) and not _engine_on():
            ok, detail = False, "Not signed in"
        else:
            user, err = _check_session(client, force=True)
            ok, detail = bool(user), err
            if not user and err and (err.startswith(("HTTP 5", "Network error"))
                                     or info["indicator"] in _ARENA_DOWN):
                ok, detail = None, f"Could not check: arena.ai did not answer ({err})"
        results.append({"name": "Account health", "ok": ok, "ms": int((_t.monotonic() - t0) * 1000),
                        "detail": None if ok else detail})
    except Exception as e:
        results.append({"name": "Account health", "ok": False, "ms": int((_t.monotonic() - t0) * 1000), "detail": str(e)[:120]})

    t0 = _t.monotonic()
    try:
        from arena.crypto import decrypt, encrypt
        test = b"arena-diag-check"
        ok = decrypt(encrypt(test)) == test
        results.append({"name": "Encryption (DPAPI)", "ok": ok, "ms": int((_t.monotonic() - t0) * 1000),
                        "detail": None if ok else "Encrypt and decrypt did not match"})
    except Exception as e:
        results.append({"name": "Encryption (DPAPI)", "ok": False, "ms": int((_t.monotonic() - t0) * 1000), "detail": str(e)[:120]})

    t0 = _t.monotonic()
    ws = _chosen_ws()
    if ws is None:
        results.append({"name": "Workspace access", "ok": None, "ms": 0, "detail": "No folder selected"})
    else:
        try:
            ok = os.path.isdir(ws) and os.access(ws, os.R_OK | os.W_OK)
            results.append({"name": "Workspace access", "ok": ok, "ms": int((_t.monotonic() - t0) * 1000),
                            "detail": None if ok else "Folder not accessible"})
        except Exception as e:
            results.append({"name": "Workspace access", "ok": False, "ms": int((_t.monotonic() - t0) * 1000), "detail": str(e)[:120]})

    t0 = _t.monotonic()
    try:
        import urllib.request
        req = urllib.request.Request("https://api.github.com/repos/PlayzAe/arena.ai-desktop/releases/latest")
        req.add_header("User-Agent", f"ArenaDesktop/{APP_VERSION}")
        urllib.request.urlopen(req, timeout=8)
        results.append({"name": "Update server (GitHub)", "ok": True, "ms": int((_t.monotonic() - t0) * 1000)})
    except Exception as e:
        results.append({"name": "Update server (GitHub)", "ok": False, "ms": int((_t.monotonic() - t0) * 1000), "detail": str(e)[:120]})

    return jsonify({"results": results})


_QUESTIONS: dict = {}
_questions_lock = threading.Lock()
_MEDIA_CHOICES: dict = {}
_media_choices_lock = threading.Lock()
QUESTION_TIMEOUT = 600
_NATIVE_CAS_HASH_RE = re.compile(r"^[A-Za-z0-9_-]{43}$")
STREAM_IDLE_TIMEOUT = 90   # seconds of silence before a stalled model stream is closed
CHILD_TIME_BUDGET = 360    # max seconds one sub-agent (or fan-out child) may run


def _question_answer(qid):
    with _questions_lock:
        q = _QUESTIONS.get(qid)
        return (q or {}).get("answer")


def _media_choice_answer(choice_id):
    with _media_choices_lock:
        item = _MEDIA_CHOICES.get(choice_id)
        return copy.deepcopy((item or {}).get("answer"))


def _native_cas_url(media_hash) -> Optional[str]:
    value = str(media_hash or "")
    return f"/api/native-cas/{value}" if _NATIVE_CAS_HASH_RE.match(value) else None


def _apply_media_attribution(choice: dict, attribution) -> dict:
    """Attach model reveal data to a media choice and each candidate."""
    if not isinstance(choice, dict):
        return choice
    if not isinstance(attribution, list):
        attribution = []
    by_index = {}
    current = choice.get("attribution") if isinstance(choice.get("attribution"), list) else []
    for item in [*current, *attribution]:
        if not isinstance(item, dict):
            continue
        try:
            index = int(item.get("index"))
        except (TypeError, ValueError):
            continue
        merged = dict(by_index.get(index) or {"index": index})
        for key in ("model_name", "organization", "is_private"):
            if item.get(key) not in (None, ""):
                merged[key] = item[key]
        by_index[index] = merged
    choice["attribution"] = [by_index[key] for key in sorted(by_index)]
    for candidate in choice.get("candidates") or []:
        if not isinstance(candidate, dict):
            continue
        reveal = by_index.get(candidate.get("index")) or {}
        for key in ("model_name", "organization", "is_private"):
            if reveal.get(key) not in (None, ""):
                candidate[key] = reveal[key]
    return choice


def _public_media_choice(choice: dict, choice_id=None, tool_call_id=None, chat_id=None) -> dict:
    """Desktop-safe form of one native image choice.

    Arena identifies generated candidates by content hash, not a public URL.
    The UI therefore receives this app's authenticated same-origin CAS proxy
    URL.  The hash remains in the saved choice so a later reopen can fetch the
    same candidate again and so the exact server output can be rebuilt.
    """
    public = copy.deepcopy(choice or {})
    public.setdefault("kind", "image")
    public.setdefault("status", "awaiting_user_response")
    if choice_id:
        public["id"] = str(choice_id)
    if tool_call_id:
        public["tool_call_id"] = str(tool_call_id)
    if chat_id:
        public["chat_id"] = str(chat_id)
    candidates = []
    for candidate in public.get("candidates") or []:
        if not isinstance(candidate, dict):
            continue
        item = dict(candidate)
        url = item.get("url")
        if not (isinstance(url, str) and url.startswith(("http://", "https://", "/api/native-cas/"))):
            item["url"] = _native_cas_url(item.get("hash"))
        candidates.append(item)
    public["candidates"] = candidates
    return _apply_media_attribution(public, public.get("attribution") or [])


def _parse_todos(raw: str) -> list:
    """Parse a model checklist: one step per line, [x]/[~]/[ ] markers."""
    items = []
    for line in str(raw or "").splitlines():
        line = line.strip().lstrip("-*").strip()
        if not line:
            continue
        status = "pending"
        marker = line[:3].lower()
        if marker in ("[x]", "[\u2713]"):
            status, line = "done", line[3:].strip()
        elif marker in ("[~]", "[>]", "[*]", "[-]"):
            status, line = "doing", line[3:].strip()
        elif marker == "[ ]":
            line = line[3:].strip()
        if line:
            items.append({"text": line[:200], "status": status})
        if len(items) >= 30:
            break
    return items


@app.route("/api/questions")
def api_questions():
    """Questions from models that are still waiting for the user."""
    with _questions_lock:
        items = [{k: q.get(k) for k in ("id", "chat_id", "kind", "question", "plan", "options", "custom", "lane", "subagent")}
                 for q in _QUESTIONS.values() if q.get("answer") is None]
    return jsonify(items)


@app.route("/api/questions/<qid>", methods=["POST"])
def api_question_answer(qid):
    data = request.get_json(silent=True) or {}
    answer = str(data.get("answer") or "").strip()
    if not answer:
        return jsonify({"error": "Write or pick an answer first.", "code": "empty"}), 400
    with _questions_lock:
        q = _QUESTIONS.get(qid)
        if not q or q.get("answer") is not None:
            return jsonify({"error": "That question is no longer waiting.", "code": "gone"}), 404
        q["answer"] = answer[:2000]
    return jsonify({"ok": True})


@app.route("/api/media-choices")
def api_media_choices():
    """Native Agent image choices still waiting for the user."""
    with _media_choices_lock:
        items = []
        for item in _MEDIA_CHOICES.values():
            if item.get("answer") is not None:
                continue
            public = copy.deepcopy(item.get("media_choice") or {})
            public.update({
                "id": item.get("id"),
                "chat_id": item.get("chat_id"),
                "tool_call_id": item.get("tool_call_id"),
            })
            items.append(public)
    return jsonify(items)


@app.route("/api/media-choices/<choice_id>", methods=["POST"])
def api_media_choice_answer(choice_id):
    data = request.get_json(silent=True) or {}
    skip = data.get("skip") is True or data.get("selection_method") == "skip"
    with _media_choices_lock:
        item = _MEDIA_CHOICES.get(choice_id)
        if not item or item.get("answer") is not None:
            return jsonify({"error": "That image choice is no longer waiting.", "code": "gone"}), 404
        candidates = ((item.get("media_choice") or {}).get("candidates") or [])
        indexes = []
        for candidate in candidates:
            try:
                indexes.append(int(candidate.get("index")))
            except (AttributeError, TypeError, ValueError):
                pass
        if not indexes:
            return jsonify({"error": "This image choice has no candidates.", "code": "empty"}), 422
        if skip:
            selected = indexes[0]
        else:
            try:
                selected = int(data.get("selected_index"))
            except (TypeError, ValueError):
                return jsonify({"error": "Pick one of the images first.", "code": "empty"}), 400
            if selected not in indexes:
                return jsonify({"error": "That image is not one of the choices.", "code": "bad_index"}), 400
        item["answer"] = {
            "selected_index": selected,
            "selection_method": "skip" if skip else "user",
        }
    return jsonify({"ok": True, "selected_index": selected,
                    "selection_method": "skip" if skip else "user"})


@app.route("/api/native-cas/<media_hash>")
def api_native_cas(media_hash):
    """Authenticated same-origin proxy for Arena Agent CAS candidates.

    The candidate identifiers in the native stream are content hashes.  The
    website serves them from /api/chat/workspace/cas/user/<hash> with the
    signed-in session; proxying keeps the image same-origin for the desktop
    UI and means no cookie or signed URL is ever persisted in chat.json.
    """
    if not _NATIVE_CAS_HASH_RE.match(str(media_hash or "")):
        return jsonify({"error": "Invalid media identifier"}), 400
    client = get_client()
    if _engine_on():
        if ENGINE.ready():
            try:
                ENGINE.sync_to(client)
            except Exception:
                LOG.exception("native CAS: engine cookie sync failed")
        elif not client.cookie_str:
            return jsonify({"error": "arena.ai session is still loading"}), 503
    if not _signed_in_somewhere(client):
        return jsonify({"error": "Not signed in"}), 401
    try:
        upstream = client.session.get(
            f"{contracts.ORIGIN}/api/chat/workspace/cas/user/{media_hash}",
            timeout=60)
    except requests.RequestException as exc:
        return jsonify({"error": f"Could not load this image: {exc}"}), 503
    if upstream.status_code != 200:
        return jsonify({"error": f"Arena returned HTTP {upstream.status_code} for this image"}), (
            upstream.status_code if 400 <= upstream.status_code < 600 else 502)
    content = upstream.content or b""
    if len(content) > 35 * 1024 * 1024:
        return jsonify({"error": "This image is too large to preview"}), 413
    content_type = upstream.headers.get("Content-Type") or "application/octet-stream"
    response = Response(content, content_type=content_type)
    response.headers["Cache-Control"] = "private, max-age=3600"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Content-Disposition"] = "inline"
    return response
