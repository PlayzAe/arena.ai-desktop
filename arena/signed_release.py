"""Minimal Ed25519 (RFC 8032) signatures for release authenticity.

The updater pins a release public key and verifies a detached signature
(Arena-Desktop.exe.sig) before installing anything, so a compromised release
channel cannot substitute the binary - checksums alone travel the same channel
as the exe and prove integrity, not origin.

This is a compact port of the public-domain RFC 8032 reference in extended
coordinates. verify() is the production path; sign()/generate_keypair() exist
for the maintainer's tooling (scripts/sign_release.py) and for tests. There is
no third-party crypto dependency.
"""
from __future__ import annotations

import hashlib

_P = 2 ** 255 - 19
_L = 2 ** 252 + 27742317777372353535851937790883648493
_SQRT_M1 = pow(2, (_P - 1) // 4, _P)


def _sha512(data: bytes) -> bytes:
    return hashlib.sha512(data).digest()


def _inv(x: int) -> int:
    return pow(x, _P - 2, _P)


# Curve constant d = -121665/121666 and the base point (from its compressed
# form, so no coordinate is hand-copied).
_D = -121665 * _inv(121666) % _P
_BASE_COMPRESSED = bytes.fromhex(
    "5866666666666666666666666666666666666666666666666666666666666666")


# Extended homogeneous coordinates (X, Y, Z, T): x = X/Z, y = Y/Z, x*y = T/Z.

def _point_add(P, Q):
    A = (P[1] - P[0]) * (Q[1] - Q[0]) % _P
    B = (P[1] + P[0]) * (Q[1] + Q[0]) % _P
    C = 2 * P[3] * Q[3] * _D % _P
    Dd = 2 * P[2] * Q[2] % _P
    E, F, G, H = B - A, Dd - C, Dd + C, B + A
    return (E * F % _P, G * H % _P, F * G % _P, E * H % _P)


def _point_double(P):
    A = P[0] * P[0] % _P
    B = P[1] * P[1] % _P
    C = 2 * P[2] * P[2] % _P
    H = (A + B) % _P
    E = (H - (P[0] + P[1]) * (P[0] + P[1])) % _P
    G = (A - B) % _P
    F = (C + G) % _P
    return (E * F % _P, G * H % _P, F * G % _P, E * H % _P)


def _scalarmult(P, e: int):
    Q = (0, 1, 1, 0)  # neutral element
    while e > 0:
        if e & 1:
            Q = _point_add(Q, P)
        P = _point_double(P)
        e >>= 1
    return Q


def _compress(P) -> bytes:
    zinv = _inv(P[2])
    x = P[0] * zinv % _P
    y = P[1] * zinv % _P
    return int.to_bytes(y | ((x & 1) << 255), 32, "little")


def _decompress(s: bytes):
    if len(s) != 32:
        raise ValueError("point must be 32 bytes")
    y = int.from_bytes(s, "little")
    sign = y >> 255
    y &= (1 << 255) - 1
    x2 = (y * y - 1) * _inv(_D * y * y + 1) % _P
    x = pow(x2, (_P + 3) // 8, _P)
    if x * x % _P != x2:
        x = x * _SQRT_M1 % _P
    if x * x % _P != x2:
        raise ValueError("not a curve point")
    if x == 0 and sign:
        raise ValueError("invalid point encoding")
    if x & 1 != sign:
        x = _P - x
    return (x, y, 1, x * y % _P)


def _clamp(h32: bytes) -> int:
    a = bytearray(h32)
    a[0] &= 248
    a[31] &= 127
    a[31] |= 64
    return int.from_bytes(bytes(a), "little")


_BASE = _decompress(_BASE_COMPRESSED)


def generate_keypair(seed: bytes):
    """(public_key, secret_seed) from a 32-byte seed. The secret is the seed
    itself (like minisign/SSH); keep it outside any repository."""
    if not isinstance(seed, (bytes, bytearray)) or len(seed) != 32:
        raise ValueError("seed must be exactly 32 bytes")
    a = _clamp(_sha512(bytes(seed))[:32])
    return _compress(_scalarmult(_BASE, a)), bytes(seed)


def sign(message: bytes, secret_seed: bytes) -> bytes:
    """Detached 64-byte Ed25519 signature over `message`."""
    if not isinstance(secret_seed, (bytes, bytearray)) or len(secret_seed) != 32:
        raise ValueError("secret seed must be exactly 32 bytes")
    h = _sha512(bytes(secret_seed))
    a = _clamp(h[:32])
    pub = _compress(_scalarmult(_BASE, a))
    r = int.from_bytes(_sha512(h[32:] + message), "little") % _L
    r_enc = _compress(_scalarmult(_BASE, r))
    k = int.from_bytes(_sha512(r_enc + pub + message), "little") % _L
    s = (r + k * a) % _L
    return r_enc + int.to_bytes(s, 32, "little")


def verify(message: bytes, signature: bytes, public_key: bytes) -> bool:
    """True only when `signature` is a valid signature of `message` by
    `public_key`. Malformed inputs return False (or raise for wrong sizes)."""
    if not isinstance(signature, (bytes, bytearray)) or len(signature) != 64:
        raise ValueError("signature must be exactly 64 bytes")
    if not isinstance(public_key, (bytes, bytearray)) or len(public_key) != 32:
        raise ValueError("public key must be exactly 32 bytes")
    signature = bytes(signature)
    public_key = bytes(public_key)
    r_enc, s_enc = signature[:32], signature[32:]
    s = int.from_bytes(s_enc, "little")
    if s >= _L:  # malleability guard
        return False
    try:
        a_pt = _decompress(public_key)
        r_pt = _decompress(r_enc)
    except ValueError:
        return False
    k = int.from_bytes(_sha512(r_enc + public_key + message), "little") % _L
    left = _scalarmult(_BASE, s)
    right = _point_add(r_pt, _scalarmult(a_pt, k))
    return _compress(left) == _compress(right)
