"""Interface en ligne de commande : python -m tldb <commande>."""
from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path

from .model import Base, Report, COLLECTIONS, label, entity_label, searchable
from .dates import parse_date
from .scope import node_homes, node_children, timeline_scope
from .validate import cmd_validate
from .fmt import cmd_format
from .related import cmd_related
from .build import cmd_build, cmd_serve
from .basemaps import cmd_basemaps
from .watch import cmd_watch


def cmd_index(args) -> int:
    rep = Report()
    base = Base(args.root, rep)
    base.load()
    colls = [args.collection] if args.collection else COLLECTIONS
    needle = (args.grep or "").lower()
    for coll in colls:
        rows = [e for e in base.entities[coll].values() if not needle or needle in searchable(e)]
        if not args.all:
            rows = [e for e in rows if e.status != "disabled"]
        if not rows:
            continue
        print(f"# {coll} ({len(rows)})")
        for e in sorted(rows, key=lambda x: x.id):
            extra = ""
            if coll == "nodes":
                start = (e.item.get("start") or {}).get("date", "")
                parents = ",".join(p.get("id", "") for p in e.item.get("parents", []) if isinstance(p, dict))
                extra = f"\t{start}\t^{parents}" if parents else f"\t{start}\t(racine)"
            print(f"{e.id}\t{e.status}\t{entity_label(e)}{extra}")
    for line in rep.errors:
        print(line, file=sys.stderr)
    return 0


def cmd_tree(args) -> int:
    rep = Report()
    base = Base(args.root, rep)
    base.load()
    nodes = base.entities["nodes"]
    children = defaultdict(list)
    for e in nodes.values():
        for p in e.item.get("parents", []) or []:
            if isinstance(p, dict):
                children[p.get("id")].append(e)

    def sort_key(e):
        return (parse_date((e.item.get("start") or {}).get("date", "")) or (9999,), e.item.get("order", 0), e.id)

    def show(e, depth, path):
        if not args.all and e.status == "disabled":
            return
        start = (e.item.get("start") or {}).get("date", "")
        end = (e.item.get("end") or {}).get("date", "…" if e.item.get("ongoing") else "")
        dates = f"{start} → {end}" if end else start
        flag = "" if e.status == "final" else f" [{e.status}]"
        print(f"{'  ' * depth}{label(e.item.get('title'))}  ({dates})  {e.id}{flag}")
        if args.depth is not None and depth >= args.depth:
            return
        for c in sorted(children.get(e.id, []), key=sort_key):
            if c.id not in path:
                show(c, depth + 1, path | {c.id})

    if args.node:
        if args.node not in nodes:
            print(f"nœud introuvable : {args.node}", file=sys.stderr)
            return 1
        roots = [nodes[args.node]]
    else:
        roots = sorted((e for e in nodes.values() if not e.item.get("parents")), key=sort_key)
    for r in roots:
        show(r, 0, {r.id})
    return 0


def cmd_scope(args) -> int:
    rep = Report()
    base = Base(args.root, rep)
    base.load()
    nodes = base.entities["nodes"]
    homes = node_homes(base)
    children = node_children(base)
    roots = sorted(set(homes.values()))
    if args.timeline:
        if args.timeline not in roots:
            print(f"timeline introuvable : {args.timeline} (racines : {', '.join(roots)})", file=sys.stderr)
            return 1
        roots = [args.timeline]
    total = 0
    for r in roots:
        cur = timeline_scope(r, homes, children)
        if args.excluded:
            old = timeline_scope(r, homes, children, rule=False)
            rows = [(i, old[i][1]) for i in old if i not in cur]
            head = "écartés par la règle (présents si tout le sous-arbre suivait)"
        else:
            rows = [(i, f"{cur[i][0]} via {cur[i][1]}") for i in cur if homes.get(i) != homes.get(r)]
            head = "importés d'autres timelines"
        if not rows:
            continue
        total += len(rows)
        print(f"# {r} : {len(rows)} {head}")
        for i, info in sorted(rows, key=lambda x: (parse_date((nodes[x[0]].item.get("start") or {}).get("date", "")) or (9999,), x[0])):
            start = (nodes[i].item.get("start") or {}).get("date", "")
            print(f"{start}\t{i}\t[{homes.get(i, '?')}]\t{label(nodes[i].item.get('title'))}\t{'via ' if args.excluded else ''}{info}")
        print()
    print(f"{total} ligne(s)")
    for line in rep.errors:
        print(line, file=sys.stderr)
    return 0



def main(argv=None) -> int:
    default_root = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser(prog="python -m tldb", description="Outil de la base de timelines")
    ap.add_argument("--root", type=Path, default=default_root, help="racine du dépôt (défaut : celle qui contient tldb/)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    v = sub.add_parser("validate", help="vérifier la base")
    v.add_argument("--no-media-files", action="store_true", help="ne pas vérifier la présence des fichiers médias")
    v.add_argument("--quiet", action="store_true", help="n'afficher que les erreurs")
    v.set_defaults(fn=cmd_validate)

    f = sub.add_parser("format", help="réécrire les fichiers au format canonique")
    f.add_argument("--check", action="store_true", help="signaler sans réécrire")
    f.set_defaults(fn=cmd_format)

    i = sub.add_parser("index", help="lister les entités")
    i.add_argument("--collection", choices=COLLECTIONS)
    i.add_argument("--grep", help="texte à chercher dans id, titres, noms et alias")
    i.add_argument("--all", action="store_true", help="inclure les entités disabled")
    i.set_defaults(fn=cmd_index)

    t = sub.add_parser("tree", help="afficher la hiérarchie des nœuds")
    t.add_argument("node", nargs="?", help="nœud de départ (défaut : toutes les racines)")
    t.add_argument("--depth", type=int, help="profondeur maximale")
    t.add_argument("--all", action="store_true", help="inclure les nœuds disabled")
    t.set_defaults(fn=cmd_tree)

    sc = sub.add_parser("scope", help="ce que chaque timeline importe des autres")
    sc.add_argument("timeline", nargs="?", help="racine à examiner (défaut : toutes)")
    sc.add_argument("--excluded", action="store_true",
                    help="lister plutôt les nœuds que la règle écarte (descendants de nœuds étrangers)")
    sc.set_defaults(fn=cmd_scope)

    rl = sub.add_parser("related", help="secondaires proposées par le mode automatique du viewer mobile")
    rl.add_argument("timeline", nargs="?", help="timeline principale (racine)")
    rl.add_argument("date", nargs="?", help="date de la loupe : AAAA, AAAA-MM, AAAA-MM-JJ ou année décimale")
    rl.add_argument("--range", type=float, default=10, help="plage affichée en années (défaut : 10)")
    rl.add_argument("--no-themes", action="store_true", help="exclure les timelines thématiques (view.kind = theme)")
    rl.add_argument("--top", type=int, default=8, help="nombre de candidates affichées (défaut : 8)")
    rl.add_argument("--verbose", "-v", action="store_true", help="détailler liens, personnes, organisations… par candidate")
    rl.add_argument("--gaps", action="store_true", help="lister, pour chaque timeline, les décennies sans candidate")
    rl.set_defaults(fn=cmd_related)

    b = sub.add_parser("build", help="construire le site dans dist/ (données + pages)")
    b.add_argument("--out", type=Path, help="dossier de sortie (défaut : dist/)")
    b.add_argument("--no-minify", action="store_true", help="code lisible (débogage)")
    b.set_defaults(fn=cmd_build)

    sv = sub.add_parser("serve", help="construire, servir sur localhost et reconstruire à chaque modification")
    sv.add_argument("--port", type=int, default=8000)
    sv.set_defaults(fn=cmd_serve)

    bm = sub.add_parser("basemaps", help="régénérer les fonds de carte (Internet + mapshaper)")
    bm.add_argument("--years", type=int, nargs="+", default=[1900, 1914, 1920])
    bm.set_defaults(fn=cmd_basemaps)

    w = sub.add_parser("watch", help="veille : timelines à mettre à jour (veille/watch.json, docs/veille.md)")
    w.add_argument("--date", help="date d'exécution AAAA-MM-JJ (défaut : aujourd'hui)")
    w.add_argument("--json", action="store_true", help="plan au format JSON")
    w.add_argument("--all", action="store_true", help="afficher aussi l'état de tous les curseurs")
    w.add_argument("--ongoing", metavar="RACINE", help="lister les nœuds ongoing d'une timeline")
    w.add_argument("--done", metavar="RACINE", help="avancer le curseur de la timeline (jusqu'à --until)")
    w.add_argument("--until", metavar="AAAA-MM", help="avec --done : mois atteint (défaut : fin de la période couverte)")
    w.set_defaults(fn=cmd_watch)

    args = ap.parse_args(argv)
    args.root = args.root.resolve()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    return args.fn(args)
