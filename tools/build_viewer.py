#!/usr/bin/env python3
"""build_viewer — regroupe la base dans viewer/data.js et viewer/data-mobile.js.

Le visualiseur de bureau (viewer/desktop.html, ou l'accueil viewer/index.html) s'ouvre ensuite par simple double-clic,
sans serveur : data.js expose toute la base dans window.TLDB.

Le viewer mobile (viewer/mobile.html) lit data-mobile.js : la même base, plus légère,
sans les éléments désactivés ni les notes de vérification (tag « verification »).
La version du service worker (viewer/sw.js) est mise à jour pour que les téléphones
récupèrent les nouvelles données. tools/publish.py met les deux fichiers en ligne.

Usage, depuis la racine de la base :
  py tools\\build_viewer.py
  py tools\\build_viewer.py --root D:\\autre\\base --out D:\\export\\data.js

Aucune dépendance (bibliothèque standard uniquement).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

COLLECTIONS = ["persons", "places", "organizations", "works", "ideas", "sources", "links", "media"]


def load(path: Path) -> list:
    with path.open(encoding="utf-8") as f:
        return json.load(f).get("items", [])


def _scalar(v: str):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
        return v[1:-1]
    if re.fullmatch(r"-?\d+", v):
        return int(v)
    return v


def _split(inner: str) -> list:
    out, cur, q, depth = [], "", None, 0
    for ch in inner:
        if q:
            cur += ch
            if ch == q:
                q = None
        elif ch in "'\"":
            q = ch; cur += ch
        elif ch in "[{":
            depth += 1; cur += ch
        elif ch in "]}":
            depth -= 1; cur += ch
        elif ch == "," and depth == 0:
            out.append(cur); cur = ""
        else:
            cur += ch
    if cur.strip():
        out.append(cur)
    return out


def _flow(v: str):
    v = v.strip()
    if v.startswith("[") and v.endswith("]"):
        return [_flow(x) for x in _split(v[1:-1])]
    if v.startswith("{") and v.endswith("}"):
        d = {}
        for part in _split(v[1:-1]):
            k, _, val = part.partition(":")
            d[k.strip()] = _flow(val)
        return d
    return _scalar(v)


def _mini_yaml(text: str) -> dict:
    """Lecteur minimal pour les en-têtes de notes (si PyYAML est absent)."""
    out, key = {}, None
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = re.match(r"^\s*-\s+(.*)$", line)
        if m and key:
            out.setdefault(key, [])
            out[key].append(_flow(m.group(1)))
            continue
        k, _, v = line.partition(":")
        key = k.strip()
        out[key] = _flow(v) if v.strip() else []
    return out


def load_note(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8")
    head, body = {}, raw
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", raw, re.S)
    if m:
        try:
            import yaml  # type: ignore
            head = yaml.safe_load(m.group(1)) or {}
        except ImportError:
            head = _mini_yaml(m.group(1))
        except Exception as e:  # en-tête invalide : on garde le texte
            print(f"avertissement : en-tête illisible dans {path.name} ({e})", file=sys.stderr)
        body = m.group(2)
    head = {k: v for k, v in head.items() if isinstance(k, str)}
    head.setdefault("id", path.stem)
    head["file"] = path.name
    head["body"] = body.strip()
    return head


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()

    root: Path = args.root
    data = root / "data"
    out: Path = args.out or (root / "viewer" / "data.js")

    db: dict = {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "nodes": []}
    files = sorted((data / "nodes").glob("*.json"))
    for f in files:
        items = load(f)
        # timeline d'origine : la racine du fichier (nœud sans parent), utilisée par la règle des lignes
        top = next((it for it in items if isinstance(it, dict) and it.get("parents") == []), None)
        if top is not None:
            for it in items:
                if isinstance(it, dict):
                    it["_home"] = top["id"]
        db["nodes"].extend(items)
    for c in COLLECTIONS:
        p = data / f"{c}.json"
        db[c] = load(p) if p.exists() else []

    notes_dir = root / "notes"
    db["notes"] = [load_note(p) for p in sorted(notes_dir.glob("*.md"))] if notes_dir.exists() else []

    out.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(db, ensure_ascii=False, separators=(",", ":"))
    out.write_text("window.TLDB = " + payload + ";\n", encoding="utf-8")

    counts = ", ".join(f"{k} {len(v)}" for k, v in db.items() if isinstance(v, list))
    print(f"{out} écrit ({len(payload) // 1024} Ko) — {len(files)} fichiers de nœuds ; {counts}")

    # version publiée pour le viewer mobile
    pub = {"generated": db["generated"]}
    for k, v in db.items():
        if isinstance(v, list):
            pub[k] = [it for it in v if not (isinstance(it, dict) and it.get("status") == "disabled")]
    pub["notes"] = [n for n in pub.get("notes", []) if "verification" not in (n.get("tags") or [])]
    mobile = out.parent / "data-mobile.js"
    mpayload = json.dumps(pub, ensure_ascii=False, separators=(",", ":"))
    mobile.write_text("window.TLDB = " + mpayload + ";\n", encoding="utf-8")
    print(f"{mobile} écrit ({len(mpayload) // 1024} Ko) — sans les notes de vérification ni les éléments désactivés")

    # version du service worker : date des données + empreinte des fichiers de l'appli
    sw = out.parent / "sw.js"
    if sw.exists():
        h = hashlib.sha1(mpayload.encode("utf-8"))
        for name in ["mobile.html", "i18n.js", "manifest.webmanifest"]:
            f = out.parent / name
            if f.exists():
                h.update(f.read_bytes())
        version = db["generated"][:19].replace(":", "") + "-" + h.hexdigest()[:8]
        text = sw.read_text(encoding="utf-8")
        new = re.sub(r'^const VERSION = ".*?";', f'const VERSION = "{version}";', text, count=1, flags=re.M)
        if new != text:
            sw.write_text(new, encoding="utf-8")
        print(f"{sw} : version {version}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
