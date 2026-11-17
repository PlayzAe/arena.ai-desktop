#!/usr/bin/env python3
"""Build the release files into dist/release/.

    python scripts/build.py                # build current version
    python scripts/build.py --bump patch   # 1.5.0 -> 1.5.1 first (patch|minor|major)

Outputs: Arena-Desktop.exe (what the in-app updater downloads),
Arena-Desktop-Setup.exe (mini installer), Arena-Desktop.exe.sha256.
The version lives only in arena/__init__.py; the exe's file properties, the
installer, the Windows "Apps" entry and the README badge are all stamped from it.
"""
import argparse, hashlib, pathlib, re, shutil, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
INIT = ROOT / "arena" / "__init__.py"
OUT = ROOT / "dist" / "release"


def read_version() -> str:
    return re.search(r'__version__\s*=\s*"([^"]+)"', INIT.read_text(encoding="utf-8")).group(1)


def bump(kind: str) -> str:
    major, minor, patch = (int(x) for x in read_version().split("."))
    major, minor, patch = {"major": (major + 1, 0, 0), "minor": (major, minor + 1, 0)}.get(kind, (major, minor, patch + 1))
    new = f"{major}.{minor}.{patch}"
    INIT.write_text(re.sub(r'(__version__\s*=\s*")[^"]+', rf"\g<1>{new}", INIT.read_text(encoding="utf-8")), encoding="utf-8")
    readme = ROOT / "README.md"
    if readme.exists():
        t = readme.read_text(encoding="utf-8")
        t = re.sub(r"badge/version-[\d.]+-", f"badge/version-{new}-", t)
        t = re.sub(r'alt="Version [\d.]+"', f'alt="Version {new}"', t)
        readme.write_text(t, encoding="utf-8")
    return new


def version_info(v: str) -> str:
    a, b, c = (int(x) for x in v.split("."))
    t = f"({a}, {b}, {c}, 0)"
    return f"""VSVersionInfo(
  ffi=FixedFileInfo(filevers={t}, prodvers={t}, mask=0x3f, flags=0x0, OS=0x40004, fileType=0x1, subtype=0x0, date=(0, 0)),
  kids=[StringFileInfo([StringTable('040904B0', [
    StringStruct('CompanyName', 'Arena Desktop'), StringStruct('FileDescription', 'Arena Desktop'),
    StringStruct('FileVersion', '{v}'), StringStruct('InternalName', 'Arena-Desktop'),
    StringStruct('OriginalFilename', 'Arena-Desktop.exe'), StringStruct('ProductName', 'Arena Desktop'),
    StringStruct('ProductVersion', '{v}')])]), VarFileInfo([VarStruct('Translation', [1033, 1200])])])
"""


def run(*cmd: str) -> None:
    print("+", " ".join(cmd))
    subprocess.run(cmd, cwd=ROOT, check=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bump", choices=["patch", "minor", "major"])
    ap.add_argument("--only-setup", action="store_true", help="rebuild only the installer from the existing dist/Arena-Desktop.exe")
    args = ap.parse_args()
    v = bump(args.bump) if args.bump else read_version()
    print(f"Building Arena Desktop {v}")
    (ROOT / "build").mkdir(exist_ok=True)
    (ROOT / "build" / "version_info.txt").write_text(version_info(v), encoding="utf-8")
    (ROOT / "build" / "version.txt").write_text(v, encoding="utf-8")
    if not args.only_setup:
        run(sys.executable, "scripts/build-js.py")
        run(sys.executable, "-m", "PyInstaller", "arena-cli.spec", "--noconfirm", "--distpath", "dist", "--workpath", "build/app")
    app = ROOT / "dist" / "Arena-Desktop.exe"
    common = ["--noconfirm", "--onefile", "--noconsole", "--icon", str(ROOT / "assets" / "arena-cli.ico"),
              "--version-file", str(ROOT / "build" / "version_info.txt"),
              "--add-data", f"{ROOT / 'build' / 'version.txt'};.", "--add-data", f"{ROOT / 'assets' / 'arena-cli.ico'};.",
              "--add-data", f"{ROOT / 'installer' / 'ui.html'};.",
              "--collect-all", "webview", "--hidden-import", "webview.platforms.edgechromium", "--distpath", "dist"]
    run(sys.executable, "-m", "PyInstaller", str(ROOT / "installer" / "setup.py"), "--name", "Uninstall-Arena-Desktop", *common,
        "--workpath", "build/uninstall", "--specpath", "build/uninstall")
    run(sys.executable, "-m", "PyInstaller", str(ROOT / "installer" / "setup.py"), "--noconfirm", "--onefile", "--noconsole",
        "--add-data", f"{ROOT / 'dist' / 'Uninstall-Arena-Desktop.exe'};.",
        "--name", "Arena-Desktop-Setup", "--icon", str(ROOT / "assets" / "arena-cli.ico"),
        "--version-file", str(ROOT / "build" / "version_info.txt"),
        "--add-data", f"{app};.", "--add-data", f"{ROOT / 'build' / 'version.txt'};.",
        "--add-data", f"{ROOT / 'assets' / 'arena-cli.ico'};.",
        "--add-data", f"{ROOT / 'installer' / 'ui.html'};.",
        "--collect-all", "webview", "--hidden-import", "webview.platforms.edgechromium",
        "--distpath", "dist", "--workpath", "build/setup", "--specpath", "build/setup")
    OUT.mkdir(parents=True, exist_ok=True)
    for name in ("Arena-Desktop.exe", "Arena-Desktop-Setup.exe"):
        shutil.copyfile(ROOT / "dist" / name, OUT / name)
    digest = hashlib.sha256((OUT / "Arena-Desktop.exe").read_bytes()).hexdigest()
    (OUT / "Arena-Desktop.exe.sha256").write_text(f"{digest}  Arena-Desktop.exe\n", encoding="utf-8")
    print(f"\nDone: {OUT}\nUpload all three files to a GitHub release tagged v{v}.")
    print("Write the release description as plain bullet points: the in-app updater shows them as 'What is new'.")


if __name__ == "__main__":
    main()
