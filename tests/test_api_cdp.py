"""Regression tests for the CDP browser chat path (arena/api.py).

The JS template in send_chat_via_cdp referenced `self.active_mode` inside a
module-level function, so every call raised NameError and the CDP fallback
used by ArenaClient.send_chat_browser could never work.
"""

import json
import sys
import types

import pytest

from arena import api


class _FakeWS:
    def __init__(self, reply):
        self._reply = reply
        self.sent = None

    def send(self, payload):
        self.sent = payload

    def recv(self):
        return self._reply

    def close(self):
        pass


@pytest.fixture
def cdp(monkeypatch):
    """Fake CDP endpoint + websocket; returns the list of captured sockets."""
    captured = []
    reply = json.dumps({"result": {"result": {"value": {
        "text": "hi", "evalId": "e1", "reasoning": "", "sources": [], "chunks": 1}}}})
    mod = types.ModuleType("websocket")

    def create_connection(url, timeout=None):
        ws = _FakeWS(reply)
        captured.append(ws)
        return ws

    mod.create_connection = create_connection
    monkeypatch.setitem(sys.modules, "websocket", mod)
    monkeypatch.setattr(api, "_cdp_ensure_arena_page",
                        lambda port=9222: "ws://127.0.0.1:9222/devtools/page/fake")
    return captured


def _sent_js(captured):
    return json.loads(captured[0].sent)["params"]["expression"]


def test_send_chat_via_cdp_embeds_mode_parameter(cdp):
    text, eval_id, err = api.send_chat_via_cdp(
        model_id="m1", message="hello", eval_id=None, modality="chat", mode="direct")
    assert err is None
    assert text == "hi" and eval_id == "e1"
    js = _sent_js(cdp)
    assert "mode: 'direct'" in js
    assert "if ('direct' !== 'battle')" in js
    assert "self.active_mode" not in js


def test_send_chat_via_cdp_battle_mode_omits_model_a(cdp):
    api.send_chat_via_cdp(model_id="m1", message="hello", mode="battle")
    js = _sent_js(cdp)
    assert "mode: 'battle'" in js


def test_send_chat_browser_passes_client_mode(cdp, monkeypatch):
    monkeypatch.setattr(api, "_cdp_find_arena_tab", lambda port=9222: None)
    client = api.ArenaClient(cookie_str=None)
    client.active_mode = "side-by-side"
    text, err = client.send_chat_browser("m1", "hello")
    assert err is None and text == "hi"
    js = _sent_js(cdp)
    assert "mode: 'side-by-side'" in js
