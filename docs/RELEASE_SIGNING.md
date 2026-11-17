# Signing releases (maintainers)

The updater can verify that an update really came from you, not just that the
download survived the trip. A checksum travels the same channel as the binary
(the GitHub release), so a compromised release can swap both. A detached
Ed25519 signature checked against a public key pinned in the app cannot be
forged, even by someone who controls the release channel.

## One-time setup

1. Create the release key on a machine you trust:

   ```
   python scripts/sign_release.py keygen release-key.txt
   ```

   `release-key.txt` holds the secret seed. Keep it out of every repository
   (consider a password manager or an offline machine). The command prints a
   base64 public key.

2. Paste the printed public key into `arena/updater.py`:

   ```python
   RELEASE_PUBKEY = "BASE64-PUBLIC-KEY-HERE"
   ```

   From then on the updater **refuses to install any update that does not
   verify** against this key (fail closed). Until the key is pinned
   (`RELEASE_PUBKEY = ""`), behavior is unchanged: unsigned releases still
   install with the existing checksum/size/header checks.

## Every release

1. Build `Arena-Desktop.exe` as usual.
2. Sign it:

   ```
   python scripts/sign_release.py sign dist/Arena-Desktop.exe release-key.txt
   ```

   This writes `Arena-Desktop.exe.sig` (a base64 detached signature) next to
   the exe and prints the exe's sha256 for the release notes.
3. Upload **both** `Arena-Desktop.exe` and `Arena-Desktop.exe.sig` as release
   assets, and keep the GitHub-generated `sha256:` digest (or a
   `Arena-Desktop.exe.sha256` asset) as before - the installer checks both.

## Verifying by hand

The signature is plain Ed25519 (RFC 8032) over the exact exe bytes. Any
Ed25519 tool can check it; the app's own check is:

```
python -c "import base64, pathlib; from arena import signed_release; \
exe = pathlib.Path('Arena-Desktop.exe').read_bytes(); \
sig = base64.b64decode(pathlib.Path('Arena-Desktop.exe.sig').read_text().strip()); \
pub = base64.b64decode('YOUR-PUBLIC-KEY'); \
print(signed_release.verify(exe, sig, pub))"
```

## Key rotation

Generate a new key, pin the new public key in a release that is still signed
with the old key (ship both signatures if you want a transition), and keep
signing with the new key afterwards. Users on old builds only trust the old
key, so never rotate without a signed bridge release.
