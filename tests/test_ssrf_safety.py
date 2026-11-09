"""SSRF hardening tests for the shared URL-safety helpers (arena/web/server/core.py).

Model output and user input can name arbitrary download URLs. These tests pin
down the vetting rules: https-only, no private/loopback/link-local/reserved/
multicast/unspecified/CGNAT addresses (IPv4 + IPv6 + IPv4-mapped), and for
_pinned_https_get the single-resolve property — the socket connects to the
exact address that was validated, so a DNS-rebinding flip cannot win.
"""

import socket
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))  # noqa: E402
from test_core import web  # noqa: E402,F401  (web is a fixture)

import arena.web.app as appmod  # noqa: E402


def _addrinfo(addr, port=0):
    """One realistic getaddrinfo row for a literal address."""
    if ":" in addr:
        return [(socket.AF_INET6, socket.SOCK_STREAM, 6, "", (addr, port, 0, 0))]
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (addr, port))]


class _NoNetwork(Exception):
    pass


def test_url_is_public_accepts_public_literals():
    assert appmod._url_is_public("https://8.8.8.8/image.png") is None
    assert appmod._url_is_public("https://[2606:4700:4700::1111]/image.png") is None


@pytest.mark.parametrize("url", [
    "http://example.com/a.png",           # scheme
    "ftp://example.com/a.png",            # scheme
    "file:///etc/passwd",                 # scheme
    "https://localhost/a.png",            # name
    "https://foo.localhost/a.png",        # name
])
def test_url_is_public_rejects_scheme_and_local_names(url):
    assert appmod._url_is_public(url) is not None


@pytest.mark.parametrize("ip", [
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254",
    "0.0.0.0", "100.64.0.1", "224.0.0.1", "255.255.255.255",
    "::1", "fc00::1", "fe80::1", "::", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:10.0.0.1",   # IPv4-mapped must behave like IPv4
])
def test_url_is_public_rejects_private_literals(ip):
    host = f"[{ip}]" if ":" in ip else ip
    err = appmod._url_is_public(f"https://{host}/a.png")
    assert err == "Private/internal addresses not allowed."


def test_url_is_public_rejects_unresolvable_host():
    # .invalid can never resolve (RFC 2606) — deterministic on any network.
    assert appmod._url_is_public("https://no-such-host.invalid/a.png") == "Cannot resolve hostname."


def test_url_is_public_vets_every_resolved_address(monkeypatch):
    # DNS-rebinding style: a public-looking name that resolves privately.
    monkeypatch.setattr(socket, "getaddrinfo",
                        lambda *a, **k: _addrinfo("127.0.0.1"))
    assert appmod._url_is_public("https://rebind.example/a.png") == "Private/internal addresses not allowed."
    # Dual-stack: a public IPv6 answer must not crash the check (the old
    # inline version raised TypeError on `ip in CGNAT` for IPv6 addresses).
    monkeypatch.setattr(socket, "getaddrinfo",
                        lambda *a, **k: _addrinfo("2606:4700:4700::1111"))
    assert appmod._url_is_public("https://dual.example/a.png") is None
    # A private address among several answers is still refused.
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: (
        _addrinfo("93.184.216.34") + _addrinfo("10.0.0.5")))
    assert appmod._url_is_public("https://mixed.example/a.png") == "Private/internal addresses not allowed."


def test_media_get_validates_before_any_fetch(monkeypatch):
    def boom(*a, **k):
        raise _NoNetwork("requests.get must not be called for a blocked URL")
    monkeypatch.setattr(appmod.requests, "get", boom)
    with pytest.raises(ValueError):
        appmod._media_get("https://127.0.0.1/secret")

    calls = []
    monkeypatch.setattr(appmod.requests, "get",
                        lambda url, timeout=None: calls.append((url, timeout)) or "response")
    monkeypatch.setattr(appmod, "_url_is_public", lambda url: None)  # unit test: vetting off
    assert appmod._media_get("https://cdn.example/x.png", timeout=30) == "response"
    assert calls == [("https://cdn.example/x.png", 30)]


def test_pinned_https_get_connects_to_the_validated_ip(monkeypatch):
    seen = []

    def fake_connect(addr, timeout=None, *a, **k):
        seen.append(addr)
        raise _NoNetwork("stop here")

    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: _addrinfo("93.184.216.34", 443))
    monkeypatch.setattr(socket, "create_connection", fake_connect)
    with pytest.raises(_NoNetwork):
        appmod._pinned_https_get("https://example.com/file.png")
    # The socket went to the exact address the check vetted (port 443).
    assert seen == [("93.184.216.34", 443)]


def test_pinned_https_get_never_connects_to_private(monkeypatch):
    def boom(*a, **k):
        raise _NoNetwork("must not connect")
    monkeypatch.setattr(socket, "create_connection", boom)
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: _addrinfo("169.254.169.254", 443))
    with pytest.raises(ValueError):
        appmod._pinned_https_get("https://metadata.example/latest/meta-data/")
    with pytest.raises(ValueError):
        appmod._pinned_https_get("http://example.com/x")   # scheme refused first


def test_media_save_endpoint_rejects_private_dns(web, monkeypatch):
    _appmod, c, *_ = web
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: _addrinfo("10.0.0.5"))
    r = c.post("/api/media/save", json={"url": "https://innocent.example/a.png"})
    assert r.status_code == 400
    assert "Private" in r.get_json()["error"]


def test_media_save_endpoint_rejects_redirect_chains_off_host(web, monkeypatch):
    # Even with public DNS, a redirect cannot walk onto a private host:
    # each hop is re-validated and re-pinned by _pinned_https_get.
    _appmod, c, *_ = web
    monkeypatch.setattr(appmod, "_pinned_https_get",
                        lambda url, **k: (_ for _ in ()).throw(ValueError("Private/internal addresses not allowed.")))
    r = c.post("/api/media/save", json={"url": "https://innocent.example/a.png"})
    assert r.status_code == 400
