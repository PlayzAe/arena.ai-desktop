#!/usr/bin/env python3
"""Release signing tool for Arena Desktop maintainers.

Creates the Ed25519 release key and signs the built exe so the updater can
prove authenticity against the public key pinned in arena/updater.py
(RELEASE_PUBKEY). The secret key must never be committed or shared.

Usage:
    python scripts/sign_release.py keygen <secret-key-file>
    python scripts/sign_release.py sign <Arena-Desktop.exe> <secret-key-file>

keygen: writes the 32-byte secret seed (hex) to <secret-key-file> (0600 on
POSIX) and prints the base64 public key to paste into arena/updater.py.
sign: writes <exe>.sig next to the exe (base64 detached Ed25519 signature)
and prints the sha256 of the exe for the release notes.
"""
import base64
import hashlib
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from arena import signed_release  # noqa: E402


def keygen(path: str) -> int:
    dest = Path(path)
    if dest.exists():
        print(f"Refusing to overwrite an existing key: {dest}", file=sys.stderr)
        return 1
    seed = os.urandom(32)
    pub, sec = signed_release.generate_keypair(seed)
    dest.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(dest), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="ascii") as f:
        f.write(sec.hex() + "\n")
    print("Secret key written to:", dest)
    print("Paste this base64 public key into arena/updater.py (RELEASE_PUBKEY):")
    print(base64.b64encode(pub).decode("ascii"))
    return 0


def sign(exe: str, keyfile: str) -> int:
    data = Path(exe).read_bytes()
    seed_hex = Path(keyfile).read_text(encoding="ascii").strip()
    seed = bytes.fromhex(seed_hex)
    _pub, sec = signed_release.generate_keypair(seed)
    sig = signed_release.sign(data, sec)
    sig_path = Path(exe + ".sig")
    sig_path.write_text(base64.b64encode(sig).decode("ascii") + "\n", encoding="ascii")
    print("Signature written to:", sig_path)
    print("sha256:", hashlib.sha256(data).hexdigest())
    return 0


def main(argv):
    if len(argv) == 3 and argv[1] == "keygen":
        return keygen(argv[2])
    if len(argv) == 4 and argv[1] == "sign":
        return sign(argv[2], argv[3])
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
