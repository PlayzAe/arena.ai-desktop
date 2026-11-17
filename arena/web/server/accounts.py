# Arena Desktop web backend, part 2 of 11: accounts.
# Multi-account store, sign-in and sign-out, account switching, settings,
# usage, gateway and component routes, and the mode / modality switches.
#
# Not a standalone module: arena/web/app.py runs the parts in order
# inside its own namespace, so names from earlier parts are in scope.

# ---------- Multi-account store ----------

ACCOUNTS_FILE = COOKIE_FILE.parent / "accounts.json"
_accounts_lock = threading.Lock()


def _accounts_load() -> dict:
    try:
        data = json.loads(ACCOUNTS_FILE.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("accounts"), list):
            return {"current": data.get("current"), "accounts": data["accounts"]}
    except Exception:
        pass
    return {"current": None, "accounts": []}


def _accounts_save(store: dict):
    try:
        ACCOUNTS_FILE.parent.mkdir(parents=True, exist_ok=True)
        ACCOUNTS_FILE.write_text(json.dumps(store, ensure_ascii=False, indent=1), encoding="utf-8")
    except Exception:
        LOG.exception("accounts store save failed")


def _account_public(record: dict, current_id) -> dict:
    return {
        "id": record.get("id"),
        "email": record.get("email") or "",
        "name": record.get("name") or record.get("email") or "Arena account",
        "avatar_url": record.get("avatar_url"),
        "current": record.get("id") == current_id,
        "expired": bool(record.get("expired")),
    }


def _accounts_public(store: dict = None) -> list:
    store = store if store is not None else _accounts_load()
    current = store.get("current")
    return [_account_public(a, current) for a in store.get("accounts") or []]


def _current_account_id():
    return _accounts_load().get("current")


def _first_account_id(store: dict):
    accounts = store.get("accounts") or []
    return accounts[0].get("id") if accounts else None


def _register_account(user: dict, cookie: str) -> Optional[str]:
    """Remember (or refresh) the account that just signed in and make it
    current.  Identity comes from a verified /me response; the cookie is
    stored only on disk and never sent to the frontend."""
    if not isinstance(user, dict) or not cookie:
        return None
    email = (user.get("email") or "").strip()
    if not email:
        return None
    account_id = hashlib.sha256(email.lower().encode("utf-8")).hexdigest()[:16]
    meta = user.get("user_metadata") or {}
    name = meta.get("full_name") or meta.get("name") or user.get("name") or email
    avatar = meta.get("avatar_url") or user.get("avatar_url") or user.get("avatarUrl")
    with _accounts_lock:
        store = _accounts_load()
        record = next((a for a in store["accounts"] if a.get("id") == account_id), None)
        now = datetime.now(timezone.utc).isoformat()
        if record is None:
            record = {"id": account_id, "added_at": now}
            store["accounts"].append(record)
        # A later /me without profile metadata must not erase a known name.
        if name == email and record.get("name"):
            name = record["name"]
        if not avatar:
            avatar = record.get("avatar_url")
        try:
            enc_cookie = crypto.encrypt(cookie.encode("utf-8")).decode("ascii")
        except Exception:
            enc_cookie = cookie
        record.update({
            "email": email, "name": str(name), "avatar_url": avatar,
            "cookie": enc_cookie, "updated_at": now, "expired": False,
        })
        store["current"] = account_id
        _accounts_save(store)
    return account_id


def _sync_current_account_cookie(cookie: str):
    """Persist a rotated session cookie for the current account."""
    if not cookie:
        return
    with _accounts_lock:
        store = _accounts_load()
        current = store.get("current")
        if not current:
            return
        for record in store["accounts"]:
            if record.get("id") == current:
                try:
                    enc_cookie = crypto.encrypt(cookie.encode("utf-8")).decode("ascii")
                except Exception:
                    enc_cookie = cookie
                if record.get("cookie") != enc_cookie:
                    record["cookie"] = enc_cookie
                record["updated_at"] = datetime.now(timezone.utc).isoformat()
                record["expired"] = False
                _accounts_save(store)
            break


def _mark_account_expired(account_id: str, expired: bool = True):
    with _accounts_lock:
        store = _accounts_load()
        for record in store["accounts"]:
            if record.get("id") == account_id:
                record["expired"] = expired
                _accounts_save(store)
                return


def _remove_account(account_id: str):
    with _accounts_lock:
        store = _accounts_load()
        store["accounts"] = [a for a in store["accounts"] if a.get("id") != account_id]
        if store.get("current") == account_id:
            store["current"] = None
        _accounts_save(store)


def _user_identity(user, fallback: Optional[dict] = None) -> dict:
    """Best email/name/avatar for the signed-in user, from any shape Arena uses.

    /api/me and the Supabase session disagree on field names over time
    (avatarUrl vs user_metadata.avatar_url vs picture, fullName vs name), so
    look through the usual nests instead of trusting one spelling.  This is
    what makes the real profile picture reach the sidebar.
    """
    out = {"email": None, "full_name": None, "avatar_url": None}
    sources = []
    if isinstance(user, dict):
        sources.append(user)
        for key in ("user_metadata", "userMetadata", "profile", "metadata", "app_metadata"):
            if isinstance(user.get(key), dict):
                sources.append(user[key])
        for ident in user.get("identities") or []:
            if isinstance(ident, dict) and isinstance(ident.get("identity_data"), dict):
                sources.append(ident["identity_data"])
    if isinstance(fallback, dict):
        sources.append(fallback)

    def pick(*names):
        for src in sources:
            for name in names:
                value = src.get(name)
                if isinstance(value, str) and value.strip():
                    return value.strip()
        return None

    out["email"] = pick("email")
    out["full_name"] = pick("full_name", "fullName", "name", "displayName", "display_name")
    avatar = pick("avatar_url", "avatarUrl", "picture", "imageUrl", "image_url",
                  "profileImageUrl", "profile_image_url", "photoURL", "photo_url")
    if avatar:
        if avatar.startswith("//"):
            avatar = "https:" + avatar
        elif avatar.startswith("/"):
            avatar = contracts.ORIGIN + avatar
        if avatar.startswith(("https://", "http://", "data:image/")):
            out["avatar_url"] = avatar
    return out


def _check_session(client: ArenaClient, force: bool = False):
    if not force and time.time() - _me_cache["t"] < 120:
        return _me_cache["user"], _me_cache["err"]
    user, err = _get_me(client)
    _me_cache.update(t=time.time(), user=user, err=err)
    return user, err


def _signed_in_somewhere(client: ArenaClient) -> bool:
    # Cookie enumeration can differ between WebView2 versions; a verified /me
    # result is also proof that the active embedded browser has a session.
    verified_engine = _engine_on() and ENGINE.ready() and bool(_me_cache.get("user"))
    return bool(client.cookie_str) or verified_engine or (_engine_on() and ENGINE.ready() and ENGINE.has_session())


@app.route("/api/status")
def api_status():
    client = get_client()
    out = {
        "authenticated": False, "email": None, "full_name": None, "avatar_url": None,
        "session_error": None, "offline": False, "loading": False,
        "engine_loading": False, "generating": _generation_active(),
        "generating_chat_ids": _generating_chat_ids(),
        "accounts": _accounts_public(), "current_account_id": _current_account_id(),
        "mode": _ui_mode, "modality": _ui_modality, "eval_id": client.eval_id,
        "desktop": _engine_on(), "engine": ENGINE.state(), "permission_mode": _perm_mode(),
        "app_version": APP_VERSION, "workspace_chosen": _chosen_ws() is not None,
        "workspace_missing": bool(_chosen_ws() is not None and not Path(_chosen_ws()).exists()),
        "workspace": str(_workspace_dir()), "projects_dir": str(workspace.PROJECTS_DIR),
        "pending_permissions": len(BROKER.pending()),
        "gateway": _GATEWAY.summary() if _GATEWAY is not None else {"active": False, "state": "off", "servers": 0},
        # status.arena.ai, from the cache: this poll never waits on it
        "arena_status": _arena_status(wait=False), "arena_unavailable": None,
    }
    cookie_user = (parse_cookie_input(client.cookie_str)[2] if client.cookie_str else None) or {}
    ident = _user_identity(cookie_user)
    if _engine_on() and not ENGINE.ready():
        # arena.ai is still loading or waiting on a check; answer now, the UI polls again
        out.update(ident, loading=True, engine_loading=True, authenticated=bool(client.cookie_str))
        return jsonify(out)
    has_cookie_evidence = _signed_in_somewhere(client)
    if not has_cookie_evidence and not _engine_on():
        return jsonify(out)
    # In the desktop app, ask Arena /me even if neither the saved client nor
    # WebView2 cookie enumeration exposes an auth cookie. This adopts a
    # session already present in the persistent Arena window after restart.
    # _check_session caches the answer, so this is not a request per poll.
    user, err = _check_session(client, force=request.args.get("refresh") == "1")
    if user:
        merged = _user_identity(user, ident)
        out.update(merged, authenticated=True)
        # Adopt the verified session into the account store (first run after
        # the multi-account update, or a restore from cookies.txt) and keep
        # the stored cookie fresh as Arena rotates it.
        store = _accounts_load()
        current = next((a for a in store["accounts"] if a.get("id") == store.get("current")), None)
        email = (user.get("email") or "").lower()
        if current is None or (current.get("email") or "").lower() != email:
            _register_account(user, client.cookie_str)
        else:
            _sync_current_account_cookie(client.cookie_str)
        out["accounts"] = _accounts_public()
        out["current_account_id"] = _current_account_id()
    elif err and err.startswith("Network error"):
        out.update(ident, authenticated=has_cookie_evidence, offline=True)
    elif err and (err.startswith("HTTP 5") or (has_cookie_evidence and
                  out["arena_status"].get("indicator") in _ARENA_DOWN)):
        # arena.ai itself is failing: the session could not be checked, so do
        # not call it expired and send the user to sign in again for nothing
        out.update(ident, authenticated=has_cookie_evidence, arena_unavailable=err)
    elif has_cookie_evidence or err != "Not signed in":
        out["session_error"] = err
    return jsonify(out)


def _activate_cookie(cookie_str: str, method: str):
    """Adopt a cookie only after arena.ai confirms the session; returns (response, ok)."""
    global _client
    candidate = ArenaClient(cookie_str=cookie_str)
    if _engine_on():
        try:
            imported = ENGINE.import_cookies(cookie_str)
        except Exception:
            LOG.warning("Cookie import failed in the Arena window")  # never log credential material
            imported = False
        if not imported:
            return jsonify({"ok": False, "error": "Could not import cookies. Make sure the Arena window has loaded and try again."}), False
        if not ENGINE.wait_ready(45):
            hint = f" It is waiting for a {ENGINE.challenge} check: press Show arena.ai." if ENGINE.challenge else ""
            return jsonify({"ok": False, "error": "arena.ai did not finish loading." + hint + " Try again in a moment."}), False
        user, err = ENGINE.get_me()
        if user:
            ENGINE.sync_to(candidate)
    else:
        user, err = candidate.get_me()
    if not user:
        return jsonify({"ok": False, "error": f"arena.ai rejected this session ({err}). Sign in on arena.ai again, then copy fresh cookies."}), False
    ensure_config_dir()
    try:
        COOKIE_FILE.write_bytes(crypto.encrypt(candidate.cookie_str.encode("utf-8")))
    except Exception:
        COOKIE_FILE.write_text(candidate.cookie_str, encoding="utf-8")
    _client = candidate
    _me_cache.update(t=time.time(), user=user, err=None)
    _register_account(user, candidate.cookie_str)
    _, _, cookie_user = parse_cookie_input(candidate.cookie_str)
    ident = _user_identity(user, cookie_user or {})
    return jsonify({"ok": True, "method": method, **ident}), True


@app.route("/api/models")
def api_models():
    # Mode is part of availability, not a cosmetic UI filter: Battle/Video
    # and Agent have no picker. Agent's internal model is assigned without
    # exposing it, while Max remains a Direct/Text-only manual entry.
    ui_mode = request.args.get("mode", _ui_mode)
    ui_modality = request.args.get("modality", _ui_modality)
    error = _selection_error(ui_mode, ui_modality)
    if error:
        return jsonify({"ok": False, "error": error, "code": "unsupported_selection"}), 400
    api_mod = contracts.api_modality(ui_modality)
    filtered = get_models_for_modality(_catalog_models(force=request.args.get("force") == "1"),
                                        api_mod, mode=ui_mode)
    result = []
    for m in filtered:
        raw_org = m.get("org", m.get("organization", "unknown"))
        if isinstance(raw_org, dict):
            org_name = raw_org.get("name", "unknown").lower()
            org_display = raw_org.get("name", org_name)
        else:
            org_name = str(raw_org).lower()
            org_display = str(raw_org)
        result.append({
            "id": m.get("model_id", m.get("id", "")),
            "name": m.get("name", ""),
            "org": org_name,
            "org_display": org_display,
            "provider": m.get("provider", ""),
            "color": ORG_COLOR_MAP.get(org_name, "#C7C2BC"),
            "rank": m.get("rank", m.get("arena_rank")),
            "capabilities": m.get("capabilities", []),
            "arena_score": m.get("arena_score"),
            "user_selectable": bool(m.get("user_selectable")),
            "is_router": bool(m.get("is_router")),
            "icon_url": m.get("icon_url"),
            "fixed": False,
        })
    return jsonify(result)


_LOGIN_STEPS = ("In your own signed-in arena.ai tab: open DevTools Console, run copy(document.cookie), "
                "then paste the result into the Cookies field here. Or copy all arena-auth-prod-v1 rows "
                "from Application > Cookies.")


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or {}
    method = data.get("method") or ("auto" if data.get("auto") else "manual")
    if method == "window":
        if not _engine_on():
            return jsonify({"ok": False, "error": "The sign-in window is part of Arena Desktop (Arena-Desktop.exe). " + _LOGIN_STEPS}), 400
        _me_cache.update(t=0.0, user=None, err=None)
        ENGINE.open_login()
        return jsonify({"ok": True, "pending": True})
    if method == "auto":
        last_error = None
        for name, finder in (("cdp", fetch_cookies_via_cdp), ("browser_db", _extract_browser_cookies)):
            try:
                found = finder()
            except Exception as e:
                found, last_error = None, f"{name}: {e}"
            if found and contracts.AUTH_COOKIE_PREFIX in found:
                resp, ok = _activate_cookie(found, name)
                if ok:
                    return resp
                last_error = resp.get_json().get("error")
        return jsonify({"ok": False, "snippet": "copy(document.cookie)", "error": (
            last_error or "No signed-in arena.ai session was found in Chrome, Edge or Brave. "
            "Recent Chrome versions lock their cookies so other apps cannot read them.") + " " + _LOGIN_STEPS}), 400
    raw = get_clipboard_text() if method == "clipboard" else data.get("cookie")
    if raw is not None and not isinstance(raw, str):
        return jsonify({"ok": False, "error": "Cookie text must be a string."}), 400
    raw = (raw or "").strip()
    if len(raw) > 65536:
        return jsonify({"ok": False, "error": "Cookie text is too large."}), 400
    if not raw:
        where = "The clipboard is empty." if method == "clipboard" else "No cookie text was given."
        return jsonify({"ok": False, "error": f"{where} {_LOGIN_STEPS}"}), 400
    cookie_str, cookie_dict, _ = parse_cookie_input(raw)
    if not any(k.startswith(contracts.AUTH_COOKIE_PREFIX) for k in cookie_dict):
        return jsonify({"ok": False, "error": "That text has no arena-auth-prod-v1 cookie, so it is not an arena.ai "
                        "session. " + _LOGIN_STEPS}), 400
    # Do not retain unrelated website cookies pasted alongside the auth chunks.
    auth_cookies = "; ".join(f"{k}={v}" for k, v in cookie_dict.items() if k.startswith(contracts.AUTH_COOKIE_PREFIX))
    # Adding an account by cookies while signed in: keep the current
    # account's freshest (rotated) cookie so it stays switchable.
    try:
        _sync_current_account_cookie(get_client().cookie_str)
    except Exception:
        pass
    resp, ok = _activate_cookie(auth_cookies, method)
    return (resp, 200) if ok else (resp, 401)


@app.route("/api/login/poll")
def api_login_poll():
    """Sign-in window: report once the arena.ai page holds a confirmed account session."""
    if not _engine_on():
        return jsonify({"ok": False, "done": True, "error": "The sign-in window is part of the desktop app."})
    st = ENGINE.state()
    if not ENGINE.ready():
        if st["login_open"]:
            return jsonify({"ok": False, "done": False, "hint": "Finish signing in in the arena.ai window."})
        return jsonify({"ok": False, "done": True, "error": "The sign-in window was closed before sign-in finished."})
    # Check Arena's /me directly, even when WebView2 does not enumerate auth
    # cookies. Do this once more after a manual close too: the user may have
    # completed sign-in and closed the window before the previous poll ran.
    user, err = ENGINE.get_me()
    if not user or not _user_identity(user)["email"]:
        err = err or "Signed in as a guest only. Sign in with Google or email in the arena.ai window."
        login_open = ENGINE.state()["login_open"]
        return jsonify({"ok": False, "done": not login_open, "hint": err,
                        "error": None if login_open else "The sign-in window was closed before sign-in finished."})
    ENGINE.sync_to(get_client())
    _me_cache.update(t=time.time(), user=user, err=None)
    _register_account(user, get_client().cookie_str)
    ENGINE.finish_login()
    return jsonify({"ok": True, "done": True, "accounts": _accounts_public(), **_user_identity(user)})


@app.route("/api/logout", methods=["POST"])
def api_logout():
    global _client
    current = _current_account_id()
    if current:
        _remove_account(current)
    if COOKIE_FILE.exists():
        COOKIE_FILE.unlink()
    if _engine_on():
        ENGINE.logout()
    _client = ArenaClient(cookie_str=None)
    _me_cache.update(t=0.0, user=None, err=None)
    return jsonify({"ok": True, "accounts": _accounts_public()})


@app.route("/api/accounts")
def api_accounts():
    store = _accounts_load()
    return jsonify({"accounts": _accounts_public(store), "current_id": store.get("current")})


@app.route("/api/accounts/switch", methods=["POST"])
def api_account_switch():
    """Switch the whole app (Arena window + API client) to a saved account."""
    data = request.get_json(silent=True) or {}
    account_id = str(data.get("id") or "")
    store = _accounts_load()
    record = next((a for a in store["accounts"] if a.get("id") == account_id), None)
    if record is None:
        return jsonify({"ok": False, "error": "That account is not saved in this app."}), 404
    if _generation_active():
        return jsonify({"ok": False, "error": "Finish or stop the running generations before switching accounts."}), 409
    raw_cookie = record.get("cookie") or ""
    try:
        cookie = crypto.decrypt(raw_cookie.encode("ascii")).decode("utf-8") if raw_cookie else ""
    except Exception:
        cookie = raw_cookie
    if not cookie:
        _mark_account_expired(account_id)
        return jsonify({"ok": False, "expired": True, "accounts": _accounts_public(),
                        "error": "This account has no saved session. Sign in to it again."}), 401
    # Keep the freshest (rotated) cookie for the account we are leaving.
    try:
        _sync_current_account_cookie(get_client().cookie_str)
    except Exception:
        pass
    resp, ok = _activate_cookie(cookie, "account-switch")
    payload = resp.get_json(silent=True) or {}
    if not ok:
        _mark_account_expired(account_id)
        payload.update({"expired": True, "accounts": _accounts_public()})
        return jsonify(payload), 401
    payload["accounts"] = _accounts_public()
    return jsonify(payload)


@app.route("/api/accounts/add", methods=["POST"])
def api_account_add():
    """Open the sign-in window for a NEW account without signing the current
    one out: its stored session stays in the account list and can be
    switched back to at any time."""
    if _generation_active():
        return jsonify({"ok": False, "error": "Finish or stop the running generations before adding an account."}), 409
    if not _engine_on():
        return jsonify({"ok": False, "error": "The sign-in window is part of Arena Desktop (Arena-Desktop.exe). "
                        "Use Sign in with cookies to add another account here."}), 400
    try:
        _sync_current_account_cookie(get_client().cookie_str)
    except Exception:
        pass
    _me_cache.update(t=0.0, user=None, err=None)
    ENGINE.clear_session_cookies()
    ENGINE.open_login()
    return jsonify({"ok": True, "pending": True})


@app.route("/api/accounts/remove", methods=["POST"])
def api_account_remove():
    data = request.get_json(silent=True) or {}
    account_id = str(data.get("id") or "")
    store = _accounts_load()
    if account_id == store.get("current"):
        return jsonify({"ok": False, "error": "This is the current account. Use Sign out to remove it."}), 400
    _remove_account(account_id)
    return jsonify({"ok": True, "accounts": _accounts_public()})


_SETTINGS_ALLOWLIST = frozenset({
    "theme", "font_size", "show_welcome", "auto_scroll", "send_on_enter",
    "workspace_dir", "default_mode", "default_modality", "model_a", "model_b",
    "sidebar_collapsed", "sound", "notifications", "check_updates",
    "notify_sound", "notify_volume", "update_check", "setup_done",
})

@app.route("/api/settings", methods=["GET", "POST"])
def api_settings():
    if request.method == "GET":
        return jsonify(load_config())
    data = request.get_json(silent=True) or {}
    cfg = load_config()
    for key, val in data.items():
        if key in _SETTINGS_ALLOWLIST:
            cfg[key] = val
    save_config(cfg)
    return jsonify({"ok": True})


_pulse_cache = {"t": 0.0, "data": None}


@app.route("/api/usage/pulse")
def api_usage_pulse():
    """Arena's own daily-credit meter (/api/me/pulse): percent of the day's credits left, and when they refresh."""
    if _pulse_cache["data"] is not None and time.time() - _pulse_cache["t"] < 15:
        return jsonify(_pulse_cache["data"])
    data, error, _status = _arena_get_json("/api/me/pulse", timeout=15)
    if error or not isinstance(data, dict) or not isinstance(data.get("pulse"), (int, float)):
        return jsonify({"ok": False, "error": error or "Arena did not report credits."})
    reset = None
    try:
        import datetime as _dt
        stamp = _dt.datetime.fromisoformat(str(data.get("refreshedAt")).replace("Z", "+00:00"))
        reset = int(stamp.timestamp()) if stamp.timestamp() > time.time() else None
    except (TypeError, ValueError):
        pass
    out = {"ok": True, "left": max(0, min(100, int(data["pulse"]))), "reset": reset,
           "started": bool(data.get("windowStarted"))}
    _pulse_cache.update(t=time.time(), data=out)
    return jsonify(out)


@app.route("/api/usage")
def api_usage():
    import datetime
    store = _usage()
    return jsonify({"today": datetime.date.today().isoformat(),
                    "current_account": _current_account_id(),
                    "days": store.get("days") or {},
                    "live": store.get("live") or {},
                    "buckets": store.get("buckets") or {},
                    "events": list(reversed(store.get("events") or []))})


@app.route("/api/gateway")
def api_gateway():
    cfg = load_config()
    available = []
    try:
        for name, srv in (connectors.configured_servers() or {}).items():
            available.append({"name": name, "enabled": bool(srv.get("enabled")),
                              "transport": srv.get("transport", "stdio")})
    except Exception:
        pass
    workspace_root = _chosen_ws()
    return jsonify({
        "enabled": _gateway_enabled(cfg),
        "auto": cfg.get("gateway_auto") is True,
        "chosen": cfg.get("gateway_servers") if isinstance(cfg.get("gateway_servers"), list) else None,
        "available": available,
        "workspace": {
            "available": workspace_root is not None,
            "folder": str(workspace_root) if workspace_root is not None else "",
            "exposed": _gateway_workspace_on(cfg),
        },
        "session": _gateway().status(include_pairing=True),
    })


@app.route("/api/gateway/start", methods=["POST"])
def api_gateway_start():
    cfg = load_config()
    if not _gateway_enabled(cfg):
        return jsonify({"error": "Agent Gateway is off. Enable it in Settings -> Gateway first.",
                        "code": "gateway_off"}), 403
    servers = _gateway_servers(cfg)
    if not servers:
        return jsonify({"error": "Nothing to expose: enable a local MCP server under Connectors (Local MCP) or pick a Workspace folder first.",
                        "code": "no_servers"}), 400
    status = _gateway().start(servers, wait_seconds=45)
    if status["state"] == "needs_cloudflared":
        return jsonify({"error": "cloudflared is not installed", "code": "cloudflared_missing",
                        "session": status}), 409
    if status["state"] != "on":
        return jsonify({"error": status.get("error") or "The gateway failed to start.",
                        "code": "gateway_failed", "session": status}), 502
    return jsonify({"ok": True, "session": status})


@app.route("/api/gateway/stop", methods=["POST"])
def api_gateway_stop():
    return jsonify({"ok": True, "session": _gateway().stop("stopped")})


@app.route("/api/components")
def api_components():
    payload = {"components": components.detect()}
    payload.update(components.install_status())
    return jsonify(payload)


@app.route("/api/components/install", methods=["POST"])
def api_components_install():
    data = request.get_json(silent=True) or {}
    result = components.start_install(str(data.get("id") or ""))
    return jsonify(result), (200 if result.get("ok") else 400)


@app.route("/api/mode", methods=["POST"])
def api_mode():
    global _ui_mode, _ui_modality
    data = request.get_json(silent=True) or {}
    mode = data.get("mode", "battle")
    if mode not in contracts.UI_MODES:
        return jsonify({"ok": False, "error": f"Invalid mode: {mode}",
                        "code": "unsupported_selection"}), 400
    # Switching mode never fails on the previously selected work type:
    # Agent simply runs as Text (its work-type selector is hidden), and an
    # Auto/Video selection only survives in Battle. An explicit modality in
    # the same request is honored after the same normalization.
    requested = data.get("modality") if isinstance(data.get("modality"), str) and data.get("modality") else _ui_modality
    mode, modality = contracts.normalize_ui_selection(mode, requested)
    api_mode_val = contracts.api_mode(mode)
    client = get_client()
    client.active_mode = api_mode_val
    client.active_modality = contracts.api_modality(modality)
    client.eval_id = None
    _ui_mode, _ui_modality = mode, modality
    return jsonify({"ok": True, "mode": mode, "api_mode": api_mode_val,
                    "modality": modality, "api_modality": client.active_modality})


@app.route("/api/modality", methods=["POST"])
def api_modality():
    global _ui_modality
    data = request.get_json(silent=True) or {}
    modality = data.get("modality", "chat")
    if _ui_mode == "agent":
        # Agent has no work-type selector; a stale modality call is a no-op
        # that lands on Text instead of an error the user cannot fix in UI.
        modality = "text"
    error = _selection_error(_ui_mode, modality)
    if error:
        return jsonify({"ok": False, "error": error, "code": "unsupported_selection"}), 400
    api_mod = contracts.api_modality(modality)
    client = get_client()
    client.active_modality = api_mod
    client.eval_id = None
    _ui_modality = modality
    return jsonify({"ok": True, "modality": modality, "api_modality": api_mod})
