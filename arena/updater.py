"""One-click self-update: download the release exe, verify it, swap it in, reopen.

The running exe cannot overwrite itself, so apply() starts a small hidden
PowerShell helper that waits for this process to exit, copies the new exe over
the old one, records the new version, and relaunches. What is new is written
to whatsnew.json and shown once after the restart.
"""
from __future__ import annotations

import base64
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
from arena.pinned_https import pinned_https_open
from arena.signed_release import verify as _verify_signature

REPO_API = "https://api.github.com/repos/PlayzAe/arena.ai-desktop"
ASSET_NAME = "Arena-Desktop.exe"
UPDATES_DIR = CONFIG_DIR / "updates"
WHATSNEW_FILE = CONFIG_DIR / "whatsnew.json"
UNINSTALL_KEY = r"HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ArenaDesktop"

# Release authenticity: while this holds a base64 Ed25519 public key (32 raw
# bytes), every update must ship a detached signature (Arena-Desktop.exe.sig)
# that verifies against it, or it is refused before anything is installed.
# The maintainer creates the key with scripts/sign_release.py keygen and pins
# the printed public key here; the secret never leaves their machine. Empty
# keeps today's behavior (checksum-only, unsigned releases still install).
RELEASE_PUBKEY = ""

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


def _platform_key(platform: Optional[str] = None) -> str:
    platform = platform or sys.platform
    return platform if platform in _ASSET_PREFERENCES else "win32" if platform == "win32" else "linux"


# Self-update needs one file that can replace the running binary: a PyInstaller
# one-file build or an AppImage. That is the release naming convention; a .dmg
# or installer is deliberately not picked (nothing could install it in place).
_ASSET_PREFERENCES = {
    "win32": ("Arena-Desktop.exe",),
    "linux": ("Arena-Desktop-linux-x86_64", "Arena-Desktop.AppImage"),
    "darwin": ("Arena-Desktop-macos-universal", "Arena-Desktop-macos"),
}
_ASSET_FALLBACK_MARKERS = {
    "win32": (".exe",),
    "linux": (".appimage", "linux"),
    "darwin": ("macos", "darwin"),
}


def pick_asset(release: Dict[str, Any], platform: Optional[str] = None) -> Optional[Dict[str, Any]]:
    key = _platform_key(platform)
    assets = release.get("assets") or []
    for name in _ASSET_PREFERENCES[key]:
        for a in assets:
            if str(a.get("name", "")).lower() == name.lower():
                return a
    for a in assets:
        name = str(a.get("name", "")).lower()
        if "setup" in name:
            continue
        if any(name.endswith(m) if m.startswith(".") else m in name
               for m in _ASSET_FALLBACK_MARKERS[key]):
            return a
    return None


def _bin_suffix(platform: Optional[str] = None) -> str:
    return ".exe" if _platform_key(platform) == "win32" else ""


def _valid_magic(head: bytes, platform: Optional[str] = None) -> bool:
    """The download must be this platform's kind of executable before install."""
    key = _platform_key(platform)
    if key == "win32":
        return head.startswith(b"MZ")
    if key == "darwin":
        return head[:4] in {b"\xcf\xfa\xed\xfe", b"\xce\xfa\xed\xfe", b"\xfe\xed\xfa\xcf",
                            b"\xfe\xed\xfa\xce", b"\xca\xfe\xba\xbe", b"\xbe\xba\xfe\xca"}
    return head.startswith(b"\x7fELF")  # linux: ELF one-file build or AppImage


def release_info(release: Dict[str, Any], platform: Optional[str] = None) -> Dict[str, Any]:
    asset = pick_asset(release, platform)
    sha = ""
    if asset and str(asset.get("digest", "")).startswith("sha256:"):
        sha = asset["digest"].split(":", 1)[1]
    sig = _sig_asset_url(release, platform)
    return {
        "notes": plain_notes(release.get("body") or ""),
        "asset_url": asset.get("browser_download_url") if asset else None,
        "asset_size": asset.get("size") if asset else None,
        "sha256": sha,
        "sig_url": sig,
        "signed": sig is not None,
        "can_install": bool(asset) and bool(getattr(sys, "frozen", False)),
    }


def _sig_asset_url(release: Dict[str, Any], platform: Optional[str] = None) -> Optional[str]:
    asset = pick_asset(release, platform)
    if not asset:
        return None
    want = f"{asset.get('name', '')}.sig".lower()
    for a in release.get("assets") or []:
        if str(a.get("name", "")).lower() == want:
            return a.get("browser_download_url")
    return None


def _open_stream(url: str, timeout: float = 30):
    """The one network seam: a started, vetted, pinned-transport response.
    Release metadata must never be able to point the updater at a private or
    internal address, and a DNS flip cannot reroute the socket mid-download."""
    return pinned_https_open(url, timeout=timeout)


def _fetch_sha(release: Dict[str, Any]) -> str:
    for a in release.get("assets") or []:
        if str(a.get("name", "")).lower() == f"{ASSET_NAME}.sha256".lower():
            try:
                stream = _open_stream(a["browser_download_url"], timeout=15)
                try:
                    txt = b"".join(stream.iter_chunks()).decode("utf-8", "replace")
                finally:
                    stream.close()
                m = re.search(r"\b[0-9a-fA-F]{64}\b", txt)
                return m.group().lower() if m else ""
            except (OSError, ValueError):
                return ""
    return ""


def status() -> Dict[str, Any]:
    with _lock:
        return dict(_job)


def _set(**kw: Any) -> None:
    with _lock:
        _job.update(kw)


def _download(url: str, dest: Path, want_sha: str, version: str, expected: int = 0,
              sig_url: Optional[str] = None) -> None:
    try:
        UPDATES_DIR.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(".part")
        h = hashlib.sha256()
        stream = _open_stream(url, timeout=30)
        try:
            if stream.status >= 400:
                raise OSError(f"HTTP {stream.status}")
            # Content-Length is only the file size when the body is not encoded;
            # for gzip responses it counts compressed bytes while iter_chunks
            # yields the decompressed file.
            total = stream.content_length or 0
            done = 0
            with open(tmp, "wb") as f:
                for chunk in stream.iter_chunks(1 << 20):
                    f.write(chunk)
                    h.update(chunk)
                    done += len(chunk)
                    _set(done=done, total=total or expected)
        finally:
            stream.close()
        # A cut connection on a close-framed response ends the stream cleanly and
        # leaves a valid-looking prefix behind; the size is the only witness when
        # no checksum is available.
        want = total or int(expected or 0)
        if want and done != want:
            tmp.unlink(missing_ok=True)
            _set(state="error", error=f"Download truncated: got {done:,} of {want:,} bytes. Nothing was installed.")
            return
        if want_sha and h.hexdigest().lower() != want_sha.lower():
            tmp.unlink(missing_ok=True)
            _set(state="error", error="Download failed its safety check (checksum mismatch). Nothing was installed.")
            return
        with open(tmp, "rb") as f:
            head = f.read(4)
        if tmp.stat().st_size < 1_000_000 or not _valid_magic(head):
            tmp.unlink(missing_ok=True)
            _set(state="error", error="Downloaded file is not a valid app. Nothing was installed.")
            return
        verified: Any = bool(want_sha)
        if RELEASE_PUBKEY:
            # Fail closed: with a pinned key, only a correctly signed release
            # may ever be swapped in. The signature covers the exact bytes the
            # checksum saw, so both checks must agree before install.
            ok = False
            if sig_url:
                try:
                    sig_stream = _open_stream(sig_url, timeout=15)
                    try:
                        sig_blob = b"".join(sig_stream.iter_chunks())
                    finally:
                        sig_stream.close()
                    sig = base64.b64decode(sig_blob.strip(), validate=True)
                    pub = base64.b64decode(RELEASE_PUBKEY.strip(), validate=True)
                    ok = _verify_signature(tmp.read_bytes(), sig, pub)
                except Exception:  # noqa: BLE001 - any failure refuses the install
                    ok = False
            if not ok:
                tmp.unlink(missing_ok=True)
                _set(state="error", error="Download failed its signature check. Nothing was installed.")
                return
            verified = "signature"
        os.replace(tmp, dest)
        _set(state="ready", path=str(dest), version=version, verified=verified)
    except Exception as e:  # noqa: BLE001 - surfaced to the UI
        _set(state="error", error=f"Download failed: {e}")


def start_download(info: Dict[str, Any], release: Dict[str, Any]) -> Dict[str, Any]:
    if not getattr(sys, "frozen", False):
        return {"ok": False, "error": "One-click updates work in the installed app. Download the new version from GitHub."}
    url = info.get("asset_url")
    if not url:
        name = _ASSET_PREFERENCES[_platform_key()][0]
        return {"ok": False, "error": f"This release has no {name} to install."}
    with _lock:
        if _job.get("state") == "downloading":
            return {"ok": True, "state": "downloading"}
        _job.clear()
        _job.update(state="downloading", done=0, total=info.get("asset_size") or 0,
                    version=info["latest"], notes=info.get("notes") or [])
    want = info.get("sha256") or _fetch_sha(release)
    sig_url = info.get("sig_url") or _sig_asset_url(release)
    dest = UPDATES_DIR / f"Arena-Desktop-{info['latest']}{_bin_suffix()}"
    threading.Thread(target=_download,
                     args=(url, dest, want, info["latest"], int(info.get("asset_size") or 0), sig_url),
                     daemon=True).start()
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
  try { Set-Content -LiteralPath (Join-Path (Split-Path $target) 'version.txt') -Value $ver -Encoding UTF8 } catch {}
  Start-Process -FilePath $target
} else {
  try { Set-Content -LiteralPath (Join-Path (Split-Path $new) 'update-failed.txt') -Value ('Could not replace ' + $target) -Encoding UTF8 } catch {}
  Start-Process -FilePath $target
}
"""


# POSIX (Linux/macOS) swap helper: same duties as the PowerShell one - wait
# for the app to exit, replace the binary atomically (copy, chmod, rename),
# record the version, relaunch on BOTH paths and leave a failure marker when
# the swap could not happen. Paths are single-quoted with shell escaping.
_POSIX_HELPER = """#!/bin/sh
pid=@@PID@@
new='@@NEW@@'
target='@@TARGET@@'
ver='@@VER@@'
i=0
while kill -0 "$pid" 2>/dev/null && [ $i -lt 120 ]; do sleep 0.5; i=$((i+1)); done
ok=0
n=0
while [ $n -lt 40 ]; do
  if cp "$new" "$target.tmp" 2>/dev/null && chmod 755 "$target.tmp" 2>/dev/null && mv -f "$target.tmp" "$target" 2>/dev/null; then ok=1; break; fi
  sleep 0.5
  n=$((n+1))
done
if [ "$ok" = 1 ]; then
  rm -f "$new"
  printf '%s' "$ver" > "$(dirname "$target")/version.txt" 2>/dev/null
  exec "$target"
else
  rm -f "$target.tmp"
  printf 'Could not replace %s' "$target" > "$(dirname "$new")/update-failed.txt" 2>/dev/null
  exec "$target"
fi
"""


def posix_helper_script(pid: Any, new: Any, target: Any, ver: Any) -> str:
    q = lambda p: str(p).replace("'", "'\\''")  # noqa: E731
    return (_POSIX_HELPER.replace("@@PID@@", str(int(pid)))
            .replace("@@NEW@@", q(new)).replace("@@TARGET@@", q(target))
            .replace("@@VER@@", q(ver)))


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
        if sys.platform == "win32":
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
        else:
            script = UPDATES_DIR / "apply-update.sh"
            script.write_text(posix_helper_script(os.getpid(), st["path"], target, st.get("version")),
                              encoding="utf-8")
            script.chmod(0o755)
            subprocess.Popen(["/bin/sh", str(script)],
                             stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL, start_new_session=True, close_fds=True)
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
