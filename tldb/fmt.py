"""Format canonique des fichiers JSON et commande format."""
from __future__ import annotations

import json

from .model import Base, Report, COLLECTIONS, LINE_WIDTH
from .schemas import build_validators


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
