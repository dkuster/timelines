"""Validation JSON Schema (jsonschema >= 4.18)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from .model import Base, Report


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
            report.error("tldb", f'{what} : pip install --upgrade "jsonschema>=4.18"')
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
