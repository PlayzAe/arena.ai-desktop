"""Code-mode project mirroring, checked against a real recorded Arena stream (tests/data/code_chat_events.json)."""
import json
from pathlib import Path

import pytest

import arena.web.app as web
from arena import sandbox_sync, workspace

EVENTS = json.loads((Path(__file__).parent / "data" / "code_chat_events.json").read_text(encoding="utf-8"))
MSG_ID = "01a1e653-7f3e-732d-b164-0a2ec5d7b48d"
TEMPLATE = {"index.html", "package.json", "tsconfig.json", "vite.config.ts", "src/App.tsx", "src/main.tsx",
            "src/index.css", "src/utils/cn.ts"}


class _Resp:
    status_code = 200
    content = b"\xff\xd8\xff\xe0fake-jpeg"


@pytest.fixture
def env(tmp_path, monkeypatch):
    ws = tmp_path / "proj"
    ws.mkdir()
    calls = {"npm": [], "urls": []}
    monkeypatch.setattr(web, "_chosen_ws", lambda: ws)
    monkeypatch.setattr(web, "_perm_mode", lambda: "bypassPermissions")
    monkeypatch.setattr(web, "_media_get", lambda url, timeout=0: (calls["urls"].append(url), _Resp())[1])
    monkeypatch.setattr(sandbox_sync, "run_npm_install",
                        lambda root, pk, timeout=0: (calls["npm"].append((root, list(pk))), (True, ""))[1])
    conv = {"chat_id": "chat-x", "title": "Bean", "mode": "direct", "modality": "webdev",
            "last_arena_ids": {"a": MSG_ID, "b": None}}
    return ws, conv, calls


def _replay(conv, limit=None):
    for ev in EVENTS[:limit]:
        kind = ev.get("type")
        if kind == "webdev":
            list(web._webdev_event("a", ev, conv))
        elif kind == "tool-call":
            list(web._sandbox_call("a", ev, conv))
        elif kind == "tool-result":
            list(web._sandbox_result("a", ev, conv))


def test_real_init_event_exposes_all_template_files():
    init = next(e for e in EVENTS if e.get("type") == "webdev" and workspace.webdev_event_type(e) == "init")
    assert {f["path"] for f in workspace.webdev_files(init)} == TEMPLATE


def test_whole_project_lands_in_one_folder_with_images_and_packages(env):
    ws, conv, calls = env
    _replay(conv)
    notes = [s for s in web._finish_sandbox(conv)]
    assert not [r for r in conv["sandbox"] if r.get("error")]
    files = {p.relative_to(ws).as_posix() for p in ws.rglob("*") if p.is_file()}
    assert TEMPLATE <= files
    assert {"public/images/hero.jpg", "src/assets/hero.jpg", "src/components/Hero.tsx"} <= files
    assert (ws / "public/images/hero.jpg").read_bytes() == _Resp.content
    assert (ws / "src/assets/hero.jpg").read_bytes() == _Resp.content  # bash cp replayed
    assert not (ws / ".arena-files.json").exists()
    assert calls["urls"] == [f"https://{MSG_ID}.arena.site/images/hero.jpg"]
    assert calls["npm"] == [(ws, ["lucide-react"])]
    assert any("Packages installed" in str(n) for n in notes)
    assert "lucide-react" in "".join(str(e) for e in EVENTS)  # the package really came from the stream


def test_plan_mode_never_runs_npm(env, monkeypatch):
    ws, conv, calls = env
    monkeypatch.setattr(web, "_perm_mode", lambda: "plan")
    _replay(conv)
    assert calls["npm"] == []


def test_template_never_overwrites_a_users_own_file(env):
    ws, conv, _ = env
    (ws / "package.json").write_text('{"name": "mine"}', encoding="utf-8")
    _replay(conv, limit=3)
    assert (ws / "package.json").read_text(encoding="utf-8") == '{"name": "mine"}'
    assert (ws / "tsconfig.json").is_file()


def test_non_public_images_are_reported_not_guessed(env):
    ws, conv, calls = env
    call = {"type": "tool-call", "toolCallId": "t1", "toolName": "generate_image",
            "args": {"file_path": "src/assets/x.jpg", "prompt": "a"}}
    list(web._sandbox_call("a", call, conv))
    list(web._sandbox_result("a", {"toolCallId": "t1", "result": {"status": "success"}}, conv))
    out = " ".join(str(s) for s in web._finish_sandbox(conv))
    assert "only files under public/" in out and calls["urls"] == []


def test_npm_command_parsing_is_strict():
    assert sandbox_sync.npm_packages("npm install lucide-react framer-motion@11 2>&1 | tail -3") == ["lucide-react", "framer-motion@11"]
    assert sandbox_sync.npm_packages("npm install lucide-react && ls") == ["lucide-react"]
    assert sandbox_sync.npm_packages("npm i -g typescript") is None
    assert sandbox_sync.npm_packages("npm install git+https://evil.example/x.git ../local") == []
    assert sandbox_sync.npm_packages("npm install -D vite > /dev/null 2>&1") == ["vite"]
    assert sandbox_sync.npm_packages("ls -la") is None


def test_shell_replay_stays_inside_the_project(tmp_path):
    (tmp_path / "a.txt").write_text("x")
    res = sandbox_sync.replay_fs(tmp_path, "mkdir -p out && cp a.txt out/b.txt && cp a.txt ../escape.txt")
    assert (tmp_path / "out" / "b.txt").read_text() == "x"
    assert not (tmp_path.parent / "escape.txt").exists()
    assert any(r["ok"] == "" for r in res)
    assert sandbox_sync.replay_fs(tmp_path, "cp a.txt $HOME/z; rm -rf /") == []


def test_preview_url_only_for_public_files():
    assert sandbox_sync.preview_url("abc", "public/images/a.jpg") == "https://abc.arena.site/images/a.jpg"
    assert sandbox_sync.preview_url("abc", "src/assets/a.jpg") is None


def test_update_check_flags_a_newer_release(monkeypatch):
    class R:
        status_code = 200
        @staticmethod
        def json():
            return {"tag_name": "v1.6.1", "html_url": "u", "body": "- Fixed saving images",
                    "assets": [{"name": "Arena-Desktop.exe", "browser_download_url": "d", "size": 5,
                                "digest": "sha256:" + "a" * 64}]}
    monkeypatch.setattr(web.requests, "get", lambda *a, **k: R())
    monkeypatch.setattr(web, "APP_VERSION", "1.6.0")
    web._update_cache.clear()
    info = web.app.test_client().get("/api/update-check?force=1").get_json()
    assert info["update"] is True and info["latest"] == "1.6.1"
    assert info["notes"] == ["Fixed saving images"] and info["sha256"] == "a" * 64
    monkeypatch.setattr(web, "APP_VERSION", "1.6.1")
    web._update_cache.clear()
    assert web.app.test_client().get("/api/update-check?force=1").get_json()["update"] is False


def test_real_code_stream_keeps_each_narration_in_its_own_paragraph(env):
    """Replay of a real Arena code-chat stream: text before and after tool calls must not run together."""
    ws, conv, _ = env
    lines = (Path(__file__).parent / "data" / "code_stream_lines.txt").read_text(encoding="utf-8")

    class Resp:
        def iter_text(self):
            yield lines

    gen = web._line_events(Resp(), conv)
    try:
        while True:
            next(gen)
    except StopIteration as done:
        text = done.value["a"]
    assert text.startswith("Now I'll set up the fonts/title and prepare the image for inlining.\n\nNow the three components:\n\n")
    import re
    assert re.findall(r"[a-z0-9`):][.:!?][A-Z][a-z]", text) == []
