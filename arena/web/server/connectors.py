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
# endpoint, POST /:slug/link-token ({linkToken, authUrl}), DELETE /:slug and
# POST /sync.  Fetching the catalog live means connectors Arena adds later
# appear here automatically.
#
# Connecting opens `authUrl` (Merge's hosted magic link,
# https://ah-api.merge.dev/magic-link/<token>/) in the user's DEFAULT BROWSER.
# Running Merge's link widget inside the embedded Arena window fails with
# "Authentication error: CSRF verification failed" because the widget is a
# third-party iframe and the embedded window blocks third-party cookies.  The
# hosted page is a normal top-level page, so it works wherever cookies do (ad
# blockers / Brave Shields can still break it: the UI tells the user to turn
# them off).  The link token is bound to the signed-in Arena account, so the
# authorization lands on it.  Completion is detected server-side by polling
# the connector status plus POST /sync (see api_arena_connector_connect_poll).
# These account connectors serve Arena's native Agent on the website; the
# local Agent below uses local MCP servers instead.

_CONNECTOR_SLUG_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
_connector_link_pending: Optional[dict] = None

_MERGE_LINK_HOST_SUFFIX = ".merge.dev"
_CONNECTOR_SYNC_EVERY = 8  # seconds between /sync calls while waiting for the browser flow
_CONNECTOR_LINK_TTL = 600


def _merge_link_url(value) -> Optional[str]:
    """The hosted link URL, only if it is https on a merge.dev host."""
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = urllib.parse.urlparse(value)
    except ValueError:
        return None
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or parsed.username or parsed.password:
        return None
    if not (host == "merge.dev" or host.endswith(_MERGE_LINK_HOST_SUFFIX)):
        return None
    return value


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
    """Open Merge's hosted authorization page in the user's default browser."""
    global _connector_link_pending
    if not _valid_connector_slug(slug):
        return jsonify({"ok": False, "error": "Invalid connector slug"}), 400
    client = get_client()
    if not _signed_in_somewhere(client):
        return jsonify({"ok": False, "error": "Not signed in", "code": "auth"}), 401
    quoted = urllib.parse.quote(slug, safe="")
    data, error, status = _arena_get_json(
        contracts.PATHS["connector_link_token"].format(slug=quoted), timeout=35, method="POST")
    if error:
        code = 503 if status == 0 else (status or 502)
        return jsonify({"ok": False, "error": error, "code": "arena_connectors"}), code
    auth_url = _merge_link_url(data.get("authUrl")) if isinstance(data, dict) else None
    if not auth_url:
        return jsonify({"ok": False, "code": "no_auth_url",
                        "error": "arena.ai did not return a sign-in link for this connector."}), 502
    try:
        opened = bool(webbrowser.open(auth_url))
    except Exception:
        LOG.exception("could not open the default browser for connector %s", slug)
        opened = False
    _connector_link_pending = {"slug": slug, "started": time.time(), "synced": False, "last_sync": time.time()}
    payload = {"ok": True, "pending": True, "slug": slug, "browser": True, "opened": opened}
    if not opened:
        # No default browser could be launched: let the UI show the link to copy.
        payload["auth_url"] = auth_url
    return jsonify(payload)


@app.route("/api/arena-connectors/<slug>/connect/poll")
def api_arena_connector_connect_poll(slug):
    global _connector_link_pending
    if not _valid_connector_slug(slug):
        return jsonify({"ok": False, "error": "Invalid connector slug"}), 400
    client = get_client()
    if not _signed_in_somewhere(client):
        return jsonify({"ok": False, "error": "Not signed in", "code": "auth"}), 401
    pending = _connector_link_pending if _connector_link_pending and _connector_link_pending.get("slug") == slug else None
    now = time.time()
    # arena.ai's own flow syncs accounts once the link reports success.  The
    # browser flow has no channel back to us, so ask for a sync periodically
    # until the connector shows as connected.
    if pending and now - pending.get("last_sync", 0) >= _CONNECTOR_SYNC_EVERY:
        pending["last_sync"] = now
        _arena_get_json(contracts.PATHS["connectors_sync"], timeout=35, method="POST")
        pending["synced"] = True
    connectors, error, _status = _fetch_arena_connectors()
    entry = next((c for c in connectors or [] if c["slug"] == slug), None)
    connected = bool(entry and entry["connected"])

    def finish(payload):
        global _connector_link_pending
        _connector_link_pending = None
        return jsonify(payload)

    if connected:
        return finish({"ok": True, "done": True, "connected": True, "slug": slug,
                       "connectors": connectors or []})
    if not pending or now - pending.get("started", 0) > _CONNECTOR_LINK_TTL:
        return finish({"ok": True, "done": True, "connected": False, "outcome": "timeout", "slug": slug})
    if error:
        return jsonify({"ok": True, "done": False, "connected": False, "warning": error})
    return jsonify({"ok": True, "done": False, "connected": False, "slug": slug})


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
