"""Workspace panel auto-refresh (roadmap step 3): a cheap folder change stamp.

The workspace panel tree goes stale when files change outside the app (edits in
VS Code, builds, git). The UI polls GET /api/workspace/stamp and reloads the
tree only when the stamp moves. Every test here was red before the endpoint
existed. The stamp moves exactly when the rendered tree would change (names,
kinds, sizes, modified times - the tree's own payload), stays quiet across
dependency/log noise and across byte changes the tree cannot show (coarse
filesystem timestamps), and stays inside the panel root like every other
workspace panel route.
"""
import os
import shutil

import arena.web.app as web
from arena import workspace


def _client():
    return web.app.test_client()


def _stamp(c, path=None):
    url = "/api/workspace/stamp" if path is None else f"/api/workspace/stamp?path={path}"
    r = c.get(url)
    assert r.status_code == 200, r.get_data(as_text=True)
    body = r.get_json()
    assert body["ok"] is True
    return body["stamp"]


def test_stamp_moves_with_every_visible_change():
    root = workspace.PROJECTS_DIR
    (root / "src").mkdir(parents=True)
    app_py = root / "src" / "app.py"
    app_py.write_text("print(1)\n", encoding="utf-8")
    c = _client()
    first = _stamp(c)
    assert _stamp(c) == first, "same tree state must give the same stamp"
    # rewrite with the same byte length and a moved modified time (forced so
    # the test does not depend on filesystem timestamp granularity)
    app_py.write_text("print(2)\n", encoding="utf-8")
    st = app_py.stat()
    os.utime(app_py, ns=(st.st_mtime_ns + 2_000_000_000, st.st_mtime_ns + 2_000_000_000))
    assert _stamp(c) != first, "a rewritten file with a new modified time must move the stamp"
    second = _stamp(c)
    (root / "new.txt").write_text("hi", encoding="utf-8")
    assert _stamp(c) != second, "a new file row must move the stamp"
    third = _stamp(c)
    (root / "new.txt").unlink()
    assert _stamp(c) != third, "a deleted file row must move the stamp"
    fourth = _stamp(c)
    (root / "sub").mkdir()
    assert _stamp(c) != fourth, "a new folder row must move the stamp"
    (root / "sub" / "x.txt").write_text("x", encoding="utf-8")
    fifth = _stamp(c)
    (root / "sub" / "x.txt").rename(root / "sub" / "y.txt")
    assert _stamp(c) != fifth, "a rename inside a nested folder must move the stamp"


def test_stamp_is_quiet_about_dependency_and_log_noise():
    root = workspace.PROJECTS_DIR
    for d in ("node_modules/pkg", ".git", ".arena-artifacts", "__pycache__", ".venv"):
        (root / d).mkdir(parents=True, exist_ok=True)
    (root / ".git" / "HEAD").write_text("ref: refs/heads/main\n", encoding="utf-8")
    c = _client()
    before = _stamp(c)
    # noise inside pruned folders: invisible to the tree, invisible to the stamp
    (root / "node_modules" / "pkg" / "index.js").write_text("module.exports = 1\n", encoding="utf-8")
    (root / ".git" / "HEAD").write_text("ref: refs/heads/dev\n", encoding="utf-8")
    (root / ".arena-artifacts" / "bg1.log").write_text("another line\n", encoding="utf-8")
    (root / "__pycache__" / "m.cpython-313.pyc").write_bytes(b"\x01\x02")
    (root / ".venv" / "pyvenv.cfg").write_text("home = /usr\n", encoding="utf-8")
    assert _stamp(c) == before, "writes inside dependency/log folders must not move the stamp"
    # the folder row itself appearing/disappearing is visible
    shutil.rmtree(root / "node_modules")
    assert _stamp(c) != before, "removing a visible folder row must move the stamp"


def test_stamp_ignores_byte_changes_the_tree_cannot_show():
    """Same name, size and modified time render the same tree row, so byte
    differences the tree cannot show must not churn the poll (this is what
    happens on filesystems with coarse timestamps)."""
    root = workspace.PROJECTS_DIR
    p = root / "same.txt"
    p.write_text("aaaa\n", encoding="utf-8")
    st = p.stat()
    c = _client()
    before = _stamp(c)
    p.write_text("bbbb\n", encoding="utf-8")
    os.utime(p, ns=(st.st_mtime_ns, st.st_mtime_ns))
    assert _stamp(c) == before, "an invisible byte change must not move the stamp"


def test_stamp_can_be_scoped_to_one_subfolder():
    root = workspace.PROJECTS_DIR
    (root / "app").mkdir(parents=True)
    (root / "app" / "a.txt").write_text("a", encoding="utf-8")
    (root / "docs").mkdir()
    (root / "docs" / "b.txt").write_text("b", encoding="utf-8")
    c = _client()
    before = _stamp(c, "app")
    (root / "docs" / "b.txt").write_text("changed", encoding="utf-8")
    assert _stamp(c, "app") == before, "changes outside the scoped subtree must not move the stamp"
    (root / "app" / "a.txt").write_text("changed", encoding="utf-8")
    assert _stamp(c, "app") != before, "changes inside the scoped subtree must move the stamp"


def test_stamp_stays_inside_the_panel_root():
    c = _client()
    assert c.get("/api/workspace/stamp?path=..%2F").status_code == 403
    assert c.get("/api/workspace/stamp?path=.ssh").status_code == 403
    assert c.get("/api/workspace/stamp?path=%2Fetc%2Fpasswd").status_code == 403
    (workspace.PROJECTS_DIR / "file.txt").write_text("x", encoding="utf-8")
    assert c.get("/api/workspace/stamp?path=file.txt").status_code == 400, "files are not stampable folders"
