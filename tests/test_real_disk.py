"""End-to-end checks that touch the real disk and a real subprocess: no mocks of the writers."""
import json
import sys
import textwrap
from pathlib import Path

import pytest

import arena.web.app as web
from arena import workspace
from arena.tools.file_tools import EditFileTool, ReadFileTool, WriteFileTool

MCP_SERVER = textwrap.dedent('''
    import json, sys
    from pathlib import Path
    for line in sys.stdin:
        msg = json.loads(line)
        mid, method = msg.get("id"), msg.get("method")
        if mid is None:
            continue
        if method == "initialize":
            res = {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}},
                   "serverInfo": {"name": "disk", "version": "1"}}
        elif method == "tools/list":
            res = {"tools": [{"name": "save_note", "description": "Write text to a file",
                              "inputSchema": {"type": "object", "properties": {
                                  "path": {"type": "string"}, "text": {"type": "string"}},
                                  "required": ["path", "text"]}}]}
        elif method == "tools/call":
            a = msg["params"]["arguments"]
            Path(a["path"]).write_text(a["text"], encoding="utf-8")
            res = {"content": [{"type": "text", "text": "saved " + a["path"]}]}
        else:
            res = {}
        sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": mid, "result": res}) + "\\n")
        sys.stdout.flush()
''')


@pytest.fixture
def client():
    return web.app.test_client()


def test_workspace_folder_and_file_tools_write_real_files(tmp_path, client):
    proj = tmp_path / "my-project"
    r = client.post("/api/workspace/set", json={"path": str(proj)})
    assert r.get_json()["ok"] is True and proj.is_dir()

    assert "Error" not in WriteFileTool(str(proj)).execute({"path": "src/app.py", "content": "print('hi')\n"})
    target = proj / "src" / "app.py"
    assert target.read_text(encoding="utf-8") == "print('hi')\n"

    EditFileTool(str(proj)).execute({"path": "src/app.py", "old_text": "hi", "new_text": "hello"})
    assert "hello" in target.read_text(encoding="utf-8")
    assert "hello" in ReadFileTool(str(proj)).execute({"path": "src/app.py"})

    tree = client.get("/api/workspace/tree").get_json()
    assert "src" in json.dumps(tree)
    client.post("/api/workspace/set", json={"clear": True})


def test_save_code_answer_to_disk(tmp_path):
    files = [{"path": "index.html", "content": "<h1>x</h1>"}, {"path": "css/s.css", "content": "h1{color:red}"}]
    root = workspace.project_dir("chat1", "My Page", "a", base=tmp_path)
    plan = workspace.plan_project(root, files)
    written, _deleted = workspace.apply_project(plan)
    assert written == 2
    assert (root / "index.html").read_text(encoding="utf-8") == "<h1>x</h1>"
    assert (root / "css" / "s.css").is_file()
    assert workspace.zip_dir(root)[:2] == b"PK"


def test_workspace_refuses_path_escape(tmp_path):
    with pytest.raises(Exception):
        workspace._inside(tmp_path, "../outside.txt")


def test_local_mcp_connector_saves_a_real_file(tmp_path, client):
    server = tmp_path / "server.py"
    server.write_text(MCP_SERVER, encoding="utf-8")
    out = tmp_path / "note.txt"
    name = "diskwriter"
    try:
        r = client.post("/api/connectors/cli", json={
            "name": name, "command": f'"{sys.executable}" "{server}"', "connect": True})
        body = r.get_json()
        assert r.status_code == 200, body

        cfg = json.loads(web.connectors._config_path().read_text(encoding="utf-8"))
        assert name in cfg.get("mcpServers", {}), "connector was not saved to mcp.json"

        tool_map = web.CONNECTORS.tool_map()
        alias = next(a for a in tool_map if a.endswith("save_note"))
        reply = web.CONNECTORS.call(alias, {"path": str(out), "text": "from connector"})
        assert "saved" in reply
        assert out.read_text(encoding="utf-8") == "from connector"
    finally:
        web.CONNECTORS.disconnect(name)
        client.post(f"/api/connectors/{name}/delete", json={})
