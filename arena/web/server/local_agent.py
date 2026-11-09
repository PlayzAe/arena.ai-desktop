# Arena Desktop web backend, part 8 of 11: local_agent.
# Checkpoints, delegation, parallel research, sub-agents and the local
# tool loop (_agent_run).
#
# Not a standalone module: arena/web/app.py runs the parts in order
# inside its own namespace, so names from earlier parts are in scope.

_ckpt_lock = threading.Lock()


def _invalidate_read_cache(conv, info):
    conv.pop("_output_cache", None)  # listings/searches may have changed too
    cache = conv.get("_read_cache")
    if not cache:
        return
    target = str(info.get("path") or "")
    for key in [k for k in cache if k and k[0] == target]:
        cache.pop(key, None)


def _checkpoint_capture(conv, lane, info):
    """Snapshot files before the agent overwrites/deletes them (once per turn).

    Snapshots land in <base>/.arena-artifacts/checkpoints/<id>/ with a
    manifest; the reply carries the id so the UI can offer one-click Undo.
    Best-effort: any failure just means no undo for that file.
    """
    try:
        target = Path(info.get("path") or "")
        rel = str(info.get("rel") or "")
        if not rel or rel == "." or not str(target):
            return
        with _ckpt_lock:
            state = conv.get(f"_checkpoint_{lane}")
            if state is None:
                ck_id = time.strftime("%Y%m%d-%H%M%S") + "-" + generate_uuidv7()[:8]
                parts = [pt for pt in Path(rel).parts if pt not in (".", "/")]
                base = target
                if all(pt != ".." for pt in parts):
                    for _ in parts:
                        base = base.parent
                else:
                    base = target.parent
                ck_dir = base / ".arena-artifacts" / "checkpoints" / ck_id
                (ck_dir / "files").mkdir(parents=True, exist_ok=True)
                state = {"id": ck_id, "dir": str(ck_dir), "entries": [], "seen": []}
                conv[f"_checkpoint_{lane}"] = state
            targets = []
            if target.is_dir():
                for fp in target.rglob("*"):
                    if fp.is_file():
                        targets.append(fp)
                    if len(targets) >= 200:
                        break
            else:
                targets = [target]
            total = sum(int(e.get("size") or 0) for e in state["entries"])
            for fp in targets:
                key = str(fp)
                if key in state["seen"]:
                    continue
                state["seen"].append(key)
                entry = {"abs": key, "existed": fp.is_file(), "store": None}
                if entry["existed"]:
                    try:
                        size = fp.stat().st_size
                    except OSError:
                        size = 0
                    if total + size <= 20 * 1024 * 1024:
                        store = f"f{len(state['entries'])}"
                        try:
                            (Path(state["dir"]) / "files" / store).write_bytes(fp.read_bytes())
                            entry.update(store=store, size=size)
                            total += size
                        except OSError:
                            entry["skipped"] = "unreadable"
                    else:
                        entry["skipped"] = "checkpoint size cap"
                state["entries"].append(entry)
            manifest = {"id": state["id"], "lane": lane, "chat_id": conv.get("chat_id"),
                        "created": int(time.time()), "entries": state["entries"]}
            (Path(state["dir"]) / "manifest.json").write_text(
                json.dumps(manifest, indent=1), encoding="utf-8")
    except Exception:
        LOG.exception("checkpoint capture failed")


@app.route("/api/checkpoints/<cid>/restore", methods=["POST"])
def api_checkpoint_restore(cid):
    """Undo one agent turn's file changes from its checkpoint snapshot."""
    if not re.fullmatch(r"[A-Za-z0-9-]{6,80}", cid or ""):
        return jsonify({"error": "Bad checkpoint id", "code": "bad_request"}), 400
    ws = _chosen_ws()
    manifest = ck_dir = None
    if ws:
        root = Path(ws)
        for base in (root, root / "option-a", root / "option-b"):
            mpath = base / ".arena-artifacts" / "checkpoints" / cid / "manifest.json"
            if mpath.is_file():
                try:
                    manifest = json.loads(mpath.read_text(encoding="utf-8"))
                    ck_dir = mpath.parent
                except (OSError, ValueError):
                    manifest = None
                break
    if not manifest or ck_dir is None:
        return jsonify({"error": "Checkpoint not found", "code": "gone"}), 404
    restored = removed = 0
    for entry in manifest.get("entries") or []:
        dest = Path(str(entry.get("abs") or ""))
        if not dest.is_absolute():
            continue
        try:
            if entry.get("existed") and entry.get("store"):
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes((ck_dir / "files" / str(entry["store"])).read_bytes())
                restored += 1
            elif not entry.get("existed") and dest.is_file():
                dest.unlink()
                removed += 1
        except OSError:
            LOG.exception("checkpoint restore failed for %s", dest)
    return jsonify({"ok": True, "restored": restored, "removed": removed})


def _delegate_is_research(call) -> bool:
    params = call.get("params") or {}
    return str(params.get("mode") or "research").strip().lower() != "work" or _perm_mode() == "plan"


def _parallel_partner(lane_calls, call, precomputed):
    """Next un-run research delegate_task in this round (for paired execution)."""
    if not _delegate_is_research(call):
        return None
    seen = False
    for other in lane_calls:
        if other is call:
            seen = True
            continue
        if seen and other.get("name") == "delegate_task" and id(other) not in precomputed \
                and _delegate_is_research(other):
            return other
    return None


def _fresh_client(client):
    """Independent ArenaClient for a worker thread (Sessions are not thread-safe)."""
    try:
        clone = ArenaClient(cookie_str=getattr(client, "cookie_str", None))
        clone.session.cookies.update(client.session.cookies)
        clone.active_mode = client.active_mode
        clone.active_modality = client.active_modality
        return clone
    except Exception:
        LOG.exception("client clone failed; sharing the parent client")
        return client


def _run_parallel_research(client, conv, call, partner, lane, child_id, precomputed):
    """Run two read-only sub-agents concurrently; yields SSE events.

    Returns the current call's (ok, status, output, extra); the partner's
    result is stashed in precomputed for the loop to consume when it reaches
    that call.  Work-mode children never come here: writes stay sequential.
    """
    partner_child = generate_uuidv7()
    ptask = str((partner.get("params") or {}).get("task") or "").strip()
    pinfo = {"tool": "delegate_task", "model": lane, "name": "Sub-agent",
             "summary": "Sub-agent: " + (" ".join(ptask.split())[:120] or "task"),
             "child_id": partner_child, "inside": True, "path": ptask[:400]}
    yield _sse(dict(pinfo, type="tool_call"))
    events_q: queue.Queue = queue.Queue()
    results: dict = {}
    parent_tl = {"chat_id": getattr(_tl, "chat_id", None),
                 "stop_event": getattr(_tl, "stop_event", None),
                 "perm_override": getattr(_tl, "perm_override", None)}

    def drive(key, c, cid):
        for k, v in parent_tl.items():
            setattr(_tl, k, v)
        _tl.error = None
        try:
            gen = _run_subagent(_fresh_client(client), conv, c, lane, cid)
            while True:
                try:
                    events_q.put(next(gen))
                except StopIteration as stop:
                    results[key] = stop.value
                    break
        except Exception as e:
            LOG.exception("parallel sub-agent failed")
            results[key] = (False, "error", f"{type(e).__name__}: {e}", {"child_id": cid})
        finally:
            events_q.put(None)

    threads = [threading.Thread(target=drive, args=("a", call, child_id), daemon=True),
               threading.Thread(target=drive, args=("b", partner, partner_child), daemon=True)]
    for t in threads:
        t.start()
    done = idle = 0
    while done < 2:
        try:
            ev = events_q.get(timeout=1)
        except queue.Empty:
            idle += 1
            if idle % 10 == 0:
                yield _sse({"type": "ping"})
            continue
        if ev is None:
            done += 1
        else:
            yield ev
    for t in threads:
        t.join(timeout=5)
    ok_b, status_b, output_b, extra_b = results.get("b") or (
        False, "error", "sub-agent produced no result", {"child_id": partner_child})
    precomputed[id(partner)] = {
        "ok": ok_b, "status": status_b, "output": output_b,
        "step": {"tool": "delegate_task", "summary": pinfo["summary"], "lane": lane,
                 "diff": None, "ok": ok_b, "status": status_b,
                 "child_id": extra_b.get("child_id"), "model": extra_b.get("model"),
                 "mode": extra_b.get("mode")}}
    return results.get("a") or (False, "error", "sub-agent produced no result", {"child_id": child_id})



def _run_children_pair(client, conv: dict, jobs: list, lane: str):
    """Drive two _run_subagent children concurrently, streaming both.

    jobs: exactly two (call, child_id) pairs.  Returns a 2-list of the
    children's (ok, status, output, extra) results, aligned with jobs.
    Mirrors _run_parallel_research's drive loop (fresh client per child,
    thread-local state copied in, events through a queue).
    """
    events_q: queue.Queue = queue.Queue()
    results: dict = {}
    parent_tl = {"chat_id": getattr(_tl, "chat_id", None),
                 "stop_event": getattr(_tl, "stop_event", None),
                 "perm_override": getattr(_tl, "perm_override", None)}

    def drive(index, c, cid):
        for k, v in parent_tl.items():
            setattr(_tl, k, v)
        _tl.error = None
        try:
            gen = _run_subagent(_fresh_client(client), conv, c, lane, cid)
            while True:
                try:
                    events_q.put(next(gen))
                except StopIteration as stop:
                    results[index] = stop.value
                    break
        except Exception as e:
            LOG.exception("parallel fan-out child failed")
            results[index] = (False, "error", f"{type(e).__name__}: {e}", {"child_id": cid})
        finally:
            events_q.put(None)

    threads = [threading.Thread(target=drive, args=(i, jobs[i][0], jobs[i][1]), daemon=True)
               for i in range(2)]
    for t in threads:
        t.start()
    finished = 0
    while finished < 2:
        item = events_q.get()
        if item is None:
            finished += 1
            continue
        yield item
    for t in threads:
        t.join(timeout=5)
    return [results.get(i, (False, "error", "", {})) for i in range(2)]


def _fanout_run(client, message: str, conv: dict, fanout_models: list):
    """Ask several models the same prompt, then summarize the answers.

    Each model answers in its own child chat nested under this one; this
    chat's reply composes all answers plus a short comparison written by
    one more child on Arena's automatic model.  Yields SSE; returns out.
    """
    answers = []
    models = fanout_models[:4]
    i = 0
    while i < len(models) and not _stopped():
        pair = models[i:i + 2]
        i += 2
        jobs, infos = [], []
        for mid in pair:
            child_id = generate_uuidv7()
            call = {"name": "delegate_task",
                    "params": {"task": message, "model": mid, "mode": "research", "fanout": True}}
            info = {"tool": "delegate_task", "model": "a", "name": "Sub-agent",
                    "summary": "Asking " + (_model_name(mid) or "a model"),
                    "child_id": child_id, "inside": True, "path": message[:400]}
            jobs.append((call, child_id))
            infos.append((mid, info))
            yield _sse(dict(info, type="tool_call"))
        if len(jobs) == 2:  # two models at a time - same Arena-friendly cap
            results = yield from _run_children_pair(client, conv, jobs, "a")
        else:
            results = [(yield from _run_subagent(client, conv, jobs[0][0], "a", jobs[0][1]))]
        for (mid, info), (ok, status, output, extra) in zip(infos, results):
            conv.setdefault("tools", []).append(
                {"tool": "delegate_task", "summary": info["summary"], "lane": "a", "diff": None,
                 "ok": ok, "status": status, "child_id": extra.get("child_id"),
                 "model": extra.get("model"), "mode": extra.get("mode")})
            yield _sse({"type": "tool_result", "model": "a", "tool": "delegate_task",
                        "child_id": extra.get("child_id"), "ok": ok, "status": status,
                        "output": (output or "")[:4000]})
            answers.append((extra.get("model") or _model_name(mid) or "Model", output or ""))
    if not answers:
        return {"a": "", "b": ""}
    parts = [f"**{name}**\n\n{(text or '').strip() or '(no answer)'}" for name, text in answers]
    summary = ""
    if len(answers) > 1 and not _stopped():
        child_id = generate_uuidv7()
        blob = "\n\n".join(f"--- Answer from {n} ---\n{(t or '')[:6000]}" for n, t in answers)
        task = ("Compare the answers below to the same user request. Write a brief synthesis: "
                "where they agree, where they differ, and which points look most reliable. "
                "Do not repeat the answers.\n\nUser request:\n" + message + "\n\n" + blob)
        call = {"name": "delegate_task",
                "params": {"task": task, "mode": "research", "fanout": True}}
        info = {"tool": "delegate_task", "model": "a", "name": "Sub-agent",
                "summary": "Comparing the answers", "child_id": child_id,
                "inside": True, "path": task[:400]}
        yield _sse(dict(info, type="tool_call"))
        ok, status, output, extra = yield from _run_subagent(client, conv, call, "a", child_id)
        conv.setdefault("tools", []).append(
            {"tool": "delegate_task", "summary": info["summary"], "lane": "a", "diff": None,
             "ok": ok, "status": status, "child_id": extra.get("child_id"),
             "model": extra.get("model"), "mode": extra.get("mode")})
        yield _sse({"type": "tool_result", "model": "a", "tool": "delegate_task",
                    "child_id": extra.get("child_id"), "ok": ok, "status": status,
                    "output": (output or "")[:4000]})
        summary = (output or "").strip() if ok else ""
    composed = "\n\n---\n\n".join(parts)
    if summary:
        composed += "\n\n---\n\n**Summary**\n\n" + summary
    yield _sse({"type": "text", "model": "a", "text": composed})
    return {"a": composed, "b": ""}

MAX_SUBAGENTS = 3
_subagent_lock = threading.Lock()


def _delegate_models() -> list:
    """[(id, name)] of text models a parent model may pick for a sub-agent."""
    try:
        ids = _allowed_model_ids("direct", "text")
    except Exception:
        ids = set()
    return [(mid, _model_name(mid) or mid) for mid in sorted(ids)[:14]]


_LIGHT_MODEL_TOKENS = ("mini", "flash", "lite", "haiku", "nano")


def _light_model(mid, name) -> bool:
    """Heuristic 'small/fast tier' test - such models usually burn much
    less of Arena's daily balance than frontier flagships."""
    blob = f"{mid} {name}".lower()
    return any(tok in blob for tok in _LIGHT_MODEL_TOKENS)


def _cheap_subagents_on() -> bool:
    try:
        return load_config().get("cheap_subagents", True) is not False
    except Exception:
        return True


def _resolve_delegate_model(raw, mode="research") -> tuple:
    """Resolve a parent's <model> choice to (model_id, display_name, auto)."""
    text = str(raw or "").strip()
    if text:
        low = text.lower()
        models = _delegate_models()
        for mid, name in models:
            if low == str(mid).lower() or low == name.lower():
                return mid, name, False
        for mid, name in models:
            if low in name.lower() or low in str(mid).lower():
                return mid, name, False
    if str(mode or "research").lower() != "work" and _cheap_subagents_on():
        # Research grunt work on a light model by default (v5.1.5): the
        # parent can always name a stronger model explicitly.
        for mid, name in _delegate_models():
            if _light_model(mid, name):
                return mid, name, True
    auto = _auto_agent_model()
    if auto:
        mid = auto.get("model_id", auto.get("id"))
        return mid, (_model_name(mid) or auto.get("name") or "Auto"), True
    return None, "Auto", True


def _run_subagent(client, parent_conv: dict, call: dict, lane: str, child_id: str):
    """Run one delegated sub-agent in its own child chat.

    Yields SSE events for the parent stream (permissions pass through so the
    user can answer them in the parent chat; the child's own text stays in
    the child chat) and returns (ok, status, output, extra) where output is
    the child's final summary \u2014 the only thing the parent model sees.
    Children run sequentially on the parent's thread, so the parent's Stop
    event and permission chat tagging apply to them as well.
    """
    params = call.get("params") or {}
    task = str(params.get("task") or params.get("prompt") or "").strip()
    extra = {"child_id": child_id}
    if not task:
        return False, "error", "delegate_task needs a <task> describing the sub-task.", extra
    smode = str(params.get("mode") or "research").strip().lower()
    if smode not in ("research", "work") or _perm_mode() == "plan":
        smode = "research"
    model_id, model_name, auto = _resolve_delegate_model(
        params.get("model"), "work" if params.get("fanout") else params.get("mode"))
    extra.update({"model": model_name, "mode": smode, "task": task[:300]})
    with _subagent_lock:
        ran = int(parent_conv.get("subagents_run") or 0)
        if ran >= MAX_SUBAGENTS and not (call.get("params") or {}).get("fanout"):
            return False, "error", (f"Sub-agent limit reached ({MAX_SUBAGENTS} per turn). "
                                    "Finish the work yourself or ask the user to continue."), extra
        parent_conv["subagents_run"] = ran + 1
    if params.get("fanout"):
        intro = ("[Arena Desktop] Answer the user's request below directly and completely. "
                 "Your full answer is shown to the user next to other models' answers, so do "
                 "not summarize for a main agent and do not mention being a sub-agent.\n")
    else:
        intro = ("[Arena Desktop] You are a sub-agent handling a delegated task for the main agent "
                 "in a parent chat. Work only on the task below. When you are done, finish with a "
                 "compact structured summary: what you did or found, the files involved (paths and "
                 "line references where useful), and any open questions. Only that summary is "
                 "returned to the main agent.\n")
    if smode == "research":
        intro += "You are read-only: explore and report, do not modify anything.\n"
    child_message = intro + "\nTask:\n" + task
    title = ("Fan-out: " if params.get("fanout") else "Sub-agent: ") + " ".join(task.split())[:44]
    child_history = [{"role": "user", "text": child_message}]
    child_conv = {"eval_id": None, "new": True, "mode": contracts.api_mode("direct"),
                  "modality": contracts.api_modality("text"), "model_a": model_id,
                  "model_b": None, "chat_id": child_id, "auto_model": bool(auto),
                  "reasoning": {"a": "", "b": ""}, "lane_errors": {"a": [], "b": []},
                  "attachments": None, "guide_sent": False, "mcp_guide_hash": None,
                  "memory_hash": None, "title": title, "tools": [],
                  "allow_delegate": False, "delegate_sent": True,
                  "allowed_tools": (set(agent.READ_ONLY_TOOLS) if smode == "research" else None)}
    prefix = ""
    if _memory_enabled():
        block, _hash = _memory_block(_chosen_ws())
        prefix = block or ""
    _generation_started(child_id)
    prev_error = getattr(_tl, "error", None)
    out = {"a": "", "b": ""}
    summary = ""
    child_error = None
    try:
        _save_chat(child_id, title=title, messages=list(child_history), mode="direct",
                   modality="text", model_a=model_id, model_b=None, eval_id=None,
                   parent_id=parent_conv.get("chat_id"))
        yield _sse({"type": "subagent", "status": "started", "child_id": child_id,
                    "task": task[:300], "model_name": model_name, "mode": smode, "lane": lane})
        gen = _agent_run(client, prefix + child_message, child_conv)
        deadline = time.time() + CHILD_TIME_BUDGET
        while True:
            if time.time() > deadline:
                child_error = f"time budget exceeded ({CHILD_TIME_BUDGET // 60} min)"
                try:
                    gen.close()
                except Exception:
                    pass
                break
            try:
                ev = next(gen)
            except StopIteration as stop:
                out = stop.value or out
                break
            if not isinstance(ev, str) or not ev.startswith("data: "):
                continue
            try:
                parsed = json.loads(ev[6:])
            except ValueError:
                continue
            etype = parsed.get("type")
            if etype in ("permission", "permission_done", "ping", "question", "question_done", "todos"):
                yield ev
            elif etype == "notice":
                yield _sse(dict(parsed, subagent=child_id))
            elif etype == "tool_call":
                yield _sse({"type": "subagent", "status": "tool", "child_id": child_id, "lane": lane,
                            "summary": parsed.get("summary") or parsed.get("tool") or ""})
            elif etype == "error":
                child_error = parsed.get("message") or child_error
            # text / reasoning / tool_result / round stay inside the child chat
    except Exception as e:
        child_error = f"{type(e).__name__}: {e}"
        LOG.exception("sub-agent run failed")
    finally:
        _tl.error = prev_error
        summary = agent.strip_tool_calls(out.get("a") or "").strip()
        reply = {"role": "assistant", "text": summary, "text_b": "",
                 "names": {"a": model_name, "b": None}}
        reasoning = (child_conv.get("reasoning") or {}).get("a")
        if reasoning:
            reply["reasoning"] = reasoning
        if child_conv.get("tools"):
            reply["tools"] = child_conv["tools"]
        ckpts = {l: (child_conv.get(f"_checkpoint_{l}") or {}).get("id")
                 for l in ("a", "b") if (child_conv.get(f"_checkpoint_{l}") or {}).get("id")}
        if ckpts:
            reply["checkpoints"] = ckpts
        if child_error and not summary:
            reply["error"] = child_error
        child_history.append(reply)
        try:
            _save_chat(child_id, title=title, messages=child_history, mode="direct",
                       modality="text", model_a=model_id, model_b=None,
                       eval_id=(child_conv.get("eval_id") if not child_conv.get("new") else None),
                       tools_guide=True, parent_id=parent_conv.get("chat_id"),
                       mcp_guide_hash=child_conv.get("mcp_guide_hash"))
        except Exception:
            LOG.exception("sub-agent chat save failed")
        _generation_finished(child_id)
    if summary:
        ok, status, output = True, "ok", summary
    else:
        ok, status = False, "error"
        output = (f"The sub-agent finished without a summary"
                  f"{f' ({child_error})' if child_error else ''}. "
                  f"Its chat is saved as \u201c{title}\u201d.")
    yield _sse({"type": "subagent", "status": "done", "child_id": child_id,
                "ok": ok, "model_name": model_name, "mode": smode, "lane": lane})
    if not params.get("fanout"):
        # The parent model needs the id to manage (e.g. delete) this chat.
        output = f"[sub-agent chat: {child_id}]\n{output}"
    return ok, status, output, extra


_BG_STARTED_RE = re.compile(r"Started in the background: id (bg\d+)")


def _dev_server_events(conv: dict, lane: str, output: str):
    """A run_cmd left a server running: show its address in the chat as a
    preview link, and remember it so Stop ends it with the reply."""
    started = _BG_STARTED_RE.search(output)
    if not started:
        return
    conv.setdefault("_bg_ids", []).append(started.group(1))
    seen = conv.setdefault("_dev_urls", [])
    for line in output.splitlines():
        if not line.startswith("Serving at: "):
            continue
        for url in line[len("Serving at: "):].split(", "):
            url = url.strip().replace("://0.0.0.0", "://localhost")
            if url and url not in seen:
                seen.append(url)
                yield _sse({"type": "preview", "model": lane, "url": url, "title": "Dev server"})


def _stop_dev_servers(conv: dict) -> None:
    for bid in conv.pop("_bg_ids", []):
        try:
            agent.BACKGROUND.stop(bid)
        except Exception:
            LOG.warning("could not stop background command %s", bid, exc_info=True)


def _agent_run(client: ArenaClient, message: str, conv: dict):
    """Local tools in a text chat: each model asks for tools and the app runs them under the permission mode.
    In Battle and Side by Side each model writes to its own copy of the folder (option-a, option-b)."""
    root = _workspace_dir()
    root.mkdir(parents=True, exist_ok=True)
    lanes = ("a", "b") if conv["mode"] in ("battle", "side-by-side") else ("a",)
    dual = len(lanes) == 2
    tools = {l: agent.LocalTools(root, root / agent.LANE_DIRS[l] if dual else None) for l in lanes}
    mode = _perm_mode()
    total = {"a": "", "b": ""}
    yield _sse({"type": "agent", "root": str(root), "mode": mode, "dual": dual})
    try:
        mcp_tools = CONNECTORS.ensure_started(timeout=30)
    except Exception as e:
        mcp_tools = {}
        yield _sse({"type": "notice", "text": f"MCP connectors are unavailable for this turn: {e}"})
    mcp_guide = CONNECTORS.guide(mcp_tools)
    if mcp_tools:
        yield _sse({"type": "agent", "stage": f"MCP tools available: {len(mcp_tools)}",
                    "connectors": sorted({item['server'] for item in mcp_tools.values()})})
    mcp_hash = hashlib.sha1(mcp_guide.encode("utf-8")).hexdigest()[:12] if mcp_guide else None
    delegate_section = agent.delegate_guide(_delegate_models()) if conv.get("allow_delegate") else ""
    session_guide = agent.guide(root, permissions.MODES[mode], agent.MODE_NOTES[mode], dual,
                                extra_tools=mcp_guide, delegate=delegate_section)
    # Re-sent if the reply has to move to a fresh arena.ai session midway
    # (arena.ai's per-session token limit): the new session must learn the tools.
    conv["_session_guide"] = session_guide
    if conv["new"] or not conv.get("guide_sent"):
        # Also covers enabling tools mid-conversation (e.g. the Direct tools
        # toggle): the model only learns the tool protocol from this guide.
        content = session_guide + message
        conv["mcp_guide_hash"] = mcp_hash
        if delegate_section:
            conv["delegate_sent"] = True
    elif mcp_guide and mcp_hash != conv.get("mcp_guide_hash"):
        # The connector tool list is only resent when it changed, not on
        # every turn of the conversation.
        content = ("[Arena Desktop] Connector tools available for this turn:\n" + mcp_guide
                   + "\nUser message:\n" + message)
        conv["mcp_guide_hash"] = mcp_hash
        if delegate_section and not conv.get("delegate_sent"):
            content = delegate_section + content
            conv["delegate_sent"] = True
    else:
        content = message
        if delegate_section and not conv.get("delegate_sent"):
            # Chats started before sub-agents existed learn about them once.
            content = ("[Arena Desktop] Sub-agent delegation is now available in this chat:\n"
                       + delegate_section + "\nUser message:\n" + message)
            conv["delegate_sent"] = True
    sig_counts: dict = {}
    key_counts: dict = {}
    loop_notes: list = []
    for rnd in range(1, agent.MAX_ROUNDS + 1):
        out = yield from _turn_auto(client, content, conv)
        if out is None:
            break
        calls = {l: agent.parse_tool_calls(out[l]) for l in lanes}
        for l in lanes:
            total[l] += out[l]
        if not any(calls.values()) or _stopped():
            break
        # Soft anti-loop (v5.1): repeated calls are marked blocked and
        # answered with a warning during execution below - the task is
        # NOT stopped, the model just gets told to change approach.
        blocked: dict = {}  # id(call) -> repeat count
        for l in lanes:
            for call in calls[l]:
                try:
                    sig = json.dumps([call.get("name"), call.get("params") or {}],
                                     sort_keys=True, ensure_ascii=False)
                except (TypeError, ValueError):
                    sig = repr(call)
                sig_counts[sig] = sig_counts.get(sig, 0) + 1
                if sig_counts[sig] >= 4:
                    blocked[id(call)] = max(blocked.get(id(call), 0), sig_counts[sig])
                cparams = call.get("params") or {}
                target_key = (call.get("name") or "tool",
                              str(cparams.get("path") or cparams.get("pattern")
                                  or (cparams.get("cmd") or "")[:40]))
                key_counts[target_key] = key_counts.get(target_key, 0) + 1
                if key_counts[target_key] == 3:
                    loop_notes.append(
                        f"[Arena Desktop] Notice: you have called {target_key[0]} on "
                        f"'{target_key[1]}' three times. If it is not working, change "
                        "approach instead of repeating it.")
                elif key_counts[target_key] >= 5:
                    blocked[id(call)] = max(blocked.get(id(call), 0), key_counts[target_key])
        mode = _perm_mode()
        results = {}
        precomputed: dict = {}
        for l in lanes:
            results[l] = outcomes = []
            for call in calls[l]:
                if _stopped():
                    outcomes.append((call, "skipped: the user pressed Stop", ""))
                    continue
                pre = precomputed.pop(id(call), None)
                if pre is not None:
                    outcomes.append((call, pre["status"], pre["output"]))
                    conv.setdefault("tools", []).append(pre["step"])
                    yield _sse({"type": "tool_result", "model": l, "tool": "delegate_task",
                                "child_id": pre["step"].get("child_id"), "ok": pre["ok"],
                                "status": pre["status"], "output": (pre["output"] or "")[:4000]})
                    continue
                if id(call) in blocked:
                    info = {"tool": call["name"], "model": l, "inside": True,
                            "summary": f"{call['name']} (not run: repeated call)"}
                    yield _sse(dict(info, type="tool_call"))
                    n = blocked[id(call)]
                    ok, status = False, "blocked: repeated call"
                    output = (f"[Arena Desktop] This exact {call['name']} call was NOT run: "
                              f"you have already made it {n} times and the result will not "
                              "change. Stop repeating it - try a different approach, or "
                              "finish the task with what you already have.")
                    outcomes.append((call, status, output))
                    conv.setdefault("tools", []).append(
                        {"tool": call["name"], "summary": info["summary"], "lane": l,
                         "diff": None, "ok": ok, "status": status})
                    yield _sse({"type": "tool_result", "model": l, "tool": call["name"],
                                "ok": ok, "status": status, "output": output[:4000]})
                    continue
                if call["name"] in ("ls", "search"):
                    # Diet (v5.1.5): the same listing/search repeated in one
                    # turn re-bills its whole output as context. Answer from
                    # cache until anything in this turn mutates files.
                    info = dict(tools[l].describe(call), model=l)
                    yield _sse(dict(info, type="tool_call"))
                    try:
                        out_key = json.dumps([call["name"], call.get("params") or {}],
                                             sort_keys=True, ensure_ascii=False)
                    except (TypeError, ValueError):
                        out_key = repr(call)
                    cache = conv.setdefault("_output_cache", {})
                    answer = yield from _permit(mode, call["name"], info)
                    if answer != "allow":
                        ok, output = False, ""
                        status = ("blocked: plan mode is read-only" if mode == "plan"
                                  else "blocked by safety rules") if answer == "blocked" else "denied by the user"
                    elif out_key in cache:
                        ok, status = True, "ok"
                        output = ("[Arena Desktop] Same result as earlier in this turn - "
                                  "not repeated to save context. It has not changed since.")
                    else:
                        ok, output = tools[l].run(call)
                        status = "ok" if ok else "error"
                        if ok:
                            cache[out_key] = True
                    outcomes.append((call, status, output))
                    conv.setdefault("tools", []).append(
                        {"tool": call["name"], "summary": info.get("summary"), "lane": l,
                         "diff": info.get("diff"), "ok": ok, "status": status})
                    yield _sse({"type": "tool_result", "model": l, "tool": call["name"],
                                "rel": info.get("rel"), "ok": ok, "status": status,
                                "output": (output or "")[:4000]})
                    continue
                if call["name"] in ("read_file", "read_files"):
                    rparams = call.get("params") or {}
                    if call["name"] == "read_files":
                        raw_paths = []
                        for key in ("paths", "files"):
                            chunk = str(rparams.get(key) or "")
                            raw_paths += [ln.strip() for ln in chunk.replace(",", "\n").splitlines() if ln.strip()]
                        for i in range(1, 7):
                            v = str(rparams.get(f"path{i}") or "").strip()
                            if v:
                                raw_paths.append(v)
                        if rparams.get("path"):
                            raw_paths.insert(0, str(rparams["path"]).strip())
                        paths = list(dict.fromkeys(raw_paths))[:8]
                    else:
                        paths = [str(rparams.get("path") or "").strip()]
                    ranged = {k: rparams[k] for k in ("start_line", "end_line") if rparams.get(k)}
                    info = dict(tools[l].describe(
                        {"name": "read_file", "params": {"path": paths[0] if paths and paths[0] else "."}}), model=l)
                    info["tool"] = call["name"]
                    if len(paths) > 1:
                        info["summary"] = "Read " + ", ".join(paths)[:160]
                    yield _sse(dict(info, type="tool_call"))
                    if not paths or not paths[0]:
                        ok, status, output = False, "error", (
                            "read_files needs at least one path (one per line inside <paths>).")
                    else:
                        answer = yield from _permit(mode, "read_file", info)
                        if answer != "allow":
                            ok, output = False, ""
                            status = ("blocked: plan mode is read-only" if mode == "plan"
                                      else "blocked by safety rules") if answer == "blocked" else "denied by the user"
                        else:
                            cache = conv.setdefault("_read_cache", {})
                            segments = []
                            any_ok = False
                            for rel in paths:
                                try:
                                    target, _inside = tools[l].resolve(rel)
                                except Exception:
                                    target = None
                                sig = None
                                if target is not None:
                                    try:
                                        st = target.stat()
                                        sig = (st.st_mtime_ns, st.st_size)
                                    except OSError:
                                        sig = None
                                ckey = (str(target), str(ranged.get("start_line") or ""),
                                        str(ranged.get("end_line") or ""))
                                if sig is not None and cache.get(ckey) == sig:
                                    segments.append(f"== {rel} ==\n[unchanged since your last read - content not repeated]"
                                                    if len(paths) > 1 else
                                                    "[unchanged since your last read - content not repeated]")
                                    any_ok = True
                                    continue
                                sub = {"name": "read_file",
                                       "params": dict({"path": rel}, **(ranged if len(paths) == 1 else {}))}
                                sub_ok, sub_out = tools[l].run(sub)
                                if sub_ok and sig is not None:
                                    cache[ckey] = sig
                                any_ok = any_ok or sub_ok
                                segments.append(f"== {rel} ==\n{sub_out}" if len(paths) > 1 else sub_out)
                            ok = any_ok
                            status = "ok" if any_ok else "error"
                            output = "\n\n".join(segments)
                    outcomes.append((call, status, output))
                    conv.setdefault("tools", []).append(
                        {"tool": call["name"], "summary": info.get("summary"), "lane": l,
                         "diff": None, "ok": ok, "status": status})
                    yield _sse({"type": "tool_result", "model": l, "tool": call["name"],
                                "rel": info.get("rel"), "ok": ok, "status": status,
                                "output": (output or "")[:4000]})
                    continue
                if call["name"] == "ask_user":
                    qparams = call.get("params") or {}
                    question = str(qparams.get("question") or "").strip()
                    options = [str(qparams.get(f"option{i}") or "").strip() for i in range(1, 5)]
                    options = [o for o in options if o][:4]
                    custom = str(qparams.get("custom") or "true").strip().lower() not in ("false", "no", "0")
                    info = {"tool": "ask_user", "model": l, "name": "Question",
                            "summary": "Question: " + (" ".join(question.split())[:120] or "…"),
                            "inside": True, "path": question[:400]}
                    yield _sse(dict(info, type="tool_call"))
                    answer_text = ""
                    if not question:
                        ok, status, output = False, "error", "ask_user needs a <question>."
                    else:
                        qid = generate_uuidv7()
                        parent_chat = getattr(_tl, "chat_id", None) or conv.get("chat_id")
                        with _questions_lock:
                            _QUESTIONS[qid] = {
                                "id": qid, "chat_id": parent_chat, "question": question,
                                "options": options, "custom": custom, "lane": l,
                                "subagent": (conv.get("chat_id") if conv.get("chat_id") != parent_chat else None),
                                "answer": None}
                        yield _sse({"type": "question", "id": qid, "lane": l, "model": l,
                                    "question": question, "options": options, "custom": custom,
                                    "chat_id": parent_chat,
                                    "subagent": _QUESTIONS[qid]["subagent"]})
                        _notify("Arena Desktop", "The model is waiting for your answer.", "question")
                        answer_text = yield from _wait_for(lambda qid=qid: _question_answer(qid), QUESTION_TIMEOUT)
                        with _questions_lock:
                            _QUESTIONS.pop(qid, None)
                        yield _sse({"type": "question_done", "id": qid, "lane": l,
                                    "answer": answer_text or ""})
                        if answer_text:
                            ok, status, output = True, "ok", f'The user answered: "{answer_text}"'
                        else:
                            ok, status = False, "timeout"
                            output = ("The user did not answer in time. Proceed with your best "
                                      "judgment and state the assumption you made.")
                            answer_text = ""
                    outcomes.append((call, status, output))
                    conv.setdefault("tools", []).append(
                        {"tool": "ask_user", "summary": info["summary"], "lane": l, "diff": None,
                         "ok": ok, "status": status, "question": question, "options": options,
                         "answer": answer_text})
                    yield _sse({"type": "tool_result", "model": l, "tool": "ask_user",
                                "ok": ok, "status": status, "output": (output or "")[:4000]})
                    continue
                if call["name"] == "propose_plan":
                    pparams = call.get("params") or {}
                    plan_text = str(pparams.get("plan") or pparams.get("content") or pparams.get("text") or "").strip()
                    first_line = " ".join((plan_text.splitlines() or [""])[0].split())[:120]
                    info = {"tool": "propose_plan", "model": l, "name": "Plan",
                            "summary": "Plan: " + (first_line or "\u2026"),
                            "inside": True, "path": plan_text[:400]}
                    yield _sse(dict(info, type="tool_call"))
                    answer_text = ""
                    if not plan_text:
                        ok, status, output = False, "error", "propose_plan needs a <plan> with the steps."
                    else:
                        qid = generate_uuidv7()
                        parent_chat = getattr(_tl, "chat_id", None) or conv.get("chat_id")
                        plan_options = ["Approve plan", "Cancel"]
                        with _questions_lock:
                            _QUESTIONS[qid] = {
                                "id": qid, "chat_id": parent_chat, "kind": "plan",
                                "question": "Proposed plan", "plan": plan_text[:4000],
                                "options": plan_options, "custom": True, "lane": l,
                                "subagent": (conv.get("chat_id") if conv.get("chat_id") != parent_chat else None),
                                "answer": None}
                        yield _sse({"type": "question", "id": qid, "lane": l, "model": l,
                                    "kind": "plan", "question": "Proposed plan", "plan": plan_text[:4000],
                                    "options": plan_options, "custom": True,
                                    "chat_id": parent_chat,
                                    "subagent": _QUESTIONS[qid]["subagent"]})
                        _notify("Arena Desktop", "The model proposed a plan for your review.", "question")
                        answer_text = yield from _wait_for(lambda qid=qid: _question_answer(qid), QUESTION_TIMEOUT)
                        with _questions_lock:
                            _QUESTIONS.pop(qid, None)
                        yield _sse({"type": "question_done", "id": qid, "lane": l,
                                    "answer": answer_text or ""})
                        low = (answer_text or "").strip().lower()
                        if low == "approve plan":
                            ok, status = True, "approved"
                            output = ("The user approved your plan. Execute it now, step by step, "
                                      "keeping the set_todos checklist updated as you go.")
                        elif low == "cancel":
                            ok, status = False, "cancelled"
                            output = ("The user cancelled the plan. Make no changes; reply briefly "
                                      "and ask how they would like to proceed.")
                        elif answer_text:
                            ok, status = True, "revise"
                            output = (f'The user wants changes to the plan: "{answer_text}". '
                                      "Revise the plan accordingly and present it again with "
                                      "propose_plan - do not start editing yet.")
                        else:
                            ok, status = False, "timeout"
                            output = ("The user did not review the plan in time. Do not make changes; "
                                      "reply with the plan as plain text and finish.")
                            answer_text = ""
                    outcomes.append((call, status, output))
                    conv.setdefault("tools", []).append(
                        {"tool": "propose_plan", "summary": info["summary"], "lane": l, "diff": None,
                         "ok": ok, "status": status, "plan": plan_text[:4000], "answer": answer_text})
                    yield _sse({"type": "tool_result", "model": l, "tool": "propose_plan",
                                "ok": ok, "status": status, "output": (output or "")[:4000]})
                    continue
                if call["name"] == "set_todos":
                    tparams = call.get("params") or {}
                    raw = str(tparams.get("todos") or tparams.get("items") or tparams.get("content") or "")
                    items = _parse_todos(raw)
                    done_n = sum(1 for it in items if it["status"] == "done")
                    info = {"tool": "set_todos", "model": l, "name": "Checklist",
                            "summary": f"Checklist: {done_n}/{len(items)} done",
                            "inside": True, "path": raw[:400]}
                    yield _sse(dict(info, type="tool_call"))
                    if not items:
                        ok, status, output = False, "error", (
                            "set_todos needs a <todos> list, one step per line: "
                            "[x] done, [~] in progress, [ ] pending.")
                    else:
                        ok, status = True, "ok"
                        output = f"Checklist updated: {done_n}/{len(items)} done."
                        conv["todos"] = items
                        yield _sse({"type": "todos", "lane": l, "model": l,
                                    "chat_id": conv.get("chat_id"), "items": items})
                    outcomes.append((call, status, output))
                    conv.setdefault("tools", []).append(
                        {"tool": "set_todos", "summary": info["summary"], "lane": l, "diff": None,
                         "ok": ok, "status": status, "todos": items})
                    yield _sse({"type": "tool_result", "model": l, "tool": "set_todos",
                                "ok": ok, "status": status, "output": output})
                    continue
                if call["name"] == "delegate_task":
                    child_id = generate_uuidv7()
                    task_text = str((call.get("params") or {}).get("task") or "").strip()
                    info = {"tool": "delegate_task", "model": l, "name": "Sub-agent",
                            "summary": "Sub-agent: " + (" ".join(task_text.split())[:120] or "task"),
                            "child_id": child_id, "inside": True, "path": task_text[:400]}
                    yield _sse(dict(info, type="tool_call"))
                    if not conv.get("allow_delegate"):
                        ok, status = False, "error"
                        output = "delegate_task is not available inside a sub-agent; do the work directly."
                        extra = {"child_id": child_id}
                    else:
                        partner = _parallel_partner(calls[l], call, precomputed)
                        if partner is not None:
                            ok, status, output, extra = yield from _run_parallel_research(
                                client, conv, call, partner, l, child_id, precomputed)
                        else:
                            ok, status, output, extra = yield from _run_subagent(client, conv, call, l, child_id)
                    outcomes.append((call, status, output))
                    if extra.get("mode") == "work":
                        conv.pop("_output_cache", None)  # child may have edited files
                    conv.setdefault("tools", []).append(
                        {"tool": "delegate_task", "summary": info["summary"], "lane": l,
                         "diff": None, "ok": ok, "status": status,
                         "child_id": extra.get("child_id"), "model": extra.get("model"),
                         "mode": extra.get("mode")})
                    yield _sse({"type": "tool_result", "model": l, "tool": "delegate_task",
                                "child_id": extra.get("child_id"), "ok": ok, "status": status,
                                "output": (output or "")[:4000]})
                    continue
                if call["name"] == "delete_subagent":
                    dparams = call.get("params") or {}
                    target_id = str(dparams.get("child_id") or dparams.get("chat_id")
                                    or dparams.get("id") or "").strip()
                    info = {"tool": "delete_subagent", "model": l, "name": "Sub-agent",
                            "summary": "Delete sub-agent chat", "child_id": target_id,
                            "inside": True, "path": target_id[:64]}
                    yield _sse(dict(info, type="tool_call"))
                    if not conv.get("allow_delegate"):
                        ok, status = False, "error"
                        output = "delete_subagent is not available inside a sub-agent."
                    elif not target_id or not _validate_chat_id(target_id):
                        ok, status = False, "error"
                        output = ("Pass the sub-agent chat id shown at the start of the "
                                  "delegate_task result: <child_id>...</child_id>.")
                    else:
                        child = _load_chat(target_id) or {}
                        if str(child.get("parent_id") or "") != str(conv.get("chat_id") or ""):
                            ok, status = False, "error"
                            output = ("That chat is not one of your sub-agents in this "
                                      "conversation, so it was not deleted.")
                        else:
                            ok, output = _delete_chat_everywhere(client, target_id, child)
                            status = "ok" if ok else "error"
                    outcomes.append((call, status, output))
                    conv.setdefault("tools", []).append(
                        {"tool": "delete_subagent", "summary": info["summary"], "lane": l,
                         "diff": None, "ok": ok, "status": status, "child_id": target_id})
                    yield _sse({"type": "tool_result", "model": l, "tool": "delete_subagent",
                                "child_id": target_id, "ok": ok, "status": status,
                                "output": (output or "")[:4000]})
                    if ok:
                        yield _sse({"type": "chats_changed"})
                    continue
                allowed = conv.get("allowed_tools")
                if allowed is not None and call["name"] not in allowed:
                    entry_ro = mcp_tools.get(call["name"])
                    mcp_read_only = bool(entry_ro and (entry_ro.get("annotations") or {}).get("readOnlyHint") is True)
                    if not mcp_read_only:
                        info = {"tool": call["name"], "model": l, "inside": True,
                                "summary": f"{call['name']} (read-only sub-agent)"}
                        yield _sse(dict(info, type="tool_call"))
                        ok, output = False, ""
                        status = "blocked: this sub-agent is read-only (research mode)"
                        outcomes.append((call, status, output))
                        conv.setdefault("tools", []).append(
                            {"tool": call["name"], "summary": info.get("summary"), "lane": l,
                             "diff": None, "ok": ok, "status": status})
                        yield _sse({"type": "tool_result", "model": l, "tool": call["name"],
                                    "ok": ok, "status": status, "output": ""})
                        continue
                mcp_entry = mcp_tools.get(call["name"])
                mcp_args = None
                mcp_error = None
                if mcp_entry:
                    try:
                        mcp_args = agent.coerce_mcp_arguments(call, mcp_entry.get("input_schema"))
                        args_display = json.dumps(mcp_args, ensure_ascii=False)[:4000]
                    except ValueError as e:
                        mcp_error = str(e)
                        args_display = str(call.get("params") or {})[:4000]
                    # MCP calls run on a connector server, not on local paths,
                    # so workspace containment ("inside") does not apply. The
                    # mapped permission kind below (read_file when readOnlyHint,
                    # run_cmd otherwise) is the gate: marking these "outside"
                    # made even read-only MCP tools ask for approval, hanging
                    # the auto-allow path ("reads are free").
                    info = {
                        "tool": call["name"], "model": l, "mcp": True,
                        "server": mcp_entry["server"], "mcp_tool": mcp_entry["tool"],
                        "summary": f"MCP {mcp_entry['server']}: {mcp_entry['tool']}",
                        "rel": mcp_entry["server"], "path": args_display, "inside": True,
                    }
                else:
                    info = dict(tools[l].describe(call), model=l)
                call_id = f"t{uuid.uuid4().hex[:10]}"
                info["id"] = call_id
                yield _sse(dict(info, type="tool_call"))
                if mcp_entry:
                    if mcp_error:
                        ok, output, status = False, mcp_error, "error"
                    else:
                        annotations = mcp_entry.get("annotations") or {}
                        permission_tool = "read_file" if annotations.get("readOnlyHint") is True else "run_cmd"
                        answer = yield from _permit(mode, permission_tool, info)
                        if answer == "allow":
                            try:
                                output = CONNECTORS.call(call["name"], mcp_args or {})
                                ok = not str(output).startswith(("MCP Error:", "Error: MCP tool"))
                            except Exception as e:
                                ok, output = False, f"{type(e).__name__}: {e}"
                            status = "ok" if ok else "error"
                        else:
                            ok, output = False, ""
                            status = ("blocked: plan mode is read-only" if mode == "plan" else "blocked by safety rules") \
                                if answer == "blocked" else "denied by the user"
                elif call["name"] not in permissions.KIND:
                    ok, output = tools[l].run(call)
                    status = "error"
                else:
                    answer = yield from _permit(mode, call["name"], info)
                    if answer == "allow":
                        if call["name"] in ("write_file", "edit_file", "delete"):
                            _checkpoint_capture(conv, l, info)
                        if call["name"] == "run_cmd":
                            ok, output = yield from _run_cmd_live(tools[l], call, l, call_id)
                        else:
                            ok, output = tools[l].run(call)
                        status = "ok" if ok else "error"
                        if call["name"] == "run_cmd":
                            conv.pop("_output_cache", None)
                        if ok and call["name"] in ("write_file", "edit_file", "delete"):
                            _invalidate_read_cache(conv, info)
                    else:
                        ok, output = False, ""
                        status = ("blocked: plan mode is read-only" if mode == "plan" else "blocked by safety rules") \
                            if answer == "blocked" else "denied by the user"
                outcomes.append((call, status, output))
                conv.setdefault("tools", []).append({"tool": call["name"], "summary": info.get("summary"), "lane": l,
                                                     "diff": info.get("diff"), "ok": ok, "status": status,
                                                     "id": call_id, "command": info.get("command") or None,
                                                     "rel": info.get("rel"), "background": info.get("background") or None,
                                                     "output": _history_output(output)})
                yield _sse({"type": "tool_result", "id": call_id, "model": l, "tool": call["name"],
                            "rel": info.get("rel"), "ok": ok,
                            "status": status, "output": (output or "")[:4000]})
                if call["name"] == "run_cmd" and ok and output:
                    yield from _dev_server_events(conv, l, output)
        if _stopped():
            # Stop ends the reply's dev servers too, like closing the session.
            _stop_dev_servers(conv)
            break
        if rnd == agent.MAX_ROUNDS:
            yield _sse({"type": "notice", "text": f"Paused after {agent.MAX_ROUNDS} tool rounds (a safety cap against loops). Type continue to let it go on."})
            break
        if dual:
            lane_dirs = {l: (tools[l].out or root) / agent.ARTIFACTS_DIR for l in lanes}
            content = agent.format_lane_results(results, artifact_dirs=lane_dirs)
        else:
            content = agent.format_results(results["a"], artifact_dir=root / agent.ARTIFACTS_DIR)
        if loop_notes:
            content += "\n" + "\n".join(loop_notes)
            loop_notes = []
        if rnd == agent.MAX_ROUNDS - 1:
            content += ("\n[Arena Desktop] You are near the tool-round limit for this "
                        "reply. Finish the current step now and answer with your final "
                        "summary; do not start new tool work.")
        for l in lanes:
            total[l] += "\n\n"
        yield _sse({"type": "round", "n": rnd + 1})
    # A model that only ever replied with tool tags (or whose final round
    # came back empty) must not leave a blank answer behind: say what was
    # done and how to continue, in the answer text itself.
    for l in lanes:
        used = [t.get("tool") for t in (conv.get("tools") or []) if t.get("lane") == l]
        if used and not agent.strip_tool_calls(total[l]).strip():
            names = ", ".join(dict.fromkeys(used))
            note = (f"The model finished without a final message after using tools ({names}). "
                    "Its changes are in the selected folder. Send 'continue' to ask it to finish or summarize.")
            prefix = "\n\n" if total[l].strip() else ""
            total[l] = total[l] + prefix + note
            yield _sse({"type": "text", "model": l, "text": prefix + note})
    return total


def _model_name(model_id):
    """Display name for a model id from the cached catalog (None when unknown)."""
    if not model_id:
        return None
    stack = [_catalog_models()]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            if cur.get("model_id", cur.get("id")) == model_id and cur.get("name"):
                return cur["name"]
            stack.extend(v for v in cur.values() if isinstance(v, (dict, list)))
        elif isinstance(cur, list):
            stack.extend(cur)
    return None
