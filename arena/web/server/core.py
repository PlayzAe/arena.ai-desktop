# Arena Desktop web backend, part 1 of 11: core.
# Imports, browser-cookie import helpers, generation tracking and per-chat
# stop events, the Flask app object, the chat store, the model catalog,
# static serving and persistent memory / conversation digests.
#
# Not a standalone module: arena/web/app.py runs the parts in order
# inside its own namespace, so names from earlier parts are in scope.

import copy
import difflib
import hashlib
import hmac
import json
import logging
import mimetypes
import os
import queue
import secrets
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
from arena.models import (sync_models, get_models_for_modality, get_router_model,
                          get_auto_agent_model, ORG_COLOR_MAP)
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


from arena import agent, components, connectors, contracts, crypto, history_sync, native_agent, permissions, workspace
from arena.gateway import GatewayManager
from arena.api import generate_uuidv7
from arena.auth import get_clipboard_text
from arena.engine import ENGINE

_overrides = contracts.load_overrides()
MODE_API_MAP = dict(contracts.UI_MODES)
MODALITY_API_MAP = dict(contracts.UI_MODALITIES)
VALID_API_MODES = contracts.API_MODES
VALID_API_MODALITIES = ("chat", "webdev", "search", "image", "video")
BROKER = permissions.PermissionBroker()
CONNECTORS = connectors.ConnectorManager(lambda: _panel_workspace_root())
_stop = threading.Event()
_generation_lock = threading.Lock()
_active_generations = 0
_active_chat_ids: set = set()
_chat_stops: dict = {}
_chat_setup_lock = threading.Lock()
_last_webdev: dict = {}


def _generation_started(chat_id: str = None) -> None:
    global _active_generations
    with _generation_lock:
        _active_generations += 1
        if chat_id:
            _active_chat_ids.add(str(chat_id))


def _generation_finished(chat_id: str = None) -> None:
    global _active_generations
    with _generation_lock:
        _active_generations = max(0, _active_generations - 1)
        if chat_id:
            _active_chat_ids.discard(str(chat_id))
    if chat_id:
        _notify("Arena Desktop", "A chat finished generating.", "done")


# Desktop shell (tray) installs a toast callback here: fn(title, text, kind)
# with kind "done" (a generation finished) or "question" (the model waits
# for an answer).  The web headless server leaves it None.
NOTIFY_HOOK = None


def _notify(title: str, text: str, kind: str = "done") -> None:
    hook = NOTIFY_HOOK
    if hook is None:
        return
    try:
        hook(title, text, kind)
    except Exception:
        LOG.exception("notify hook failed")


def _generation_active() -> bool:
    with _generation_lock:
        return _active_generations > 0


def _chat_generating(chat_id: str) -> bool:
    with _generation_lock:
        return str(chat_id) in _active_chat_ids


def _generating_chat_ids() -> list:
    with _generation_lock:
        return sorted(_active_chat_ids)


def _chat_stop_event(chat_id: str) -> threading.Event:
    with _generation_lock:
        event = _chat_stops.get(str(chat_id))
        if event is None:
            event = threading.Event()
            _chat_stops[str(chat_id)] = event
        return event


def _stopped() -> bool:
    """Stop check for the chat being generated on this request thread.

    The per-chat event lives in thread-local storage (set by the SSE
    generator), so parallel chats stop independently; the legacy global
    event still stops everything."""
    if getattr(_stop, 'is_set')():
        return True
    event = getattr(_tl, "stop_event", None)
    return bool(event is not None and event.is_set())

if getattr(sys, 'frozen', False):
    _base = Path(sys._MEIPASS)
else:
    _base = Path(__file__).parent
STATIC_DIR = _base / "arena" / "web" / "static" if getattr(sys, 'frozen', False) else Path(__file__).parent / "static"

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")

APP_VERSION = "1.5.0"

_API_TOKEN = secrets.token_urlsafe(32)
# Read-only key for /preview/<key>/...: it only serves files of the chosen
# folder, so a preview link can open anywhere without exposing the API token.
_PREVIEW_TOKEN = secrets.token_urlsafe(18)
_secrets = hmac


@app.after_request
def _no_store_ui(resp):
    # The desktop WebView2 profile persists across EXE updates; never let it
    # serve a stale index/app.js from a previous build on the same localhost URL.
    if request.path == "/" or request.path.startswith("/static/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp

# Global client instance
_client: Optional[ArenaClient] = None
_conversation_history: list = []
_ui_mode = 'battle'
_ui_modality = 'auto'
_current_chat_id: Optional[str] = None

_UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')


def _validate_chat_id(chat_id: str) -> bool:
    return bool(_UUID_RE.match(chat_id))


# ---------------------------------------------------------------------------
# Outbound URL safety (SSRF hardening).
#
# Several routes download files from URLs that arrive in model output or
# user input. Every such fetch must be validated first: the helpers below
# reject non-https schemes and any hostname that resolves to a private,
# loopback, link-local, reserved, multicast, unspecified or CGNAT address
# (IPv4 and IPv6, including IPv4-mapped).
#
# _pinned_https_get goes further: it resolves once, validates every
# returned address, then connects to that exact address while verifying
# TLS against the original hostname. One resolve for both steps — a DNS
# rebinding flip between check and connect cannot redirect the socket.

_CGNAT_V4 = None  # built lazily (ip_network), see _ip_blocked


def _ip_blocked(addr: str) -> bool:
    """True when an address must never be fetched (private/internal ranges)."""
    import ipaddress as _ipmod
    global _CGNAT_V4
    try:
        ip = _ipmod.ip_address(str(addr).split("%")[0])  # strip IPv6 zone id
    except ValueError:
        return True
    mapped = getattr(ip, "ipv4_mapped", None)
    if mapped is not None:  # ::ffff:127.0.0.1 and friends behave like IPv4
        ip = mapped
    if _CGNAT_V4 is None:
        _CGNAT_V4 = _ipmod.ip_network("100.64.0.0/10")
    if ip.version == 4 and ip in _CGNAT_V4:
        return True
    return bool(ip.is_private or ip.is_loopback or ip.is_reserved
                or ip.is_link_local or ip.is_multicast or ip.is_unspecified)


def _resolve_public_ip(host: str) -> str:
    """Resolve `host`, vet every address, and return the first (public) one.
    Callers must connect only to the returned address (see _PinnedHTTPSConnection).
    Raises ValueError for unresolvable or blocked hosts."""
    import socket as _sock
    try:
        infos = _sock.getaddrinfo(host, None, type=_sock.SOCK_STREAM)
    except _sock.gaierror:
        raise ValueError("Cannot resolve hostname.")
    first = None
    for info in infos:
        addr = info[4][0]
        if _ip_blocked(addr):
            raise ValueError("Private/internal addresses not allowed.")
        if first is None:
            first = addr
    if first is None:
        raise ValueError("Cannot resolve hostname.")
    return first


def _url_is_public(url: str, allow_http: bool = False) -> Optional[str]:
    """None when the URL is safe to fetch; otherwise a human-readable reason."""
    u = urllib.parse.urlparse(url)
    schemes = ("https", "http") if allow_http else ("https",)
    if u.scheme not in schemes:
        return "Only https links can be fetched."
    host = (u.hostname or "").lower()
    if not host or host == "localhost" or host.endswith(".localhost"):
        return "Local addresses are not allowed."
    try:
        _resolve_public_ip(host)
    except ValueError as e:
        return str(e)
    return None


def _media_get(url: str, timeout: float = 120):
    """Fetch a model-supplied media/file URL after SSRF validation.
    Keeps the plain requests.get call so tests can stub it."""
    err = _url_is_public(url)
    if err:
        raise ValueError(err)
    return requests.get(url, timeout=timeout)


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    """HTTPS connection that connects to one pre-validated IP address but
    verifies the TLS certificate against the real hostname."""

    def __init__(self, host: str, ip: str, timeout: float = 60):
        super().__init__(host, timeout=timeout)
        self._pinned_ip = ip

    def connect(self):
        import socket as _sock
        sock = _sock.create_connection((self._pinned_ip, self.port), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


def _pinned_https_get(url: str, timeout: float = 60,
                      max_bytes: int = 300 * 1024 * 1024,
                      max_redirects: int = 3):
    """Stream a public https URL into memory with a size cap.
    Returns (blob, content_type). Follows up to `max_redirects` hops,
    re-validating and re-pinning every hop. Raises ValueError for refused
    URLs and OSError for HTTP errors."""
    blob = b""
    current = url
    for _hop in range(max_redirects + 1):
        u = urllib.parse.urlparse(current)
        if u.scheme != "https":
            raise ValueError("Only https links can be fetched.")
        host = (u.hostname or "").lower()
        if not host or host == "localhost" or host.endswith(".localhost"):
            raise ValueError("Local addresses are not allowed.")
        # One resolve for both the vetting and the connect: a DNS flip
        # right after this line cannot redirect the socket elsewhere.
        pinned_ip = _resolve_public_ip(host)
        conn = _PinnedHTTPSConnection(u.hostname, pinned_ip, timeout=timeout)
        try:
            path = urllib.parse.urlunparse(("", "", u.path or "/", u.params, u.query, ""))
            conn.request("GET", path, headers={
                "Host": u.hostname,
                "User-Agent": "Arena-Desktop-Media/1.0",
                "Accept": "*/*",
            })
            resp = conn.getresponse()
            if resp.status in (301, 302, 303, 307, 308):
                loc = resp.getheader("Location") or ""
                if not loc:
                    raise OSError(f"HTTP {resp.status}: redirect without Location")
                current = urllib.parse.urljoin(current, loc)
                continue
            if resp.status >= 400:
                raise OSError(f"HTTP {resp.status}")
            ctype = (resp.getheader("Content-Type") or "").split(";")[0].strip()
            while True:
                chunk = resp.read(1 << 16)
                if not chunk:
                    break
                blob += chunk
                if len(blob) > max_bytes:
                    raise ValueError(f"File is larger than {max_bytes // (1024 * 1024)} MB.")
            return blob, ctype
        finally:
            conn.close()
    raise OSError("Too many redirects.")


def _chat_changed(old, new) -> bool:
    """True when the conversation itself changed: a message was added or a
    message's text differs (re-saving the same history is not a change)."""
    old, new = list(old or []), list(new or [])
    if len(old) != len(new):
        return True
    def text(m):
        return (m.get("role"), str(m.get("text") or m.get("content") or ""), str(m.get("text_b") or "")) \
            if isinstance(m, dict) else (None, str(m), "")
    return any(text(a) != text(b) for a, b in zip(old, new))


def _save_chat(chat_id: str, title: str, messages: list,
               mode: str = 'battle', modality: str = 'auto',
               model_a: str = None, model_b: str = None, eval_id: str = None,
               source: str = None, tools_guide: bool = None,
               agent_backend: str = None, native: dict = None,
               mcp_guide_hash: str = None, memory_hash: str = None,
               pending_digest: str = None, parent_id: str = None,
               delegate_guide: bool = None, gateway_session: str = None,
               workspace: str = None, touch: bool = True, stamp: str = None):
    """Save a chat. touch=False: a sync from arena.ai, not new activity here,
    so it never moves the chat up the list. stamp: the conversation's own last
    activity on arena.ai (imports and refreshes keep arena's time)."""
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
    # Only real conversation changes move a chat up the list. Opening a chat
    # runs an automatic refresh from Arena that re-saves it; that alone must
    # not bump it to the top (it used to jump on every click).
    previous = existing.get("updated_at")
    if stamp:
        updated = stamp
    elif not previous or (touch and _chat_changed(existing.get("messages"), messages)):
        updated = now
    else:
        updated = previous
    data = {
        "id": chat_id,
        "title": title,
        "account_id": existing.get("account_id") or _current_account_id(),
        "created_at": existing.get("created_at") or stamp or now,
        "updated_at": updated,
        "mode": mode,
        "modality": modality,
        "model_a": model_a,
        "model_b": model_b,
        "eval_id": eval_id,
        "source": source or existing.get("source") or "local",
        "tools_guide": bool(tools_guide) if tools_guide is not None else bool(existing.get("tools_guide")),
        "mcp_guide_hash": mcp_guide_hash if mcp_guide_hash is not None else existing.get("mcp_guide_hash"),
        "memory_hash": memory_hash if memory_hash is not None else existing.get("memory_hash"),
        "pending_digest": pending_digest if pending_digest is not None else existing.get("pending_digest"),
        "parent_id": (parent_id or None) if parent_id is not None else existing.get("parent_id"),
        "delegate_guide": bool(delegate_guide) if delegate_guide is not None else bool(existing.get("delegate_guide")),
        "agent_backend": agent_backend or existing.get("agent_backend"),
        "gateway_session": gateway_session if gateway_session is not None else existing.get("gateway_session"),
        "native": native if native is not None else existing.get("native"),
        # The project folder this chat works in (opening the chat switches
        # the composer back to it).
        "workspace": workspace if workspace is not None else existing.get("workspace"),
        "messages": messages,
    }
    # Atomic replace: readers (chat list, parallel chats) never see a
    # half-written file.
    tmp_file = chat_dir / "chat.json.tmp"
    tmp_file.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp_file, chat_file)


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


def _chat_visible(data: dict, current_id, first_id) -> bool:
    """A local chat belongs to the account that created it.  Chats saved
    before multi-account support (no account_id) belong to the first
    account ever signed in, matching how they were created."""
    owner = data.get("account_id") or first_id
    if owner is None:
        return True
    return current_id is not None and owner == current_id


def _chat_title(data: dict) -> str:
    """Stored title, unless Arena copied it from the injected tool guide
    ("[Arena Desktop] The user is ..."); then summarize the first user message."""
    title = " ".join(str(data.get("title") or "").split())
    if title and not history_sync.is_injected_title(title):
        return title
    for message in data.get("messages") or []:
        if isinstance(message, dict) and message.get("role") == "user":
            text = str(message.get("text") or "").strip()
            if text and not history_sync.is_injected_title(text):
                return _smart_title(text)
    return history_sync.clean_title(title, "Untitled")


def _list_chats() -> list:
    if not CHATS_DIR.exists():
        return []
    store = _accounts_load()
    current_id, first_id = store.get("current"), _first_account_id(store)
    chats = []
    for d in CHATS_DIR.iterdir():
        if not d.is_dir():
            continue
        f = d / "chat.json"
        if not f.exists():
            continue
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if not _chat_visible(data, current_id, first_id):
                continue
            chats.append({
                "id": data.get("id", d.name),
                "title": _chat_title(data),
                "updated_at": data.get("updated_at", ""),
                "mode": data.get("mode"),
                "modality": data.get("modality"),
                "eval_id": data.get("eval_id"),
                "parent_id": data.get("parent_id"),
                "source": data.get("source") or "local",
                "message_count": len(data.get("messages", [])),
            })
        except Exception:
            pass
    chats.sort(key=lambda c: c.get("updated_at", ""), reverse=True)
    # Sub-agent child chats nest under their parent instead of flooding the
    # list; a child whose parent is gone (or on another account) stands alone.
    by_id = {c["id"]: c for c in chats}
    for c in chats:
        c["children"] = []
    top = []
    for c in chats:
        pid = c.get("parent_id")
        if pid and pid != c["id"] and pid in by_id:
            by_id[pid]["children"].append(
                {"id": c["id"], "title": c["title"], "updated_at": c["updated_at"],
                 "mode": c.get("mode")})
        else:
            top.append(c)
    return top


def _orphan_children(parent_id: str) -> None:
    """Sub-agent chats outlive a deleted parent as ordinary chats."""
    if not CHATS_DIR.exists():
        return
    for d in CHATS_DIR.iterdir():
        f = d / "chat.json"
        if not f.exists():
            continue
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        if data.get("parent_id") == parent_id:
            _save_chat(data.get("id", d.name), title=data.get("title") or "Conversation",
                       messages=data.get("messages") or [], mode=data.get("mode") or "direct",
                       modality=data.get("modality") or "text", model_a=data.get("model_a"),
                       model_b=data.get("model_b"), eval_id=data.get("eval_id"),
                       tools_guide=bool(data.get("tools_guide")),
                       agent_backend=data.get("agent_backend"), parent_id="")


def _find_chat_by_eval(eval_id: str) -> Optional[dict]:
    if not eval_id:
        return None
    direct = _load_chat(eval_id)
    if direct and direct.get("eval_id") == eval_id:
        return direct
    if not CHATS_DIR.exists():
        return None
    for directory in CHATS_DIR.iterdir():
        if not directory.is_dir():
            continue
        data = _load_chat(directory.name)
        if data and data.get("eval_id") == eval_id:
            return data
    return None


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
            try:
                cookie_str = crypto.decrypt(COOKIE_FILE.read_bytes()).decode("utf-8").strip()
            except Exception:
                cookie_str = COOKIE_FILE.read_text(encoding="utf-8").strip()
        _client = ArenaClient(cookie_str=cookie_str)
    return _client


def _catalog_fetch_json():
    """Fetch the model catalog through the signed-in session.

    The anonymous endpoint answers 403, and sync used to swallow that and
    serve the disk cache forever - new models (e.g. Kimi K3.1 Pro) never
    reached the picker.  _arena_get_json uses the browser engine when
    present and the account session otherwise, exactly like the website.
    """
    data, error, status = _arena_get_json(contracts.PATHS["catalog"], timeout=20)
    if error or data is None or (status and status >= 400):
        raise RuntimeError(f"model catalog fetch failed: {error or status}")
    return data


def _catalog_models(force: bool = False) -> list:
    try:
        try:
            models = sync_models(force=force, fetch_json=_catalog_fetch_json)
        except TypeError:
            models = sync_models(force=force)
    except Exception:
        return []
    return models if isinstance(models, list) else []


def _selection_error(ui_mode: str, ui_modality: str) -> Optional[str]:
    if ui_mode not in MODE_API_MAP:
        return f"Invalid mode: {ui_mode}"
    if ui_modality not in MODALITY_API_MAP:
        return f"Invalid modality: {ui_modality}"
    try:
        contracts.validate_ui_selection(ui_mode, ui_modality)
    except ValueError as e:
        return str(e)
    return None


def _allowed_model_ids(ui_mode: str, ui_modality: str) -> set:
    api_modality = contracts.api_modality(ui_modality)
    return {str(m.get("model_id", m.get("id", "")))
            for m in get_models_for_modality(_catalog_models(), api_modality, mode=ui_mode)
            if m.get("model_id", m.get("id"))}


def _auto_agent_model(preferred_id: str = None) -> Optional[dict]:
    return get_auto_agent_model(_catalog_models(), preferred_id=preferred_id)


# ---------- Static serving ----------

@app.route("/")
def index():
    html = (STATIC_DIR / "index.html").read_text(encoding="utf-8")
    html = html.replace("</head>", f'  <meta name="api-token" content="{_API_TOKEN}">\n'
                                   f'  <meta name="preview-token" content="{_PREVIEW_TOKEN}">\n</head>', 1)
    return html, 200, {"Content-Type": "text/html; charset=utf-8"}


# ---------- API routes ----------

_me_cache = {"t": 0.0, "user": None, "err": None}


def _engine_on() -> bool:
    return ENGINE.window is not None


def _perm_mode() -> str:
    # Automations run unattended on their own thread and may pin a mode.
    override = getattr(_tl, "perm_override", None)
    if override:
        return permissions.normalize(override)
    return permissions.normalize(load_config().get("permission_mode"))

# ---------- Persistent memory + conversation compaction ----------

MEMORY_FILE_NAME = "MEMORY.md"
GLOBAL_MEMORY_FILE = COOKIE_FILE.parent / "memory.md"
CONTEXT_WARN_CHARS = 80_000


def _memory_enabled() -> bool:
    return load_config().get("memory_enabled") is not False


def _read_memory_file(path: Path, cap: int) -> str:
    try:
        text = path.read_text(encoding="utf-8").strip()
    except OSError:
        return ""
    return text[:cap]


def _memory_block(folder) -> tuple:
    """Combined general + project memory, formatted for the model.

    Returns (block, hash); ("", None) when there is nothing to send.  The
    block travels once per Arena session and again only when it changed
    (same discipline as the MCP connector guide).
    """
    parts = []
    general = _read_memory_file(GLOBAL_MEMORY_FILE, 3_000)
    if general:
        parts.append("General memory (all projects):\n" + general)
    if folder:
        agents = _read_memory_file(Path(folder) / "AGENTS.md", 6_000)
        if agents:
            parts.append(f"Project instructions (AGENTS.md in {folder}):\n" + agents)
        project = _read_memory_file(Path(folder) / MEMORY_FILE_NAME, 6_000)
        if project:
            parts.append(f"Project memory ({MEMORY_FILE_NAME} in {folder}):\n" + project)
    if not parts:
        return "", None
    body = "\n\n".join(parts)
    block = ("[Arena Desktop memory \u2014 persistent notes shared across chats. "
             "Treat them as established facts, decisions and preferences.]\n"
             + body + "\n[End of memory]\n\n")
    return block, hashlib.sha1(body.encode("utf-8")).hexdigest()[:12]


def _history_chars(messages) -> int:
    """Approximate Arena-side context size of a chat.

    Only messages after the last compaction marker count (plus the digest
    that replaced everything before it), so the meter resets after Compact
    exactly like the real server-side context does.
    """
    total = 0
    start = 0
    for i, m in enumerate(messages or []):
        if isinstance(m, dict) and m.get("compact"):
            start = i + 1
            total = int(m.get("digest_chars") or 0)
    for m in (messages or [])[start:]:
        if isinstance(m, dict):
            total += len(m.get("text") or "") + len(m.get("text_b") or "")
    return total


def _clip(text: str, cap: int) -> str:
    text = (text or "").strip()
    return text if len(text) <= cap else text[:cap].rstrip() + " \u2026"


def _build_digest(chat: dict) -> str:
    """Deterministic summary of a chat, used to seed a fresh Arena session.

    Built locally (never by asking the model \u2014 by the time compaction is
    needed the model may already be failing in the old session): original
    task, files touched, and the most recent exchanges.
    """
    messages = [m for m in (chat.get("messages") or []) if isinstance(m, dict)]
    lines = [f"Summary of the earlier conversation \u201c{chat.get('title') or 'Conversation'}\u201d:"]
    users = [m for m in messages if m.get("role") == "user" and (m.get("text") or "").strip()]
    if users:
        lines += ["", "Original task:", _clip(users[0].get("text"), 700)]
    touched = []
    for m in messages:
        for step in (m.get("tools") or []):
            if not isinstance(step, dict):
                continue
            if step.get("tool") in ("write_file", "edit_file") and step.get("summary"):
                if step["summary"] not in touched:
                    touched.append(step["summary"])
    if touched:
        lines += ["", "File changes made along the way:"] + [f"- {t}" for t in touched[-15:]]
    picked, budget = [], 3_800
    for m in reversed(messages):
        role = m.get("role")
        if role == "user":
            text, label = _clip(m.get("text"), 350), "User"
        elif role == "assistant":
            text = _clip(agent.strip_tool_calls(m.get("text") or ""), 900)
            label = "Assistant"
        else:
            continue
        if not text:
            continue
        entry = f"{label}: {text}"
        if len(entry) > budget and picked:
            break
        picked.append(entry)
        budget -= len(entry)
        if budget <= 0:
            break
    if picked:
        lines += ["", "Most recent exchanges (oldest first):", ""]
        lines += list(reversed(picked))
    return "\n".join(lines)[:6_000]


def _digest_block(digest: str) -> str:
    return ("[Arena Desktop \u2014 continued conversation]\n"
            "This chat continues an earlier conversation whose context was compacted "
            "to stay within Arena's limits. What came before, in brief:\n\n"
            + digest +
            "\n\nThe files in the workspace are the source of truth \u2014 re-read anything "
            "you need instead of guessing. Now answer the user's message below.\n\n"
            "User message:\n")


def _append_digest_to_memory(chat: dict, digest: str):
    """Save the compaction digest into the project memory file, so the work
    is available to future chats in this folder too, not only this one."""
    folder = _chosen_ws()
    if not folder or not _memory_enabled():
        return None
    path = Path(folder) / MEMORY_FILE_NAME
    stamp = datetime.now().strftime("%Y-%m-%d")
    entry = (f"\n## Session digest \u2014 {chat.get('title') or 'Conversation'} \u2014 {stamp}\n\n"
             + digest + "\n")
    try:
        if path.exists():
            current = path.read_text(encoding="utf-8")
        else:
            current = ("# Project memory\n\nPersistent notes shared across Arena Desktop "
                       "chats in this folder, kept by the user and the models. "
                       "Session digests are appended automatically on Compact.\n")
        path.write_text(current.rstrip() + "\n" + entry, encoding="utf-8")
    except OSError:
        return None
    return str(path)



def _get_me(client: ArenaClient):
    """Ask arena.ai who is signed in. In the desktop app only the engine uses the session:
    Supabase revokes a refresh token that two clients keep rotating."""
    if _engine_on():
        user, err = ENGINE.get_me()
        ENGINE.sync_to(client)
        return user, err
    return client.get_me()
