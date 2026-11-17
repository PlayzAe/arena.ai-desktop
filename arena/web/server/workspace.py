# Arena Desktop web backend, part 10 of 11: workspace.
# File CRUD, terminal, permission and engine routes, stop, doctor, and the
# workspace panel routes.
#
# Not a standalone module: arena/web/app.py runs the parts in order
# inside its own namespace, so names from earlier parts are in scope.

# ---------- File CRUD (IDE) ----------

_SENSITIVE_DIRS = frozenset({".ssh", ".aws", ".gnupg", ".gnupg2", ".config",
    "AppData", ".azure", ".kube", ".docker", ".npmrc",
    ".git", ".env", ".gitconfig", ".bash_history", ".zsh_history"})

def _safe_resolve(rel_path: str) -> Path:
    """Resolve a user-supplied path, blocking traversal outside workspace/projects."""
    root = workspace.PROJECTS_DIR.resolve()
    root.mkdir(parents=True, exist_ok=True)
    if rel_path in ("", "."):
        return root
    if ".." in rel_path.replace("\\", "/").split("/"):
        raise PermissionError("Access denied: path traversal blocked")
    if ":" in rel_path.replace("\\", "/").split("/")[-1].split(".", 1)[-1]:
        raise PermissionError("Access denied: NTFS alternate data streams not allowed")
    raw = rel_path.replace("\\", "/")
    for segment in raw.split("/"):
        if ":" in segment and segment != raw.split("/")[0]:
            raise PermissionError("Access denied: NTFS alternate data streams not allowed")
    p = Path(rel_path)
    if p.is_absolute():
        p = p.resolve()
        if p != root and root not in p.parents:
            raise PermissionError("Access denied: outside workspace")
    else:
        p = (root / p).resolve()
        if p != root and root not in p.parents:
            raise PermissionError("Access denied: outside workspace")
    parts_lower = {part.lower() for part in p.relative_to(root).parts} if p != root else set()
    if parts_lower & {s.lower() for s in _SENSITIVE_DIRS}:
        raise PermissionError("Access denied: sensitive directory")
    return p


@app.route("/api/files")
def api_files_list():
    rel = request.args.get("path", ".")
    try:
        p = _safe_resolve(rel)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    if not p.is_dir():
        return jsonify({"error": "Not a directory"}), 400
    items = []
    try:
        for child in sorted(p.iterdir()):
            try:
                items.append({
                    "name": child.name,
                    "path": str(child),
                    "is_dir": child.is_dir(),
                    "size": child.stat().st_size if child.is_file() else 0,
                })
            except (PermissionError, OSError):
                pass
    except PermissionError:
        return jsonify({"error": "Permission denied"}), 403
    return jsonify({"files": items, "cwd": str(p)})


@app.route("/api/files/read")
def api_files_read():
    rel = request.args.get("path", "")
    if not rel:
        return jsonify({"error": "No path"}), 400
    try:
        p = _safe_resolve(rel)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    if not p.is_file():
        return jsonify({"error": "Not a file"}), 404
    if p.stat().st_size > 2 * 1024 * 1024:
        return jsonify({"error": "File too large (>2 MB)"}), 400
    try:
        content = p.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({"content": content, "path": str(p)})


@app.route("/api/files/write", methods=["POST"])
def api_files_write():
    data = request.get_json(silent=True) or {}
    rel = data.get("path", "")
    content = data.get("content", "")
    if not rel:
        return jsonify({"error": "No path"}), 400
    try:
        p = _safe_resolve(rel)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    return jsonify({"ok": True, "path": str(p)})


@app.route("/api/files/delete", methods=["POST"])
def api_files_delete():
    data = request.get_json(silent=True) or {}
    rel = data.get("path", "")
    if not rel:
        return jsonify({"error": "No path"}), 400
    try:
        p = _safe_resolve(rel)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    if p.is_file():
        p.unlink()
    elif p.is_dir():
        import shutil
        shutil.rmtree(p)
    else:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"ok": True})


@app.route("/api/files/mkdir", methods=["POST"])
def api_files_mkdir():
    data = request.get_json(silent=True) or {}
    rel = data.get("path", "")
    if not rel:
        return jsonify({"error": "No path"}), 400
    try:
        p = _safe_resolve(rel)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    p.mkdir(parents=True, exist_ok=True)
    return jsonify({"ok": True, "path": str(p)})


# ---------- Terminal ----------

@app.route("/api/terminal", methods=["POST"])
def api_terminal():
    import shlex
    import subprocess
    data = request.get_json(silent=True) or {}
    cmd = data.get("command", "").strip()
    if not cmd:
        return jsonify({"error": "No command"}), 400
    _BLOCKED_RE = re.compile(
        r"(\brm\s+-[a-z]*r|\bformat\s+[a-z]:|\b(rd|rmdir)\s+/s|\bdel\s+/[a-z]|\bmkfs\b|"
        r"\bshutdown\b|:\(\)\s*\{|\bdiskpart\b|\bbcdedit\b|\bvssadmin\s+delete\b|\bcipher\s+/w|"
        r"\bpython\s+-c\b|\bpython3\s+-c\b|\bpy\s+-c\b|\bpowershell\s+-enc|\bpwsh\s+-enc|"
        r"\bnode\s+-e\b|\bnode\s+--eval\b|\bruby\s+-e\b|\bperl\s+-e\b|\bphp\s+-r\b|"
        r"\bbash\s+-c\b|\bsh\s+-c\b|\bcmd\s+/c\b|\bpython\s+-m\s+http\b|"
        r"\bmshta\b|\bwscript\b|\bcscript\b|\brundll32\b|"
        r"\bcertutil\b|\bcurl\b.*-o|\bwget\b|\biwr\b|\binvoke-webrequest\b)", re.I)
    if _BLOCKED_RE.search(cmd):
        return jsonify({"error": "Blocked command pattern"}), 403
    if any(c in cmd for c in ('|', '&', ';', '`', '$(', '>', '<', '^', '%', '!')):
        return jsonify({"error": "Shell metacharacters not allowed"}), 403
    try:
        argv = shlex.split(cmd)
    except ValueError as e:
        return jsonify({"error": f"Invalid command: {e}"}), 400
    import shutil as _shutil
    _SAFE_BUILTINS = frozenset({"echo", "dir", "type", "ver", "cls", "set", "cd", "date", "time"})
    if argv[0].lower() in _SAFE_BUILTINS and not _shutil.which(argv[0]):
        argv = ["cmd.exe", "/c"] + argv
    else:
        _resolved = _shutil.which(argv[0])
        if _resolved:
            argv[0] = _resolved
    _ws = _workspace_dir()
    cwd = str(_ws.resolve()) if _ws.is_dir() else str(workspace.PROJECTS_DIR)
    try:
        result = subprocess.run(
            argv, shell=False, capture_output=True, text=True,
            timeout=30, cwd=cwd,
        )
        return jsonify({
            "output": result.stdout[-4000:] if result.stdout else "",
            "error": result.stderr[-2000:] if result.stderr else "",
            "code": result.returncode,
        })
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Command timed out (30s)"}), 408
    except Exception:
        return jsonify({"error": "Command failed to execute"}), 500


# ---------- Guard, permissions, engine, diagnostics, workspace ----------

@app.before_request
def _local_same_origin_only():
    """Only this app's own page may drive the API: blocks other sites, DNS rebinding, and local attackers."""
    if request.host.rsplit(":", 1)[0] not in ("127.0.0.1", "localhost"):
        return jsonify({"error": "Unknown host"}), 403
    if request.path.startswith("/api/"):
        token = request.headers.get("X-Arena-Token")
        if request.path.startswith("/api/workspace/preview/") and not token:
            token = request.args.get("token")
        if not _secrets.compare_digest(token or "", _API_TOKEN):
            return jsonify({"error": "Missing or invalid API token"}), 403
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return None
    origin = request.headers.get("Origin")
    if origin and origin != request.host_url.rstrip("/"):
        return jsonify({"error": "Cross-origin request blocked"}), 403
    if (request.path.startswith("/api/") and request.get_data() and not request.is_json
            and request.path not in ("/api/uploads", "/api/workspace/upload")):
        return jsonify({"error": "JSON body required"}), 415
    return None


@app.route("/api/permission-mode", methods=["GET", "POST"])
def api_permission_mode():
    cfg = load_config()
    if request.method == "POST":
        mode = (request.get_json(silent=True) or {}).get("mode")
        if mode not in permissions.MODES:
            return jsonify({"ok": False, "error": f"Unknown permission mode: {mode}"}), 400
        cfg["permission_mode"] = mode
        save_config(cfg)
    mode = permissions.normalize(cfg.get("permission_mode"))
    return jsonify({"ok": True, "mode": mode, "label": permissions.MODES[mode], "modes": permissions.MODES})


@app.route("/api/permissions")
def api_permissions():
    return jsonify(BROKER.pending())


@app.route("/api/permissions/<pid>", methods=["POST"])
def api_permission_answer(pid):
    decision = (request.get_json(silent=True) or {}).get("decision")
    if decision not in ("allow", "always", "deny"):
        return jsonify({"ok": False, "error": "decision must be allow, always or deny"}), 400
    if not BROKER.resolve(pid, decision):
        return jsonify({"ok": False, "error": "This request was already answered or has expired."}), 404
    return jsonify({"ok": True})


@app.route("/api/engine")
def api_engine():
    return jsonify(dict(ENGINE.state(), desktop=_engine_on()))


@app.route("/api/engine/show", methods=["POST"])
def api_engine_show():
    if not _engine_on():
        return jsonify({"ok": False, "error": "The arena.ai window exists only in the desktop app."}), 400
    ENGINE.show()
    return jsonify({"ok": True})


@app.route("/api/engine/hide", methods=["POST"])
def api_engine_hide():
    if _engine_on():
        ENGINE.close_pane()
    return jsonify({"ok": True})


@app.route("/api/stop", methods=["POST"])
def api_stop():
    data = request.get_json(silent=True) or {}
    chat_id = data.get("chat_id")
    if chat_id:
        # Stop only this chat; other chats keep working.
        _chat_stop_event(str(chat_id)).set()
        cancelled = 0
    else:
        _stop.set()
        cancelled = BROKER.cancel_all()
    if _engine_on() and ENGINE.challenge == "recaptcha":
        ENGINE.cancel_check()
    return jsonify({"ok": True, "cancelled": cancelled})


@app.route("/api/doctor")
def api_doctor():
    """Check each outside contract the app relies on and explain failures in plain words."""
    checks = []

    def add(name, ok, detail):
        checks.append({"name": name, "ok": ok, "detail": detail})

    client = get_client()
    html = ""
    try:
        r = requests.get(contracts.ORIGIN, timeout=15, headers={"User-Agent": client.session.headers.get("User-Agent", "")})
        html = r.text
        add("arena.ai reachable", r.status_code == 200, f"HTTP {r.status_code}" if r.status_code == 200
            else contracts.classify_error(r.status_code, html[:4000])["message"])
    except requests.RequestException as e:
        add("arena.ai reachable", False, f"Network error: {e}")
    live = (ENGINE.page_site_key() if _engine_on() and ENGINE.ready() else None) or contracts.discover_site_keys(html).get("v3")
    if not live:
        add("reCAPTCHA key", None, "not found in the page; the engine falls back to the built-in key")
    else:
        add("reCAPTCHA key", True, "matches the built-in key" if live == contracts.KEYS["v3"]
            else "arena.ai uses a new key; the engine reads it from the page, so chats keep working")
    try:
        models = _catalog_models()
        add("Model catalog", bool(models), f"{len(models)} models" if models
            else "empty: arena.ai may have changed /nextjs-api/model-catalog")
    except Exception as e:
        add("Model catalog", False, str(e))
    st = ENGINE.state()
    if _engine_on():
        add("arena.ai engine", st["ready"], "ready" if st["ready"] else
            (f"waiting for a {st['challenge']} check: press Show arena.ai" if st["challenge"]
             else f"loading ({st['host'] or 'no page yet'})"))
    else:
        add("arena.ai engine", None, "off: run Arena-Desktop.exe for in-app sign-in and human checks")
    if _signed_in_somewhere(client):
        user, err = _check_session(client, force=True)
        add("Session", bool(user), (user.get("email") or "guest session") if user else (err or "not signed in"))
    else:
        add("Session", False, "not signed in")
    ws = _workspace_dir()
    try:
        ws.mkdir(parents=True, exist_ok=True)
        probe = ws / ".arena-write-test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
        add("Workspace writable", True, str(ws))
    except OSError as e:
        add("Workspace writable", False, f"{ws}: {e}")
    add("Contract overrides", None if _overrides else True,
        ", ".join(_overrides) if _overrides else "none (built-in contracts)")
    return jsonify({"checks": checks, "permission_mode": _perm_mode()})


def _allowed_root(raw) -> Optional[Path]:
    try:
        p = Path(str(raw or "")).expanduser().resolve()
    except (OSError, ValueError):
        return None
    for base in (workspace.PROJECTS_DIR.resolve(), _workspace_dir().resolve()):
        if p == base or base in p.parents:
            return p
    return None


@app.route("/api/workspace")
def api_workspace():
    root = _workspace_dir()
    return jsonify({"workspace": str(root), "exists": root.is_dir(), "projects_dir": str(workspace.PROJECTS_DIR),
                    "panel_root": str(_panel_workspace_root()), "projects": workspace.list_projects()})


def _workspace_panel_path(rel: str = "."):
    root = _panel_workspace_root()
    value = (rel or ".").strip()
    if value in ("", "."):
        return root, root
    candidate = Path(value).expanduser()
    if candidate.is_absolute():
        raise PermissionError("Workspace panel paths must be relative")
    target = (root / candidate).resolve()
    if target != root and root not in target.parents:
        raise PermissionError("Access denied: outside the workspace folder")
    if target != root:
        parts_lower = {part.lower() for part in target.relative_to(root).parts}
        if parts_lower & {s.lower() for s in _SENSITIVE_DIRS}:
            raise PermissionError("Access denied: sensitive directory")
    return target, root


@app.route("/api/workspace/tree")
def api_workspace_tree():
    try:
        target, root = _workspace_panel_path(request.args.get("path", "."))
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    try:
        root.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        return jsonify({"error": f"Workspace is unavailable: {e}"}), 500
    if not target.is_dir():
        return jsonify({"error": "Not a directory"}), 400
    try:
        limit = max(1, min(500, int(request.args.get("limit", "300"))))
    except ValueError:
        limit = 300
    entries = []
    truncated = False
    try:
        children = sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except OSError as e:
        return jsonify({"error": str(e)}), 500
    for child in children:
        if child.name == ".arena-write-test":
            continue
        if len(entries) >= limit:
            truncated = True
            break
        try:
            stat = child.stat()
            entries.append({
                "name": child.name,
                "path": child.relative_to(root).as_posix(),
                "is_dir": child.is_dir(),
                "size": stat.st_size if child.is_file() else 0,
                "modified_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
            })
        except OSError:
            continue
    rel = "." if target == root else target.relative_to(root).as_posix()
    return jsonify({"root": str(root), "path": rel, "entries": entries, "truncated": truncated})


# Folders whose *contents* never matter to the panel tree (dependencies, VCS
# state, caches, the app's own logs). The rows themselves are still stamped:
# a folder appearing or disappearing moves the stamp through its parent.
_STAMP_SKIP_DIRS = frozenset({
    ".git", "node_modules", "__pycache__", ".venv", "venv", ".tox", ".nox",
    ".mypy_cache", ".pytest_cache", ".ruff_cache", ".parcel-cache", ".next",
    ".nuxt", ".svelte-kit", ".turbo", ".cache", ".arena-artifacts",
    ".arena-write-test",
}) | {name.lower() for name in _SENSITIVE_DIRS}
_STAMP_MAX_ENTRIES = 20000
_STAMP_MAX_PER_DIR = 2000


def _workspace_stamp(target: Path) -> str:
    """One cheap, deterministic fingerprint of the visible tree under target.

    Hashes each entry's relative path, kind, size and timestamps; walks with
    sorted names so identical folder states always hash identically, and stops
    at a hard entry cap with an explicit marker so huge trees stay bounded.
    """
    import hashlib
    import stat as statmod
    h = hashlib.blake2b(digest_size=10)
    total = 0
    for dirpath, dirnames, filenames in os.walk(target, followlinks=False):
        rel = os.path.relpath(dirpath, target).replace(os.sep, "/")
        names = sorted(list(dirnames) + list(filenames))
        # Descend only into folders that matter; their rows are still stamped
        # below (presence-only) so the tree can see them appear/disappear.
        dirnames[:] = sorted(d for d in dirnames if d.lower() not in _STAMP_SKIP_DIRS)
        if len(names) > _STAMP_MAX_PER_DIR:
            h.update(f"{rel}|dir-cap|{len(names)}\n".encode("utf-8", "replace"))
            continue
        for name in names:
            total += 1
            if total > _STAMP_MAX_ENTRIES:
                h.update(b"|entry-cap")
                return h.hexdigest()
            full = os.path.join(dirpath, name)
            if name.lower() in _STAMP_SKIP_DIRS:
                # Presence-only: the tree shows just the row, and the contents
                # (dependencies, logs, caches) churn invisibly. Sensitive rows
                # keep their stats private too.
                h.update(f"{rel}/{name}|skip\n".encode("utf-8", "replace"))
                continue
            try:
                st = os.lstat(full)
            except OSError:
                h.update(f"{rel}/{name}|gone\n".encode("utf-8", "replace"))
                continue
            kind = "d" if statmod.S_ISDIR(st.st_mode) else "l" if statmod.S_ISLNK(st.st_mode) else "f"
            # Exactly what a tree row renders (name, kind, size, modified time):
            # two states the tree cannot tell apart must hash the same, so the
            # poll never reloads the tree for an invisible change.
            h.update(f"{rel}/{name}|{kind}|{st.st_size}|{st.st_mtime_ns}\n".encode("utf-8", "replace"))
    return h.hexdigest()


@app.route("/api/workspace/stamp")
def api_workspace_stamp():
    """Cheap change fingerprint for the panel tree; the UI polls it to know
    when external edits (VS Code, builds, git) require a tree reload."""
    try:
        target, root = _workspace_panel_path(request.args.get("path", "."))
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    try:
        root.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        return jsonify({"error": f"Workspace is unavailable: {e}"}), 500
    if not target.is_dir():
        return jsonify({"error": "Not a directory"}), 400
    rel = "." if target == root else target.relative_to(root).as_posix()
    try:
        stamp = _workspace_stamp(target)
    except OSError as e:
        return jsonify({"error": f"Workspace is unavailable: {e}"}), 500
    return jsonify({"ok": True, "stamp": stamp, "path": rel})


@app.route("/api/workspace/file")
def api_workspace_file():
    try:
        target, root = _workspace_panel_path(request.args.get("path", ""))
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    if not target.is_file():
        return jsonify({"error": "File not found"}), 404
    if target.stat().st_size > 512 * 1024:
        return jsonify({"error": "File is too large for preview (512 KB limit)"}), 400
    try:
        data = target.read_bytes()
    except OSError as e:
        return jsonify({"error": str(e)}), 500
    if b"\x00" in data[:8192]:
        return jsonify({"error": "Binary files cannot be previewed as text"}), 415
    return jsonify({
        "path": target.relative_to(root).as_posix(),
        "name": target.name,
        "size": len(data),
        "content": data.decode("utf-8", errors="replace"),
    })


@app.route("/api/workspace/file", methods=["POST"])
def api_workspace_file_save():
    """Save an edited text file from the workspace panel editor. The click is the approval."""
    data = request.get_json(silent=True) or {}
    rel = str(data.get("path") or "")
    content = data.get("content")
    if not rel or not isinstance(content, str):
        return jsonify({"error": "Missing file path or content"}), 400
    try:
        raw = content.encode("utf-8")
    except UnicodeEncodeError:
        return jsonify({"error": "The file content is not valid text"}), 400
    if len(raw) > 512 * 1024:
        return jsonify({"error": "File is too large to edit here (512 KB limit)"}), 400
    if b"\x00" in raw:
        return jsonify({"error": "Binary files cannot be edited here"}), 415
    try:
        target, root = _workspace_panel_path(rel)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    if target.is_dir():
        return jsonify({"error": "That path is a folder"}), 400
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
    except OSError as e:
        return jsonify({"error": f"Could not save the file: {e}"}), 500
    return jsonify({"ok": True, "path": target.relative_to(root).as_posix(),
                    "name": target.name, "size": len(raw)})


@app.route("/api/workspace/download")
def api_workspace_download():
    # Raw bytes for drag-from-tree-into-composer: the client wraps them in
    # a File and runs the normal attachment upload (same limits apply).
    try:
        target, _root = _workspace_panel_path(request.args.get("path", ""))
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    if not target.is_file():
        return jsonify({"error": "File not found"}), 404
    if target.stat().st_size > 30 * 1024 * 1024:
        return jsonify({"error": "File is too large to attach (30 MB limit)"}), 400
    return send_file(target, as_attachment=True, download_name=target.name)


@app.route("/preview/<key>/<path:subpath>")
def workspace_preview_link(key, subpath):
    """Shareable preview URL: the key sits in the path, so the page's own
    relative CSS/JS/image requests carry it too (a ?token= query does not)."""
    if not _secrets.compare_digest(key or "", _PREVIEW_TOKEN):
        return jsonify({"error": "This preview link expired. Open the preview again from the app."}), 403
    return api_workspace_preview(subpath)


@app.route("/api/workspace/preview/<path:subpath>")
def api_workspace_preview(subpath):
    # Inline serving for the workspace preview: relative assets of an HTML
    # page resolve inside the workspace like a tiny static server. Path
    # containment via _workspace_panel_path; the document itself is
    # sandboxed by CSP (opaque origin, scripts cannot reach the app API).
    try:
        target, _root = _workspace_panel_path(subpath)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    if not target.is_file():
        return jsonify({"error": "File not found"}), 404
    if target.stat().st_size > 30 * 1024 * 1024:
        return jsonify({"error": "File is too large to preview (30 MB limit)"}), 400
    import mimetypes
    mime, _enc = mimetypes.guess_type(target.name)
    resp = send_file(target, mimetype=mime or "application/octet-stream", conditional=True)
    resp.headers["Content-Security-Policy"] = "sandbox allow-scripts allow-modals allow-popups"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    return resp


@app.route("/api/workspace/upload", methods=["POST"])
def api_workspace_upload():
    """Upload files to the workspace. Supports multipart file uploads with optional relative paths."""
    root = _workspace_dir()
    if not root or not root.is_dir():
        return jsonify({"error": "No workspace folder selected"}), 400
    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "No files provided"}), 400
    MAX_FILES = 200
    MAX_TOTAL_BYTES = 500 * 1024 * 1024
    if len(files) > MAX_FILES:
        return jsonify({"error": f"Too many files ({len(files)}). Max {MAX_FILES}."}), 400
    results = []
    total_bytes = 0
    for f in files:
        rel = f.filename or "untitled"
        rel = rel.replace("\x00", "").replace("\\", "/").lstrip("/")
        if ".." in rel.split("/"):
            results.append({"path": rel, "error": "Invalid path"})
            continue
        target = (root / rel).resolve()
        if target != root and root not in target.parents:
            results.append({"path": rel, "error": "Path outside workspace"})
            continue
        if target.is_symlink():
            sym_target = target.resolve()
            if sym_target != root and root not in sym_target.parents:
                results.append({"path": rel, "error": "Symlink escapes workspace"})
                continue
        resolved_rel = target.relative_to(root)
        parts_lower = {part.lower() for part in resolved_rel.parts}
        if parts_lower & {s.lower() for s in _SENSITIVE_DIRS}:
            results.append({"path": rel, "error": "Sensitive directory"})
            continue
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            f.save(str(target))
            fsize = target.stat().st_size
            total_bytes += fsize
            if total_bytes > MAX_TOTAL_BYTES:
                target.unlink(missing_ok=True)
                results.append({"path": rel, "error": "Total upload size exceeded 500 MB"})
                break
            results.append({"path": rel, "ok": True, "size": fsize})
        except OSError as e:
            results.append({"path": rel, "error": str(e)[:120]})
    return jsonify({"ok": True, "files": results, "count": sum(1 for r in results if r.get("ok"))})


@app.route("/api/workspace/set", methods=["POST"])
def api_workspace_set():
    payload = request.get_json(silent=True) or {}
    if payload.get("clear"):
        cfg = load_config()
        cfg.pop("workspace_dir", None)
        save_config(cfg)
        return jsonify({"ok": True, "workspace": str(_workspace_dir()), "cleared": True})
    raw = ((payload.get("path") or "")).strip().strip('"')
    if not raw:
        return jsonify({"ok": False, "error": "No folder given"}), 400
    root = Path(raw).expanduser()
    if not root.is_absolute():
        return jsonify({"ok": False, "error": "Use a full folder path, like C:\\Users\\you\\project"}), 400
    root = root.resolve()
    if root == Path(root.anchor) or root == Path.home().resolve():
        return jsonify({"ok": False, "error": "Pick a project folder, not a whole drive or your home folder."}), 400
    try:
        root.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        return jsonify({"ok": False, "error": f"Cannot use that folder: {e}"}), 400
    cfg = load_config()
    cfg["workspace_dir"] = str(root)
    save_config(cfg)
    return jsonify({"ok": True, "workspace": str(root)})


@app.route("/api/workspace/save", methods=["POST"])
def api_workspace_save():
    """The user pressed Save to disk on a code answer: that click is the approval."""
    data = request.get_json(silent=True) or {}
    key = (data.get("chat_id") or _current_chat_id, data.get("lane") or "a")
    item = _last_webdev.get(key)
    if not item:
        return jsonify({"ok": False, "error": "No code files from this chat to save. Send a Code message first."}), 404
    root = workspace.project_dir(key[0], item["title"], key[1], base=_chosen_ws())
    plan = workspace.plan_project(root, item["files"])
    written, deleted = workspace.apply_project(plan)
    return jsonify({"ok": True, "root": str(root), "written": written, "deleted": deleted,
                    "files": plan["files"], "preview": _preview_url(root)})


@app.route("/api/workspace/zip")
def api_workspace_zip():
    root = _allowed_root(request.args.get("path"))
    if not root or not root.is_dir():
        return jsonify({"error": "Only project folders can be zipped."}), 403
    return send_file(io.BytesIO(workspace.zip_dir(root)), mimetype="application/zip", as_attachment=True,
                     download_name=f"{root.parent.name}-{root.name}.zip")


# ---------- Run a project on this PC ----------
# Code mode builds and runs projects in arena.ai's cloud sandbox; only the
# files come to this PC. "Run on this PC" installs the local copy's
# dependencies and starts its dev server here, reports the address, and
# stops it on request or when the app closes (agent.BACKGROUND).
_RUN_LOCAL: dict = {}  # folder -> {"id": background id, "log": log path}
_RUN_SCRIPTS = ("dev", "start", "preview", "serve")


def _project_runner(folder: Path):
    """The install and start commands for a Node project folder, or None."""
    pkg = folder / "package.json"
    if not pkg.is_file():
        return None
    try:
        scripts = (json.loads(pkg.read_text(encoding="utf-8")) or {}).get("scripts") or {}
    except (OSError, ValueError, AttributeError):
        return None
    script = next((s for s in _RUN_SCRIPTS if s in scripts), None)
    if not script:
        return None
    manager = "pnpm" if (folder / "pnpm-lock.yaml").is_file() else "yarn" if (folder / "yarn.lock").is_file() else "npm"
    return f"{manager} install", f"{manager} run {script}"


def _run_local_state(entry: dict) -> dict:
    running = entry["id"] in agent.BACKGROUND.ids()
    log = agent.BACKGROUND._tail(Path(entry["log"]), 12000)
    urls = []
    for url in agent._URL_RE.findall(log):
        url = url.rstrip(".,;)").replace("://0.0.0.0", "://localhost")
        if url not in urls:
            urls.append(url)
    return {"running": running, "urls": urls[:3], "log": log[-3000:]}


@app.route("/api/workspace/run-local", methods=["POST"])
def api_workspace_run_local():
    body = request.get_json(silent=True) or {}
    raw = str(body.get("path") or "").strip()
    folder = Path(raw).expanduser() if raw else _chosen_ws()
    if folder is None or not folder.is_dir():
        return jsonify({"ok": False, "error": "Choose the project folder first."}), 400
    folder = folder.resolve()
    runner = _project_runner(folder)
    if runner is None:
        # a Code-mode chat folder often holds the project one level down
        subs = [p for p in folder.iterdir() if p.is_dir() and _project_runner(p)]
        if len(subs) == 1:
            folder, runner = subs[0], _project_runner(subs[0])
        elif subs:
            names = ", ".join(sorted(p.name for p in subs)[:4])
            return jsonify({"ok": False, "error": f"This folder holds several projects ({names}). "
                                                  "Choose one of them as the folder first."}), 400
    if runner is None:
        return jsonify({"ok": False, "error": "No package.json with a dev or start script in this folder."}), 400
    old = _RUN_LOCAL.pop(str(folder), None)
    if old:
        agent.BACKGROUND.stop(old["id"])
    # Always install: it is quick when nothing changed, and it replaces
    # packages built for another system (e.g. copied from a Linux sandbox).
    cmd = " && ".join(runner)
    text = agent.BACKGROUND.start(cmd, folder)
    started = re.search(r"Started in the background: id (bg\d+)", text)
    if not started:
        return jsonify({"ok": False, "error": text[-2000:] or "The command did not start."}), 500
    entry = {"id": started.group(1), "log": str(folder / agent.ARTIFACTS_DIR / f"{started.group(1)}.log")}
    _RUN_LOCAL[str(folder)] = entry
    return jsonify(dict(ok=True, id=entry["id"], folder=str(folder), cmd=cmd, **_run_local_state(entry)))


@app.route("/api/workspace/run-local/<bid>", methods=["GET", "DELETE"])
def api_workspace_run_local_state(bid):
    entry = next((e for e in _RUN_LOCAL.values() if e["id"] == bid), None)
    if entry is None:
        return jsonify({"ok": False, "error": "This run is no longer known."}), 404
    if request.method == "DELETE":
        agent.BACKGROUND.stop(bid)
    return jsonify(dict(ok=True, id=bid, **_run_local_state(entry)))


@app.route("/api/workspace/open", methods=["POST"])
def api_workspace_open():
    root = _allowed_root((request.get_json(silent=True) or {}).get("path"))
    if not root or not root.is_dir():  # folders only: opening a file would run it
        return jsonify({"ok": False, "error": "Only project folders can be opened."}), 403
    if not hasattr(os, "startfile"):
        return jsonify({"ok": False, "error": "Opening folders works on Windows only.", "path": str(root)}), 400
    os.startfile(str(root))
    return jsonify({"ok": True})
