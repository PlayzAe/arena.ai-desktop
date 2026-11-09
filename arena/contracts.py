"""
arena.ai wire contracts, kept in one place.

The client relies only on what arena's own web app sends over the wire:
endpoint paths, JSON field names and enum values. Bundle chunk names, hashes
and minified symbols are never used, so a rebuilt or redesigned arena.ai
frontend does not break the client. Paths and reCAPTCHA keys can be patched
without a rebuild in ~/.arena-cli/contracts.json, for example
{"paths": {"create": "/nextjs-api/stream/create-evaluation"}, "v3_key": "6L..."}.
"""

import json
import re
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

ORIGIN = "https://arena.ai"

PATHS: Dict[str, str] = {
    "home": "/",
    "create": "/nextjs-api/stream/create-evaluation",
    "post": "/nextjs-api/stream/post-to-evaluation/{eval_id}",
    "me": "/api/me",
    "history_unified": "/api/history/unified",
    "evaluation": "/api/evaluation/{eval_id}",
    "connectors": "/api/connectors",
    "connectors_status": "/api/connectors/status",
    "connectors_sync": "/api/connectors/sync",
    "connector": "/api/connectors/{slug}",
    "connector_link_token": "/api/connectors/{slug}/link-token",
    "auto_modality": "/nextjs-api/auto-modality",
    # File uploads: Arena mints a presigned PUT URL, the browser uploads the
    # bytes, then asks for a signed read URL (evaluation chats) — or the
    # content-addressed agent variant keyed by the file's SHA-256.
    "storage_upload_url": "/api/storage/generate-upload-url",
    "storage_signed_url": "/api/storage/get-signed-url",
    "storage_agent_upload_url": "/api/storage/generate-agent-upload-url",
    # Native Arena Agent Mode (Trigger.dev AI Chat behind Arena's proxy).
    "create_chat": "/nextjs-api/stream/create-chat",
    "chat_trigger_session": "/api/chat/trigger-session",
    "chat_trigger_token": "/api/chat/trigger-token",
    "chat_session": "/api/chat/{session_id}",
    "chat_archive": "/api/chat/{session_id}/archive",
    "ai_proxy": "/ai-proxy",
    "catalog": "/nextjs-api/model-catalog",
    "webdev": "/api/evaluation/webdev/{message_id}",
    "sign_out": "/nextjs-api/sign-out",
}
KEYS: Dict[str, str] = {
    "v3": "6LeTGMcsAAAAALuIlkVwIxaAuZA8VledA6d3Nnb0",
    "v2": "6Le3_cYsAAAAAGwWOK2RLDgNI15Bh8C0yLBOL1yL",
}
RECAPTCHA_ACTION = "chat_submit"
AUTH_COOKIE_PREFIX = "arena-auth-prod-v1"
SITE_KEY_RE = re.compile(r"6L[0-9A-Za-z_-]{38}")

API_MODES = ("battle", "side-by-side", "direct-battle", "direct")
API_MODALITIES = ("auto", "chat", "webdev", "search", "image", "p2l", "video", "audio")
UI_MODES = {"battle": "battle", "side-by-side": "side-by-side", "direct": "direct-battle", "agent": "direct-battle"}
UI_MODALITIES = {"auto": "auto", "text": "chat", "chat": "chat", "code": "webdev", "webdev": "webdev",
                 "search": "search", "image": "image", "video": "video", "audio": "audio"}

# Arena's product rules, expressed after UI values have been mapped to API
# values.  Keeping the matrix here prevents the desktop UI, CLI and HTTP API
# from drifting apart:
#   * model pickers exist only in Direct (one model) and Side by Side (two);
#   * Video Arena and Auto are Battle-only; Arena selects both models, and
#     Auto is resolved to a concrete modality by Arena's own auto-modality
#     router before the first message is created (exactly like the website);
#   * this app's local Agent is a text/tool workflow with automatic internal
#     model assignment, so it accepts no user-selected model and no non-text
#     modality.  Max remains an ordinary manually selectable Direct model.
UI_MODE_API_MODALITIES = {
    "battle": ("auto", "chat", "webdev", "search", "image", "video"),
    "side-by-side": ("chat", "webdev", "search", "image"),
    "direct": ("chat", "webdev", "search", "image"),
    "agent": ("chat",),
}
MANUAL_MODEL_UI_MODES = ("direct", "side-by-side")

# Attachment rules, mirroring Arena's help center and client code.
# Evaluation chats (Battle/Direct/Side by Side): images + PDF only.
EVAL_ATTACHMENT_MIME_TYPES = ("image/png", "image/jpeg", "image/webp", "application/pdf")
EVAL_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024
VIDEO_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
# Agent Mode: the website's AGENT_UPLOAD_ALLOWED_MIME_TYPES list.
AGENT_ATTACHMENT_MIME_TYPES = (
    "image/png", "image/webp", "image/jpeg", "image/gif",
    "text/plain", "text/markdown", "text/csv", "text/html", "text/xml",
    "text/css", "text/javascript", "application/json", "application/xml",
    "application/javascript", "application/pdf",
)
AGENT_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024
AGENT_PDF_MAX_BYTES = 10 * 1024 * 1024
AGENT_ATTACHMENTS_MAX_BYTES_PER_TURN = 50 * 1024 * 1024
AGENT_ATTACHMENTS_MAX_PER_TURN = 20

# AI SDK data-stream type codes. arena prefixes each line with a lane: a or b.
STREAM_TYPES = {"0": "text", "2": "data", "3": "error", "8": "annotation", "9": "tool_call",
                "a": "tool_result", "b": "tool_start", "c": "tool_delta",
                "d": "finish", "e": "step", "f": "step_start", "g": "reasoning", "h": "source", "k": "file"}


def api_mode(ui_mode: str) -> str:
    mode = UI_MODES.get(ui_mode, ui_mode)
    if mode not in API_MODES:
        raise ValueError(f"Unknown mode {ui_mode!r}")
    return mode


def api_modality(ui_modality: str) -> str:
    modality = UI_MODALITIES.get(ui_modality, ui_modality)
    if modality not in API_MODALITIES:
        raise ValueError(f"Unknown modality {ui_modality!r}")
    return modality


def validate_ui_selection(ui_mode: str, ui_modality: str) -> Tuple[str, str]:
    """Validate a UI mode/modality pair and return Arena API values.

    This is deliberately stricter than merely checking that each enum exists:
    Arena does not offer every Cartesian combination shown by two independent
    dropdowns.  In particular, Video is Battle-only and Agent is text-only.
    """
    if ui_mode not in UI_MODES:
        raise ValueError(f"Unknown mode {ui_mode!r}")
    mode = api_mode(ui_mode)
    modality = api_modality(ui_modality)
    allowed = UI_MODE_API_MODALITIES[ui_mode]
    if modality not in allowed:
        if modality == "video":
            raise ValueError("Video is available only in Battle mode; Arena selects both video models.")
        if modality == "auto":
            raise ValueError("Auto is available only in Battle mode.")
        if ui_mode == "agent":
            raise ValueError("Agent mode is text-only.")
        raise ValueError(f"{ui_mode} mode does not support {ui_modality} modality.")
    return mode, modality


def normalize_ui_selection(ui_mode: str, ui_modality: str) -> Tuple[str, str]:
    """Coerce a saved legacy UI selection to the closest supported pair."""
    mode = ui_mode if ui_mode in UI_MODES else "battle"
    modality = ui_modality if ui_modality in UI_MODALITIES else "text"
    try:
        validate_ui_selection(mode, modality)
        return mode, modality
    except ValueError:
        # Agent wins over a stale work-type selection: picking Agent never
        # requires choosing Text first (the work-type selector is hidden
        # while Agent is selected).
        if mode == "agent":
            return mode, "text"
        if api_modality(modality) == "video":
            return "battle", modality
        return mode, "text"


# Arena's auto-modality router returns probabilities keyed by work type.
AUTO_MODALITY_KEYS = {"text": "chat", "code": "webdev", "search": "search",
                      "image": "image", "video": "video"}
AUTO_MODALITY_CODE_THRESHOLD = 0.25


def pick_auto_modality(probabilities, has_image: bool = False) -> str:
    """Resolve Arena's auto-modality probabilities the way the website does.

    ``probabilities`` is the router's {text, code, search, image, video}
    mapping. Search is disabled when the prompt carries an image, Code wins
    at its low confidence threshold, otherwise the highest probability wins.
    Returns an Arena API modality; anything unusable falls back to chat.
    """
    if not isinstance(probabilities, dict):
        return "chat"
    probs: Dict[str, float] = {}
    for key in AUTO_MODALITY_KEYS:
        try:
            probs[key] = float(probabilities.get(key) or 0.0)
        except (TypeError, ValueError):
            probs[key] = 0.0
    if has_image:
        probs["search"] = 0.0
        total = sum(probs.values())
        if total > 0:
            probs = {k: v / total for k, v in probs.items()}
        else:
            probs["text"] = 1.0
    if probs["code"] >= AUTO_MODALITY_CODE_THRESHOLD:
        return "webdev"
    best = max(probs, key=lambda k: probs[k])
    return AUTO_MODALITY_KEYS.get(best, "chat")


def load_overrides(path: Optional[Path] = None) -> List[str]:
    """Apply contracts.json overrides; returns what changed."""
    if path is None:
        from arena.config import CONFIG_DIR
        path = CONFIG_DIR / "contracts.json"
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    if not isinstance(data, dict):
        return []
    changed = []
    for name, value in (data.get("paths") or {}).items():
        if isinstance(value, str) and value.startswith("/") and not value.startswith("//") and ":" not in value:
            if name in PATHS:
                PATHS[name] = value
                changed.append(f"paths.{name}")
    for name in ("v2", "v3"):
        value = data.get(f"{name}_key")
        if isinstance(value, str) and SITE_KEY_RE.fullmatch(value):
            KEYS[name] = value
            changed.append(f"{name}_key")
    return changed


def discover_site_keys(html: str) -> Dict[str, str]:
    """Find the v3 key in the live page's reCAPTCHA script URL (render=KEY)."""
    m = re.search(r"recaptcha[^\"'<>\s]*?[?&]render=(6L[0-9A-Za-z_-]{38})", html or "")
    return {"v3": m.group(1)} if m else {}


def build_chat(*, eval_id: str, new: bool, mode: str, modality: str, content: str, ids: Callable[[], str],
               model_a: Optional[str] = None, model_b: Optional[str] = None, attachments=None,
               v2_token: Optional[str] = None, auto_model: bool = False) -> Tuple[str, Dict[str, Any]]:
    """Return (path, body) for one user message. mode and modality are arena values.

    arena enforces: battle takes no model ids; direct starts as direct-battle with one
    model and no B message; follow-ups carry no mode; message ids are UUIDv7s created
    after eval_id, so ids() must be monotonic.
    """
    if mode not in API_MODES:
        raise ValueError(f"Unknown mode {mode!r}")
    if modality not in API_MODALITIES:
        raise ValueError(f"Unknown modality {modality!r}")
    if modality == "video" and mode != "battle":
        raise ValueError("Video is available only in Battle mode; Arena selects both video models.")
    if mode == "battle" and (model_a or model_b):
        raise ValueError("Battle mode does not accept model ids; Arena selects both models.")
    if mode != "battle" and not model_a and not (auto_model and mode in ("direct", "direct-battle")):
        raise ValueError("Pick a model first: this mode talks to the model you choose.")
    if mode == "side-by-side" and not model_b:
        raise ValueError("Side by Side compares two models: pick model B too.")
    if mode == "side-by-side" and model_a == model_b:
        raise ValueError("Side by Side compares two different models.")
    if mode in ("direct", "direct-battle") and model_b:
        raise ValueError("Direct mode accepts exactly one model.")
    body: Dict[str, Any] = {
        "id": eval_id,
        "userMessageId": ids(),
        "modelAMessageId": ids(),
        "userMessage": {"content": content, "experimental_attachments": list(attachments or []), "metadata": {}},
        "modality": modality,
    }
    if mode in ("battle", "side-by-side"):
        body["modelBMessageId"] = ids()
    if mode != "battle" and model_a:
        body["modelAId"] = model_a
    if mode == "side-by-side":
        body["modelBId"] = model_b
    if v2_token:
        body["recaptchaV2Token"] = v2_token
    else:
        body["recaptchaV3Token"] = None
    if new:
        body["mode"] = mode
        return PATHS["create"], body
    return PATHS["post"].format(eval_id=eval_id), body


def parse_line(line: str) -> Optional[Tuple[str, str, Any]]:
    """Parse one stream line into (lane, kind, value); None for lines the app ignores."""
    line = (line or "").strip()
    if len(line) >= 3 and line[0] in "ab" and line[2] == ":" and line[1] in STREAM_TYPES:
        lane, code, raw = line[0], line[1], line[3:]
    elif len(line) >= 2 and line[1] == ":" and line[0] in STREAM_TYPES:
        lane, code, raw = "a", line[0], line[2:]
    else:
        return None
    try:
        value = json.loads(raw)
    except ValueError:
        value = raw
    return lane, STREAM_TYPES[code], value


class LineSplitter:
    """Turns arbitrary text chunks into complete lines."""

    def __init__(self):
        self._buf = ""

    def feed(self, chunk: str) -> List[str]:
        self._buf += chunk
        *lines, self._buf = self._buf.split("\n")
        return lines

    def flush(self) -> List[str]:
        rest, self._buf = self._buf, ""
        return [rest] if rest.strip() else []


VIDEO_MESSAGE_MAX_LENGTH = 2500
DAILY_SPEND_LIMIT_MESSAGE = "daily spend limit reached"
ACCOUNT_TOO_NEW_FOR_VIDEO = "account_too_new_for_video"


def _rate_limit_reset(headers) -> Optional[float]:
    """Epoch seconds when a rate limit resets, from Arena's response headers.

    Mirrors the website's own parser: ``RateLimit-Reset`` (epoch seconds),
    then ``Retry-After`` (seconds or HTTP-date), then ``Ratelimit-Remaining``.
    """
    if not headers:
        return None
    try:
        items = {str(k).lower(): v for k, v in dict(headers).items()}
    except (TypeError, ValueError):
        return None
    import time as _time
    raw = items.get("ratelimit-reset")
    if raw is not None:
        try:
            return float(raw)
        except (TypeError, ValueError):
            pass
    raw = items.get("retry-after")
    if raw is not None:
        try:
            return _time.time() + float(raw)
        except (TypeError, ValueError):
            try:
                from email.utils import parsedate_to_datetime
                return parsedate_to_datetime(str(raw)).timestamp()
            except (TypeError, ValueError):
                pass
    raw = items.get("ratelimit-remaining")
    if raw is not None:
        try:
            return _time.time() + float(raw)
        except (TypeError, ValueError):
            pass
    return None


def _human_wait(reset_epoch) -> str:
    """'2 hours' / '35 minutes' / 'a moment' for a rate-limit reset time."""
    if not reset_epoch:
        return ""
    import time as _time
    seconds = reset_epoch - _time.time()
    if seconds <= 45:
        return "a moment"
    minutes = int(-(-seconds // 60))
    if minutes < 60:
        return f"{minutes} minute{'s' if minutes != 1 else ''}"
    hours = int(-(-minutes // 60))
    if hours < 48:
        return f"{hours} hour{'s' if hours != 1 else ''}"
    days = int(-(-hours // 24))
    return f"{days} day{'s' if days != 1 else ''}"


HUMAN_CHECK_PHRASES = ("captcha", "not a robot", "verify you are human", "verify that you are human",
                       "verify you're human", "human verification", "are you a robot")
SESSION_FULL_PHRASES = ("reached its token usage limit", "session has reached its token",
                        "token usage limit")


def classify_error(status: int, text: str = "", headers=None) -> Dict[str, Any]:
    """Turn an arena.ai failure into a code, a plain-language message and retry advice."""
    raw = text or ""
    low = raw.lower()
    detail = raw
    body: Dict[str, Any] = {}
    try:
        obj = json.loads(raw)
        if isinstance(obj, dict):
            body = obj
            detail = str(obj.get("error") or obj.get("message") or raw)
    except ValueError:
        pass
    detail = " ".join(detail.split())[:300]

    def out(code, message, retry=False, wait=0):
        return {"code": code, "status": status, "message": message, "detail": detail, "retry": retry, "wait": wait}

    # A Cloudflare interstitial ("Just a moment", cf-chl) is a page-level
    # block whose HTML also says "complete a CAPTCHA" / "verify you are
    # human". Match it before the human-check phrases, or those pages route
    # to the in-app checkbox flow instead of the Cloudflare check the user
    # must actually finish (issue: "human check not work").
    if "just a moment" in low or "cf-chl" in low or ("cloudflare" in low and status in (403, 503)):
        return out("cloudflare", "Cloudflare wants to check this browser. Finish the check in the arena.ai window that opened.", True)
    # The human check comes next: a send held back by an open check also
    # arrives with status 0, and that is not a network problem.
    if any(phrase in low for phrase in HUMAN_CHECK_PHRASES):
        return out("challenge", "arena.ai asked for a quick human check (\"I'm not a robot\"). Complete it in the "
                                "arena.ai window; your message resends by itself.", True)
    if any(phrase in low for phrase in SESSION_FULL_PHRASES):
        return out("session_full", "This arena.ai chat session is full: arena.ai limits how many tokens one chat "
                                   "session can use (Code chats fill up fastest, because the sandbox agent's own "
                                   "steps count too). Start a new chat to continue; your files stay in your folder.")
    if status == 0:
        return out("network", "Can't reach arena.ai. Check your internet connection, then retry.", True, 5)
    if status == 401:
        return out("auth", "Your arena.ai session ended. Sign in again from Settings, Account.")
    if status == 403 and str(body.get("error") or "") == ACCOUNT_TOO_NEW_FOR_VIDEO:
        need = body.get("minAccountAgeHours")
        have = body.get("accountAgeHours")
        try:
            need_h, have_h = float(need), float(have)
            return out("forbidden",
                       f"Video needs an older Arena account: yours is {have_h:.0f} hour(s) old, "
                       f"and Video opens at {need_h:.0f} hours. Try Video again later — "
                       "the other work types already work.")
        except (TypeError, ValueError):
            return out("forbidden", "This Arena account is too new for Video. Video opens once the account is older.")
    if status == 429:
        reset = _rate_limit_reset(headers)
        wait_text = _human_wait(reset)
        wait_s = 60
        if reset:
            import time as _time
            wait_s = max(1, min(86400, int(reset - _time.time())))
        if DAILY_SPEND_LIMIT_MESSAGE in low:
            if wait_text:
                return out("rate_limit", f"You've reached your Arena daily usage limit. Try again in {wait_text}.", True, wait_s)
            return out("rate_limit", "You've reached your Arena daily usage limit. Try again tomorrow.", True, wait_s)
        limited_modality = None
        if headers:
            try:
                limited_modality = {str(k).lower(): v for k, v in dict(headers).items()}.get("ratelimit-modality")
            except (TypeError, ValueError):
                limited_modality = None
        if limited_modality:
            label = {"video": "Video", "image": "Image", "chat": "Text", "webdev": "Code",
                     "search": "Web Search"}.get(str(limited_modality), str(limited_modality))
            if wait_text:
                return out("rate_limit", f"You've reached the {label} rate limit on Arena. Try again in {wait_text}.", True, wait_s)
            return out("rate_limit", f"You've reached the {label} rate limit on Arena. Try again later.", True, wait_s)
        if body.get("modelId"):
            if wait_text:
                return out("rate_limit", f"That model is rate-limited on Arena right now. Try again in {wait_text}, or pick another model.", True, wait_s)
            return out("rate_limit", "That model is rate-limited on Arena right now. Wait a moment, or pick another model.", True, wait_s)
        if wait_text and wait_text != "a moment":
            return out("rate_limit", f"Arena is rate-limiting this account. Try again in {wait_text}.", True, wait_s)
        if reset:
            return out("rate_limit", "Arena is rate-limiting this account. Wait a moment, then send again.", True, wait_s)
        return out("rate_limit", "Arena is rate-limiting this account. Wait about a minute, then send again.", True, 60)
    if "cannot pass model for battle" in low:
        return out("bad_request", "Battle mode picks the models for you. Switch to Direct to choose one.")
    if "must start with one model" in low:
        return out("bad_request", "Direct chat takes exactly one model. Pick one model and resend.")
    if "uuid" in low:
        return out("client_bug", "arena.ai rejected the message ids. Start a new chat and resend.")
    if status == 404:
        return out("eval_gone", "arena.ai no longer has this conversation.")
    if status == 413:
        return out("too_large", "That message or attachment is too large for arena.ai.")
    if status >= 500:
        return out("server", f"arena.ai had a server error ({status}). It is on their side; retry in a minute.", True, 30)
    if status == 403:
        return out("forbidden", "arena.ai refused the request (403). Sign in again; if it repeats, wait a few minutes.", True)
    return out("http", f"arena.ai returned HTTP {status}: {detail or 'no details'}")


_PREVIEW_KEYS = ("previewUrl", "sandboxPreviewUrl", "sandboxUrl", "deploymentUrl", "deployUrl", "webUrl")


def find_preview_url(value: Any, depth: int = 0) -> Optional[str]:
    if depth > 8:
        return None
    if isinstance(value, dict):
        for key in _PREVIEW_KEYS:
            v = value.get(key)
            if isinstance(v, str) and v.startswith("http"):
                return v
        items = list(value.values())
    elif isinstance(value, list):
        items = value
    elif isinstance(value, str) and value.startswith("http") and ".arena.site" in value:
        return value
    else:
        return None
    for v in items:
        found = find_preview_url(v, depth + 1)
        if found:
            return found
    return None


_PATH_KEYS = ("path", "file_path", "filePath", "filename", "file", "target_file", "targetFile", "relative_path")
_CONTENT_KEYS = ("content", "file_text", "fileText", "contents", "code", "new_content", "text")
_OLD_KEYS = ("old_str", "old_string", "oldString", "old_text", "oldText", "context", "search", "find")
_NEW_KEYS = ("new_str", "new_string", "newString", "new_text", "newText", "replace", "replacement")
_URL_KEYS = ("url", "src", "source_url", "image_url", "imageUrl", "media_url")
_LOOK_WORDS = ("read", "view", "cat", "list", "ls", "open", "get", "search", "find", "grep", "inspect", "glob")


def sandbox_op(call: Dict[str, Any]) -> Dict[str, Any]:
    """What one of arena.ai's own sandbox tool calls does: write, edit, delete or download a file,
    read (look only), run a command, change a file some other way (touch) or something else."""
    name = str(call.get("toolName") or call.get("name") or "tool")
    args = call.get("args", call.get("input"))
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except ValueError:
            args = {}
    args = args if isinstance(args, dict) else {}

    def pick(keys):
        return next((args[k] for k in keys if isinstance(args.get(k), str)), None)

    low, sub = name.lower(), str(args.get("command") or "").lower()
    op = {"id": call.get("toolCallId") or call.get("id"), "tool": name, "path": pick(_PATH_KEYS)}
    content, old, new, url = pick(_CONTENT_KEYS), pick(_OLD_KEYS), pick(_NEW_KEYS), pick(_URL_KEYS)
    if op["path"] and old is not None and new is not None:
        op.update(kind="edit", old=old, new=new)
    elif op["path"] and content is not None and sub != "view":
        op.update(kind="write", content=content)
    elif op["path"] and url and url.startswith("http"):
        op.update(kind="download", url=url)
    elif op["path"] and ("delete" in low or "remove" in low or sub in ("delete", "rm")):
        op["kind"] = "delete"
    elif op["path"]:
        op["kind"] = "read" if any(w in low or w == sub for w in _LOOK_WORDS) else "touch"
    elif any(w in low for w in ("bash", "shell", "terminal", "exec", "command", "run")):
        op.update(kind="run", detail=str(args.get("command") or args.get("cmd") or "")[:200])
    else:
        op.update(kind="other", detail=", ".join(str(k) for k in list(args)[:4]))
    return op


def webdev_items(value: Any) -> List[Dict[str, Any]]:
    items = value if isinstance(value, list) else [value]
    return [i for i in items if isinstance(i, dict) and i.get("type") == "webdev"]


_MEDIA_EXT = {"png": "image", "jpg": "image", "jpeg": "image", "webp": "image", "gif": "image", "avif": "image",
              "mp4": "video", "webm": "video", "mov": "video",
              "mp3": "audio", "wav": "audio", "ogg": "audio", "m4a": "audio"}


def find_media(value: Any) -> List[Dict[str, str]]:
    """Image, video and audio URLs anywhere inside a data or file part."""
    found: List[Dict[str, str]] = []
    seen = set()

    def add(url, kind):
        if url not in seen:
            seen.add(url)
            found.append({"url": url, "kind": kind})

    def walk(v, depth):
        if depth > 8:
            return
        if isinstance(v, str):
            if v.startswith(("https://", "http://")):
                ext = v.split("?", 1)[0].split("#", 1)[0].rsplit(".", 1)[-1].lower()
                if ext in _MEDIA_EXT:
                    add(v, _MEDIA_EXT[ext])
        elif isinstance(v, dict):
            mime = str(v.get("mimeType") or v.get("contentType") or v.get("mediaType") or "")
            kind = mime.split("/", 1)[0]
            if kind in ("image", "video", "audio"):
                url = next((v[k] for k in ("url", "src", "imageUrl", "videoUrl", "audioUrl")
                            if isinstance(v.get(k), str)), None)
                if url and url.startswith(("https://", "http://", "data:")):
                    add(url, kind)
                elif isinstance(v.get("data"), str) and len(v["data"]) > 16:
                    add(f"data:{mime};base64,{v['data']}", kind)
            for x in v.values():
                walk(x, depth + 1)
        elif isinstance(v, list):
            for x in v:
                walk(x, depth + 1)

    walk(value, 0)
    return found
