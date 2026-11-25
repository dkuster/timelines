/* Index de la base en mémoire, commun à tous les viewers.

   window.TLDB est produit par « py -m tldb build » (dist/data/base.js) : nœuds, entités,
   liens, médias, notes, et les lignes déjà calculées (règle d'appartenance shared / deep,
   implémentée une seule fois, en Python : tldb/scope.py). Les éléments disabled sont déjà retirés. */
import { span, NOW } from "./dates.js";
import { txt } from "./text.js";
import { FAMILIES, FAM_OF, PALETTE } from "./families.js";

export let DB = null;
export const NODES = new Map(), CHILDREN = new Map(), ENT = new Map(), LINKS_OUT = new Map(), LINKS_IN = new Map(),
  ENT_NODES = new Map(), MEDIA_ABOUT = new Map(), NOTES_ABOUT = new Map(), WORKS_BY = new Map(), SUBORGS = new Map();
/** lignes racines (ordre d'affichage) et toutes les lignes (sous-lignes avant leur parent) */
export let ROOT_LANES = [], ALL_LANES = [];

export function push(map, k, v){ let a = map.get(k); if (!a) map.set(k, a = []); a.push(v); }

const COLL = {person:"persons", place:"places", org:"organizations", work:"works", source:"sources", media:"media"};

/** indexe la base ; notes supplémentaires (notes de vérification de la frise) en option */
export function indexDB(raw, extraNotes = []){
  DB = raw;
  for (const n of raw.nodes){
    if (n.status === "disabled") continue;
    const s = span(n.start);
    n._s = s;
    if (n.end){ n._t0 = s[0]; n._t1 = span(n.end)[1]; }
    else if (n.ongoing){ n._t0 = s[0]; n._t1 = Math.max(NOW, s[1]); }
    else { n._t0 = s[0]; n._t1 = s[1]; }
    n._tp = (s[0] + s[1]) / 2;
    n._fam = FAM_OF[n.type] || FAMILIES[FAMILIES.length-1];
    NODES.set(n.id, n);
    ENT.set("node:" + n.id, {kind:"node", item:n});
  }
  for (const n of NODES.values()) for (const p of n.parents) if (NODES.has(p.id)) push(CHILDREN, p.id, n);
  // timeline d'origine : posée par le build (racine du fichier), sinon via parents[0]
  for (const n of NODES.values()) if (!n._home || !NODES.has(n._home)){
    let q = n; const guard = new Set();
    while (q.parents.length && NODES.has(q.parents[0].id) && !guard.has(q.id)){ guard.add(q.id); q = NODES.get(q.parents[0].id); }
    n._home = q.id;
  }
  for (const arr of CHILDREN.values()) arr.sort((a,b) => (a._t0 - b._t0) || ((a.parents[0]?.order ?? 0) - (b.parents[0]?.order ?? 0)));
  for (const [pre, c] of Object.entries(COLL)) for (const it of (raw[c] || [])) if (it.status !== "disabled") ENT.set(pre + ":" + it.id, {kind:pre, item:it});
  for (const n of NODES.values()){
    n._links = 0;
    for (const [f, pre] of [["persons","person"],["places","place"],["organizations","org"],["works","work"]]) for (const id of (n[f]||[])) push(ENT_NODES, pre+":"+id, n);
    for (const s of (n.sources||[])) push(ENT_NODES, "source:"+s.ref, n);
  }
  for (const l of (raw.links || [])){
    if (l.status === "disabled") continue;
    push(LINKS_OUT, l.from, l); push(LINKS_IN, l.to, l);
    for (const r of [l.from, l.to]) if (r.startsWith("node:") && NODES.has(r.slice(5))) NODES.get(r.slice(5))._links++;
  }
  for (const m of (raw.media || [])) if (m.status !== "disabled") for (const a of (m.about || [])) push(MEDIA_ABOUT, a.ref, m);
  for (const nt of [...(raw.notes || []), ...extraNotes]) if (nt && typeof nt === "object" && nt.status !== "disabled") for (const a of (nt.about || [])) push(NOTES_ABOUT, typeof a === "string" ? a : a.ref, nt);
  for (const w of (raw.works || [])) for (const a of (w.authors || [])) push(WORKS_BY, "person:"+a, w);
  for (const o of (raw.organizations || [])) if (o.parent) push(SUBORGS, "org:"+o.parent, o);
  buildLaneTree(raw.lanes || []);
}

/* Une « ligne » = une racine ou une sous-timeline de type era ; ses autres descendants y sont aplatis,
   avec leur niveau d'imbrication (level) et container = des enfants sont affichés dans la ligne.
   Le contenu vient du build ; ici seulement les objets et les couleurs. Chaque viewer complète
   ensuite les lignes pour sa propre mise en page (barres, points, colonnes…). */
function buildLaneTree(specs){
  let pi = 0;
  ROOT_LANES = []; ALL_LANES = [];
  function make(spec, parent, depth){
    const n = NODES.get(spec.id); if (!n) return null;
    const lane = {id:n.id, node:n, parent, depth, sub:[], items:[],
      color: n.view?.color || parent?.color || PALETTE[pi++ % PALETTE.length]};
    for (const s of spec.sub){ const l = make(s, lane, depth+1); if (l) lane.sub.push(l); }
    for (const [id, level, container] of spec.items){ const c = NODES.get(id); if (c) lane.items.push({n:c, level, container:!!container}); }
    ALL_LANES.push(lane);
    return lane;
  }
  ROOT_LANES = specs.map(s => make(s, null, 0)).filter(Boolean);
  // racines simples d'abord, racines de contexte (avec sous-lignes) ensuite
  ROOT_LANES.sort((a,b) => (a.sub.length>0) - (b.sub.length>0) || a.node._t0 - b.node._t0);
}

/** lignes dans l'ordre d'affichage (chaque racine suivie de ses sous-lignes) */
export function laneOrder(){ const out=[]; (function w(ls){ for (const l of ls){ out.push(l); w(l.sub); } })(ROOT_LANES); return out; }
export function laneName(l){ return txt(l.node.view?.label || l.node.title); }
/** nom d'une entité à partir de sa référence (person:lenin, node:…) */
export function entName(ref){ const e = ENT.get(ref); if (!e) return ref.split(":")[1]; const it = e.item; return txt(it.name || it.title) || it.id; }
