"""One-click self-update: download the release exe, verify it, swap it in, reopen.

The running exe cannot overwrite itself, so apply() starts a small hidden
PowerShell helper that waits for this process to exit, copies the new exe over
the old one, records the new version, and relaunches. What is new is written
to whatsnew.json and shown once after the restart.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional

import requests

from arena import __version__
from arena.config import CONFIG_DIR

REPO_API = "https://api.github.com/repos/PlayzAe/arena.ai-desktop"
ASSET_NAME = "Arena-Desktop.exe"
UPDATES_DIR = CONFIG_DIR / "updates"
WHATSNEW_FILE = CONFIG_DIR / "whatsnew.json"
UNINSTALL_KEY = r"HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ArenaDesktop"

_job: Dict[str, Any] = {"state": "idle"}
_lock = threading.Lock()


def version_tuple(v: Any) -> tuple:
    parts = []
    for bit in str(v or "").lstrip("v").split("."):
        m = re.match(r"\d+", bit)
        parts.append(int(m.group()) if m else 0)
    return tuple(parts) or (0,)


def plain_notes(body: str, limit: int = 12) -> list:
    """Release markdown -> short plain-English bullet list."""
    out = []
    for raw in (body or "").splitlines():
        line = raw.strip()
        if not line or line.startswith(("#", "```", "---", "|", ">")):
            continue
        line = re.sub(r"^[-*+]\s+|^\d+[.)]\s+", "", line)
        line = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", line)
        line = re.sub(r"[`*_]", "", line)
        line = re.sub(r"\(?#\d+\)?|\b[0-9a-f]{7,40}\b", "", line).strip(" -:")
        if len(line) > 3:
            out.append(line[:220])
        if len(out) >= limit:
            break
    return out


def pick_asset(release: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    assets = release.get("assets") or []
    for a in assets:
        if a.get("name") == ASSET_NAME:
            return a
    for a in assets:
        if str(a.get("name", "")).lower().endswith(".exe") and "setup" not in a["name"].lower():
            return a
    return None


def release_info(release: Dict[str, Any]) -> Dict[str, Any]:
    asset = pick_asset(release)
    sha = ""
    if asset and str(asset.get("digest", "")).startswith("sha256:"):
        sha = asset["digest"].split(":", 1)[1]
    return {
        "notes": plain_notes(release.get("body") or ""),
        "asset_url": asset.get("browser_download_url") if asset else None,
        "asset_size": asset.get("size") if asset else None,
        "sha256": sha,
        "can_install": bool(asset) and bool(getattr(sys, "frozen", False)),
    }


def _fetch_sha(release: Dict[str, Any]) -> str:
    for a in release.get("assets") or []:
        if str(a.get("name", "")).lower() == f"{ASSET_NAME}.sha256".lower():
            try:
                txt = requests.get(a["browser_download_url"], timeout=15).text
                m = re.search(r"\b[0-9a-fA-F]{64}\b", txt)
                return m.group().lower() if m else ""
            except requests.RequestException:
                return ""
    return ""


def status() -> Dict[str, Any]:
    with _lock:
        return dict(_job)


def _set(**kw: Any) -> None:
    with _lock:
        _job.update(kw)


def _download(url: str, dest: Path, want_sha: str, version: str) -> None:
    try:
        UPDATES_DIR.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(".part")
        h = hashlib.sha256()
        with requests.get(url, stream=True, timeout=30,
                          headers={"User-Agent": f"Arena-Desktop/{__version__}"}) as r:
            r.raise_for_status()
            total = int(r.headers.get("Content-Length") or 0)
            done = 0
            with open(tmp, "wb") as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
                    h.update(chunk)
                    done += len(chunk)
                    _set(done=done, total=total)
        if want_sha and h.hexdigest().lower() != want_sha.lower():
            tmp.unlink(missing_ok=True)
            _set(state="error", error="Download failed its safety check (checksum mismatch). Nothing was installed.")
            return
        if tmp.stat().st_size < 1_000_000 or tmp.read_bytes()[:2] != b"MZ":
            tmp.unlink(missing_ok=True)
            _set(state="error", error="Downloaded file is not a valid app. Nothing was installed.")
            return
        os.replace(tmp, dest)
        _set(state="ready", path=str(dest), version=version, verified=bool(want_sha))
    except Exception as e:  # noqa: BLE001 - surfaced to the UI
        _set(state="error", error=f"Download failed: {e}")


def start_download(info: Dict[str, Any], release: Dict[str, Any]) -> Dict[str, Any]:
    if not getattr(sys, "frozen", False):
        return {"ok": False, "error": "One-click updates work in the installed app. Download the new version from GitHub."}
    url = info.get("asset_url")
    if not url:
        return {"ok": False, "error": "This release has no Arena-Desktop.exe to install."}
    with _lock:
        if _job.get("state") == "downloading":
            return {"ok": True, "state": "downloading"}
        _job.clear()
        _job.update(state="downloading", done=0, total=info.get("asset_size") or 0,
                    version=info["latest"], notes=info.get("notes") or [])
    want = info.get("sha256") or _fetch_sha(release)
    dest = UPDATES_DIR / f"Arena-Desktop-{info['latest']}.exe"
    threading.Thread(target=_download, args=(url, dest, want, info["latest"]), daemon=True).start()
    return {"ok": True, "state": "downloading"}


_HELPER = r"""
$ErrorActionPreference = 'Stop'
$pidToWait = @@PID@@
$new = '@@NEW@@'
$target = '@@TARGET@@'
$ver = '@@VER@@'
try { Wait-Process -Id $pidToWait -Timeout 60 -ErrorAction SilentlyContinue } catch {}
$ok = $false
for ($i = 0; $i -lt 40 -and -not $ok; $i++) {
  try { Copy-Item -LiteralPath $new -Destination $target -Force; $ok = $true } catch { Start-Sleep -Milliseconds 500 }
}
if ($ok) {
  Remove-Item -LiteralPath $new -Force -ErrorAction SilentlyContinue
  try { Set-ItemProperty -Path '@@KEY@@' -Name DisplayVersion -Value $ver -ErrorAction Stop } catch {}
  Start-Process -FilePath $target
}
"""


def apply() -> Dict[str, Any]:
    """Write the helper, start it detached, and tell the caller to exit."""
    st = status()
    if st.get("state") != "ready" or not st.get("path") or not Path(st["path"]).is_file():
        return {"ok": False, "error": "No downloaded update is ready."}
    target = Path(sys.executable).resolve()
    try:
        WHATSNEW_FILE.parent.mkdir(parents=True, exist_ok=True)
        WHATSNEW_FILE.write_text(json.dumps({
            "version": st.get("version"), "from": __version__,
            "notes": st.get("notes") or [], "ts": time.time()}), encoding="utf-8")
        script = UPDATES_DIR / "apply-update.ps1"
        q = lambda p: str(p).replace("'", "''")  # noqa: E731
        body = (_HELPER.replace("@@PID@@", str(os.getpid())).replace("@@NEW@@", q(st["path"]))
                .replace("@@TARGET@@", q(target)).replace("@@VER@@", q(st.get("version")))
                .replace("@@KEY@@", UNINSTALL_KEY))
        script.write_text(body, encoding="utf-8")
        flags = 0x08000000 | 0x00000008  # CREATE_NO_WINDOW | DETACHED_PROCESS
        subprocess.Popen(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
                          "-WindowStyle", "Hidden", "-File", str(script)],
                         creationflags=flags, close_fds=True)
    except OSError as e:
        return {"ok": False, "error": f"Could not start the update: {e}"}
    _set(state="applying")
    return {"ok": True}


def read_whatsnew() -> Optional[Dict[str, Any]]:
    try:
        data = json.loads(WHATSNEW_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if str(data.get("version")) != __version__:
        return None
    return data


def clear_whatsnew() -> None:
    WHATSNEW_FILE.unlink(missing_ok=True)
