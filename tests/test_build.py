import json

from tldb.build import build_data


def test_build_data(mini):
    db, verif = build_data(mini)
    ids = {n["id"] for n in db["nodes"]}
    assert "alpha-old" not in ids                                       # disabled retiré
    assert [p["id"] for p in db["persons"]] == ["p1"]
    assert all(n["_home"] in ("alpha", "beta") for n in db["nodes"])
    assert [n["id"] for n in db["notes"]] == ["n-info"]
    assert [n["id"] for n in verif] == ["n-check"] and verif[0]["body"] == "À vérifier."
    assert db["lanes"][0]["id"] == "alpha"
    json.dumps(db)                                                      # sérialisable


def test_real_base_is_valid():
    """La vraie base du dépôt : aucune erreur de validation."""
    from conftest import ROOT
    from tldb.model import Base, Report
    from tldb.schemas import build_validators, check_schemas
    from tldb.validate import check_semantics
    rep = Report()
    v = build_validators(ROOT, rep)
    b = Base(ROOT, rep)
    b.load()
    check_schemas(b, v)
    check_semantics(b, check_media_files=True)
    assert rep.errors == []
