"""Build du site : données des viewers + pages, dans dist/.

dist/ est autonome : il s'ouvre par double-clic (file://, sans serveur ni connexion)
et c'est exactement ce qui est publié sur GitHub Pages.

  dist/data/base.js    window.TLDB : la base publiée (sans les éléments désactivés),
                       les notes hors vérification et les lignes précalculées
  dist/data/notes.js   window.TLDB_NOTES : notes de vérification (chargées par la frise seulement)
  dist/data/basemaps.js  fonds de carte (copie de web/public/basemaps.js)
  dist/media/          copie de media/
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from .model import Base, Report, COLLECTIONS
from .scope import node_homes, lanes

FORMAT_VERSION = 1
DATA_COLLECTIONS = [c for c in COLLECTIONS if c != "nodes"]


# --------------------------------------------------------------------------- données

def read_note(path: Path) -> dict | None:
    import yaml
    raw = path.read_text(encoding="utf-8-sig")
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", raw, re.S)
    head, body = {}, raw
    if m:
        try:
            head = yaml.safe_load(m.group(1)) or {}
        except yaml.YAMLError as e:
            print(f"avertissement : en-tête illisible dans {path.name} ({e})", file=sys.stderr)
            head = {}
        body = m.group(2)
    head = {k: v for k, v in head.items() if isinstance(k, str)} if isinstance(head, dict) else {}
    head.setdefault("id", path.stem)
    head["file"] = path.name
    head["body"] = body.strip()
    return head


def _jsonable(v):
    """Les dates YAML (datetime.date) deviennent des chaînes ISO."""
    if isinstance(v, dict):
        return {k: _jsonable(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_jsonable(x) for x in v]
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return v


def build_data(root: Path) -> tuple[dict, list]:
    """(base publiée, notes de vérification). Les éléments disabled sont retirés partout."""
    rep = Report()
    base = Base(root, rep)
    base.load()
    for line in rep.errors:
        print(line, file=sys.stderr)
    homes = node_homes(base)

    def live(coll):
        return [e.item for e in base.entities[coll].values() if e.status != "disabled"]

    nodes = []
    for it in live("nodes"):
        n = dict(it)
        if it["id"] in homes:
            n["_home"] = homes[it["id"]]
        nodes.append(n)
    db = {
        "format_version": FORMAT_VERSION,
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "nodes": nodes,
    }
    for c in DATA_COLLECTIONS:
        db[c] = live(c)
    db["lanes"] = lanes(base, homes)

    notes, verif = [], []
    notes_dir = root / "notes"
    for p in sorted(notes_dir.glob("*.md")) if notes_dir.is_dir() else []:
        nt = _jsonable(read_note(p))
        if nt.get("status") == "disabled":
            continue
        (verif if "verification" in (nt.get("tags") or []) else notes).append(nt)
    db["notes"] = notes
    return db, verif


def js_assign(name: str, obj) -> str:
    return f"window.{name} = " + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + ";\n"


# --------------------------------------------------------------------------- pages

PAGES = ["index", "desktop", "mobile", "map"]   # web/apps/<page>/index.html -> dist/<page>.html


def esbuild_bin(root: Path) -> list[str] | None:
    local = root / "node_modules" / ".bin" / ("esbuild.cmd" if sys.platform == "win32" else "esbuild")
    if local.exists():
        return [str(local)]
    found = shutil.which("esbuild")
    return [found] if found else None


def bundle(root: Path, out: Path, minify: bool) -> None:
    """web/apps/<page>/main.js -> dist/assets/<page>.js (IIFE : compatible file://)."""
    exe = esbuild_bin(root)
    if exe is None:
        raise SystemExit("esbuild introuvable : lancer « npm install » à la racine du dépôt")
    entries = [str(root / "web" / "apps" / p / "main.js") for p in PAGES if (root / "web" / "apps" / p / "main.js").exists()]
    cmd = exe + entries + ["--bundle", "--format=iife", "--target=es2020", "--charset=utf8", "--log-level=warning",
                           f"--outdir={out / 'assets'}", "--entry-names=[dir]", "--sourcemap=linked"]
    if minify:
        cmd.append("--minify")
    # [dir] = nom du dossier de l'application : assets/desktop.js, assets/mobile.js…
    r = subprocess.run(cmd, cwd=root / "web" / "apps", capture_output=True, text=True, shell=(sys.platform == "win32"))
    if r.returncode != 0:
        raise SystemExit("esbuild a échoué :\n" + (r.stderr or r.stdout))
    if r.stderr.strip():
        print(r.stderr.strip(), file=sys.stderr)


def copy_tree(src: Path, dst: Path) -> None:
    if src.is_dir():
        shutil.copytree(src, dst, dirs_exist_ok=True, ignore=shutil.ignore_patterns(".gitkeep"))


def sw_version(out: Path, generated: str) -> str:
    h = hashlib.sha1()
    for p in sorted(out.rglob("*")):
        if p.is_file() and p.name != "sw.js" and "media" not in p.relative_to(out).parts and not p.name.endswith(".map"):
            h.update(p.relative_to(out).as_posix().encode())
            h.update(p.read_bytes())
    return generated[:19].replace(":", "") + "-" + h.hexdigest()[:8]


def build(root: Path, out: Path | None = None, minify: bool = True, quiet: bool = False) -> Path:
    out = out or root / "dist"
    web = root / "web"
    if out.exists():
        shutil.rmtree(out)
    (out / "data").mkdir(parents=True)

    db, verif = build_data(root)
    base_js = js_assign("TLDB", db)
    (out / "data" / "base.js").write_text(base_js, encoding="utf-8")
    (out / "data" / "notes.js").write_text(js_assign("TLDB_NOTES", verif), encoding="utf-8")

    copy_tree(web / "public", out)
    copy_tree(root / "media", out / "media")
    for p in PAGES:
        page = web / "apps" / p / "index.html"
        if page.exists():
            shutil.copyfile(page, out / f"{p}.html")
    bundle(root, out, minify)

    sw = out / "sw.js"
    version = sw_version(out, db["generated"])
    if sw.exists():
        sw.write_text(re.sub(r'^const VERSION = ".*?";', f'const VERSION = "{version}";',
                             sw.read_text(encoding="utf-8"), count=1, flags=re.M), encoding="utf-8")
    (out / ".nojekyll").write_text("", encoding="utf-8")   # GitHub Pages : servir tel quel

    if not quiet:
        counts = ", ".join(f"{k} {len(v)}" for k, v in db.items() if isinstance(v, list) and k != "lanes")
        print(f"{out} construit — base.js {len(base_js) // 1024} Ko ({counts}), "
              f"{len(verif)} notes de vérification, version {version}")
    return out


def cmd_build(args) -> int:
    build(args.root, args.out, minify=not args.no_minify)
    return 0


# --------------------------------------------------------------------------- serveur local

def _snapshot(root: Path) -> dict:
    snap = {}
    for d in ("data", "notes", "media", "web"):
        for p in (root / d).rglob("*"):
            if p.is_file():
                snap[str(p)] = p.stat().st_mtime_ns
    return snap


def cmd_serve(args) -> int:
    """Construit dist/, le sert sur http://localhost:PORT et reconstruit à chaque modification."""
    import functools
    import http.server
    import threading
    import time

    out = build(args.root, minify=False)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(out))

    class Quiet(handler.func):  # type: ignore[misc]
        def log_message(self, *a):
            pass

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), functools.partial(Quiet, directory=str(out)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print(f"http://localhost:{args.port}/  (Ctrl+C pour arrêter ; reconstruction automatique)")
    snap = _snapshot(args.root)
    try:
        while True:
            time.sleep(1)
            cur = _snapshot(args.root)
            if cur != snap:
                snap = cur
                try:
                    build(args.root, minify=False)
                except SystemExit as e:
                    print(e, file=sys.stderr)
    except KeyboardInterrupt:
        srv.shutdown()
    return 0
