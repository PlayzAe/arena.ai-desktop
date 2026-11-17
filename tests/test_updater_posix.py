"""Linux/macOS updater path (roadmap step 5): assets, magic checks and apply().

The download side (pinned transport, checksums, signatures) is platform-neutral
already; what was Windows-only is the asset naming, the exe header check and
the swap helper (PowerShell). Every test here was red before the POSIX path
existed. The Windows helper is untouched - a regression test pins that too.
"""
import os
import subprocess
import sys
from pathlib import Path

import pytest

from arena import updater

ELF = b"\x7fELF" + b"\x20" * 1_100_000
MACHO = b"\xcf\xfa\xed\xfe" + b"\x20" * 1_100_000
MZ = b"MZ" + b"\x20" * 1_100_000


def _set_platform(monkeypatch, platform):
    monkeypatch.setattr(updater.sys, "platform", platform, raising=False)


# ---------- per-platform asset selection ----------

def test_pick_asset_is_platform_aware():
    release = {"assets": [
        {"name": "Arena-Desktop-Setup.exe", "browser_download_url": "https://x/setup"},
        {"name": "Arena-Desktop.exe", "browser_download_url": "https://x/win"},
        {"name": "Arena-Desktop-linux-x86_64", "browser_download_url": "https://x/lin"},
        {"name": "Arena-Desktop.AppImage", "browser_download_url": "https://x/appimage"},
        {"name": "Arena-Desktop-macos", "browser_download_url": "https://x/mac"},
    ]}
    assert updater.pick_asset(release, platform="win32")["browser_download_url"] == "https://x/win"
    assert updater.pick_asset(release, platform="linux")["browser_download_url"] == "https://x/lin"
    assert updater.pick_asset(release, platform="darwin")["browser_download_url"] == "https://x/mac"


def test_pick_asset_never_crosses_platforms():
    windows_only = {"assets": [{"name": "Arena-Desktop.exe", "browser_download_url": "https://x/win"}]}
    assert updater.pick_asset(windows_only, platform="linux") is None
    assert updater.pick_asset(windows_only, platform="darwin") is None
    # A .dmg is not a single file that can replace the running binary: better
    # no asset than a download the installer must refuse later.
    dmg_only = {"assets": [{"name": "Arena-Desktop.dmg", "browser_download_url": "https://x/dmg"}]}
    assert updater.pick_asset(dmg_only, platform="darwin") is None
    posix_only = {"assets": [{"name": "Arena-Desktop.AppImage", "browser_download_url": "https://x/a"}]}
    assert updater.pick_asset(posix_only, platform="win32") is None


def test_release_info_and_sig_follow_the_platform():
    release = {"assets": [
        {"name": "Arena-Desktop-linux-x86_64", "browser_download_url": "https://x/lin"},
        {"name": "Arena-Desktop-linux-x86_64.sig", "browser_download_url": "https://x/lin.sig"},
        {"name": "Arena-Desktop.exe", "browser_download_url": "https://x/win"},
    ]}
    info = updater.release_info(release, platform="linux")
    assert info["asset_url"] == "https://x/lin"
    assert info["sig_url"] == "https://x/lin.sig" and info["signed"] is True


# ---------- per-platform download magic check ----------

def _download_with(monkeypatch, tmp_path, body, platform, tag):
    _set_platform(monkeypatch, platform)
    monkeypatch.setattr(updater, "UPDATES_DIR", tmp_path / "up")
    monkeypatch.setattr(updater, "_job", {})

    class _S:
        def __init__(self, b):
            self._b, self.status, self.content_length, self.content_type = b, 200, len(b), "application/octet-stream"

        def iter_chunks(self, size=1 << 16):
            for i in range(0, len(self._b), size):
                yield self._b[i:i + size]

        def close(self):
            pass

    monkeypatch.setattr(updater, "_open_stream", lambda url, timeout=0: _S(body))
    dest = tmp_path / "up" / f"new-bin-{tag}"
    updater._download("https://example.invalid/bin", dest, "", "9.9.9", expected=len(body))
    return updater.status(), dest


@pytest.mark.parametrize("platform,good,bad", [
    ("linux", ELF, MZ),
    ("darwin", MACHO, MZ),
    ("win32", MZ, ELF),
])
def test_download_accepts_only_this_platforms_magic(monkeypatch, tmp_path, platform, good, bad):
    st, dest = _download_with(monkeypatch, tmp_path, good, platform, "good")
    assert st["state"] == "ready" and dest.exists()
    st, dest = _download_with(monkeypatch, tmp_path, bad, platform, "bad")
    assert st["state"] == "error" and not dest.exists()
    assert "valid app" in st["error"]


# ---------- apply(): the POSIX swap helper ----------

def test_apply_on_posix_runs_the_shell_helper(monkeypatch, tmp_path):
    _set_platform(monkeypatch, "linux")
    monkeypatch.setattr(updater.sys, "frozen", True, raising=False)
    target = tmp_path / "Arena-Desktop"
    target.write_bytes(b"old")
    monkeypatch.setattr(updater.sys, "executable", str(target))
    monkeypatch.setattr(updater, "UPDATES_DIR", tmp_path / "up")
    monkeypatch.setattr(updater, "WHATSNEW_FILE", tmp_path / "whatsnew.json")
    monkeypatch.setattr(updater, "_job", {})
    new = tmp_path / "up" / "new-bin"
    new.parent.mkdir(parents=True)
    new.write_bytes(ELF)
    updater._set(state="ready", path=str(new), version="9.9.9", notes=["n1"])
    monkeypatch.setattr(updater.os, "getpid", lambda: 4242)
    calls = []
    monkeypatch.setattr(updater.subprocess, "Popen", lambda *a, **k: calls.append((a, k)) or object())
    res = updater.apply()
    assert res["ok"] is True and updater.status()["state"] == "applying"
    assert len(calls) == 1
    args, kw = calls[0]
    assert args[0][0] == "/bin/sh" and args[0][1].endswith("apply-update.sh")
    assert kw.get("start_new_session") is True, "the helper must survive the app exiting"
    assert "creationflags" not in kw, "Windows-only flags must not be passed on POSIX"
    body = Path(args[0][1]).read_text(encoding="utf-8")
    assert "4242" in body and str(target) in body and str(new) in body and "9.9.9" in body
    assert "update-failed" in body, "the helper must drop a failure marker"
    assert body.count("exec") >= 2 or "exec \"$target\"" in body, "it must relaunch on success AND on failure"
    assert (tmp_path / "whatsnew.json").exists()


@pytest.mark.skipif(sys.platform == "win32", reason="runs the POSIX helper for real")
def test_posix_helper_replaces_the_binary_and_relaunches(tmp_path):
    target = tmp_path / "Arena-Desktop"
    target.write_text("#!/bin/sh\necho old > \"$OUT\"\n", encoding="utf-8")
    target.chmod(0o755)
    new = tmp_path / "new-bin"
    new.write_text("#!/bin/sh\necho new > \"$OUT\"\n", encoding="utf-8")
    new.chmod(0o755)
    marker = tmp_path / "out.txt"
    # A pid that is already gone: the wait loop must fall through immediately.
    dead = subprocess.Popen(["true"]).pid
    body = updater.posix_helper_script(dead, str(new), str(target), "9.9.9")
    body = body.replace("n -lt 40", "n -lt 2").replace("sleep 0.5", "sleep 0.05")
    script = tmp_path / "apply-update.sh"
    script.write_text(body, encoding="utf-8")
    env = dict(os.environ, OUT=str(marker))
    subprocess.run(["/bin/sh", str(script)], env=env, timeout=30, check=True)
    assert target.read_text(encoding="utf-8") == "#!/bin/sh\necho new > \"$OUT\"\n"
    assert marker.read_text(encoding="utf-8").strip() == "new", "the new binary must be relaunched"
    assert (target.parent / "version.txt").read_text(encoding="utf-8") == "9.9.9"
    assert not new.exists(), "the staged download must be cleaned up"


@pytest.mark.skipif(sys.platform == "win32", reason="runs the POSIX helper for real")
def test_posix_helper_reports_a_failed_swap_and_relaunches_the_old_app(tmp_path):
    target = tmp_path / "Arena-Desktop"
    target.write_text("#!/bin/sh\necho old > \"$OUT\"\n", encoding="utf-8")
    target.chmod(0o755)
    new = tmp_path / "new-bin"
    new.write_text("#!/bin/sh\necho new > \"$OUT\"\n", encoding="utf-8")
    marker = tmp_path / "out.txt"
    fakebin = tmp_path / "fakebin"
    fakebin.mkdir()
    # Every mv fails: the copy must never win, and the app must still relaunch.
    (fakebin / "mv").write_text("#!/bin/sh\nexit 1\n", encoding="utf-8")
    (fakebin / "mv").chmod(0o755)
    dead = subprocess.Popen(["true"]).pid
    body = updater.posix_helper_script(dead, str(new), str(target), "9.9.9")
    body = body.replace("n -lt 40", "n -lt 2").replace("sleep 0.5", "sleep 0.05")
    script = tmp_path / "apply-update.sh"
    script.write_text(body, encoding="utf-8")
    env = dict(os.environ, OUT=str(marker), PATH=str(fakebin) + os.pathsep + os.environ.get("PATH", ""))
    subprocess.run(["/bin/sh", str(script)], env=env, timeout=30, check=True)
    assert (tmp_path / "update-failed.txt").exists(), "the helper must drop a failure marker"
    assert marker.read_text(encoding="utf-8").strip() == "old", "the old app must be relaunched on failure"
    assert target.read_text(encoding="utf-8") == "#!/bin/sh\necho old > \"$OUT\"\n"


def test_windows_helper_path_is_untouched(monkeypatch, tmp_path):
    _set_platform(monkeypatch, "win32")
    monkeypatch.setattr(updater.sys, "frozen", True, raising=False)
    target = tmp_path / "Arena-Desktop.exe"
    target.write_bytes(b"MZ old")
    monkeypatch.setattr(updater.sys, "executable", str(target))
    monkeypatch.setattr(updater, "UPDATES_DIR", tmp_path / "up")
    monkeypatch.setattr(updater, "WHATSNEW_FILE", tmp_path / "whatsnew.json")
    monkeypatch.setattr(updater, "_job", {})
    new = tmp_path / "up" / "new.exe"
    new.parent.mkdir(parents=True)
    new.write_bytes(MZ)
    updater._set(state="ready", path=str(new), version="9.9.9", notes=[])
    monkeypatch.setattr(updater.os, "getpid", lambda: 4242)
    calls = []
    monkeypatch.setattr(updater.subprocess, "Popen", lambda *a, **k: calls.append((a, k)) or object())
    assert updater.apply()["ok"] is True
    args, kw = calls[0]
    assert args[0][0] == "powershell" and args[0][-1].endswith("apply-update.ps1")
    assert "creationflags" in kw
    body = Path(args[0][-1]).read_text(encoding="utf-8")
    assert "update-failed" in body and body.count("Start-Process") >= 2
