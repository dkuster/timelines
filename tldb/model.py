"""Chargement de la base : collections, entités, notes."""
from __future__ import annotations

import json
import re
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



def lt_langs(lt: dict) -> list[str]:
    return [k for k in lt if k not in NON_LANG_KEYS]



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
