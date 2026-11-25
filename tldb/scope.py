"""Portée des timelines : quels nœuds chaque timeline (et chaque ligne) affiche."""
from __future__ import annotations

from collections import defaultdict

from .model import Base, Entity

# --------------------------------------------------------------------------- portée des timelines
#
# Chaque fichier de data/nodes/ porte une timeline : sa racine (nœud sans parent).
# Un enfant c d'un nœud p présent dans la timeline T y figure si :
#   - c appartient à T (même fichier)               raison « origine »
#   - p appartient à T (rattachement direct de c)    raison « rattachement »
#   - c est shared : il suit son parent partout      raison « shared »
#   - un rattachement deep est traversé plus haut    raison « deep »
# Les descendants d'un nœud étranger ne suivent donc pas, sauf shared ou deep.
# Les lignes des viewers en découlent : voir lanes() ci-dessous.

def node_homes(base: Base) -> dict[str, str]:
    """id du nœud -> id de la racine de son fichier (absent si le fichier n'a pas exactement une racine)."""
    by_file = defaultdict(list)
    for e in base.entities["nodes"].values():
        by_file[e.file].append(e)
    homes = {}
    for ents in by_file.values():
        roots = [e for e in ents if e.item.get("parents") == []]
        if len(roots) == 1:
            for e in ents:
                homes[e.id] = roots[0].id
    return homes


def node_children(base: Base) -> dict[str, list[tuple[Entity, bool]]]:
    """id du parent -> [(enfant, rattachement deep)], nœuds disabled exclus."""
    children = defaultdict(list)
    for e in base.entities["nodes"].values():
        if e.status == "disabled":
            continue
        for p in e.item.get("parents", []) or []:
            if isinstance(p, dict) and isinstance(p.get("id"), str):
                children[p["id"]].append((e, bool(p.get("deep"))))
    return children


def timeline_scope(root_id: str, homes, children, rule: bool = True) -> dict[str, tuple[str, str]]:
    """Nœuds affichés dans la timeline root_id : id -> (raison, parent par lequel il est arrivé).
    rule=False : ancien comportement, tout le sous-arbre (pour comparer)."""
    home = homes.get(root_id, root_id)
    out: dict[str, tuple[str, str]] = {}
    seen, seen_deep = set(), set()
    stack = [(root_id, False)]
    while stack:
        pid, deep = stack.pop()
        for c, edge_deep in children.get(pid, []):
            d = deep or edge_deep
            if not rule:
                reason = "sous-arbre"
            elif homes.get(c.id) == home:
                reason = "origine"
            elif homes.get(pid) == home:
                reason = "rattachement"
            elif c.item.get("shared"):
                reason = "shared"
            elif d:
                reason = "deep"
            else:
                continue
            if d:
                if c.id in seen_deep:
                    continue
                seen_deep.add(c.id)
            elif c.id in seen:
                continue
            seen.add(c.id)
            out.setdefault(c.id, (reason, pid))
            stack.append((c.id, d))
    return out


# --------------------------------------------------------------------------- lignes des viewers
#
# Une « ligne » = une racine, ou une sous-timeline de type era (ayant des enfants) de la même timeline,
# rattachée directement à la ligne. Ses autres descendants y sont aplatis avec leur niveau d'imbrication.
# Même règle d'appartenance que timeline_scope ; calculée ici une fois pour toutes au build,
# les viewers ne font plus que la mise en page (couleurs, barres, points).

def _start_year(item: dict) -> float:
    """Début de la date de départ en année décimale (comme span(start)[0] dans les viewers)."""
    from .dates import year_span
    s = year_span((item.get("start") or {}).get("date"))
    return s[0] if s else 0.0


def lanes(base: Base, homes: dict[str, str] | None = None) -> list[dict]:
    """Arbre des lignes : [{id, sub: [...], items: [[id, niveau, conteneur 0/1], ...]}], racines dans l'ordre des fichiers."""
    homes = homes if homes is not None else node_homes(base)
    nodes = {i: e.item for i, e in base.entities["nodes"].items() if e.status != "disabled"}
    children: dict[str, list[dict]] = defaultdict(list)
    for it in nodes.values():
        for p in it.get("parents", []) or []:
            if isinstance(p, dict) and p.get("id") in nodes:
                children[p["id"]].append(it)
    t0 = {i: _start_year(it) for i, it in nodes.items()}

    def order0(it):
        ps = it.get("parents") or []
        return (ps[0].get("order") or 0) if ps and isinstance(ps[0], dict) else 0

    for arr in children.values():
        arr.sort(key=lambda c: (t0[c["id"]], order0(c)))   # tri stable, comme Array.sort

    def home(it):
        return homes.get(it["id"], it["id"])

    def is_lane(it):
        return it.get("type") == "era" and bool(children.get(it["id"]))

    def make(n: dict) -> dict:
        lane = {"id": n["id"], "sub": [], "items": []}
        h = home(n)
        seen, seen_deep, via = set(), set(), set()

        def walk(p, level, deep):
            for c in children.get(p["id"], []):
                edge = next((q for q in c.get("parents", []) if isinstance(q, dict) and q.get("id") == p["id"]), None)
                d = deep or bool(edge and edge.get("deep"))
                if not (d or home(c) == h or home(p) == h or c.get("shared")):
                    continue
                if is_lane(c) and level == 0 and home(c) == h:
                    lane["sub"].append(make(c))
                    continue
                if d:
                    if c["id"] in seen_deep:
                        continue
                    seen_deep.add(c["id"])
                elif c["id"] in seen:
                    continue
                via.add(p["id"])
                if c["id"] not in seen:
                    seen.add(c["id"])
                    lane["items"].append([c["id"], level, 0])
                walk(c, level + 1, d)

        walk(n, 0, False)
        for it in lane["items"]:
            it[2] = 1 if it[0] in via else 0
        return lane

    return [make(it) for it in nodes.values() if not it.get("parents")]
