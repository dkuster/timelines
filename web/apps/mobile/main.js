/* Viewer mobile */
import { I18N } from "../../core/i18n.js";
import { LANG, setLang, tr, txt, esc, norm, allTexts } from "../../core/text.js";
import { MSHORT, QUAL, isLeap, daysInYear, dayOfYear, parseD, span, NOW, fmtDate, fmtRange } from "../../core/dates.js";
import { FAMILIES, LINK_COLORS } from "../../core/families.js";
import { alpha, shapePath, tw } from "../../core/canvas.js";
import { DB, NODES, CHILDREN, ENT, LINKS_OUT, LINKS_IN, ENT_NODES, WORKS_BY, SUBORGS, ROOT_LANES, ALL_LANES, push, indexDB, laneOrder, laneName, entName } from "../../core/model.js";
import { imagesOf, mediaSrc, primaryPortrait } from "../../core/media.js";
import { loadBase } from "../../core/data.js";
import { link, crumbs } from "../../ui/html.js";

/* =====================================================================
   Viewer mobile de timeline-db — spécification : docs/specs/viewer-mobile.md
   Canvas 2D + DOM, sans dépendance. Données : window.TLDB (data/base.js),
   produites par « py -m tldb build ». Code commun : web/core/ et web/ui/.
   ===================================================================== */

// ---------------------------------------------------------------- constantes
// libellés des types, familles et liens : viewer/i18n.js (I18N.type, I18N.fam, I18N.link)
const MIN_T = 1770, MIN_SPAN = 2/12, MAX_SPAN = 250;
const ZOOM_LEVELS = [2/12, 6/12, 1, 2, 5, 10, 20, 50, 100, 250]; // paliers des boutons + et − (ans), de MIN_SPAN à MAX_SPAN
const TOL = 40;            // tolérance de la loupe (px)
const MERGE = 6;           // fusion des points proches (px)
const SPEEDS = [1, 3, 10]; // ans par seconde pour une plage de 10 ans
const MAX_T = NOW + 0.5;
const SANS = getComputedStyle(document.documentElement).getPropertyValue("--sans") || "system-ui,sans-serif";
const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- dates
function ym(t){ // année fractionnaire -> {y, m (0-11)}
  const y = Math.floor(t), doy = Math.floor((t - y) * daysInYear(y));
  const ml=[31,isLeap(y)?29:28,31,30,31,30,31,31,30,31,30,31]; let m = 0, acc = 0;
  while (m < 11 && acc + ml[m] <= doy){ acc += ml[m]; m++; }
  return {y, m};
}
function L2(){ return I18N.lang; } // langue des dates = langue de l'interface
function fmtShortRaw(s, lang, noYear){
  const {y,m,d} = parseD(s), L = MSHORT[lang] || MSHORT.fr, Y = noYear ? "" : " " + y;
  if (d) return (lang==="de" ? `${d}. ${L[m-1]}` : lang==="en" ? `${d} ${L[m-1]}` : `${d===1?"1er":d} ${L[m-1]}`) + Y;
  if (m) return L[m-1] + Y;
  return String(y);
}
function fmtShort(dv){
  if (!dv) return "";
  if (dv.display) return txt(dv.display); // texte libre, simple ou multilingue
  const l = L2();
  let s = (dv.qualifier ? QUAL[l][dv.qualifier] : "") + fmtShortRaw(dv.date, l);
  if (dv.original && dv.calendar === "julian"){
    const sameY = dv.original.slice(0,4) === dv.date.slice(0,4);
    s += ` (${fmtShortRaw(dv.original, l, sameY)} ${I18N.t("julian")})`;
  } else if (dv.original) s += ` (${dv.original})`;
  return s;
}
function fmtRangeShort(n){
  const a = fmtShort(n.start);
  if (n.end){ const b = fmtShort(n.end); return a === b ? a : a + " – " + b; }
  if (n.ongoing) return I18N.t("since", {date:a});
  return a;
}
function fmtSpan(t0, t1){
  t1 = Math.min(t1, NOW); t0 = Math.max(t0, MIN_T);
  if (t1 - t0 >= 3) return `${Math.floor(t0)} – ${Math.floor(t1)}`;
  const a = ym(t0), b = ym(t1), M = MSHORT[L2()];
  return a.y === b.y ? (a.m === b.m ? `${M[a.m]} ${a.y}` : `${M[a.m]} – ${M[b.m]} ${a.y}`) : `${M[a.m]} ${a.y} – ${M[b.m]} ${b.y}`;
}

// ---------------------------------------------------------------- textes

// ---------------------------------------------------------------- base


// ---------------------------------------------------------------- lignes (contenu calculé au build, core/model.js)
const LANE = new Map(), NODE_LANES = new Map();
/** colonnes du mobile : évènements (evs) et périodes (pers) de chaque ligne, rangées des barres */
function buildLanes(){
  for (const l of ALL_LANES){
    LANE.set(l.id, l);
    l.has = new Set(l.items.map(i => i.n.id));
    l.pers = []; l.evs = [];
    for (const it of l.items){
      const n = it.n;
      if (it.container || n.type === "era" || n.type === "period") l.pers.push({n, level:it.level});
      else l.evs.push({n, col:l.color, bar: !!(n.ongoing || (n.end && n._t1 - n._t0 > 0.5))});
      push(NODE_LANES, n.id, l);
    }
    l.evs.sort((a,b) => a.n._tp - b.n._tp || a.n.id.localeCompare(b.n.id));
    l.pers.sort((a,b) => a.level - b.level || a.n._t0 - b.n._t0);
    // rangées des barres (durées longues), deux au plus
    const ends = [];
    for (const e of l.evs.filter(e => e.bar).sort((a,b) => a.n._t0 - b.n._t0)){
      let r = ends.findIndex(t => t <= e.n._t0); if (r < 0){ r = ends.length; ends.push(0); }
      ends[r] = e.n._t1; e.row = r % 2;
    }
    // index des périodes par niveau, avec alternance de teinte
    const byLevel = new Map();
    for (const p of l.pers){ const k = Math.min(p.level, 2); const a = byLevel.get(k) || []; p.alt = a.length % 2; a.push(p); byLevel.set(k, a); }
  }
  // une timeline qui a des sous-timelines (Monde) montre aussi leur contenu
  for (const l of ALL_LANES.slice().sort((a,b) => b.depth - a.depth)){
    if (!l.sub.length) continue;
    const ids = new Set([...l.evs, ...l.pers].map(e => e.n.id));
    for (const s of l.sub){
      for (const e of s.evs) if (!ids.has(e.n.id)){ ids.add(e.n.id); l.evs.push(e); }
      for (const p of s.pers) if (!ids.has(p.n.id)){ ids.add(p.n.id); l.pers.push({n:p.n, level:p.level, alt:p.alt}); }
      for (const id of s.has) l.has.add(id);
    }
    l.evs.sort((a,b) => a.n._tp - b.n._tp || a.n.id.localeCompare(b.n.id));
    l.pers.sort((a,b) => a.level - b.level || a.n._t0 - b.n._t0);
  }
  for (const l of ALL_LANES){ l.last = l.evs.length ? l.evs[l.evs.length-1].n : null; l.colOf = new Map(l.evs.map(e => [e.n.id, e.col])); }
}
function hidden(n){ return S.hiddenFam.has(n._fam.id); }
function bestLane(n){
  const ls = NODE_LANES.get(n.id) || [];
  return ls.find(l => l.node._home === n._home) || ls[0] || LANE.get(n._home) || null;
}
function laneColorOf(n){ return bestLane(n)?.color || "#888"; }

// ---------------------------------------------------------------- état
const S = {c:[], m:null, tc:1917, span:10, hiddenFam:new Set(), dens:"t", periods:true, loupe:true,
  theme:"system", speed:0, pick:null, sec:null, swap:null, playing:false,
  auto:false, themes:true, fix:new Set(), fadeIn:null};   // mode automatique des secondaires (spec § 16)
function ci(){ return S.c.length > 1 ? 1 : 0; }
function mainLane(){ return LANE.get(S.c[ci()]); }
function clampView(){
  S.span = Math.max(MIN_SPAN, Math.min(MAX_SPAN, S.span));
  S.tc = Math.max(MIN_T, Math.min(MAX_T, S.tc));
}

// ---------------------------------------------------------------- géométrie
const wrap = $("cvwrap"), cv = $("cv"), fx = $("fx"), ctx = cv.getContext("2d"), fctx = fx.getContext("2d");
let W = 300, H = 500, DPR = 1, LOUPE_H = 148, SEC_W = 64;
function Y(t){ return H/2 + (S.tc - t) / S.span * H; }
function T(y){ return S.tc - (y - H/2) / H * S.span; }
function bandTop(){ return H/2 - LOUPE_H/2; }
function bandBot(){ return H/2 + LOUPE_H/2; }
function layoutFor(order){
  const n = order.length, L = id => LANE.get(id);
  if (n === 1) return [{lane:L(order[0]), x:0, w:W, main:true}];
  if (n === 2) return [{lane:L(order[0]), x:0, w:SEC_W, main:false}, {lane:L(order[1]), x:SEC_W, w:W-SEC_W, main:true}];
  return [{lane:L(order[0]), x:0, w:SEC_W, main:false}, {lane:L(order[1]), x:SEC_W, w:W-2*SEC_W, main:true}, {lane:L(order[2]), x:W-SEC_W, w:SEC_W, main:false}];
}
function geo(col){ // positions dans la colonne principale
  const rib = S.periods ? 14 : 2;
  return {rib, yl:col.x + rib + 3, bar:col.x + rib + 30, mk:col.x + rib + 38, tx:col.x + rib + 51};
}

// ---------------------------------------------------------------- couleurs
let C = {};
function readColors(){
  const cs = getComputedStyle(document.documentElement), g = k => cs.getPropertyValue(k).trim();
  C = {paper:g("--paper"), paper2:g("--paper2"), card:g("--card"), ink:g("--ink"), muted:g("--muted"), faint:g("--faint"),
       rule:g("--rule"), grid:g("--grid"), future:g("--future"), focus:g("--focus")};
  DARK = cs.colorScheme === "dark" || g("color-scheme") === "dark";
}
let DARK = false;
function lc(hex){ // couleur de ligne, éclaircie en thème sombre pour garder le contraste
  if (!DARK || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const n = parseInt(hex.slice(1),16), m = v => Math.round(v + (255 - v) * .32);
  return "#" + [n>>16, (n>>8)&255, n&255].map(v => m(v).toString(16).padStart(2,"0")).join("");
}

// ---------------------------------------------------------------- texte sur canvas
function clip(c, s, maxW){
  if (tw(c, s) <= maxW) return s;
  let lo = 0, hi = s.length;
  while (lo < hi){ const mid = (lo + hi + 1) >> 1; if (tw(c, s.slice(0, mid).trimEnd() + "…") <= maxW) lo = mid; else hi = mid - 1; }
  return s.slice(0, lo).trimEnd() + "…";
}
const WR = new Map();
function wrapText(c, s, maxW, maxLines){
  const k = c.font + "|" + maxW + "|" + maxLines + "|" + s; let v = WR.get(k); if (v) return v;
  const words = s.split(/\s+/).filter(Boolean), lines = []; let cur = "";
  for (let i = 0; i < words.length; i++){
    const t = cur ? cur + " " + words[i] : words[i];
    if (tw(c, t) <= maxW){ cur = t; continue; }
    if (!cur){ lines.push(clip(c, words[i], maxW)); cur = ""; if (lines.length === maxLines) break; continue; }
    lines.push(cur); cur = words[i];
    if (lines.length === maxLines){ lines[maxLines-1] = clip(c, lines[maxLines-1] + " " + words.slice(i).join(" "), maxW); cur = ""; break; }
  }
  if (cur && lines.length < maxLines) lines.push(clip(c, cur, maxW));
  if (WR.size > 4000) WR.clear(); WR.set(k, lines);
  return lines;
}

// ---------------------------------------------------------------- formes
function drawShape(c, fam, x, y, r, color){
  shapePath(c, fam.shape, x, y, r);
  if (fam.shape === "ring"){ c.fillStyle = C.paper; c.fill(); c.lineWidth = 2; c.strokeStyle = color; c.stroke(); }
  else { c.fillStyle = color; c.fill(); c.lineWidth = 1.2; c.strokeStyle = C.paper; c.stroke(); }
}
function famSVG(fam, color, size = 15){
  const s = fam.shape, f = `style="fill:${color}"`;
  let b;
  if (s === "triUp") b = `<polygon points="8,1.8 14,12.6 2,12.6" ${f}/>`;
  else if (s === "triDown") b = `<polygon points="8,14.2 14,3.4 2,3.4" ${f}/>`;
  else if (s === "diamond") b = `<polygon points="8,1 13.5,8 8,15 2.5,8" ${f}/>`;
  else if (s === "square") b = `<rect x="3" y="3" width="10" height="10" ${f}/>`;
  else if (s === "ring") b = `<circle cx="8" cy="8" r="4.6" style="fill:none;stroke:${color};stroke-width:2.2"/>`;
  else if (s === "star"){ const p = []; for (let i=0;i<10;i++){ const a = -Math.PI/2 + i*Math.PI/5, rr = i%2 ? 3 : 7; p.push((8+rr*Math.cos(a)).toFixed(2)+","+(8.6+rr*Math.sin(a)).toFixed(2)); } b = `<polygon points="${p.join(" ")}" ${f}/>`; }
  else if (s === "dot") b = `<circle cx="8" cy="8" r="3.5" ${f}/>`;
  else b = `<circle cx="8" cy="8" r="5.5" ${f}/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true">${b}</svg>`;
}
function priority(n){ return n._fam.w + 1.5*Math.min(n._links, 4) + 0.3*Math.min((n.persons||[]).length, 5); }

// ---------------------------------------------------------------- rendu
let HITS = [], LAST_LAYOUT = null;
function ticks(){
  const ppy = H / S.span;
  const steps = [1/12, 2/12, 3/12, 6/12, 1, 2, 5, 10, 20, 25, 50, 100];
  let step = steps.find(s => s * ppy >= 64) || 100;
  const out = [], t0 = T(H + 20), t1 = T(-20);
  if (step < 1){
    const k = Math.round(step * 12);
    let {y, m} = ym(t0); m = Math.floor(m / k) * k;
    for (let guard = 0; guard < 400; guard++){
      const t = y + (dayOfYear(y, m+1, 1) - 1) / daysInYear(y);
      if (t > t1) break;
      if (t >= t0) out.push({t, lab: m === 0 ? String(y) : MSHORT[L2()][m], major: m === 0});
      m += k; if (m >= 12){ m -= 12; y++; }
    }
  } else {
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) out.push({t, lab:String(t), major: t % (step*5) === 0});
  }
  return out;
}
function render(){
  if (!S.c.length) return;
  const c = ctx;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.clearRect(0, 0, W, H);
  c.fillStyle = C.paper; c.fillRect(0, 0, W, H);
  HITS = [];
  if (S.swap){
    const p = easeInOut(S.swap.p), d = S.swap.dir;
    drawLayout(layoutFor(S.swap.from), 1 - p, d * p * 56, false);
    drawLayout(layoutFor(S.swap.to), p, -d * (1 - p) * 56, true);
  } else drawLayout(layoutFor(S.c), 1, 0, true);
  drawFx();
  updateDom();
  updateZoomBtns();
  jumpCheck();
  autoSoon();
  saveHashSoon();
}
function drawLayout(L, a, dx, live){
  const c = ctx;
  c.save(); c.globalAlpha = a; c.translate(dx, 0);
  // fonds des colonnes secondaires
  for (const col of L) if (!col.main){ c.fillStyle = C.paper2; c.fillRect(col.x, 0, col.w, H); }
  // futur
  const yNow = Y(NOW);
  if (yNow > 0){ c.fillStyle = C.future; c.fillRect(0, 0, W, Math.min(H, yNow)); }
  // graduations
  const main = L.find(x => x.main), g = geo(main);
  const TK = ticks();
  for (const tk of TK){
    const y = Math.round(Y(tk.t)) + .5;
    c.strokeStyle = tk.major ? C.rule : C.grid; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
  }
  main._ticks = TK;
  if (yNow > 0 && yNow < H){ c.strokeStyle = C.faint; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(0, yNow); c.lineTo(W, yNow); c.stroke(); c.setLineDash([]); }
  // séparateurs
  c.strokeStyle = C.rule; c.lineWidth = 1;
  for (const col of L) if (!col.main){ const x = col.x === 0 ? col.x + col.w - .5 : col.x + .5; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (const col of L) col.main ? drawMain(col, live) : drawSec(col, live);
  c.restore();
  if (live) LAST_LAYOUT = L;
}
function groupVisible(lane, yPad){
  const groups = []; let g = null;
  for (let i = lane.evs.length - 1; i >= 0; i--){ // du plus récent (haut) au plus ancien (bas)
    const e = lane.evs[i], n = e.n;
    if (hidden(n)) continue;
    const y = Y(n._tp);
    if (y < -yPad) continue;
    if (y > H + yPad) break;
    if (g && y - g.y1 < MERGE){ g.items.push(e); g.y1 = y; const p = priority(n); if (p > g.p){ g.p = p; g.top = e; } }
    else { g = {items:[e], y0:y, y1:y, p:priority(n), top:e}; groups.push(g); }
  }
  for (const gr of groups) gr.y = (gr.y0 + gr.y1) / 2;
  return groups;
}
function drawMain(col, live){
  const c = ctx, lane = col.lane, g = geo(col), color = lc(lane.color);
  const loupeOn = S.loupe && !S.swap;
  // rubans des périodes
  if (S.periods){
    for (const p of lane.pers){
      const lv = Math.min(p.level, 2), n = p.n;
      const ya = Y(Math.min(n._t1, NOW)), yb = Y(n._t0);
      if (yb < 0 || ya > H) continue;
      const pc = lc(n.view?.color || lane.color);
      c.fillStyle = alpha(pc, (lv === 0 ? .8 : lv === 1 ? .55 : .38) * (p.alt ? .6 : 1));
      c.fillRect(col.x + 2 + lv * 4.5, Math.max(-2, ya) + .5, 3.5, Math.min(H + 2, yb) - Math.max(-2, ya) - 1);
    }
  }
  // épine
  c.strokeStyle = C.rule; c.lineWidth = 1; c.beginPath(); c.moveTo(g.mk + .5, 0); c.lineTo(g.mk + .5, H); c.stroke();
  // barres des évènements longs
  for (const e of lane.evs){
    if (!e.bar || hidden(e.n)) continue;
    const ya = Y(Math.min(e.n._t1, NOW)), yb = Y(e.n._t0);
    if (yb < 0 || ya > H) continue;
    c.fillStyle = alpha(lc(e.col), .55);
    const x = g.bar - e.row * 4.5;
    c.fillRect(x, Math.max(0, ya), 3, Math.max(2, Math.min(H, yb) - Math.max(0, ya)));
  }
  // années (au-dessus des barres)
  c.font = `500 11px ${SANS}`; c.textBaseline = "bottom";
  for (const tk of (col._ticks || [])){
    if (tk.t > NOW + 1/24) continue;
    const y = Math.round(Y(tk.t)), w = tw(c, tk.lab);
    c.fillStyle = C.paper; c.fillRect(g.yl - 2, y - 15, w + 4, 13);
    c.fillStyle = C.muted; c.fillText(tk.lab, g.yl, y - 2);
  }
  // repères
  const groups = groupVisible(lane, 30);
  for (const gr of groups){
    const n = gr.top.n;
    drawShape(c, n._fam, g.mk + .5, gr.y, gr.items.length > 1 ? 6 : 5, lc(gr.top.col));
  }
  // titres placés par priorité
  const textW = col.x + col.w - g.tx - 8;
  const placed = [];
  if (loupeOn) placed.push([bandTop() - 4, bandBot() + 4]);
  const TF = `600 14px ${SANS}`, SF = `400 12.5px ${SANS}`, LH = 17, SH = 15;
  const order = groups.slice().sort((a,b) => b.p - a.p), pend = [];
  for (const gr of order){
    if (textW < 40){ if (gr.items.length > 1) pend.push(gr); continue; }
    const n = gr.top.n, extra = gr.items.length > 1 ? `  +${gr.items.length - 1}` : "";
    c.font = TF;
    const tl = wrapText(c, txt(n.title) + extra, textW, 2);
    let sl = [];
    if (S.dens === "m" && n.summary){ c.font = SF; sl = wrapText(c, txt(n.summary), textW, 2); }
    const h = tl.length * LH + (sl.length ? 2 + sl.length * SH : 0);
    let top = null;
    for (const cand of [gr.y - LH/2, gr.y - h + LH/2, gr.y - LH/2 - Math.min(LH, h/3)]){
      if (cand < 2 || cand + h > H - 2) continue;
      if (placed.every(([a,b]) => cand + h + 3 <= a || cand >= b + 3)){ top = cand; break; }
    }
    if (top === null){
      if (gr.items.length > 1 && !(loupeOn && gr.y > bandTop() && gr.y < bandBot())) pend.push(gr);
      if (live) HITS.push({kind:"main", g:gr, y0:gr.y - 13, y1:gr.y + 13, x0:col.x, x1:col.x + col.w});
      continue;
    }
    placed.push([top, top + h]);
    c.textBaseline = "middle"; c.font = TF; c.fillStyle = C.ink;
    tl.forEach((s, i) => c.fillText(s, g.tx, top + LH/2 + i * LH));
    if (sl.length){ c.font = SF; c.fillStyle = C.muted; sl.forEach((s, i) => c.fillText(s, g.tx, top + tl.length * LH + 2 + SH/2 + i * SH)); }
    if (live) HITS.push({kind:"main", g:gr, y0:Math.min(top, gr.y - 13), y1:Math.max(top + h, gr.y + 13), x0:col.x, x1:col.x + col.w});
  }
  // nombre d'évènements regroupés, là où aucun titre ne l'indique déjà
  c.font = `600 10px ${SANS}`; c.fillStyle = C.muted; c.textBaseline = "middle";
  for (const gr of pend) if (placed.every(([a,b]) => gr.y + 7 < a || gr.y - 7 > b)) c.fillText("+" + (gr.items.length - 1), g.mk + 9, gr.y);
}
function drawSec(col, live){
  const f = S.fadeIn && S.fadeIn.ids.has(col.lane.id) ? easeOut(S.fadeIn.p) : 1;
  if (f >= 1) return drawSecInner(col, live);
  ctx.save(); ctx.globalAlpha *= f; drawSecInner(col, live); ctx.restore();
}
function drawSecInner(col, live){
  const c = ctx, lane = col.lane, color = lc(lane.color), cx = col.x + col.w / 2;
  c.strokeStyle = C.rule; c.lineWidth = 1; c.beginPath(); c.moveTo(cx + .5, 0); c.lineTo(cx + .5, H); c.stroke();
  for (const e of lane.evs){
    if (!e.bar || hidden(e.n)) continue;
    const ya = Y(Math.min(e.n._t1, NOW)), yb = Y(e.n._t0);
    if (yb < 0 || ya > H) continue;
    c.fillStyle = alpha(lc(e.col), .45);
    c.fillRect(col.x + 7 + e.row * 4, Math.max(0, ya), 2.5, Math.max(2, Math.min(H, yb) - Math.max(0, ya)));
  }
  const groups = groupVisible(lane, 20);
  for (const gr of groups){
    const n = gr.top.n, isT = live && S.sec && S.sec.lane === lane.id && gr.items.some(e => e.n.id === S.sec.id);
    if (isT){ c.beginPath(); c.arc(cx, gr.y, 10, 0, Math.PI*2); c.strokeStyle = color; c.lineWidth = 2; c.stroke(); }
    drawShape(c, n._fam, cx + .5, gr.y, 4.5, lc(gr.top.col));
    if (gr.items.length > 1){ c.font = `600 9px ${SANS}`; c.fillStyle = C.muted; c.textBaseline = "middle"; c.fillText(String(gr.items.length), cx + 8, gr.y - 6); }
    if (live) HITS.push({kind:"sec", lane:lane.id, g:gr, y0:gr.y - 15, y1:gr.y + 15, x0:col.x, x1:col.x + col.w, cx});
  }
  // nom de la timeline, écrit verticalement en tête de colonne
  c.save();
  c.font = `600 11px ${SANS}`;
  const name = clip(c, laneName(lane), Math.min(150, H * 0.3));
  const w = tw(c, name);
  c.translate(col.x + col.w - 9, 8); c.rotate(Math.PI / 2);
  c.fillStyle = C.paper2; c.fillRect(-4, -8, w + 8, 15);
  c.fillStyle = color; c.textBaseline = "middle"; c.fillText(name, 0, 0);
  c.restore();
  // mode automatique : « A » ou cadenas sous le nom
  let yEnd = 8 + w + 4;
  if (S.auto){
    const bx = col.x + col.w - 9, by = 8 + w + 12;
    c.save();
    c.fillStyle = C.paper2; c.fillRect(bx - 7, by - 8, 14, 16);
    c.strokeStyle = color; c.fillStyle = color;
    if (S.fix.has(lane.id)){ c.lineWidth = 1.4; c.beginPath(); c.arc(bx, by - 2, 2.8, Math.PI, 0); c.stroke(); c.fillRect(bx - 4, by - 2, 8, 6.5); }
    else {
      c.lineWidth = 1; c.beginPath(); c.roundRect ? c.roundRect(bx - 5.5, by - 6, 11, 12, 2.5) : c.rect(bx - 5.5, by - 6, 11, 12); c.stroke();
      c.font = `700 8.5px ${SANS}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("A", bx, by + .5);
    }
    c.restore();
    yEnd = by + 8;
  }
  if (live) HITS.push({kind:"name", lane:lane.id, x0:col.x + col.w - 30, x1:col.x + col.w, y0:0, y1:yEnd + 10});
}
function linkedIds(n){
  const out = new Map();
  for (const l of (LINKS_OUT.get("node:" + n.id) || [])) if (l.to.startsWith("node:")) out.set(l.to.slice(5), l.type);
  for (const l of (LINKS_IN.get("node:" + n.id) || [])) if (l.from.startsWith("node:")) out.set(l.from.slice(5), l.type);
  return out;
}
function drawFx(){
  const c = fctx;
  c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, W, H);
  FXHITS = [];
  if (!S.loupe || S.swap || !LAST_LAYOUT) return;
  const t = loupeTarget(); if (!t || !t.main) return;
  const L = LAST_LAYOUT, main = L.find(x => x.main), g = geo(main), links = linkedIds(t.n);
  if (!links.size) return;
  for (const col of L){
    if (col.main) continue;
    const cx = col.x + col.w / 2, off = {up:[], down:[]};
    for (const [id, type] of links){
      if (!col.lane.has.has(id)) continue;
      const o = NODES.get(id); if (!o || hidden(o)) continue;
      const y = Y(o._tp);
      if (y > bandTop() && y < bandBot()) continue;          // dans la loupe : pastille (updateDom)
      if (y < 0 || y > H){ off[y < 0 ? "up" : "down"].push({o, type}); continue; } // hors de l'écran : étiquette
      const up = y < H/2, sy = up ? bandTop() : bandBot(), sx = g.mk;
      const color = LINK_COLORS[type] || "#777";
      c.strokeStyle = color; c.lineWidth = 1.8; c.globalAlpha = .85;
      c.beginPath(); c.moveTo(sx, sy);
      c.bezierCurveTo(sx, sy + (y - sy) * .55, cx + (sx - cx) * .35, y, cx, y); c.stroke();
      c.globalAlpha = 1; c.beginPath(); c.arc(cx, y, 8, 0, Math.PI*2); c.lineWidth = 2; c.stroke();
    }
    for (const dir of ["up", "down"]){
      const arr = off[dir]; if (!arr.length) continue;
      arr.sort((a, b) => dir === "up" ? a.o._tp - b.o._tp : b.o._tp - a.o._tp); // le plus proche d'abord
      drawEdge(c, col, main, g, dir === "up", arr);
    }
  }
}
// étiquette au bord de l'écran pour les évènements liés hors de vue (spec § 17)
function drawEdge(c, col, main, g, up, arr){
  const left = col.x === 0, sep = left ? col.x + col.w : col.x, cx = col.x + col.w / 2;
  const maxW = Math.max(70, Math.min(170, main.w / 2 - 8));
  c.font = `600 11.5px ${SANS}`;
  const first = arr[0], color = LINK_COLORS[first.type] || "#777", arrow = up ? "▲" : "▼";
  let label;
  if (arr.length > 1){
    const ys = arr.map(x => Math.floor(x.o._tp)), a = Math.min(...ys), b = Math.max(...ys);
    label = `${arrow} ${arr.length} · ${a === b ? a : a + "–" + b}`;
  } else label = `${arrow} ${Math.floor(first.o._tp)} ${txt(first.o.title)}`;
  label = clip(c, label, maxW - 16);
  const w = tw(c, label) + 16, h = 24, y0 = up ? 6 : H - 6 - h, ey = y0 + h/2;
  const x0 = left ? sep + 4 : sep - 4 - w;
  const sx = g.mk, sy = up ? bandTop() : bandBot();
  c.save();
  c.strokeStyle = color; c.lineWidth = 1.6; c.globalAlpha = .85; c.setLineDash([4, 3]);
  c.beginPath(); c.moveTo(sx, sy); c.bezierCurveTo(sx, sy + (ey - sy) * .55, cx + (sx - cx) * .35, ey, cx, ey); c.stroke();
  c.setLineDash([]); c.globalAlpha = 1;
  c.beginPath(); c.arc(cx, ey, 3.5, 0, Math.PI * 2); c.fillStyle = color; c.fill();
  c.fillStyle = C.card; c.lineWidth = 1.5;
  c.beginPath(); c.roundRect ? c.roundRect(x0, y0, w, h, 12) : c.rect(x0, y0, w, h); c.fill(); c.stroke();
  c.fillStyle = C.ink; c.textBaseline = "middle"; c.fillText(label, x0 + 8, ey + .5);
  c.restore();
  FXHITS.push({x0:x0 - 6, x1:x0 + w + 6, y0:y0 - 8, y1:y0 + h + 8, lane:col.lane.id, items:arr});
}

// ---------------------------------------------------------------- saut vers un évènement lié, et retour
let JUMP = null, JUMP_LIST = null, FXHITS = [];
function jumpTo(o, laneId){
  if (!o) return;
  const t = loupeTarget();
  JUMP = {tc:S.tc, span:S.span, pick:S.pick, sec:S.sec, from:t ? t.n : null, at:o._tp, landed:false};
  S.sec = {lane:laneId, id:o.id}; S.pick = null; AUTO.hold = true;
  showJBack();
  glideTo(o._tp, S.span, 400, () => { if (JUMP) JUMP.landed = true; });
}
function jumpBack(){
  const j = JUMP; if (!j) return;
  JUMP = null; showJBack();
  S.pick = j.pick; S.sec = j.sec; AUTO.hold = false;
  glideTo(j.tc, j.span, 400);
}
function clearJump(){ if (JUMP){ JUMP = null; showJBack(); } }
function showJBack(){
  const b = $("jback");
  if (!JUMP){ b.classList.remove("show"); return; }
  const f = JUMP.from;
  b.textContent = "← " + (f ? fmtShort(f.start) + " · " + txt(f.title) : fmtSpan(JUMP.tc - JUMP.span/2, JUMP.tc + JUMP.span/2));
  b.classList.add("show");
  placeJBack();
}
function placeJBack(){
  if (!JUMP) return;
  const b = $("jback"), L = LAST_LAYOUT || layoutFor(S.c), m = L.find(x => x.main); if (!m) return;
  b.style.left = (m.x + m.w / 2) + "px"; b.style.maxWidth = Math.max(120, m.w - 16) + "px";
}
function jumpCheck(){ if (JUMP && JUMP.landed && Math.abs(S.tc - JUMP.at) > S.span) clearJump(); }
function openJumpList(h){ JUMP_LIST = h; SHEET_KIND = null; openSheet("jump"); }

// ---------------------------------------------------------------- secondaires automatiques (spec § 16)
// Même formule que RelatedIndex.scores() dans tools/tldb.py : modifier les poids aux deux endroits.
const AUTO_LW = {causes:5, leads_to:5, reaction_to:5, opposes:5, influences:4, continues:4, comparable_to:3, references:2};
const AUTO_EW = [["persons","person",2], ["organizations","org",2], ["works","work",1], ["places","place",0.5]];
const AUTO_CAP = 6, AUTO_FLOOR = 1, AUTO_HYST = 1.5, AUTO_MIN_SPAN = 3;   // fenêtre de calcul d'au moins 3 ans
const WHY_KEYS = [["links","node"], ["persons","person"], ["organizations","org"], ["works","work"], ["places","place"], ["common","node"]];
const AUTO = {key:"", main:null, scores:new Map(), timer:0, hold:false, temp:null, last:0, band:""};
const NODE_ROOTS = new Map(), RARITY = new Map();
function rootLane(l){ while (l && l.parent) l = l.parent; return l; }
function laneKind(l){ return rootLane(l)?.node.view?.kind || "region"; }
function buildAutoIndex(){
  for (const [id, ls] of NODE_LANES) NODE_ROOTS.set(id, new Set(ls.map(l => rootLane(l).id)));
  for (const [ref, arr] of ENT_NODES) RARITY.set(ref, 1 / Math.log2(1 + arr.length));
}
function autoAllowed(id, mainId, themes = S.themes){
  const l = LANE.get(id), m = LANE.get(mainId);
  if (!l || !m || rootLane(l) === rootLane(m)) return false;
  return themes || laneKind(l) !== "theme";
}
/** score de chaque timeline racine par rapport à ce que montre la fenêtre [tc - span/2, tc + span/2] de la principale */
function autoScores(mainId, tc, span, themes){
  const main = LANE.get(mainId), out = new Map();
  if (!main) return out;
  span = Math.max(span, AUTO_MIN_SPAN);
  const a = tc - span/2, b = tc + span/2, mroot = rootLane(main).id;
  const prox = o => { const x = o._tp; if (x >= a && x <= b) return 1; return Math.max(0, 1 - (x < a ? a - x : x - b) / span); };
  const ok = id => id !== mroot && (themes || laneKind(LANE.get(id)) !== "theme");
  for (const e of main.evs){
    const n = e.n;
    if (n._tp < a || n._tp > b || hidden(n)) continue;
    const wp = 1 - 0.5 * Math.abs(n._tp - tc) / (span/2), ev = new Map();
    const bump = (id, k, v, key) => {
      if (!ok(id) || !(v > 0)) return;
      let x = ev.get(id); if (!x){ x = {v:0, why:{}}; ev.set(id, x); }
      x.v += v; (x.why[k] ||= new Set()).add(key);
    };
    for (const id of NODE_ROOTS.get(n.id) || []) bump(id, "common", 1, n.id);
    const ref = "node:" + n.id;
    for (const [l, o] of [...(LINKS_OUT.get(ref) || []).map(l => [l, l.to]), ...(LINKS_IN.get(ref) || []).map(l => [l, l.from])]){
      if (!o.startsWith("node:")) continue;
      const on = NODES.get(o.slice(5)); if (!on || main.has.has(on.id)) continue;
      const v = (AUTO_LW[l.type] || 2) * prox(on);
      for (const id of NODE_ROOTS.get(on.id) || []) bump(id, "links", v, on.id);
    }
    for (const [f, pre, w] of AUTO_EW){
      for (const x of (n[f] || [])){
        const er = pre + ":" + x, list = ENT_NODES.get(er);
        if (!list || list.length < 2) continue;
        const best = new Map();
        for (const o of list){
          if (o === n) continue;
          const p = prox(o); if (!p) continue;
          for (const id of NODE_ROOTS.get(o.id) || []) if ((best.get(id) || 0) < p) best.set(id, p);
        }
        for (const [id, p] of best) bump(id, f, w * RARITY.get(er) * p, x);
      }
    }
    for (const [id, x] of ev){
      let r = out.get(id); if (!r){ r = {id, s:0, why:{}}; out.set(id, r); }
      r.s += wp * Math.min(x.v, AUTO_CAP);
      for (const k in x.why){ const s = (r.why[k] ||= new Set()); for (const v of x.why[k]) s.add(v); }
    }
  }
  return out;
}
/** choisit les secondaires ; renvoie true si les colonnes ont changé */
function autoPick(force, tc = S.tc, span = S.span){
  if (!S.auto || !S.c.length || S.swap) return false;
  const mainId = S.c[ci()];
  for (const id of [...S.fix]) if (!S.c.includes(id) || id === mainId) S.fix.delete(id);
  const key = [mainId, tc.toFixed(3), span.toFixed(3), [...S.hiddenFam].sort().join(), S.themes, [...S.fix].sort().join(), AUTO.temp || ""].join("|");
  if (!force && key === AUTO.key) return false;
  AUTO.key = key; AUTO.last = performance.now(); AUTO.main = mainId;
  const sc = autoScores(mainId, tc, span, S.themes); AUTO.scores = sc;
  const val = id => sc.get(id)?.s || 0;
  const fixed = id => !!id && (S.fix.has(id) || AUTO.temp === id);
  const slots = S.c.length === 3 ? [S.c[0], S.c[2]] : S.c.length === 2 ? [S.c[0], null] : [null, null];
  for (let i = 0; i < 2; i++) if (slots[i] && !fixed(slots[i]) && !autoAllowed(slots[i], mainId)) slots[i] = null;
  const pool = [...sc.values()].filter(r => r.s >= AUTO_FLOOR && !slots.includes(r.id) && LANE.has(r.id))
    .sort((x, y) => y.s - x.s || x.id.localeCompare(y.id)).map(r => r.id);
  // la place la plus faible (ou vide) est disputée la première ; hystérésis : il faut faire 1,5 fois mieux
  const order = [0, 1].filter(i => !fixed(slots[i])).sort((i, j) => (slots[i] ? val(slots[i]) : -1) - (slots[j] ? val(slots[j]) : -1));
  for (const i of order){
    const cand = pool[0]; if (!cand) break;
    if (!slots[i] || val(cand) >= AUTO_HYST * val(slots[i])){ slots[i] = cand; pool.shift(); }
  }
  if (!slots[0] && !slots[1]){ const w = ROOT_LANES.find(l => laneKind(l) === "global"); if (w && autoAllowed(w.id, mainId)) slots[0] = w.id; }
  if (!slots[0] && slots[1]){ slots[0] = slots[1]; slots[1] = null; }
  const next = [slots[0], mainId, slots[1]].filter(Boolean);
  if (next.join() === S.c.join()) return false;
  const fresh = next.filter(id => id !== mainId && !S.c.includes(id));
  S.c = next;
  if (S.sec && !S.c.includes(S.sec.lane)) S.sec = null;
  LKEY = ""; SKEY = ["", ""];
  if (fresh.length){
    S.fadeIn = {ids:new Set(fresh), p:0}; const t0 = performance.now();
    anim("autofade", now => { if (!S.fadeIn) return false; S.fadeIn.p = Math.min(1, (now - t0) / 300); if (S.fadeIn.p >= 1){ S.fadeIn = null; return false; } return true; });
  } else draw();
  return true;
}
/** appelé à chaque rendu : recalcul à l'arrêt du défilement, ou par période pendant le défilement automatique */
function autoSoon(){
  if (!S.auto || S.swap) return;
  if (S.playing){
    const ch = periodsAt(mainLane(), S.tc), bk = ch.length ? ch[ch.length-1].n.id : "";
    if (bk !== AUTO.band || performance.now() - AUTO.last > 3000){ AUTO.band = bk; autoPick(false); }
    return;
  }
  if (AUTO.hold) return;
  clearTimeout(AUTO.timer);
  AUTO.timer = setTimeout(() => { if (ANIMS.size || G || S.swap) return autoSoon(); autoPick(false); }, 350);
}
/** déplacement voulu par l'utilisateur : lève les blocages temporaires du mode automatique */
function userMoved(){ AUTO.hold = false; AUTO.temp = null; }

// ---------------------------------------------------------------- panneaux « pourquoi » et « évènements liés »
let WHY_LANE = null;
function openWhy(id){ WHY_LANE = id; SHEET_KIND = null; openSheet("why"); }
function whyNames(pre, ids){
  const arr = [...ids].map(x => entName(pre + ":" + x));
  return arr.slice(0, 5).join(", ") + (arr.length > 5 ? ", …" : "");
}
function whyHTML(){
  const l = LANE.get(WHY_LANE), mainId = S.c[ci()];
  if (!l || !LANE.get(mainId)) return "";
  const sc = autoScores(mainId, S.tc, S.span, true), r = sc.get(rootLane(l).id);
  const status = !S.auto ? tr("m.why.manual") : S.fix.has(l.id) ? tr("m.why.fixed") : tr("m.why.auto");
  let h = `<div class="sh-h"><b><span class="wysw" style="background:${l.color}"></span>${esc(laneName(l))}</b><span class="hint">${esc(status)}</span></div><div class="sh-b">`;
  const parts = r ? WHY_KEYS.filter(([k]) => r.why[k]?.size) : [];
  if (parts.length){
    h += `<div class="wytext">${esc(tr("m.why.intro", {range:fmtSpan(S.tc - Math.max(S.span, AUTO_MIN_SPAN)/2, S.tc + Math.max(S.span, AUTO_MIN_SPAN)/2)}))}</div>`;
    for (const [k, pre] of parts) h += `<div class="wyl"><b>${esc(tr("m.why." + k))} (${r.why[k].size})</b> ${esc(whyNames(pre, r.why[k]))}</div>`;
  } else h += `<div class="wytext">${esc(tr("m.why.none"))}</div>`;
  if (S.auto) h += `<div class="mrow act" data-act="wyfix"><span class="nm">${esc(tr("m.why.fix"))}</span><span class="sw2 ${S.fix.has(l.id) ? "on" : ""}"></span></div>`;
  const shown = new Set(S.c.map(id => rootLane(LANE.get(id)).id));
  const cands = ROOT_LANES.filter(x => !shown.has(x.id) && (!S.auto || autoAllowed(x.id, mainId)))
    .map(x => ({l:x, s:sc.get(x.id)?.s || 0})).sort((a, b) => b.s - a.s || a.l.node._t0 - b.l.node._t0);
  const max = Math.max(1, ...cands.map(c => c.s));
  const row = c => `<div class="wyrow" data-act="wyrep" data-id="${c.l.id}"><span class="sw" style="background:${c.l.color}"></span><span class="nm">${esc(laneName(c.l))}</span><span class="bar"><i style="width:${Math.round(100 * c.s / max)}%"></i></span></div>`;
  const rel = cands.filter(c => c.s >= AUTO_FLOOR), rest = cands.filter(c => c.s < AUTO_FLOOR);
  if (rel.length) h += `<div class="wyh">${esc(tr("m.why.replace"))}</div>` + rel.map(row).join("");
  if (rest.length) h += `<div class="wyh">${esc(tr("m.why.others"))}</div>` + rest.map(row).join("");
  return h + `</div>`;
}
function jumpListHTML(){
  const h = JUMP_LIST; if (!h) return "";
  const l = LANE.get(h.lane);
  return `<div class="sh-h"><b>${esc(tr("m.jump.title"))}</b><span class="hint">${esc(laneName(l) + " · " + tr("m.jump.hint"))}</span></div><div class="sh-b">` +
    h.items.map((it, i) => `<div class="wyrow" data-act="jump" data-i="${i}"><span class="sw" style="background:${LINK_COLORS[it.type] || "#777"};border-radius:50%"></span><span class="nm"><small>${esc(fmtShort(it.o.start))}</small> ${esc(txt(it.o.title))}</span></div>`).join("") + `</div>`;
}

// ---------------------------------------------------------------- loupe
function loupeCands(){
  const lane = mainLane(), out = [];
  if (!lane) return out;
  for (const e of lane.evs){
    if (hidden(e.n)) continue;
    const y = Y(e.n._tp);
    if (y < H/2 - TOL) continue;           // plus récent que la zone
    if (y > H/2 + TOL) continue;
    out.push(e.n);
  }
  return out; // ordre chronologique
}
function loupeTarget(){
  if (S.sec){
    const n = NODES.get(S.sec.id);
    if (n && LANE.get(S.sec.lane) && S.c.includes(S.sec.lane)) return {n, main:false, lane:LANE.get(S.sec.lane), cands:[n], idx:0};
    S.sec = null;
  }
  const cands = loupeCands();
  if (!cands.length) return null;
  let idx = cands.findIndex(n => n.id === S.pick);
  if (idx < 0){ let best = 1e9; cands.forEach((n, i) => { const d = Math.abs(Y(n._tp) - H/2); if (d < best){ best = d; idx = i; } }); }
  return {n:cands[idx], main:true, lane:mainLane(), cands, idx};
}
function periodsAt(lane, t){ return lane ? lane.pers.filter(p => p.n._t0 <= t && t < p.n._t1) : []; }
function nearestIn(lane, t){
  let best = null, bd = 1e9;
  for (const e of lane.evs){ if (hidden(e.n)) continue; const d = Math.abs(e.n._tp - t); if (d < bd){ bd = d; best = e.n; } }
  return best;
}
const ICONS = {
  person:'<path d="M8 8.2a2.9 2.9 0 100-5.8 2.9 2.9 0 000 5.8zM2.6 14.5c.7-3 2.8-4.6 5.4-4.6s4.7 1.6 5.4 4.6"/>',
  org:'<path d="M3.5 15V2M3.5 2.8h9l-2 3 2 3h-9"/>',
  place:'<path d="M8 15s-5-4.8-5-8.4a5 5 0 0110 0C13 10.2 8 15 8 15z"/><circle cx="8" cy="6.6" r="1.7"/>',
  work:'<path d="M3 2.5h7l3 3v8H3z"/><path d="M10 2.5v3h3"/>',
  image:'<rect x="1.8" y="3" width="12.4" height="10" rx="1.5"/><path d="M1.8 11.2l3.6-3.4 3 2.8 2-1.8 3.8 3.2"/>',
  link:'<path d="M6.8 9.2l2.4-2.4"/><path d="M8.6 4.6l.9-.9a2.6 2.6 0 013.7 3.7l-.9.9M7.4 11.4l-.9.9a2.6 2.6 0 01-3.7-3.7l.9-.9"/>',
  source:'<path d="M3 2.5v11M6 2.5v11M9 3l3.6 10.3"/>',
  sub:'<path d="M6 4h8M6 8h8M6 12h8"/><circle cx="2.6" cy="4" r=".6"/><circle cx="2.6" cy="8" r=".6"/><circle cx="2.6" cy="12" r=".6"/>',
  bio:'<rect x="1.5" y="3" width="13" height="10" rx="1.5"/><circle cx="5.4" cy="7" r="1.6"/><path d="M9 6.3h4M9 9h3M3.2 11c.4-1.2 1.2-1.8 2.2-1.8s1.8.6 2.2 1.8"/>'
};
function ic(k, n, title){ return `<span class="ic" title="${esc(title)}"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>${n > 1 ? `<b>${n}</b>` : ""}</span>`; }
function infoIcons(n){
  const ref = "node:" + n.id, out = [];
  const P = n.persons || [];
  if (P.length) out.push(ic("person", P.length, tr("m.ic.persons")));
  if (P.some(id => ENT.get("person:" + id)?.item.bio)) out.push(ic("bio", 0, tr("m.ic.bio")));
  if (n.organizations?.length) out.push(ic("org", n.organizations.length, tr("m.ic.orgs")));
  if (n.places?.length) out.push(ic("place", n.places.length, tr("m.ic.places")));
  if (n.works?.length) out.push(ic("work", n.works.length, tr("m.ic.works")));
  const im = imagesOf(ref).length; if (im) out.push(ic("image", im, tr("m.ic.images")));
  const lk = (LINKS_OUT.get(ref) || []).length + (LINKS_IN.get(ref) || []).length; if (lk) out.push(ic("link", lk, tr("m.ic.links")));
  if (n.sources?.length) out.push(ic("source", n.sources.length, tr("m.ic.sources")));
  const k = (CHILDREN.get(n.id) || []).length; if (k) out.push(ic("sub", k, tr("m.ic.sub")));
  return out.join("");
}
function fitSummary(el, reserve){
  const sm = el.querySelector(".lsum"); if (!sm) return;
  const avail = LOUPE_H - sm.offsetTop - reserve;
  const k = Math.max(0, Math.floor(avail / 17));
  sm.style.display = k ? "" : "none"; sm.style.webkitLineClamp = k; sm.style.lineClamp = k;
}
let LKEY = "", SKEY = ["", ""], HKEY = "", BKEY = "";
function updateDom(){
  const lane = mainLane(); if (!lane) return;
  placeJBack();
  // en-tête
  const hk = lane.id + "|" + LANG;
  if (hk !== HKEY){ HKEY = hk; const h = $("hname"); h.firstElementChild.style.background = lc(lane.color); h.lastElementChild.textContent = laneName(lane); }
  $("hrange").textContent = fmtSpan(T(H), T(0));
  // bande des périodes
  if (S.periods){
    const chain = periodsAt(lane, S.tc);
    const bk = chain.map(p => p.n.id).join(",") + "|" + LANG + "|" + W;
    if (bk !== BKEY){
      BKEY = bk;
      const el = $("bandtxt"), names = chain.map(p => txt(p.n.view?.label || p.n.title));
      el.style.opacity = .2;
      el.textContent = names.length ? names.join(" › ") : "—";
      if (names.length > 1 && el.scrollWidth > el.clientWidth + 1) el.textContent = "… › " + names[names.length-1];
      requestAnimationFrame(() => el.style.opacity = 1);
      $("band").dataset.ref = chain.length ? "node:" + chain[chain.length-1].n.id : "";
    }
  }
  // loupe
  const lp = $("loupe");
  lp.classList.toggle("off", !S.loupe);
  if (!S.loupe) return;
  lp.classList.toggle("fade", !!S.swap);
  if (S.swap) return;
  lp.style.top = bandTop() + "px"; lp.style.height = LOUPE_H + "px";
  const L = LAST_LAYOUT || layoutFor(S.c), main = L.find(x => x.main), sides = L.filter(x => !x.main);
  const mid = $("lmid");
  mid.style.left = main.x + "px"; mid.style.width = main.w + "px";
  mid.classList.toggle("solo", sides.length === 0);
  const t = loupeTarget();
  let key;
  if (t) key = "e|" + t.n.id + "|" + t.idx + "/" + t.cands.length + "|" + (t.main ? "" : t.lane.id);
  else { const ch = periodsAt(lane, S.tc); key = "p|" + (ch.length ? ch[ch.length-1].n.id : ""); }
  key += "|" + LANG + "|" + S.hiddenFam.size;
  if (key !== LKEY){
    LKEY = key;
    mid.classList.remove("dim", "empty");
    if (t){
      const n = t.n, color = lc(t.lane.colOf.get(n.id) || t.lane.color);
      mid.style.boxShadow = t.main ? "" : `inset 0 3px 0 ${color}`;
      mid.dataset.ref = "node:" + n.id;
      const cl = t.cands.length > 1 ? `<span class="cl"><i class="${t.idx === 0 ? "dis" : ""}" data-act="lprev">‹</i>${t.idx + 1}/${t.cands.length}<i class="${t.idx === t.cands.length - 1 ? "dis" : ""}" data-act="lnext">›</i></span>` : "";
      mid.innerHTML = `<div class="ld">${t.main ? "" : esc(laneName(t.lane)) + " · "}${esc(fmtRangeShort(n))}</div>` +
        `<div class="lt">${famSVG(n._fam, color)}${esc(txt(n.title))}</div>` +
        (n.summary ? `<div class="lsum">${esc(txt(n.summary))}</div>` : "") +
        `<div class="lic">${infoIcons(n)}${cl}</div>`;
      fitSummary(mid, 36);
    } else {
      const ch = periodsAt(lane, S.tc), p = ch.length ? ch[ch.length-1].n : null;
      mid.style.boxShadow = "";
      if (p){
        mid.classList.add("dim"); mid.dataset.ref = "node:" + p.id;
        mid.innerHTML = `<div class="ld">${esc(tr("m.loupe.period") + fmtRangeShort(p))}</div><div class="lt">${esc(txt(p.view?.label || p.title))}</div>` + (p.summary ? `<div class="lsum">${esc(txt(p.summary))}</div>` : "");
        fitSummary(mid, 8);
      } else { mid.classList.add("empty"); mid.dataset.ref = ""; mid.innerHTML = esc(tr("m.loupe.empty")); }
    }
  }
  // lecture synchronique dans les colonnes secondaires
  const cells = [$("lsA"), $("lsB")], tl = t && t.main ? linkedIds(t.n) : null;
  cells.forEach((el, i) => {
    const col = sides[i];
    if (!col){ el.style.display = "none"; SKEY[i] = ""; return; }
    el.style.display = ""; el.style.left = col.x + "px"; el.style.width = col.w + "px";
    el.style.borderTopColor = lc(col.lane.color);
    let n = nearestIn(col.lane, S.tc), lt = null;
    // un évènement lié à celui de la loupe, à sa hauteur, passe devant (spec § 17)
    if (tl && tl.size){
      let bd = 1e9;
      for (const [id, type] of tl){
        if (!col.lane.has.has(id)) continue;
        const o = NODES.get(id); if (!o || hidden(o)) continue;
        const d = Math.abs(Y(o._tp) - H/2);
        if (d <= LOUPE_H / 2 && d < bd){ bd = d; n = o; lt = type; }
      }
    }
    const far = !n || Math.abs(Y(n._tp) - H/2) > LOUPE_H / 2;
    const k = col.lane.id + "|" + (n ? n.id : "") + "|" + far + "|" + lt + "|" + LANG;
    if (k === SKEY[i]) return;
    SKEY[i] = k; el.dataset.lane = col.lane.id; el.dataset.ref = n ? "node:" + n.id : "";
    el.classList.toggle("far", far); el.classList.toggle("none", !n);
    el.innerHTML = n ? `<div class="sd">${lt ? `<span class="lkd" style="background:${LINK_COLORS[lt] || "#777"}"></span>` : ""}${esc(fmtShortRaw(n.start.date, L2()))}</div><div class="st" lang="${LANG === "orig" ? "" : LANG}">${esc(txt(n.title))}</div>` : "—";
  });
}

// ---------------------------------------------------------------- animation
const ANIMS = new Map(); let RAF = 0;
function kick(){ if (!RAF) RAF = requestAnimationFrame(frame); }
function frame(now){
  RAF = 0;
  for (const [k, f] of [...ANIMS]) if (!f(now)) ANIMS.delete(k);
  render();
  if (ANIMS.size) kick();
}
function draw(){ kick(); }
function anim(name, f){ ANIMS.set(name, f); kick(); }
function stopAnim(name){ ANIMS.delete(name); }
function easeOut(p){ return 1 - Math.pow(1 - p, 3); }
function easeInOut(p){ return p < .5 ? 4*p*p*p : 1 - Math.pow(-2*p + 2, 3) / 2; }
function glideTo(tc, sp = S.span, ms = 260, then){
  const a = {tc:S.tc, sp:S.span}, t0 = performance.now();
  tc = Math.max(MIN_T, Math.min(MAX_T, tc)); sp = Math.max(MIN_SPAN, Math.min(MAX_SPAN, sp));
  anim("view", now => {
    const p = Math.min(1, (now - t0) / ms), e = easeOut(p);
    S.tc = a.tc + (tc - a.tc) * e;
    S.span = Math.exp(Math.log(a.sp) + (Math.log(sp) - Math.log(a.sp)) * e);
    if (p >= 1){ then && then(); return false; }
    return true;
  });
}
function magnet(){
  if (!S.loupe || S.playing) return;
  const t = loupeTarget();
  if (!t) return;
  const y = Y(t.n._tp);
  if (Math.abs(y - H/2) > .5) glideTo(t.n._tp, S.span, 250);
}

// ---------------------------------------------------------------- zoom par paliers (boutons + et −)
// Seule la plage change : la date de la loupe reste au centre, ce qui permet de zoomer aussi pendant le défilement automatique.
let ZOOM = null; // {f: fonction d'animation en cours, to: plage visée}
function zoomBase(){ return ZOOM && ANIMS.get("view") === ZOOM.f ? ZOOM.to : S.span; }
function zoomNext(dir){ // dir -1 : plage plus courte (zoom avant), +1 : plage plus longue
  const cur = zoomBase();
  return dir < 0 ? [...ZOOM_LEVELS].reverse().find(v => v < cur * 0.97) : ZOOM_LEVELS.find(v => v > cur * 1.03);
}
function zoomStep(dir){
  const to = zoomNext(dir);
  if (to === undefined) return;
  stopAnim("inertia"); userMoved(); // la cible de la loupe (S.pick, S.sec) est gardée : elle reste au centre
  const a = S.span, t0 = performance.now(), ms = 280;
  const f = now => {
    const p = Math.min(1, (now - t0) / ms);
    S.span = Math.exp(Math.log(a) + (Math.log(to) - Math.log(a)) * easeOut(p));
    if (p >= 1){ ZOOM = null; magnet(); return false; }
    return true;
  };
  ZOOM = {f, to}; anim("view", f);
}
let ZKEY = "";
function updateZoomBtns(){
  const k = (zoomNext(-1) === undefined ? "0" : "1") + (zoomNext(1) === undefined ? "0" : "1");
  if (k === ZKEY) return;
  ZKEY = k; $("bZin").disabled = k[0] === "0"; $("bZout").disabled = k[1] === "0";
}

// ---------------------------------------------------------------- gestes
const PTR = new Map(); let G = null, lastTap = null;
function local(e){ const r = wrap.getBoundingClientRect(); return {x:e.clientX - r.left, y:e.clientY - r.top}; }
wrap.addEventListener("pointerdown", e => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  try { wrap.setPointerCapture(e.pointerId); } catch(_){}
  const p = local(e);
  PTR.set(e.pointerId, p);
  stopAnim("view"); stopAnim("inertia");
  if (S.playing) stopPlay();
  if (PTR.size === 1){
    G = {type:"pending", id:e.pointerId, x0:p.x, y0:p.y, tc0:S.tc, t0:performance.now(), samples:[{t:performance.now(), y:p.y}],
         edge: e.clientX < 24 || e.clientX > window.innerWidth - 24};
  } else if (PTR.size === 2){
    userMoved();
    const [a, b] = [...PTR.values()];
    const ym0 = (a.y + b.y) / 2;
    G = {type:"pinch", d0:Math.max(40, Math.abs(a.y - b.y)), span0:S.span, tm:T(ym0)};
  }
});
wrap.addEventListener("pointermove", e => {
  if (!PTR.has(e.pointerId) || !G) return;
  const p = local(e); PTR.set(e.pointerId, p);
  if (G.type === "pinch" && PTR.size >= 2){
    const [a, b] = [...PTR.values()];
    const d = Math.max(40, Math.abs(a.y - b.y)), ymid = (a.y + b.y) / 2;
    S.span = Math.max(MIN_SPAN, Math.min(MAX_SPAN, G.span0 * G.d0 / d));
    S.tc = G.tm + (ymid - H/2) / H * S.span;
    clampView(); S.sec = null; S.pick = null; draw();
    return;
  }
  if (e.pointerId !== G.id) return;
  const dx = p.x - G.x0, dy = p.y - G.y0;
  if (G.type === "pending" && Math.hypot(dx, dy) > 9){
    G.type = (Math.abs(dx) > 2 * Math.abs(dy) && !G.edge && S.c.length > 1) ? "hswipe" : "pan";
    if (G.type === "pan"){ S.sec = null; S.pick = null; G.y0 = p.y; G.tc0 = S.tc; userMoved(); }
  }
  if (G.type === "pan"){
    S.tc = G.tc0 + (p.y - G.y0) / H * S.span; clampView();
    const now = performance.now(); G.samples.push({t:now, y:p.y}); while (G.samples.length > 2 && now - G.samples[0].t > 100) G.samples.shift();
    draw();
  }
});
function endPointer(e){
  if (!PTR.has(e.pointerId)) return;
  const p = local(e); PTR.delete(e.pointerId);
  if (!G) return;
  if (G.type === "pinch"){
    if (PTR.size === 1){ const [id, q] = [...PTR.entries()][0]; G = {type:"pan", id, x0:q.x, y0:q.y, tc0:S.tc, samples:[{t:performance.now(), y:q.y}]}; }
    else if (PTR.size === 0){ G = null; magnet(); }
    return;
  }
  if (e.pointerId !== G.id) return;
  const g = G; G = null;
  if (e.type === "pointercancel"){ magnet(); return; }
  if (g.type === "pending"){ if (performance.now() - g.t0 < 600) tap(p.x, p.y, e); return; }
  if (g.type === "hswipe"){ const dx = p.x - g.x0; if (Math.abs(dx) > 50) rotate(dx < 0 ? -1 : 1); return; }
  if (g.type === "pan"){
    const s = g.samples, a = s[0], b = s[s.length-1];
    const v = (b.t - a.t) > 10 && performance.now() - b.t < 80 ? (b.y - a.y) / (b.t - a.t) : 0; // px/ms
    if (Math.abs(v) < 0.08){ magnet(); return; }
    let vel = v, last = performance.now();
    anim("inertia", now => {
      const dt = Math.min(40, now - last); last = now;
      S.tc += vel * dt / H * S.span; clampView();
      vel *= Math.pow(0.94, dt / 16);
      if (Math.abs(vel) < 0.03 || S.tc <= MIN_T || S.tc >= MAX_T){ setTimeout(magnet, 0); return false; }
      return true;
    });
  }
}
wrap.addEventListener("pointerup", endPointer);
wrap.addEventListener("pointercancel", endPointer);
document.addEventListener("gesturestart", e => e.preventDefault());
let wheelT = 0;
wrap.addEventListener("wheel", e => {
  e.preventDefault(); stopAnim("view"); stopAnim("inertia"); userMoved();
  const p = local(e);
  if (e.ctrlKey){ const t = T(p.y); S.span *= Math.exp(e.deltaY * 0.01); clampView(); S.tc = t + (p.y - H/2) / H * S.span; }
  else S.tc -= e.deltaY / H * S.span;
  clampView(); S.sec = null; S.pick = null; draw();
  clearTimeout(wheelT); wheelT = setTimeout(magnet, 180);
}, {passive:false});

function inRect(el, cx, cy){ if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom; }
function tap(x, y, e){
  const cx = e.clientX, cy = e.clientY;
  // étiquettes des évènements liés hors de l'écran
  for (const h of FXHITS) if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1){
    if (h.items.length === 1) jumpTo(h.items[0].o, h.lane); else openJumpList(h);
    return;
  }
  // nom vertical d'une secondaire : pourquoi elle est là, la fixer, la remplacer
  for (const h of HITS) if (h.kind === "name" && x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1 && !(S.loupe && y >= bandTop() && y <= bandBot())){ openWhy(h.lane); return; }
  // loupe
  if (S.loupe && y >= bandTop() && y <= bandBot()){
    const arrow = [...$("lmid").querySelectorAll("[data-act]")].find(a => inRect(a, cx, cy));
    if (arrow){ stepCluster(arrow.dataset.act === "lnext" ? 1 : -1); return; }
    for (const id of ["lsA", "lsB"]){
      const el = $(id);
      if (el.style.display !== "none" && inRect(el, cx, cy)){
        const n = el.dataset.ref && NODES.get(el.dataset.ref.slice(5));
        if (n){ if (S.sec && S.sec.id === n.id && Math.abs(Y(n._tp) - H/2) < 2) openDetail("node:" + n.id); else { S.sec = {lane:el.dataset.lane, id:n.id}; glideTo(n._tp); } }
        return;
      }
    }
    const ref = $("lmid").dataset.ref;
    if (ref) openDetail(ref);
    return;
  }
  // repères
  let hit = null, bd = 1e9;
  for (const h of HITS){
    if (h.kind === "name" || x < h.x0 || x > h.x1 || y < h.y0 || y > h.y1) continue;
    const d = Math.abs(h.g.y - y); if (d < bd){ bd = d; hit = h; }
  }
  if (hit){
    lastTap = null;
    const n = hit.g.top.n;
    if (hit.kind === "main"){
      if (!S.loupe){
        if (hit.g.items.length > 1 && hit.g.y1 - hit.g.y0 >= 0.5) glideTo(T(hit.g.y), S.span / 3, 320);
        else openDetail("node:" + n.id);
        return;
      }
      S.sec = null; S.pick = n.id; glideTo(n._tp);
    } else {
      if (S.loupe && S.sec && S.sec.id === n.id && Math.abs(Y(n._tp) - H/2) < 2){ openDetail("node:" + n.id); return; }
      if (!S.loupe){ openDetail("node:" + n.id); return; }
      S.sec = {lane:hit.lane, id:n.id}; S.pick = null; glideTo(n._tp);
    }
    return;
  }
  // double tap sur le vide : zoom ×2 centré sur le point
  const now = performance.now();
  if (lastTap && now - lastTap.t < 320 && Math.hypot(x - lastTap.x, y - lastTap.y) < 30){
    lastTap = null; S.sec = null; S.pick = null; userMoved(); glideTo(T(y), S.span / 2, 300, magnet); return;
  }
  lastTap = {t:now, x, y};
}
function stepCluster(d){
  const t = loupeTarget(); if (!t || t.cands.length < 2) return;
  const i = Math.max(0, Math.min(t.cands.length - 1, t.idx + d));
  const n = t.cands[i]; S.pick = n.id; S.sec = null;
  if (Math.abs(Y(n._tp) - H/2) > .5) glideTo(n._tp, S.span, 220); else draw();
}
function rotate(dir){
  const c = S.c; if (c.length < 2) return;
  const from = c.slice();
  if (S.auto) AUTO.temp = from[from.length > 1 ? 1 : 0];
  clearJump();
  S.c = c.length === 2 ? [c[1], c[0]] : dir < 0 ? [c[1], c[2], c[0]] : [c[2], c[0], c[1]];
  S.sec = null; S.pick = null;
  S.swap = {from, to:S.c.slice(), p:0, dir};
  const t0 = performance.now();
  anim("swap", now => {
    S.swap.p = Math.min(1, (now - t0) / 300);
    if (S.swap.p >= 1){ S.swap = null; LKEY = ""; SKEY = ["", ""]; BKEY = ""; setTimeout(magnet, 0); return false; }
    return true;
  });
}

// ---------------------------------------------------------------- défilement automatique
let wakeLock = null;
function playEnd(){ const l = mainLane(); return l?.last ? l.last._tp : NOW; }
function startPlay(){
  if (S.playing) return;
  S.playing = true; S.sec = null; S.pick = null; setPlayIcon(); userMoved(); clearJump(); AUTO.band = "";
  try { navigator.wakeLock?.request("screen").then(l => wakeLock = l).catch(() => {}); } catch(_){}
  let last = performance.now();
  anim("play", now => {
    if (!S.playing) return false;
    const dt = Math.min(60, now - last); last = now;
    S.tc += SPEEDS[S.speed] * (S.span / 10) * dt / 1000;
    const end = playEnd();
    if (S.tc >= end){ S.tc = end; stopPlay(); return false; }
    return true;
  });
}
function stopPlay(){
  if (!S.playing) return;
  S.playing = false; stopAnim("play"); setPlayIcon();
  try { wakeLock?.release(); } catch(_){} wakeLock = null;
  setTimeout(magnet, 0);
}
function setPlayIcon(){
  $("bPlay").classList.toggle("on", S.playing);
  $("playShape").setAttribute("d", S.playing ? "M7 7h10v10H7z" : "M7 4.5l12 7.5-12 7.5z");
  $("bPlay").setAttribute("aria-label", tr(S.playing ? "m.rail.stop" : "m.rail.play"));
}

// ---------------------------------------------------------------- reset
function baseOrder(){
  const c = S.c.slice(); if (!c.includes(S.m)) return c;
  if (c.length === 2 && c[1] !== S.m) return [c[1], c[0]];
  if (c.length === 3) while (c[1] !== S.m) c.push(c.shift());
  return c;
}
function reset(){
  stopPlay(); clearJump();
  if (S.auto){ S.fix.clear(); AUTO.temp = null; AUTO.hold = false; S.c = [LANE.has(S.m) ? S.m : S.c[ci()]]; }
  else S.c = baseOrder();
  S.hiddenFam.clear(); S.sec = null;
  const lane = mainLane(), last = lane?.last;
  S.span = 10; S.tc = last ? last._tp : NOW; S.pick = last ? last.id : null;
  clampView(); LKEY = ""; SKEY = ["", ""]; updateBadge();
  if (S.auto) autoPick(true);
  draw();
}

// ---------------------------------------------------------------- superpositions (avec historique)
const OV = [];
function hashOv(){ return "#" + hashStr(); }
let OV_T = 0;
function pushOv(o){ stopPlay(); OV_T = performance.now(); OV.push(o); history.pushState({ov:OV.length}, "", hashOv()); renderOv(); }
function replaceTop(o){ OV[OV.length - 1] = o; history.replaceState({ov:OV.length}, "", hashOv()); renderOv(); }
function back(){ if (OV.length) history.back(); }
function closeTo(depth){ const k = OV.length - depth; if (k > 0) history.go(-k); }
window.addEventListener("popstate", e => {
  const d = e.state?.ov || 0;
  if (d > OV.length){ history.replaceState({ov:OV.length}, "", hashOv()); return; }
  while (OV.length > d) OV.pop();
  renderOv(); draw();
});
let SHEET_KIND = null, DREF = null;
function renderOv(){
  const top = (t) => { for (let i = OV.length - 1; i >= 0; i--) if (OV[i].type === t) return OV[i]; return null; };
  const sh = top("sheet");
  $("sheet").classList.toggle("show", !!sh); $("scrim").classList.toggle("show", !!sh);
  if (sh && sh.kind !== SHEET_KIND){ SHEET_KIND = sh.kind; buildSheet(sh.kind); }
  if (!sh) SHEET_KIND = null;
  const se = top("search");
  $("search").classList.toggle("show", !!se);
  if (!se) $("q").blur();
  const de = top("detail");
  $("detail").classList.toggle("show", !!de);
  if (de && de.ref !== DREF){ DREF = de.ref; renderDetail(de.ref); }
  if (!de) DREF = null;
  const lbo = top("lb");
  $("lb").classList.toggle("show", !!lbo);
  if (lbo) renderLightbox(lbo);
  $("help").classList.toggle("show", !!top("help"));
}

// ---------------------------------------------------------------- feuilles
function openSheet(kind){ if (OV.length && OV[OV.length-1].type === "sheet") replaceTop({type:"sheet", kind}); else pushOv({type:"sheet", kind}); }
// un panneau ouvert depuis la frise (tap sur un nom, une étiquette) reçoit ensuite le clic émulé du toucher : ignoré
$("scrim").addEventListener("click", () => { if (performance.now() - OV_T > 450) back(); });
let SEL = null, SEL_OPEN = new Set();
function buildSheet(kind){
  const box = $("sheetc");
  if (kind === "select"){
    const c = S.auto ? S.c.slice() : baseOrder();
    SEL = c.length === 1 ? {main:c[0], left:null, right:null} : c.length === 2 ? {left:c[0], main:c[1], right:null} : {left:c[0], main:c[1], right:c[2]};
    SEL.auto = S.auto; SEL.themes = S.themes;
    for (const l of ROOT_LANES) if (l.sub.some(s => [SEL.left, SEL.main, SEL.right].includes(s.id))) SEL_OPEN.add(l.id);
    box.innerHTML = `<div class="sh-h"><b>${esc(tr("m.sel.title"))}</b><span class="hint" id="selhint"></span></div>
      <div class="autobar" id="selauto"></div>
      <div class="legendrow" id="sellegend" style="padding-left:18px;padding-right:18px"></div>
      <div class="sh-b" id="selrows"></div>
      <div class="sh-f"><button class="btn ghost" data-act="back">${esc(tr("m.cancel"))}</button><button class="btn primary" data-act="apply">${esc(tr("m.apply"))}</button></div>`;
    renderSelHead(); renderSelRows();
  } else if (kind === "why"){
    box.innerHTML = whyHTML();
  } else if (kind === "jump"){
    box.innerHTML = jumpListHTML();
  } else if (kind === "filter"){
    box.innerHTML = `<div class="sh-h"><b>${esc(tr("m.filter.title"))}</b><span class="hint">${esc(tr("m.filter.hint"))}</span></div>
      <div class="sh-b" id="famrows"></div>
      <div class="sh-f"><button class="btn ghost" data-act="famall">${esc(tr("m.filter.all"))}</button><button class="btn primary" data-act="back">${esc(tr("m.ok"))}</button></div>`;
    renderFamRows();
  } else if (kind === "menu"){
    box.innerHTML = `<div class="sh-h"><b>${esc(tr("m.menu.title"))}</b></div><div class="sh-b" id="menurows"></div>`;
    renderMenu();
  } else if (kind === "speed"){
    const names = [0, 1, 2].map(i => tr("m.speed." + i)), hint = [0, 1, 2].map(i => tr("m.speed." + i + ".hint"));
    box.innerHTML = `<div class="sh-h"><b>${esc(tr("m.speed.title"))}</b><span class="hint">${esc(tr("m.speed.hint"))}</span></div>
      <div class="sh-b">${names.map((nm, i) => `<div class="mrow act" data-act="speed" data-i="${i}"><span class="nm">${esc(nm)} <small style="color:var(--muted)">· ${esc(hint[i])}</small></span>${S.speed === i ? "✓" : ""}</div>`).join("")}</div>`;
  }
}
function renderSelHead(){
  $("selhint").textContent = tr(SEL.auto ? "m.sel.hint.auto" : "m.sel.hint");
  $("sellegend").textContent = tr(SEL.auto ? "m.sel.legend.auto" : "m.sel.legend");
  $("selauto").innerHTML = `<span class="nm">${esc(tr("m.sel.mode"))}</span>${seg("selmode", [["0", esc(tr("m.sel.manual"))], ["1", esc(tr("m.sel.auto"))]], SEL.auto ? "1" : "0")}` +
    (SEL.auto ? `<div class="chk" data-act="selthemes"><span class="nm">${esc(tr("m.sel.themes"))}</span><span class="sw2 ${SEL.themes ? "on" : ""}"></span></div>` : "");
}
function renderSelRows(){
  const rows = [];
  for (const l of laneOrder()){
    if (l.parent && !SEL_OPEN.has(l.parent.id)) continue;
    const role = SEL.main === l.id ? "main" : SEL.left === l.id ? "left" : SEL.right === l.id ? "right" : "";
    const n = l.evs.length + l.pers.length;
    rows.push(`<div class="srow" data-id="${l.id}" style="padding-left:${6 + l.depth * 18}px">
      <button class="tw ${l.sub.length ? "" : "ph"} ${SEL_OPEN.has(l.id) ? "open" : ""}" data-act="twist" aria-label="${esc(tr("m.sel.twist"))}">▶</button>
      <span class="sw" style="background:${l.color}"></span><span class="nm">${esc(laneName(l))}<small>${n}</small></span>
      <span class="roles"><button data-role="main" class="${role === "main" ? "on" : ""}">${esc(tr("m.sel.main"))}</button>${SEL.auto ? "" : `<button data-role="left" class="${role === "left" ? "on" : ""}">1</button><button data-role="right" class="${role === "right" ? "on" : ""}">2</button>`}</span></div>`);
  }
  $("selrows").innerHTML = rows.join("");
}
function renderFamRows(){
  $("famrows").innerHTML = FAMILIES.map(f => `<div class="frow ${S.hiddenFam.has(f.id) ? "off" : ""}" data-act="fam" data-id="${f.id}">${famSVG(f, "var(--ink)", 18)}<span class="nm">${esc(I18N.fam(f.id))}</span><span class="sw2 ${S.hiddenFam.has(f.id) ? "" : "on"}"></span></div>`).join("");
}
function seg(act, opts, cur){ return `<span class="seg">${opts.map(([v, lab]) => `<button data-act="${act}" data-v="${v}" class="${v === cur ? "on" : ""}">${lab}</button>`).join("")}</span>`; }
function renderMenu(){
  const g = DB.generated ? new Date(DB.generated) : null;
  const nEv = [...NODES.values()].length;
  $("menurows").innerHTML =
    `<div class="mrow act" data-act="reset"><span class="nm">${esc(tr("m.menu.reset"))}</span><small style="color:var(--muted)">${esc(tr("m.menu.reset.hint"))}</small></div>` +
    `<div class="mrow act" data-act="periods"><span class="nm">${esc(tr("m.menu.periods"))}</span><span class="sw2 ${S.periods ? "on" : ""}"></span></div>` +
    `<div class="mrow"><span class="nm">${esc(tr("m.menu.text"))}</span>${seg("dens", [["t",tr("m.menu.titles")],["m",tr("m.menu.mini")]], S.dens)}</div>` +
    `<div class="mrow"><span class="nm">${esc(tr("m.menu.lang"))}</span>${seg("lang", [...I18N.LANGS.map(l => [l, l.toUpperCase()]), ["orig",tr("lang.origShort")]], LANG)}</div>` +
    `<div class="mrow"><span class="nm">${esc(tr("m.menu.theme"))}</span>${seg("theme", [["system",tr("m.theme.auto")],["light",tr("m.theme.light")],["dark",tr("m.theme.dark")]], S.theme)}</div>` +
    `<div class="mrow act" data-act="share"><span class="nm">${esc(tr("m.menu.share"))}</span>↗</div>` +
    `<div class="mrow act" data-act="help"><span class="nm">${esc(tr("m.menu.help"))}</span>?</div>` +
    (SWREG ? `<div class="mrow act" data-act="update"><span class="nm">${esc(tr(swWaiting ? "m.menu.install" : "m.menu.update"))}</span>${swWaiting ? "●" : "↻"}</div>` : "") +
    `<div class="about">${tr("m.about", {date:esc(g ? g.toLocaleDateString(I18N.locale(), {day:"numeric", month:"long", year:"numeric"}) : "?"), nodes:nEv, persons:(DB.persons||[]).length, links:(DB.links||[]).length})}<br><a href="index.html">${esc(tr("m.home"))}</a> · <a href="desktop.html" target="_blank" rel="noopener">${esc(tr("m.desktop"))}</a></div>`;
}
$("sheet").addEventListener("click", e => {
  const a = e.target.closest("[data-act],[data-role]"); if (!a) return;
  const act = a.dataset.act;
  if (a.dataset.role){
    const id = a.closest(".srow").dataset.id, r = a.dataset.role;
    if (SEL[r] === id){ if (r !== "main") SEL[r] = null; }
    else { for (const k of ["main", "left", "right"]) if (SEL[k] === id) SEL[k] = null; SEL[r] = id; }
    if (!SEL.main){ SEL.main = id; if (SEL.left === id) SEL.left = null; if (SEL.right === id) SEL.right = null; }
    renderSelRows(); return;
  }
  if (act === "selmode"){ SEL.auto = a.dataset.v === "1"; renderSelHead(); renderSelRows(); return; }
  if (act === "selthemes"){ SEL.themes = !SEL.themes; renderSelHead(); return; }
  if (act === "wyfix"){
    S.fix.has(WHY_LANE) ? S.fix.delete(WHY_LANE) : S.fix.add(WHY_LANE);
    if (S.fix.has(WHY_LANE) && AUTO.temp === WHY_LANE) AUTO.temp = null;
    $("sheetc").innerHTML = whyHTML(); draw(); return;
  }
  if (act === "wyrep"){
    const i = S.c.indexOf(WHY_LANE), id = a.dataset.id;
    if (i >= 0 && LANE.has(id)){
      S.c[i] = id; if (S.auto){ S.fix.delete(WHY_LANE); S.fix.add(id); }
      if (S.sec && S.sec.lane === WHY_LANE) S.sec = null;
      LKEY = ""; SKEY = ["", ""];
    }
    back(); draw(); return;
  }
  if (act === "jump"){
    const it = JUMP_LIST?.items[+a.dataset.i], lane = JUMP_LIST?.lane;
    back(); if (it) setTimeout(() => jumpTo(it.o, lane), 30); return;
  }
  if (act === "twist"){ const id = a.closest(".srow").dataset.id; SEL_OPEN.has(id) ? SEL_OPEN.delete(id) : SEL_OPEN.add(id); renderSelRows(); return; }
  if (act === "back") return back();
  if (act === "apply"){
    clearJump(); AUTO.hold = false; AUTO.temp = null;
    if (SEL.auto){
      const cur = S.c[ci()];
      S.auto = true; S.themes = SEL.themes; S.m = SEL.main;
      if (SEL.main !== cur){ S.c = [SEL.main]; S.fix.clear(); }
      S.sec = null; S.pick = null;
      LKEY = ""; SKEY = ["", ""]; BKEY = ""; HKEY = "";
      autoPick(true);
    } else {
      let L = SEL.left, R = SEL.right; if (!L && R){ L = R; R = null; }
      S.auto = false; S.fix.clear();
      S.c = [L, SEL.main, R].filter(Boolean); S.m = SEL.main; S.sec = null; S.pick = null;
      LKEY = ""; SKEY = ["", ""]; BKEY = ""; HKEY = "";
    }
    back(); setTimeout(magnet, 30); return;
  }
  if (act === "fam"){ const id = a.dataset.id; S.hiddenFam.has(id) ? S.hiddenFam.delete(id) : S.hiddenFam.add(id); renderFamRows(); updateBadge(); LKEY = ""; draw(); return; }
  if (act === "famall"){ S.hiddenFam.clear(); renderFamRows(); updateBadge(); LKEY = ""; draw(); return; }
  if (act === "reset"){ reset(); back(); return; }
  if (act === "periods"){ S.periods = !S.periods; applyPeriods(); renderMenu(); return; }
  if (act === "dens"){ S.dens = a.dataset.v; renderMenu(); draw(); return; }
  if (act === "lang"){ setLang(a.dataset.v); I18N.set(LANG); I18N.remember(LANG); applyUI(); renderMenu(); return; }
  if (act === "theme"){ S.theme = a.dataset.v; applyTheme(); renderMenu(); return; }
  if (act === "share") return share();
  if (act === "update") return checkUpdate(true);
  if (act === "help"){ replaceTop({type:"help"}); return; }
  if (act === "speed"){ S.speed = +a.dataset.i; saveLocal(); back(); setTimeout(startPlay, 60); return; }
});
function updateBadge(){ const b = $("fbadge"), k = S.hiddenFam.size; b.textContent = k; b.classList.toggle("show", k > 0); $("bFilter").classList.toggle("on", k > 0); }
function applyPeriods(){ $("band").classList.toggle("off", !S.periods); document.body.classList.toggle("noband", !S.periods); BKEY = ""; resize(); }
function applyTheme(){
  if (S.theme === "system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.dataset.theme = S.theme;
  readColors(); saveLocal(); LKEY = HKEY = ""; SKEY = ["", ""]; draw();
}
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { readColors(); LKEY = HKEY = ""; SKEY = ["", ""]; draw(); });
async function share(){
  const url = location.href.split("#")[0] + "#" + hashStr(false);
  try {
    if (navigator.share){ await navigator.share({title:"Timeline — " + laneName(mainLane()), url}); return; }
  } catch(e){ if (e && e.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(url); toast(tr("m.copied")); } catch(_){ toast(tr("m.linkIs", {url}), 6000); }
}

// ---------------------------------------------------------------- rail
$("bSel").onclick = () => openSheet("select");
$("hdr").onclick = () => openSheet("select");
$("band").onclick = () => { const r = $("band").dataset.ref; if (r) openDetail(r); };
$("bLoupe").onclick = () => { S.loupe = !S.loupe; $("bLoupe").classList.toggle("on", S.loupe); LKEY = ""; draw(); if (S.loupe) setTimeout(magnet, 0); };
$("bSearch").onclick = () => openSearch();
$("jback").onclick = jumpBack;
$("bFilter").onclick = () => openSheet("filter");
$("bMenu").onclick = () => openSheet("menu");
$("bZin").onclick = () => zoomStep(-1);
$("bZout").onclick = () => zoomStep(1);
document.addEventListener("keydown", e => {
  if (OV.length || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.key === "+" || e.key === "="){ e.preventDefault(); zoomStep(-1); }
  else if (e.key === "-" || e.key === "_"){ e.preventDefault(); zoomStep(1); }
});
(() => {
  const b = $("bPlay"); let lp = 0, longFired = false;
  b.addEventListener("pointerdown", () => { longFired = false; lp = setTimeout(() => { longFired = true; stopPlay(); openSheet("speed"); }, 520); });
  const cancel = () => clearTimeout(lp);
  b.addEventListener("pointerup", cancel); b.addEventListener("pointerleave", cancel); b.addEventListener("pointercancel", cancel);
  b.addEventListener("contextmenu", e => e.preventDefault());
  b.addEventListener("click", () => { if (longFired) return; S.playing ? stopPlay() : startPlay(); });
})();

// ---------------------------------------------------------------- recherche
let SEARCH = null;
function buildSearch(){
  SEARCH = [];
  for (const [ref, e] of ENT){
    if (e.kind === "media" || e.kind === "source") continue;
    const it = e.item, names = [...allTexts(it.name || it.title), ...allTexts(it.full_name), ...(it.aliases || []), ...((it.historical_names||[]).map(h => h.name)), it.id];
    SEARCH.push({ref, e, hay:norm(names.join(" | "))});
  }
}
function openSearch(){ if (!SEARCH) buildSearch(); pushOv({type:"search"}); $("q").value = ""; renderResults(); setTimeout(() => $("q").focus(), 60); }
const GROUPS = ["node", "person", "org", "place", "work"].map(k => [k, k]); // libellés : I18N, clés group.*
function renderResults(){
  const q = norm($("q").value.trim()), box = $("sres");
  if (q.length < 2){ box.innerHTML = `<div class="sempty">${esc(tr("search.hint"))}</div><div class="sempty" style="padding-top:0">${esc(tr("m.search.yearHint"))}</div>`; return; }
  const yh = yearRow(q);
  const words = q.split(/\s+/);
  const hits = SEARCH.filter(s => words.every(w => s.hay.includes(w)))
    .map(s => { const nm = norm(entName(s.ref)); return {s, score:(nm === q ? -1 : nm.startsWith(q) ? 0 : 1) - Math.min(0.4, (ENT_NODES.get(s.ref)||[]).length/20)}; })
    .sort((a,b) => a.score - b.score);
  if (!hits.length){ box.innerHTML = yh || `<div class="sempty">${esc(tr("search.none"))}</div>`; return; }
  const best = k => { const x = hits.find(h => h.s.e.kind === k); return x ? x.score : 9; };
  const groups = GROUPS.map((g, i) => [...g, best(g[0]), i]).sort((a,b) => a[2] - b[2] || a[3] - b[3]);
  let h = yh;
  for (const [k] of groups){
    const list = hits.filter(x => x.s.e.kind === k).slice(0, 25).map(x => x.s);
    if (!list.length) continue;
    h += `<h4>${esc(tr("group." + k))}</h4>` + list.map(s => {
      const it = s.e.item;
      let sub = "", dot = "var(--faint)";
      if (k === "node"){ const l = bestLane(it); sub = fmtShort(it.start) + (l ? " · " + laneName(l) : ""); dot = l ? l.color : dot; }
      else { const ne = (ENT_NODES.get(s.ref) || []).length; sub = (k === "person" && it.born ? fmtShortRaw(it.born.date, L2()) + (it.died ? " – " + fmtShortRaw(it.died.date, L2()) : "") + " · " : "") + (ne ? tr("n.events", {n:ne}) : ""); }
      return `<div class="res" data-ref="${esc(s.ref)}"><span class="dot" style="background:${dot}"></span><div class="tx"><div class="t1">${esc(entName(s.ref))}</div><div class="t2">${esc(sub)}</div></div></div>`;
    }).join("");
  }
  box.innerHTML = h;
}
/** ligne « Aller à 1917 » en tête des résultats quand la recherche est une année */
function yearRow(q){
  if (!/^\d{4}$/.test(q)) return "";
  const y = +q, a = MIN_T, b = Math.floor(MAX_T);
  if (y < a || y > b) return `<div class="res yr out"><span class="dot">⊘</span><div class="tx"><div class="t1">${esc(tr("m.search.yearOut", {y, a, b}))}</div></div></div>`;
  const l = mainLane();
  return `<div class="res yr" data-year="${y}"><span class="dot">⤓</span><div class="tx"><div class="t1">${esc(tr("m.search.year", {y}))}</div><div class="t2">${esc(tr("m.search.yearSub", {tl:l ? laneName(l) : ""}))}</div></div></div>`;
}
/** positionne la timeline sur une année : la loupe va à l'évènement de la principale le plus proche du milieu de l'année,
    sinon au milieu de l'année ; une plage de plus de 20 ans est ramenée à 10 ans */
function goYear(y){
  closeTo(OV.findIndex(o => o.type === "search"));
  stopPlay(); clearJump(); userMoved(); S.sec = null; S.pick = null;
  const mid = y + 0.5, sp = S.span > 20 ? 10 : S.span, l = mainLane();
  let best = null;
  if (l) for (const e of l.evs){ const n = e.n; if (hidden(n) || n._tp < y || n._tp >= y + 1) continue; if (!best || Math.abs(n._tp - mid) < Math.abs(best._tp - mid)) best = n; }
  if (best) S.pick = best.id;
  setTimeout(() => glideTo(best ? best._tp : Math.min(mid, MAX_T), sp, 420), 50);
}
$("q").addEventListener("input", renderResults);
$("q").addEventListener("keydown", e => { if (e.key === "Enter"){ const f = $("sres").querySelector(".res:not(.out)"); if (f) f.click(); } });
$("search").addEventListener("click", e => {
  if (e.target.closest("[data-act=back]")) return back();
  const r = e.target.closest(".res"); if (!r || r.classList.contains("out")) return;
  $("q").blur();
  if (r.dataset.year) return goYear(+r.dataset.year);
  replaceTop({type:"detail", ref:r.dataset.ref});
});

// ---------------------------------------------------------------- fiches
function openDetail(ref){ if (!ENT.has(ref)) return; pushOv({type:"detail", ref}); }
function chips(pre, ids){ return `<div class="chips">${ids.filter(id => ENT.has(pre + ":" + id)).map(id => `<span class="chip" data-ref="${pre}:${esc(id)}">${esc(entName(pre+":"+id))}</span>`).join("")}</div>`; }
function mediaHTML(ref, skip){
  const ms = imagesOf(ref).filter(m => m !== skip);
  if (!ms.length) return "";
  const credit = m => (m.credit ? " — " + esc(m.credit) : "") + (m.license ? " · " + esc(m.license) : "");
  if (ms.length === 1){
    const m = ms[0];
    return `<figure data-media="${esc(m.id)}"><img loading="lazy" src="${esc(mediaSrc(m))}" alt="${esc(txt(m.title))}"><figcaption>${esc(txt(m.caption) || txt(m.title))}${credit(m)}</figcaption></figure>`;
  }
  return `<h4>${tr("h.images", {n:ms.length})}</h4><div class="gallery">` + ms.map(m =>
    `<figure data-media="${esc(m.id)}"><img loading="lazy" src="${esc(mediaSrc(m))}" alt="${esc(txt(m.title))}"><figcaption>${esc(m.date ? fmtDate(m.date, LANG) : txt(m.title))}</figcaption></figure>`).join("") + "</div>";
}
function placeAt(id, dv){
  const p = ENT.get("place:" + id)?.item; if (!p) return esc(id);
  const cur = txt(p.name);
  if (dv){
    const t = span(dv)[0];
    const h = (p.historical_names || []).find(h => (!h.from || span(h.from)[0] <= t) && (!h.to || t < span(h.to)[0]));
    if (h && h.name !== cur) return link("place:" + id, h.name) + ` <span style="color:var(--faint)">(${esc(tr("place.now", {name:cur}))})</span>`;
  }
  return link("place:" + id, cur);
}
function personLife(it){
  const line = (sym, dv, pl) => dv || pl ? `<div>${sym} ${dv ? esc(fmtDate(dv, LANG)) : "?"}${pl ? " · " + placeAt(pl, dv) : ""}</div>` : "";
  let age = "";
  if (it.born && it.died && it.born.date.length === 10 && it.died.date.length === 10){
    const [by,bm,bd] = it.born.date.split("-").map(Number), [dy,dm,dd] = it.died.date.split("-").map(Number);
    age = ` <span style="color:var(--faint)">(${esc(tr("age", {n:dy - by - ((dm < bm || (dm === bm && dd < bd)) ? 1 : 0)}))})</span>`;
  }
  const b = line("°", it.born, it.birth_place), d = line("†", it.died, it.death_place);
  return b || d ? `<div class="meta" style="color:var(--ink)">${b}${d ? d.replace(/<\/div>$/, age + "</div>") : ""}</div>` : "";
}
function linksHTML(ref){
  const all = [...(LINKS_OUT.get(ref) || []).map(l => [l, 0, l.to]), ...(LINKS_IN.get(ref) || []).map(l => [l, 1, l.from])].filter(([, , o]) => ENT.has(o));
  if (!all.length) return "";
  return `<h4>${tr("h.links", {n:all.length})}</h4>` + all.map(([l, dir, other]) => {
    const col = LINK_COLORS[l.type] || "#555", lb = I18N.link(l.type, dir);
    const on = other.startsWith("node:") ? NODES.get(other.slice(5)) : null;
    return `<div class="lk"><div class="ty"><span class="pill" style="background:${col}">${esc(lb)}</span>${l.status === "final" ? "" : esc(tr("status.draft"))}${on ? " · " + esc(fmtShort(on.start)) + " · " + esc(laneName(bestLane(on) || {node:on})) : ""}</div>` +
      `<div>${link(other, entName(other))}</div>${l.justification ? `<div class="why">${esc(l.justification)}</div>` : ""}</div>`;
  }).join("");
}
function sourcesHTML(list){
  if (!list || !list.length) return "";
  return "<h4>" + tr("h.sources") + "</h4>" + list.map(s => {
    const src = ENT.get("source:" + s.ref)?.item;
    const t = src ? (src.author ? src.author + ", " : "") + src.title + (src.year ? " (" + src.year + ")" : "") : s.ref;
    const loc = [s.chapter, s.page != null ? "p. " + s.page : ""].filter(Boolean).join(", ");
    return `<div class="src">${src?.url ? `<a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t)}${loc ? ` — <span style="color:var(--muted)">${esc(loc)}</span>` : ""}${s.note ? `<div class="why">${esc(s.note)}</div>` : ""}</div>`;
  }).join("");
}
function evList(nodes){
  return nodes.slice().sort((a,b) => a._t0 - b._t0).map(n => {
    const l = bestLane(n);
    return `<div class="ev" data-ref="node:${esc(n.id)}"><span class="dot" style="background:${l ? l.color : "#999"}"></span><span class="dt">${esc(fmtShort(n.start).replace(/ \(.*\)$/, ""))}</span><span>${esc(txt(n.title))}</span></div>`;
  }).join("");
}
function readingList(){ const l = mainLane(); return l ? l.evs.filter(e => !hidden(e.n)).map(e => e.n) : []; }
function renderDetail(ref){
  const e = ENT.get(ref), body = $("dbody");
  if (!e){ body.innerHTML = "<p>" + esc(tr("m.notFound")) + "</p>"; return; }
  const it = e.item;
  $("dtitle").textContent = entName(ref);
  // lecture fiche par fiche : seulement pour un évènement de la timeline principale
  const rl = e.kind === "node" ? readingList() : [], i = e.kind === "node" ? rl.indexOf(it) : -1;
  $("detail").querySelector("[data-act=prev]").classList.toggle("dis", i <= 0);
  $("detail").querySelector("[data-act=next]").classList.toggle("dis", i < 0 || i >= rl.length - 1);
  body.innerHTML = e.kind === "node" ? nodeHTML(it) : entityHTML(ref, e);
  body.scrollTop = 0;
}
function nodeHTML(n){
  const t = txt(n.title), ot = n.title.orig && n.title[n.title.orig] && n.title[n.title.orig] !== t ? n.title[n.title.orig] : "";
  const kids = CHILDREN.get(n.id) || [], l = bestLane(n);
  let h = crumbs(n) + `<h2>${esc(t)}</h2>${ot ? `<div class="orig">${esc(ot)}</div>` : ""}` +
    `<div class="meta">${esc(fmtRange(n, LANG))}<br>${famSVG(n._fam, l ? l.color : "var(--muted)", 13)} ${esc(I18N.type(n.type))} · ${esc(I18N.fam(n._fam.id))} <span class="pill ${n.status === "final" ? "final" : "draft"}">${esc(tr(n.status === "final" ? "status.final" : "status.draft"))}</span></div>` +
    `<div class="dact"><button class="btn" data-act="ontl">${esc(tr("m.onTimeline"))}</button></div>`;
  if (n.summary) h += `<p class="lead">${esc(txt(n.summary))}</p>`;
  h += mediaHTML("node:" + n.id);
  if (n.persons?.length) h += "<h4>" + tr("h.persons") + "</h4>" + chips("person", n.persons);
  if (n.organizations?.length) h += "<h4>" + tr("h.orgs") + "</h4>" + chips("org", n.organizations);
  if (n.places?.length) h += "<h4>" + tr("h.places") + "</h4>" + chips("place", n.places);
  if (n.works?.length) h += "<h4>" + tr("h.works") + "</h4>" + chips("work", n.works);
  h += linksHTML("node:" + n.id);
  if (kids.length) h += `<h4>${tr("h.contains", {n:kids.length})}</h4>` + evList(kids);
  if (n.tags?.length) h += "<h4>" + tr("h.tags") + "</h4>" + `<div class="chips">${n.tags.map(t => `<span class="chip" style="cursor:default">${esc(t)}</span>`).join("")}</div>`;
  h += sourcesHTML(n.sources);
  if (n.aliases?.length) h += `<h4>${tr("h.aliases")}</h4><p>${esc(n.aliases.join(" · "))}</p>`;
  return h + `<div class="idf">${esc(n.id)}</div>`;
}
function entityHTML(ref, e){
  const it = e.item;
  const name = entName(ref), on = it.name || it.title, ot = on && on.orig && on[on.orig] && on[on.orig] !== name ? on[on.orig] : "";
  let meta = tr("kind." + e.kind);
  if (e.kind === "org"){ if (it.type) meta += " · " + I18N.orgType(it.type); if (it.founded) meta += " · " + tr("org.founded", {date:fmtDate(it.founded, LANG)}); if (it.dissolved) meta += ", " + tr("org.dissolved", {date:fmtDate(it.dissolved, LANG)}); }
  if (e.kind === "work"){ if (it.type) meta += " · " + I18N.workType(it.type); if (it.date) meta += " · " + fmtDate(it.date, LANG); }
  if (e.kind === "place"){ if (it.country) meta += " · " + I18N.country(it.country); }
  if (e.kind === "source"){ meta += " · " + [it.author, it.publisher, it.year].filter(Boolean).join(", "); }
  let head = `<h2>${esc(name)}</h2>${ot ? `<div class="orig">${esc(ot)}</div>` : ""}`, portrait = null;
  if (e.kind === "person"){
    const fn = txt(it.full_name), ofn = it.full_name?.orig ? it.full_name[it.full_name.orig] : "";
    if (fn && fn !== name) head += `<div class="orig">${esc(fn)}</div>`;
    if (ofn && ofn !== fn && ofn !== ot) head += `<div class="orig">${esc(ofn)}</div>`;
    head += `<div class="meta" style="margin-bottom:2px">${esc(meta)}</div>`;
    if (it.occupation) head += `<div class="occ">${esc(txt(it.occupation))}</div>`;
    head += personLife(it);
    portrait = primaryPortrait(ref);
  } else head += `<div class="meta">${esc(meta)}</div>`;
  let h = portrait ? `<div class="phead"><div class="tx">${head}</div><div class="pt" data-media="${esc(portrait.id)}"><img src="${esc(mediaSrc(portrait))}" alt="${esc(txt(portrait.title))}"></div></div>` : head;
  if (it.summary) h += `<p class="lead">${esc(txt(it.summary))}</p>`;
  if (it.bio) h += `<h4>${tr("h.bio")}</h4><p class="bio">${esc(txt(it.bio))}</p>`;
  if (it.memberships?.length) h += "<h4>" + tr("h.memberships") + "</h4>" + it.memberships.map(mb => {
    const per = mb.from ? fmtDate(mb.from, LANG) + " – " + (mb.to ? fmtDate(mb.to, LANG) : "…") : mb.to ? tr("until", {date:fmtDate(mb.to, LANG)}) : "";
    return `<div class="mb"><span class="dt">${esc(per)}</span><span class="chip" data-ref="org:${esc(mb.org)}">${esc(entName("org:" + mb.org))}</span>${mb.role ? `<span style="color:var(--muted)">${esc(txt(mb.role))}</span>` : ""}</div>`;
  }).join("");
  if (e.kind === "work" && it.authors?.length) h += "<h4>" + tr("h.authors") + "</h4>" + chips("person", it.authors);
  if (e.kind === "org" && it.parent) h += "<h4>" + tr("h.partOf") + "</h4>" + chips("org", [it.parent]);
  const subs = SUBORGS.get(ref) || [];
  if (subs.length) h += "<h4>" + tr("h.components") + "</h4>" + chips("org", subs.map(o => o.id));
  if (e.kind === "place"){
    if (it.historical_names?.length) h += "<h4>" + tr("h.histNames") + "</h4>" + it.historical_names.map(hn => `<div class="src">${esc(hn.name)} <span style="color:var(--muted)">${esc(hn.from ? fmtDate(hn.from, LANG) + " – " + (hn.to ? fmtDate(hn.to, LANG) : "") : hn.to ? tr("until", {date:fmtDate(hn.to, LANG)}) : "")}</span></div>`).join("");
    if (it.coords) h += `<p style="margin-top:8px"><a href="https://www.openstreetmap.org/?mlat=${it.coords.lat}&mlon=${it.coords.lon}#map=${({country:5, region:7, water:9, city:12, district:14, site:15})[it.kind] || 10}/${it.coords.lat}/${it.coords.lon}" target="_blank" rel="noopener">${esc(tr("map"))}</a></p>`;
  }
  if (e.kind === "source" && it.url) h += `<p><a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.url)}</a></p>`;
  h += mediaHTML(ref, portrait);
  const works = WORKS_BY.get(ref) || [];
  if (works.length) h += "<h4>" + tr("h.works") + "</h4>" + chips("work", works.map(w => w.id));
  h += linksHTML(ref);
  const nodes = ENT_NODES.get(ref) || [];
  if (nodes.length) h += `<h4>${tr("h.events", {n:nodes.length})}</h4>` + evList(nodes);
  if (it.aliases?.length) h += `<h4>${tr("h.aliases")}</h4><p>${esc(it.aliases.join(" · "))}</p>`;
  if (e.kind !== "source") h += sourcesHTML(it.sources);
  if (it.wikidata) h += `<p style="margin-top:14px;font-size:13px"><a href="https://www.wikidata.org/wiki/${esc(it.wikidata)}" target="_blank" rel="noopener">Wikidata ${esc(it.wikidata)} ↗</a></p>`;
  return h + `<div class="idf">${esc(ref)}</div>`;
}
$("detail").addEventListener("click", e => {
  const a = e.target.closest("[data-act],[data-ref],[data-media]"); if (!a) return;
  if (a.dataset.media){ const imgs = imagesOf(DREF), i = imgs.findIndex(m => m.id === a.dataset.media); pushOv({type:"lb", ref:DREF, i:Math.max(0, i)}); return; }
  const act = a.dataset.act;
  if (act === "back") return back();
  if (act === "close") return closeTo(OV.findIndex(o => o.type === "detail"));
  if (act === "prev" || act === "next"){
    const rl = readingList(), n = NODES.get(DREF?.slice(5)), i = rl.indexOf(n);
    const m = rl[i + (act === "next" ? 1 : -1)]; if (m) replaceTop({type:"detail", ref:"node:" + m.id});
    return;
  }
  if (act === "ontl") return showOnTimeline(NODES.get(DREF.slice(5)));
  if (a.dataset.ref && ENT.has(a.dataset.ref)) openDetail(a.dataset.ref);
});
function showOnTimeline(n){
  if (!n) return;
  closeTo(OV.findIndex(o => o.type === "detail"));
  clearJump();
  let li, inMain;
  const home = LANE.get(n._home);
  if (S.auto && home && home.has.has(n.id)){
    // mode automatique : la timeline de l'évènement devient la principale, les secondaires suivent (spec § 16.7)
    if (S.c[ci()] !== home.id){ S.c = [home.id]; S.fix.clear(); AUTO.temp = null; LKEY = HKEY = BKEY = ""; SKEY = ["", ""]; }
    S.m = home.id; AUTO.hold = false; inMain = true;
  } else {
    li = S.c.findIndex(id => LANE.get(id).has.has(n.id));
    if (li < 0){
      const l = bestLane(n); if (!l) return;
      S.c[ci()] = l.id; S.m = l.id; li = ci();
      LKEY = HKEY = BKEY = ""; SKEY = ["", ""];
    }
    inMain = li === ci();
  }
  const lane = inMain ? mainLane() : LANE.get(S.c[li]);
  const period = lane.pers.some(p => p.n === n);
  let tc, sp;
  if (period){
    sp = Math.max(MIN_SPAN, (Math.min(n._t1, NOW) - n._t0) * 1.25); tc = (n._t0 + Math.min(n._t1, NOW)) / 2;
    S.pick = null; S.sec = null;
  } else {
    if (inMain){ S.pick = n.id; S.sec = null; } else { S.sec = {lane:S.c[li], id:n.id}; S.pick = null; }
    sp = S.span > 40 ? 20 : S.span; tc = n._tp;
  }
  if (S.auto) autoPick(true, tc, sp);
  setTimeout(() => glideTo(tc, sp, 420), 50);
}

// ---------------------------------------------------------------- visionneuse
const LB = {list:[], i:0, s:1, x:0, y:0};
function renderLightbox(o){
  const list = imagesOf(o.ref); LB.list = list; LB.i = Math.min(o.i, list.length - 1); LB.s = 1; LB.x = LB.y = 0;
  const m = list[LB.i]; if (!m) return;
  const img = $("lbimg"); img.src = mediaSrc(m); img.alt = txt(m.title); lbApply();
  $("lbn").textContent = list.length > 1 ? `${LB.i + 1} / ${list.length}` : "";
  const meta = [m.date && fmtDate(m.date, LANG), m.credit, m.license].filter(Boolean).map(esc).join(" · ");
  $("lbcap").innerHTML = `<b>${esc(txt(m.title))}</b>${m.caption ? "<br>" + esc(txt(m.caption)) : ""}<div class="m">${meta}${m.origin ? ` · <a href="${esc(m.origin)}" target="_blank" rel="noopener">${esc(tr("source.link"))}</a>` : ""}</div>`;
}
function lbApply(){ $("lbimg").style.transform = `translate(${LB.x}px,${LB.y}px) scale(${LB.s})`; }
(() => {
  const box = $("lb"), P = new Map(); let g = null;
  box.addEventListener("click", e => { if (e.target.closest("[data-act=back]")) back(); });
  const area = box.querySelector(".lbimg");
  area.addEventListener("pointerdown", e => {
    try { area.setPointerCapture(e.pointerId); } catch(_){}
    P.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if (P.size === 1) g = {t:"one", x0:e.clientX, y0:e.clientY, bx:LB.x, by:LB.y, t0:performance.now()};
    if (P.size === 2){ const [a, b] = [...P.values()]; g = {t:"pinch", d0:Math.hypot(a.x-b.x, a.y-b.y), s0:LB.s}; }
  });
  area.addEventListener("pointermove", e => {
    if (!P.has(e.pointerId) || !g) return; P.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if (g.t === "pinch" && P.size === 2){ const [a, b] = [...P.values()]; LB.s = Math.max(1, Math.min(5, g.s0 * Math.hypot(a.x-b.x, a.y-b.y) / g.d0)); if (LB.s === 1){ LB.x = LB.y = 0; } lbApply(); }
    else if (g.t === "one" && LB.s > 1){ LB.x = g.bx + e.clientX - g.x0; LB.y = g.by + e.clientY - g.y0; lbApply(); }
  });
  const up = e => {
    if (!P.has(e.pointerId)) return; P.delete(e.pointerId);
    if (!g) return;
    if (g.t === "one" && P.size === 0){
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (LB.s === 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && LB.list.length > 1){
        const i = (LB.i + (dx < 0 ? 1 : -1) + LB.list.length) % LB.list.length; replaceTop({type:"lb", ref:OV[OV.length-1].ref, i});
      } else if (Math.hypot(dx, dy) < 8 && performance.now() - g.t0 < 400) box.classList.toggle("nocap");
      g = null;
    } else if (P.size === 0) g = null;
  };
  area.addEventListener("pointerup", up); area.addEventListener("pointercancel", up);
})();

// ---------------------------------------------------------------- aide, toast
$("help").addEventListener("click", e => {
  if (e.target.closest("[data-act=helpok]")){
    let first = false; try { first = !localStorage.getItem("tldb-m-seen"); localStorage.setItem("tldb-m-seen", "1"); } catch(_){}
    if (first) replaceTop({type:"sheet", kind:"select"}); else back();
  } else if (e.target === $("help")) back();
});
let toastT = 0;
function toast(msg, ms = 2600, btn){
  const t = $("toast"); t.innerHTML = esc(msg) + (btn ? `<button>${esc(btn.label)}</button>` : "");
  if (btn) t.querySelector("button").onclick = () => { t.classList.remove("show"); btn.fn(); };
  t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), ms);
}
document.addEventListener("error", e => { if (e.target && e.target.tagName === "IMG") e.target.classList.add("broken"); }, true);

// ---------------------------------------------------------------- adresse et mémoire locale
function hashStr(withV = true){
  const p = new URLSearchParams();
  p.set("m", S.m); p.set("c", S.c.join(","));
  p.set("t", (S.tc - S.span/2).toFixed(3) + "," + (S.tc + S.span/2).toFixed(3));
  if (S.hiddenFam.size) p.set("x", [...S.hiddenFam].join(","));
  if (S.dens !== "t") p.set("d", S.dens);
  if (!S.periods) p.set("p", "0");
  if (!S.loupe) p.set("o", "0");
  if (LANG !== I18N.detect()) p.set("l", LANG);
  if (S.auto){ p.set("a", S.themes ? "1" : "2"); if (S.fix.size) p.set("f", [...S.fix].join(",")); }
  if (withV){ for (let i = OV.length - 1; i >= 0; i--) if (OV[i].type === "detail"){ p.set("v", OV[i].ref); break; } }
  return p.toString().replace(/%2C/g, ",").replace(/%3A/g, ":");
}
let hashT = 0;
function saveHashSoon(){ clearTimeout(hashT); hashT = setTimeout(saveHash, 400); }
function saveHash(){ try { history.replaceState(history.state, "", "#" + hashStr()); } catch(_){} saveLocal(); }
function saveLocal(){ try { localStorage.setItem("tldb-m-state", hashStr(false)); localStorage.setItem("tldb-m-prefs", JSON.stringify({theme:S.theme, speed:S.speed})); } catch(_){} }
function applyParams(str){
  const p = new URLSearchParams(str);
  const c = (p.get("c") || "").split(",").filter(id => LANE.has(id)).slice(0, 3);
  if (!c.length) return null;
  S.c = [...new Set(c)];
  S.m = LANE.has(p.get("m")) && S.c.includes(p.get("m")) ? p.get("m") : S.c[ci()];
  const t = (p.get("t") || "").split(",").map(Number);
  if (t.length === 2 && isFinite(t[0]) && isFinite(t[1]) && t[1] > t[0]){ S.tc = (t[0] + t[1]) / 2; S.span = t[1] - t[0]; }
  else { S.tc = mainLane().last?._tp || NOW; S.span = 10; }
  clampView();
  S.hiddenFam = new Set((p.get("x") || "").split(",").filter(f => FAMILIES.some(x => x.id === f)));
  S.dens = p.get("d") === "m" ? "m" : "t";
  S.periods = p.get("p") !== "0";
  S.loupe = p.get("o") !== "0";
  const l = p.get("l"); setLang([...I18N.LANGS, "orig"].includes(l) ? l : I18N.detect()); I18N.set(LANG);
  const a = p.get("a");
  S.auto = a === "1" || a === "2"; S.themes = a !== "2";
  S.fix = new Set((p.get("f") || "").split(",").filter(id => S.auto && S.c.includes(id) && id !== S.c[ci()]));
  AUTO.hold = S.auto;   // colonnes du lien gardées telles quelles jusqu'au premier déplacement (spec § 16.8)
  return {v: p.get("v")};
}

// ---------------------------------------------------------------- démarrage
function resize(){
  const r = wrap.getBoundingClientRect();
  W = Math.max(200, r.width); H = Math.max(200, r.height);
  DPR = Math.min(3, window.devicePixelRatio || 1);
  for (const c of [cv, fx]){ c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
  SEC_W = Math.round(Math.max(60, Math.min(96, W * 0.18)));
  LOUPE_H = H < 520 ? 140 : 166;
  LKEY = ""; SKEY = ["", ""]; BKEY = "";
  render();
}
function boot(){
  if (!window.TLDB){ nodata(); return; }
  indexDB(window.TLDB); buildLanes(); buildAutoIndex();
  let prefs = {}; try { prefs = JSON.parse(localStorage.getItem("tldb-m-prefs") || "{}"); } catch(_){}
  S.theme = ["light","dark"].includes(prefs.theme) ? prefs.theme : "system";
  S.speed = [0,1,2].includes(prefs.speed) ? prefs.speed : 0;
  if (S.theme !== "system") document.documentElement.dataset.theme = S.theme;
  readColors();
  let res = location.hash.length > 1 ? applyParams(location.hash.slice(1)) : null, fromLocal = false;
  if (!res){ let st = null; try { st = localStorage.getItem("tldb-m-state"); } catch(_){} if (st){ res = applyParams(st); fromLocal = !!res; } }
  let seen = false; try { seen = !!localStorage.getItem("tldb-m-seen"); } catch(_){}
  if (!res){ S.auto = true; S.c = [LANE.has("russia") ? "russia" : laneOrder()[0].id]; S.m = S.c[0]; reset(); }
  // langue passée seule dans l'adresse (lien depuis l'accueil : mobile.html#l=de)
  { const hl = new URLSearchParams(location.hash.slice(1)).get("l"); if ([...I18N.LANGS, "orig"].includes(hl)){ setLang(hl); I18N.set(hl); } }
  applyUI();
  $("bLoupe").classList.toggle("on", S.loupe);
  $("band").classList.toggle("off", !S.periods); document.body.classList.toggle("noband", !S.periods);
  updateBadge(); setPlayIcon();
  $("loader").style.display = "none";
  history.replaceState({ov:0}, "", "#" + hashStr(false));
  resize();
  if (res && res.v && ENT.has(res.v)) openDetail(res.v);
  else if (!seen) pushOv({type:"help"});
  setTimeout(magnet, 60);
}
function nodata(){
  $("loader").innerHTML = `<div><h2>${esc(tr("nodata.title"))}</h2>${tr("m.nodata.html")}</div>`;
}
/** (re)traduit l'interface : au démarrage et à chaque changement de langue */
function applyUI(){
  I18N.apply();
  document.querySelector('meta[name="description"]').content = tr("m.desc");
  setPlayIcon();
  LKEY = HKEY = BKEY = ""; SKEY = ["", ""]; WR.clear();
  if (OV.some(o => o.type === "search")) renderResults();
  draw();
}
I18N.apply(); // écran de chargement dans la langue du navigateur
window.addEventListener("resize", () => { clearTimeout(window._rz); window._rz = setTimeout(resize, 60); });
window.visualViewport?.addEventListener("resize", () => { clearTimeout(window._rz); window._rz = setTimeout(resize, 60); });
document.addEventListener("visibilitychange", () => { if (document.hidden) stopPlay(); });

// service worker (seulement en ligne : https ou localhost)
// Le navigateur ne vérifie sw.js qu'au chargement de la page ; une appli installée revient souvent au premier plan
// sans être rechargée. On vérifie donc aussi au retour au premier plan (au plus 1 fois par minute), toutes les heures
// si elle reste ouverte, et à la demande depuis le menu. Une nouvelle version téléchargée est signalée par un bandeau
// qui reste affiché jusqu'à ce qu'on l'installe ou le ferme ; le menu propose alors « Installer la nouvelle version ».
let SWREG = null, swWaiting = null, swChecked = 0;
function showUpdate(w){
  swWaiting = w;
  const b = $("upd");
  b.querySelector("span").textContent = tr("m.update");
  b.querySelector(".go").textContent = tr("m.reload");
  b.querySelector(".x").setAttribute("aria-label", tr("m.upd.later"));
  b.classList.add("show");
}
function installUpdate(){ $("upd").classList.remove("show"); if (swWaiting) swWaiting.postMessage("skip"); }
async function checkUpdate(manual){
  if (!SWREG) return;
  if (swWaiting){ if (manual) installUpdate(); return; }
  if (!manual && (!navigator.onLine || Date.now() - swChecked < 60000)) return;
  swChecked = Date.now();
  if (manual && !navigator.onLine){ toast(tr("m.upd.offline"), 4000); return; }
  if (manual) toast(tr("m.upd.checking"), 8000);
  try { await SWREG.update(); }
  catch(_){ if (manual) toast(tr("m.upd.offline"), 4000); return; }
  if (!manual || swWaiting) return;
  const w = SWREG.installing || SWREG.waiting;
  if (!w) toast(tr("m.upd.latest"), 3000);
  else if (w.state === "installed") showUpdate(w);
  else toast(tr("m.upd.downloading"), 6000); // le bandeau apparaîtra à la fin du téléchargement
}
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)){
  const watch = w => w && w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) showUpdate(w); });
  navigator.serviceWorker.register("sw.js").then(reg => {
    SWREG = reg; swChecked = Date.now(); // l'enregistrement vient de vérifier sw.js
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    watch(reg.installing);
    reg.addEventListener("updatefound", () => watch(reg.installing));
  }).catch(() => {});
  $("upd").querySelector(".go").addEventListener("click", installUpdate);
  $("upd").querySelector(".x").addEventListener("click", () => $("upd").classList.remove("show"));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkUpdate(false); });
  window.addEventListener("online", () => checkUpdate(false));
  setInterval(() => { if (!document.hidden) checkUpdate(false); }, 3600000);
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloading){ reloading = true; location.reload(); } });
}

loadBase().then(db => db ? boot() : nodata());

// diagnostic (comparaison avant / après une refonte) : window.__tl.dump()
window.__tl = {dump: () => ({nodes: NODES.size, ent: ENT.size, roots: ROOT_LANES.map(l => l.id),
  lanes: ALL_LANES.map(l => ({id:l.id, p:l.parent && l.parent.id, color:l.color, evs:l.evs.map(e => [e.n.id, e.row ?? null]), pers:l.pers.map(p => [p.n.id, p.level, p.alt])})),
  auto: [["russia",1917,10,true],["germany",1919,6,true],["france",1871,4,false],["china",1949,20,true],["bolshevism",1903,8,true]].map(a => [...autoScores(...a).entries()].map(([k, v]) => [k, Math.round(v.s*1000)/1000]))})};
