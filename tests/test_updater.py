import hashlib
import http.server
import threading

import pytest

from arena import updater

EXE = b"MZ" + b"\0" * 1_100_000


@pytest.fixture
def served(tmp_path):
    (tmp_path / "a.exe").write_bytes(EXE)
    (tmp_path / "bad.exe").write_bytes(b"<html>" + b"x" * 1_100_000)
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=str(tmp_path), **k)  # noqa: E731
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


def test_version_compare():
    assert updater.version_tuple("v1.10.0") > updater.version_tuple("1.9.9")
    assert updater.version_tuple("1.5.1") > updater.version_tuple("1.5.0")


def test_release_notes_become_plain_bullets():
    body = "## Fixed\n- **Chats** no longer vanish (#12)\n* Faster start `abc1234`\n\n> quote\n"
    assert updater.plain_notes(body) == ["Chats no longer vanish", "Faster start"]


def test_pick_asset_prefers_portable_exe_not_setup():
    rel = {"assets": [{"name": "Arena-Desktop-Setup.exe"}, {"name": "Arena-Desktop.exe", "digest": "sha256:ab"}]}
    assert updater.pick_asset(rel)["name"] == "Arena-Desktop.exe"
    assert updater.release_info(rel)["sha256"] == "ab"
    assert updater.release_info({"assets": []})["can_install"] is False


def test_download_verifies_checksum_and_exe_header(served, tmp_path, monkeypatch):
    monkeypatch.setattr(updater, "UPDATES_DIR", tmp_path / "up")
    dest = tmp_path / "up" / "new.exe"
    updater._download(f"{served}/a.exe", dest, hashlib.sha256(EXE).hexdigest(), "9.9.9")
    assert updater.status()["state"] == "ready" and dest.read_bytes() == EXE

    updater._download(f"{served}/a.exe", dest, "0" * 64, "9.9.9")
    assert updater.status()["state"] == "error" and "checksum" in updater.status()["error"]

    updater._download(f"{served}/bad.exe", dest, "", "9.9.9")
    assert updater.status()["state"] == "error"


def test_apply_needs_a_ready_download():
    updater._set(state="idle", path=None)
    assert updater.apply()["ok"] is False


def test_whatsnew_only_for_current_version(tmp_path, monkeypatch):
    monkeypatch.setattr(updater, "WHATSNEW_FILE", tmp_path / "w.json")
    (tmp_path / "w.json").write_text('{"version": "0.0.1", "notes": []}')
    assert updater.read_whatsnew() is None
    (tmp_path / "w.json").write_text('{"version": "%s", "notes": ["x"]}' % updater.__version__)
    assert updater.read_whatsnew()["notes"] == ["x"]
    updater.clear_whatsnew()
    assert updater.read_whatsnew() is None
