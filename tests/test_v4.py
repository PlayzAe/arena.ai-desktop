"""Focused v4 tests: automatic Agent plumbing, Arena history conversion,
MCP configuration/runtime and MCP argument coercion."""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from arena import agent, connectors, contracts, history_sync  # noqa: E402
from arena.tools.mcp import McpStdioClient  # noqa: E402


def _ids():
    values = iter(range(1000))
    return lambda: f"id-{next(values)}"


def test_build_chat_auto_model_is_the_only_direct_exception():
    _, body = contracts.build_chat(
        eval_id="E", new=True, mode="direct-battle", modality="chat", content="hi",
        ids=_ids(), auto_model=True,
    )
    assert "modelAId" not in body
    with pytest.raises(ValueError):
        contracts.build_chat(
            eval_id="E", new=True, mode="side-by-side", modality="chat", content="hi",
            ids=_ids(), auto_model=True,
        )
    assert contracts.PATHS["history_unified"] == "/api/history/unified"
    assert contracts.PATHS["evaluation"] == "/api/evaluation/{eval_id}"


def test_mcp_argument_parser_preserves_case_and_coerces_schema_types():
    call = agent.parse_tool_calls(
        '<tool name="mcp__demo__echo"><CaseSensitive>Hello</CaseSensitive>'
        '<count>3</count><ratio>1.5</ratio><enabled>yes</enabled>'
        '<items>["a", 2]</items><options>{"nestedCount":"4"}</options></tool>'
    )[0]
    assert call["params"]["CaseSensitive"] == "Hello"
    assert call["params"]["casesensitive"] == "Hello"
    schema = {
        "type": "object",
        "properties": {
            "CaseSensitive": {"type": "string"},
            "count": {"type": "integer"},
            "ratio": {"type": "number"},
            "enabled": {"type": "boolean"},
            "items": {"type": "array"},
            "options": {
                "type": "object",
                "properties": {"nestedCount": {"type": "integer"}},
            },
        },
    }
    assert agent.coerce_mcp_arguments(call, schema) == {
        "CaseSensitive": "Hello", "count": 3, "ratio": 1.5, "enabled": True,
        "items": ["a", 2], "options": {"nestedCount": 4},
    }

    json_call = {"name": "mcp__demo__echo", "params": {"arguments": '{"count":"8","enabled":"false"}'}}
    assert agent.coerce_mcp_arguments(json_call, schema) == {"count": 8, "enabled": False}
    with pytest.raises(ValueError, match="not valid JSON"):
        agent.coerce_mcp_arguments({"params": {"arguments": "{nope"}}, schema)


def test_history_sync_summaries_and_session_grouping():
    assert history_sync.entry_summary({}) is None
    native = history_sync.entry_summary({
        "id": "agent-1", "type": "agentic", "title": "Native",
        "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-02T00:00:00Z",
    })
    assert native["mode"] == "agent" and native["modality"] == "text"

    converted = history_sync.session_to_local({
        "id": "eval-1", "title": "Imported", "mode": "direct-battle",
        "maskedEvaluations": [{"modality": "webdev"}],
        "messages": [
            {"role": "assistant", "participantPosition": "b", "modelId": "m2",
             "createdAt": "2026-01-01T00:00:03Z", "reasoning": "B ",
             "content": [{"type": "reasoning", "text": "thought"}, {"type": "text", "text": "B answer"}]},
            {"role": "user", "createdAt": "2026-01-01T00:00:01Z", "content": "Question",
             "experimental_attachments": [{"name": "cat.png", "url": "https://cdn.test/cat.png",
                                             "contentType": "image/png"}]},
            {"role": "assistant", "participantPosition": "a", "modelId": "m1",
             "createdAt": "2026-01-01T00:00:02Z", "failureReason": "partial failure",
             "content": [{"type": "text", "text": "A answer"}, {"type": "video", "url": "https://cdn.test/a.mp4"}]},
        ],
    }, model_name=lambda model_id: {"m1": "One", "m2": "Two"}.get(model_id))
    assert (converted["mode"], converted["modality"]) == ("direct", "code")
    assert "![cat.png](https://cdn.test/cat.png)" in converted["messages"][0]["text"]
    reply = converted["messages"][1]
    assert reply["text"] == "A answer[Video](https://cdn.test/a.mp4)"
    assert reply["text_b"] == "B answer"
    assert reply["reasoning_b"] == "B thought"
    assert reply["names"] == {"a": "One", "b": "Two"}
    assert reply["error"] == "partial failure"


def test_connector_config_presets_env_and_http_reporting(tmp_path):
    config = tmp_path / "mcp.json"
    created = connectors.ensure_config_file(config)
    data = json.loads(created.read_text(encoding="utf-8"))
    assert data["mcpServers"] == {} and "_arenaPersonalHelp" in data
    assert connectors.expand_env_value("${MISSING:-fallback}", {}) == "fallback"
    assert connectors.parse_cli_command('demo --name "two words"')[1] == ["--name", "two words"]

    name, entry = connectors.build_preset_entry("github", tmp_path, {"read_only": True})
    assert name == "github"
    assert "GITHUB_READ_ONLY=1" in entry["args"]
    assert entry["env"]["GITHUB_PERSONAL_ACCESS_TOKEN"] == "${GITHUB_PERSONAL_ACCESS_TOKEN}"

    manager = connectors.ConnectorManager(lambda: tmp_path, config_path=config)
    manager.add_entry("remote", {"url": "https://example.test/mcp", "type": "streamable-http"})
    summary = {item["name"]: item for item in manager.list()["servers"]}["remote"]
    assert summary["status"] == "stopped" and summary["transport"] == "http"
    connected = manager.connect("remote", timeout=2)  # nothing answers at example.test: an error, never a hang
    assert connected["status"] == "error" and connected["error"]
    with pytest.raises(ValueError, match="already exists"):
        manager.add_entry("remote", {"url": "https://example.test/other"})

    config.write_text("{broken", encoding="utf-8")
    broken = manager.list()
    assert broken["ok"] is False and "not valid JSON" in broken["config_error"]
    assert broken["presets"] and broken["servers"] == []


FAKE_MCP_SERVER = r'''
import json
import sys

print("fake MCP ready", file=sys.stderr, flush=True)
for raw in sys.stdin:
    if not raw.strip():
        continue
    msg = json.loads(raw)
    if "id" not in msg:
        continue
    method = msg.get("method")
    params = msg.get("params") or {}
    if method == "initialize":
        result = {"protocolVersion": "2024-11-05", "serverInfo": {"name": "fake", "version": "1"}}
    elif method == "tools/list":
        if params.get("cursor") == "page-2":
            result = {"tools": [{"name": "structured", "description": "Structured result", "inputSchema": {"type": "object"}}]}
        else:
            result = {
                "tools": [{
                    "name": "echo", "description": "Echo text",
                    "inputSchema": {"type": "object", "properties": {"text": {"type": "string"}}},
                    "annotations": {"readOnlyHint": True},
                }],
                "nextCursor": "page-2",
            }
    elif method == "tools/call":
        if params.get("name") == "structured":
            result = {"content": [], "structuredContent": {"value": 42}}
        else:
            result = {"content": [{"type": "text", "text": "echo:" + str((params.get("arguments") or {}).get("text", ""))}]}
    else:
        result = {}
    print(json.dumps({"jsonrpc": "2.0", "id": msg["id"], "result": result}), flush=True)
'''


def test_stdio_mcp_client_paginates_and_reads_structured_content(tmp_path):
    script = tmp_path / "fake_mcp.py"
    script.write_text(FAKE_MCP_SERVER, encoding="utf-8")
    client = McpStdioClient([sys.executable, str(script)], cwd=str(tmp_path))
    try:
        assert client.start(timeout=10)
        assert client.server_info == {"name": "fake", "version": "1"}
        assert [tool["name"] for tool in client.tools] == ["echo", "structured"]
        assert client.call_tool("echo", {"text": "hello"}, timeout=10) == "echo:hello"
        assert json.loads(client.call_tool("structured", {}, timeout=10)) == {"value": 42}
    finally:
        client.stop()

    missing = McpStdioClient(["arena-personal-no-such-mcp-command"])
    assert not missing.start(timeout=2)
    assert "command not found" in (missing.last_error or "")


def test_connector_manager_runs_stdio_server_and_maps_aliases(tmp_path):
    script = tmp_path / "fake_mcp.py"
    script.write_text(FAKE_MCP_SERVER, encoding="utf-8")
    manager = connectors.ConnectorManager(lambda: tmp_path, config_path=tmp_path / "mcp.json")
    manager.add_entry("Demo.Server", {"command": sys.executable, "args": [str(script)]})
    try:
        summary = manager.connect("Demo.Server", timeout=10)
        assert summary["status"] == "connected" and summary["tools_count"] == 2
        tools = manager.ensure_started(timeout=10)
        assert set(tools) == {"mcp__demo_server__echo", "mcp__demo_server__structured"}
        assert manager.call("mcp__demo_server__echo", {"text": "from manager"}) == "echo:from manager"
        guide = manager.guide(tools)
        assert "mcp__demo_server__echo" in guide and "inputSchema" in guide
    finally:
        manager.shutdown()
