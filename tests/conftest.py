from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def node(id, parents=(), type="event", start="1900", **kw):
    """Nœud minimal ; parents : ids, ou (id, {"deep": True}) pour un rattachement particulier."""
    ps = []
    for p in parents:
        pid, extra = (p, {}) if isinstance(p, str) else p
        ps.append({"id": pid, **extra})
    return {"id": id, "title": {"fr": id}, "type": type, "parents": ps, "start": {"date": start}, **kw}


def write_base(root: Path, timelines: dict, notes: dict | None = None, **collections) -> Path:
    """timelines : {nom de fichier: [nœuds]} ; collections : persons=[…], links=[…] ; notes : {id: (en-tête, texte)}."""
    (root / "data" / "nodes").mkdir(parents=True)
    for name, items in timelines.items():
        (root / "data" / "nodes" / f"{name}.json").write_text(
            json.dumps({"collection": "nodes", "version": 1, "items": items}), encoding="utf-8")
    for coll, items in collections.items():
        (root / "data" / f"{coll}.json").write_text(
            json.dumps({"collection": coll, "version": 1, "items": items}), encoding="utf-8")
    (root / "notes").mkdir()
    for nid, (head, body) in (notes or {}).items():
        lines = "\n".join(f"{k}: {json.dumps(v, ensure_ascii=False)}" for k, v in {"id": nid, **head}.items())
        (root / "notes" / f"{nid}.md").write_text(f"---\n{lines}\n---\n{body}\n", encoding="utf-8")
    return root


@pytest.fixture
def mini(tmp_path):
    """Deux timelines : alpha (avec une sous-ligne era) et beta, qui se rattache à alpha de plusieurs façons."""
    alpha = [
        node("alpha", type="era", start="1800"),
        node("alpha-era", ["alpha"], type="era", start="1850"),
        node("alpha-1905", ["alpha-era"], start="1905-01-22"),
        node("alpha-war", ["alpha"], type="war", start="1914-07-28", end={"date": "1918-11-11"}),
        node("alpha-old", ["alpha"], start="1820", status="disabled"),
    ]
    beta = [
        node("beta", type="era", start="1800"),
        node("beta-front", ["alpha-war"], type="war", start="1915"),         # rattachement direct à alpha
        node("beta-battle", ["beta-front"], start="1916"),                    # descendant d'un étranger : pas dans alpha
        node("beta-shared", ["beta-front"], start="1917", shared=True),       # shared : suit son parent partout
        node("beta-deep", [("alpha-war", {"deep": True})], type="period", start="1916"),
        node("beta-deep-child", ["beta-deep"], start="1916-06"),             # importé par le deep
    ]
    return write_base(
        tmp_path, {"alpha": alpha, "beta": beta},
        notes={"n-check": ({"about": ["node:alpha-1905"], "tags": ["verification"]}, "À vérifier."),
               "n-info": ({"about": ["node:alpha"]}, "Contexte.")},
        persons=[{"id": "p1", "name": {"fr": "P1"}}, {"id": "p2", "name": {"fr": "P2"}, "status": "disabled"}])
