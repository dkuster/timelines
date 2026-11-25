/* Fragments HTML communs aux fiches de la frise et du mobile. */
import { esc, txt } from "../core/text.js";
import { NODES } from "../core/model.js";

/** lien vers une entité (le clic est géré par délégation sur [data-ref]) */
export function link(ref, label){ return `<a data-ref="${esc(ref)}">${esc(label)}</a>`; }
/** fil d'Ariane d'un nœud : ses ancêtres par le premier parent */
export function crumbs(n){
  const chain = []; let p = n;
  while (p && p.parents.length){ const q = NODES.get(p.parents[0].id); if (!q) break; chain.unshift(q); p = q; }
  return chain.length ? `<div class="crumbs">${chain.map(q => link("node:" + q.id, txt(q.view?.label || q.title))).join(" › ")}</div>` : "";
}
