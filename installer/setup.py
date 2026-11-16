"""Arena Desktop mini installer (per-user, no admin rights).

Installs Arena-Desktop.exe to %LOCALAPPDATA%\\Programs\\Arena Desktop, creates
Desktop and Start Menu shortcuts, and registers an uninstall entry in
Settings > Apps. Run again to repair or update. The same exe uninstalls:
Arena-Desktop-Setup.exe /uninstall asks whether to delete your data too (silent: /uninstall /S [/purge]).
Use /S for a silent install.
Your project folders are never touched.
"""
from __future__ import annotations

import json
import os
import time
import shutil
import subprocess
import sys
import threading
import winreg
from pathlib import Path

APP_NAME = "Arena Desktop"
EXE_NAME = "Arena-Desktop.exe"
SETUP_NAME = "Arena-Desktop-Setup.exe"
UNINSTALL_KEY = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\ArenaDesktop"
INSTALL_DIR = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))) / "Programs" / APP_NAME
START_MENU = Path(os.environ.get("APPDATA", "")) / "Microsoft" / "Windows" / "Start Menu" / "Programs"
NO_WINDOW = 0x08000000


def bundle(name: str) -> Path:
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent)) / name


def app_version() -> str:
    try:
        return bundle("version.txt").read_text(encoding="utf-8").strip()
    except OSError:
        return "0"


def desktop_dir() -> Path:
    r = subprocess.run(["powershell", "-NoProfile", "-Command", "[Environment]::GetFolderPath('Desktop')"],
                       capture_output=True, text=True, creationflags=NO_WINDOW)
    out = r.stdout.strip()
    return Path(out) if out else Path.home() / "Desktop"


def make_shortcut(link: Path, target: Path) -> None:
    link.parent.mkdir(parents=True, exist_ok=True)
    q = lambda p: str(p).replace("'", "''")  # noqa: E731
    ps = ("$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%s');"
          "$s.TargetPath='%s';$s.WorkingDirectory='%s';$s.IconLocation='%s,0';"
          "$s.Description='%s';$s.Save()") % (q(link), q(target), q(target.parent), q(target), APP_NAME)
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=True, creationflags=NO_WINDOW)


def stop_running_app() -> None:
    subprocess.run(["taskkill", "/F", "/IM", EXE_NAME], capture_output=True, creationflags=NO_WINDOW)


def register_uninstall(version: str) -> None:
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, UNINSTALL_KEY) as k:
        for name, val in {
            "DisplayName": APP_NAME, "DisplayVersion": version, "Publisher": "Arena Desktop",
            "InstallLocation": str(INSTALL_DIR), "DisplayIcon": str(INSTALL_DIR / EXE_NAME),
            "UninstallString": f'"{INSTALL_DIR / SETUP_NAME}" /uninstall',
            "QuietUninstallString": f'"{INSTALL_DIR / SETUP_NAME}" /uninstall /S',
        }.items():
            winreg.SetValueEx(k, name, 0, winreg.REG_SZ, val)
        winreg.SetValueEx(k, "NoModify", 0, winreg.REG_DWORD, 1)
        winreg.SetValueEx(k, "NoRepair", 0, winreg.REG_DWORD, 1)


def install(desktop_shortcut: bool, progress=lambda pct, msg: None) -> Path:
    payload = bundle(EXE_NAME)
    if not payload.is_file():
        raise RuntimeError("Installer payload is missing. Re-download Arena-Desktop-Setup.exe.")
    version = app_version()
    progress(10, "Closing Arena Desktop if it is running")
    stop_running_app()
    INSTALL_DIR.mkdir(parents=True, exist_ok=True)
    progress(30, "Copying files")
    target = INSTALL_DIR / EXE_NAME
    tmp = target.with_suffix(".new")
    shutil.copyfile(payload, tmp)
    os.replace(tmp, target)
    if getattr(sys, "frozen", False):
        shutil.copyfile(sys.executable, INSTALL_DIR / SETUP_NAME)
    (INSTALL_DIR / "version.txt").write_text(version, encoding="utf-8")
    progress(65, "Creating shortcuts")
    make_shortcut(START_MENU / f"{APP_NAME}.lnk", target)
    if desktop_shortcut:
        make_shortcut(desktop_dir() / f"{APP_NAME}.lnk", target)
    progress(90, "Registering with Windows")
    register_uninstall(version)
    progress(100, "Done")
    return target


def user_data_dirs() -> list:
    home = Path.home()
    return [home / ".arena-personal", home / ".arena-cli"]


def purge_user_data() -> None:
    """Chats, settings, saved sign-ins, web profile and update downloads. Project folders are never touched."""
    for d in user_data_dirs():
        shutil.rmtree(d, ignore_errors=True)


def schedule_remove_install_dir() -> None:
    # This exe lives in INSTALL_DIR, so a detached helper removes the folder after we exit.
    subprocess.Popen(f'cmd /c ping -n 3 127.0.0.1 >nul & cd /d "%TEMP%" & rmdir /s /q "{INSTALL_DIR}"',
                     cwd=os.environ.get("TEMP"), creationflags=NO_WINDOW | 0x00000008, close_fds=True)


def uninstall(purge: bool = False) -> None:
    stop_running_app()
    for link in (START_MENU / f"{APP_NAME}.lnk", desktop_dir() / f"{APP_NAME}.lnk"):
        link.unlink(missing_ok=True)
    try:
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, UNINSTALL_KEY)
    except OSError:
        pass
    if purge:
        purge_user_data()
    # This exe lives in INSTALL_DIR, so a detached helper removes the folder after we exit.
    subprocess.Popen(f'cmd /c ping -n 4 127.0.0.1 >nul & cd /d "%TEMP%" & rmdir /s /q "{INSTALL_DIR}"',
                     cwd=os.environ.get("TEMP"), creationflags=NO_WINDOW | 0x00000008, close_fds=True)


def run_uninstall_gui_tk() -> None:
    import ctypes
    import tkinter as tk

    BG, FG, MUTED, LINE, DANGER, ON_DANGER = "#1b1e1e", "#f4f0eb", "#8b958e", "#2a2f2f", "#f87171", "#2b0a0a"
    root = tk.Tk()
    root.title(f"Uninstall {APP_NAME}")
    root.configure(bg=BG)
    root.resizable(False, False)
    root.geometry(f"440x250+{(root.winfo_screenwidth() - 440) // 2}+{(root.winfo_screenheight() - 250) // 3}")
    try:
        root.iconbitmap(default=str(bundle("arena-cli.ico")))
        root.update()
        ctypes.windll.dwmapi.DwmSetWindowAttribute(ctypes.windll.user32.GetParent(root.winfo_id()), 20, ctypes.byref(ctypes.c_int(1)), 4)
    except Exception:
        pass
    body = tk.Frame(root, bg=BG)
    body.pack(fill="both", expand=True, padx=28, pady=(24, 20))
    tk.Label(body, text=f"Remove {APP_NAME}?", bg=BG, fg=FG, font=("Segoe UI", 15, "bold")).pack(anchor="w")
    tk.Label(body, text="The app, its shortcuts and its entry in Settings > Apps will be removed.\nYour project folders are not touched.",
             bg=BG, fg=MUTED, font=("Segoe UI", 9), justify="left").pack(anchor="w", pady=(6, 12))
    wipe = tk.BooleanVar(value=True)
    tk.Checkbutton(body, text="Also delete my chats, settings and saved sign-ins", variable=wipe, bg=BG, fg=FG, selectcolor=BG,
                   activebackground=BG, activeforeground=FG, font=("Segoe UI", 10), bd=0, highlightthickness=0).pack(anchor="w")
    tk.Label(body, text=r"%USERPROFILE%\.arena-personal", bg=BG, fg=MUTED, font=("Consolas", 9)).pack(anchor="w", padx=24)
    foot = tk.Frame(body, bg=BG)
    foot.pack(side="bottom", fill="x")
    result = {"go": False}

    def go() -> None:
        result["go"] = True
        root.destroy()

    def flat(text, bg, fg, hot, cmd):
        b = tk.Button(foot, text=text, command=cmd, bg=bg, fg=fg, activebackground=hot, activeforeground=fg, relief="flat", bd=0,
                      padx=20, pady=6, cursor="hand2", font=("Segoe UI", 10, "bold" if bg != BG else "normal"),
                      highlightthickness=2, highlightbackground=BG, highlightcolor=FG)
        b.bind("<Enter>", lambda _e: b.configure(bg=hot))
        b.bind("<Leave>", lambda _e: b.configure(bg=bg))
        return b

    ok = flat("Uninstall", DANGER, ON_DANGER, "#fca5a5", go)
    ok.pack(side="right")
    flat("Cancel", BG, MUTED, LINE, root.destroy).pack(side="right", padx=(0, 8))
    ok.focus_set()
    root.bind("<Escape>", lambda _e: root.destroy())
    root.mainloop()
    if result["go"]:
        uninstall(purge=wipe.get())


def run_gui_tk() -> None:
    import ctypes
    import tkinter as tk

    BG, FG, MUTED, LINE, ACCENT, ACCENT_HOT, ON_ACCENT, ERR = (
        "#1b1e1e", "#f4f0eb", "#8b958e", "#2a2f2f", "#34d399", "#4ee0ab", "#06251a", "#f87171")
    W, H = 480, 330
    SANS = "Segoe UI"
    existing = (INSTALL_DIR / EXE_NAME).is_file()

    root = tk.Tk()
    root.title(f"{APP_NAME} Setup")
    root.configure(bg=BG)
    root.resizable(False, False)
    root.geometry(f"{W}x{H}+{(root.winfo_screenwidth() - W) // 2}+{(root.winfo_screenheight() - H) // 3}")
    try:
        root.iconbitmap(default=str(bundle("arena-cli.ico")))
    except tk.TclError:
        pass
    try:
        root.update()
        hwnd = ctypes.windll.user32.GetParent(root.winfo_id())
        ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 20, ctypes.byref(ctypes.c_int(1)), 4)
    except Exception:
        pass

    body = tk.Frame(root, bg=BG)
    body.pack(fill="both", expand=True, padx=28, pady=(26, 22))

    head = tk.Frame(body, bg=BG)
    head.pack(fill="x")
    logo = tk.Canvas(head, width=44, height=44, bg=BG, highlightthickness=0)
    logo.pack(side="left")
    k = 44 / 512
    pts = lambda *xy: [c for x, y in zip(xy[::2], xy[1::2]) for c in ((256 + x) * k, (256 + y) * k)]  # noqa: E731
    r = 9
    logo.create_polygon(r, 0, 44 - r, 0, 44, 0, 44, r, 44, 44 - r, 44, 44, 44 - r, 44, r, 44, 0, 44, 0, 44 - r, 0, r, 0, 0,
                        smooth=True, fill="#252523", outline="")
    for line in ((-120, -100, 120, -100), (-90, -100, -90, 100), (0, -100, 0, 100), (90, -100, 90, 100),
                 (-120, 100, 120, 100), (-120, -100, 0, -160, 120, -100)):
        logo.create_line(*pts(*line), fill="#F4F0EB", width=2, capstyle="round", joinstyle="round")
    titles = tk.Frame(head, bg=BG)
    titles.pack(side="left", padx=14)
    tk.Label(titles, text=APP_NAME, bg=BG, fg=FG, font=(SANS, 15, "bold"), anchor="w").pack(anchor="w")
    tk.Label(titles, text=f"Version {app_version()}" + ("  ·  update" if existing else ""),
             bg=BG, fg=MUTED, font=(SANS, 9), anchor="w").pack(anchor="w")

    tk.Frame(body, bg=LINE, height=1).pack(fill="x", pady=18)

    tk.Label(body, text="Install location", bg=BG, fg=MUTED, font=(SANS, 9)).pack(anchor="w")
    tk.Label(body, text=r"%LOCALAPPDATA%\Programs\Arena Desktop", bg=BG, fg=FG,
             font=("Consolas", 10)).pack(anchor="w", pady=(2, 0))
    tk.Label(body, text="Just for your account. No administrator rights needed.", bg=BG, fg=MUTED,
             font=(SANS, 9)).pack(anchor="w", pady=(2, 12))

    desk, launch = tk.BooleanVar(value=True), tk.BooleanVar(value=True)
    for text, var in (("Add a desktop shortcut", desk), ("Open Arena Desktop when done", launch)):
        tk.Checkbutton(body, text=text, variable=var, bg=BG, fg=FG, selectcolor=BG, activebackground=BG,
                       activeforeground=FG, font=(SANS, 10), bd=0, highlightthickness=0,
                       anchor="w").pack(anchor="w", pady=1)

    status = tk.Label(body, text=" ", bg=BG, fg=MUTED, font=(SANS, 9), anchor="w")
    status.pack(fill="x", pady=(14, 4))
    track = tk.Canvas(body, height=4, bg=LINE, highlightthickness=0)
    track.pack(fill="x")
    fill = track.create_rectangle(0, 0, 0, 4, fill=ACCENT, width=0)

    foot = tk.Frame(body, bg=BG)
    foot.pack(side="bottom", fill="x")

    def flat(text, bg, fg, hot, cmd, bold=False):
        b = tk.Button(foot, text=text, command=cmd, bg=bg, fg=fg, activebackground=hot, activeforeground=fg,
                      relief="flat", bd=0, padx=20, pady=6, cursor="hand2", font=(SANS, 10, "bold" if bold else "normal"),
                      highlightthickness=2, highlightbackground=BG, highlightcolor=ACCENT)
        b.bind("<Enter>", lambda _e: b.configure(bg=hot))
        b.bind("<Leave>", lambda _e: b.configure(bg=bg))
        return b

    action = flat("Update" if existing else "Install", ACCENT, ON_ACCENT, ACCENT_HOT, lambda: go(), bold=True)
    action.pack(side="right")
    cancel = flat("Cancel", BG, MUTED, LINE, root.destroy)
    cancel.pack(side="right", padx=(0, 8))
    action.focus_set()

    def progress(pct: int, msg: str) -> None:
        def draw() -> None:
            track.coords(fill, 0, 0, track.winfo_width() * pct / 100, 4)
            status.configure(text=msg, fg=MUTED)
        root.after(0, draw)

    def finish(target: Path) -> None:
        if launch.get():
            subprocess.Popen([str(target)], cwd=str(target.parent), creationflags=0x00000008, close_fds=True)
            root.after(700, root.destroy)
        else:
            status.configure(text="Installed.", fg=ACCENT)
            action.configure(text="Close", state="normal", command=root.destroy)
            cancel.pack_forget()

    def work() -> None:
        try:
            target = install(desk.get(), progress)
        except Exception as e:  # noqa: BLE001 - shown to the user
            msg = f"Could not install: {e}"[:90]
            root.after(0, lambda: (status.configure(text=msg, fg=ERR), action.configure(text="Retry", state="normal"),
                                   cancel.configure(state="normal")))
            return
        root.after(0, lambda: finish(target))

    def go() -> None:
        action.configure(state="disabled")
        cancel.configure(state="disabled")
        threading.Thread(target=work, daemon=True).start()

    root.bind("<Return>", lambda _e: action.invoke())
    root.bind("<Escape>", lambda _e: root.destroy())
    root.mainloop()



# ---------------------------------------------------------------------------
# HTML window (WebView2, the same engine the app uses): step list with live status
# ---------------------------------------------------------------------------
class _Api:
    def __init__(self, mode: str):
        self._mode = mode
        self._window = None
        self._target = INSTALL_DIR / EXE_NAME

    def _js(self, code: str) -> None:
        try:
            self._window.evaluate_js(code)
        except Exception:
            pass

    def _emit(self, i: int, status: str, info: str = "") -> None:
        self._js(f"onStep({i},{json.dumps(status)},{json.dumps(info)})")

    def get_state(self) -> dict:
        version = app_version()
        if self._mode == "install":
            steps = [
                {"icon": "close", "title": "Close running app", "sub": "Stops Arena Desktop if it is open"},
                {"icon": "copy", "title": "Copy app files", "sub": "For your account only, no admin rights"},
                {"icon": "link", "title": "Create shortcuts", "sub": "Start Menu, and Desktop if you want it"},
                {"icon": "shield", "title": "Register with Windows", "sub": f"Adds it to Settings > Apps as {version}"},
            ]
            options = [{"key": "desktop", "label": "Add a desktop shortcut", "on": True},
                       {"key": "launch", "label": "Open Arena Desktop when done", "on": True}]
        else:
            steps = [
                {"icon": "close", "title": "Close running app", "sub": "Stops Arena Desktop if it is open"},
                {"icon": "link", "title": "Remove shortcuts", "sub": "Start Menu and Desktop"},
                {"icon": "shield", "title": "Remove Windows entry", "sub": "Settings > Apps"},
                {"icon": "trash", "title": "Delete app files", "sub": "The program folder"},
                {"icon": "user", "title": "Delete my data", "sub": "Chats, settings and saved sign-ins"},
            ]
            options = [{"key": "purge", "label": "Also delete my chats, settings and saved sign-ins", "on": True}]
        shown = str(INSTALL_DIR).replace(str(Path.home()), "~")
        return {"mode": self._mode, "version": version, "existing": (INSTALL_DIR / EXE_NAME).is_file(),
                "path": shown, "steps": steps, "options": options}

    def start(self, opts: dict) -> bool:
        threading.Thread(target=self._run, args=(opts or {},), daemon=True).start()
        return True

    def _step(self, i: int, label_ok: str, fn) -> None:
        self._emit(i, "run")
        fn()
        time.sleep(0.25)
        self._emit(i, "ok", label_ok)

    def _run(self, opts: dict) -> None:
        current = 0
        try:
            if self._mode == "install":
                payload = bundle(EXE_NAME)
                if not payload.is_file():
                    raise RuntimeError("Installer payload is missing. Download Arena-Desktop-Setup.exe again.")
                version = app_version()

                def copy() -> None:
                    INSTALL_DIR.mkdir(parents=True, exist_ok=True)
                    tmp = self._target.with_suffix(".new")
                    shutil.copyfile(payload, tmp)
                    os.replace(tmp, self._target)
                    if getattr(sys, "frozen", False):
                        shutil.copyfile(sys.executable, INSTALL_DIR / SETUP_NAME)
                    (INSTALL_DIR / "version.txt").write_text(version, encoding="utf-8")

                def shortcuts() -> None:
                    make_shortcut(START_MENU / f"{APP_NAME}.lnk", self._target)
                    if opts.get("desktop"):
                        make_shortcut(desktop_dir() / f"{APP_NAME}.lnk", self._target)

                self._step(0, "Closed", stop_running_app)
                current = 1
                self._step(1, "Installed", copy)
                current = 2
                self._step(2, "Shortcuts ready", shortcuts)
                current = 3
                self._step(3, f"Registered as {version}", lambda: register_uninstall(version))
                self._js(f"onDone(true,{json.dumps('Installed. Arena Desktop ' + version + ' is ready.')})")
            else:
                purge = bool(opts.get("purge"))

                def links() -> None:
                    for link in (START_MENU / f"{APP_NAME}.lnk", desktop_dir() / f"{APP_NAME}.lnk"):
                        link.unlink(missing_ok=True)

                def registry() -> None:
                    try:
                        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, UNINSTALL_KEY)
                    except OSError:
                        pass

                self._step(0, "Closed", stop_running_app)
                current = 1
                self._step(1, "Removed", links)
                current = 2
                self._step(2, "Removed", registry)
                current = 3
                self._step(3, "Removed when you close this window", lambda: None)
                current = 4
                if purge:
                    self._step(4, "Deleted", purge_user_data)
                else:
                    self._emit(4, "skip", "Kept, as you chose")
                self._js(f"onDone(true,{json.dumps('Arena Desktop was removed.')})")
        except Exception as e:  # noqa: BLE001 - shown in the step's drawer
            self._emit(current, "fail", str(e))
            self._js(f"onDone(false,{json.dumps('Stopped: ' + str(e)[:120])})")

    def finish(self, launch: bool = False) -> None:
        if self._mode == "install" and launch and (self._target).is_file():
            subprocess.Popen([str(self._target)], cwd=str(self._target.parent), creationflags=0x00000008, close_fds=True)
        if self._mode == "uninstall" and not (INSTALL_DIR / EXE_NAME).exists():
            pass
        elif self._mode == "uninstall":
            schedule_remove_install_dir()
        try:
            self._window.destroy()
        except Exception:
            pass


def run_webview(mode: str) -> None:
    import webview

    api = _Api(mode)
    html = bundle("ui.html").read_text(encoding="utf-8")
    api._window = webview.create_window(
        "Arena Desktop Setup" if mode == "install" else "Uninstall Arena Desktop", html=html, js_api=api,
        width=440, height=600 if mode == "install" else 640, resizable=False, frameless=True, easy_drag=True,
        background_color="#121514")
    webview.start()


def run_gui() -> None:
    try:
        run_webview("install")
    except Exception:
        run_gui_tk()


def run_uninstall_gui() -> None:
    try:
        run_webview("uninstall")
    except Exception:
        run_uninstall_gui_tk()


def main() -> int:
    args = {a.lower() for a in sys.argv[1:]}
    silent = bool(args & {"/s", "-s", "--silent", "/silent"})
    if args & {"/uninstall", "--uninstall"}:
        if silent:
            uninstall(purge=bool(args & {"/purge", "--purge"}))
        else:
            run_uninstall_gui()
        return 0
    if silent:
        target = install(True)
        if not args & {"/nolaunch", "--nolaunch"}:
            subprocess.Popen([str(target)], cwd=str(target.parent), creationflags=0x00000008, close_fds=True)
        return 0
    run_gui()
    return 0


if __name__ == "__main__":
    sys.exit(main())
