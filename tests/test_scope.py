from tldb.model import Base, Report
from tldb.scope import lanes, node_children, node_homes, timeline_scope


def load(root):
    b = Base(root, Report())
    b.load()
    return b


def test_timeline_scope_rules(mini):
    b = load(mini)
    homes, children = node_homes(b), node_children(b)
    alpha = timeline_scope("alpha", homes, children)
    assert alpha["beta-front"][0] == "rattachement"
    assert alpha["beta-shared"][0] == "shared"
    assert alpha["beta-deep"][0] == "rattachement"
    assert alpha["beta-deep-child"][0] == "deep"
    assert "beta-battle" not in alpha                 # descendant d'un nœud étranger
    assert "alpha-old" not in alpha                   # disabled
    beta = timeline_scope("beta", homes, children)
    assert beta == {}                                 # beta n'a que des nœuds rattachés ailleurs


def test_lanes(mini):
    tree = lanes(load(mini))
    assert [l["id"] for l in tree] == ["alpha", "beta"]
    alpha = tree[0]
    assert [s["id"] for s in alpha["sub"]] == ["alpha-era"]            # sous-ligne era de la même timeline
    items = {i: (lv, c) for i, lv, c in alpha["items"]}
    assert items["alpha-war"] == (0, 1)                                 # conteneur : des enfants sont affichés
    assert items["beta-front"] == (1, 1) and items["beta-shared"] == (2, 0)
    assert "beta-battle" not in items and "alpha-1905" not in items     # alpha-1905 est dans la sous-ligne
    assert alpha["sub"][0]["items"] == [["alpha-1905", 0, 0]]
