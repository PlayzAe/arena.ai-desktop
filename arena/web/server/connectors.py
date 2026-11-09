# Arena Desktop web backend, part 11 of 11: connectors.
# arena.ai account connectors, the native agent route, local MCP
# connectors, media save, and run_server.
#
# Not a standalone module: arena/web/app.py runs the parts in order
# inside its own namespace, so names from earlier parts are in scope.

# ---------- Arena account connectors (official, live from arena.ai) ----------
#
# arena.ai exposes its Agent Mode connectors under /api/connectors: a live
# catalog ({slug, displayName, description, logoUrl, authStatus}), a status
# endpoint, POST /:slug/link-token (Merge/AgentHandler link widget token),
# DELETE /:slug and POST /sync.  Fetching the catalog live means connectors
# Arena adds later appear here automatically.  Connecting runs the same
# AgentHandlerLink widget arena.ai's own page uses, inside the separate Arena
# window, so the authorization lands on the signed-in Arena account.  These
# account connectors serve Arena's native Agent on the website; the local
# Agent below uses local MCP servers instead.

_CONNECTOR_SLUG_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
_connector_link_pending: Optional[dict] = None

_LINK_WIDGET_JS = r"""
(function () {
  var TOKEN = __TOKEN__;
  window.__apLink = { state: 'loading', error: null };
  function fail(e) { window.__apLink = { state: 'error', error: String((e && e.message) || e) }; }
  function start() {
    try {
      var config = {
        linkToken: TOKEN,
        onSuccess: function () { window.__apLink = { state: 'success', error: null }; },
        onExit: function () {
          if (window.__apLink.state !== 'success') window.__apLink = { state: 'exit', error: null };
        },
        onValidationError: function (e) {
          window.__apLink = { state: 'error', error: String((e && (e.detail || e.message)) || 'validation error') };
        }
      };
      window.AgentHandlerLink.initialize(Object.assign({}, config, { onReady: function () {
        try {
          window.AgentHandlerLink.openLink(config);
          if (window.__apLink.state === 'loading') window.__apLink = { state: 'open', error: null };
        } catch (e) { fail(e); }
      }}));
    } catch (e) { fail(e); }
  }
  if (window.AgentHandlerLink) { start(); return 'started'; }
  var s = document.createElement('script');
  s.src = 'https://ah-cdn.merge.dev/initialize.js';
  // No credentials to the CDN. SRI is deliberately not pinned here: Merge
  // rotates this unversioned file (max-age=120) and the widget then loads
  // more of itself from the same vendor, so a hash pin only breaks the
  // OAuth flow on every deploy without containing a compromised vendor.
  // See KNOWN_ISSUES.md ("CDN scripts") for the analysis and the durable fix.
  s.crossOrigin = 'anonymous';
  s.onload = start;
  s.onerror = function () { fail('widget script failed to load'); };
  document.body.appendChild(s);
  return 'started';
})()
"""


def _valid_connector_slug(slug) -> bool:
    return isinstance(slug, str) and bool(_CONNECTOR_SLUG_RE.match(slug))


def _normalize_arena_connector(raw, statuses: Optional[dict] = None) -> Optional[dict]:
    if not isinstance(raw, dict):
        return None
    slug = raw.get("slug")
    if not _valid_connector_slug(slug):
        return None
    status = raw.get("authStatus")
    if statuses and slug in statuses:
        status = statuses[slug]
    if status not in ("connected", "disconnected", "unusable"):
        status = "disconnected"
    name = raw.get("displayName")
    if not (isinstance(name, str) and name.strip()):
        name = slug
    description = raw.get("description") if isinstance(raw.get("description"), str) else ""
    logo = None
    for key in ("logoUrl", "logo_url", "iconUrl", "icon_url", "imageUrl", "image_url", "logo", "icon"):
        value = raw.get(key)
        if isinstance(value, dict):
            value = value.get("url") or value.get("src")
        if isinstance(value, str) and value.strip():
            logo = value.strip()
            break
    if logo:
        if logo.startswith("//"):
            logo = "https:" + logo
        elif logo.startswith("/"):
            logo = contracts.ORIGIN + logo
        if not logo.startswith(("https://", "http://", "data:image/")):
            logo = None
    return {"slug": slug, "name": name, "description": description,
            "logo_url": logo, "auth_status": status, "connected": status == "connected"}


def _fetch_arena_connectors():
    """Live Arena connector catalog merged with per-account statuses.

    Returns (connectors, error, http_status)."""
    data, error, status = _arena_get_json(contracts.PATHS["connectors"], timeout=35)
    if error:
        return None, error, status
    raw_list = data.get("connectors") if isinstance(data, dict) else None
    if not isinstance(raw_list, list):
        return None, "arena.ai returned an unexpected connectors reply", status or 502
    statuses = {}
    sdata, serr, _ = _arena_get_json(contracts.PATHS["connectors_status"], timeout=35)
    if not serr and isinstance(sdata, dict) and isinstance(sdata.get("connectors"), list):
        for item in sdata["connectors"]:
            if isinstance(item, dict) and isinstance(item.get("slug"), str):
                statuses[item["slug"]] = item.get("authStatus")
    out, seen = [], set()
    for raw in raw_list:
        norm = _normalize_arena_connector(raw, statuses)
        if norm and norm["slug"] not in seen:
            seen.add(norm["slug"])
            out.append(norm)
    return out, None, 200


def _connector_link_state() -> dict:
    raw = ENGINE.run_script("window.__apLink ? JSON.stringify(window.__apLink) : null")
    if isinstance(raw, str) and raw:
        try:
            data = json.loads(raw)
        except ValueError:
            return {}
        if isinstance(data, dict):
            return data
    return {}


@app.route("/api/arena-connectors")
def api_arena_connectors():
    client = get_client()
    if not _signed_in_somewhere(client):
        return jsonify({"ok": False, "connectors": [], "error": "Not signed in", "code": "auth"}), 401
    connectors, error, status = _fetch_arena_connectors()
    if error:
        code = 503 if status == 0 else (status or 502)
        return jsonify({"ok": False, "connectors": [], "error": error, "code": "arena_connectors"}), code
    return jsonify({"ok": True, "connectors": connectors, "source": "arena"})


@app.route("/api/arena-connectors/<slug>/connect", methods=["POST"])
def api_arena_connector_connect(slug):
    global _connector_link_pending
    if not _valid_connector_slug(slug):
        return jsonify({"ok": False, "error": "Invalid connector slug"}), 400
    client = get_client()
    if not _signed_in_somewhere(client):
        return jsonify({"ok": False, "error": "Not signed in", "code": "auth"}), 401
    if not _engine_on():
        return jsonify({"ok": False, "code": "engine_required",
                        "error": "Connecting an Arena connector needs the desktop app: "
                                 "the authorization widget opens inside the Arena window.",
                        "fallback_url": contracts.ORIGIN + "/agent"}), 400
    if (_connector_link_pending and _connector_link_pending.get("slug") == slug
            and time.time() - _connector_link_pending.get("started", 0) < 600
            and _connector_link_state().get("state") in ("loading", "ready", "open")):
        ENGINE.show()
        return jsonify({"ok": True, "pending": True, "slug": slug})
    if not ENGINE.wait_ready(30):
        ENGINE.show()
        hint = (f"arena.ai is waiting for a {ENGINE.challenge} check" if ENGINE.challenge
                else "arena.ai window is still loading")
        return jsonify({"ok": False, "code": "engine_not_ready",
                        "error": f"{hint}. Finish it in the Arena window, then try again."}), 503
    quoted = urllib.parse.quote(slug, safe="")
    data, error, status = _arena_get_json(
        contracts.PATHS["connector_link_token"].format(slug=quoted), timeout=35, method="POST")
    if error:
        code = 503 if status == 0 else (status or 502)
        return jsonify({"ok": False, "error": error, "code": "arena_connectors"}), code
    token = data.get("linkToken") if isinstance(data, dict) else None
    if not isinstance(token, str) or not token:
        return jsonify({"ok": False, "error": "arena.ai did not return a link token for this connector."}), 502
    ENGINE.show()
    result = ENGINE.run_script(_LINK_WIDGET_JS.replace("__TOKEN__", json.dumps(token)))
    if result not in (None, "started"):
        return jsonify({"ok": False, "code": "engine_script",
                        "error": "Could not open the authorization widget in the Arena window."}), 502
    _connector_link_pending = {"slug": slug, "started": time.time(), "synced": False}
    return jsonify({"ok": True, "pending": True, "slug": slug})


@app.route("/api/arena-connectors/<slug>/connect/poll")
def api_arena_connector_connect_poll(slug):
    global _connector_link_pending
    if not _valid_connector_slug(slug):
        return jsonify({"ok": False, "error": "Invalid connector slug"}), 400
    client = get_client()
    if not _signed_in_somewhere(client):
        return jsonify({"ok": False, "error": "Not signed in", "code": "auth"}), 401
    pending = _connector_link_pending if _connector_link_pending and _connector_link_pending.get("slug") == slug else None
    state = _connector_link_state().get("state") if _engine_on() else None
    started = pending.get("started", 0) if pending else 0
    # arena.ai's own flow syncs accounts once the widget reports success.  A
    # delayed one-off sync also covers the state being unreadable (for example
    # the Arena page navigated while the widget was open).
    if pending and not pending.get("synced") and (state == "success" or (state is None and time.time() - started > 30)):
        _arena_get_json(contracts.PATHS["connectors_sync"], timeout=35, method="POST")
        pending["synced"] = True
    connectors, error, _status = _fetch_arena_connectors()
    entry = next((c for c in connectors or [] if c["slug"] == slug), None)
    connected = bool(entry and entry["connected"])

    def finish(payload):
        global _connector_link_pending
        _connector_link_pending = None
        if _engine_on():
            ENGINE.hide()
        return jsonify(payload)

    if connected:
        return finish({"ok": True, "done": True, "connected": True, "slug": slug,
                       "connectors": connectors or []})
    if state == "error":
        detail = _connector_link_state().get("error") or "authorization widget failed"
        return finish({"ok": False, "done": True, "connected": False, "outcome": "error",
                       "error": f"Arena connector authorization failed: {detail}"})
    if state == "exit" or not pending or time.time() - started > 600:
        outcome = "exit" if state == "exit" else "timeout"
        return finish({"ok": True, "done": True, "connected": False, "outcome": outcome, "slug": slug})
    if error:
        return jsonify({"ok": True, "done": False, "connected": False, "state": state, "warning": error})
    return jsonify({"ok": True, "done": False, "connected": False, "state": state, "slug": slug})


@app.route("/api/arena-connectors/<slug>/disconnect", methods=["POST"])
def api_arena_connector_disconnect(slug):
    if not _valid_connector_slug(slug):
        return jsonify({"ok": False, "error": "Invalid connector slug"}), 400
    client = get_client()
    if not _signed_in_somewhere(client):
        return jsonify({"ok": False, "error": "Not signed in", "code": "auth"}), 401
    quoted = urllib.parse.quote(slug, safe="")
    _data, error, status = _arena_get_json(
        contracts.PATHS["connector"].format(slug=quoted), timeout=35, method="DELETE")
    if error:
        code = 503 if status == 0 else (status or 502)
        return jsonify({"ok": False, "error": error, "code": "arena_connectors"}), code
    connectors, _lerr, _ = _fetch_arena_connectors()
    return jsonify({"ok": True, "slug": slug, "connectors": connectors or []})


# ---------- Native Arena Agent ----------

_NATIVE_AGENT_FILL_JS = r"""
(function () {
  var text = %s;
  var tries = 0;
  function setNative(el, v) {
    var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, v); else el.value = v;
    el.dispatchEvent(new InputEvent('input', {bubbles: true, data: v, inputType: 'insertText'}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
  }
  function attempt() {
    tries += 1;
    var el = document.querySelector('textarea:not([disabled])')
      || document.querySelector('[contenteditable="true"]');
    if (el) {
      el.focus();
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') setNative(el, text);
      else {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
      }
      window.__apNativeFill = 'filled';
      return;
    }
    if (tries < 40) setTimeout(attempt, 500); else window.__apNativeFill = 'not-found';
  }
  attempt();
  return 'scheduled';
})()
"""


@app.route("/api/agent/native", methods=["POST"])
def api_agent_native():
    """Open Arena's native Agent Mode in the Arena window and pre-fill the prompt.

    The native agent runs on Arena's own runtime (separate from evaluations),
    so nothing shows up as a Direct chat and no single model is exposed.
    The local Agent loop remains available for folder tools.
    """
    client = get_client()
    if not _signed_in_somewhere(client):
        return jsonify({"error": "Not signed in. Press Sign in first.", "code": "auth"}), 401
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    if not message:
        return jsonify({"error": "Empty message"}), 400
    fallback = f"{contracts.ORIGIN}/agent"
    if not _engine_on():
        return jsonify({"ok": False, "code": "engine_required", "fallback_url": fallback,
                        "error": "Native Arena Agent opens in the desktop app's arena.ai window."}), 400
    ENGINE.open_path("/agent")
    ENGINE.show()

    def _fill():
        try:
            if ENGINE.wait_ready(30):
                ENGINE.run_script(_NATIVE_AGENT_FILL_JS % json.dumps(message, ensure_ascii=False))
        except Exception:
            LOG.exception("native agent prompt fill failed")

    threading.Thread(target=_fill, daemon=True).start()
    return jsonify({"ok": True, "url": fallback})


# ---------- MCP connectors ----------

def _connector_error(e):
    if isinstance(e, KeyError):
        return jsonify({"ok": False, "error": str(e)}), 404
    if isinstance(e, ValueError):
        return jsonify({"ok": False, "error": str(e)}), 400
    return jsonify({"ok": False, "error": f"{type(e).__name__}: {e}"}), 500


@app.route("/api/connectors")
def api_connectors():
    return jsonify(CONNECTORS.list())


@app.route("/api/connectors/reload", methods=["POST"])
def api_connectors_reload():
    return jsonify(CONNECTORS.list())


@app.route("/api/connectors/config/open", methods=["POST"])
def api_connectors_config_open():
    try:
        path = connectors.open_config_file(CONNECTORS.config_path)
    except Exception as e:
        return _connector_error(e)
    return jsonify({"ok": True, "path": str(path)})


@app.route("/api/connectors/preset", methods=["POST"])
def api_connectors_preset():
    data = request.get_json(silent=True) or {}
    try:
        result = CONNECTORS.install_preset(str(data.get("preset_id") or ""), data.get("values") or {})
        server = None
        if data.get("connect", True):
            server = CONNECTORS.connect(str(data.get("preset_id") or ""), timeout=60)
            result = CONNECTORS.list()
        return jsonify(dict(result, server=server))
    except Exception as e:
        return _connector_error(e)


@app.route("/api/connectors/cli", methods=["POST"])
def api_connectors_cli():
    data = request.get_json(silent=True) or {}
    try:
        name = connectors.validate_server_name(str(data.get("name") or ""))
        result = CONNECTORS.add_cli(
            name,
            str(data.get("command") or ""),
            env=data.get("env") if isinstance(data.get("env"), dict) else {},
            cwd=str(data.get("cwd") or "") or None,
            description=str(data.get("description") or ""),
        )
        server = None
        if data.get("connect", True):
            server = CONNECTORS.connect(name, timeout=60)
            result = CONNECTORS.list()
        return jsonify(dict(result, server=server))
    except Exception as e:
        return _connector_error(e)


@app.route("/api/connectors/<name>/connect", methods=["POST"])
def api_connector_connect(name):
    try:
        server = CONNECTORS.connect(name, timeout=60)
        return jsonify(dict(CONNECTORS.list(), server=server))
    except Exception as e:
        return _connector_error(e)


@app.route("/api/connectors/<name>/test", methods=["POST"])
def api_connector_test(name):
    return api_connector_connect(name)


@app.route("/api/connectors/<name>/disconnect", methods=["POST"])
def api_connector_disconnect(name):
    CONNECTORS.disconnect(name)
    return jsonify(CONNECTORS.list())


@app.route("/api/connectors/<name>/enabled", methods=["POST"])
def api_connector_enabled(name):
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(CONNECTORS.set_enabled(name, bool(data.get("enabled"))))
    except Exception as e:
        return _connector_error(e)


@app.route("/api/connectors/<name>/delete", methods=["POST"])
def api_connector_delete(name):
    try:
        return jsonify(CONNECTORS.remove(name))
    except Exception as e:
        return _connector_error(e)


@app.route("/api/media/save", methods=["POST"])
def api_media_save():
    """Download a generated image, video or audio file into the projects folder."""
    url = str((request.get_json(silent=True) or {}).get("url") or "")
    folder = workspace.PROJECTS_DIR / "media"
    u = urllib.parse.urlparse(url)
    stem = Path(u.path).stem or "media"
    try:
        if url.startswith("data:"):
            if len(url) > 10 * 1024 * 1024:
                return jsonify({"ok": False, "error": "Data URI exceeds 10 MB limit."}), 413
            head, _, payload = url.partition(",")
            mime = head[5:].split(";")[0]
            blob, stem = base64.b64decode(payload), "media"
        else:
            # SSRF-hardened fetch: validates every resolved address and
            # connects to the address it validated (no DNS-rebinding gap).
            try:
                blob, mime = _pinned_https_get(url)
            except ValueError as e:
                msg = str(e)
                if "larger than" in msg:
                    return jsonify({"ok": False, "error": "File is larger than 300 MB."}), 413
                if msg.startswith(("Only https", "Local addresses")):
                    return jsonify({"ok": False, "error": "Only https media links can be saved."}), 400
                return jsonify({"ok": False, "error": msg}), 400
            except OSError as e:
                return jsonify({"ok": False, "error": f"Download failed: {e}"}), 502
    except (ValueError, OSError) as e:
        return jsonify({"ok": False, "error": f"Download failed: {e}"}), 502
    ext = mimetypes.guess_extension(mime) or Path(urllib.parse.urlparse(url).path).suffix or ".bin"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{workspace.slug(stem)}-{uuid.uuid4().hex[:6]}{ext}"
    target.write_bytes(blob)
    return jsonify({"ok": True, "path": str(target), "folder": str(folder)})


def run_server(port: int = 5000, open_browser: bool = True):
    """Start the Flask server and optionally open browser."""
    if open_browser:
        threading.Timer(1.0, lambda: webbrowser.open(f"http://localhost:{port}")).start()
    app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
