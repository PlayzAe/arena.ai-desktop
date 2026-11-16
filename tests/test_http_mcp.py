import json
import threading
import http.server

import pytest

import arena.web.app as web
from arena import connectors

TOOLS = [{"name": "echo_note", "description": "Echo text back",
          "inputSchema": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}}]


class _Handler(http.server.BaseHTTPRequestHandler):
    seen = []

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)))
        _Handler.seen.append((body.get("method"), self.headers.get("Mcp-Session-Id"), self.headers.get("X-Test")))
        mid, method = body.get("id"), body.get("method")
        if mid is None:
            self.send_response(202)
            self.end_headers()
            return
        if method == "initialize":
            result = {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "serverInfo": {"name": "fake", "version": "1"}}
        elif method == "tools/list":
            result = {"tools": TOOLS}
        elif method == "tools/call":
            result = {"content": [{"type": "text", "text": "echo: " + body["params"]["arguments"]["text"]}]}
        else:
            result = {}
        payload = json.dumps({"jsonrpc": "2.0", "id": mid, "result": result})
        sse = method == "tools/call"  # tool calls answer as an SSE stream, the rest as plain JSON
        data = (f"event: message\ndata: {payload}\n\n" if sse else payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream" if sse else "application/json")
        self.send_header("Mcp-Session-Id", "sess-1")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


@pytest.fixture
def server():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    _Handler.seen.clear()
    yield f"http://127.0.0.1:{srv.server_address[1]}/mcp"
    srv.shutdown()


def test_http_mcp_connects_lists_tools_and_calls_them(server):
    web.connectors.save_config({"mcpServers": {"fakehttp": {"url": server, "headers": {"X-Test": "yes"}}}})
    try:
        summary = web.CONNECTORS.connect("fakehttp", timeout=10)
        assert summary["status"] == "connected" and summary["tools_count"] == 1
        assert summary["server_info"]["name"] == "fake"
        alias = next(a for a, e in web.CONNECTORS.tool_map().items() if e["tool"] == "echo_note")
        assert web.CONNECTORS.call(alias, {"text": "hi"}) == "echo: hi"
        # the session id from initialize is echoed back, and custom headers are sent
        assert ("tools/call", "sess-1", "yes") in _Handler.seen
    finally:
        web.CONNECTORS.disconnect("fakehttp")
        web.connectors.save_config({"mcpServers": {}})


def test_unreachable_http_server_reports_an_error_not_a_hang():
    web.connectors.save_config({"mcpServers": {"nothere": {"url": "http://127.0.0.1:9/mcp"}}})
    try:
        summary = web.CONNECTORS.connect("nothere", timeout=3)
        assert summary["status"] == "error" and summary["error"]
    finally:
        web.connectors.save_config({"mcpServers": {}})
