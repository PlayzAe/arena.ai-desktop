"""
Flask web backend for Arena.ai desktop client.
Serves the web UI and proxies chat requests to arena.ai.
"""

import json
import logging
import mimetypes
import os
import sys
import threading
import time
import webbrowser
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import requests

from flask import Flask, Response, jsonify, request, send_file, send_from_directory, stream_with_context

# Add parent to path for arena imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from arena.config import (
    BASE_URL,
    CHATS_DIR,
    COOKIE_FILE,
    ensure_config_dir,
    load_config,
    save_config,
)
from arena.api import ArenaClient, extract_bearer_token, fetch_cookies_via_cdp
from arena.models import sync_models, get_models_for_modality, ORG_COLOR_MAP
from arena.auth import detect_installed_browsers, parse_cookie_input

import base64
import ctypes
import ctypes.wintypes
import re
import shutil
import sqlite3
import tempfile
import uuid
import codecs
import functools
import http.server
import io
import mimetypes
import urllib.parse

import requests
from datetime import datetime, timezone


def _dpapi_decrypt(data: bytes):
    class DATA_BLOB(ctypes.Structure):
        _fields_ = [("cbData", ctypes.wintypes.DWORD),
                     ("pbData", ctypes.POINTER(ctypes.c_char))]
    p = ctypes.create_string_buffer(data, len(data))
    bi = DATA_BLOB(len(data), p)
    bo = DATA_BLOB()
    if ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(bi), None, None, None, None, 0, ctypes.byref(bo)
    ):
        result = ctypes.string_at(bo.pbData, bo.cbData)
        ctypes.windll.kernel32.LocalFree(bo.pbData)
        return result
    return None


def _decrypt_cookie_val(enc: bytes, key: bytes):
    if len(enc) < 16:
        return None
    if enc[:3] in (b'v10', b'v11', b'v20'):
        nonce = enc[3:15]
        ct = enc[15:]
        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            return AESGCM(key).decrypt(nonce, ct, None).decode('utf-8', errors='ignore')
        except Exception:
            return None
    d = _dpapi_decrypt(enc)
    return d.decode('utf-8', errors='ignore') if d else None


def _extract_browser_cookies():
    dirs = {
        'chrome': os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\User Data'),
        'edge': os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\Edge\User Data'),
        'brave': os.path.expandvars(r'%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data'),
    }
    for name, ud in dirs.items():
        if not os.path.isdir(ud):
            continue
        r = _try_chromium_cookies(ud)
        if r:
            return r
    return None


def _try_chromium_cookies(ud):
    ls_file = os.path.join(ud, 'Local State')
    if not os.path.isfile(ls_file):
        return None
    try:
        with open(ls_file, 'r', encoding='utf-8') as f:
            ls = json.load(f)
        ek = base64.b64decode(ls['os_crypt']['encrypted_key'])[5:]
        key = _dpapi_decrypt(ek)
        if not key:
            return None
    except Exception:
        return None

    for profile in ['Default'] + [f'Profile {i}' for i in range(1, 6)]:
        cdb = os.path.join(ud, profile, 'Cookies')
        if not os.path.isfile(cdb):
            continue
        tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False).name
        try:
            shutil.copy2(cdb, tmp)
            conn = sqlite3.connect(tmp)
            rows = conn.execute(
                "SELECT name, encrypted_value FROM cookies WHERE host_key LIKE '%arena.ai%'"
            ).fetchall()
            conn.close()
        except Exception:
            continue
        finally:
            try:
                os.unlink(tmp)
            except Exception:
                pass

        cookies = {}
        for cname, cval in rows:
            if cval and len(cval) > 3:
                v = _decrypt_cookie_val(cval, key)
                if v:
                    cookies[cname] = v
        if 'arena-auth-prod-v1.0' in cookies:
            return '; '.join(f'{k}={v}' for k, v in cookies.items())
    return None

def _find_preview_url(val):
    if isinstance(val, dict):
        for k in ("sandboxUrl", "previewUrl", "deploymentUrl", "deployUrl", "webUrl"):
            if k in val and isinstance(val[k], str) and val[k].startswith("http"):
                return val[k]
        for v in val.values():
            r = _find_preview_url(v)
            if r:
                return r
    elif isinstance(val, list):
        for item in val:
            r = _find_preview_url(item)
            if r:
                return r
    return None


from arena import agent, contracts, permissions, workspace
from arena.api import generate_uuidv7
from arena.auth import get_clipboard_text
from arena.engine import ENGINE

_overrides = contracts.load_overrides()
MODE_API_MAP = dict(contracts.UI_MODES)
MODALITY_API_MAP = dict(contracts.UI_MODALITIES)
VALID_API_MODES = contracts.API_MODES
VALID_API_MODALITIES = ("chat", "webdev", "search", "image", "video")
BROKER = permissions.PermissionBroker()
_stop = threading.Event()
_last_webdev: dict = {}

if getattr(sys, 'frozen', False):
    _base = Path(sys._MEIPASS)
else:
    _base = Path(__file__).parent
STATIC_DIR = _base / "arena" / "web" / "static" if getattr(sys, 'frozen', False) else Path(__file__).parent / "static"

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")

# Global client instance
_client: Optional[ArenaClient] = None
_conversation_history: list = []
_ui_mode = 'battle'
_ui_modality = 'auto'
_current_chat_id: Optional[str] = None

_UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')


def _validate_chat_id(chat_id: str) -> bool:
    return bool(_UUID_RE.match(chat_id))


def _save_chat(chat_id: str, title: str, messages: list,
               mode: str = 'battle', modality: str = 'auto',
               model_a: str = None, model_b: str = None, eval_id: str = None):
    if not _validate_chat_id(chat_id):
        return
    chat_dir = CHATS_DIR / chat_id
    chat_dir.mkdir(parents=True, exist_ok=True)
    chat_file = chat_dir / "chat.json"
    now = datetime.now(timezone.utc).isoformat()
    existing = {}
    if chat_file.exists():
        try:
            existing = json.loads(chat_file.read_text(encoding="utf-8"))
        except Exception:
            pass
    data = {
        "id": chat_id,
        "title": title,
        "created_at": existing.get("created_at", now),
        "updated_at": now,
        "mode": mode,
        "modality": modality,
        "model_a": model_a,
        "model_b": model_b,
        "eval_id": eval_id,
        "messages": messages,
    }
    chat_file.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def _load_chat(chat_id: str) -> Optional[dict]:
    if not _validate_chat_id(chat_id):
        return None
    chat_file = CHATS_DIR / chat_id / "chat.json"
    if not chat_file.exists():
        return None
    try:
        return json.loads(chat_file.read_text(encoding="utf-8"))
    except Exception:
        return None


def _list_chats() -> list:
    if not CHATS_DIR.exists():
        return []
    chats = []
    for d in CHATS_DIR.iterdir():
        if not d.is_dir():
            continue
        f = d / "chat.json"
        if not f.exists():
            continue
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            chats.append({
                "id": data.get("id", d.name),
                "title": data.get("title", "Untitled"),
                "updated_at": data.get("updated_at", ""),
                "mode": data.get("mode"),
                "modality": data.get("modality"),
                "message_count": len(data.get("messages", [])),
            })
        except Exception:
            pass
    chats.sort(key=lambda c: c.get("updated_at", ""), reverse=True)
    return chats


def _delete_chat(chat_id: str) -> bool:
    if not _validate_chat_id(chat_id):
        return False
    chat_dir = CHATS_DIR / chat_id
    if chat_dir.exists() and chat_dir.is_dir():
        shutil.rmtree(chat_dir)
        return True
    return False


def get_client() -> ArenaClient:
    global _client
    if _client is None:
        cookie_str = None
        if COOKIE_FILE.exists():
            cookie_str = COOKIE_FILE.read_text(encoding="utf-8").strip()
        _client = ArenaClient(cookie_str=cookie_str)
    return _client


# ---------- Static serving ----------

@app.route("/")
def index():
    return send_from_directory(str(STATIC_DIR), "index.html")


# ---------- API routes ----------

_me_cache = {"t": 0.0, "user": None, "err": None}


def _engine_on() -> bool:
    return ENGINE.window is not None


def _perm_mode() -> str:
    return permissions.normalize(load_config().get("permission_mode"))


def _get_me(client: ArenaClient):
    """Ask arena.ai who is signed in. In the desktop app only the engine uses the session:
    Supabase revokes a refresh token that two clients keep rotating."""
    if _engine_on():
        user, err = ENGINE.get_me()
        ENGINE.sync_to(client)
        return user, err
    return client.get_me()


def _check_session(client: ArenaClient, force: bool = False):
    if not force and time.time() - _me_cache["t"] < 120:
        return _me_cache["user"], _me_cache["err"]
    user, err = _get_me(client)
    _me_cache.update(t=time.time(), user=user, err=err)
    return user, err


def _signed_in_somewhere(client: ArenaClient) -> bool:
    return bool(client.cookie_str) or (_engine_on() and ENGINE.ready() and ENGINE.has_session())


@app.route("/api/status")
def api_status():
    client = get_client()
    out = {
        "authenticated": False, "email": None, "full_name": None, "avatar_url": None,
        "session_error": None, "offline": False, "loading": False,
        "mode": _ui_mode, "modality": _ui_modality, "eval_id": client.eval_id,
        "desktop": _engine_on(), "engine": ENGINE.state(), "permission_mode": _perm_mode(),
        "workspace": str(_workspace_dir()), "projects_dir": str(workspace.PROJECTS_DIR),
        "pending_permissions": len(BROKER.pending()),
    }
    cookie_user = (parse_cookie_input(client.cookie_str)[2] if client.cookie_str else None) or {}
    ident = {"email": cookie_user.get("email"), "full_name": cookie_user.get("full_name"),
             "avatar_url": cookie_user.get("avatar_url")}
    if _engine_on() and not ENGINE.ready():
        # arena.ai is still loading or waiting on a check; answer now, the UI polls again
        out.update(ident, loading=True, authenticated=bool(client.cookie_str))
        return jsonify(out)
    if not _signed_in_somewhere(client):
        return jsonify(out)
    user, err = _check_session(client, force=request.args.get("refresh") == "1")
    if user:
        out.update(ident, authenticated=True, email=user.get("email") or ident["email"],
                   avatar_url=user.get("avatarUrl") or ident["avatar_url"])
    elif err and err.startswith("Network error"):
        out.update(ident, authenticated=True, offline=True)
    else:
        out["session_error"] = err
    return jsonify(out)


def _activate_cookie(cookie_str: str, method: str):
    """Adopt a cookie only after arena.ai confirms the session; returns (response, ok)."""
    global _client
    candidate = ArenaClient(cookie_str=cookie_str)
    if _engine_on():
        if not ENGINE.import_cookies(cookie_str):
            return jsonify({"ok": False, "error": "No arena-auth-prod-v1 cookie found in that text."}), False
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
    COOKIE_FILE.write_text(candidate.cookie_str, encoding="utf-8")
    _client = candidate
    _me_cache.update(t=time.time(), user=user, err=None)
    _, _, cookie_user = parse_cookie_input(candidate.cookie_str)
    return jsonify({
        "ok": True, "method": method, "email": user.get("email"),
        "full_name": (cookie_user or {}).get("full_name"), "avatar_url": user.get("avatarUrl"),
    }), True


@app.route("/api/models")
def api_models():
    try:
        models = sync_models(force=False)
    except Exception:
        models = {}
    modality = request.args.get("modality", "auto")
    api_mod = MODALITY_API_MAP.get(modality, modality)
    if api_mod not in VALID_API_MODALITIES:
        api_mod = "chat"
    filtered = get_models_for_modality(models, api_mod)
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
            "color": ORG_COLOR_MAP.get(org_name, "#C7C2BC"),
            "rank": m.get("rank", m.get("arena_rank")),
            "capabilities": m.get("capabilities", []),
            "arena_score": m.get("arena_score"),
        })
    return jsonify(result)


_LOGIN_STEPS = ("In your browser: sign in on arena.ai, press F12, open the Console tab, type copy(document.cookie) "
                "and press Enter, then press Paste from clipboard here.")


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or {}
    method = data.get("method") or ("auto" if data.get("auto") else "manual")
    if method == "window":
        if not _engine_on():
            return jsonify({"ok": False, "error": "The sign-in window is part of the desktop app (arena-ai.exe). " + _LOGIN_STEPS}), 400
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
    raw = (raw or "").strip()
    if not raw:
        where = "The clipboard is empty." if method == "clipboard" else "No cookie text was given."
        return jsonify({"ok": False, "error": f"{where} {_LOGIN_STEPS}"}), 400
    cookie_str, cookie_dict, _ = parse_cookie_input(raw)
    if not any(k.startswith(contracts.AUTH_COOKIE_PREFIX) for k in cookie_dict):
        return jsonify({"ok": False, "error": "That text has no arena-auth-prod-v1 cookie, so it is not an arena.ai "
                        "session. " + _LOGIN_STEPS}), 400
    resp, ok = _activate_cookie(cookie_str, method)
    return (resp, 200) if ok else (resp, 401)


@app.route("/api/login/poll")
def api_login_poll():
    """Sign-in window: report once the arena.ai page holds a confirmed account session."""
    if not _engine_on():
        return jsonify({"ok": False, "done": True, "error": "The sign-in window is part of the desktop app."})
    st = ENGINE.state()
    if not (ENGINE.ready() and ENGINE.has_session()):
        if st["login_open"]:
            return jsonify({"ok": False, "done": False, "hint": "Finish signing in in the arena.ai window."})
        return jsonify({"ok": False, "done": True, "error": "The arena.ai window was closed before sign-in finished. "
                        "If Google sign-in fails in the embedded window, use email sign-in or the cookie steps."})
    user, err = ENGINE.get_me()
    if not user or not user.get("email"):
        err = err or "Signed in as a guest only. Sign in with Google or email in the arena.ai window."
        return jsonify({"ok": False, "done": not st["login_open"], "hint": err,
                        "error": None if st["login_open"] else err})
    ENGINE.sync_to(get_client())
    _me_cache.update(t=time.time(), user=user, err=None)
    ENGINE.finish_login()
    return jsonify({"ok": True, "done": True, "email": user.get("email"), "avatar_url": user.get("avatarUrl")})


@app.route("/api/logout", methods=["POST"])
def api_logout():
    global _client
    if COOKIE_FILE.exists():
        COOKIE_FILE.unlink()
    if _engine_on():
        ENGINE.logout()
    _client = ArenaClient(cookie_str=None)
    _me_cache.update(t=0.0, user=None, err=None)
    return jsonify({"ok": True})


@app.route("/api/settings", methods=["GET", "POST"])
def api_settings():
    if request.method == "GET":
        return jsonify(load_config())
    data = request.get_json(silent=True) or {}
    cfg = load_config()
    cfg.update(data)
    save_config(cfg)
    return jsonify({"ok": True})


@app.route("/api/mode", methods=["POST"])
def api_mode():
    global _ui_mode
    data = request.get_json(silent=True) or {}
    mode = data.get("mode", "battle")
    api_mode_val = MODE_API_MAP.get(mode, mode)
    if api_mode_val not in VALID_API_MODES:
        return jsonify({"ok": False, "error": f"Invalid mode: {mode}"}), 400
    client = get_client()
    client.active_mode = api_mode_val
    client.eval_id = None
    _ui_mode = mode
    return jsonify({"ok": True, "mode": mode, "api_mode": api_mode_val})


@app.route("/api/modality", methods=["POST"])
def api_modality():
    global _ui_modality
    data = request.get_json(silent=True) or {}
    modality = data.get("modality", "chat")
    api_mod = MODALITY_API_MAP.get(modality, modality)
    if api_mod not in VALID_API_MODALITIES:
        return jsonify({"ok": False, "error": f"Invalid modality: {modality}"}), 400
    client = get_client()
    client.active_modality = api_mod
    client.eval_id = None
    _ui_modality = modality
    return jsonify({"ok": True, "modality": modality, "api_modality": api_mod})


@app.route("/api/new", methods=["POST"])
def api_new_chat():
    global _conversation_history, _current_chat_id
    client = get_client()
    client.eval_id = None
    client.sources.clear()
    _conversation_history = []
    _current_chat_id = str(uuid.uuid4())
    return jsonify({"ok": True, "chat_id": _current_chat_id})


@app.route("/api/history")
def api_history():
    return jsonify(_conversation_history)


@app.route("/api/chats")
def api_chats_list():
    return jsonify(_list_chats())


@app.route("/api/chats/<chat_id>")
def api_chat_load(chat_id):
    global _conversation_history, _current_chat_id
    data = _load_chat(chat_id)
    if not data:
        return jsonify({"error": "Chat not found"}), 404
    _current_chat_id = chat_id
    _conversation_history = data.get("messages", [])
    client = get_client()
    client.eval_id = data.get("eval_id")
    return jsonify(data)


@app.route("/api/chats/<chat_id>/delete", methods=["POST"])
def api_chat_delete(chat_id):
    if _delete_chat(chat_id):
        return jsonify({"ok": True})
    return jsonify({"error": "Chat not found"}), 404


LOG = logging.getLogger("arena.desktop")
_tl = threading.local()  # per request: the last error shown to the user, kept in the chat history


def _sse(obj) -> str:
    if obj.get("type") == "error":
        _tl.error = obj.get("message")
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


def _sse_wrap(gen):
    """A crash must not end the stream silently: report it as an error event."""
    try:
        yield from gen
    except Exception as e:
        yield _sse({"type": "error", "code": "internal", "message": "The app hit an internal error.",
                    "detail": f"{type(e).__name__}: {e}", "retry": True})
        yield _sse({"type": "done", "text_a": "", "text_b": ""})


def _workspace_dir() -> Path:
    raw = load_config().get("workspace_dir")
    return Path(raw).expanduser() if raw else workspace.PROJECTS_DIR / "workspace"


def _chosen_ws() -> Optional[Path]:
    """The folder the user picked in the composer, or None when they have not picked one."""
    raw = load_config().get("workspace_dir")
    return Path(raw).expanduser() if raw else None


class _HttpStream:
    """A requests response with the EngineResponse interface, for running without the desktop engine."""

    def __init__(self, resp=None, error=None):
        self._r, self.error = resp, error
        self.status_code = resp.status_code if resp is not None else 0

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
    if _engine_on():
        if not ENGINE.wait_ready(30):
            return _HttpStream(error=f"arena.ai is waiting for a {ENGINE.challenge} check" if ENGINE.challenge
                               else "arena.ai window is still loading")
        return ENGINE.request(path, body)
    try:
        r = client.session.post(contracts.ORIGIN + path, json=body, stream=True, timeout=(15, 300))
    except requests.RequestException as e:
        return _HttpStream(error=str(e))
    client.sync_cookies()
    return _HttpStream(r)


def _wait_for(check, seconds: int):
    """Poll check() once a second with keep-alive pings; returns its first truthy value."""
    for i in range(seconds):
        value = check()
        if value or _stop.is_set():
            return value
        time.sleep(1)
        if i % 10 == 9:
            yield _sse({"type": "ping"})
    return check()


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
        yield _sse({"type": "preview", "model": lane, "url": url, "status": item.get("status"),
                    "message": item.get("message") or item.get("reason")})


def _save_media(m: dict, lane: str, conv: dict):
    """Keep a generated image, video or sound in the folder the user picked (when they picked one)."""
    ws = _chosen_ws()
    done = conv.setdefault("media_saved", set())
    if ws is None or m["url"] in done:
        return
    done.add(m["url"])
    try:
        r = requests.get(m["url"], timeout=120)
        r.raise_for_status()
        ext = Path(urlparse(m["url"]).path).suffix[:6] or mimetypes.guess_extension(
            (r.headers.get("content-type") or "").split(";")[0].strip()) or ".bin"
        ws.mkdir(parents=True, exist_ok=True)
        target = ws / f"{workspace.slug(conv['title'])}-{lane}-{uuid.uuid4().hex[:6]}{ext}"
        target.write_bytes(r.content)
    except (requests.RequestException, OSError) as e:
        yield _sse({"type": "notice", "model": lane, "text": f"Could not save the {m.get('kind') or 'file'}: {e}"})
        return
    yield _sse({"type": "notice", "model": lane, "text": f"Saved to {target}"})


def _line_events(r, conv: dict):
    """Turn arena's stream into SSE events; returns the answer text per lane."""
    out = {"a": "", "b": ""}
    split = contracts.LineSplitter()

    def handle(line):
        parsed = contracts.parse_line(line)
        if not parsed:
            return
        lane, kind, value = parsed
        if kind == "text":
            out[lane] += str(value)
            yield _sse({"type": "text", "model": lane, "text": str(value)})
        elif kind == "reasoning":
            yield _sse({"type": "reasoning", "model": lane, "text": str(value)})
        elif kind == "source":
            yield _sse({"type": "source", "model": lane, "data": value})
        elif kind == "error":
            yield _sse({"type": "error", "code": "model", "model": lane, "retry": True,
                        "message": f"Model {lane.upper()} stopped with an error: {value}"})
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
                    yield _sse({"type": "preview", "model": lane, "url": url})

    for chunk in r.iter_text():
        for line in split.feed(chunk):
            yield from handle(line)
        if _stop.is_set():
            yield _sse({"type": "notice", "text": "Stopped."})
            return out
    for line in split.flush():
        yield from handle(line)
    return out


def _turn(client: ArenaClient, content: str, conv: dict):
    """Send one message and stream the answer. Yields SSE events; returns {"a": text, "b": text},
    or None after sending an error event."""
    v2 = None
    for _ in range(4):
        if conv["new"] and not conv.get("eval_id"):
            conv["eval_id"] = generate_uuidv7()
        try:
            path, body = contracts.build_chat(
                eval_id=conv["eval_id"], new=conv["new"], mode=conv["mode"], modality=conv["modality"],
                content=content, ids=generate_uuidv7, model_a=conv.get("model_a"), model_b=conv.get("model_b"),
                v2_token=v2)
        except ValueError as e:
            yield _sse({"type": "error", "code": "bad_request", "message": str(e), "retry": False})
            return None
        v2 = None
        r = _send(client, path, body)
        LOG.info("chat %s: HTTP %s (v2 token sent: %s)", conv["chat_id"][:8], r.status_code, bool(body.get("recaptchaV2Token")))
        if r.status_code == 200:
            conv["new"] = False
            out = yield from _line_events(r, conv)
            if _engine_on():
                ENGINE.sync_to(client)
            return out
        err = contracts.classify_error(r.status_code, r.text if r.status_code else (r.error or ""))
        LOG.info("chat %s: %s - %s", conv["chat_id"][:8], err.get("code"), str(err.get("message", ""))[:200])
        if r.status_code == 0 and _engine_on() and ENGINE.challenge == "cloudflare":
            err["code"] = "cloudflare"
        if err["code"] == "challenge" and _engine_on():
            ENGINE.request_human_check()
            yield _sse({"type": "challenge", "kind": "recaptcha", "message": "arena.ai wants a quick human check. "
                        "Tick the box in the arena.ai window; your message is resent right after."})
            token = yield from _wait_for(
                lambda: ENGINE.take_v2_token() or (ENGINE.challenge != "recaptcha" and "closed"), 300)
            if token == "closed":
                token = ENGINE.take_v2_token()
            LOG.info("chat %s: human check %s", conv["chat_id"][:8], "passed" if token else "not finished")
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
            err["message"] += " Open Arena Desktop (arena-ai.exe): it shows arena.ai's check so you can finish it."
        yield _sse(dict(err, type="error"))
        return None
    yield _sse({"type": "error", "code": "http", "retry": True, "message": "arena.ai kept refusing the message."})
    return None


def _agent_run(client: ArenaClient, message: str, conv: dict):
    """Local tools in a text chat: each model asks for tools and the app runs them under the permission mode.
    In Battle and Side by Side each model writes to its own copy of the folder (option-a, option-b)."""
    root = _workspace_dir()
    root.mkdir(parents=True, exist_ok=True)
    lanes = ("a", "b") if conv["mode"] in ("battle", "side-by-side") else ("a",)
    dual = len(lanes) == 2
    tools = {l: agent.LocalTools(root, root / agent.LANE_DIRS[l] if dual else None) for l in lanes}
    mode = _perm_mode()
    content = message
    if conv["new"]:
        content = agent.guide(root, permissions.MODES[mode], agent.MODE_NOTES[mode], dual) + message
    total = {"a": "", "b": ""}
    yield _sse({"type": "agent", "root": str(root), "mode": mode, "dual": dual})
    for rnd in range(1, agent.MAX_ROUNDS + 1):
        out = yield from _turn(client, content, conv)
        if out is None:
            break
        calls = {l: agent.parse_tool_calls(out[l]) for l in lanes}
        for l in lanes:
            total[l] += out[l]
        if not any(calls.values()) or _stop.is_set():
            break
        mode = _perm_mode()
        results = {}
        for l in lanes:
            results[l] = outcomes = []
            for call in calls[l]:
                if _stop.is_set():
                    outcomes.append((call, "skipped: the user pressed Stop", ""))
                    continue
                info = dict(tools[l].describe(call), model=l)
                yield _sse(dict(info, type="tool_call"))
                if call["name"] not in permissions.KIND:
                    ok, output = tools[l].run(call)
                    status = "error"
                else:
                    answer = yield from _permit(mode, call["name"], info)
                    if answer == "allow":
                        ok, output = tools[l].run(call)
                        status = "ok" if ok else "error"
                    else:
                        ok, output = False, ""
                        status = ("blocked: plan mode is read-only" if mode == "plan" else "blocked by safety rules") \
                            if answer == "blocked" else "denied by the user"
                outcomes.append((call, status, output))
                conv.setdefault("tools", []).append({"tool": call["name"], "summary": info.get("summary"), "lane": l,
                                                     "diff": info.get("diff"), "ok": ok, "status": status})
                yield _sse({"type": "tool_result", "model": l, "tool": call["name"], "rel": info.get("rel"), "ok": ok,
                            "status": status, "output": (output or "")[:4000]})
        if _stop.is_set():
            break
        if rnd == agent.MAX_ROUNDS:
            yield _sse({"type": "notice", "text": f"Stopped after {agent.MAX_ROUNDS} tool rounds. Send 'continue' to keep going."})
            break
        content = agent.format_lane_results(results) if dual else agent.format_results(results["a"])
        for l in lanes:
            total[l] += "\n\n"
        yield _sse({"type": "round", "n": rnd + 1})
    return total


def _model_name(model_id):
    """Display name for a model id from the cached catalog (None when unknown)."""
    if not model_id:
        return None
    try:
        stack = [sync_models(force=False)]
    except Exception:
        return None
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            if cur.get("model_id", cur.get("id")) == model_id and cur.get("name"):
                return cur["name"]
            stack.extend(v for v in cur.values() if isinstance(v, (dict, list)))
        elif isinstance(cur, list):
            stack.extend(cur)
    return None


@app.route("/api/chat", methods=["POST"])
def api_chat():
    global _current_chat_id, _conversation_history
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    if not message:
        return jsonify({"error": "Empty message"}), 400
    client = get_client()
    if not _signed_in_somewhere(client):
        return jsonify({"error": "Not signed in. Press Sign in first.", "code": "auth"}), 401
    mode, modality = contracts.api_mode(_ui_mode), contracts.api_modality(_ui_modality)
    model_a, model_b = data.get("model_id") or None, data.get("model_id_b") or None
    if mode != "battle" and not model_a:
        return jsonify({"error": "Pick a model first: Direct, Agent and Side by Side need one.", "code": "bad_request"}), 400
    if mode == "side-by-side" and not model_b:
        return jsonify({"error": "Pick a second model for Side by Side.", "code": "bad_request"}), 400
    _current_chat_id = data.get("chat_id") or str(uuid.uuid4())
    _stop.clear()
    existing = _load_chat(_current_chat_id) or {}
    # Each chat keeps its own history and arena conversation; a new mode, modality or model starts a new one.
    same = bool(existing) and (existing.get("mode"), existing.get("modality"), existing.get("model_a"), existing.get("model_b")) \
        == (_ui_mode, _ui_modality, model_a, model_b)
    eval_id = existing.get("eval_id") if same else None
    conv = {"eval_id": eval_id, "new": not eval_id, "mode": mode, "modality": modality,
            "model_a": model_a, "model_b": model_b, "chat_id": _current_chat_id,
            "title": existing.get("title") or message[:50], "tools": []}
    history = list(existing.get("messages") or [])
    history.append({"role": "user", "text": message})
    _conversation_history = history
    ui_mode, ui_modality = _ui_mode, _ui_modality
    names = {"a": _model_name(model_a), "b": _model_name(model_b)}
    dual = mode in ("battle", "side-by-side")
    # Once the user picks a folder, every text chat can use it, whatever the mode; Agent always can.
    tools_on = ui_mode == "agent" or (_chosen_ws() is not None and modality in ("chat", "search"))

    def generate():
        _tl.error = None
        yield _sse({"type": "meta", "dual": dual, "mode": ui_mode, "modality": ui_modality,
                    "chat_id": conv["chat_id"], "permission_mode": _perm_mode(), "names": names})
        if tools_on:
            out = yield from _agent_run(client, message, conv)
        else:
            out = yield from _turn(client, message, conv)
        out = out or {"a": "", "b": ""}
        client.eval_id = None if conv["new"] else conv["eval_id"]
        clean = agent.strip_tool_calls if tools_on else str
        reply = {"role": "assistant", "text": clean(out["a"]), "text_b": clean(out["b"]), "names": names}
        if conv["tools"]:
            reply["tools"] = conv["tools"]
        if not (out["a"] or out["b"]) and _tl.error:
            reply["error"] = _tl.error
        history.append(reply)
        _save_chat(conv["chat_id"], title=conv["title"], messages=history, mode=ui_mode,
                   modality=ui_modality, model_a=model_a, model_b=model_b, eval_id=client.eval_id)
        yield _sse({"type": "done", "text_a": out["a"], "text_b": out["b"], "dual": dual, "chat_id": conv["chat_id"]})

    return Response(
        stream_with_context(_sse_wrap(generate())),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------- File CRUD (IDE) ----------

def _safe_resolve(rel_path: str) -> Path:
    """Resolve a user-supplied path, blocking traversal outside home."""
    home = Path.home().resolve()
    if rel_path in ("", "."):
        return home
    p = Path(rel_path).expanduser()
    p = (p if p.is_absolute() else home / p).resolve()
    if p != home and home not in p.parents:
        raise PermissionError("Access denied: outside home directory")
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
    import subprocess
    data = request.get_json(silent=True) or {}
    cmd = data.get("command", "").strip()
    if not cmd:
        return jsonify({"error": "No command"}), 400
    blocked = ["format", "del /s", "rd /s", "rmdir /s", "rm -rf /"]
    for b in blocked:
        if b in cmd.lower():
            return jsonify({"error": f"Blocked: {b}"}), 403
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True,
            timeout=30, cwd=str(Path.home()),
        )
        return jsonify({
            "output": result.stdout[-4000:] if result.stdout else "",
            "error": result.stderr[-2000:] if result.stderr else "",
            "code": result.returncode,
        })
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Command timed out (30s)"}), 408
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------- Guard, permissions, engine, diagnostics, workspace ----------

@app.before_request
def _local_same_origin_only():
    """Only this app's own page may drive the API: blocks other sites, DNS rebinding and generated previews."""
    if request.host.rsplit(":", 1)[0] not in ("127.0.0.1", "localhost"):
        return jsonify({"error": "Unknown host"}), 403
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return None
    origin = request.headers.get("Origin")
    if origin and origin != request.host_url.rstrip("/"):
        return jsonify({"error": "Cross-origin request blocked"}), 403
    if request.path.startswith("/api/") and request.get_data() and not request.is_json:
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
        models = sync_models(force=False)
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
        add("arena.ai engine", None, "off: run arena-ai.exe for in-app sign-in and human checks")
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
                    "projects": workspace.list_projects()})


@app.route("/api/workspace/set", methods=["POST"])
def api_workspace_set():
    raw = ((request.get_json(silent=True) or {}).get("path") or "").strip().strip('"')
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


@app.route("/api/workspace/open", methods=["POST"])
def api_workspace_open():
    root = _allowed_root((request.get_json(silent=True) or {}).get("path"))
    if not root or not root.is_dir():  # folders only: opening a file would run it
        return jsonify({"ok": False, "error": "Only project folders can be opened."}), 403
    if not hasattr(os, "startfile"):
        return jsonify({"ok": False, "error": "Opening folders works on Windows only.", "path": str(root)}), 400
    os.startfile(str(root))
    return jsonify({"ok": True})


@app.route("/api/media/save", methods=["POST"])
def api_media_save():
    """Download a generated image, video or audio file into the projects folder."""
    url = str((request.get_json(silent=True) or {}).get("url") or "")
    folder = workspace.PROJECTS_DIR / "media"
    try:
        if url.startswith("data:"):
            head, _, payload = url.partition(",")
            mime = head[5:].split(";")[0]
            blob, stem = base64.b64decode(payload), "media"
        else:
            u = urllib.parse.urlparse(url)
            host = (u.hostname or "").lower()
            if u.scheme != "https" or not host or host == "localhost" or host.startswith(("127.", "10.", "192.168.", "169.254.")):
                return jsonify({"ok": False, "error": "Only https media links can be saved."}), 400
            r = requests.get(url, timeout=60, stream=True)
            r.raise_for_status()
            blob = b""
            for chunk in r.iter_content(1 << 16):
                blob += chunk
                if len(blob) > 300 * 1024 * 1024:
                    return jsonify({"ok": False, "error": "File is larger than 300 MB."}), 413
            mime = r.headers.get("Content-Type", "").split(";")[0]
            stem = Path(u.path).stem or "media"
    except (requests.RequestException, ValueError) as e:
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
