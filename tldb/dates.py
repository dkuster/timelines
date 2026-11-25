"""Dates ISO partielles, calendrier julien, années décimales."""
from __future__ import annotations

import re

from .model import Report


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



def _days_in_year(y):
    return 366 if (y % 4 == 0 and y % 100 != 0) or y % 400 == 0 else 365


def _doy(y, m, d):
    ml = [31, 29 if _days_in_year(y) == 366 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return sum(ml[:m - 1]) + d


def year_span(date: str) -> tuple[float, float] | None:
    """Intervalle [a, b[ en années décimales couvert par une date de précision variable (span() des viewers)."""
    m = re.match(r"^(-?\d+)(?:-(\d\d))?(?:-(\d\d))?$", str(date or "").strip())
    if not m:
        return None
    y = int(m.group(1)); mo = int(m.group(2) or 0); d = int(m.group(3) or 0)
    D = _days_in_year(y)
    if d:
        a = y + (_doy(y, mo, d) - 1) / D
        return a, a + 1 / D
    if mo:
        return y + (_doy(y, mo, 1) - 1) / D, (y + 1 if mo == 12 else y + (_doy(y, mo + 1, 1) - 1) / D)
    return float(y), float(y + 1)


def year_point(date: str) -> float | None:
    """Milieu de la période désignée par une date ISO partielle, en année décimale (_tp des viewers)."""
    s = year_span(date)
    return (s[0] + s[1]) / 2 if s else None


def parse_when(s: str) -> float | None:
    try:
        if re.match(r"^-?\d+\.\d+$", s):
            return float(s)
    except ValueError:
        return None
    return year_point(s)
