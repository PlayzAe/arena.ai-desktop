"""
MCP connector configuration and runtime for Arena Desktop.

Connectors are stored in the de-facto ``mcpServers`` JSON format used by MCP
clients.  This version runs STDIO servers locally; remote URL entries are
recognised and reported as unsupported instead of being silently dropped.
Secrets belong only in the user's profile file and are masked in API output.
"""

from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

from arena.config import CONFIG_DIR, ensure_config_dir
from arena.tools.mcp import McpStdioClient

MCP_CONFIG_FILE = CONFIG_DIR / "mcp.json"
_SERVER_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
_SECRET_KEY_RE = re.compile(r"(token|secret|password|passwd|api[-_]?key|auth|credential)", re.I)
_ENV_REF_RE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}|\$([A-Za-z_][A-Za-z0-9_]*)")


def _config_path(path: Optional[Path] = None) -> Path:
    return Path(path).expanduser() if path else MCP_CONFIG_FILE


def ensure_config_file(path: Optional[Path] = None) -> Path:
    target = _config_path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        data = {
            "_arenaPersonalHelp": (
                "Add STDIO MCP servers under mcpServers. Each server needs command, "
                "optional args/env/cwd, and may set disabled=true. Example: "
                "{\"filesystem\":{\"command\":\"npx\",\"args\":[\"-y\","
                "\"@modelcontextprotocol/server-filesystem\",\"C:\\\\Projects\"]}}"
            ),
            "mcpServers": {},
        }
        target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return target


def read_config(path: Optional[Path] = None) -> Dict[str, Any]:
    target = ensure_config_file(path)
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
    except ValueError as e:
        raise ValueError(f"{target} is not valid JSON: {e}") from e
    if not isinstance(data, dict):
        raise ValueError(f"{target} must contain a JSON object")
    servers = data.get("mcpServers")
    if servers is None:
        # Some clients use "servers" as the root key.  Normalise on read, but
        # keep writes in the widely used mcpServers form.
        servers = data.get("servers") if isinstance(data.get("servers"), dict) else {}
        data["mcpServers"] = servers
    if not isinstance(servers, dict):
        raise ValueError("mcpServers must be a JSON object")
    return data


def save_config(data: Dict[str, Any], path: Optional[Path] = None) -> Path:
    target = _config_path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    if not isinstance(data.get("mcpServers"), dict):
        data["mcpServers"] = {}
    tmp = target.with_suffix(target.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(target)
    return target


def validate_server_name(name: str) -> str:
    value = (name or "").strip()
    if not _SERVER_NAME_RE.fullmatch(value):
        raise ValueError("Connector name may contain letters, digits, dot, dash and underscore (max 64).")
    return value


def _sanitize_alias_part(value: str) -> str:
    out = re.sub(r"[^a-z0-9_-]+", "_", str(value or "").lower()).strip("_-")
    return (out or "server")[:48]


def expand_env_value(value: Any, environ: Optional[Dict[str, str]] = None) -> str:
    env = os.environ if environ is None else environ

    def repl(match: re.Match) -> str:
        name = match.group(1) or match.group(3)
        default = match.group(2) or ""
        return str(env.get(name, default))

    return _ENV_REF_RE.sub(repl, str(value))


def expand_env(env: Optional[Dict[str, Any]]) -> Dict[str, str]:
    return {str(k): expand_env_value(v) for k, v in (env or {}).items()}


def mask_env(env: Optional[Dict[str, Any]]) -> Dict[str, str]:
    masked = {}
    for key, value in (env or {}).items():
        text = str(value)
        if _SECRET_KEY_RE.search(str(key)) or _ENV_REF_RE.search(text):
            masked[str(key)] = "••••••" if text else ""
        else:
            masked[str(key)] = text
    return masked


def _mask_command_display(parts: Iterable[str]) -> str:
    display = []
    previous_secret = False
    for part in parts:
        text = str(part)
        if previous_secret:
            display.append("••••••")
            previous_secret = False
            continue
        if re.search(r"(token|secret|password|api[-_]?key|auth)", text, re.I) and "=" in text:
            key, _value = text.split("=", 1)
            display.append(f"{key}=••••••")
            continue
        if re.fullmatch(r"--[A-Za-z0-9_-]*(token|secret|password|api[-_]?key|auth)[A-Za-z0-9_-]*", text, re.I):
            display.append(text)
            previous_secret = True
            continue
        display.append(text)
    try:
        return subprocess.list2cmdline(display) if os.name == "nt" else shlex.join(display)
    except Exception:
        return " ".join(display)


def parse_cli_command(command_line: str) -> Tuple[str, List[str]]:
    text = (command_line or "").strip()
    if not text:
        raise ValueError("Enter an MCP server command.")
    if os.name == "nt":
        parts = [part.strip("\"'") for part in shlex.split(text, posix=False)]
    else:
        parts = shlex.split(text)
    parts = [part for part in parts if part]
    if not parts:
        raise ValueError("Enter an MCP server command.")
    return parts[0], parts[1:]


def normalize_server_entry(name: str, raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError(f"Connector {name!r} must be a JSON object")
    transport_raw = str(raw.get("type") or raw.get("transport") or "").lower()
    url = raw.get("url") or raw.get("uri")
    command = raw.get("command") or raw.get("cmd")
    if url and not command:
        transport = "http"
    elif transport_raw in ("streamable-http", "streamable_http", "http", "sse"):
        transport = "http"
    else:
        transport = "stdio"
    args = raw.get("args") or []
    if isinstance(args, str):
        args = [args]
    if not isinstance(args, list):
        raise ValueError(f"Connector {name!r}: args must be an array")
    env = raw.get("env") or raw.get("envs") or {}
    if not isinstance(env, dict):
        raise ValueError(f"Connector {name!r}: env must be an object")
    enabled = not bool(raw.get("disabled", False))
    if "enabled" in raw:
        enabled = bool(raw.get("enabled"))
    preset = raw.get("x-arena-preset") or raw.get("preset")
    return {
        "name": name,
        "raw": raw,
        "transport": transport,
        "command": str(command) if command else None,
        "args": [str(arg) for arg in args],
        "url": str(url) if url else None,
        "headers": {str(k): str(v) for k, v in (raw.get("headers") or {}).items()} if isinstance(raw.get("headers"), dict) else {},
        "env": {str(k): str(v) for k, v in env.items()},
        "cwd": str(raw.get("cwd")) if raw.get("cwd") else None,
        "enabled": enabled,
        "description": str(raw.get("description") or ""),
        "preset_id": str(preset) if preset else None,
        "source": "official" if preset else "custom",
    }


def configured_servers(path: Optional[Path] = None) -> Dict[str, Dict[str, Any]]:
    data = read_config(path)
    out: Dict[str, Dict[str, Any]] = {}
    for name, raw in (data.get("mcpServers") or {}).items():
        out[str(name)] = normalize_server_entry(str(name), raw)
    return out


def official_presets(workspace: Path) -> List[Dict[str, Any]]:
    """Built-in official/vendor MCP presets, all using local STDIO transport."""
    ws = str(Path(workspace).expanduser())
    memory_file = str((CONFIG_DIR / "mcp-memory.jsonl"))
    return [
        {
            "id": "filesystem", "name": "Filesystem", "vendor": "Model Context Protocol",
            "description": "Files inside the selected workspace folder only: list, read, search and write through the official reference server.",
            "requirements": "Node.js (npx)", "docs": "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
            "Fields": [{"key": "path", "label": "Folder to expose", "type": "text", "default": ws}],
            "config": lambda v: {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", v.get("path") or ws]},
        },
        {
            "id": "git", "name": "Git", "vendor": "Model Context Protocol",
            "description": "History, status, diff, branches and commits of a local Git repository.",
            "requirements": "uv (uvx), Git", "docs": "https://github.com/modelcontextprotocol/servers/tree/main/src/git",
            "Fields": [{"key": "path", "label": "Repository folder", "type": "text", "default": ws}],
            "config": lambda v: {"command": "uvx", "args": ["mcp-server-git", "--repository", v.get("path") or ws]},
        },
        {
            "id": "fetch", "name": "Fetch", "vendor": "Model Context Protocol",
            "description": "Fetches web pages and converts them to text/Markdown for the agent.",
            "requirements": "uv (uvx)", "docs": "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
            "Fields": [], "config": lambda v: {"command": "uvx", "args": ["mcp-server-fetch"]},
        },
        {
            "id": "memory", "name": "Memory", "vendor": "Model Context Protocol",
            "description": "Local long-term memory as a knowledge graph. The file is stored in the Arena Desktop profile.",
            "requirements": "Node.js (npx)", "docs": "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
            "Fields": [], "config": lambda v: {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-memory"],
                                               "env": {"MEMORY_FILE_PATH": memory_file}},
        },
        {
            "id": "time", "name": "Time", "vendor": "Model Context Protocol",
            "description": "Current time and time-zone conversion.",
            "requirements": "uv (uvx)", "docs": "https://github.com/modelcontextprotocol/servers/tree/main/src/time",
            "Fields": [], "config": lambda v: {"command": "uvx", "args": ["mcp-server-time"]},
        },
        {
            "id": "sequential_thinking", "name": "Sequential Thinking", "vendor": "Model Context Protocol",
            "description": "Structured step-by-step reasoning and plan revisions through a dedicated tool.",
            "requirements": "Node.js (npx)", "docs": "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
            "Fields": [], "config": lambda v: {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]},
        },
        {
            "id": "everything", "name": "Everything (demo MCP)", "vendor": "Model Context Protocol",
            "description": "Official test server for checking MCP: echo, resources, prompts and sample tools.",
            "requirements": "Node.js (npx)", "docs": "https://github.com/modelcontextprotocol/servers/tree/main/src/everything",
            "Fields": [], "config": lambda v: {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-everything"]},
        },
        {
            "id": "github", "name": "GitHub", "vendor": "GitHub",
            "description": "Official GitHub MCP Server: repositories, issues, pull requests, Actions and code. Read-only is on by default.",
            "requirements": "Docker; GitHub Personal Access Token", "docs": "https://github.com/github/github-mcp-server",
            "Fields": [
                {"key": "token", "label": "GitHub Personal Access Token", "type": "password", "required": False,
                 "help": "If left empty, the GITHUB_PERSONAL_ACCESS_TOKEN environment variable is used."},
                {"key": "read_only", "label": "Read-only (recommended)", "type": "checkbox", "default": True},
            ],
            "config": lambda v: {
                "command": "docker",
                "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
                         *( ["-e", "GITHUB_READ_ONLY=1"] if v.get("read_only", True) else []),
                         "ghcr.io/github/github-mcp-server"],
                "env": {"GITHUB_PERSONAL_ACCESS_TOKEN": v.get("token") or "${GITHUB_PERSONAL_ACCESS_TOKEN}"},
            },
        },
        {
            "id": "playwright", "name": "Playwright", "vendor": "Microsoft",
            "description": "Official browser MCP from Microsoft: navigation, clicks, forms, snapshots and web UI checks.",
            "requirements": "Node.js (npx)", "docs": "https://github.com/microsoft/playwright-mcp",
            "Fields": [], "config": lambda v: {"command": "npx", "args": ["-y", "@playwright/mcp@latest"]},
        },
    ]


def _public_preset(preset: Dict[str, Any], installed: bool) -> Dict[str, Any]:
    return {
        "id": preset["id"], "name": preset["name"], "vendor": preset.get("vendor", ""),
        "description": preset.get("description", ""), "requirements": preset.get("requirements", ""),
        "docs": preset.get("docs", ""), "Fields": preset.get("Fields", []), "installed": bool(installed),
    }


def build_preset_entry(preset_id: str, workspace: Path, values: Optional[Dict[str, Any]] = None) -> Tuple[str, Dict[str, Any]]:
    values = values or {}
    for preset in official_presets(workspace):
        if preset["id"] == preset_id:
            entry = dict(preset["config"](values))
            entry.update({
                "description": preset.get("description", ""),
                "x-arena-preset": preset_id,
            })
            return preset_id, entry
    raise ValueError(f"Unknown official connector: {preset_id}")


class ConnectorManager:
    def __init__(self, workspace_provider: Callable[[], Path], config_path: Optional[Path] = None):
        self._workspace_provider = workspace_provider
        self._config_path = _config_path(config_path)
        self._clients: Dict[str, McpStdioClient] = {}
        self._signatures: Dict[str, str] = {}
        self._errors: Dict[str, str] = {}
        self._lock = threading.RLock()

    @property
    def config_path(self) -> Path:
        return self._config_path

    def _servers(self) -> Dict[str, Dict[str, Any]]:
        return configured_servers(self._config_path)

    @staticmethod
    def _signature(server: Dict[str, Any]) -> str:
        raw = server.get("raw") or {}
        return json.dumps(raw, ensure_ascii=False, sort_keys=True, default=str)

    def _drop_stale(self, servers: Dict[str, Dict[str, Any]]) -> None:
        for name in list(self._clients):
            server = servers.get(name)
            if server is None or not server.get("enabled") \
                    or self._signatures.get(name) != self._signature(server):
                self.disconnect(name)

    def list(self) -> Dict[str, Any]:
        ensure_config_dir()
        try:
            servers = self._servers()
            config_error = None
        except ValueError as e:
            servers, config_error = {}, str(e)
        with self._lock:
            if not config_error:
                self._drop_stale(servers)
            summaries = [self._summary(server) for server in servers.values()]
        workspace = self._workspace_provider()
        installed_ids = {s.get("preset_id") for s in servers.values()}
        return {
            "ok": config_error is None,
            "config_path": str(self._config_path),
            "config_error": config_error,
            "servers": summaries,
            "presets": [_public_preset(p, p["id"] in installed_ids or p["id"] in servers)
                        for p in official_presets(workspace)],
            "transports": {"stdio": True, "http": True},
        }

    def _summary(self, server: Dict[str, Any]) -> Dict[str, Any]:
        name = server["name"]
        client = self._clients.get(name)
        running = bool(client and client.process and client.process.poll() is None)
        if client and not running:
            self._errors.setdefault(name, client.last_error or "MCP server exited")
            self._clients.pop(name, None)
            client = None
        if not server["enabled"]:
            status = "disabled"
        elif running:
            status = "connected"
        elif self._errors.get(name):
            status = "error"
        else:
            status = "stopped"
        tools = []
        if client and running:
            tools = [{
                "name": tool.get("name", ""), "description": tool.get("description", ""),
                "input_schema": tool.get("inputSchema") or {}, "annotations": tool.get("annotations") or {},
            } for tool in client.tools]
        command_parts = []
        if server.get("command"):
            command_parts = [server["command"], *server.get("args", [])]
        elif server.get("url"):
            command_parts = [server["url"]]
        return {
            "id": name, "name": name, "transport": server["transport"], "enabled": server["enabled"],
            "running": running, "status": status, "description": server.get("description", ""),
            "source": server.get("source", "custom"), "preset_id": server.get("preset_id"),
            "command_display": _mask_command_display(command_parts), "cwd": server.get("cwd"),
            "env_keys": list((server.get("env") or {}).keys()), "env": mask_env(server.get("env")),
            "tools": tools, "tools_count": len(tools),
            "error": self._errors.get(name) or (client.last_error if client else None),
            "server_info": client.server_info if client else {},
        }

    def connect(self, name: str, timeout: float = 45.0) -> Dict[str, Any]:
        servers = self._servers()
        server = servers.get(name)
        if server is None:
            raise KeyError(f"Connector not found: {name}")
        if not server["enabled"]:
            raise ValueError("Connector is disabled in mcp.json")
        if server["transport"] == "http":
            if not server.get("url"):
                raise ValueError("HTTP connector has no url")
            with self._lock:
                existing = self._clients.get(name)
                if existing and existing.process and existing.process.poll() is None \
                        and self._signatures.get(name) == self._signature(server):
                    return self._summary(server)
                self.disconnect(name)
                from arena.tools.mcp import McpHttpClient
                client = McpHttpClient(expand_env_value(server["url"]),
                                       {k: expand_env_value(v) for k, v in (server.get("headers") or {}).items()})
                if client.start(timeout=timeout):
                    self._clients[name] = client
                    self._signatures[name] = self._signature(server)
                    self._errors.pop(name, None)
                else:
                    self._errors[name] = client.last_error or "MCP server did not answer"
                return self._summary(server)
        if not server.get("command"):
            raise ValueError("STDIO connector has no command")
        with self._lock:
            existing = self._clients.get(name)
            if existing and existing.process and existing.process.poll() is None \
                    and self._signatures.get(name) == self._signature(server):
                return self._summary(server)
            self.disconnect(name)
            command = [expand_env_value(server["command"]), *[expand_env_value(arg) for arg in server.get("args", [])]]
            cwd = expand_env_value(server["cwd"]) if server.get("cwd") else str(self._workspace_provider())
            client = McpStdioClient(command=command, env=expand_env(server.get("env")), cwd=cwd)
            ok = client.start(timeout=timeout)
            if ok:
                self._clients[name] = client
                self._signatures[name] = self._signature(server)
                self._errors.pop(name, None)
            else:
                self._errors[name] = client.last_error or "MCP server did not start"
            return self._summary(server)

    def disconnect(self, name: str) -> None:
        client = self._clients.pop(name, None)
        self._signatures.pop(name, None)
        if client:
            client.stop()

    def set_enabled(self, name: str, enabled: bool) -> Dict[str, Any]:
        data = read_config(self._config_path)
        servers = data.setdefault("mcpServers", {})
        if name not in servers:
            raise KeyError(f"Connector not found: {name}")
        entry = servers[name]
        if not isinstance(entry, dict):
            raise ValueError("Connector entry must be a JSON object")
        entry["disabled"] = not bool(enabled)
        entry.pop("enabled", None)
        save_config(data, self._config_path)
        if not enabled:
            with self._lock:
                self.disconnect(name)
        return self.list()

    def remove(self, name: str) -> Dict[str, Any]:
        data = read_config(self._config_path)
        servers = data.setdefault("mcpServers", {})
        if name not in servers:
            raise KeyError(f"Connector not found: {name}")
        with self._lock:
            self.disconnect(name)
        servers.pop(name, None)
        save_config(data, self._config_path)
        self._errors.pop(name, None)
        return self.list()

    def add_entry(self, name: str, entry: Dict[str, Any], overwrite: bool = False) -> Dict[str, Any]:
        name = validate_server_name(name)
        data = read_config(self._config_path)
        servers = data.setdefault("mcpServers", {})
        if name in servers and not overwrite:
            raise ValueError(f"Connector already exists: {name}")
        normalize_server_entry(name, entry)
        with self._lock:
            self.disconnect(name)
        servers[name] = entry
        save_config(data, self._config_path)
        self._errors.pop(name, None)
        return self.list()

    def add_cli(self, name: str, command_line: str, env: Optional[Dict[str, Any]] = None,
                cwd: Optional[str] = None, description: str = "") -> Dict[str, Any]:
        command, args = parse_cli_command(command_line)
        entry: Dict[str, Any] = {"command": command, "args": args}
        if env:
            entry["env"] = {str(k): str(v) for k, v in env.items()}
        if cwd:
            entry["cwd"] = cwd
        if description:
            entry["description"] = description
        return self.add_entry(name, entry, overwrite=False)

    def install_preset(self, preset_id: str, values: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        name, entry = build_preset_entry(preset_id, self._workspace_provider(), values or {})
        return self.add_entry(name, entry, overwrite=False)

    def ensure_started(self, timeout: float = 30.0) -> Dict[str, Dict[str, Any]]:
        try:
            servers = self._servers()
        except ValueError:
            return {}
        for server in servers.values():
            if server.get("enabled") and server.get("transport") in ("stdio", "http"):
                try:
                    self.connect(server["name"], timeout=timeout)
                except Exception:
                    continue
        return self.tool_map()

    def tool_map(self) -> Dict[str, Dict[str, Any]]:
        with self._lock:
            servers = {}
            try:
                servers = self._servers()
            except ValueError:
                pass
            self._drop_stale(servers)
            out: Dict[str, Dict[str, Any]] = {}
            for server_name, client in list(self._clients.items()):
                if not client.process or client.process.poll() is not None:
                    self._errors[server_name] = client.last_error or "MCP server exited"
                    self._clients.pop(server_name, None)
                    continue
                for tool in client.tools:
                    original = str(tool.get("name") or "")
                    if not original:
                        continue
                    alias = f"mcp__{_sanitize_alias_part(server_name)}__{_sanitize_alias_part(original)}"
                    base_alias, n = alias, 2
                    while alias in out:
                        alias = f"{base_alias}_{n}"
                        n += 1
                    out[alias] = {
                        "alias": alias, "server": server_name, "tool": original,
                        "description": tool.get("description") or "",
                        "input_schema": tool.get("inputSchema") or {},
                        "annotations": tool.get("annotations") or {},
                        "client": client,
                    }
            return out

    def call(self, alias: str, arguments: Dict[str, Any]) -> str:
        entry = self.tool_map().get(alias)
        if entry is None:
            # A server may have been enabled after the map was built.
            entry = self.ensure_started().get(alias)
        if entry is None:
            raise KeyError(f"MCP tool is not available: {alias}")
        return entry["client"].call_tool(entry["tool"], arguments or {}, timeout=90)

    @staticmethod
    def guide(tool_map: Dict[str, Dict[str, Any]], limit: int = 14000) -> str:
        if not tool_map:
            return ""
        lines = [
            "\nExternal MCP connector tools are also available. Call one exactly like this, with valid JSON inside <arguments>:",
            "<tool name=\"mcp__server__tool\"><arguments>{\"argument\": \"value\"}</arguments></tool>",
        ]
        for alias, item in tool_map.items():
            schema = json.dumps(item.get("input_schema") or {}, ensure_ascii=False, separators=(",", ":"))
            if len(schema) > 900:
                schema = schema[:900] + "…"
            desc = " ".join(str(item.get("description") or "").split())[:500]
            lines.append(f"- {alias}: {desc}\n  inputSchema: {schema}")
            if sum(len(x) + 1 for x in lines) > limit:
                lines.append("- … more MCP tools omitted from this prompt; use the tools listed above.")
                break
        return "\n".join(lines) + "\n"

    def shutdown(self) -> None:
        with self._lock:
            for name in list(self._clients):
                self.disconnect(name)


def open_config_file(path: Optional[Path] = None) -> Path:
    target = ensure_config_file(path)
    if os.name == "nt":
        os.startfile(str(target))  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(target)])
    else:
        subprocess.Popen(["xdg-open", str(target)])
    return target
