"""
Agent mode: one model works on a local folder through tools the app runs.

The model asks for tools with XML tags in its reply. The app runs each one
under the current permission mode and sends the results back as the next
message; arena.ai keeps the conversation, so the guide is sent only once.
"""

import difflib
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Tuple

MAX_ROUNDS = 8
OUTPUT_LIMIT = 6000
_TOOL_RE = re.compile(r"<tool\s+name\s*=\s*[\"']([\w-]+)[\"']\s*>(.*?)</tool\s*>", re.S | re.I)
_PARAM_RE = re.compile(r"<([a-z_]+)>(.*?)</\1\s*>", re.S | re.I)
_SKIP = {".git", "node_modules", "__pycache__", ".venv", "venv", ".next", "dist", "build"}

GUIDE = """You are working as a coding agent inside Arena Desktop, on the user's own computer.
Project folder: {root}
Permission mode: {mode_label}. {mode_note}

Use tools by writing XML tags in your reply. The app runs them in order and sends you the results.
<tool name="ls"><path>.</path></tool>
<tool name="read_file"><path>src/main.py</path></tool>
<tool name="search"><pattern>def main</pattern><path>.</path></tool>
<tool name="write_file"><path>index.html</path><content>
FULL FILE CONTENT
</content></tool>
<tool name="edit_file"><path>index.html</path><old_text>exact text to replace</old_text><new_text>replacement</new_text></tool>
<tool name="mkdir"><path>assets/img</path></tool>
<tool name="delete"><path>old_notes.txt</path></tool>
<tool name="run_cmd"><cmd>python -m pytest -q</cmd></tool>

Rules: paths are relative to the project folder. Read a file before editing it. Do not wrap tool tags in code fences. When the task is done, reply with a short summary and no tool tags."""

MODE_NOTES = {
    "plan": "Plan mode is on: only ls, read_file and search will run. Do not change anything; "
            "finish with a numbered plan the user can approve.",
    "default": "The user approves each change and command.",
    "acceptEdits": "File edits run without asking; deletes and commands need approval.",
    "auto": "Work inside the project folder runs without asking; risky commands need approval.",
    "bypassPermissions": "All tools run without asking.",
}


def parse_tool_calls(text: str) -> List[Dict[str, Any]]:
    calls = []
    for m in _TOOL_RE.finditer(text or ""):
        params = {p.group(1).lower(): p.group(2) for p in _PARAM_RE.finditer(m.group(2))}
        calls.append({"name": m.group(1).lower(), "params": params})
    return calls


def strip_tool_calls(text: str) -> str:
    return _TOOL_RE.sub("", text or "")


def _body(text: str) -> str:
    """Content between tags, minus the newline that follows the opening tag."""
    if text.startswith("\r\n"):
        return text[2:]
    if text.startswith("\n"):
        return text[1:]
    return text


def _read(path: Path) -> str:
    with path.open(encoding="utf-8", errors="replace", newline="") as f:
        return f.read()


def _diff(old: str, new: str, name: str, limit: int = 80) -> str:
    lines = list(difflib.unified_diff(old.splitlines(), new.splitlines(), f"a/{name}", f"b/{name}", lineterm="", n=2))
    if len(lines) > limit:
        lines = lines[:limit] + [f"... {len(lines) - limit} more diff lines"]
    return "\n".join(lines)


def format_results(outcomes) -> str:
    lines = ["Tool results:"]
    for i, (call, status, output) in enumerate(outcomes, 1):
        target = call["params"].get("path") or call["params"].get("cmd") or ""
        lines.append(f"[{i}] {call['name']} {target}: {status}")
        if output:
            lines.append(str(output)[:OUTPUT_LIMIT])
    lines.append("Continue the task. When it is complete, reply with a short summary and no tool tags.")
    return "\n".join(lines)


class LocalTools:
    """Runs agent tools against one project folder."""

    def __init__(self, root):
        self.root = Path(root).expanduser().resolve()

    def resolve(self, rel: str) -> Tuple[Path, bool]:
        rel = (rel or ".").strip().strip("\"'") or "."
        p = Path(rel).expanduser()
        target = (p if p.is_absolute() else self.root / p).resolve()
        return target, target == self.root or self.root in target.parents

    def _rel(self, target: Path) -> str:
        try:
            return target.relative_to(self.root).as_posix() or "."
        except ValueError:
            return str(target)

    def describe(self, call: Dict[str, Any]) -> Dict[str, Any]:
        """What a call would do, for the permission card."""
        name, prm = call["name"], call["params"]
        if name == "run_cmd":
            cmd = (prm.get("cmd") or "").strip()
            return {"tool": name, "path": str(self.root), "rel": ".", "inside": True, "command": cmd,
                    "summary": f"Run: {cmd}"}
        target, inside = self.resolve(prm.get("path", "."))
        rel = self._rel(target)
        info = {"tool": name, "path": str(target), "rel": rel, "inside": inside, "summary": f"{name} {rel}"}
        try:
            if name == "write_file":
                new = _body(prm.get("content", ""))
                old = _read(target) if target.is_file() else ""
                verb = "Overwrite" if target.exists() else "Create"
                info["summary"] = f"{verb} {rel} ({new.count(chr(10)) + 1} lines)"
                info["diff"] = _diff(old, new, rel)
            elif name == "edit_file":
                old = _read(target) if target.is_file() else ""
                new = old.replace(prm.get("old_text", ""), prm.get("new_text", ""), 1) if prm.get("old_text") else old
                info["summary"] = f"Edit {rel}"
                info["diff"] = _diff(old, new, rel)
            elif name == "delete":
                if target.is_dir():
                    info["summary"] = f"Delete folder {rel} ({sum(1 for _ in target.rglob('*'))} items)"
                else:
                    info["summary"] = f"Delete {rel}"
            elif name == "mkdir":
                info["summary"] = f"Create folder {rel}"
            elif name in ("read_file", "ls", "search"):
                info["summary"] = {"read_file": "Read", "ls": "List", "search": "Search"}[name] + f" {rel}"
        except OSError:
            pass
        return info

    def run(self, call: Dict[str, Any]) -> Tuple[bool, str]:
        fn = getattr(self, "_t_" + call["name"], None)
        if fn is None:
            return False, (f"Unknown tool '{call['name']}'. Available: ls, read_file, search, write_file, "
                           "edit_file, mkdir, delete, run_cmd.")
        try:
            return True, fn(call["params"])
        except Exception as e:
            return False, f"{type(e).__name__}: {e}"

    def _t_ls(self, prm) -> str:
        target, _ = self.resolve(prm.get("path", "."))
        if not target.is_dir():
            raise NotADirectoryError(f"{self._rel(target)} is not a folder")
        rows = []
        for child in sorted(target.iterdir(), key=lambda c: (not c.is_dir(), c.name.lower()))[:300]:
            rows.append(child.name + "/" if child.is_dir() else f"{child.name}  ({child.stat().st_size} B)")
        return "\n".join(rows) or "(empty folder)"

    def _t_read_file(self, prm) -> str:
        target, _ = self.resolve(prm.get("path", ""))
        if not target.is_file():
            raise FileNotFoundError(f"{self._rel(target)} does not exist")
        if target.stat().st_size > 1_000_000:
            raise ValueError("file is larger than 1 MB")
        text = _read(target)
        return text if len(text) <= 40_000 else text[:40_000] + "\n...[truncated]"

    def _t_search(self, prm) -> str:
        target, _ = self.resolve(prm.get("path", "."))
        pattern = prm.get("pattern", "")
        try:
            rx = re.compile(pattern)
        except re.error:
            rx = re.compile(re.escape(pattern))
        if target.is_file():
            files = [target]
        else:
            files = (p for p in target.rglob("*")
                     if p.is_file() and not (_SKIP & set(p.relative_to(target).parts)))
        hits = []
        for f in files:
            try:
                if f.stat().st_size > 1_000_000:
                    continue
                data = f.read_bytes()
            except OSError:
                continue
            if b"\x00" in data[:1024]:
                continue
            for n, line in enumerate(data.decode("utf-8", "replace").splitlines(), 1):
                if rx.search(line):
                    hits.append(f"{self._rel(f)}:{n}: {line.strip()[:200]}")
                    if len(hits) >= 100:
                        return "\n".join(hits) + "\n...[more matches]"
        return "\n".join(hits) or "no matches"

    def _t_write_file(self, prm) -> str:
        target, _ = self.resolve(prm.get("path", ""))
        if not (prm.get("path") or "").strip() or target == self.root or target.is_dir():
            raise ValueError("write_file needs a file path")
        content = _body(prm.get("content", ""))
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8", newline="")
        return f"Wrote {content.count(chr(10)) + 1} lines to {self._rel(target)}"

    def _t_edit_file(self, prm) -> str:
        target, _ = self.resolve(prm.get("path", ""))
        if not target.is_file():
            raise FileNotFoundError(f"{self._rel(target)} does not exist")
        text = _read(target)
        old, new = prm.get("old_text", ""), prm.get("new_text", "")
        if not old:
            raise ValueError("old_text is empty")
        candidates = [(old, new), (old.strip("\r\n"), new.strip("\r\n"))]
        if "\r\n" in text:
            candidates += [(o.replace("\r\n", "\n").replace("\n", "\r\n"), n.replace("\r\n", "\n").replace("\n", "\r\n"))
                           for o, n in list(candidates)]
        for o, n in candidates:
            count = text.count(o) if o else 0
            if count == 1:
                target.write_text(text.replace(o, n, 1), encoding="utf-8", newline="")
                return f"Edited {self._rel(target)}"
            if count > 1:
                raise ValueError(f"old_text matches {count} places; include more surrounding text")
        raise ValueError("old_text was not found; read the file and copy the exact text")

    def _t_mkdir(self, prm) -> str:
        target, _ = self.resolve(prm.get("path", ""))
        target.mkdir(parents=True, exist_ok=True)
        return f"Folder ready: {self._rel(target)}"

    def _t_delete(self, prm) -> str:
        target, _ = self.resolve(prm.get("path", ""))
        if target == self.root or target in self.root.parents:
            raise PermissionError("refusing to delete the project folder itself")
        if target.is_dir():
            shutil.rmtree(target)
            return f"Deleted folder {self._rel(target)}"
        if target.exists():
            target.unlink()
            return f"Deleted {self._rel(target)}"
        raise FileNotFoundError(f"{self._rel(target)} does not exist")

    def _t_run_cmd(self, prm) -> str:
        cmd = (prm.get("cmd") or "").strip()
        if not cmd:
            raise ValueError("cmd is empty")
        r = subprocess.run(cmd, shell=True, cwd=str(self.root), capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=120)
        out = (r.stdout or "") + (("\n" + r.stderr) if r.stderr else "")
        return f"exit code {r.returncode}\n{out[-OUTPUT_LIMIT:]}".strip()
