"""
MCP (Model Context Protocol) Client integration.
Connects to external MCP servers (STDIO transport) such as Brave Search MCP.
"""

import json
import os
import shutil
import subprocess
import threading
import time
from collections import deque
from typing import Dict, Any, List, Optional
from pathlib import Path

from arena.tools.base import BaseTool


class McpStdioClient:
    """Lightweight STDIO client for MCP servers implementing JSON-RPC 2.0."""

    def __init__(self, command: List[str], env: Optional[Dict[str, str]] = None, cwd: Optional[str] = None):
        self.command = command
        self.env = {**os.environ, **(env or {})}
        self.cwd = cwd
        self.process: Optional[subprocess.Popen] = None
        self._req_id = 0
        self._lock = threading.Lock()
        self._responses: Dict[int, Any] = {}
        self._reader_thread: Optional[threading.Thread] = None
        self._stderr_thread: Optional[threading.Thread] = None
        self._io_lock = threading.RLock()
        self._running = False
        self.tools: List[Dict[str, Any]] = []
        self.last_error: Optional[str] = None
        self.server_info: Dict[str, Any] = {}
        self.stderr_tail: deque = deque(maxlen=30)

    @staticmethod
    def _resolved_command(command: List[str]) -> List[str]:
        if not command:
            return command
        exe = shutil.which(command[0]) or command[0]
        # npm/uv launchers on Windows are often .cmd shims.  CreateProcess
        # cannot reliably execute those directly, so route them through cmd.
        if os.name == "nt" and str(exe).lower().endswith((".cmd", ".bat")):
            return [os.environ.get("COMSPEC", "cmd.exe"), "/d", "/c", str(exe), *command[1:]]
        return [str(exe), *command[1:]]

    def start(self, timeout: float = 30.0) -> bool:
        """Spawn the MCP server process and initialize."""
        self.last_error = None
        try:
            if not self.command:
                raise ValueError("empty MCP command")
            if not shutil.which(self.command[0]) and not Path(self.command[0]).exists():
                raise FileNotFoundError(f"command not found: {self.command[0]}")
            self.process = subprocess.Popen(
                self._resolved_command(self.command),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                cwd=self.cwd,
                env=self.env,
            )
            self._running = True
            self._reader_thread = threading.Thread(target=self._read_loop, daemon=True)
            self._reader_thread.start()
            self._stderr_thread = threading.Thread(target=self._stderr_loop, daemon=True)
            self._stderr_thread.start()

            init_res = self.send_request("initialize", {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "arena-personal", "version": "1.0.0"}
            }, timeout=timeout)
            if not init_res or "error" in init_res:
                detail = (init_res or {}).get("error") if isinstance(init_res, dict) else None
                raise RuntimeError(f"MCP initialize failed: {detail or self._failure_hint('timed out')}")
            self.server_info = init_res.get("serverInfo") if isinstance(init_res.get("serverInfo"), dict) else {}

            self.send_notification("notifications/initialized", {})
            tools: List[Dict[str, Any]] = []
            cursor = None
            for _page in range(20):
                params = {"cursor": cursor} if cursor else {}
                tools_res = self.send_request("tools/list", params, timeout=timeout)
                if not tools_res or "error" in tools_res:
                    detail = (tools_res or {}).get("error") if isinstance(tools_res, dict) else None
                    raise RuntimeError(f"MCP tools/list failed: {detail or self._failure_hint('timed out')}")
                tools.extend(tools_res.get("tools") or [])
                cursor = tools_res.get("nextCursor")
                if not cursor:
                    break
            self.tools = [tool for tool in tools if isinstance(tool, dict) and tool.get("name")]
            return True
        except Exception as e:
            self.last_error = f"{type(e).__name__}: {e}"
            tail = " | ".join(list(self.stderr_tail)[-3:])
            if tail and tail not in self.last_error:
                self.last_error += f" | stderr: {tail}"
            self.stop()
            return False

    def _failure_hint(self, fallback: str) -> str:
        if self.process and self.process.poll() is not None:
            return f"server exited with code {self.process.returncode}"
        return fallback

    def _stderr_loop(self) -> None:
        while self._running and self.process and self.process.stderr:
            try:
                line = self.process.stderr.readline()
            except Exception:
                break
            if not line:
                break
            line = line.strip()
            if line:
                self.stderr_tail.append(line[-500:])

    def _read_loop(self) -> None:
        """Background thread reading JSON-RPC responses from stdout."""
        while self._running and self.process and self.process.stdout:
            try:
                line = self.process.stdout.readline()
                if not line:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                    if "id" in msg:
                        with self._lock:
                            self._responses[msg["id"]] = msg
                except Exception:
                    pass
            except Exception:
                break

    def send_request(self, method: str, params: Dict[str, Any], timeout: float = 15.0) -> Optional[Dict[str, Any]]:
        with self._io_lock:
            return self._send_request_locked(method, params, timeout)

    def _send_request_locked(self, method: str, params: Dict[str, Any], timeout: float = 15.0) -> Optional[Dict[str, Any]]:
        """Send a synchronous JSON-RPC request and await response."""
        with self._lock:
            self._req_id += 1
            req_id = self._req_id

        msg = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method,
            "params": params,
        }

        try:
            payload = json.dumps(msg) + "\n"
            if self.process and self.process.stdin:
                self.process.stdin.write(payload)
                self.process.stdin.flush()
        except Exception:
            return None

        # Poll for response
        start_time = time.time()
        while time.time() - start_time < timeout:
            with self._lock:
                if req_id in self._responses:
                    resp = self._responses.pop(req_id)
                    if "result" in resp:
                        return resp["result"]
                    if "error" in resp:
                        return {"error": resp["error"]}
                    return resp
            time.sleep(0.05)

        return None

    def send_notification(self, method: str, params: Dict[str, Any]) -> None:
        """Send a JSON-RPC notification."""
        msg = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }
        try:
            payload = json.dumps(msg) + "\n"
            with self._io_lock:
                if self.process and self.process.stdin:
                    self.process.stdin.write(payload)
                    self.process.stdin.flush()
        except Exception:
            pass

    def call_tool(self, tool_name: str, arguments: Dict[str, Any], timeout: float = 60.0) -> str:
        """Call an MCP tool and format response as text."""
        res = self.send_request("tools/call", {
            "name": tool_name,
            "arguments": arguments,
        }, timeout=timeout)

        if not res:
            return f"Error: MCP tool '{tool_name}' timed out. {self.last_error or ''}".strip()
        if "error" in res:
            return f"MCP Error: {res['error']}"

        content_list = res.get("content", [])
        text_outputs = []
        for item in content_list:
            if not isinstance(item, dict):
                text_outputs.append(str(item))
            elif item.get("type") == "text":
                text_outputs.append(item.get("text", ""))
            else:
                text_outputs.append(json.dumps(item, ensure_ascii=False))
        if res.get("structuredContent") is not None:
            text_outputs.append(json.dumps(res["structuredContent"], ensure_ascii=False))
        output = "\n".join(text_outputs) if text_outputs else "(MCP tool returned empty content)"
        return f"MCP Error: {output}" if res.get("isError") else output

    def stop(self) -> None:
        """Shut down the MCP server process."""
        self._running = False
        if self.process:
            try:
                if self.process.stdin:
                    self.process.stdin.close()
            except Exception:
                pass
            try:
                self.process.terminate()
                self.process.wait(timeout=2)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass


class _HttpAlive:
    """Stands in for a process so connector code can ask poll() whether the server is still usable."""

    def __init__(self, owner: "McpHttpClient"):
        self._owner = owner

    def poll(self):
        return None if self._owner._running else 0


class McpHttpClient(McpStdioClient):
    """MCP over HTTP: JSON-RPC POSTs to one URL (streamable HTTP). Replies may be JSON or an SSE stream."""

    def __init__(self, url: str, headers: Optional[Dict[str, str]] = None):
        super().__init__([])
        if not str(url).lower().startswith(("http://", "https://")):
            raise ValueError("MCP url must start with http:// or https://")
        self.url = str(url)
        self.headers = {str(k): str(v) for k, v in (headers or {}).items()}
        self.session_id: Optional[str] = None
        self._http = None

    def start(self, timeout: float = 30.0) -> bool:
        import requests

        self.last_error = None
        self._http = requests.Session()
        self._running = True
        self.process = _HttpAlive(self)
        try:
            init_res = self.send_request("initialize", {
                "protocolVersion": "2024-11-05", "capabilities": {},
                "clientInfo": {"name": "arena-personal", "version": "1.0.0"}}, timeout=timeout)
            if not init_res or "error" in init_res:
                raise RuntimeError(f"MCP initialize failed: {(init_res or {}).get('error') or 'no answer from ' + self.url}")
            self.server_info = init_res.get("serverInfo") if isinstance(init_res.get("serverInfo"), dict) else {}
            self.send_notification("notifications/initialized", {})
            tools: List[Dict[str, Any]] = []
            cursor = None
            for _page in range(20):
                res = self.send_request("tools/list", {"cursor": cursor} if cursor else {}, timeout=timeout)
                if not res or "error" in res:
                    raise RuntimeError(f"MCP tools/list failed: {(res or {}).get('error') or 'no answer'}")
                tools.extend(res.get("tools") or [])
                cursor = res.get("nextCursor")
                if not cursor:
                    break
            self.tools = [t for t in tools if isinstance(t, dict) and t.get("name")]
            return True
        except Exception as e:  # noqa: BLE001 - shown in the connector row
            self.last_error = f"{type(e).__name__}: {e}"
            self.stop()
            return False

    def _post(self, payload: Dict[str, Any], timeout: float):
        headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream", **self.headers}
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        resp = self._http.post(self.url, data=json.dumps(payload), headers=headers, timeout=timeout, stream=True)
        sid = resp.headers.get("Mcp-Session-Id")
        if sid:
            self.session_id = sid
        return resp

    def send_request(self, method: str, params: Dict[str, Any], timeout: float = 15.0) -> Optional[Dict[str, Any]]:
        with self._io_lock:
            with self._lock:
                self._req_id += 1
                req_id = self._req_id
            try:
                resp = self._post({"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}, timeout)
            except Exception as e:  # noqa: BLE001
                self.last_error = f"{type(e).__name__}: {e}"
                return None
            try:
                if resp.status_code >= 400:
                    self.last_error = f"HTTP {resp.status_code} from {self.url}"
                    return None
                message = self._read_message(resp, req_id)
            finally:
                resp.close()
            if not message:
                return None
            if "result" in message:
                return message["result"]
            if "error" in message:
                return {"error": message["error"]}
            return message

    @staticmethod
    def _read_message(resp, req_id: int) -> Optional[Dict[str, Any]]:
        ctype = (resp.headers.get("Content-Type") or "").lower()
        if "text/event-stream" not in ctype:
            try:
                data = resp.json()
            except ValueError:
                return None
            items = data if isinstance(data, list) else [data]
            return next((m for m in items if isinstance(m, dict) and m.get("id") == req_id), None)
        for raw in resp.iter_lines(decode_unicode=True):
            if raw and raw.startswith("data:"):
                try:
                    msg = json.loads(raw[5:].strip())
                except ValueError:
                    continue
                if isinstance(msg, dict) and msg.get("id") == req_id:
                    return msg
        return None

    def send_notification(self, method: str, params: Dict[str, Any]) -> None:
        try:
            self._post({"jsonrpc": "2.0", "method": method, "params": params}, 10).close()
        except Exception:  # noqa: BLE001
            pass

    def stop(self) -> None:
        self._running = False
        try:
            if self._http is not None:
                self._http.close()
        except Exception:  # noqa: BLE001
            pass


class McpToolWrapper(BaseTool):
    """Wraps an MCP tool into an Arena BaseTool."""

    def __init__(self, cwd: str, client: McpStdioClient, tool_info: Dict[str, Any]):
        super().__init__(cwd)
        self.client = client
        self.name = tool_info.get("name", "mcp_tool")
        self.description = tool_info.get("description", "External MCP tool")
        self.input_schema = tool_info.get("inputSchema", {})

    def execute(self, params: Dict[str, Any]) -> str:
        return self.client.call_tool(self.name, params)

