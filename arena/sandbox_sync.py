"""Copy what Arena's code sandbox did onto the user's own folder.

The sandbox runs bash, installs npm packages and generates images on Arena's
servers. These helpers redo the safe, file-level part of that locally:
mkdir / cp / mv inside the project folder, public/ images from the preview
host, and `npm install` in the folder. Nothing here runs a shell.
"""
from __future__ import annotations

import os
import re
import shlex
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

PREVIEW_HOST = "{id}.arena.site"
MEDIA_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg", ".ico", ".mp4", ".webm", ".mp3", ".wav", ".ogg", ".woff", ".woff2", ".ttf", ".otf"}
_MSG_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
_NPM_NAME = re.compile(r"^(@[a-z0-9][\w.-]*/)?[a-z0-9][\w.-]*(@[\w.^~<>=*|-]+)?$", re.I)
_OPERATORS = {"&&", ";", "||"}
_UNSAFE = {"|", ">", ">>", "<", "&", "2>", "2>&1", "<<"}


def preview_url(message_id: str, rel: str) -> Optional[str]:
    """Where Arena's preview host serves a sandbox file. Only public/ files are served at the site root.

    message_id arrives on the stream and becomes a hostname label, so the charset
    check keeps it from redirecting the download to another host."""
    mid = (message_id or "").strip()
    rel = (rel or "").replace("\\", "/").lstrip("./")
    if not _MSG_ID.match(mid) or not rel.startswith("public/"):
        return None
    return f"https://{PREVIEW_HOST.format(id=mid)}/{rel[len('public/'):]}"


def is_binary_path(rel: str) -> bool:
    return Path(rel).suffix.lower() in MEDIA_EXT


def inside(root: Path, rel: str) -> Path:
    """Resolve rel under root; ValueError for absolute paths and traversal."""
    root = Path(root).resolve()
    rel = (rel or "").replace("\\", "/")
    if not rel or rel.startswith("/") or re.match(r"^[A-Za-z]:", rel):
        raise ValueError(f"unsafe path: {rel!r}")
    target = (root / rel).resolve()
    if root != target and root not in target.parents:
        raise ValueError(f"unsafe path: {rel!r}")
    return target


def _segments(command: str) -> List[List[str]]:
    """Split a shell line on && ; || into argv lists. Segments with pipes, redirects or expansions are dropped."""
    try:
        lex = shlex.shlex(command, posix=True, punctuation_chars=True)
        lex.whitespace_split = True
        tokens = list(lex)
    except ValueError:
        return []
    out: List[List[str]] = []
    cur: List[str] = []
    bad = False
    for t in tokens + [";"]:
        if t in _OPERATORS:
            if cur and not bad:
                out.append(cur)
            cur, bad = [], False
        elif t in _UNSAFE or "$(" in t or "`" in t or "$" in t or "*" in t or "?" in t:
            bad = True
        else:
            cur.append(t)
    return out


def _npm_segments(command: str) -> List[List[str]]:
    """Like _segments, but pipes and redirects are tolerated: only package names are read from the line."""
    try:
        lex = shlex.shlex(command, posix=True, punctuation_chars=True)
        lex.whitespace_split = True
        tokens = list(lex)
    except ValueError:
        return []
    out: List[List[str]] = []
    cur: List[str] = []
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t in _OPERATORS or t in ("|", "&"):
            if cur:
                out.append(cur)
            cur = []
        elif set(t) <= set("<>&|;") and ("<" in t or ">" in t):
            if cur and cur[-1].isdigit():
                cur.pop()
            i += 1
        else:
            cur.append(t)
        i += 1
    if cur:
        out.append(cur)
    return out


def npm_packages(command: str) -> Optional[List[str]]:
    """None when the command has no `npm install`; else the package names it installs ([] for a bare install)."""
    found = None
    for seg in _npm_segments(command):
        if len(seg) >= 2 and seg[0] in ("npm", "npm.cmd", "pnpm", "yarn") and seg[1] in ("install", "i", "add", "ci"):
            args = seg[2:]
            if any(a in ("-g", "--global") for a in args):
                continue
            names = [a for a in args if not a.startswith("-") and _NPM_NAME.match(a)]
            found = (found or []) + names
    return found


def replay_fs(root: Path, command: str) -> List[Dict[str, str]]:
    """Redo mkdir / cp / mv from a sandbox bash line on the local folder. Returns one result per action."""
    results: List[Dict[str, str]] = []
    root = Path(root).resolve()
    cwd = root
    for seg in _segments(command):
        name, args = seg[0], [a for a in seg[1:]]
        flags = [a for a in args if a.startswith("-")]
        paths = [a for a in args if not a.startswith("-")]
        try:
            if name == "cd" and paths:
                cwd = inside(root, os.path.relpath(inside(cwd, paths[0]), root))
            elif name == "mkdir" and paths:
                for p in paths:
                    inside(cwd, p).mkdir(parents=True, exist_ok=True)
                    results.append({"op": "mkdir", "path": p, "ok": "1"})
            elif name in ("cp", "mv") and len(paths) >= 2:
                *srcs, dst = paths
                dst_p = inside(cwd, dst)
                for s in srcs:
                    src_p = inside(cwd, s)
                    if not src_p.exists():
                        results.append({"op": name, "path": s, "ok": "", "why": "not on your computer"})
                        continue
                    target = dst_p / src_p.name if dst_p.is_dir() or len(srcs) > 1 else dst_p
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if name == "mv":
                        shutil.move(str(src_p), str(target))
                    elif src_p.is_dir():
                        if not any(f in ("-r", "-R", "-a", "-rf", "-fr") for f in flags):
                            results.append({"op": name, "path": s, "ok": "", "why": "directory without -r"})
                            continue
                        shutil.copytree(src_p, target, dirs_exist_ok=True)
                    else:
                        shutil.copyfile(src_p, target)
                    results.append({"op": name, "path": os.path.relpath(target, root).replace("\\", "/"), "ok": "1"})
        except (ValueError, OSError) as e:
            results.append({"op": name, "path": paths[0] if paths else "", "ok": "", "why": str(e)[:100]})
    return results


def find_npm() -> Optional[str]:
    return shutil.which("npm.cmd") or shutil.which("npm")


def run_npm_install(root: Path, packages: List[str], timeout: int = 900) -> Tuple[bool, str]:
    """`npm install [packages]` in root. Package names are validated; no shell is involved."""
    npm = find_npm()
    if not npm:
        return False, "Node.js / npm was not found on this computer. Install Node.js, then run npm install in the folder."
    names = [p for p in packages if _NPM_NAME.match(p)]
    cmd = [npm, "install", "--no-audit", "--no-fund", *names]
    flags = 0x08000000 if os.name == "nt" else 0
    try:
        r = subprocess.run(cmd, cwd=str(root), capture_output=True, text=True, timeout=timeout,
                           creationflags=flags, encoding="utf-8", errors="replace")
    except subprocess.TimeoutExpired:
        return False, f"npm install did not finish in {timeout // 60} minutes."
    except OSError as e:
        return False, f"Could not start npm: {e}"
    tail = "\n".join((r.stdout + "\n" + r.stderr).strip().splitlines()[-6:])
    return r.returncode == 0, tail
