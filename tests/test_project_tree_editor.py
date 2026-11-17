"""Backend contract for the Code-mode project tree and the workspace file editor.

Step 2 of the roadmap ("file tree + editor for Code mode"): the UI needs a safe way
to save an edited text file and to find the chat's project folder under the workspace
panel root. Every test here was red before the feature existed; the guards pin the
safety rails (traversal, sensitive paths, binary, size).
"""
from pathlib import Path

import arena.web.app as web
from arena import workspace

CHAT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
OTHER_ID = "99999999-9999-4999-8999-999999999999"


def _client():
    return web.app.test_client()


def _save_chat(**kw):
    web._save_chat(CHAT_ID, title=kw.pop("title", "Bean"), mode=kw.pop("mode", "direct"),
                   modality=kw.pop("modality", "webdev"),
                   messages=[{"role": "user", "text": "hi"}], **kw)


# ---------- editor save route ----------

def test_editor_saves_a_text_file_and_it_reads_back():
    c = _client()
    r = c.post("/api/workspace/file", json={"path": "proj/notes.txt", "content": "hello v2"})
    assert r.status_code == 200 and r.get_json()["ok"] is True
    got = c.get("/api/workspace/file?path=proj/notes.txt")
    assert got.status_code == 200 and got.get_json()["content"] == "hello v2"


def test_editor_refuses_traversal_sensitive_binary_and_oversized():
    c = _client()
    assert c.post("/api/workspace/file", json={"path": "../escape.txt", "content": "x"}).status_code == 403
    assert c.post("/api/workspace/file", json={"path": ".ssh/id_rsa", "content": "x"}).status_code == 403
    assert c.post("/api/workspace/file", json={"path": "a.bin", "content": "a\x00b"}).status_code in (400, 415)
    assert c.post("/api/workspace/file", json={"path": "big.txt", "content": "x" * (512 * 1024 + 1)}).status_code == 400
    assert not (workspace.PROJECTS_DIR.parent / "escape.txt").exists()


# ---------- chat project location ----------

def test_project_endpoint_points_at_the_chat_folder():
    _save_chat()
    r = _client().get(f"/api/chats/{CHAT_ID}/project")
    d = r.get_json()
    assert r.status_code == 200
    assert d["rel"] == f"bean-{CHAT_ID[:8]}/model-a"
    assert d["name"] == "model-a" and d["lane"] == "a"
    assert Path(d["root"]).is_absolute()


def test_project_endpoint_lane_and_unknown_chat():
    _save_chat(title="Duel", mode="battle")
    d = _client().get(f"/api/chats/{CHAT_ID}/project").get_json()
    assert d["rel"].endswith("model-a")
    assert _client().get(f"/api/chats/{OTHER_ID}/project").status_code == 404


def test_project_endpoint_relates_to_chosen_workspace(tmp_path, monkeypatch):
    monkeypatch.setattr(web, "_chosen_ws", lambda: tmp_path)
    _save_chat(title="Bean", mode="battle")
    d = _client().get(f"/api/chats/{CHAT_ID}/project").get_json()
    assert d["rel"] == "option-a" and Path(d["root"]).resolve() == (tmp_path / "option-a").resolve()
