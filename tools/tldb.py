#!/usr/bin/env python3
"""tldb — outil de la base de timelines.

Commandes :
  validate   vérifie schémas, références, cycles, dates, médias et notes
  format     réécrit les fichiers JSON au format canonique (--check : signale seulement)
  index      liste les entités (id, statut, titre), filtrables par texte
  tree       affiche la hiérarchie des nœuds à partir d'une racine
  scope      montre ce que chaque timeline importe des autres (--excluded : ce que la règle écarte)
  related    secondaires que le mode automatique du viewer mobile proposerait (--gaps : décennies sans candidate)

Dépendances : Python 3.9+, jsonschema >= 4.18, PyYAML
  pip install "jsonschema>=4.18" pyyaml
  (sous Linux, jsonschema est installé automatiquement avec pip --user s'il manque ou est trop ancien)

Par défaut, la base est le dossier parent de tools/. Option --root pour en désigner un autre.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

COLLECTIONS = ["nodes", "persons", "places", "organizations", "works", "ideas", "sources", "links", "media"]
PREFIX_TO_COLLECTION = {
    "node": "nodes", "person": "persons", "place": "places", "org": "organizations",
    "work": "works", "idea": "ideas", "source": "sources", "media": "media",
}
COLLECTION_TO_PREFIX = {v: k for k, v in PREFIX_TO_COLLECTION.items()}
DISPLAY_LANGS = ["fr", "en", "de"]
SUMMARY_MAX = 300
BIO_MAX = 1200
LINE_WIDTH = 100
SYMMETRIC_LINKS = {"comparable_to"}
NON_LANG_KEYS = {"orig", "draft"}


# --------------------------------------------------------------------------- report

@dataclass
class Report:
    errors: list = field(default_factory=list)
    warnings: list = field(default_factory=list)

    def error(self, where: str, msg: str):
        self.errors.append(f"ERREUR  {where} : {msg}")

    def warn(self, where: str, msg: str):
        self.warnings.append(f"AVERT.  {where} : {msg}")


# --------------------------------------------------------------------------- loading

@dataclass
class Entity:
    collection: str
    item: dict
    file: Path

    @property
    def id(self):
        return self.item.get("id")

    @property
    def status(self):
        return self.item.get("status", "draft")


class Base:
    def __init__(self, root: Path, report: Report):
        self.root = root
        self.report = report
        self.files: dict[Path, dict] = {}           # chemin -> contenu JSON
        self.entities: dict[str, dict[str, Entity]] = {c: {} for c in COLLECTIONS}
        self.notes: dict[str, tuple[Path, dict]] = {}

    def rel(self, p: Path) -> str:
        try:
            return p.relative_to(self.root).as_posix()
        except ValueError:
            return str(p)

    def load(self):
        data = self.root / "data"
        if not data.is_dir():
            self.report.error(self.rel(data), "dossier data/ introuvable")
            return
        paths = sorted(data.glob("*.json")) + sorted((data / "nodes").glob("*.json"))
        for p in paths:
            try:
                content = json.loads(p.read_text(encoding="utf-8-sig"))
            except json.JSONDecodeError as e:
                self.report.error(self.rel(p), f"JSON invalide ligne {e.lineno}, colonne {e.colno} : {e.msg}")
                continue
            if not isinstance(content, dict):
                self.report.error(self.rel(p), "le fichier doit contenir un objet {collection, version, items}")
                continue
            coll = content.get("collection")
            if coll not in COLLECTIONS:
                self.report.error(self.rel(p), f"collection inconnue : {coll!r}")
                continue
            in_nodes_dir = p.parent.name == "nodes" and p.parent.parent == data
            if coll == "nodes" and not in_nodes_dir:
                self.report.error(self.rel(p), "les nœuds doivent être rangés dans data/nodes/")
            if coll != "nodes" and (in_nodes_dir or p.stem != coll):
                self.report.error(self.rel(p), f"la collection {coll} doit être dans data/{coll}.json")
            self.files[p] = content
            for item in content.get("items", []) if isinstance(content.get("items"), list) else []:
                if not isinstance(item, dict) or not isinstance(item.get("id"), str):
                    continue
                ent = Entity(coll, item, p)
                if ent.id in self.entities[coll]:
                    other = self.entities[coll][ent.id]
                    self.report.error(self.rel(p), f"{coll}/{ent.id} : identifiant déjà utilisé dans {self.rel(other.file)}")
                else:
                    self.entities[coll][ent.id] = ent
        self.load_notes()

    def load_notes(self):
        notes_dir = self.root / "notes"
        if not notes_dir.is_dir():
            return
        try:
            import yaml
        except ImportError:
            self.report.error("notes/", "PyYAML manquant : pip install pyyaml")
            return
        for p in sorted(notes_dir.glob("*.md")):
            text = p.read_text(encoding="utf-8-sig")
            m = re.match(r"^---\s*\n(.*?)\n---\s*(\n|$)", text, re.S)
            if not m:
                self.report.error(self.rel(p), "en-tête YAML (--- … ---) manquant en début de fichier")
                continue
            try:
                fm = yaml.safe_load(m.group(1)) or {}
            except yaml.YAMLError as e:
                self.report.error(self.rel(p), f"en-tête YAML invalide : {e}")
                continue
            if not isinstance(fm, dict):
                self.report.error(self.rel(p), "l'en-tête YAML doit être un dictionnaire")
                continue
            self.notes[p.stem] = (p, fm)

    def get(self, ref: str) -> Entity | None:
        prefix, _, ident = ref.partition(":")
        coll = PREFIX_TO_COLLECTION.get(prefix)
        return self.entities[coll].get(ident) if coll else None


# --------------------------------------------------------------------------- schemas

def _jsonschema_version() -> str | None:
    """Version de jsonschema réellement installée (None si absent)."""
    try:
        from importlib.metadata import version
        return version("jsonschema")
    except Exception:
        return None


def _import_jsonschema():
    from jsonschema import Draft202012Validator
    from referencing import Registry, Resource
    from referencing.jsonschema import DRAFT202012
    return Draft202012Validator, Registry, Resource, DRAFT202012


def _auto_install_jsonschema() -> bool:
    """Sous Linux seulement (shell de Claude, dont le Python système fournit jsonschema 3.2) :
    installe jsonschema>=4.18 dans le site utilisateur et le rend importable tout de suite.
    Sans effet sous Windows, où l'installation reste manuelle (voir README)."""
    import importlib
    import site
    import subprocess
    print('tldb : jsonschema >= 4.18 introuvable, installation (pip --user)...', file=sys.stderr)
    r = subprocess.run(
        [sys.executable, "-m", "pip", "install", "--user", "--quiet", "--disable-pip-version-check",
         "--no-warn-script-location", "jsonschema>=4.18"],
        capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr.strip()[-500:], file=sys.stderr)
        return False
    # Le site utilisateur doit passer devant le paquet système (3.2) déjà présent dans sys.path.
    usersite = site.getusersitepackages()
    if usersite in sys.path:
        sys.path.remove(usersite)
    sys.path.insert(0, usersite)
    # Oublier les modules de l'ancienne version chargés par la tentative d'import ratée.
    for name in list(sys.modules):
        if name.split(".")[0] in ("jsonschema", "jsonschema_specifications", "referencing", "rpds", "attr", "attrs"):
            del sys.modules[name]
    importlib.invalidate_caches()
    return True


def build_validators(root: Path, report: Report):
    try:
        Draft202012Validator, Registry, Resource, DRAFT202012 = _import_jsonschema()
    except ImportError:
        found = _jsonschema_version()
        loaded = False
        if sys.platform.startswith("linux") and _auto_install_jsonschema():
            try:
                Draft202012Validator, Registry, Resource, DRAFT202012 = _import_jsonschema()
                loaded = True
            except ImportError:
                pass
        if not loaded:
            what = f"jsonschema {found} trouvé, il faut >= 4.18" if found else "jsonschema absent"
            report.error("tools/", f'{what} : pip install --upgrade "jsonschema>=4.18"')
            return None
    schema_dir = root / "schema"
    if not schema_dir.is_dir():
        report.error("schema/", "dossier schema/ introuvable")
        return None
    schemas, resources = {}, []
    for p in schema_dir.glob("*.schema.json"):
        s = json.loads(p.read_text(encoding="utf-8-sig"))
        s = {**s, "$id": p.resolve().as_uri()}
        schemas[p.name.removesuffix(".schema.json")] = s
        resources.append((s["$id"], Resource.from_contents(s, default_specification=DRAFT202012)))
    registry = Registry().with_resources(resources)
    return {name: Draft202012Validator(s, registry=registry) for name, s in schemas.items()}


def check_schemas(base: Base, validators):
    rep = base.report
    for p, content in base.files.items():
        v = validators.get(content.get("collection"))
        if v is None:
            rep.error(base.rel(p), f"aucun schéma pour {content.get('collection')!r}")
            continue
        for err in sorted(v.iter_errors(content), key=lambda e: list(e.absolute_path)):
            rep.error(base.rel(p), f"{json_path(content, err.absolute_path)} : {friendly(err)}")
    nv = validators.get("notes")
    for stem, (p, fm) in base.notes.items():
        if nv:
            for err in nv.iter_errors(fm):
                rep.error(base.rel(p), f"en-tête {'/'.join(map(str, err.absolute_path)) or '(racine)'} : {err.message}")
        if fm.get("id") != stem:
            rep.error(base.rel(p), f"l'id de la note ({fm.get('id')!r}) doit être le nom du fichier ({stem!r})")


def friendly(err) -> str:
    """Messages lisibles pour les règles qui, sinon, recopient l'élément entier."""
    sch = err.schema
    if err.validator == "oneOf" and all(isinstance(s, dict) and list(s) == ["required"] for s in sch.get("oneOf", [])):
        fields = [s["required"][0] for s in sch["oneOf"]]
        return "il faut exactement un champ parmi " + ", ".join(fields)
    if err.validator == "anyOf" and all(isinstance(s, dict) and list(s) == ["required"] for s in sch.get("anyOf", [])):
        fields = [s["required"][0] for s in sch["anyOf"]]
        return "il faut au moins un champ parmi " + ", ".join(fields)
    if err.validator == "not" and isinstance(sch.get("not"), dict) and list(sch["not"]) == ["required"]:
        return "les champs " + " et ".join(sch["not"]["required"]) + " s'excluent"
    return err.message


def json_path(content, path) -> str:
    """Chemin lisible : nodes/1905-bloody-sunday > start > date."""
    parts = list(path)
    if len(parts) >= 2 and parts[0] == "items":
        try:
            item = content["items"][parts[1]]
            label = f"{content['collection']}/{item.get('id', '#' + str(parts[1]))}"
        except (IndexError, KeyError, TypeError, AttributeError):
            label = f"items[{parts[1]}]"
        rest = parts[2:]
    else:
        label, rest = "(en-tête)", parts
    return label + "".join(f" > {x}" for x in rest)


# --------------------------------------------------------------------------- dates

def parse_date(s: str):
    """'1905-01-22' -> (1905, 1, 22) ; '1914-09' -> (1914, 9) ; '-0043' -> (-43,)."""
    m = re.fullmatch(r"(-?\d{4})(?:-(\d{2})(?:-(\d{2}))?)?", s or "")
    if not m:
        return None
    return tuple(int(x) for x in m.groups() if x is not None)


def is_leap(y: int, julian: bool) -> bool:
    return y % 4 == 0 if julian else (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0))


def valid_date(t, julian=False) -> bool:
    if len(t) >= 2 and not 1 <= t[1] <= 12:
        return False
    if len(t) == 3:
        days = [31, 29 if is_leap(t[0], julian) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        return 1 <= t[2] <= days[t[1] - 1]
    return True


def julian_to_gregorian(y, m, d):
    a = (14 - m) // 12
    yy, mm = y + 4800 - a, m + 12 * a - 3
    jdn = d + (153 * mm + 2) // 5 + 365 * yy + yy // 4 - 32083
    a = jdn + 32044
    b = (4 * a + 3) // 146097
    c = a - 146097 * b // 4
    dd = (4 * c + 3) // 1461
    e = c - 1461 * dd // 4
    mo = (5 * e + 2) // 153
    return (100 * b + dd - 4800 + mo // 10, mo + 3 - 12 * (mo // 10), e - (153 * mo + 2) // 5 + 1)


def cmp_coarse(a, b) -> int:
    n = min(len(a), len(b))
    return (a[:n] > b[:n]) - (a[:n] < b[:n])


def check_date(rep: Report, where: str, dv) -> tuple | None:
    if not isinstance(dv, dict):
        return None
    t = parse_date(dv.get("date"))
    if t is None:
        return None  # déjà signalé par le schéma
    if not valid_date(t):
        rep.error(where, f"date inexistante : {dv['date']}")
        return None
    if dv.get("calendar") == "julian":
        o = parse_date(dv.get("original", ""))
        if o is None:
            rep.error(where, f"date julienne d'origine illisible : {dv.get('original')!r} (format YYYY-MM-DD attendu)")
        elif not valid_date(o, julian=True):
            rep.error(where, f"date julienne inexistante : {dv['original']}")
        elif len(o) == 3 and len(t) == 3:
            g = julian_to_gregorian(*o)
            if g != t:
                rep.error(where, f"julien {dv['original']} = grégorien {g[0]:04d}-{g[1]:02d}-{g[2]:02d}, pas {dv['date']}")
    return t


def check_range(rep, where, start, end, label_start="start", label_end="end"):
    if start and end and cmp_coarse(end, start) < 0:
        rep.error(where, f"{label_end} antérieure à {label_start}")


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


def lt_langs(lt: dict) -> list[str]:
    return [k for k in lt if k not in NON_LANG_KEYS]


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


# --------------------------------------------------------------------------- formatting

# --------------------------------------------------------------------------- portée des timelines
#
# Chaque fichier de data/nodes/ porte une timeline : sa racine (nœud sans parent).
# Un enfant c d'un nœud p présent dans la timeline T y figure si :
#   - c appartient à T (même fichier)               raison « origine »
#   - p appartient à T (rattachement direct de c)    raison « rattachement »
#   - c est shared : il suit son parent partout      raison « shared »
#   - un rattachement deep est traversé plus haut    raison « deep »
# Les descendants d'un nœud étranger ne suivent donc pas, sauf shared ou deep.
# Même règle que buildLanes() dans viewer/desktop.html.

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


def canonical_order(validators) -> dict[str, list[str]]:
    order = {}
    for coll in COLLECTIONS:
        v = validators.get(coll) if validators else None
        if v is not None:
            order[coll] = list(v.schema["$defs"]["item"]["properties"].keys())
    return order


def reorder(item: dict, keys: list[str]) -> dict:
    out = {k: item[k] for k in keys if k in item}
    out.update({k: v for k, v in item.items() if k not in out})
    return out


def dumps(obj, indent=0, force_expand=False) -> str:
    pad, inner = " " * indent, " " * (indent + 2)
    if not force_expand:
        compact = json.dumps(obj, ensure_ascii=False, separators=(", ", ": "))
        if not isinstance(obj, (dict, list)) or len(compact) + indent <= LINE_WIDTH:
            return compact
    if isinstance(obj, dict):
        if not obj:
            return "{}"
        body = [f"{inner}{json.dumps(k, ensure_ascii=False)}: {dumps(v, indent + 2)}" for k, v in obj.items()]
        return "{\n" + ",\n".join(body) + "\n" + pad + "}"
    if not obj:
        return "[]"
    return "[\n" + ",\n".join(inner + dumps(v, indent + 2) for v in obj) + "\n" + pad + "]"


def format_collection(content: dict, order: dict) -> str:
    coll = content.get("collection")
    head = {k: content[k] for k in ("$schema", "collection", "version") if k in content}
    items = content.get("items", [])
    items = [reorder(i, order.get(coll, [])) if isinstance(i, dict) else i for i in items]
    rest = {k: v for k, v in content.items() if k not in head and k != "items"}
    lines = [f"  {json.dumps(k, ensure_ascii=False)}: {dumps(v, 2)}" for k, v in {**head, **rest}.items()]
    if items:
        body = ",\n".join("    " + dumps(i, 4, force_expand=True) for i in items)
        lines.append(f'  "items": [\n{body}\n  ]')
    else:
        lines.append('  "items": []')
    return "{\n" + ",\n".join(lines) + "\n}\n"


# --------------------------------------------------------------------------- display helpers

def label(lt, langs=DISPLAY_LANGS) -> str:
    if not isinstance(lt, dict):
        return str(lt or "")
    for l in langs + ([lt["orig"]] if "orig" in lt else []):
        if l in lt:
            return lt[l]
    keys = lt_langs(lt)
    return lt[keys[0]] if keys else ""


def entity_label(e: Entity) -> str:
    it = e.item
    if e.collection == "links":
        return f"{it.get('from')} {it.get('type')} {it.get('to')}"
    if e.collection == "sources":
        return it.get("title", "")
    if e.collection == "media":
        return label(it.get("title")) or f"{it.get('kind', '')} {it.get('file') or it.get('url') or ''}".strip()
    return label(it.get("title") or it.get("name"))


def searchable(e: Entity) -> str:
    it = e.item
    parts = [e.id or ""]
    for key in ("title", "name", "full_name"):
        v = it.get(key)
        if isinstance(v, dict):
            parts += [v[k] for k in lt_langs(v)]
        elif isinstance(v, str):
            parts.append(v)
    parts += it.get("aliases", []) or []
    parts += [h.get("name", "") for h in it.get("historical_names", []) or [] if isinstance(h, dict)]
    return " ".join(parts).lower()


# --------------------------------------------------------------------------- commands

def cmd_validate(args) -> int:
    rep = Report()
    base = Base(args.root, rep)
    validators = build_validators(args.root, rep)
    base.load()
    if validators:
        check_schemas(base, validators)
    check_semantics(base, check_media_files=not args.no_media_files)
    for line in rep.errors + ([] if args.quiet else rep.warnings):
        print(line)
    counts = ", ".join(f"{c} {len(base.entities[c])}" for c in COLLECTIONS) + f", notes {len(base.notes)}"
    print(f"\n{counts}")
    print(f"{len(rep.errors)} erreur(s), {len(rep.warnings)} avertissement(s)")
    return 1 if rep.errors else 0


def cmd_format(args) -> int:
    rep = Report()
    validators = build_validators(args.root, rep)
    order = canonical_order(validators)
    base = Base(args.root, rep)
    base.load()
    changed = []
    for p, content in base.files.items():
        new = format_collection(content, order)
        with open(p, encoding="utf-8", newline="") as fh:   # newline="" : voir les CRLF tels quels
            current = fh.read()
        if current != new:
            changed.append(base.rel(p))
            if not args.check:
                with open(p, "w", encoding="utf-8", newline="\n") as fh:   # LF, sans BOM
                    fh.write(new)
    for line in rep.errors:
        print(line)
    verb = "à reformater" if args.check else "reformaté(s)"
    print(f"{len(changed)} fichier(s) {verb}" + (" : " + ", ".join(changed) if changed else ""))
    return 1 if (rep.errors or (args.check and changed)) else 0


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


# --------------------------------------------------------------------------- related
# Secondaires automatiques du viewer mobile (specs/viewer-mobile.md § 16) : même formule que autoScores()
# dans viewer/mobile.html. Toute modification des poids doit être faite aux deux endroits.

AUTO_LINK_W = {"causes": 5, "leads_to": 5, "reaction_to": 5, "opposes": 5,
               "influences": 4, "continues": 4, "comparable_to": 3, "references": 2}
AUTO_ENT_W = [("persons", "person", 2), ("organizations", "org", 2), ("works", "work", 1), ("places", "place", 0.5)]
AUTO_CAP, AUTO_FLOOR, AUTO_MIN_SPAN = 6, 1, 3   # fenêtre de calcul d'au moins 3 ans
AUTO_WHY = {"links": "liens", "persons": "pers.", "organizations": "org.", "works": "œuvres", "places": "lieux", "common": "communs"}


def _days_in_year(y):
    return 366 if (y % 4 == 0 and y % 100 != 0) or y % 400 == 0 else 365


def _doy(y, m, d):
    ml = [31, 29 if _days_in_year(y) == 366 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return sum(ml[:m - 1]) + d


def year_point(date: str) -> float | None:
    """Milieu de la période désignée par une date ISO partielle, en année fractionnaire (comme _tp du viewer)."""
    m = re.match(r"^(-?\d+)(?:-(\d\d))?(?:-(\d\d))?$", str(date or "").strip())
    if not m:
        return None
    y = int(m.group(1)); mo = int(m.group(2) or 0); d = int(m.group(3) or 0)
    D = _days_in_year(y)
    if d:
        a = y + (_doy(y, mo, d) - 1) / D
        return a + 0.5 / D
    if mo:
        a = y + (_doy(y, mo, 1) - 1) / D
        b = y + 1 if mo == 12 else y + (_doy(y, mo + 1, 1) - 1) / D
        return (a + b) / 2
    return y + 0.5


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


def parse_when(s: str) -> float | None:
    try:
        if re.match(r"^-?\d+\.\d+$", s):
            return float(s)
    except ValueError:
        return None
    return year_point(s)


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


def main(argv=None) -> int:
    default_root = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser(prog="tldb", description="Outil de la base de timelines")
    ap.add_argument("--root", type=Path, default=default_root, help="dossier de la base (défaut : parent de tools/)")
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

    args = ap.parse_args(argv)
    args.root = args.root.resolve()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
