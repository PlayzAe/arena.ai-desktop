# Arena Desktop web backend, part 9 of 11: send.
# File attachments (Arena storage), uploads, and the /api/chat send route.
#
# Not a standalone module: arena/web/app.py runs the parts in order
# inside its own namespace, so names from earlier parts are in scope.

# ---------- file attachments (Arena storage) ----------

_ATTACHMENT_EXT_MIME = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".gif": "image/gif", ".pdf": "application/pdf",
    ".txt": "text/plain", ".md": "text/markdown", ".csv": "text/csv",
    ".html": "text/html", ".htm": "text/html", ".xml": "text/xml",
    ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
    ".json": "application/json",
}


def _attachment_media_type(filename: str, declared: str) -> str:
    """Resolve a file's media type the way Arena's uploader does (extension wins for text kinds)."""
    ext = Path(filename or "").suffix.lower()
    by_ext = _ATTACHMENT_EXT_MIME.get(ext)
    declared = (declared or "").split(";", 1)[0].strip().lower()
    if by_ext and (not declared or declared in ("application/octet-stream", "text/plain")
                   or by_ext.startswith("text/") or by_ext == "application/json"):
        return by_ext
    return declared or by_ext or "application/octet-stream"


def _validate_upload(kind: str, media_type: str, size: int, modality: str) -> Optional[str]:
    """Mirror Arena's attachment rules; returns a friendly refusal or None."""
    if kind == "agent":
        if media_type not in contracts.AGENT_ATTACHMENT_MIME_TYPES:
            return ("Agent Mode accepts PNG, WebP, JPEG, GIF, PDF, TXT, MD, CSV, HTML, XML, CSS, JS and JSON files.")
        if media_type == "application/pdf" and size > contracts.AGENT_PDF_MAX_BYTES:
            return "PDF files can be up to 10 MB in Agent Mode."
        if size > contracts.AGENT_ATTACHMENT_MAX_BYTES:
            return "Files can be up to 25 MB in Agent Mode."
        return None
    if media_type not in contracts.EVAL_ATTACHMENT_MIME_TYPES:
        return ("This mode accepts PNG, JPEG, WebP and PDF files. "
                "Agent Mode accepts more file types.")
    limit = (contracts.VIDEO_ATTACHMENT_MAX_BYTES if modality == "video"
             else contracts.EVAL_ATTACHMENT_MAX_BYTES)
    if size > limit:
        return f"Files can be up to {limit // (1024 * 1024)} MB here."
    return None


def _storage_put(upload_url: str, data: bytes, media_type: str) -> Optional[str]:
    """PUT bytes to Arena's presigned storage URL; returns an error or None."""
    try:
        resp = requests.put(upload_url, data=data,
                            headers={"Content-Type": media_type}, timeout=180)
    except requests.RequestException as e:
        return f"Upload failed: {e}"
    if resp.status_code not in (200, 201, 204):
        return f"Arena storage refused the upload (HTTP {resp.status_code})."
    return None


_IMAGE_CONVERT_EXT = {".bmp", ".dib", ".tif", ".tiff", ".ico", ".avif", ".tga", ".ppm", ".pgm",
                      ".pbm", ".jfif", ".pjpeg", ".gif", ".heic", ".heif", ".jp2", ".psd", ".pcx"}
_TEXTLIKE_EXT = {".py", ".pyw", ".ts", ".tsx", ".jsx", ".java", ".go", ".rs", ".c", ".h", ".cpp", ".cc",
                 ".hpp", ".cs", ".rb", ".php", ".swift", ".kt", ".kts", ".scala", ".sh", ".bash", ".zsh",
                 ".ps1", ".psm1", ".bat", ".cmd", ".sql", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf",
                 ".log", ".r", ".lua", ".pl", ".dart", ".vue", ".svelte", ".scss", ".sass", ".less",
                 ".gradle", ".properties", ".tex", ".rst", ".svg", ".ipynb", ".tsv", ".srt", ".vtt",
                 ".env", ".gitignore", ".dockerfile", ".makefile", ".mk", ".asm", ".s", ".m", ".jl", ".ex",
                 ".exs", ".erl", ".hs", ".clj", ".fs", ".vb", ".zig", ".nim", ".sol", ".proto", ".graphql"}


def _looks_like_text(data: bytes) -> bool:
    head = data[:8192]
    if b"\x00" in head:
        return False
    try:
        head.decode("utf-8")
        return True
    except UnicodeDecodeError as e:
        return e.start >= len(head) - 4  # a multi-byte char cut at the sample edge


def _convert_attachment(filename: str, data: bytes, media_type: str, kind: str):
    """Middleman for files Arena refuses: (filename, data, media_type, note).

    Images Arena does not take (BMP, TIFF, ICO, AVIF, GIF outside Agent Mode ...)
    become PNG; code and other text files become text/plain for Agent Mode.
    Anything else is returned unchanged and the normal validation explains why
    it cannot be sent."""
    ext = Path(filename).suffix.lower()
    allowed = (contracts.AGENT_ATTACHMENT_MIME_TYPES if kind == "agent"
               else contracts.EVAL_ATTACHMENT_MIME_TYPES)
    if media_type in allowed:
        return filename, data, media_type, None
    if media_type.startswith("image/") and media_type != "image/svg+xml" or ext in _IMAGE_CONVERT_EXT:
        if ext in (".heic", ".heif"):
            raise ValueError("HEIC/HEIF photos cannot be converted here yet. Export the photo as JPEG or PNG and attach that.")
        try:
            from PIL import Image
            with Image.open(io.BytesIO(data)) as im:
                im.seek(0)
                frame = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P", "PA") else "RGB")
            frame.thumbnail((4096, 4096))
            buf = io.BytesIO()
            frame.save(buf, "PNG", optimize=True)
            return (Path(filename).stem or "image") + ".png", buf.getvalue(), "image/png", \
                f"converted {ext or media_type} to PNG"
        except Exception:
            LOG.info("attachment image conversion failed for %s", ext or media_type, exc_info=True)
            return filename, data, media_type, None
    if kind == "agent" and (ext in _TEXTLIKE_EXT or media_type.startswith("text/") or _looks_like_text(data)):
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            text = data.decode("latin-1")
        return filename + ".txt", text.encode("utf-8"), "text/plain", f"sent {ext or 'the file'} as plain text"
    return filename, data, media_type, None


@app.route("/api/uploads", methods=["POST"])
def api_uploads():
    """Upload one attachment to Arena's storage, exactly like arena.ai's composer.

    kind=evaluation: presigned PUT + signed read URL -> {name, contentType, url}.
    kind=agent: content-addressed PUT -> {filename, mediaType, url} where url
    is Arena's /api/chat/workspace/cas/user/<sha256> path the Agent reads.
    """
    client = get_client()
    if not _signed_in_somewhere(client):
        return jsonify({"error": "Not signed in. Press Sign in first.", "code": "auth"}), 401
    kind = (request.form.get("kind") or "evaluation").strip().lower()
    if kind not in ("evaluation", "agent"):
        kind = "evaluation"
    modality = (request.form.get("modality") or "").strip().lower()
    upload = request.files.get("file")
    if upload is None:
        return jsonify({"error": "No file was sent.", "code": "bad_request"}), 400
    filename = Path(upload.filename or "file").name or "file"
    data = upload.read()
    if not data:
        return jsonify({"error": "That file is empty.", "code": "bad_request"}), 400
    media_type = _attachment_media_type(filename, upload.mimetype or "")
    try:
        filename, data, media_type, converted = _convert_attachment(filename, data, media_type, kind)
    except ValueError as e:
        return jsonify({"error": str(e), "code": "unsupported_attachment"}), 400
    if converted:
        LOG.info("upload middleman: %s", converted)
    refusal = _validate_upload(kind, media_type, len(data), modality)
    if refusal:
        if kind != "agent" and _looks_like_text(data):
            refusal += " Text and code files can be attached in Agent Mode."
        return jsonify({"error": refusal, "code": "unsupported_attachment"}), 400
    if kind == "agent":
        digest = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).decode().rstrip("=")
        minted, error, _ = _arena_post_json(
            contracts.PATHS["storage_agent_upload_url"],
            {"hash": digest, "contentType": media_type, "size": len(data)}, timeout=60)
        if error or not isinstance(minted, dict) or not minted.get("uploadUrl"):
            return jsonify({"error": error or "Arena did not accept the file.", "code": "arena_upload"}), 502
        put_error = _storage_put(minted["uploadUrl"], data, media_type)
        if put_error:
            return jsonify({"error": put_error, "code": "arena_upload"}), 502
        return jsonify({"ok": True, "kind": "agent", "filename": filename, "mediaType": media_type,
                        "url": f"/api/chat/workspace/cas/user/{digest}",
                        "size": len(data), "hash": digest})
    minted, error, _ = _arena_post_json(
        contracts.PATHS["storage_upload_url"],
        {"fileName": filename, "contentType": media_type}, timeout=60)
    if error or not isinstance(minted, dict) or not minted.get("uploadUrl") or not minted.get("key"):
        return jsonify({"error": error or "Arena did not accept the file.", "code": "arena_upload"}), 502
    put_error = _storage_put(minted["uploadUrl"], data, media_type)
    if put_error:
        return jsonify({"error": put_error, "code": "arena_upload"}), 502
    signed, error, _ = _arena_post_json(
        contracts.PATHS["storage_signed_url"], {"key": minted["key"]}, timeout=60)
    if error or not isinstance(signed, dict) or not signed.get("url"):
        return jsonify({"error": error or "Arena did not return a file link.", "code": "arena_upload"}), 502
    return jsonify({"ok": True, "kind": "evaluation", "name": filename, "contentType": media_type,
                    "url": signed["url"], "size": len(data)})


def _request_attachments(data: dict, native_agent_files: bool):
    """Sanitize client-supplied attachments into wire shape for this turn.

    Returns (attachments, error). Evaluation entries are experimental
    attachments {name, contentType, url}; native Agent entries are file
    parts {filename, mediaType, url} handled by native_agent.user_message.
    """
    raw = data.get("attachments") if isinstance(data.get("attachments"), list) else []
    out = []
    total = 0
    for item in raw[:contracts.AGENT_ATTACHMENTS_MAX_PER_TURN]:
        if not isinstance(item, dict):
            continue
        url = item.get("url")
        name = str(item.get("name") or item.get("filename") or "file")[:200]
        media = str(item.get("contentType") or item.get("mediaType") or "").split(";", 1)[0].strip().lower()
        try:
            size = int(item.get("size") or 0)
        except (TypeError, ValueError):
            size = 0
        if not isinstance(url, str) or not url or not media:
            return None, "One attachment is missing its upload link. Remove it and attach the file again."
        total += max(0, size)
        if native_agent_files:
            out.append({"filename": name, "mediaType": media, "url": url, "size": size})
        else:
            out.append({"name": name, "contentType": media, "url": url, "size": size})
    if native_agent_files and total > contracts.AGENT_ATTACHMENTS_MAX_BYTES_PER_TURN:
        return None, "Agent Mode accepts up to 50 MB of files per message."
    return out, None


@app.route("/api/chat", methods=["POST"])
def api_chat():
    # Selection resolution still touches a few module-level Fields, so the
    # short synchronous setup is serialized; the returned SSE generators
    # then run fully in parallel, one thread per chat.
    with _chat_setup_lock:
        return _api_chat_impl()


def _api_chat_impl():
    global _current_chat_id, _conversation_history, _ui_mode, _ui_modality
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    if not message:
        return jsonify({"error": "Empty message"}), 400
    client = get_client()
    if not _signed_in_somewhere(client):
        return jsonify({"error": "Not signed in. Press Sign in first.", "code": "auth"}), 401
    chat_id = data.get("chat_id") or str(uuid.uuid4())
    if not isinstance(chat_id, str) or not _validate_chat_id(chat_id):
        return jsonify({"error": "Invalid chat ID", "code": "bad_request"}), 400
    if _chat_generating(chat_id):
        return jsonify({"error": "This chat is still working on the previous message. "
                        "Other chats can be used meanwhile.", "code": "busy"}), 409
    existing = _load_chat(chat_id) or {}
    # The folder this reply works in: the one the composer shows right now
    # (opening a chat switches the composer to that chat's saved folder).
    # It is pinned for the whole reply and saved with the chat.
    chat_ws = _chosen_ws()
    ws_note = ""
    old_ws = existing.get("workspace")
    if chat_ws is not None and old_ws and existing.get("tools_guide") and Path(old_ws) != chat_ws:
        ws_note = (f"[Arena Desktop] This chat's project folder is now {chat_ws} (before: {old_ws}). "
                   "Tool paths are relative to the new folder.\n")
    # A started chat keeps its mode and modality, like on the Arena website
    # (picking another one there opens a new chat).  Forcing the stored
    # values here means a follow-up can never silently fork a different Arena
    # conversation.  Only the Direct / Side by Side models may change
    # between messages, exactly as on arena.ai.
    locked = any(isinstance(m, dict) and m.get("role") in ("user", "assistant")
                 for m in (existing.get("messages") or []))
    # The composer sends its visible selection with every request.  Honoring it
    # here makes the request self-describing: a slow status answer or a chat
    # load can no longer silently turn an "Agent" send into a Direct chat.
    # Clients that omit the Fields keep the legacy /api/mode state behavior.
    req_mode = data.get("mode") if isinstance(data.get("mode"), str) and data.get("mode") else _ui_mode
    req_modality = (data.get("modality") if isinstance(data.get("modality"), str)
                    and data.get("modality") else _ui_modality)
    if locked:
        req_mode, req_modality = contracts.normalize_ui_selection(
            existing.get("mode"), existing.get("modality"))
        if req_modality == "auto":
            # A started chat no longer has an Auto work type: it was resolved
            # when its first message was created (legacy saves meant Text).
            req_modality = "text"
    else:
        # Mode wins over a stale Auto selection for a new chat. Agent has no
        # work-type selector on Arena, and Auto is Battle-only, so neither
        # state should make the first send fail with an ordering error.
        if req_mode == "agent" or (req_modality == "auto" and req_mode != "battle") \
                or (req_modality == "auto" and existing.get("eval_id")):
            req_modality = "text"
    selection_error = _selection_error(req_mode, req_modality)
    if selection_error:
        return jsonify({"error": selection_error, "code": "unsupported_selection"}), 400
    _ui_mode, _ui_modality = req_mode, req_modality
    client.active_mode = contracts.api_mode(_ui_mode)
    client.active_modality = contracts.api_modality(_ui_modality)
    mode, modality = contracts.validate_ui_selection(_ui_mode, _ui_modality)
    if _ui_mode == "battle" and _ui_modality == "auto" and not locked and not existing.get("eval_id"):
        # Battle+Auto, exactly like the website: Arena's router picks the
        # concrete work type for this new chat, and the chat keeps it.
        raw_attachments = data.get("attachments") if isinstance(data.get("attachments"), list) else []
        has_image = any(
            isinstance(item, dict) and str(item.get("contentType") or item.get("mediaType")
                                           or item.get("type") or item.get("mimeType") or "").startswith("image/")
            for item in raw_attachments)
        modality = _resolve_auto_modality(message, has_image=has_image)
        _ui_modality = {"chat": "text", "webdev": "code"}.get(modality, modality)
        client.active_modality = modality
    model_a, model_b = data.get("model_id") or None, data.get("model_id_b") or None
    fanout_models = [str(m) for m in (data.get("fanout_models") or [])
                     if isinstance(m, (str, int)) and str(m)][0:4]
    if len(fanout_models) < 2:
        fanout_models = []
    if fanout_models and not model_a:
        model_a = fanout_models[0]
    if locked:
        if _ui_mode in ("direct", "side-by-side"):
            # arena.ai lets Direct and Side by Side swap models between
            # messages (the follow-up carries the new modelAId/modelBId);
            # a missing pick keeps the chat's current model.
            model_a = model_a or existing.get("model_a")
            model_b = (model_b or existing.get("model_b")) if _ui_mode == "side-by-side" else None
        elif _ui_mode in ("battle", "agent"):
            model_a = model_b = None

    if _ui_mode == "battle":
        if model_a or model_b:
            return jsonify({"error": "Battle mode does not accept chosen models; Arena selects both models.",
                            "code": "unsupported_selection"}), 400
    elif _ui_mode == "agent":
        if model_a or model_b:
            return jsonify({"error": "Agent mode does not accept a chosen model; its model is assigned automatically.",
                            "code": "unsupported_selection"}), 400
        # Never gate Agent on Max.  Prefer an ordinary selectable text model
        # internally; if the catalog is unavailable, build_chat(auto_model)
        # lets Arena assign one.  The chosen ID/name is not shown in Agent UI.
        auto = _auto_agent_model()
        model_a = auto.get("model_id", auto.get("id")) if auto else None
    else:
        if not model_a:
            return jsonify({"error": "Pick a model first: Direct and Side by Side need one.", "code": "bad_request"}), 400
        allowed_ids = _allowed_model_ids(_ui_mode, _ui_modality)
        if allowed_ids and str(model_a) not in allowed_ids:
            return jsonify({"error": "That model is not available for this mode and modality in Arena's catalog.",
                            "code": "unsupported_selection"}), 400
        if _ui_mode == "direct" and model_b:
            return jsonify({"error": "Direct mode accepts exactly one model.", "code": "unsupported_selection"}), 400
        if _ui_mode == "side-by-side":
            if not model_b:
                return jsonify({"error": "Pick a second model for Side by Side.", "code": "bad_request"}), 400
            if str(model_a) == str(model_b):
                return jsonify({"error": "Side by Side compares two different models.", "code": "unsupported_selection"}), 400
            if allowed_ids and str(model_b) not in allowed_ids:
                return jsonify({"error": "Model B is not available for this mode and modality in Arena's catalog.",
                                "code": "unsupported_selection"}), 400
    if modality == "video" and len(message) > contracts.VIDEO_MESSAGE_MAX_LENGTH:
        return jsonify({"error": f"Video prompts can be up to {contracts.VIDEO_MESSAGE_MAX_LENGTH} characters. "
                        "Shorten the prompt and send again.", "code": "too_large"}), 400
    _current_chat_id = chat_id
    _stop.clear()
    _chat_stop_event(chat_id).clear()
    agent_backend = None
    if _ui_mode == "agent":
        # A chat keeps the Agent backend it was created with; the composer
        # only chooses for new chats.  Clients that omit the Field keep the
        # historical local loop.
        stored_backend = existing.get("agent_backend") or ((existing.get("native") or {}).get("backend"))
        requested_backend = data.get("agent_backend") if data.get("agent_backend") in ("arena", "local") else None
        agent_backend = stored_backend or requested_backend or "local"
    native_turn = _ui_mode == "agent" and agent_backend == "arena"
    turn_attachments, attachment_error = _request_attachments(data, native_turn)
    if attachment_error:
        return jsonify({"error": attachment_error, "code": "unsupported_attachment"}), 400
    if _ui_mode == "agent" and agent_backend == "arena":
        tz = data.get("timezone") if isinstance(data.get("timezone"), str) else None
        title = existing.get("title") or _smart_title(message)
        if not existing.get("title"):
            _schedule_arena_title(chat_id)
        nat_history = list(existing.get("messages") or [])
        user_entry = {"role": "user", "text": message}
        if turn_attachments:
            user_entry["attachments"] = turn_attachments
        nat_history.append(user_entry)
        _conversation_history = nat_history
        # The chat exists (and shows in the sidebar) from the moment the
        # prompt is sent — not only when the agent finishes.
        try:
            _save_chat(chat_id, title=title, messages=list(nat_history), mode="agent",
                       modality="text", model_a=None, model_b=None,
                       eval_id=(existing.get("native") or {}).get("session_id") or existing.get("eval_id"),
                       agent_backend="arena", native=existing.get("native"),
                       workspace=str(chat_ws) if chat_ws is not None else None)
        except Exception:
            LOG.exception("native chat early save failed")
        # Persistent memory + a pending compaction digest ride along with
        # the first message of a fresh Arena session (memory resends only
        # when its text changed).
        native_prefix = ""
        native_mem_hash = existing.get("memory_hash")
        native_digest = existing.get("pending_digest") or ""
        if _memory_enabled():
            block, mem_hash = _memory_block(_chosen_ws())
            fresh_native = not (existing.get("native") or {}).get("session_id")
            if block and (fresh_native or native_digest or mem_hash != native_mem_hash):
                native_prefix += block
                native_mem_hash = mem_hash
        if native_digest:
            native_prefix += _digest_block(native_digest)
        # Agent Gateway: the Arena session learns the temporary tunnel
        # address + pairing through the hidden-prefix channel (same as
        # memory/digest). A continued session is re-handed the block when
        # the gateway session it knows is gone — stopped, idle-expired or
        # from a previous app run — so turning the gateway off and on (or
        # coming back tomorrow) no longer strands the chat with dead
        # credentials. Only with both opt-ins and Workspace Sync on.
        gateway_key = existing.get("gateway_session") or ""
        try:
            gateway_block = _gateway_injection(data)
            current_key = _gateway_session_key() if gateway_block else ""
            fresh_session = not (existing.get("native") or {}).get("session_id")
            if gateway_block and current_key and (fresh_session or current_key != gateway_key):
                native_prefix += gateway_block + "\n"
                gateway_key = current_key
                LOG.info("gateway: injected session block into %s native chat",
                         "new" if fresh_session else "continued")
        except Exception:
            LOG.exception("gateway injection failed")
        native_message = native_prefix + message

        def native_generate():
            _tl.error = None
            yield _sse({"type": "meta", "dual": False, "mode": "agent", "modality": "text",
                        "chat_id": chat_id, "permission_mode": _perm_mode(),
                        "names": {"a": "Agent", "b": None}})
            # The chat is persisted from the finally-block below, on EVERY
            # exit path (normal end, Stop, client disconnect): the native
            # session coordinates are published into `out` as they become
            # known, so the next message always continues this very chat
            # instead of starting a new Arena session.
            out = {"text": "", "reasoning": "", "tools": [], "files": [],
                   "native": existing.get("native"), "error": None}
            saved = False
            session_persisted = bool((existing.get("native") or {}).get("session_id"))
            try:
                run = _native_agent_run(client, native_message, existing, tz, result=out,
                                        files=turn_attachments or None,
                                        sync=data.get("tools") is not False)
                returned = None
                while True:
                    try:
                        event = next(run)
                    except StopIteration as stop:
                        returned = stop.value
                        break
                    # Persist the Arena session coordinates the moment the
                    # session exists on Arena, so the chat is continuable
                    # even while the agent is still working.
                    if not session_persisted and (out.get("native") or {}).get("session_id"):
                        session_persisted = True
                        try:
                            _save_chat(chat_id, title=title, messages=list(nat_history), mode="agent",
                                       modality="text", model_a=None, model_b=None,
                                       eval_id=out["native"]["session_id"],
                                       agent_backend="arena", native=out["native"],
                                       gateway_session=gateway_key or None)
                        except Exception:
                            LOG.exception("native chat session save failed")
                    yield event
                if returned is not None:
                    out = returned
                if out.get("files") and data.get("tools") is not False:
                    bridge_state = out.get("native") or existing.get("native") or {}
                    out["native"] = bridge_state
                    yield from _native_file_bridge(out["files"], bridge_state)
            finally:
                if not saved:
                    saved = True
                    reply = {"role": "assistant", "text": out.get("text", ""), "text_b": "",
                             "names": {"a": "Agent", "b": None}}
                    if out.get("reasoning"):
                        reply["reasoning"] = out["reasoning"]
                    if out.get("tools"):
                        reply["tools"] = out["tools"]
                    previews = list(out.get("previews") or [])
                    previews += [u for u in _ARENA_SITE.findall(out.get("text") or "") if u not in previews]
                    if previews:
                        reply["previews"] = previews[:5]
                    if out.get("error") and not out.get("text"):
                        reply["error"] = out["error"]
                    nat_history.append(reply)
                    native_state = out.get("native") or existing.get("native")
                    try:
                        _save_chat(chat_id, title=title, messages=nat_history, mode="agent",
                                   modality="text", model_a=None, model_b=None,
                                   eval_id=(native_state or {}).get("session_id"),
                                   agent_backend="arena", native=native_state,
                                   memory_hash=native_mem_hash,
                                   gateway_session=gateway_key or None,
                                   pending_digest=("" if native_digest else None))
                    except Exception:
                        LOG.exception("native chat save failed")
            yield _sse({"type": "done", "text_a": out.get("text", ""), "text_b": "",
                        "dual": False, "chat_id": chat_id,
                        "history_chars": _history_chars(nat_history)})

        return Response(
            stream_with_context(_sse_wrap(native_generate(), chat_id=chat_id, workspace_dir=chat_ws)),
            mimetype="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    # Each chat keeps its own history and Arena conversation.  A started
    # chat is locked to its stored mode/modality/models above, so `same`
    # holds for every follow-up and the same Arena conversation continues.
    existing_pair = contracts.normalize_ui_selection(existing.get("mode"), existing.get("modality")) if existing else (None, None)
    if existing_pair[1] == "auto" and (existing.get("messages") or existing.get("eval_id")):
        existing_pair = (existing_pair[0], "text")
    same = bool(existing) and existing_pair == (_ui_mode, _ui_modality)
    if _ui_mode == "agent" and same:
        preferred = _auto_agent_model(existing.get("model_a"))
        if preferred:
            model_a = preferred.get("model_id", preferred.get("id"))
    eval_id = existing.get("eval_id") if same else None
    wire_attachments = [
        {key: item[key] for key in ("name", "contentType", "url") if item.get(key)}
        for item in turn_attachments
    ]
    conv = {"eval_id": eval_id, "new": not eval_id, "mode": mode, "modality": modality,
            "model_a": model_a, "model_b": model_b, "chat_id": chat_id,
            "auto_model": _ui_mode == "agent", "reasoning": {"a": "", "b": ""},
            "lane_errors": {"a": [], "b": []},
            "attachments": wire_attachments or None,
            "guide_sent": bool(existing.get("tools_guide")),
            "mcp_guide_hash": existing.get("mcp_guide_hash"),
            "memory_hash": existing.get("memory_hash"),
            "delegate_sent": bool(existing.get("delegate_guide")),
            "title": existing.get("title") or _smart_title(message), "tools": []}
    if not existing.get("title"):
        _schedule_arena_title(chat_id)
    history = list(existing.get("messages") or [])
    user_entry = {"role": "user", "text": message}
    if turn_attachments:
        user_entry["attachments"] = turn_attachments
    history.append(user_entry)
    _conversation_history = history
    # The chat (with the user's prompt and its Arena session id) is on disk
    # from the moment the prompt is sent, so it shows in the sidebar and can
    # be reopened while the answer is still generating.
    if conv["new"] and not conv.get("eval_id"):
        conv["eval_id"] = generate_uuidv7()
    try:
        _save_chat(chat_id, title=conv["title"], messages=list(history), mode=_ui_mode,
                   modality=_ui_modality, model_a=model_a, model_b=model_b,
                   eval_id=conv.get("eval_id") if not conv["new"] else None,
                   tools_guide=bool(existing.get("tools_guide")) or None,
                   agent_backend=(agent_backend if _ui_mode == "agent" else None),
                   workspace=str(chat_ws) if chat_ws is not None else None)
    except Exception:
        LOG.exception("chat early save failed")
    # Persistent memory + a pending compaction digest prefix the first
    # message of a fresh Arena session (memory resends only when changed).
    conv["prefix"] = ws_note
    conv["digest_used"] = False
    if modality not in ("image", "video"):
        digest = existing.get("pending_digest") or ""
        if _memory_enabled():
            block, mem_hash = _memory_block(_chosen_ws())
            if block and (conv["new"] or digest or mem_hash != conv.get("memory_hash")):
                conv["prefix"] += block
                conv["memory_hash"] = mem_hash
        if digest:
            conv["prefix"] += _digest_block(digest)
            conv["digest_used"] = True
    ui_mode, ui_modality = _ui_mode, _ui_modality
    names = {"a": "Agent", "b": None} if _ui_mode == "agent" else {"a": _model_name(model_a), "b": _model_name(model_b)}
    dual = mode in ("battle", "side-by-side")
    # Tools: Agent always; other text modes when a folder is chosen and the
    # composer toggle is on (clients that omit "tools" keep the old rule).
    tools_req = data.get("tools")
    if data.get("tools") is False:
        conv["mirror_ok"] = False
    tools_on = (ui_mode == "agent" and tools_req is not False) or (
        ui_mode != "agent"
        and _chosen_ws() is not None and modality in ("chat", "search")
        and (tools_req is None or tools_req is True))
    # Sub-agent delegation belongs to top-level tool chats; child chats
    # (parent_id set) cannot delegate further.
    conv["allow_delegate"] = bool(tools_on) and not existing.get("parent_id")

    def generate():
        _tl.error = None
        yield _sse({"type": "meta", "dual": dual, "mode": ui_mode, "modality": ui_modality,
                    "chat_id": conv["chat_id"], "permission_mode": _perm_mode(), "names": names})
        send = (conv.get("prefix") or "") + message
        if modality == "webdev" and conv["new"]:
            send = ("[Arena Desktop] The user's computer only receives text files you write and images saved under public/. "
                    "Save every generated image or other binary file under public/ (for example public/images/hero.jpg).\n") + send
        if modality == "webdev" and not dual and not conv["new"]:
            changed, note = _local_edits(_code_root(conv["chat_id"], conv["title"], "a", conv["mode"]))
            if changed:
                send = note + send
                yield _sse({"type": "notice", "text": "Sent your local edits to the AI: " + ", ".join(changed)})
        history_chars = _history_chars(history)
        if fanout_models:
            out = yield from _fanout_run(client, message, conv, fanout_models)
        elif tools_on:
            out = yield from _agent_run(client, send, conv)
        else:
            out = yield from _turn_auto(client, send, conv)
        out = out or {"a": "", "b": ""}
        if modality == "webdev":
            yield from _sync_from_manifest(conv)
            yield from _finish_sandbox(conv)
        if modality == "webdev" and not conv.get("_preview_sent") and not dual:
            yield from _poll_webdev_preview(client, conv)
        # conv carries this chat's own Arena session id; the shared client
        # Field is not used, so parallel chats cannot cross their sessions.
        clean = agent.strip_tool_calls if (tools_on or fanout_models) else str
        reply = {"role": "assistant", "text": clean(out["a"]), "text_b": clean(out["b"]), "names": names}
        if not dual:
            site_urls = _site_links(out.get("a") or "")
            for url in site_urls:
                yield _sse({"type": "preview", "model": "a", "url": url, "title": "Site preview"})
            site_urls = list(dict.fromkeys(site_urls + sorted(conv.get("previews") or [])))
            if site_urls:
                reply["previews"] = site_urls
        reasoning = conv.get("reasoning") or {}
        if reasoning.get("a"):
            reply["reasoning"] = reasoning["a"]
        if reasoning.get("b"):
            reply["reasoning_b"] = reasoning["b"]
        if conv["tools"]:
            reply["tools"] = conv["tools"]
        ckpts = {l: (conv.get(f"_checkpoint_{l}") or {}).get("id")
                 for l in ("a", "b") if (conv.get(f"_checkpoint_{l}") or {}).get("id")}
        if ckpts:
            reply["checkpoints"] = ckpts
        if conv.get("sandbox"):
            reply["sandbox"] = conv["sandbox"]
        if dual:
            arena_ids = conv.get("last_arena_ids") or {}
            if arena_ids.get("a") and arena_ids.get("b"):
                reply["arena_message_ids"] = arena_ids
        lane_errors = {key: list(values) for key, values in (conv.get("lane_errors") or {}).items() if values}
        if lane_errors:
            reply["lane_errors"] = lane_errors
        if not (out["a"] or out["b"]) and _tl.error:
            reply["error"] = _tl.error
        history.append(reply)
        _save_chat(conv["chat_id"], title=conv["title"], messages=history, mode=ui_mode,
                   modality=ui_modality, model_a=model_a, model_b=model_b,
                   eval_id=(conv.get("eval_id") if not conv["new"] else None),
                   tools_guide=bool(tools_on) or bool(existing.get("tools_guide")),
                   agent_backend=("local" if ui_mode == "agent" else None),
                   mcp_guide_hash=conv.get("mcp_guide_hash"),
                   memory_hash=conv.get("memory_hash"),
                   delegate_guide=bool(conv.get("delegate_sent")),
                   pending_digest=("" if conv.get("digest_used") else None))
        if (not reply["text"].strip() and not reply["text_b"].strip()
                and modality in ("chat", "search")
                and not conv.get("media_saved") and not conv["tools"] and not _tl.error):
            yield _sse({"type": "notice", "level": "warn",
                        "text": "The model returned an empty reply. In a long conversation this usually "
                                "means Arena's context limit for this chat was reached — press Compact "
                                "(next to Workspace Sync) to continue here with a fresh context."})
        total_chars = _history_chars(history)
        # Tool chats re-bill the whole history every round, so nudge
        # towards Compact earlier than in plain chats (v5.1.5).
        warn_at = CONTEXT_WARN_CHARS * 5 // 8 if tools_on else CONTEXT_WARN_CHARS
        if history_chars < warn_at <= total_chars:
            yield _sse({"type": "notice", "level": "warn",
                        "text": f"This conversation is getting long (~{total_chars // 1000}k characters) "
                                "and may be close to Arena's context limit. Press Compact (next to "
                                "Workspace Sync) to continue in a fresh session with a summary — "
                                "otherwise replies may start coming back empty."})
        done_event = {"type": "done", "text_a": out["a"], "text_b": out["b"], "dual": dual,
                      "chat_id": conv["chat_id"], "history_chars": total_chars,
                      "msg_index": len(history) - 1}
        if reply.get("arena_message_ids"):
            done_event["arena_message_ids"] = reply["arena_message_ids"]
        if reply.get("checkpoints"):
            done_event["checkpoints"] = reply["checkpoints"]
        yield _sse(done_event)

    return Response(
        stream_with_context(_sse_wrap(generate(), chat_id=chat_id, workspace_dir=chat_ws)),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
