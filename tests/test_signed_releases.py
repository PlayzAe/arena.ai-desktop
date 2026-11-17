"""Signed releases (roadmap step 4): verify the update exe against a pinned key.

Checksums travel the same channel as the binary (the GitHub release), so they
prove integrity, not authenticity. When a release public key is pinned in
arena/updater.py, a detached Ed25519 signature (Arena-Desktop.exe.sig) must
verify before _download may mark anything 'ready'. Every test here was red
before the machinery existed; the fail-closed cases pin the safety rails.
"""
import base64
import hashlib
from pathlib import Path

import pytest

from arena import signed_release, updater


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


class _BytesStream:
    """Fake pinned stream serving fixed bytes (the updater seam is _open_stream)."""

    def __init__(self, body: bytes, status: int = 200):
        self._body = body
        self.status = status
        self.content_type = "application/octet-stream"
        self.content_length = len(body)

    def iter_chunks(self, size=1 << 16):
        for i in range(0, len(self._body), size):
            yield self._body[i:i + size]

    def close(self):
        pass


# ---------- Ed25519 verify (arena/signed_release.py) ----------

def test_signature_round_trip_and_tampering():
    seed = bytes(range(32))
    pub, sec = signed_release.generate_keypair(seed)
    message = b"Arena-Desktop.exe bytes"
    sig = signed_release.sign(message, sec)
    assert signed_release.verify(message, sig, pub) is True
    assert signed_release.verify(message + b"!", sig, pub) is False, "tampered message must fail"
    assert signed_release.verify(message, sig[:-1] + bytes([sig[-1] ^ 1]), pub) is False, "tampered sig must fail"
    other_pub, _ = signed_release.generate_keypair(b"\x01" * 32)
    assert signed_release.verify(message, sig, other_pub) is False, "wrong key must fail"


def test_verify_rejects_malformed_input():
    pub, sec = signed_release.generate_keypair(bytes(range(32)))
    with pytest.raises(ValueError):
        signed_release.verify(b"x", b"short", pub)
    with pytest.raises(ValueError):
        signed_release.verify(b"x", b"\x00" * 64, b"short")
    with pytest.raises(ValueError):
        signed_release.generate_keypair(b"short")


def test_known_answer_vectors():
    """Pins interoperability: RFC 8032 test vector 1 and a frozen pair from a
    trusted Ed25519 implementation (cross-checked with PyNaCl)."""
    # RFC 8032, section 7.1, TEST 1 (empty message)
    rfc_sk = bytes.fromhex("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60")
    rfc_pk = bytes.fromhex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")
    rfc_sig = bytes.fromhex("e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155"
                            "5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b")
    pub, sec = signed_release.generate_keypair(rfc_sk)
    assert pub == rfc_pk
    assert signed_release.sign(b"", sec) == rfc_sig
    assert signed_release.verify(b"", rfc_sig, rfc_pk) is True
    # Frozen pair: seed 00..1f, message b"KAT message"
    kat_sec = bytes.fromhex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f")
    kat_pub = bytes.fromhex("03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8")
    kat_sig = bytes.fromhex("d05e180049ce7ec5a14b62948b9e27264d6b9ef951cdd54127951faef7b381d0"
                            "5f053e455a2ce6d962977e2a8420ff507d4e58cc36b22da6b782996acec2cf08")
    pub2, sec2 = signed_release.generate_keypair(kat_sec)
    assert pub2 == kat_pub
    assert signed_release.sign(b"KAT message", sec2) == kat_sig
    assert signed_release.verify(b"KAT message", kat_sig, kat_pub) is True


# ---------- updater gate (arena/updater.py) ----------

def _signed_download(monkeypatch, tmp_path, *, body, pubkey, sig_body, want_sha=""):
    """Drive updater._download through the fakes; returns the final _job dict."""
    seen = {}

    def fake_open(url, timeout=0):
        seen.setdefault("urls", []).append(url)
        if url.endswith(".sig"):
            return _BytesStream(sig_body)
        return _BytesStream(body)

    monkeypatch.setattr(updater, "_open_stream", fake_open)
    monkeypatch.setattr(updater, "UPDATES_DIR", tmp_path / "up")
    monkeypatch.setattr(updater, "_job", {})
    monkeypatch.setattr(updater, "RELEASE_PUBKEY", pubkey)
    dest = tmp_path / "up" / "new.exe"
    updater._download("https://example.invalid/Arena-Desktop.exe", dest, want_sha, "9.9.9",
                      expected=len(body), sig_url="https://example.invalid/Arena-Desktop.exe.sig")
    return updater.status(), dest, seen


EXE = b"MZ" + b"\x20" * 1_100_000


def test_signed_release_that_verifies_is_installed(monkeypatch, tmp_path):
    pub, sec = signed_release.generate_keypair(bytes(range(32)))
    sig = signed_release.sign(EXE, sec)
    status, dest, seen = _signed_download(monkeypatch, tmp_path, body=EXE, pubkey=_b64(pub),
                                         sig_body=_b64(sig).encode(), want_sha=hashlib.sha256(EXE).hexdigest())
    assert status["state"] == "ready" and dest.read_bytes() == EXE
    assert status.get("verified") == "signature"
    assert seen["urls"] == ["https://example.invalid/Arena-Desktop.exe",
                            "https://example.invalid/Arena-Desktop.exe.sig"]


def test_tampered_signature_is_rejected_before_install(monkeypatch, tmp_path):
    pub, sec = signed_release.generate_keypair(bytes(range(32)))
    bad = bytearray(signed_release.sign(EXE, sec))
    bad[0] ^= 1
    status, dest, _ = _signed_download(monkeypatch, tmp_path, body=EXE, pubkey=_b64(pub),
                                      sig_body=_b64(bytes(bad)).encode())
    assert status["state"] == "error" and "signature" in status["error"].lower()
    assert not dest.exists(), "nothing may be installed"


def test_missing_signature_is_rejected_when_a_key_is_pinned(monkeypatch, tmp_path):
    pub, _ = signed_release.generate_keypair(bytes(range(32)))
    status, dest, _ = _signed_download(monkeypatch, tmp_path, body=EXE, pubkey=_b64(pub),
                                      sig_body=b"")
    # An empty/invalid .sig blob must not pass either.
    assert status["state"] == "error"
    assert not dest.exists()

    monkeypatch.setattr(updater, "_job", {})
    monkeypatch.setattr(updater, "RELEASE_PUBKEY", _b64(pub))
    monkeypatch.setattr(updater, "UPDATES_DIR", tmp_path / "up")
    monkeypatch.setattr(updater, "_open_stream", lambda url, timeout=0: _BytesStream(EXE))
    dest2 = tmp_path / "up" / "other.exe"
    updater._download("https://example.invalid/Arena-Desktop.exe", dest2, "", "9.9.9",
                      expected=len(EXE), sig_url=None)
    assert updater.status()["state"] == "error" and not dest2.exists(), "unsigned must fail closed"


def test_unsigned_release_still_installs_when_no_key_is_pinned(monkeypatch, tmp_path):
    # Backwards compatibility: until the maintainer pins a key, releases
    # without signatures keep working exactly as before.
    status, dest, _ = _signed_download(monkeypatch, tmp_path, body=EXE, pubkey="",
                                      sig_body=b"")
    assert status["state"] == "ready" and dest.read_bytes() == EXE


def test_release_info_exposes_the_signature_asset():
    rel = {"assets": [
        {"name": "Arena-Desktop.exe", "browser_download_url": "https://x/a.exe", "digest": "sha256:ab"},
        {"name": "Arena-Desktop.exe.sig", "browser_download_url": "https://x/a.exe.sig"},
    ]}
    info = updater.release_info(rel)
    assert info["sig_url"] == "https://x/a.exe.sig"
    assert updater.release_info({"assets": []})["sig_url"] is None
