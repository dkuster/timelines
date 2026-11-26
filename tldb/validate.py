"""Contrôles sémantiques et commande validate."""
from __future__ import annotations

import sys
from collections import defaultdict

from .watch import check_watch
from .model import Base, Entity, Report, label, COLLECTIONS, COLLECTION_TO_PREFIX, SUMMARY_MAX, BIO_MAX, SYMMETRIC_LINKS, lt_langs
from .dates import parse_date, cmp_coarse, check_date, check_range
from .schemas import build_validators, check_schemas
from .scope import node_homes, node_children, timeline_scope


# --------------------------------------------------------------------------- semantic checks

REF_FIELDS = {
    # collection : [(champ, collection cible, est une liste)]
    "nodes": [("persons", "persons", True), ("places", "places", True),
              ("organizations", "organizations", True), ("works", "works", True)],
    "persons": [("birth_place", "places", False), ("death_place", "places", False)],
    "places": [("within", "places", False)],
    "organizations": [("parent", "organizations", False)],
    "works": [("authors", "persons", True), ("organizations", "organizations", True), ("published_in", "works", False)],
    "ideas": [("broader", "ideas", True), ("timeline", "nodes", False)],
    "sources": [("work", "works", False)],
}



def check_localized(rep, where, name, lt):
    if not isinstance(lt, dict):
        return
    langs = lt_langs(lt)
    if not langs:
        rep.error(where, f"{name} : aucune langue")
    if "orig" in lt and lt["orig"] not in langs:
        rep.error(where, f"{name} : orig = {lt['orig']!r} mais aucun texte dans cette langue")
    for d in lt.get("draft", []) or []:
        if d not in langs:
            rep.error(where, f"{name} : langue {d!r} marquée draft mais absente")


def walk_localized(item: dict):
    for key in ("title", "name", "full_name", "occupation", "summary", "bio", "caption", "definition", "appraisal"):
        if isinstance(item.get(key), dict):
            yield key, item[key]
    for i, ph in enumerate(item.get("phases", []) or []):
        for key in ("label", "summary"):
            if isinstance(ph, dict) and isinstance(ph.get(key), dict):
                yield f"phases[{i}].{key}", ph[key]
    for i, m in enumerate(item.get("milestones", []) or []):
        if isinstance(m, dict) and isinstance(m.get("note"), dict):
            yield f"milestones[{i}].note", m["note"]
    for i, m in enumerate(item.get("memberships", []) or []):
        if isinstance(m, dict) and isinstance(m.get("role"), dict):
            yield f"memberships[{i}].role", m["role"]
    view = item.get("view")
    if isinstance(view, dict) and isinstance(view.get("label"), dict):
        yield "view.label", view["label"]


def check_cycles(rep, base: Base, coll: str, parents_of):
    ents = base.entities[coll]
    state = {}

    def visit(i, stack):
        state[i] = 1
        for p in parents_of(ents[i].item):
            if p not in ents:
                continue
            if state.get(p) == 1:
                cycle = stack[stack.index(p):] + [p] if p in stack else [i, p]
                rep.error(f"{base.rel(ents[i].file)} > {coll}/{i}", "cycle : " + " -> ".join(cycle))
            elif state.get(p) is None:
                visit(p, stack + [p])
        state[i] = 2

    sys.setrecursionlimit(max(10000, len(ents) * 4))
    for i in ents:
        if state.get(i) is None:
            visit(i, [i])


def check_semantics(base: Base, check_media_files: bool):
    rep = base.report

    def where(e: Entity):
        return f"{base.rel(e.file)} > {e.collection}/{e.id}"

    def ref_target(ref: str, w: str, owner: Entity | None):
        target = base.get(ref)
        if target is None:
            rep.error(w, f"référence introuvable : {ref}")
        elif owner is not None and owner.status == "final" and target.status == "disabled":
            rep.warn(w, f"entité final qui référence une entité disabled : {ref}")
        return target

    def ref_slug(coll: str, ident: str, w: str, owner: Entity):
        ref_target(f"{COLLECTION_TO_PREFIX[coll]}:{ident}", w, owner)

    for coll, ents in base.entities.items():
        for e in ents.values():
            it, w = e.item, where(e)
            # références directes
            for fld, target, is_list in REF_FIELDS.get(coll, []):
                vals = it.get(fld)
                if vals is None:
                    continue
                for v in (vals if is_list else [vals]):
                    if isinstance(v, str):
                        ref_slug(target, v, w, e)
            for s in it.get("sources", []) or []:
                if isinstance(s, dict) and isinstance(s.get("ref"), str):
                    ref_slug("sources", s["ref"], w, e)
            # textes multilingues
            for name, lt in walk_localized(it):
                check_localized(rep, w, name, lt)
                limit = {"summary": SUMMARY_MAX, "bio": BIO_MAX, "definition": BIO_MAX, "appraisal": BIO_MAX}.get(name)
                if limit:
                    for lang in lt_langs(lt):
                        if isinstance(lt[lang], str) and len(lt[lang]) > limit:
                            rep.warn(w, f"{name}.{lang} : {len(lt[lang])} caractères (max conseillé {limit})")
            # appartenances (personnes)
            for m in it.get("memberships", []) or []:
                if not isinstance(m, dict):
                    continue
                if isinstance(m.get("org"), str):
                    ref_slug("organizations", m["org"], w, e)
                ta = check_date(rep, f"{w} > memberships {m.get('org')}", m.get("from"))
                tb = check_date(rep, f"{w} > memberships {m.get('org')}", m.get("to"))
                check_range(rep, f"{w} > memberships {m.get('org')}", ta, tb, "from", "to")
            # phases (personnes)
            for ph in it.get("phases", []) or []:
                if isinstance(ph, dict):
                    lw = f"{w} > phases {label(ph.get('label'))!r}"
                    check_range(rep, lw, check_date(rep, lw, ph.get("from")), check_date(rep, lw, ph.get("to")), "from", "to")
            # dates
            for a, b in (("start", "end"), ("born", "died"), ("founded", "dissolved"), ("written_start", "written_end")):
                ta = check_date(rep, f"{w} > {a}", it.get(a))
                tb = check_date(rep, f"{w} > {b}", it.get(b))
                check_range(rep, w, ta, tb, a, b)
            check_date(rep, f"{w} > date", it.get("date"))
            for h in it.get("historical_names", []) or []:
                if isinstance(h, dict):
                    ta = check_date(rep, f"{w} > historical_names", h.get("from"))
                    tb = check_date(rep, f"{w} > historical_names", h.get("to"))
                    check_range(rep, f"{w} > historical_names {h.get('name')!r}", ta, tb, "from", "to")

    # nœuds : parents, racines, sources
    nodes = base.entities["nodes"]
    for e in nodes.values():
        it, w = e.item, where(e)
        seen = set()
        for p in it.get("parents", []) or []:
            pid = p.get("id") if isinstance(p, dict) else None
            if not isinstance(pid, str):
                continue
            if pid == e.id:
                rep.error(w, "un nœud ne peut pas être son propre parent")
                continue
            if pid in seen:
                rep.error(w, f"parent en double : {pid}")
            seen.add(pid)
            parent = ref_target(f"node:{pid}", w, e)
            if parent is not None:
                check_child_within_parent(rep, w, it, parent.item)
        if it.get("parents") == [] and "view" not in it:
            rep.warn(w, "racine sans bloc view")
        if e.status == "final" and not it.get("sources"):
            rep.warn(w, "nœud final sans source")

    check_cycles(rep, base, "nodes", lambda it: [p.get("id") for p in it.get("parents", []) or [] if isinstance(p, dict)])
    check_scope(rep, base, where)
    check_cycles(rep, base, "places", lambda it: [it["within"]] if isinstance(it.get("within"), str) else [])
    # kind et coords des lieux : obligatoires, contrôlés par schema/places.schema.json
    check_cycles(rep, base, "ideas", lambda it: [b for b in it.get("broader", []) or [] if isinstance(b, str)])
    check_works_dates(rep, base, where)
    check_ideas(rep, base, where, ref_slug)
    check_cycles(rep, base, "organizations", lambda it: [it["parent"]] if isinstance(it.get("parent"), str) else [])

    # liens
    seen_links = {}
    for e in base.entities["links"].values():
        it, w = e.item, where(e)
        f, t, ty = it.get("from"), it.get("to"), it.get("type")
        if not (isinstance(f, str) and isinstance(t, str)):
            continue
        ref_target(f, w, e)
        ref_target(t, w, e)
        if f == t:
            rep.error(w, "un lien relie une entité à elle-même")
        key = (f, t, ty)
        rkey = (t, f, ty)
        if key in seen_links:
            rep.error(w, f"doublon du lien {seen_links[key]}")
        elif ty in SYMMETRIC_LINKS and rkey in seen_links:
            rep.error(w, f"lien symétrique déjà présent dans l'autre sens : {seen_links[rkey]}")
        seen_links.setdefault(key, e.id)

    # médias
    primaries = {}
    for e in base.entities["media"].values():
        it, w = e.item, where(e)
        if isinstance(it.get("file"), str) and check_media_files:
            if not (base.root / "media" / it["file"]).is_file():
                rep.error(w, f"fichier introuvable : media/{it['file']}")
        seg = it.get("segment")
        if isinstance(seg, dict) and isinstance(seg.get("end"), str) and isinstance(seg.get("start"), str):
            if seg["end"] <= seg["start"]:
                rep.error(w, "segment : end doit suivre start")
        for a in it.get("about", []) or []:
            if not isinstance(a, dict) or not isinstance(a.get("ref"), str):
                continue
            ref_target(a["ref"], w, e)
            if a.get("primary") and e.status != "disabled":
                k = (a["ref"], a.get("role"))
                if k in primaries:
                    rep.error(w, f"deux médias primary pour {a['ref']} / {a.get('role')} (aussi : {primaries[k]})")
                primaries[k] = e.id

    # notes
    for stem, (p, fm) in base.notes.items():
        w = base.rel(p)
        for ref in fm.get("about", []) or []:
            if isinstance(ref, str):
                ref_target(ref, w, None)
        for s in fm.get("sources", []) or []:
            if isinstance(s, dict) and isinstance(s.get("ref"), str):
                ref_target(f"source:{s['ref']}", w, None)


def check_works_dates(rep, base: Base, where):
    for e in base.entities["works"].values():
        it = e.item
        ws = parse_date((it.get("written_start") or {}).get("date", ""))
        pub = parse_date((it.get("date") or {}).get("date", ""))
        if ws and pub and cmp_coarse(pub, ws) < 0:
            rep.error(where(e), "date (publication) antérieure à written_start")
        if it.get("written_end") and not it.get("written_start"):
            rep.warn(where(e), "written_end sans written_start")


def milestone_date(base: Base, m: dict):
    """Date d'un jalon : la sienne, sinon la publication de l'œuvre, sinon le début du nœud."""
    work = base.entities["works"].get(m.get("work"))
    node = base.entities["nodes"].get(m.get("node"))
    for dv in (m.get("date"), work.item.get("date") if work else None, node.item.get("start") if node else None):
        t = parse_date(dv.get("date", "")) if isinstance(dv, dict) else None
        if t:
            return t
    return None


def check_ideas(rep, base: Base, where, ref_slug):
    for e in base.entities["ideas"].values():
        it, w = e.item, where(e)
        tl = it.get("timeline")
        if isinstance(tl, str) and tl in base.entities["nodes"] and base.entities["nodes"][tl].item.get("parents") != []:
            rep.warn(w, f"timeline {tl} n'est pas une racine")
        if e.id in (it.get("broader") or []):
            rep.error(w, "une idée ne peut pas être plus générale qu'elle-même")
        prev = None
        for i, m in enumerate(it.get("milestones", []) or []):
            if not isinstance(m, dict):
                continue
            mw = f"{w} > milestones[{i}] ({m.get('stage')})"
            if isinstance(m.get("work"), str):
                ref_slug("works", m["work"], mw, e)
            if isinstance(m.get("node"), str):
                ref_slug("nodes", m["node"], mw, e)
            for fld, coll in (("persons", "persons"), ("organizations", "organizations")):
                for v in m.get(fld, []) or []:
                    if isinstance(v, str):
                        ref_slug(coll, v, mw, e)
            for s in m.get("sources", []) or []:
                if isinstance(s, dict) and isinstance(s.get("ref"), str):
                    ref_slug("sources", s["ref"], mw, e)
            check_date(rep, mw, m.get("date"))
            t = milestone_date(base, m)
            if t is None:
                rep.error(mw, "aucune date calculable (ni date, ni œuvre datée, ni nœud daté)")
                continue
            if prev and cmp_coarse(t, prev) < 0:
                rep.warn(mw, "jalon antérieur au précédent : jalons à remettre dans l'ordre chronologique")
            prev = t


def check_child_within_parent(rep, w, child, parent):
    cs = parse_date((child.get("start") or {}).get("date", ""))
    ce = parse_date((child.get("end") or {}).get("date", "")) or cs
    ps = parse_date((parent.get("start") or {}).get("date", ""))
    pe = parse_date((parent.get("end") or {}).get("date", ""))
    if cs and ps and cmp_coarse(cs, ps) < 0:
        rep.warn(w, f"commence avant son parent {parent.get('id')}")
    if ce and pe and not parent.get("ongoing") and cmp_coarse(ce, pe) > 0:
        rep.warn(w, f"se termine après son parent {parent.get('id')}")



def check_scope(rep: Report, base: Base, where):
    nodes = base.entities["nodes"]
    by_file = defaultdict(list)
    for e in nodes.values():
        by_file[e.file].append(e)
    for f, ents in by_file.items():
        roots = [e.id for e in ents if e.item.get("parents") == []]
        if len(roots) != 1:
            rep.error(base.rel(f), f"un fichier de nœuds doit contenir exactement une racine (trouvé : {', '.join(roots) or 'aucune'})")
    homes = node_homes(base)
    children = node_children(base)
    scopes = {r: timeline_scope(r, homes, children) for r in set(homes.values())}
    for e in nodes.values():
        it, w = e.item, where(e)
        if it.get("shared") and it.get("parents") == []:
            rep.warn(w, "shared sur une racine : sans effet")
        for p in it.get("parents", []) or []:
            if isinstance(p, dict) and p.get("deep") and homes.get(p.get("id")) == homes.get(e.id):
                rep.warn(w, f"deep vers {p.get('id')}, de la même timeline : sans effet sur cette timeline")
        home = homes.get(e.id)
        if home and e.id != home and e.status != "disabled" and e.id not in scopes[home]:
            rep.warn(w, f"n'apparaît pas dans sa propre timeline {home} : aucun chemin depuis la racine "
                        "(rattacher à un nœud de la timeline, ou déplacer le nœud dans le bon fichier)")



def cmd_validate(args) -> int:
    rep = Report()
    base = Base(args.root, rep)
    validators = build_validators(args.root, rep)
    base.load()
    if validators:
        check_schemas(base, validators)
    check_semantics(base, check_media_files=not args.no_media_files)
    check_watch(base, validators)
    for line in rep.errors + ([] if args.quiet else rep.warnings):
        print(line)
    counts = ", ".join(f"{c} {len(base.entities[c])}" for c in COLLECTIONS) + f", notes {len(base.notes)}"
    print(f"\n{counts}")
    print(f"{len(rep.errors)} erreur(s), {len(rep.warnings)} avertissement(s)")
    return 1 if rep.errors else 0
