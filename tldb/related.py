"""Secondaires automatiques du viewer mobile (commande related)."""
from __future__ import annotations

import math
import sys
from collections import defaultdict

from .model import Base, Report
from .dates import year_point, parse_when
from .scope import node_homes, node_children, timeline_scope

# --------------------------------------------------------------------------- related
# Secondaires automatiques du viewer mobile (docs/specs/viewer-mobile.md § 16).

AUTO_LINK_W = {"causes": 5, "leads_to": 5, "reaction_to": 5, "opposes": 5,
               "influences": 4, "continues": 4, "comparable_to": 3, "references": 2}
AUTO_ENT_W = [("persons", "person", 2), ("organizations", "org", 2), ("works", "work", 1), ("places", "place", 0.5)]
AUTO_CAP, AUTO_FLOOR, AUTO_MIN_SPAN = 6, 1, 3   # fenêtre de calcul d'au moins 3 ans
AUTO_WHY = {"links": "liens", "persons": "pers.", "organizations": "org.", "works": "œuvres", "places": "lieux", "common": "communs"}




class RelatedIndex:
    def __init__(self, base: Base):
        nodes = {i: e.item for i, e in base.entities["nodes"].items() if e.status != "disabled"}
        self.nodes = nodes
        homes = node_homes(base)
        children = node_children(base)
        self.roots = sorted({r for r in homes.values() if r in nodes})
        self.kind = {r: ((nodes[r].get("view") or {}).get("kind") or "region") for r in self.roots}
        self.scope, self.events, self.node_roots = {}, {}, defaultdict(set)
        for r in self.roots:
            sc = timeline_scope(r, homes, children)
            members = set(sc) | {r}
            self.scope[r] = members
            containers = {via for _, via in sc.values()}
            evs = []
            for i in sc:
                it = nodes.get(i)
                if not it or i in containers or it.get("type") in ("era", "period"):
                    continue
                tp = year_point((it.get("start") or {}).get("date"))
                if tp is not None:
                    evs.append((tp, i))
            self.events[r] = sorted(evs)
            for i in members:
                self.node_roots[i].add(r)
        self.tp = {i: year_point((it.get("start") or {}).get("date")) for i, it in nodes.items()}
        self.ent_nodes = defaultdict(list)
        for i, it in nodes.items():
            for f, pre, _ in AUTO_ENT_W:
                for x in it.get(f) or []:
                    self.ent_nodes[f"{pre}:{x}"].append(i)
        self.links = defaultdict(list)
        for e in base.entities["links"].values():
            l = e.item
            if e.status == "disabled":
                continue
            a, b = l.get("from", ""), l.get("to", "")
            if a.startswith("node:") and b.startswith("node:"):
                self.links[a[5:]].append((b[5:], l.get("type"), l.get("id")))
                self.links[b[5:]].append((a[5:], l.get("type"), l.get("id")))

    def scores(self, main: str, tc: float, span: float, themes: bool = True) -> list[dict]:
        span = max(span, AUTO_MIN_SPAN)
        a, b = tc - span / 2, tc + span / 2

        def prox(o):
            x = self.tp.get(o)
            if x is None:
                return 0.0
            if a <= x <= b:
                return 1.0
            d = a - x if x < a else x - b
            return max(0.0, 1 - d / span)

        def ok(t):
            return t != main and (themes or self.kind.get(t) != "theme")

        out: dict[str, dict] = {}
        main_scope = self.scope[main]
        for tp, nid in self.events[main]:
            if tp < a or tp > b:
                continue
            wp = 1 - 0.5 * abs(tp - tc) / (span / 2)
            it = self.nodes[nid]
            ev: dict[str, list] = {}

            def bump(t, k, v, key):
                if not ok(t) or v <= 0:
                    return
                x = ev.setdefault(t, [0.0, defaultdict(set)])
                x[0] += v
                x[1][k].add(key)

            for t in self.node_roots.get(nid, ()):
                bump(t, "common", 1, nid)
            for o, ty, _ in self.links.get(nid, ()):
                if o not in self.nodes or o in main_scope:
                    continue
                v = AUTO_LINK_W.get(ty, 2) * prox(o)
                for t in self.node_roots.get(o, ()):
                    bump(t, "links", v, o)
            for f, pre, w in AUTO_ENT_W:
                for x in it.get(f) or []:
                    ref = f"{pre}:{x}"
                    lst = self.ent_nodes.get(ref, [])
                    if len(lst) < 2:
                        continue
                    rar = 1 / math.log2(1 + len(lst))
                    best: dict[str, float] = {}
                    for o in lst:
                        if o == nid:
                            continue
                        p = prox(o)
                        if not p:
                            continue
                        for t in self.node_roots.get(o, ()):
                            if best.get(t, 0) < p:
                                best[t] = p
                    for t, p in best.items():
                        bump(t, f, w * rar * p, x)
            for t, (v, why) in ev.items():
                r = out.setdefault(t, {"id": t, "score": 0.0, "why": defaultdict(set)})
                r["score"] += wp * min(v, AUTO_CAP)
                for k, s in why.items():
                    r["why"][k] |= s
        return sorted(out.values(), key=lambda r: -r["score"])



def cmd_related(args) -> int:
    rep = Report()
    base = Base(args.root, rep)
    base.load()
    idx = RelatedIndex(base)
    themes = not args.no_themes
    if args.gaps:
        total = 0
        for r in idx.roots:
            evs = idx.events[r]
            if not evs:
                continue
            first, last = int(evs[0][0] // 10 * 10), int(evs[-1][0] // 10 * 10)
            holes = []
            for dec in range(first, last + 1, 10):
                if not any(dec <= tp < dec + 10 for tp, _ in evs):
                    continue
                res = [x for x in idx.scores(r, dec + 5, args.range, themes) if x["score"] >= AUTO_FLOOR]
                if not res:
                    holes.append(f"{dec}s")
            if holes:
                total += len(holes)
                print(f"{r:16} {len(holes):3}  {' '.join(holes)}")
        print(f"\n{total} décennie(s) sans secondaire au-dessus du plancher ({AUTO_FLOOR}), plage {args.range} ans"
              f", {'thèmes inclus' if themes else 'sans les thèmes'}")
        return 0
    if not args.timeline or not args.date:
        print("usage : tldb.py related <timeline> <date>  (ou --gaps)", file=sys.stderr)
        return 1
    if args.timeline not in idx.roots:
        print(f"timeline introuvable : {args.timeline} (racines : {', '.join(idx.roots)})", file=sys.stderr)
        return 1
    tc = parse_when(args.date)
    if tc is None:
        print(f"date illisible : {args.date} (AAAA, AAAA-MM, AAAA-MM-JJ ou année décimale)", file=sys.stderr)
        return 1
    res = idx.scores(args.timeline, tc, args.range, themes)
    eff = max(args.range, AUTO_MIN_SPAN)
    print(f"{args.timeline} · {args.date} · plage {args.range:g} ans, fenêtre de calcul {tc - eff / 2:.1f} – {tc + eff / 2:.1f}"
          f" · {'thèmes inclus' if themes else 'sans les thèmes'}")
    print(f"{'score':>7}  {'timeline':16} {'nature':7} " + " ".join(f"{v:>7}" for v in AUTO_WHY.values()))
    for r in res[: args.top]:
        flag = "" if r["score"] >= AUTO_FLOOR else "  (sous le plancher)"
        print(f"{r['score']:7.1f}  {r['id']:16} {idx.kind.get(r['id'], ''):7} "
              + " ".join(f"{len(r['why'].get(k, ())):7}" for k in AUTO_WHY) + flag)
    if not res:
        print("  aucune candidate")
    if args.verbose:
        for r in res[: args.top]:
            print(f"\n# {r['id']}")
            for k, s in r["why"].items():
                print(f"  {AUTO_WHY[k]:8} {', '.join(sorted(s)[:12])}{' …' if len(s) > 12 else ''}")
    return 0
