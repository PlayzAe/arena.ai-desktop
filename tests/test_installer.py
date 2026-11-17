"""Installer logic in a throwaway profile: nothing here touches the real install or the real user data."""
import importlib.util
import os
import pathlib
import sys

import pytest

pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="Windows installer")
ROOT = pathlib.Path(__file__).resolve().parent.parent


class _Window:
    def __init__(self):
        self.events = []

    def evaluate_js(self, code):
        self.events.append(code)

    def destroy(self):
        self.events.append("DESTROY")


@pytest.fixture
def setup(tmp_path, monkeypatch):
    for d in ("local", "roam", "home/.arena-personal"):
        (tmp_path / d).mkdir(parents=True)
    (tmp_path / "home/.arena-personal/accounts.json").write_text("{}")
    projects = tmp_path / "home/Documents/Arena Desktop/my-site"
    projects.mkdir(parents=True)
    (projects / "index.html").write_text("<h1>mine</h1>")
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "local"))
    monkeypatch.setenv("APPDATA", str(tmp_path / "roam"))
    monkeypatch.setenv("USERPROFILE", str(tmp_path / "home"))
    monkeypatch.setenv("ARENA_SETUP_NO_KILL", "1")
    monkeypatch.setenv("ARENA_SETUP_REGKEY", r"Software\ArenaDesktopTests\Uninstall")
    spec = importlib.util.spec_from_file_location("setup_under_test", ROOT / "installer" / "setup.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    payload = tmp_path / "payload"
    payload.mkdir()
    (payload / mod.EXE_NAME).write_bytes(b"MZ" + b"1" * 2000)
    (payload / mod.UNINSTALLER_BUNDLE).write_bytes(b"MZ" + b"2" * 1500)
    (payload / "ui.html").write_text("<html></html>")
    monkeypatch.setattr(mod, "bundle", lambda name: payload / name)
    monkeypatch.setattr(mod, "app_version", lambda: "1.6.0")
    monkeypatch.setattr(mod, "desktop_dir", lambda: tmp_path / "desktop")
    monkeypatch.setattr(mod, "make_shortcut", lambda link, target: (link.parent.mkdir(parents=True, exist_ok=True), link.write_text(str(target))))
    yield mod, tmp_path
    try:
        import winreg
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, mod.UNINSTALL_KEY)
    except OSError:
        pass


def _run(mod, mode, opts):
    api = mod._Api(mode)
    api._window = _Window()
    api._run(opts)
    return api


def test_install_puts_the_uninstaller_next_to_the_app_and_not_setup(setup):
    mod, tmp = setup
    api = _run(mod, "install", {"desktop": True})
    assert any("onDone(true" in e for e in api._window.events)
    assert (mod.INSTALL_DIR / mod.EXE_NAME).is_file()
    assert (mod.INSTALL_DIR / mod.UNINSTALL_NAME).read_bytes() == (tmp / "payload" / mod.UNINSTALLER_BUNDLE).read_bytes()
    assert not (mod.INSTALL_DIR / mod.SETUP_NAME).exists()
    assert (mod.INSTALL_DIR / "version.txt").read_text() == "1.6.0"
    import winreg
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, mod.UNINSTALL_KEY) as k:
        assert winreg.QueryValueEx(k, "UninstallString")[0] == f'"{mod.INSTALL_DIR / mod.UNINSTALL_NAME}"'
        assert winreg.QueryValueEx(k, "DisplayVersion")[0] == "1.6.0"


def test_setup_says_when_you_already_have_the_latest_version(setup, monkeypatch):
    mod, _ = setup
    assert mod._Api("install").get_state()["button"] == "Install"
    _run(mod, "install", {})
    state = mod._Api("install").get_state()
    assert state["up_to_date"] and state["button"] == "Repair" and "already have the latest" in state["notice"]
    monkeypatch.setattr(mod, "app_version", lambda: "1.7.0")
    state = mod._Api("install").get_state()
    assert state["button"] == "Update" and "update from 1.6.0" in state["subtitle"] and not state["up_to_date"]
    monkeypatch.setattr(mod, "app_version", lambda: "1.5.0")
    state = mod._Api("install").get_state()
    assert state["button"] == "Install anyway" and "newer version (1.6.0)" in state["notice"]


def test_uninstall_wipes_app_data_and_entries_but_never_project_folders(setup):
    mod, tmp = setup
    _run(mod, "install", {"desktop": True})
    api = _run(mod, "uninstall", {"purge": True})
    assert any("onDone(true" in e for e in api._window.events)
    assert not (tmp / "home/.arena-personal").exists()
    assert not (mod.START_MENU / f"{mod.APP_NAME}.lnk").exists()
    assert (tmp / "home/Documents/Arena Desktop/my-site/index.html").read_text() == "<h1>mine</h1>"
    import winreg
    with pytest.raises(OSError):
        winreg.OpenKey(winreg.HKEY_CURRENT_USER, mod.UNINSTALL_KEY)


def test_uninstall_can_keep_user_data(setup):
    mod, tmp = setup
    _run(mod, "install", {})
    _run(mod, "uninstall", {"purge": False})
    assert (tmp / "home/.arena-personal/accounts.json").exists()


def test_the_uninstaller_exe_name_selects_uninstall_mode(setup, monkeypatch):
    mod, _ = setup
    seen = []
    monkeypatch.setattr(mod, "run_uninstall_gui", lambda: seen.append("uninstall"))
    monkeypatch.setattr(mod, "run_gui", lambda: seen.append("install"))
    monkeypatch.setattr(sys, "argv", ["x"])
    monkeypatch.setattr(sys, "executable", str(mod.INSTALL_DIR / mod.UNINSTALL_NAME))
    mod.main()
    monkeypatch.setattr(sys, "executable", "C:/x/Arena-Desktop-Setup.exe")
    mod.main()
    assert seen == ["uninstall", "install"]
