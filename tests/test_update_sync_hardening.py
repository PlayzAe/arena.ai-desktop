"""Logic-audit regression bar for the 1.6.0 updater and Code-project sync.

Every test here first ran red against upstream 274016c, proving the defect
described in its docstring, and then pins the fixed behavior. See the audit
notes in docs/ for the full write-up.
"""
import time

import pytest

import arena.web.app as web
from arena import contracts, sandbox_sync, updater

MSG_ID = "01a1e653-7f3e-732d-b164-0a2ec5d7b48d"


# --- sandbox_sync.inside(): root must be resolved like the targets ---

def test_inside_works_when_the_root_is_behind_a_symlink(tmp_path):
    """A project folder can live behind a symlink (macOS /tmp, OneDrive Documents,
    a linked config dir). inside() compares a raw root with resolved parents, so
    every path was rejected and the whole sync feature went silent there."""
    real = tmp_path / "real"
    real.mkdir()
    try:
        link = tmp_path / "link"
        link.symlink_to(real, target_is_directory=True)
    except (OSError, NotImplementedError):
        pytest.skip("creating symlinks needs privileges on this system")
    got = sandbox_sync.inside(link, "a.txt")
    assert got == (real / "a.txt").resolve()
    # and a traversal is still refused
    with pytest.raises(ValueError):
        sandbox_sync.inside(link, "../escape.txt")


# --- sandbox_sync.preview_url(): message_id comes off the stream ---

def test_preview_url_refuses_hostile_message_ids():
    """Without a charset check, 'evil.example/x' becomes the URL host:
    https://evil.example/x.arena.site/... - the download would leave arena.site
    and write attacker content into the project."""
    assert sandbox_sync.preview_url("evil.example/x", "public/a.jpg") is None
    assert sandbox_sync.preview_url("evil.example\\x", "public/a.jpg") is None
    assert sandbox_sync.preview_url("a b", "public/a.jpg") is None
    assert sandbox_sync.preview_url("", "public/a.jpg") is None
    assert sandbox_sync.preview_url(MSG_ID, "public/a.jpg") == \
        f"https://{MSG_ID}.arena.site/a.jpg"


# --- npm install runs package lifecycle scripts: it needs a permission decision ---

def test_npm_install_asks_before_running_in_accept_edits(tmp_path, monkeypatch):
    """acceptEdits only auto-approves file writes; the permission broker answers
    'ask' for run_cmd there. The sync shortcut auto-ran npm install regardless,
    executing third-party lifecycle scripts without a prompt."""
    ws = tmp_path / "proj"
    ws.mkdir()
    (ws / "package.json").write_text('{"name": "x"}', encoding="utf-8")
    npm_calls = []
    asked = []

    def fake_permit(mode, tool, info):
        asked.append(tool)
        yield from ()
        return "allow" if tool == "write_file" else "ask"

    monkeypatch.setattr(web, "_chosen_ws", lambda: ws)
    monkeypatch.setattr(web, "_perm_mode", lambda: "acceptEdits")
    monkeypatch.setattr(web, "_permit", fake_permit)
    monkeypatch.setattr(sandbox_sync, "run_npm_install",
                        lambda root, pk, timeout=0: (npm_calls.append((root, list(pk))), (True, ""))[1])
    conv = {"chat_id": "c1", "title": "Bean", "mode": "direct", "modality": "webdev",
            "last_arena_ids": {"a": MSG_ID, "b": None},
            "sandbox": [{"id": "n1", "model": "a", "ok": True}],
            "sb_ops": {"n1": {"lane": "a", "op": {"id": "n1", "kind": "npm", "packages": ["lucide-react"]}}}}
    list(web._finish_sandbox(conv))
    assert "run_cmd" in asked, "the permission broker must be consulted about npm install"
    assert npm_calls == [], "npm install must not run without an allow decision"


# --- updater._download(): a cut stream must not become a 'ready' update ---

class _StreamResp:
    def __init__(self, body: bytes, total: int):
        self.status_code = 200
        self.headers = {"Content-Length": str(total)} if total else {}
        self._body = body

    def raise_for_status(self):
        pass

    def iter_content(self, chunk_size=0):
        for i in range(0, len(self._body), 1 << 16):
            yield self._body[i:i + (1 << 16)]

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_truncated_download_without_checksum_is_rejected(tmp_path, monkeypatch):
    """A dropped connection on a close-framed response (no Content-Length) ends
    the stream cleanly, leaving a valid-looking prefix: >= 1 MB, MZ header. With
    no checksum, only the release asset size can catch it - and start_download
    knew that size but never used it."""
    monkeypatch.setattr(updater, "UPDATES_DIR", tmp_path / "up")
    monkeypatch.setattr(updater, "_job", {})
    monkeypatch.setattr(updater.sys, "frozen", True, raising=False)
    body = b"MZ" + b"\0" * (1_200_000 - 2)  # 1.2 MB arrives of the promised 2 MB
    monkeypatch.setattr(updater.requests, "get", lambda *a, **k: _StreamResp(body, 0))
    res = updater.start_download(
        {"latest": "9.9.9", "asset_url": "https://example.invalid/a.exe",
         "asset_size": 2_000_000, "sha256": "", "notes": []},
        {"assets": [{"name": "Arena-Desktop.exe", "digest": ""}]})
    assert res["ok"] is True
    for _ in range(200):
        if updater.status().get("state") != "downloading":
            break
        time.sleep(0.05)
    st = updater.status()
    assert st["state"] == "error", f"a truncated exe must never be installable, got {st}"


def test_complete_download_without_checksum_is_ready(tmp_path, monkeypatch):
    body = b"MZ" + b"\0" * (1_200_000 - 2)
    monkeypatch.setattr(updater, "UPDATES_DIR", tmp_path / "up")
    monkeypatch.setattr(updater, "_job", {})
    monkeypatch.setattr(updater.requests, "get", lambda *a, **k: _StreamResp(body, len(body)))
    updater._download("https://example.invalid/a.exe", tmp_path / "up" / "new.exe", "", "9.9.9")
    st = updater.status()
    assert st["state"] == "ready" and st["verified"] is False


def test_content_encoded_download_is_not_flagged_truncated(tmp_path, monkeypatch):
    """A gzip-encoded response reports the COMPRESSED size in Content-Length while
    iter_content yields the decompressed bytes (the real file). Comparing those
    rejects every legitimate update; when Content-Encoding is set, only the
    release asset size is a valid witness."""
    body = b"MZ" + b"\0" * (1_200_000 - 2)

    class Encoded(_StreamResp):
        def __init__(self):
            super().__init__(body, 0)
            self.headers = {"Content-Length": "400000", "Content-Encoding": "gzip"}

    monkeypatch.setattr(updater, "UPDATES_DIR", tmp_path / "up")
    monkeypatch.setattr(updater.requests, "get", lambda *a, **k: Encoded())
    monkeypatch.setattr(updater, "_job", {})
    updater._download("https://example.invalid/a.exe", tmp_path / "up" / "new.exe", "", "9.9.9",
                      expected=len(body))
    st = updater.status()
    assert st["state"] == "ready", f"a valid gzip-encoded update must download, got {st}"


def test_update_helper_reports_a_failed_swap():
    """When every copy retry fails, the helper used to do nothing: no relaunch,
    no marker, while the app had already exited for the swap. The user got a
    dead end."""
    assert "update-failed" in updater._HELPER, "the helper must drop a failure marker"
    assert updater._HELPER.count("Start-Process") >= 2, "it must relaunch on success AND on failure"


# --- contracts.find_preview_url(): '.arena.site in value' matched attacker hosts ---

def test_find_preview_url_is_host_anchored():
    ok = "https://01a1e698-754d-715c-959f-2d3403157634.arena.site/app/"
    assert contracts.find_preview_url(ok) == ok
    assert contracts.find_preview_url("https://evil.example/x.arena.site/app/") is None
    assert contracts.find_preview_url("https://evil.example/?next=.arena.site") is None
    assert contracts.find_preview_url("https://arena.site.evil.example/app/") is None
    # urlsplit sees host 'arena.site' in these, but browsers normalize '\' to '/'
    # and strip userinfo - so they must be rejected as parser-confusion probes.
    assert contracts.find_preview_url("https://evil.example\\@arena.site/app/") is None
    assert contracts.find_preview_url("https://arena.site@evil.example/app/") is None
