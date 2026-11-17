"""Sending local project files the AI has never written (files named in the user's message).

Closes the gap in KNOWN_ISSUES "Your local files are not in arena's sandbox": only
files the AI had written were tracked and sent back, so asking it to edit an existing
file (for example an old kimi-k3.txt) made it create a new file instead. Every test
below was red before the feature existed; the guard tests pin the safety rails:
no traversal, no sensitive paths, no binaries, no guessing between same-named files.
"""
import pytest

import arena.web.app as web


def _root(tmp_path):
    root = tmp_path / "proj"
    root.mkdir()
    return root


def test_existing_edits_channel_is_unchanged(tmp_path):
    """Tracked (AI-written) files the user edited still ride the note; the old
    one-argument call style keeps working."""
    root = _root(tmp_path)
    (root / "a.txt").write_text("v2", encoding="utf-8")
    web._sync_save(root, {"a.txt": web._digest(b"v1")})
    changed, note = web._local_edits(root)
    assert changed == ["a.txt"]
    assert "--- a.txt ---\nv2" in note and note.endswith("My message:\n")


def test_named_file_the_ai_never_wrote_is_sent(tmp_path):
    root = _root(tmp_path)
    (root / "kimi-k3.txt").write_bytes(b"hello\nworld\n")  # bytes: identical on every platform
    changed, note = web._local_edits(root, "fix kimi-k3.txt please")
    assert changed == ["kimi-k3.txt"]
    assert "--- kimi-k3.txt ---\nhello\nworld\n" in note
    assert note.endswith("My message:\n")


def test_unique_basename_is_found_inside_the_project(tmp_path):
    root = _root(tmp_path)
    (root / "src").mkdir()
    (root / "src" / "utils.ts").write_text("export const x = 1", encoding="utf-8")
    changed, note = web._local_edits(root, "sua file utils.ts nhe")
    assert changed == ["src/utils.ts"]
    assert "--- src/utils.ts ---" in note


def test_ambiguous_basename_is_not_guessed(tmp_path):
    root = _root(tmp_path)
    for d in ("src", "lib"):
        (root / d).mkdir()
        (root / d / "utils.ts").write_text(f"// {d}", encoding="utf-8")
    changed, _ = web._local_edits(root, "update utils.ts")
    assert changed == []


def test_traversal_sensitive_and_missing_files_are_never_sent(tmp_path):
    root = _root(tmp_path)
    (tmp_path / "secret.txt").write_text("TOP SECRET", encoding="utf-8")
    (root / ".env").write_text("API_KEY=1", encoding="utf-8")
    (root / ".ssh").mkdir()
    (root / ".ssh" / "id_rsa").write_text("PRIVATE", encoding="utf-8")
    (root / "cert.pem").write_text("PEMDATA", encoding="utf-8")
    changed, note = web._local_edits(root, "use ../secret.txt, .env, .ssh/id_rsa and cert.pem")
    assert changed == []
    assert "TOP SECRET" not in note and "API_KEY" not in note
    assert "PRIVATE" not in note and "PEMDATA" not in note


def test_binary_named_file_is_skipped(tmp_path):
    root = _root(tmp_path)
    (root / "logo.png").write_bytes(b"\x89PNG\x00\x00rest")
    changed, _ = web._local_edits(root, "use logo.png")
    assert changed == []


def test_oversized_named_file_is_named_but_not_sent(tmp_path):
    root = _root(tmp_path)
    (root / "big.txt").write_text("x" * 200_000, encoding="utf-8")
    changed, note = web._local_edits(root, "use big.txt")
    assert changed == ["big.txt"]
    assert "--- big.txt ---" not in note
    assert "big.txt" in note  # the AI is told it exists but is too large


def test_shared_file_is_tracked_and_later_edits_ride_the_edits_channel(tmp_path):
    root = _root(tmp_path)
    (root / "kimi-k3.txt").write_text("hello", encoding="utf-8")
    changed, _ = web._local_edits(root, "use kimi-k3.txt")
    assert changed == ["kimi-k3.txt"]
    assert web._sync_load(root).get("kimi-k3.txt") == web._digest(b"hello")
    # identical content is not sent twice
    changed, _ = web._local_edits(root, "use kimi-k3.txt again")
    assert changed == []
    # but a later local edit now rides the established edits channel
    (root / "kimi-k3.txt").write_text("hello v2", encoding="utf-8")
    changed, note = web._local_edits(root, "continue")
    assert changed == ["kimi-k3.txt"]
    assert "--- kimi-k3.txt ---\nhello v2" in note
