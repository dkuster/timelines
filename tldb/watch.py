"""Veille : curseur de mise à jour des timelines (veille/watch.json).

Chaque timeline active porte `last_checked` (AAAA-MM) : la recherche de nouveaux évènements
est faite jusqu'à la fin de ce mois. La tâche de veille mensuelle traite :
- les timelines du groupe 0 (chaque mois) ;
- celles du groupe de rotation du mois ((mois - 1) % rotation + 1) ;
- celles en retard (plus de `rotation` mois à couvrir), quel que soit leur groupe.
La période couverte s'arrête `lag_months` mois avant le mois écoulé, pour garder du recul.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path

from .model import Base, Report, label

WATCH_FILE = Path("veille") / "watch.json"
MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def month_index(s: str) -> int:
    y, m = s.split("-")[:2]
    return int(y) * 12 + int(m) - 1


def month_str(i: int) -> str:
    return f"{i // 12:04d}-{i % 12 + 1:02d}"


def load_watch(root: Path) -> dict | None:
    p = root / WATCH_FILE
    if not p.is_file():
        return None
    return json.loads(p.read_text(encoding="utf-8-sig"))


def dump_watch(watch: dict) -> str:
    """Format canonique : une ligne par timeline, pour des diffs lisibles."""
    head = {k: v for k, v in watch.items() if k != "timelines"}
    lines = ["{"]
    for k, v in head.items():
        lines.append(f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)},")
    lines.append('  "timelines": [')
    rows = [json.dumps(t, ensure_ascii=False) for t in watch.get("timelines", [])]
    lines += [f"    {r}," for r in rows[:-1]] + ([f"    {rows[-1]}"] if rows else [])
    lines += ["  ]", "}"]
    return "\n".join(lines) + "\n"


def save_watch(root: Path, watch: dict) -> None:
    (root / WATCH_FILE).write_text(dump_watch(watch), encoding="utf-8")


def period_until(watch: dict, today: dt.date) -> int:
    return today.year * 12 + today.month - 1 - 1 - int(watch.get("lag_months", 1))


def plan(watch: dict, today: dt.date) -> dict:
    rot = int(watch.get("rotation", 3))
    until = period_until(watch, today)
    group = (today.month - 1) % rot + 1
    rows = []
    for t in watch.get("timelines", []):
        if not t.get("active", True):
            continue
        last = month_index(t["last_checked"])
        if last >= until:
            continue
        g = t.get("group")
        if g == 0:
            reason = "mensuel"
        elif g == group:
            reason = "rotation"
        elif until - last > rot:
            reason = "retard"
        else:
            continue
        rows.append({"id": t["id"], "since": month_str(last + 1), "until": month_str(until),
                     "months": until - last, "reason": reason})
    rows.sort(key=lambda r: (-r["months"], r["id"]))
    return {"date": today.isoformat(), "group": group, "until": month_str(until), "timelines": rows}


def ongoing_nodes(base: Base, root_id: str) -> list:
    """Nœuds `ongoing` rangés dans le fichier de la timeline (data/nodes/<racine>.json)."""
    out = []
    for e in base.entities["nodes"].values():
        if e.file.stem == root_id and e.item.get("ongoing") and e.status != "disabled":
            out.append(e)
    return sorted(out, key=lambda e: ((e.item.get("start") or {}).get("date", ""), e.id))


def roots_of(base: Base) -> dict:
    return {e.id: e for e in base.entities["nodes"].values() if not e.item.get("parents") and e.status != "disabled"}


def check_watch(base: Base, validators=None) -> None:
    """Contrôles de veille/watch.json, appelés par `validate`."""
    rep = base.report
    where = WATCH_FILE.as_posix()
    try:
        watch = load_watch(base.root)
    except json.JSONDecodeError as e:
        rep.error(where, f"JSON invalide ligne {e.lineno}, colonne {e.colno} : {e.msg}")
        return
    if watch is None:
        rep.warn(where, "fichier absent : la veille mensuelle ne peut pas fonctionner")
        return
    v = (validators or {}).get("watch")
    if v is not None:
        errs = list(v.iter_errors(watch))
        for err in errs:
            rep.error(where, f"{'/'.join(map(str, err.absolute_path)) or '(racine)'} : {err.message}")
        if errs:
            return
    roots = roots_of(base)
    rot = int(watch.get("rotation", 3))
    seen = set()
    for t in watch.get("timelines", []):
        tid = t.get("id")
        if tid in seen:
            rep.error(where, f"{tid} : listée deux fois")
        seen.add(tid)
        if tid not in roots:
            rep.error(where, f"{tid} : aucune racine de timeline de ce nom")
            continue
        if t.get("active", True):
            g = t.get("group")
            if not isinstance(g, int) or not 0 <= g <= rot:
                rep.error(where, f"{tid} : group doit valoir 0 (chaque mois) ou 1 à {rot}")
            lc = t.get("last_checked")
            if not isinstance(lc, str) or not MONTH_RE.match(lc):
                rep.error(where, f"{tid} : last_checked doit être au format AAAA-MM")
            if roots[tid].item.get("end"):
                rep.warn(where, f"{tid} : timeline close (end), la passer en active: false")
    for rid in sorted(set(roots) - seen):
        rep.warn(where, f"{rid} : nouvelle racine absente du fichier de veille (l'ajouter avec un group et last_checked)")


def cmd_watch(args) -> int:
    root = args.root
    watch = load_watch(root)
    if watch is None:
        print(f"{WATCH_FILE.as_posix()} introuvable", file=sys.stderr)
        return 1
    today = dt.date.fromisoformat(args.date) if args.date else dt.date.today()
    rep = Report()
    base = Base(root, rep)
    base.load()

    if args.ongoing:
        rows = ongoing_nodes(base, args.ongoing)
        for e in rows:
            start = (e.item.get("start") or {}).get("date", "")
            print(f"{start}\t{e.id}\t{e.status}\t{label(e.item.get('title'))}")
        print(f"{len(rows)} nœud(s) ongoing dans {args.ongoing}")
        return 0

    if args.done:
        entry = next((t for t in watch.get("timelines", []) if t.get("id") == args.done), None)
        if entry is None:
            print(f"{args.done} absente de {WATCH_FILE.as_posix()}", file=sys.stderr)
            return 1
        until = args.until or month_str(period_until(watch, today))
        if not MONTH_RE.match(until):
            print("--until doit être au format AAAA-MM", file=sys.stderr)
            return 1
        if month_index(until) < month_index(entry["last_checked"]):
            print(f"{args.done} : déjà vérifiée jusqu'à {entry['last_checked']}", file=sys.stderr)
            return 1
        entry["last_checked"] = until
        entry["checked_on"] = today.isoformat()
        save_watch(root, watch)
        print(f"{args.done} : vérifiée jusqu'à {until}")
        return 0

    p = plan(watch, today)
    if args.json:
        for r in p["timelines"]:
            r["ongoing"] = len(ongoing_nodes(base, r["id"]))
        print(json.dumps(p, ensure_ascii=False, indent=2))
        return 0
    print(f"Veille du {p['date']} : période couverte jusqu'à {p['until']} inclus, groupe de rotation {p['group']}")
    if not p["timelines"]:
        print("Aucune timeline à traiter.")
    for r in p["timelines"]:
        n = len(ongoing_nodes(base, r["id"]))
        print(f"  {r['id']:<16} {r['since']} → {r['until']}  ({r['months']} mois, {r['reason']})  {n} ongoing")
    if args.all:
        print("\nCurseurs :")
        for t in watch.get("timelines", []):
            state = f"jusqu'à {t.get('last_checked')}" if t.get("active", True) else "inactive"
            print(f"  {t['id']:<16} groupe {t.get('group', '-')}  {state}  {t.get('note', '')}".rstrip())
    return 0
