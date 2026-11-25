from tldb.dates import julian_to_gregorian, parse_date, valid_date, year_point, year_span


def test_julian_to_gregorian():
    assert julian_to_gregorian(1917, 2, 23) == (1917, 3, 8)       # révolution de Février
    assert julian_to_gregorian(1917, 10, 25) == (1917, 11, 7)     # révolution d'Octobre
    assert julian_to_gregorian(1905, 1, 9) == (1905, 1, 22)       # Dimanche rouge


def test_parse_and_validate():
    assert parse_date("1905-01-22") == (1905, 1, 22)
    assert parse_date("1914-09") == (1914, 9)
    assert parse_date("-0043") == (-43,)
    assert parse_date("1905/01/22") is None
    assert valid_date((1900, 2, 29), julian=True)
    assert not valid_date((1900, 2, 29))
    assert valid_date((2000, 2, 29))
    assert not valid_date((1917, 13))


def test_year_span_and_point():
    assert year_span("1917") == (1917.0, 1918.0)
    a, b = year_span("1917-12")
    assert a == 1917 + 334 / 365 and b == 1918
    a, b = year_span("1917-01-01")
    assert a == 1917.0 and b == 1917 + 1 / 365
    assert year_point("1917") == 1917.5
    assert year_span("vers 1917") is None
