"""Veille : plan mensuel, curseurs et contrôles de veille/watch.json."""
from __future__ import annotations

import datetime as dt
import json

from conftest import node, write_base
from tldb.model import Base, Report
from tldb.watch import check_watch, dump_watch, plan, save_watch, load_watch, ongoing_nodes


def watch(*timelines, lag=1, rotation=3):
    return {"version": 1, "lag_months": lag, "rotation": rotation, "timelines": list(timelines)}


def test_plan_rotation_retard_mensuel():
    w = watch(
        {"id": "w", "group": 0, "last_checked": "2026-09"},
        {"id": "a", "group": 3, "last_checked": "2026-08"},   # décembre : groupe 3
        {"id": "b", "group": 1, "last_checked": "2026-08"},   # pas son mois, pas en retard
        {"id": "c", "group": 2, "last_checked": "2025-01"},   # en retard
        {"id": "d", "group": 3, "last_checked": "2026-10"},   # déjà à jour
        {"id": "e", "active": False},
    )
    p = plan(w, dt.date(2026, 12, 1))
    assert p["until"] == "2026-10" and p["group"] == 3
    got = {r["id"]: (r["since"], r["reason"]) for r in p["timelines"]}
    assert got == {"c": ("2025-02", "retard"), "a": ("2026-09", "rotation"), "w": ("2026-10", "mensuel")}
    assert [r["id"] for r in p["timelines"]] == ["c", "a", "w"]   # la plus en retard d'abord


def test_plan_janvier_recul():
    w = watch({"id": "w", "group": 0, "last_checked": "2025-10"}, lag=1)
    p = plan(w, dt.date(2026, 1, 1))
    assert p["until"] == "2025-11" and p["group"] == 1


def test_dump_roundtrip(tmp_path):
    (tmp_path / "veille").mkdir()
    w = watch({"id": "x", "group": 1, "last_checked": "2026-01", "note": "évènements"})
    save_watch(tmp_path, w)
    assert load_watch(tmp_path) == w
    assert '{"id": "x", "group": 1, "last_checked": "2026-01", "note": "évènements"}' in dump_watch(w)


def test_check_watch(tmp_path):
    root = write_base(tmp_path, {
        "alpha": [node("alpha", start="1900", ongoing=True), node("1950-x", ["alpha"], start="1950", ongoing=True)],
        "beta": [node("beta", start="1900", end={"date": "1920"})],
        "gamma": [node("gamma", start="1900")],
    })
    (root / "veille").mkdir()
    (root / "veille" / "watch.json").write_text(json.dumps(watch(
        {"id": "alpha", "group": 4, "last_checked": "2026-01"},
        {"id": "beta", "group": 1, "last_checked": "2026-13"},
        {"id": "nope", "group": 1, "last_checked": "2026-01"},
    )), encoding="utf-8")
    rep = Report()
    base = Base(root, rep)
    base.load()
    check_watch(base)
    text = "\n".join(rep.errors + rep.warnings)
    assert "alpha : group doit valoir" in text
    assert "beta : last_checked" in text
    assert "beta : timeline close" in text
    assert "nope : aucune racine" in text
    assert "gamma : nouvelle racine absente" in text
    assert [e.id for e in ongoing_nodes(base, "alpha")] == ["alpha", "1950-x"]
