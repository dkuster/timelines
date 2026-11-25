"""Fonds de carte hors ligne de la carte (web/public/data/basemaps.js, copié dans dist/data/).

Télécharge les frontières historiques de historical-basemaps (André Ourednik, GPL-3.0)
pour les années demandées, ainsi que les lacs et fleuves de Natural Earth 1:10m
(domaine public), les simplifie avec mapshaper, puis les écrit dans un format compact
(coordonnées en millièmes de degré, en différences successives).

Prérequis : Python 3.9+, une connexion internet, et mapshaper (Node.js) :
  npm install -g mapshaper

Usage, depuis la racine du dépôt :
  py -m tldb basemaps                                (années 1900 1914 1920)
  py -m tldb basemaps --years 1900 1914 1920 1930 1938 1945

Années disponibles : voir https://github.com/aourednik/historical-basemaps/tree/master/geojson
(world_1880, world_1900, world_1914, world_1920, world_1930, world_1938, world_1945, world_1960…).
La période proposée par la carte suit les années présentes (de la première carte à dix ans après la dernière).
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

HB = "https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/world_{year}.geojson"
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/{name}.geojson"
Q = 1000  # millièmes de degré (≈ 110 m)


def fetch(url: str, dest: Path) -> Path:
    print(f"téléchargement {url}")
    with urllib.request.urlopen(url, timeout=120) as r, dest.open("wb") as f:
        shutil.copyfileobj(r, f)
    return dest


def mapshaper(src: Path, dest: Path, *cmds: str) -> Path:
    exe = shutil.which("mapshaper") or shutil.which("mapshaper.cmd")
    if not exe:
        sys.exit("mapshaper introuvable : npm install -g mapshaper")
    subprocess.run([exe, str(src), *cmds, "-o", str(dest), "format=geojson"], check=True)
    return dest


def enc_ring(ring: list) -> list:
    out, px, py = [], 0, 0
    for lon, lat in ring:
        x, y = round(lon * Q), round(lat * Q)
        if out and x == px and y == py:
            continue
        out += [x - px, y - py]
        px, py = x, y
    return out


def parts(g: dict | None) -> list:
    if not g:
        return []
    t, c = g["type"], g["coordinates"]
    if t == "Polygon":
        return c
    if t == "MultiPolygon":
        return [r for p in c for r in p]
    if t == "LineString":
        return [c]
    if t == "MultiLineString":
        return c
    return []


def features(path: Path, props: list[tuple[str, str]]) -> list:
    out = []
    for f in json.loads(path.read_text(encoding="utf-8"))["features"]:
        rings = [r for r in (enc_ring(x) for x in parts(f.get("geometry"))) if len(r) >= 4]
        if rings:
            o = {short: (f.get("properties") or {}).get(long) for long, short in props}
            o["g"] = rings
            out.append(o)
    return out


def cmd_basemaps(args) -> int:
    out = args.root / "web" / "public" / "data" / "basemaps.js"
    out.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        maps = {}
        for y in sorted(args.years):
            raw = fetch(HB.format(year=y), t / f"world_{y}.geojson")
            simp = mapshaper(raw, t / f"s_{y}.geojson", "-clean", "-filter-fields", "NAME,SUBJECTO,BORDERPRECISION",
                             "-simplify", "interval=2500", "keep-shapes")
            maps[y] = features(simp, [("NAME", "n"), ("SUBJECTO", "s"), ("BORDERPRECISION", "p")])
        lakes = mapshaper(fetch(NE.format(name="ne_10m_lakes"), t / "lakes.geojson"), t / "s_lakes.geojson",
                          "-filter", "scalerank<=8", "-filter-fields", "scalerank,name", "-simplify", "interval=1200", "keep-shapes")
        rivers = mapshaper(fetch(NE.format(name="ne_10m_rivers_lake_centerlines"), t / "rivers.geojson"), t / "s_rivers.geojson",
                           "-filter", "scalerank<=8", "-filter-fields", "scalerank,name", "-simplify", "interval=1500")
        data = {"q": Q, "maps": maps,
                "lakes": features(lakes, [("scalerank", "r"), ("name", "n")]),
                "rivers": features(rivers, [("scalerank", "r"), ("name", "n")])}

    head = ("/* Fonds de carte hors ligne de la carte (produit par « py -m tldb basemaps »).\n"
            "   Frontières : historical-basemaps (André Ourednik, GPL-3.0), https://github.com/aourednik/historical-basemaps"
            f" — années {', '.join(map(str, sorted(maps)))}.\n"
            "   Lacs et fleuves : Natural Earth 1:10m (domaine public), https://www.naturalearthdata.com\n"
            "   Coordonnées en millièmes de degré, codées en différences successives. */\n")
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    out.write_text(head + "window.TLDB_BASEMAPS = " + payload + ";\n", encoding="utf-8")
    print(f"{out} écrit ({len(payload) // 1024} Ko) — cartes {', '.join(map(str, sorted(maps)))}")
    return 0

