# Arena Desktop web backend, part 6 of 11: turns.
# Usage telemetry, request pacing, one model call (_turn), account
# failover, the Agent Gateway, status.arena.ai notices, reply recovery
# after a broken stream, and auto-continue (_turn_auto).
#
# Not a standalone module: arena/web/app.py runs the parts in order
# inside its own namespace, so names from earlier parts are in scope.

# ----------------------------------------------------------------------
# Usage telemetry (v5.1.5): the app counts its own Arena sends per
# account/day and logs every 429, so Settings -> Usage can show where
# the daily balance goes. Best-effort: it must never break a send.
USAGE_FILE = COOKIE_FILE.parent / "usage.json"
_USAGE = None
_USAGE_SENDS_SINCE_SAVE = 0


def _usage() -> dict:
    global _USAGE
    if _USAGE is None:
        try:
            data = json.loads(USAGE_FILE.read_text(encoding="utf-8"))
            _USAGE = data if isinstance(data, dict) else {}
        except Exception:
            _USAGE = {}
        _USAGE.setdefault("days", {})
        _USAGE.setdefault("events", [])
    return _USAGE


def _usage_save() -> None:
    try:
        USAGE_FILE.parent.mkdir(parents=True, exist_ok=True)
        USAGE_FILE.write_text(json.dumps(_usage(), ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def _usage_account():
    try:
        store = _accounts_load()
        current = store.get("current")
        record = next((a for a in store.get("accounts") or [] if a.get("id") == current), None)
        if record:
            return str(record.get("id") or "current"), (record.get("email") or record.get("name") or "")
    except Exception:
        pass
    return "current", ""


def _usage_day() -> dict:
    import datetime
    days = _usage()["days"]
    today = datetime.date.today().isoformat()
    for old in sorted(days)[:-14]:
        if old != today:
            days.pop(old, None)
    return days.setdefault(today, {})


def _usage_blank(email=""):
    return {"email": email, "sends": 0, "by_modality": {}, "models": {}, "rate_limits": 0}


def _usage_note_send(conv) -> None:
    global _USAGE_SENDS_SINCE_SAVE
    try:
        account_id, email = _usage_account()
        acct = _usage_day().setdefault(account_id, _usage_blank(email))
        if email:
            acct["email"] = email
        acct["sends"] = int(acct.get("sends") or 0) + 1
        lane = _pacer_lane_key(conv)
        by_mod = acct.setdefault("by_modality", {})
        by_mod[lane] = int(by_mod.get(lane) or 0) + 1
        model = str((conv or {}).get("model_a") or "")
        if model:
            models = acct.setdefault("models", {})
            models[model] = int(models.get(model) or 0) + 1
        _USAGE_SENDS_SINCE_SAVE += 1
        if _USAGE_SENDS_SINCE_SAVE >= 10:
            _USAGE_SENDS_SINCE_SAVE = 0
            _usage_save()
    except Exception:
        pass


def _usage_note_429(conv, err) -> None:
    try:
        account_id, email = _usage_account()
        acct = _usage_day().setdefault(account_id, _usage_blank(email))
        acct["rate_limits"] = int(acct.get("rate_limits") or 0) + 1
        events = _usage()["events"]
        events.append({"ts": int(time.time()), "account": email or account_id,
                       "modality": _pacer_lane_key(conv),
                       "model": str((conv or {}).get("model_a") or ""),
                       "wait": (err or {}).get("wait"),
                       "message": str((err or {}).get("message") or "")[:200]})
        del events[:-50]
        _usage_save()
    except Exception:
        pass


def _num(value):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _usage_record_headers(headers, bucket: str = "evaluation"):
    """Keep what Arena's ratelimit headers say, per bucket.

    Arena counts Chat/Code/Direct/Battle sends in one bucket (create-evaluation, 30 per window at the time of
    writing) and Agent sessions in another (create-chat, 10). Each reply carries that bucket's
    limit, remaining and reset (epoch seconds). Returns the entry stored, or None."""
    if not headers:
        return None
    try:
        h = {str(k).lower(): v for k, v in dict(headers).items()}
    except (TypeError, ValueError):
        return None
    entry = {"limit": _num(h.get("ratelimit-limit")), "remaining": _num(h.get("ratelimit-remaining")),
             "reset": _num(h.get("ratelimit-reset"))}
    if entry["remaining"] is None and entry["reset"] is None:
        return None
    entry = {k: v for k, v in entry.items() if v is not None}
    entry["ts"] = time.time()
    try:
        account_id, email = _usage_account()
        store = _usage()
        store.setdefault("buckets", {}).setdefault(account_id, {})[bucket] = entry
        live = store.setdefault("live", {})
        live[account_id] = dict(entry, email=email, bucket=bucket,
                                **({"modality": h["ratelimit-modality"]} if h.get("ratelimit-modality") else {}))
    except Exception:
        pass
    return entry


def _emit_usage_from_headers(headers: dict, conv: dict):
    """Emit a usage SSE event from the ratelimit headers arena.ai already sent."""
    if not headers:
        return
    try:
        entry = _usage_record_headers(headers, "evaluation")
        if entry is None:
            return
        h = {str(k).lower(): v for k, v in dict(headers).items()}
        evt = {"type": "usage", "bucket": "evaluation"}
        evt.update({k: entry[k] for k in ("remaining", "limit", "reset") if k in entry})
        if h.get("ratelimit-modality"):
            evt["modality"] = str(h["ratelimit-modality"])
        account_id, _email = _usage_account()
        acct = _usage_day().get(account_id)
        if acct:
            evt["sends_today"] = int(acct.get("sends") or 0)
            evt["rate_limits_today"] = int(acct.get("rate_limits") or 0)
        yield _sse(evt)
    except Exception:
        pass


# ----------------------------------------------------------------------
# Adaptive request pacing (v5.1.1): a client-side governor in front of
# every chat send. Short Arena throttles are mostly triggered by bursts
# (parallel chats, sub-agents, fan-out, retries), so sends pass a
# per-lane token bucket with a concurrency cap; observed 429 resets
# teach it to slow down and queue until the reset instead of erroring.
# Daily-quota waits (hours) are never queued - they surface as before.
_PACER_PRESETS = {
    "gentle": {"text_interval": 3.0, "media_interval": 10.0, "burst": 3, "max_wait": 90.0},
    "strict": {"text_interval": 6.0, "media_interval": 20.0, "burst": 2, "max_wait": 120.0},
}
_PACER_LOCK = threading.Lock()
_PACER_LANES: dict = {}


def _pacing_params() -> dict:
    try:
        cfg = load_config()
    except Exception:
        cfg = {}
    params = dict(_PACER_PRESETS.get(str(cfg.get("pacing_preset") or "gentle"),
                                      _PACER_PRESETS["gentle"]))
    params["enabled"] = cfg.get("pacing", True) is not False
    for key in ("text_interval", "media_interval", "burst", "max_wait"):
        value = cfg.get("pacing_" + key)
        if isinstance(value, (int, float)) and value >= 0:
            params[key] = float(value)
    return params


def _pacer_lane_key(conv) -> str:
    return "media" if str((conv or {}).get("modality") or "") in ("image", "video") else "text"


def _pacer_lane(key: str) -> dict:
    lane = _PACER_LANES.get(key)
    if lane is None:
        lane = {"tokens": None, "last_refill": 0.0, "interval": None,
                "cooldown_until": 0.0, "in_flight": 0, "last_429": 0.0}
        _PACER_LANES[key] = lane
    return lane


class _PacerPermit:
    __slots__ = ("lane", "counted", "released")

    def __init__(self, lane=None, counted=False):
        self.lane, self.counted, self.released = lane, counted, False

    def release(self):
        if self.released:
            return
        self.released = True
        if self.counted and self.lane is not None:
            with _PACER_LOCK:
                self.lane["in_flight"] = max(0, self.lane["in_flight"] - 1)


def _pacer_acquire(conv):
    """Wait for a send slot; yields a pacing notice/pings, returns a permit."""
    params = _pacing_params()
    if not params["enabled"]:
        return _PacerPermit()
    key = _pacer_lane_key(conv)
    base = params["media_interval"] if key == "media" else params["text_interval"]
    burst = max(1, int(params["burst"]))
    max_wait = float(params["max_wait"])
    concurrency = 1 if key == "media" else 2
    waited = 0.0
    noticed = False
    ping_at = 10.0
    while True:
        with _PACER_LOCK:
            lane = _pacer_lane(key)
            now = time.monotonic()
            if lane["interval"] is None:
                lane["interval"] = base
                lane["tokens"] = float(burst)
                lane["last_refill"] = now
            if lane["last_429"] and now - lane["last_429"] > 300:
                lane["interval"] = base
                lane["last_429"] = 0.0
            interval = max(0.0, float(lane["interval"]))
            if interval > 0:
                gained = (now - lane["last_refill"]) / interval
                if gained > 0:
                    lane["tokens"] = min(float(burst), (lane["tokens"] or 0.0) + gained)
                    lane["last_refill"] = now
            cooldown_left = lane["cooldown_until"] - now
            wait_needed = 0.0
            if 0 < cooldown_left <= max_wait:
                wait_needed = cooldown_left
            elif lane["in_flight"] >= concurrency:
                wait_needed = 0.2
            elif (lane["tokens"] or 0.0) >= 1.0:
                lane["tokens"] -= 1.0
                lane["in_flight"] += 1
                return _PacerPermit(lane, counted=True)
            elif interval > 0:
                wait_needed = (1.0 - (lane["tokens"] or 0.0)) * interval
            if _stopped() or waited > max_wait:
                # Never trap the user: send anyway (Stop pressed, or the
                # remaining wait is quota-scale rather than a burst window).
                lane["in_flight"] += 1
                return _PacerPermit(lane, counted=True)
        step = min(max(wait_needed, 0.05), 0.5)
        time.sleep(step)
        waited += step
        if waited > 3 and not noticed:
            noticed = True
            yield _sse({"type": "notice",
                        "text": "Pacing requests to stay under Arena's rate limits — sending in a few seconds."})
        if waited >= ping_at:
            ping_at += 10.0
            yield _sse({"type": "ping"})


def _pacer_note_429(conv, wait_seconds) -> None:
    try:
        wait = float(wait_seconds or 0)
    except (TypeError, ValueError):
        wait = 0
    key = _pacer_lane_key(conv)
    params = _pacing_params()
    base = params["media_interval"] if key == "media" else params["text_interval"]
    with _PACER_LOCK:
        lane = _pacer_lane(key)
        now = time.monotonic()
        current = lane["interval"] if lane["interval"] is not None else base
        lane["interval"] = min(max(current * 2, base), 60.0)
        lane["tokens"] = 0.0
        lane["last_refill"] = now
        if wait > 0:
            lane["cooldown_until"] = max(lane["cooldown_until"], now + min(wait, 86400.0))
        lane["last_429"] = now


def _turn(client: ArenaClient, content: str, conv: dict):
    """Send one message and stream the answer. Yields SSE events; returns {"a": text, "b": text},
    or None after sending an error event."""
    v2 = None
    checks_retried = False
    for _ in range(4):
        if conv["new"] and not conv.get("eval_id"):
            conv["eval_id"] = generate_uuidv7()
        try:
            # User attachments ride only on the first send of the turn: a
            # challenge retry re-sends the same turn (keep them), but the
            # local tool loop's follow-up rounds must not re-attach them.
            path, body = contracts.build_chat(
                eval_id=conv["eval_id"], new=conv["new"], mode=conv["mode"], modality=conv["modality"],
                content=content, ids=generate_uuidv7, model_a=conv.get("model_a"), model_b=conv.get("model_b"),
                attachments=conv.get("attachments") or None,
                v2_token=v2, auto_model=bool(conv.get("auto_model")))
        except ValueError as e:
            yield _sse({"type": "error", "code": "bad_request", "message": str(e), "retry": False})
            return None
        v2 = None
        permit = yield from _pacer_acquire(conv)
        try:
            r = _send(client, path, body)
            _usage_note_send(conv)
            LOG.info("chat %s: HTTP %s (v2 token sent: %s)", conv["chat_id"][:8], r.status_code, bool(body.get("recaptchaV2Token")))
            if r.status_code == 200:
                conv["new"] = False
                # Arena now has this message: a failed stream must not send it again.
                conv["_delivered"] = True
                conv["attachments"] = None  # sent with this turn; not again
                # The pairwise vote addresses the two assistant messages by the
                # client-generated ids from this very request body.
                conv["last_arena_ids"] = {"a": body.get("modelAMessageId"),
                                          "b": body.get("modelBMessageId")}
                out = yield from _line_events(r, conv)
                if _engine_on():
                    ENGINE.sync_to(client)
                yield from _emit_usage_from_headers(r.headers, conv)
                return out
            err = contracts.classify_error(r.status_code, r.text if r.status_code else (r.error or ""),
                                           headers=getattr(r, "headers", None))
            if err["code"] == "rate_limit":
                _pacer_note_429(conv, err.get("wait"))
                _usage_note_429(conv, err)
            LOG.info("chat %s: %s - %s", conv["chat_id"][:8], err.get("code"), str(err.get("message", ""))[:200])
            if r.status_code == 0 and _engine_on() and ENGINE.challenge == "cloudflare":
                err["code"] = "cloudflare"
            elif r.status_code == 0 and _engine_on() and ENGINE.challenge == "recaptcha":
                # The send never left because a human check is open: that is
                # not a network failure (it used to retry and then blame Wi-Fi).
                err["code"] = "challenge"
            if err["code"] == "challenge" and _engine_on():
                # One check box serves every chat: another chat may already
                # show it, and re-opening it would throw that chat's tick away.
                if ENGINE.challenge != "recaptcha":
                    ENGINE.request_human_check()
                yield _sse({"type": "challenge", "kind": "recaptcha", "message": "arena.ai wants a quick human check "
                            "(\"I'm not a robot\"). Tick the box in the arena.ai window; your message is resent right after."})
                token = yield from _wait_for(
                    lambda: ENGINE.take_v2_token() or (ENGINE.challenge != "recaptcha" and "closed"), 300)
                if token == "closed":
                    token = ENGINE.take_v2_token()
                LOG.info("chat %s: human check %s", conv["chat_id"][:8], "passed" if token else "not finished")
                if not token and not checks_retried and not _stopped():
                    # The box closed without a token for this chat (another
                    # chat used the one tick): send again; arena either takes
                    # it now or asks for a fresh check.
                    checks_retried = True
                    yield _sse({"type": "challenge_done"})
                    continue
                if not token:
                    ENGINE.cancel_check()
                    yield _sse({"type": "error", "code": "challenge", "retry": True,
                                "message": "The human check was not finished, so nothing was sent."})
                    return None
                yield _sse({"type": "challenge_done"})
                v2 = token
                continue
            if err["code"] == "cloudflare" and _engine_on():
                if ENGINE.ready():
                    ENGINE.show_cloudflare()
                yield _sse({"type": "challenge", "kind": "cloudflare",
                            "message": "arena.ai is showing a Cloudflare check. Finish it in the arena.ai window."})
                if not (yield from _wait_for(ENGINE.ready, 300)):
                    yield _sse({"type": "error", "code": "cloudflare", "retry": True,
                                "message": "The Cloudflare check was not finished."})
                    return None
                yield _sse({"type": "challenge_done"})
                continue
            if err["code"] == "eval_gone" and not conv["new"]:
                conv.update(new=True, eval_id=None)
                yield _sse({"type": "notice", "text": "arena.ai no longer has this conversation, so a new one was started."})
                continue
            if err["code"] in ("challenge", "cloudflare"):
                err["message"] += " Open Arena Desktop (Arena-Desktop.exe): it shows arena.ai's check so you can finish it."
            yield _sse(dict(err, type="error"))
            return None
        finally:
            permit.release()
    yield _sse({"type": "error", "code": "http", "retry": True, "message": "arena.ai kept refusing the message."})
    return None


def _sse_payload(item):
    """Parse one SSE string back into its event dict (or None)."""
    try:
        text = str(item).strip()
        if text.startswith("data:"):
            return json.loads(text[5:].strip())
    except Exception:
        return None
    return None


def _auto_continue_on() -> bool:
    try:
        return load_config().get("auto_continue", True) is not False
    except Exception:
        return True


def _account_failover_on() -> bool:
    # Opt-in only (default OFF): rotating accounts to work around a daily
    # cap is a fair-use grey zone, so the user enables this knowingly.
    try:
        return load_config().get("account_failover") is True
    except Exception:
        return False


def _failover_target():
    """Another saved account with a session, or None. Also refuses while
    anything besides the calling turn is generating: switching accounts
    re-points the whole app (engine + client)."""
    try:
        with _generation_lock:
            if _active_generations > 1:
                return None
        store = _accounts_load()
        current = store.get("current")
        return next((a for a in store.get("accounts") or []
                     if a.get("id") != current and (a.get("cookie") or "")
                     and not a.get("expired")), None)
    except Exception:
        return None


def _activate_failover(target) -> bool:
    """Perform the actual switch to `target` (blocking; engine import may
    take a few seconds). Mirrors the manual switch endpoint's internals."""
    try:
        try:
            _sync_current_account_cookie(get_client().cookie_str)
        except Exception:
            pass
        _raw = target.get("cookie") or ""
        try:
            _dec = crypto.decrypt(_raw.encode("ascii")).decode("utf-8") if _raw else ""
        except Exception:
            _dec = _raw
        _resp, ok = _activate_cookie(_dec, "account-failover")
        if not ok:
            _mark_account_expired(target.get("id"))
            return False
        _PACER_LANES.clear()  # new account: pacing starts from a clean slate
        return True
    except Exception:
        LOG.exception("account failover failed")
        return False


def _failover_seed(conv, content: str) -> str:
    """First message for the fresh session on the new account: the chat
    digest (same seeding as Compact/Fork) followed by the pending content."""
    try:
        chat = _load_chat(str((conv or {}).get("chat_id") or "")) or {}
        if chat.get("messages"):
            return _digest_block(_build_digest(chat)) + (content or "")
    except Exception:
        pass
    return content


# ----------------------------------------------------------------------
# Agent Gateway (v5.5): selected local MCP servers exposed to the genuine
# Arena Agent through a temporary Cloudflare Quick Tunnel session.
# Master opt-in (gateway_enabled, default OFF) + separate auto-start
# opt-in (gateway_auto) tied to the composer Workspace Sync tools flag.
_GATEWAY = None


_GATEWAY_WORKSPACE_SERVER = "workspace"
_GATEWAY_WORKSPACE_ALIAS = "__workspace__"
_GATEWAY_WORKSPACE_TOOLS = {
    "ls": (True, "List a folder inside the workspace. Paths are relative to the workspace root.",
           {"path": "folder path, '.' for the root (optional)"}),
    "read_file": (True, "Read a text file inside the workspace (max 1 MB).",
                  {"path": "file path relative to the workspace root",
                   "start_line": "first line to read (optional)",
                   "end_line": "last line to read (optional)"}),
    "search": (True, "Search file contents inside the workspace with a regular expression.",
               {"pattern": "regular expression to search for",
                "path": "folder or file to search, '.' for the root (optional)"}),
    "write_file": (False, "Create or overwrite a text file inside the workspace.",
                   {"path": "file path relative to the workspace root", "content": "full file content"}),
    "edit_file": (False, "Replace one exact occurrence of old_text with new_text in a workspace file.",
                  {"path": "file path relative to the workspace root",
                   "old_text": "exact text to replace (must occur once)", "new_text": "replacement text"}),
    "mkdir": (False, "Create a folder inside the workspace.", {"path": "folder path relative to the workspace root"}),
    "delete": (False, "Delete a file or folder inside the workspace.", {"path": "path relative to the workspace root"}),
    "run_cmd": (False, "Run a shell command with the workspace folder as the working directory.",
                {"cmd": "the command line to run"}),
}


def _gateway_workspace_on(cfg=None) -> bool:
    """Workspace-folder exposure through the gateway (separate opt-out toggle)."""
    try:
        return (cfg or load_config()).get("gateway_workspace") is not False
    except Exception:
        return False


def _gateway_workspace_index() -> dict:
    tools = {}
    for name, (read_only, description, props) in _GATEWAY_WORKSPACE_TOOLS.items():
        tools[name] = {
            "alias": f"{_GATEWAY_WORKSPACE_ALIAS}{name}",
            "description": description,
            "input_schema": {
                "type": "object",
                "properties": {key: {"type": "string", "description": text} for key, text in props.items()},
            },
            "read_only": read_only,
        }
    return {_GATEWAY_WORKSPACE_SERVER: {"tools": tools}}


def _gateway_tool_index() -> dict:
    try:
        tool_map = CONNECTORS.ensure_started(timeout=10) or {}
    except Exception:
        tool_map = {}
    index: dict = {}
    for alias, entry in tool_map.items():
        server = entry.get("server") or ""
        tool = entry.get("tool") or ""
        if not server or not tool:
            continue
        annotations = entry.get("annotations") or {}
        index.setdefault(server, {"tools": {}})["tools"][tool] = {
            "alias": alias,
            "description": entry.get("description") or "",
            "input_schema": entry.get("input_schema") or {},
            "read_only": annotations.get("readOnlyHint") is True,
        }
    # The picked workspace folder as a built-in server (v5.6.1): the agent
    # gets the same file tools the local agent has, confined to that folder.
    if _chosen_ws() is not None:
        index.update(_gateway_workspace_index())
    return index


def _gateway_workspace_call(tool: str, arguments) -> str:
    root = _chosen_ws()
    if root is None:
        raise ValueError("No workspace folder is picked in Arena Desktop.")
    args = dict(arguments or {})
    local = agent.LocalTools(root)
    if tool != "run_cmd":
        _, inside = local.resolve(str(args.get("path") or "."),
                                  write=tool in ("write_file", "edit_file", "mkdir", "delete"))
        if not inside:
            raise PermissionError("That path is outside the workspace folder.")
    ok, output = local.run({"name": tool, "params": args})
    if not ok:
        raise ValueError(output)
    return output


def _gateway_call_tool(alias: str, arguments) -> str:
    if str(alias).startswith(_GATEWAY_WORKSPACE_ALIAS):
        return _gateway_workspace_call(str(alias)[len(_GATEWAY_WORKSPACE_ALIAS):], arguments)
    return CONNECTORS.call(alias, arguments)


def _gateway_approve(server, tool, read_only, arguments) -> bool:
    # Same verdict machinery as the local tool loop: read-only calls grade
    # as reads, everything else as shell. "ask" waits on the UI prompt.
    # Workspace calls grade under their real local tool names, so e.g.
    # Accept-edits covers write_file/edit_file but still prompts for delete.
    arguments = arguments or {}
    command = ""
    if server == _GATEWAY_WORKSPACE_SERVER and tool in permissions.KIND:
        permission_tool = tool
        if tool == "run_cmd":
            command = str(arguments.get("cmd") or "")
        target = command or str(arguments.get("path") or ".")
        summary = f"Agent Gateway workspace: {tool} {target}".strip()
    else:
        permission_tool = "read_file" if read_only else "run_cmd"
        summary = f"Agent Gateway MCP {server}: {tool}"
    verdict = BROKER.check(_perm_mode(), permission_tool, inside=True, command=command)
    if verdict == "allow":
        return True
    if verdict == "blocked":
        return False
    info = {"tool": permission_tool, "summary": summary,
            "gateway": True, "server": server, "mcp_tool": tool, "inside": True,
            "rel": server, "path": json.dumps(arguments, ensure_ascii=False)[:300]}
    pid = BROKER.ask(info)
    LOG.info("gateway: approval requested for %s:%s", server, tool)
    return BROKER.wait(pid, 180) == "allow"


def _gateway():
    global _GATEWAY
    if _GATEWAY is None:
        _GATEWAY = GatewayManager(
            tool_index=_gateway_tool_index,
            call_tool=_gateway_call_tool,
            approve=_gateway_approve,
            cloudflared_path=components.cloudflared_path,
            logger=LOG)
    return _GATEWAY


def _gateway_enabled(cfg=None) -> bool:
    try:
        return (cfg or load_config()).get("gateway_enabled") is True
    except Exception:
        return False


def _gateway_servers(cfg=None) -> list:
    cfg = cfg or load_config()
    chosen = cfg.get("gateway_servers")
    if isinstance(chosen, list):
        servers = [str(s) for s in chosen]
    else:
        try:
            servers = [name for name, srv in (connectors.configured_servers() or {}).items()
                       if srv.get("enabled") and srv.get("transport", "stdio") == "stdio"]
        except Exception:
            servers = []
    # The workspace folder rides along as a built-in server unless its own
    # toggle is off; it is not part of the MCP checklist saved in
    # gateway_servers, so it is appended here at read time.
    if (_gateway_workspace_on(cfg) and _chosen_ws() is not None
            and _GATEWAY_WORKSPACE_SERVER not in servers):
        servers.append(_GATEWAY_WORKSPACE_SERVER)
    return servers


def _gateway_session_key() -> str:
    """Stable, non-secret fingerprint of the live gateway session.

    Stored per chat so a continued Arena session is re-handed the gateway
    block exactly when the tunnel it knows is gone (stopped, expired or a
    fresh app start) — and not on every single message."""
    try:
        status = _gateway().status(include_pairing=True)
    except Exception:
        return ""
    if status.get("state") != "on" or not status.get("url"):
        return ""
    material = f"{status.get('url')}|{status.get('pairing') or ''}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:16]


def _gateway_injection(data, cfg=None) -> str:
    """Protocol block for a native agent session (auto mode), or ''.

    Ensures the gateway session is running — starting a fresh tunnel when
    the previous one was stopped or expired (v5.6.1: also on continued
    chats, not only new ones)."""
    cfg = cfg or load_config()
    if not _gateway_enabled(cfg) or cfg.get("gateway_auto") is not True:
        return ""
    if (data or {}).get("tools") is False:
        return ""  # Workspace Sync is off in the composer
    servers = _gateway_servers(cfg)
    if not servers:
        return ""
    mgr = _gateway()
    if mgr.summary()["state"] != "on":
        mgr.start(servers, wait_seconds=20)
    return mgr.injection_block()


_AUTO_RETRY_CODES = {"network", "server", "model", "stalled", "empty"}
_CONTINUE_PROMPT = ("[Arena Desktop] Your previous reply was interrupted mid-stream. "
                    "Continue exactly from where it stopped. Do not repeat anything "
                    "you already wrote and do not restart the answer.")

_STATUS_URL = "https://status.arena.ai/api/v2/summary.json"
_STATUS_PAGE = "https://status.arena.ai"
_STATUS_CACHE = {"at": 0.0, "note": "", "info": None, "busy": False}
_status_lock = threading.Lock()
# indicators that mean arena.ai itself is failing, not this computer
_ARENA_DOWN = ("major", "critical")


def _fetch_arena_status() -> dict:
    """Read status.arena.ai. indicator is none/minor/major/critical, or
    'unknown' when the status page does not answer."""
    info = {"indicator": "unknown", "description": "", "incident": "", "note": "", "url": _STATUS_PAGE}
    try:
        r = requests.get(_STATUS_URL, timeout=6, headers={"User-Agent": "ArenaDesktop"})
        data = r.json() if r.status_code == 200 else {}
        status = data.get("status") or {}
        if not isinstance(status, dict) or not status:
            return info
        info["indicator"] = str(status.get("indicator") or "none")
        info["description"] = str(status.get("description") or "")
        names = [str(i.get("name") or "").strip() for i in (data.get("incidents") or [])
                 if isinstance(i, dict) and str(i.get("status") or "") != "resolved"]
        info["incident"] = next((n.rstrip(". ") for n in names if n), "")
        if info["indicator"] != "none":
            note = f"status.arena.ai reports: {info['description'] or 'an incident'}"
            if info["incident"]:
                note += f" ({info['incident']})"
            info["note"] = note + "."
    except Exception:
        pass
    return info


def _refresh_arena_status() -> dict:
    info = _fetch_arena_status()
    with _status_lock:
        _STATUS_CACHE.update(at=time.time(), note=info["note"], info=info, busy=False)
    return info


def _arena_status(wait: bool = True) -> dict:
    """status.arena.ai, cached for a minute.

    wait=False never blocks: it answers from the cache and refreshes the cache
    in the background, so the login poll stays fast when the page is slow."""
    with _status_lock:
        info = _STATUS_CACHE.get("info")
        if info is not None and time.time() - _STATUS_CACHE["at"] < 60:
            return info
        if not wait:
            if not _STATUS_CACHE.get("busy"):
                _STATUS_CACHE["busy"] = True
                threading.Thread(target=_refresh_arena_status, daemon=True).start()
            return info or {}
    return _refresh_arena_status()


def _arena_status_note() -> str:
    """One line from status.arena.ai while arena.ai reports trouble, else ''.

    Cached for a minute. Turns "it just stopped" into "arena.ai itself is
    down right now" when that is the real cause."""
    return _arena_status().get("note", "")


def _status_notice():
    """Yield a warning when status.arena.ai reports an incident."""
    note = _arena_status_note()
    if note:
        yield _sse({"type": "notice", "level": "warn", "text": note})


_PENDING_STATES = {"pending", "streaming", "in_progress", "running", "generating", "queued"}
_DONE_STATES = {"success", "succeeded", "complete", "completed", "done", "finished"}


def _same_prompt(sent: str, remote: str) -> bool:
    """True when arena's newest user message is the one this turn sent."""
    a = " ".join(str(sent or "").split())
    b = " ".join(str(remote or "").split())
    if not a or not b:
        return False
    return a[:120] in b or a[-120:] in b or b[-120:] in a


def _remote_last_reply(eval_id: str, sent: str = ""):
    """Arena's own copy of the newest reply in a conversation.

    Returns (text, finished, failure) where finished is True/False when
    arena says so and None when it gives no status; None when unreadable.
    With sent: only a reply to that prompt counts (arena may not have
    stored it yet; the reply before it must never pass as this one)."""
    try:
        session, error, _status = _arena_get_json(
            contracts.PATHS["evaluation"].format(eval_id=urllib.parse.quote(str(eval_id))), timeout=30)
    except Exception:
        return None  # recovery is best-effort: it must never end the turn itself
    if error or not isinstance(session, dict):
        return None
    raw = [m for m in (session.get("messages") or []) if isinstance(m, dict)]
    raw.sort(key=lambda m: str(m.get("createdAt") or ""))
    tail = []
    prompt = None
    for m in reversed(raw):
        role = str(m.get("role") or "").lower()
        if role == "user":
            prompt = m
            break
        if role == "assistant" and str(m.get("participantPosition") or "a").lower() != "b":
            tail.append(m)
    if sent and (prompt is None or not _same_prompt(sent, history_sync.message_text(prompt))):
        return "", False, None
    if not tail:
        return "", False, None
    tail.reverse()
    text = "\n\n".join(t for t in (history_sync.message_text(m) for m in tail) if t)
    failure = next((str(m["failureReason"]) for m in tail if m.get("failureReason")), None)
    states = {str(m.get("status") or "").lower() for m in tail} - {""}
    finished = False if states & _PENDING_STATES else (True if states & _DONE_STATES else None)
    return text, finished, failure


def _recover_reply(conv, partial: str = "", sent: str = ""):
    """The stream broke after arena took the message. Arena keeps working on
    its side, so read the reply from arena's copy of the chat (until it is
    done) instead of sending the prompt again: a resend ran the whole task a
    second time in the same session and filled its token budget.
    Yields SSE events; returns the reply text or None."""
    eval_id = conv.get("eval_id")
    if not eval_id:
        return None
    long_task = conv.get("modality") == "webdev"
    deadline = time.time() + (900 if long_task else 180)
    yield _sse({"type": "notice", "text": "The connection to arena.ai dropped after it took your message. "
                "Not sending it again: reading the reply from arena.ai's copy of the chat…"})
    last, same, polls, misses = "", 0, 0, 0
    while True:
        got = _remote_last_reply(eval_id, sent)
        polls += 1
        if got is None:
            misses += 1
            if misses >= 3:  # arena's copy is unreadable (offline, signed out)
                return last or None
        else:
            misses = 0
            text, finished, failure = got
            if (failure or finished is True) and not text.strip():
                return None  # arena is done and has no answer either
            if text.strip():
                if finished is True:
                    # Shorter than half of what already streamed: arena's copy
                    # is not the full reply; keep the local text instead.
                    return text if len(text.strip()) >= len((partial or "").strip()) // 2 else None
                same = same + 1 if text == last else 0
                last = text
                # No status from arena: unchanged for a while means done.
                if finished is None and same >= (3 if long_task else 2):
                    return text
        if _stopped() or time.time() >= deadline:
            return last or None
        if polls % 6 == 0:
            yield _sse({"type": "notice", "text": "Still waiting for arena.ai to finish the reply…"})
        yield from _wait_for(lambda: False, 10)


def _turn_auto(client, content, conv):
    """_turn with automatic continuation (v5.1).

    If the model call dies (network/5xx, stream stall, lane error or an
    empty reply), the task no longer ends: the call is retried up to 2
    more times. A prose partial is kept and the model is asked to
    continue it; a partial containing tool calls is discarded and the
    same content is resent. Errors of failed attempts are held back and
    only surfaced when no attempts remain. Dual (Battle/Side by Side)
    turns only retry when nothing was produced at all, so a surviving
    lane is never re-rolled.
    """
    dual = conv.get("mode") in ("battle", "side-by-side")
    attempts_left = 2 if _auto_continue_on() else 0
    accumulated = {"a": "", "b": ""}
    send_content = content
    attempt_no = 0
    failed_over = False
    session_renewed = False

    def merged(o):
        if o is None:
            return None
        return {"a": accumulated["a"] + (o.get("a") or ""),
                "b": accumulated["b"] + (o.get("b") or "")}

    while True:
        attempt_no += 1
        held = []  # (raw SSE, payload) errors / stall notice of this attempt
        saw_stall = False
        saw_artifact = False
        out = None
        conv["_delivered"] = False
        conv["_unfinished"] = False
        gen = _turn(client, send_content, conv)
        while True:
            try:
                item = next(gen)
            except StopIteration as stop:
                out = stop.value
                break
            payload = _sse_payload(item) or {}
            ptype = payload.get("type")
            if ptype == "error":
                held.append((item, payload))
                continue
            if ptype == "notice" and "stopped sending data" in str(payload.get("text") or ""):
                saw_stall = True
                held.append((item, payload))
                continue
            if ptype in ("media", "preview", "webdev", "files_written", "files"):
                saw_artifact = True
            yield item

        failed = False
        fail_err = None
        if out is None:
            failed = True
            errs = [p for _i, p in held if p.get("type") == "error"]
            fail_err = errs[-1] if errs else {"code": "http", "retry": False}
        else:
            empty = (not (out.get("a") or "").strip() and not (out.get("b") or "").strip()
                     and not saw_artifact and not conv.get("media_saved"))
            lane_errs = [p for _i, p in held if p.get("type") == "error"]
            if dual:
                if empty:
                    failed = True
                    fail_err = lane_errs[-1] if lane_errs else {"code": "empty", "retry": True}
            elif saw_stall:
                failed, fail_err = True, {"code": "stalled", "retry": True}
            elif lane_errs and empty:
                failed, fail_err = True, lane_errs[-1]
            elif empty and conv.get("modality") in ("chat", "search"):
                failed, fail_err = True, {"code": "empty", "retry": True}
            elif conv.get("_unfinished") and conv.get("modality") in ("chat", "search", "webdev"):
                # Closed before arena's finish record: cut off, not done.
                failed, fail_err = True, {"code": "stalled", "retry": True}

        if not failed:
            for raw_item, payload in held:
                if payload.get("type") == "error":
                    yield raw_item
            return merged(out)

        code = str((fail_err or {}).get("code") or "")
        try:
            wait = float((fail_err or {}).get("wait") or 0)
        except (TypeError, ValueError):
            wait = 0
        # With pacing on, the resend queues precisely until Arena's reset,
        # so a longer rate-limit window is worth auto-continuing; without
        # pacing only short windows are (immediate retries would just 429).
        rl_window = 95 if _pacing_params()["enabled"] else 20

        # The stream broke after arena took the message: arena is likely still
        # working on it. Never send it again (that ran the task twice in one
        # session); read the reply from arena's copy. A stream that finished
        # empty or with a model error is over on arena's side too, so it may
        # still be retried below.
        partial_now = (out or {}).get("a") or ""
        broke = bool(conv.get("_unfinished")) or code in ("stalled", "network", "server")
        if (conv.get("_delivered") and broke and not dual and not _stopped()
                and code in ("stalled", "empty", "network", "server", "model")):
            recovered = yield from _recover_reply(conv, partial_now, send_content)
            if recovered and recovered.strip():
                full = accumulated["a"] + recovered
                yield _sse({"type": "text_replace", "model": "a", "text": full})
                _tl.error = None
                return {"a": full, "b": ""}
            prose = partial_now.strip() and "<tool" not in partial_now and "<invoke" not in partial_now
            if not prose or attempts_left <= 0:
                for raw_item, payload in held:
                    if payload.get("type") == "error":
                        yield raw_item
                yield _sse({"type": "error", "code": "no_reply", "retry": True,
                            "message": "arena.ai took the message, but the reply never arrived: the stream broke "
                                       "and arena.ai's copy of the chat has no finished answer. It may still "
                                       "finish there - press Refresh from Arena in a minute, or Retry."})
                yield from _status_notice()
                return merged(out)

        # arena.ai caps the tokens one chat session may use. Text and tool
        # chats continue in a fresh session seeded with a summary (once per
        # turn). A Code session cannot move: its cloud sandbox stays behind.
        if (code == "session_full" and not session_renewed and not _stopped()
                and conv.get("modality") != "webdev" and not dual):
            session_renewed = True
            yield _sse({"type": "notice", "level": "warn",
                        "text": "arena.ai says this chat's session is full (arena.ai's own token limit per "
                                "chat session). Continuing in a fresh arena.ai session with a summary of "
                                "this chat…"})
            conv.update(new=True, eval_id=None)
            send_content = (conv.get("_session_guide") or "") + _failover_seed(conv, content)
            accumulated = {"a": "", "b": ""}
            _tl.error = None
            continue

        retryable = code in _AUTO_RETRY_CODES or (code == "rate_limit" and 0 < wait <= rl_window)
        if attempts_left <= 0 or not retryable or _stopped():
            # Daily-scale limit + opt-in account failover (v5.1.5): switch
            # to another saved account and continue in a digest-seeded
            # fresh session instead of dying here. Once per turn.
            target = None
            if (code == "rate_limit" and wait >= 600 and not failed_over
                    and not _stopped() and _account_failover_on()):
                target = _failover_target()
            if target is None:
                for raw_item, _p in held:
                    yield raw_item
                if code in ("network", "server", "stalled", "empty", "http", "model", "no_reply"):
                    yield from _status_notice()
                return merged(out)
            label = target.get("email") or target.get("name") or "another account"
            yield _sse({"type": "notice",
                        "text": f"Daily limit reached on this account — switching to {label} and continuing in a fresh session…"})
            if not _activate_failover(target):
                for raw_item, _p in held:
                    yield raw_item
                return merged(out)
            failed_over = True
            _tl.error = None
            client = get_client()
            conv.update(new=True, eval_id=None)
            yield _sse({"type": "account_switched", "email": label})
            yield _sse({"type": "auto_retry", "attempt": attempt_no, "max": 2,
                        "code": "account_switch",
                        "dropped": {"a": len((out or {}).get("a") or ""),
                                    "b": len((out or {}).get("b") or "")}})
            accumulated = {"a": "", "b": ""}
            send_content = _failover_seed(conv, content)
            continue

        attempts_left -= 1
        _tl.error = None  # the held whole-turn error is not final
        partial_a = (out or {}).get("a") or ""
        partial_b = (out or {}).get("b") or ""
        partial = partial_a + partial_b
        dropped = {"a": 0, "b": 0}
        if (partial.strip() and not dual and out is not None
                and "<tool" not in partial and "<invoke" not in partial):
            accumulated["a"] += partial_a
            accumulated["b"] += partial_b
            send_content = _CONTINUE_PROMPT
        elif conv.get("_delivered") and broke:
            # Arena has this message and may still be answering it; sending
            # it again would start a second, duplicate turn in the same session.
            for raw_item, _p in held:
                yield raw_item
            yield from _status_notice()
            return merged(out)
        else:
            dropped = {"a": len(partial_a), "b": len(partial_b)}
            send_content = content
        yield _sse({"type": "auto_retry", "attempt": attempt_no, "max": 2,
                    "code": code, "dropped": dropped})
        backoff = int(wait) if code == "rate_limit" and wait else 2
        yield from _wait_for(lambda: False, max(1, min(backoff, 20)))
        if _stopped():
            return merged(out)
