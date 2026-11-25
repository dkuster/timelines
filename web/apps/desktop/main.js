/* Frise (bureau) */
import { I18N } from "../../core/i18n.js";
import { LANG, setLang, tr, txt, esc, norm, allTexts } from "../../core/text.js";
import { MONTHS, MSHORT, isLeap, daysInYear, dayOfYear, span, NOW, fmtDate, fmtRange } from "../../core/dates.js";
import { FAMILIES, LINK_COLORS } from "../../core/families.js";
import { alpha, shapePath, tw, clearTextCache, stamp, download } from "../../core/canvas.js";
import { DB, NODES, CHILDREN, ENT, LINKS_OUT, LINKS_IN, ENT_NODES, NOTES_ABOUT, WORKS_BY, SUBORGS, ROOT_LANES, ALL_LANES, indexDB, laneOrder, laneName, entName } from "../../core/model.js";
import { imagesOf, mediaSrc, primaryPortrait } from "../../core/media.js";
import { link, crumbs } from "../../ui/html.js";

/* =====================================================================
   Frise — visualiseur de timeline-db (v0)
   Canvas 2D, sans dépendance. Données : window.TLDB (data/base.js) et window.TLDB_NOTES (data/notes.js),
   produites par « py -m tldb build ». Code commun : web/core/ et web/ui/.
   ===================================================================== */

// ---------------------------------------------------------------- constantes
// familles, couleurs des liens, palette : core/families.js ; libellés : core/i18n.js
const AXIS_H = 34, OVER_H = 44, HEADER_H = 22, BAR_H = 19, LH = 15, BASE_PAD = 12, LANE_PAD = 8;
const MIN_T = 1700, MAX_T = 2045, MIN_SPAN = 7/365.25, MAX_SPAN = 340;
const SANS = "\"Segoe UI\",system-ui,-apple-system,Arial,sans-serif";
const COLORS = {paper:"#f6f3ec", ink:"#1f1c18", muted:"#6d675c", faint:"#a59e90", rule:"#ddd5c5", grid:"#e7e0d2", sel:"#1f4e8c"};

// ---------------------------------------------------------------- dates
function shortYear(t){ return String(Math.floor(t)); }

// ---------------------------------------------------------------- textes

// ---------------------------------------------------------------- base



// ---------------------------------------------------------------- lignes
/* Une « ligne » = une racine ou une sous-timeline de type era. Son contenu (règle shared / deep)
   est calculé au build (tldb/scope.py) et indexé par core/model.js ; ici, la mise en page :
   périodes, conteneurs et durées > 6 mois en barres empilées, le reste en points. */
function buildLanes(){
  for (const lane of ALL_LANES){
    lane.visible = true; lane.bg = false;
    // barres : périodes, conteneurs, ou durée > 6 mois ; le reste = points
    lane.bars = []; lane.points = [];
    for (const it of lane.items){
      const dur = it.n._t1 - it.n._t0;
      if (it.container || it.n.end && dur > 0.5 || it.n.ongoing) lane.bars.push(it); else lane.points.push(it);
    }
    // empilement des barres par niveau d'imbrication puis par début (dans l'espace du temps)
    lane.barRows = 0;
    const levels = [...new Set(lane.bars.map(b => b.level))].sort((a,b)=>a-b);
    for (const lv of levels){
      const rows = [];
      for (const b of lane.bars.filter(x => x.level === lv).sort((a,b) => a.n._t0 - b.n._t0)){
        let r = rows.findIndex(end => end <= b.n._t0 + 1e-6);
        if (r < 0){ r = rows.length; rows.push(0); }
        rows[r] = b.n._t1; b.row = lane.barRows + r;
      }
      lane.barRows += rows.length;
    }
  }
}
function laneShown(l){ for (let x=l; x; x=x.parent) if (!x.visible) return false; return true; }

/* Lignes actives : au premier lancement, seules les racines DEFAULT_LANES sont cochées
   (les sous-lignes restent cochées, elles suivent leur parent). Le choix est ensuite mémorisé
   dans le localStorage ; une ligne apparue depuis la dernière visite suit la règle par défaut.
   Un lien partagé (#v=…) l'emporte sur la mémoire locale. */
const DEFAULT_LANES = ["marxism", "trotskyism"];
const LANES_KEY = "tldb.desktop.lanes";
function defaultVisible(l){ return l.parent ? true : DEFAULT_LANES.includes(l.id); }
function storeLanes(){
  try { localStorage.setItem(LANES_KEY, JSON.stringify({on: ALL_LANES.filter(l => l.visible).map(l => l.id), known: ALL_LANES.map(l => l.id)})); } catch(e){}
}
function restoreLanes(){
  let st = null; try { st = JSON.parse(localStorage.getItem(LANES_KEY) || "null"); } catch(e){}
  const ok = st && Array.isArray(st.on) && Array.isArray(st.known);
  const on = new Set(ok ? st.on : []), known = new Set(ok ? st.known : []);
  for (const l of ALL_LANES) l.visible = known.has(l.id) ? on.has(l.id) : defaultVisible(l);
}

// ---------------------------------------------------------------- état
const S = {t0:1785, t1:2030, y:0, sel:null, hover:null, focus:null, allLinks:false, rows:4, hiddenFam:new Set(), history:[]};
let W = 0, H = 0, DPR = 1, totalH = 0, layoutLanes = [];
const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
const $ = id => document.getElementById(id);

function X(t){ return (t - S.t0) / (S.t1 - S.t0) * W; }
function T(x){ return S.t0 + x / W * (S.t1 - S.t0); }
function ppy(){ return W / (S.t1 - S.t0); }

function relayout(){
  layoutLanes = [];
  let y = 0;
  for (const l of laneOrder()){
    if (!laneShown(l)) continue;
    const pts = l.points.length > 0;
    l.y = y;
    l.barsY = y + HEADER_H;
    l.baseY = l.barsY + l.barRows*BAR_H + (pts ? S.rows*LH + BASE_PAD : 0);
    l.h = HEADER_H + l.barRows*BAR_H + (pts ? S.rows*LH + BASE_PAD + 10 : 0) + LANE_PAD;
    y += l.h;
    layoutLanes.push(l);
  }
  totalH = y;
  clampY();
}
function viewH(){ return H - AXIS_H - OVER_H; }
function clampY(){ S.y = Math.max(0, Math.min(S.y, Math.max(0, totalH - viewH() + 20))); }
function clampT(){
  let sp = S.t1 - S.t0;
  sp = Math.max(MIN_SPAN, Math.min(MAX_SPAN, sp));
  let c = (S.t0 + S.t1)/2;
  c = Math.max(MIN_T + sp/2, Math.min(MAX_T - sp/2, c));
  if (sp >= MAX_T - MIN_T) c = (MIN_T+MAX_T)/2;
  S.t0 = c - sp/2; S.t1 = c + sp/2;
}

// ---------------------------------------------------------------- dessin
let drawQueued = false;
function draw(){ if (!drawQueued){ drawQueued = true; requestAnimationFrame(() => { drawQueued = false; render(ctx, W, H, DPR); saveHashSoon(); }); } }

function clip(c, s, maxW){
  if (tw(c, s) <= maxW) return s;
  let lo = 0, hi = s.length;
  while (lo < hi){ const mid = (lo+hi+1)>>1; if (tw(c, s.slice(0,mid)+"…") <= maxW) lo = mid; else hi = mid-1; }
  return lo > 0 ? s.slice(0,lo) + "…" : "";
}

function drawShape(c, fam, x, y, r, color, a){
  shapePath(c, fam.shape, x, y, r);
  if (fam.shape === "ring"){ c.fillStyle = alpha("#ffffff", a); c.fill(); c.lineWidth = 2; c.strokeStyle = alpha(color, a); c.stroke(); }
  else { c.fillStyle = alpha(color, a); c.fill(); c.lineWidth = 1.2; c.strokeStyle = alpha("#ffffff", Math.min(1, a+0.2)); c.stroke(); }
}

let HITS = [], POS = new Map();
function focusSet(){
  if (!S.focus) return null;
  const set = new Set((ENT_NODES.get(S.focus) || []).map(n => n.id));
  if (S.focus.startsWith("org:")) for (const o of (SUBORGS.get(S.focus)||[])) for (const n of (ENT_NODES.get("org:"+o.id)||[])) set.add(n.id);
  if (S.focus.startsWith("node:")) set.add(S.focus.slice(5));
  return set;
}
function priority(n, fset){
  let p = n._fam.w + 1.5*Math.min(n._links, 4) + 0.3*Math.min((n.persons||[]).length, 5);
  if (fset && fset.has(n.id)) p += 50;
  if (S.sel === n.id) p += 100;
  return p;
}

function render(c, w, h, dpr, opts = {}){
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = COLORS.paper; c.fillRect(0, 0, w, h);
  const fset = focusSet(), py = ppy();
  HITS = []; POS = new Map();
  const top = AXIS_H, bot = h - OVER_H;
  const ticks = axisTicks(w);

  // grille
  c.save(); c.beginPath(); c.rect(0, top, w, bot-top); c.clip();
  for (const t of ticks){ const x = Math.round(X(t.t)) + .5; c.strokeStyle = t.major ? "#e2dacb" : "#ece6da"; c.lineWidth = 1; c.beginPath(); c.moveTo(x, top); c.lineTo(x, bot); c.stroke(); }

  // bandes de fond
  const bandLabels = [];
  for (const l of layoutLanes){
    if (!l.bg) continue;
    for (const b of l.bars){
      if (b.level !== 0 || hiddenNode(b.n)) continue;
      const x0 = X(b.n._t0), x1 = X(b.n._t1);
      if (x1 < 0 || x0 > w) continue;
      c.fillStyle = alpha(l.color, 0.045); c.fillRect(x0, top, x1-x0, bot-top);
      c.strokeStyle = alpha(l.color, 0.3); c.beginPath(); c.moveTo(Math.round(x0)+.5, top); c.lineTo(Math.round(x0)+.5, bot); c.stroke();
      bandLabels.push({x0:Math.max(x0, 0), x1:Math.min(x1, w), t:txt(b.n.title), color:l.color, d:b.n._t1 - b.n._t0});
    }
  }

  // focus : durée de vie de l'entité
  if (S.focus){
    const e = ENT.get(S.focus);
    const sp = e && entitySpan(e);
    if (sp){
      const x0 = X(sp[0]), x1 = X(sp[1]);
      c.fillStyle = "rgba(31,78,140,0.07)"; c.fillRect(x0, top, Math.max(2, x1-x0), bot-top);
      c.strokeStyle = "rgba(31,78,140,0.35)"; c.setLineDash([4,4]);
      for (const x of [x0, x1]){ c.beginPath(); c.moveTo(Math.round(x)+.5, top); c.lineTo(Math.round(x)+.5, bot); c.stroke(); }
      c.setLineDash([]);
    }
  }

  c.translate(0, top - S.y);
  const sans = SANS;
  for (const l of layoutLanes){
    const ly = l.y;
    if (ly - S.y > bot - top + 10 || ly + l.h - S.y < -10) { notePositions(l); continue; }
    // séparateur + bande d'en-tête
    c.strokeStyle = COLORS.rule; c.lineWidth = 1; c.beginPath(); c.moveTo(0, ly+.5); c.lineTo(w, ly+.5); c.stroke();
    // lignes enfants : bande légère
    // barres
    for (const b of l.bars){
      const n = b.n; if (hiddenNode(n)) continue;
      let x0 = X(n._t0), x1 = X(n._t1);
      const y = l.barsY + b.row*BAR_H + 2, hh = BAR_H - 5;
      POS.set(n.id, POS.get(n.id) || {x:(Math.max(x0,0)+Math.min(x1,w))/2, y:y+hh/2, lane:l});
      if (x1 < -2 || x0 > w+2) continue;
      if (x1 - x0 < 2){ x1 = x0 + 2; }
      const dim = fset && !fset.has(n.id) ? 0.25 : 1;
      const isSel = S.sel === n.id, isHov = S.hover === n.id;
      c.fillStyle = alpha(l.color, (b.container ? 0.16 : 0.5) * dim + (isHov ? 0.12 : 0));
      c.fillRect(x0, y, x1-x0, hh);
      c.fillStyle = alpha(l.color, 0.9*dim); c.fillRect(x0, y, Math.min(3, x1-x0), hh);
      if (isSel){ c.strokeStyle = COLORS.sel; c.lineWidth = 2; c.strokeRect(x0-1, y-1, x1-x0+2, hh+2); }
      c.font = (b.container ? "600 " : "") + "12px " + sans;
      const vx0 = Math.max(x0, 0) + 6, vx1 = Math.min(x1, w) - 4;
      const lb = clip(c, txt(n.title), vx1 - vx0);
      if (lb){ c.fillStyle = alpha(COLORS.ink, 0.92*dim + 0.08); c.fillText(lb, vx0, y + hh - 4); }
      HITS.push({n, x:x0, y:y + top - S.y, w:x1-x0, h:hh});
    }
    // points + titres
    if (l.points.length){
      const by = l.baseY;
      c.strokeStyle = alpha(l.color, 0.35); c.lineWidth = 1; c.beginPath(); c.moveTo(0, by+.5); c.lineTo(w, by+.5); c.stroke();
      const vis = l.points.filter(p => !hiddenNode(p.n));
      // incertitude (précision année/mois)
      for (const p of vis){
        const n = p.n, x0 = X(n._t0), x1 = X(n._t1);
        if (x1 - x0 > 10 && x1 > 0 && x0 < w){ c.fillStyle = alpha(l.color, 0.12); c.fillRect(x0, by-3, x1-x0, 6); }
      }
      // placement des titres : par priorité, sur la première rangée libre
      const rows = Array.from({length:S.rows}, () => []);
      const ordered = vis.slice().sort((a,b) => priority(b.n, fset) - priority(a.n, fset));
      c.font = "12px " + sans;
      const placed = [];
      for (const p of ordered){
        const n = p.n, x = X(n._tp);
        if (x < -300 || x > w + 4) continue;
        if (!S.rows) break;
        const label = clip(c, txt(n.title), 260);
        const lw = tw(c, label);
        const a = x - 3, bnd = x + lw + 10;
        for (let r = 0; r < S.rows; r++){
          if (rows[r].every(([s,e]) => bnd < s || a > e)){ rows[r].push([a, bnd]); placed.push({p, r, label, lw, x}); break; }
        }
      }
      c.lineWidth = 1;
      for (const q of placed){
        const dim = fset && !fset.has(q.p.n.id) ? 0.22 : 1;
        const ty = by - BASE_PAD - q.r*LH;
        c.strokeStyle = alpha(l.color, 0.35*dim); c.beginPath(); c.moveTo(Math.round(q.x)+.5, by-4); c.lineTo(Math.round(q.x)+.5, ty+2); c.stroke();
      }
      for (const q of placed){
        const n = q.p.n, dim = fset && !fset.has(n.id) ? 0.22 : 1;
        const ty = by - BASE_PAD - q.r*LH;
        const isSel = S.sel === n.id, isHov = S.hover === n.id;
        c.font = (isSel || isHov ? "600 " : "") + "12px " + sans;
        c.lineWidth = 3; c.lineJoin = "round"; c.strokeStyle = alpha(COLORS.paper, 0.85); c.strokeText(q.label, q.x + 3, ty);
        c.fillStyle = isSel ? COLORS.sel : alpha(COLORS.ink, 0.88*dim);
        c.fillText(q.label, q.x + 3, ty);
        HITS.push({n, x:q.x, y:ty - 11 + top - S.y, w:q.lw + 6, h:LH});
      }
      for (const p of vis){
        const n = p.n, x = X(n._tp);
        POS.set(n.id, POS.get(n.id) || {x, y:by, lane:l});
        if (x < -8 || x > w + 8) continue;
        const dim = fset && !fset.has(n.id) ? 0.22 : 1;
        const big = S.sel === n.id || S.hover === n.id;
        drawShape(c, n._fam, x, by, big ? 6.5 : 4.6, l.color, dim);
        if (S.sel === n.id){ c.beginPath(); c.arc(x, by, 10, 0, Math.PI*2); c.strokeStyle = COLORS.sel; c.lineWidth = 2; c.stroke(); }
        HITS.push({n, x:x-7, y:by-8 + top - S.y, w:14, h:16, pt:true});
      }
    }
  }
  // liens
  drawLinks(c, w);
  c.restore();

  // titres des bandes de fond, en bas de la zone des lignes
  if (bandLabels.length){
    c.save(); c.font = "600 11px " + SANS;
    const rowsB = [[], []];
    for (const b of bandLabels.sort((a,b) => b.d - a.d)){
      const lb = clip(c, b.t, Math.max(0, b.x1 - b.x0 - 8)); if (!lb) continue;
      const a = b.x0 + 4, e = a + tw(c, lb) + 8;
      const r = rowsB.findIndex(row => row.every(([s,f]) => e < s || a > f)); if (r < 0) continue;
      rowsB[r].push([a, e]);
      const y = bot - 8 - r*14;
      c.lineWidth = 3; c.strokeStyle = alpha(COLORS.paper, 0.9); c.strokeText(lb, a, y);
      c.fillStyle = alpha(b.color, 0.85); c.fillText(lb, a, y);
    }
    c.restore();
  }
  // focus : nom de l'entité sur sa bande
  if (S.focus){
    const e = ENT.get(S.focus), sp = e && entitySpan(e);
    if (sp){
      const x0 = Math.max(0, X(sp[0])), lb = entName(S.focus) + (e.kind === "person" || e.kind === "org" ? " · " + shortYear(sp[0]) + "–" + (sp[1] >= NOW - 0.01 ? "" : shortYear(sp[1])) : "");
      c.font = "600 12px " + SANS; c.lineWidth = 3; c.strokeStyle = alpha(COLORS.paper, 0.9);
      c.strokeText(lb, x0 + 5, top + 14); c.fillStyle = "rgba(31,78,140,0.9)"; c.fillText(lb, x0 + 5, top + 14);
    }
  }
  // en-têtes de ligne (collants à gauche)
  c.save(); c.beginPath(); c.rect(0, top, w, bot-top); c.clip();
  for (const l of layoutLanes){
    const y = l.y - S.y + top;
    if (y > bot || y + l.h < top) continue;
    const yy = Math.max(top + 2, Math.min(y + 3, y + l.h - HEADER_H));
    const name = laneName(l);
    c.font = "600 12.5px " + sans;
    const lw = tw(c, name);
    c.fillStyle = alpha(COLORS.paper, 0.92); c.fillRect(0, yy - 1, lw + 26 + l.depth*10, 18);
    c.fillStyle = l.color; c.fillRect(6 + l.depth*10, yy + 4, 8, 8);
    c.fillStyle = COLORS.ink; c.fillText(name, 19 + l.depth*10, yy + 12);
  }
  c.restore();

  // axe
  c.fillStyle = "#efeadf"; c.fillRect(0, 0, w, AXIS_H);
  c.strokeStyle = COLORS.rule; c.beginPath(); c.moveTo(0, AXIS_H-.5); c.lineTo(w, AXIS_H-.5); c.stroke();
  c.font = "12px " + sans; c.fillStyle = COLORS.ink;
  for (const t of ticks){
    const x = X(t.t);
    c.strokeStyle = COLORS.faint; c.beginPath(); c.moveTo(Math.round(x)+.5, AXIS_H - (t.major?9:5)); c.lineTo(Math.round(x)+.5, AXIS_H); c.stroke();
    if (t.label){ c.font = (t.major ? "600 " : "") + "12px " + sans; c.fillStyle = t.major ? COLORS.ink : COLORS.muted; c.fillText(t.label, x + 3, AXIS_H - 12); }
  }
  // repère de contexte (année, mois) quand on est très zoomé
  if (ppy() >= 78){
    const t = S.t0, y = Math.floor(t), D = daysInYear(y);
    let m = 1; while (m < 12 && dayOfYear(y, m+1, 1) - 1 <= (t - y)*D) m++;
    const ctxLb = ppy()/365 >= 46 ? `${MONTHS[I18N.lang][m-1]} ${y}` : String(y);
    c.font = "600 12px " + SANS; const lw = tw(c, ctxLb);
    c.fillStyle = "#efeadf"; c.fillRect(0, 2, lw + 14, AXIS_H - 6);
    c.fillStyle = COLORS.sel; c.fillText(ctxLb, 6, AXIS_H - 12);
  }
  // repère « aujourd'hui »
  const xn = X(NOW);
  if (xn > 0 && xn < w){ c.strokeStyle = alpha("#b3261e", .5); c.setLineDash([2,3]); c.beginPath(); c.moveTo(xn, AXIS_H); c.lineTo(xn, bot); c.stroke(); c.setLineDash([]); }

  drawOverview(c, w, h);
  if (opts.caption){
    c.font = "600 13px " + sans; c.fillStyle = COLORS.muted;
    c.fillText(opts.caption, 10, h - OVER_H - 10);
  }
  drawScrollHint(c, w, h);
}
function notePositions(l){
  for (const b of l.bars) if (!POS.has(b.n.id)) POS.set(b.n.id, {x:(Math.max(X(b.n._t0),0)+Math.min(X(b.n._t1),W))/2, y:l.barsY + b.row*BAR_H + 9, lane:l});
  for (const p of l.points) if (!POS.has(p.n.id)) POS.set(p.n.id, {x:X(p.n._tp), y:l.baseY, lane:l});
}
function drawScrollHint(c, w, h){
  const vh = viewH();
  if (totalH <= vh) return;
  const frac = vh / (totalH + 20), y = AXIS_H + (S.y / (totalH + 20)) * vh;
  c.fillStyle = "rgba(0,0,0,0.18)"; c.fillRect(w - 5, y, 3, Math.max(20, frac*vh));
}
function hiddenNode(n){ return !!n._fam && S.hiddenFam.has(n._fam.id) && !CHILDREN.has(n.id); }

function drawLinks(c, w){
  const sel = S.sel;
  const list = [];
  if (S.allLinks) for (const l of (DB.links||[])) list.push([l, l.from === "node:"+sel || l.to === "node:"+sel]);
  else if (sel) for (const l of [...(LINKS_OUT.get("node:"+sel)||[]), ...(LINKS_IN.get("node:"+sel)||[])]) list.push([l, true]);
  for (const [l, strong] of list){
    if (!l.from.startsWith("node:") || !l.to.startsWith("node:")) continue;
    const a = POS.get(l.from.slice(5)), b = POS.get(l.to.slice(5));
    if (!a || !b) continue;
    if (hiddenNode(NODES.get(l.from.slice(5))||{_fam:{}}) || hiddenNode(NODES.get(l.to.slice(5))||{_fam:{}})) continue;
    const col = LINK_COLORS[l.type] || "#555";
    const dy = Math.abs(b.y - a.y), dx = b.x - a.x;
    const bend = Math.max(30, Math.min(120, Math.abs(dx)*0.3 + 20));
    const cx1 = a.x + dx*0.25, cy1 = (dy < 10) ? a.y - bend : a.y + (b.y - a.y)*0.1 - bend*0.4;
    const cx2 = a.x + dx*0.75, cy2 = (dy < 10) ? b.y - bend : b.y - (b.y - a.y)*0.1 - bend*0.4;
    c.strokeStyle = alpha(col, strong ? 0.85 : 0.28); c.lineWidth = strong ? 2 : 1.2;
    c.beginPath(); c.moveTo(a.x, a.y); c.bezierCurveTo(cx1, cy1, cx2, cy2, b.x, b.y); c.stroke();
    // flèche
    const ang = Math.atan2(b.y - cy2, b.x - cx2), s = strong ? 8 : 6;
    c.fillStyle = alpha(col, strong ? 0.9 : 0.35);
    c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x - s*Math.cos(ang-0.4), b.y - s*Math.sin(ang-0.4)); c.lineTo(b.x - s*Math.cos(ang+0.4), b.y - s*Math.sin(ang+0.4)); c.closePath(); c.fill();
    if (strong){
      const mx = 0.125*a.x + 0.375*cx1 + 0.375*cx2 + 0.125*b.x, my = 0.125*a.y + 0.375*cy1 + 0.375*cy2 + 0.125*b.y;
      const lb = I18N.link(l.type, 0);
      c.font = "600 11px \"Segoe UI\",system-ui,sans-serif";
      const lw = tw(c, lb);
      c.fillStyle = alpha(COLORS.paper, 0.9); c.fillRect(mx - lw/2 - 4, my - 10, lw + 8, 15);
      c.fillStyle = col; c.fillText(lb, mx - lw/2, my + 1);
    }
  }
}

function axisTicks(w){
  const py = ppy(), out = [];
  const minPx = 78;
  const yearSteps = [1, 2, 5, 10, 20, 25, 50, 100];
  if (py >= minPx){
    // mois ou jours
    const L = MSHORT[I18N.lang];
    if (py/365 * 1 >= 46){
      const dayStep = py/365 >= 46 ? 1 : 7;
      let y = Math.floor(S.t0);
      for (; y <= S.t1; y++){
        const D = daysInYear(y);
        for (let d = 0; d < D; d += dayStep){
          const t = y + d/D; if (t < S.t0 - 0.01 || t > S.t1) continue;
          // jour du mois
          let m = 1, rem = d; const ml=[31,isLeap(y)?29:28,31,30,31,30,31,31,30,31,30,31];
          while (rem >= ml[m-1]){ rem -= ml[m-1]; m++; }
          const first = rem === 0;
          out.push({t, major:first, label: first ? `${L[m-1]} ${y}` : `${rem+1} ${L[m-1]}`});
        }
      }
      return out;
    }
    const mStep = py/12 >= minPx ? 1 : py/6 >= minPx ? 2 : py/4 >= minPx ? 3 : 6;
    for (let y = Math.floor(S.t0); y <= S.t1; y++){
      const D = daysInYear(y);
      for (let m = 1; m <= 12; m += mStep){
        const t = y + (dayOfYear(y, m, 1)-1)/D;
        if (t < S.t0 - 0.2 || t > S.t1) continue;
        out.push({t, major:m===1, label: m===1 ? String(y) : L[m-1]});
      }
    }
    return out;
  }
  const step = yearSteps.find(s => s*py >= minPx) || 200;
  const majorEvery = step < 10 ? 10 : step < 50 ? 50 : 100;
  for (let t = Math.ceil(S.t0/step)*step; t <= S.t1; t += step) out.push({t, major: t % majorEvery === 0, label:String(t)});
  return out;
}

function drawOverview(c, w, h){
  const y0 = h - OVER_H;
  c.fillStyle = "#efeadf"; c.fillRect(0, y0, w, OVER_H);
  c.strokeStyle = COLORS.rule; c.beginPath(); c.moveTo(0, y0+.5); c.lineTo(w, y0+.5); c.stroke();
  const a = 1780, b = 2035, OX = t => (t - a)/(b - a) * w;
  c.font = "11px \"Segoe UI\",system-ui,sans-serif"; c.fillStyle = COLORS.muted;
  for (let t = 1800; t <= 2025; t += 25){ const x = OX(t); c.fillRect(x, y0 + OVER_H - 13, 1, 4); if (w > 500 || t % 50 === 0) c.fillText(String(t), x + 2, y0 + OVER_H - 3); }
  const lanes = layoutLanes.filter(l => l.items.length);
  const hh = Math.max(2, Math.floor((OVER_H - 18) / Math.max(1, lanes.length)));
  lanes.forEach((l, i) => {
    c.fillStyle = alpha(l.color, 0.55);
    for (const it of l.items){ if (hiddenNode(it.n)) continue; const x = OX(it.n._tp); c.fillRect(x, y0 + 4 + i*hh, 1.5, hh - 1); }
  });
  const v0 = OX(S.t0), v1 = OX(S.t1);
  c.fillStyle = "rgba(31,78,140,0.12)"; c.fillRect(v0, y0 + 1, Math.max(3, v1 - v0), OVER_H - 1);
  c.strokeStyle = "rgba(31,78,140,0.7)"; c.lineWidth = 1.5; c.strokeRect(v0, y0 + 1.5, Math.max(3, v1 - v0), OVER_H - 3);
  c.lineWidth = 1;
}
function overviewT(x){ return 1780 + x / W * (2035 - 1780); }

function entitySpan(e){
  const it = e.item;
  const pick = (a, b) => a ? [span(a)[0], b ? span(b)[1] : (e.kind === "person" ? span(a)[1] : NOW)] : null;
  if (e.kind === "person") return it.born && it.died ? pick(it.born, it.died) : it.born ? pick(it.born) : null;
  if (e.kind === "org") return it.founded ? [span(it.founded)[0], it.dissolved ? span(it.dissolved)[1] : NOW] : null;
  if (e.kind === "work") return it.date ? span(it.date) : null;
  if (e.kind === "node") return [it._t0, it._t1];
  return null;
}

// ---------------------------------------------------------------- navigation
let anim = null;
function zoomTo(t0, t1, ms = 450){
  const sp0 = S.t1 - S.t0, c0 = (S.t0 + S.t1)/2;
  let sp1 = Math.max(MIN_SPAN, t1 - t0), c1 = (t0 + t1)/2;
  const start = performance.now();
  cancelAnimationFrame(anim);
  const step = now => {
    const k = Math.min(1, (now - start)/ms), e = k < .5 ? 2*k*k : 1 - Math.pow(-2*k + 2, 2)/2;
    const sp = Math.exp(Math.log(sp0) + (Math.log(sp1) - Math.log(sp0))*e), c = c0 + (c1 - c0)*e;
    S.t0 = c - sp/2; S.t1 = c + sp/2; clampT(); draw();
    if (k < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}
function zoomToNode(n){
  if (n._t1 - n._t0 > 0.6){ const pad = (n._t1 - n._t0)*0.12; zoomTo(n._t0 - pad, n._t1 + pad); }
  else { const sp = Math.min(Math.max(S.t1 - S.t0, 2), 12); zoomTo(n._tp - sp/2, n._tp + sp/2); }
  revealY(n);
}
function revealNode(n){
  const sp = S.t1 - S.t0;
  if (n._tp < S.t0 || n._tp > S.t1 || (n._t1 - n._t0) > sp) {
    if (n._t1 - n._t0 > sp) zoomToNode(n); else zoomTo(n._tp - sp/2, n._tp + sp/2);
  }
  revealY(n);
}
function revealY(n){
  const l = layoutLanes.find(l => l.items.some(it => it.n === n));
  if (!l) return;
  if (l.y < S.y || l.y + l.h > S.y + viewH()) { S.y = l.y - 10; clampY(); draw(); }
}
function fitAll(){
  let a = Infinity, b = -Infinity;
  for (const l of layoutLanes) for (const it of l.items){ a = Math.min(a, it.n._t0); b = Math.max(b, Math.min(it.n._t1, NOW)); }
  if (!isFinite(a)) { a = 1789; b = NOW; }
  const pad = (b - a)*0.03; zoomTo(a - pad, b + pad);
}
function zoomAt(x, f){
  const t = T(x), sp = Math.max(MIN_SPAN, Math.min(MAX_SPAN, (S.t1 - S.t0)*f));
  const k = x / W; S.t0 = t - k*sp; S.t1 = S.t0 + sp; clampT(); draw();
}

// ---------------------------------------------------------------- interactions
let drag = null, moved = false;
function hitAt(x, y){
  for (let i = HITS.length - 1; i >= 0; i--){ const h = HITS[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.n; }
  return null;
}
cv.addEventListener("wheel", e => {
  e.preventDefault(); stopPlay();
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left;
  const dy = e.deltaMode === 1 ? e.deltaY*16 : e.deltaY, dx = e.deltaMode === 1 ? e.deltaX*16 : e.deltaX;
  if (e.shiftKey){ S.y += dy || dx; clampY(); draw(); return; }
  if (Math.abs(dx) > Math.abs(dy)){ const sp = S.t1 - S.t0; S.t0 += dx/W*sp; S.t1 += dx/W*sp; clampT(); draw(); return; }
  zoomAt(x, Math.exp(dy * 0.0016));
}, {passive:false});
cv.addEventListener("pointerdown", e => {
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  cv.setPointerCapture(e.pointerId); moved = false; stopPlay();
  if (y > H - OVER_H){ drag = {mode:"over"}; const t = overviewT(x), sp = S.t1 - S.t0; S.t0 = t - sp/2; S.t1 = t + sp/2; clampT(); draw(); return; }
  drag = {mode:"pan", x, y, t0:S.t0, t1:S.t1, sy:S.y};
});
cv.addEventListener("pointermove", e => {
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if (drag){
    if (drag.mode === "over"){ const t = overviewT(x), sp = S.t1 - S.t0; S.t0 = t - sp/2; S.t1 = t + sp/2; clampT(); draw(); return; }
    const dx = x - drag.x, dy = y - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    if (moved){
      cv.classList.add("drag");
      const sp = drag.t1 - drag.t0; S.t0 = drag.t0 - dx/W*sp; S.t1 = drag.t1 - dx/W*sp; clampT();
      S.y = drag.sy - dy; clampY(); hideTip(); draw();
    }
    return;
  }
  const n = y > AXIS_H && y < H - OVER_H ? hitAt(x, y) : null;
  if ((n && n.id) !== S.hover){ S.hover = n ? n.id : null; draw(); }
  cv.classList.toggle("pt", !!n);
  if (n) showTip(n, x, y); else hideTip();
});
cv.addEventListener("pointerup", e => {
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  cv.classList.remove("drag");
  const was = drag; drag = null;
  if (!was || was.mode === "over" || moved) return;
  const n = y > AXIS_H && y < H - OVER_H ? hitAt(x, y) : null;
  if (n) select(n.id); else if (S.sel){ S.sel = null; closeDetail(); draw(); }
});
cv.addEventListener("pointerleave", () => { if (S.hover){ S.hover = null; draw(); } hideTip(); });
cv.addEventListener("dblclick", e => {
  const r = cv.getBoundingClientRect(), n = hitAt(e.clientX - r.left, e.clientY - r.top);
  if (n) zoomToNode(n); else zoomAt(e.clientX - r.left, 0.5);
});
window.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  const sp = S.t1 - S.t0;
  if (e.key === "Escape"){ if ($("detail").classList.contains("open")) closeDetail(); else if (S.focus) setFocus(null); S.sel = null; draw(); }
  else if (e.key === "0") fitAll();
  else if (e.key === "+" || e.key === "=") zoomAt(W/2, 0.7);
  else if (e.key === "-" || e.key === "_") zoomAt(W/2, 1/0.7);
  else if (e.key === "ArrowLeft"){ S.t0 -= sp*0.15; S.t1 -= sp*0.15; clampT(); draw(); }
  else if (e.key === "ArrowRight"){ S.t0 += sp*0.15; S.t1 += sp*0.15; clampT(); draw(); }
  else if (e.key === "ArrowUp"){ S.y -= 60; clampY(); draw(); }
  else if (e.key === "ArrowDown"){ S.y += 60; clampY(); draw(); }
  else if (e.key === "/"){ e.preventDefault(); $("q").focus(); }
});

const tip = $("tip");
function showTip(n, x, y){
  const sum = txt(n.summary);
  tip.innerHTML = `<b>${esc(txt(n.title))}</b><div class="m">${esc(fmtRange(n, LANG))} · ${esc(I18N.type(n.type))}</div>` +
    (sum ? `<div style="margin-top:4px">${esc(sum.length > 180 ? sum.slice(0,178) + "…" : sum)}</div>` : "") +
    ((k => k ? `<div class="m" style="margin-top:4px">✎ ${esc(tr("n.notes", {n:k}))}</div>` : "")((NOTES_ABOUT.get("node:" + n.id) || []).length));
  tip.style.display = "block";
  const tw_ = tip.offsetWidth, th = tip.offsetHeight;
  let lx = x + 14, ly = y + 14;
  if (lx + tw_ > W - 4) lx = x - tw_ - 10;
  if (ly + th > H - 4) ly = y - th - 10;
  tip.style.left = Math.max(4, lx) + "px"; tip.style.top = Math.max(4, ly) + "px";
}
function hideTip(){ tip.style.display = "none"; }

// ---------------------------------------------------------------- panneau de détail
const detail = $("detail");
function select(id, push = true){
  const n = NODES.get(id); if (!n) return;
  if (push && S.sel && S.sel !== id) S.history.push("node:" + S.sel);
  S.sel = id; showNode(n); draw();
}
function closeDetail(){ detail.classList.remove("open"); }
function chips(pre, ids){ return `<div class="chips">${ids.map(id => `<span class="chip" data-ref="${pre}:${esc(id)}" title="${esc(tr("d.chip.title"))}">${esc(entName(pre+":"+id))}</span>`).join("")}</div>`; }
function barTop(back){
  return `<div class="bar"><span>${back ? `<button class="btn" data-act="back">${esc(tr("d.back"))}</button>` : ""}</span><button class="btn" data-act="close">✕</button></div>`;
}
function mediaHTML(ref, skip){
  const ms = imagesOf(ref).filter(m => m !== skip);
  if (!ms.length) return "";
  const credit = m => (m.credit ? " — " + esc(m.credit) : "") + (m.license ? " · " + esc(m.license) : "");
  if (ms.length === 1){
    const m = ms[0];
    return `<figure class="one" data-media="${esc(m.id)}"><img loading="lazy" src="${esc(mediaSrc(m))}" alt="${esc(txt(m.title))}"><figcaption>${esc(txt(m.caption) || txt(m.title))}${credit(m)}</figcaption></figure>`;
  }
  return `<h4>${tr("h.images", {n:ms.length})}</h4><div class="gallery">` + ms.map(m =>
    `<figure data-media="${esc(m.id)}" title="${esc(txt(m.title))}"><img loading="lazy" src="${esc(mediaSrc(m))}" alt="${esc(txt(m.title))}"><figcaption>${esc(m.date ? fmtDate(m.date, LANG) : txt(m.title))}</figcaption></figure>`).join("") + "</div>";
}
const lb = $("lb");
function openLightbox(id){
  const m = ENT.get("media:" + id)?.item; if (!m) return;
  const meta = [m.date && fmtDate(m.date, LANG), m.credit, m.license].filter(Boolean).map(esc).join(" · ");
  lb.innerHTML = `<img src="${esc(mediaSrc(m))}" alt="${esc(txt(m.title))}"><div class="cap"><b>${esc(txt(m.title))}</b><br>${esc(txt(m.caption))}` +
    `<div class="m">${meta}${m.origin ? ` · <a href="${esc(m.origin)}" target="_blank" rel="noopener">${esc(tr("source.link"))}</a>` : ""}</div></div>`;
  lb.classList.add("open");
}
lb.addEventListener("click", e => { if (!e.target.closest("a")) lb.classList.remove("open"); });
window.addEventListener("keydown", e => { if (e.key === "Escape" && lb.classList.contains("open")){ lb.classList.remove("open"); e.stopImmediatePropagation(); } }, true);
/** nom d'un lieu tel qu'il était à une date donnée (historical_names), avec le nom actuel entre parenthèses */
function placeAt(id, dv){
  const p = ENT.get("place:" + id)?.item; if (!p) return link("place:" + id, id);
  const cur = txt(p.name);
  if (dv) {
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
    const a = dy - by - ((dm < bm || (dm === bm && dd < bd)) ? 1 : 0);
    age = ` <span style="color:var(--faint)">(${esc(tr("age", {n:a}))})</span>`;
  }
  const b = line("°", it.born, it.birth_place), d = line("†", it.died, it.death_place);
  return b || d ? `<div class="meta" style="color:var(--ink)">${b}${d ? d.replace(/<\/div>$/, age + "</div>") : ""}</div>` : "";
}
function linksHTML(ref){
  const out = (LINKS_OUT.get(ref) || []).map(l => [l, 0, l.to]), inn = (LINKS_IN.get(ref) || []).map(l => [l, 1, l.from]);
  const all = [...out, ...inn];
  if (!all.length) return "";
  return `<h4>${tr("h.links", {n:all.length})}</h4>` + all.map(([l, dir, other]) => {
    const col = LINK_COLORS[l.type] || "#555";
    const lb = I18N.link(l.type, dir);
    return `<div class="lk"><div class="ty"><span class="pill" style="background:${col}">${esc(lb)}</span>${l.status === "final" ? "" : '<span style="font-size:11px">' + esc(tr("status.draft")) + " · " + esc(l.provenance?.by || "") + "</span>"}</div>` +
      `<div>${link(other, entName(other))}</div>${l.justification ? `<div class="why">${esc(l.justification)}</div>` : ""}</div>`;
  }).join("");
}
function sourcesHTML(list, head = "<h4>" + tr("h.sources") + "</h4>"){
  if (!list || !list.length) return "";
  return head + list.map(s => {
    const src = ENT.get("source:" + s.ref)?.item;
    const t = src ? (src.author ? src.author + ", " : "") + src.title + (src.year ? " (" + src.year + ")" : "") : s.ref;
    const loc = [s.chapter, s.page != null ? "p. " + s.page : ""].filter(Boolean).join(", ");
    return `<div class="src">${src?.url ? `<a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t)}${loc ? ` — <span style="color:var(--muted)">${esc(loc)}</span>` : ""}${s.note ? `<div class="why" style="font-size:12px;color:var(--muted)">${esc(s.note)}</div>` : ""}</div>`;
  }).join("");
}
function mdInline(s){
  return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*\s][^*]*)\*/g, "<i>$1</i>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
function mdHTML(src){
  const out = []; let para = [], list = null;
  const flushP = () => { if (para.length){ out.push("<p>" + mdInline(para.join(" ")) + "</p>"); para = []; } };
  const flushL = () => { if (list){ out.push(`<${list.tag}>` + list.items.map(i => "<li>" + mdInline(i) + "</li>").join("") + `</${list.tag}>`); list = null; } };
  for (const line of String(src || "").split(/\r?\n/)){
    let m;
    if (!line.trim()){ flushP(); flushL(); continue; }
    if ((m = line.match(/^#{1,6}\s+(.*)$/))){ flushP(); flushL(); out.push("<h5>" + mdInline(m[1]) + "</h5>"); continue; }
    if ((m = line.match(/^\s*(\d+[.)]|[-*+])\s+(.*)$/))){
      flushP(); const tag = /\d/.test(m[1]) ? "ol" : "ul";
      if (!list || list.tag !== tag){ flushL(); list = {tag, items:[]}; }
      list.items.push(m[2]); continue;
    }
    if (list && /^\s+\S/.test(line)){ list.items[list.items.length-1] += " " + line.trim(); continue; }
    flushL(); para.push(line.trim());
  }
  flushP(); flushL();
  return out.join("");
}
function notesHTML(ref){
  const list = NOTES_ABOUT.get(ref) || [];
  if (!list.length) return "";
  return `<h4 id="notes-h">${tr("h.notes", {n:list.length})}</h4>` + list.map(nt => {
    let body = String(nt.body || ""), title = "";
    const m = body.match(/^\s*#\s+(.+)\n?/);
    if (m){ title = m[1].trim(); body = body.slice(m[0].length); }
    const others = (nt.about || []).map(a => typeof a === "string" ? a : a.ref).filter(r => r !== ref && ENT.has(r));
    const meta = [nt.status === "draft" || nt.status === "final" ? tr("note." + nt.status) : nt.status, ...(nt.tags || [])].filter(Boolean);
    const batch = others.length > 12;
    return `<details class="note"${list.length === 1 && !batch ? " open" : ""}><summary>${esc(title || nt.id)}</summary>` +
      (meta.length ? `<div class="nm">${meta.map(t => `<span>${esc(t)}</span>`).join("")}</div>` : "") +
      `<div class="nb">${mdHTML(body)}` +
      sourcesHTML(nt.sources, '<div style="font-size:11px;color:var(--muted);margin-top:8px">' + esc(tr("d.note.sources")) + '</div>') +
      (others.length ? `<div style="font-size:12px;color:var(--muted);margin-top:6px">${esc(tr("d.note.also"))}${others.slice(0, 12).map(r => link(r, entName(r))).join(", ")}${batch ? ` … (+${others.length - 12})` : ""}</div>` : "") +
      `<div style="font-size:11px;color:var(--faint);margin-top:6px">notes/${esc(nt.file || nt.id + ".md")}</div></div></details>`;
  }).join("");
}
function noteCue(ref){
  const k = (NOTES_ABOUT.get(ref) || []).length;
  return k ? `<div class="notecue">✎ ${esc(tr("n.notes", {n:k}))} — <a data-act="notes">${esc(tr("d.noteCue.see"))}</a></div>` : "";
}
function evList(nodes){
  return nodes.slice().sort((a,b) => a._t0 - b._t0).map(n => {
    const l = POS.get(n.id)?.lane || ALL_LANES.find(l => l.items.some(i => i.n === n));
    return `<div class="ev" data-ref="node:${esc(n.id)}"><span class="dot" style="background:${l ? l.color : "#999"}"></span><span class="dt">${esc(fmtDate(n.start, LANG).replace(/ \(.*\)$/, ""))}</span><span>${esc(txt(n.title))}</span></div>`;
  }).join("");
}
function showNode(n){
  const t = txt(n.title), ot = n.title.orig && n.title[n.title.orig] && n.title[n.title.orig] !== t ? n.title[n.title.orig] : "";
  const fam = n._fam, kids = CHILDREN.get(n.id) || [];
  let h = barTop(S.history.length) + crumbs(n) +
    `<h2>${esc(t)}</h2>${ot ? `<div class="orig">${esc(ot)}</div>` : ""}` +
    `<div class="meta">${esc(fmtRange(n, LANG))}<br>${esc(I18N.type(n.type))} · ${esc(I18N.fam(fam.id))} <span class="pill ${n.status||"draft"}">${esc(tr(n.status === "final" ? "status.final" : "status.draft"))}</span></div>` +
    `<div class="chips" style="margin-bottom:10px"><button class="btn" data-act="zoom">${esc(tr("d.zoom"))}</button><button class="btn" data-act="focus" title="${esc(tr("d.isolate.title"))}">${esc(tr("d.isolate"))}</button></div>`;
  h += noteCue("node:" + n.id);
  if (n.summary) h += `<p>${esc(txt(n.summary))}</p>`;
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
  h += notesHTML("node:" + n.id);
  h += `<p style="margin-top:18px;font-size:11px;color:var(--faint)">id : ${esc(n.id)}</p>`;
  detail.innerHTML = h; detail.classList.add("open"); detail.scrollTop = 0;
  detail._cur = "node:" + n.id;
}
function showEntity(ref, push = true){
  const e = ENT.get(ref); if (!e) return;
  if (e.kind === "node") return select(ref.slice(5), push);
  if (push && detail._cur && detail._cur !== ref) S.history.push(detail._cur);
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
  let h = barTop(S.history.length) + (portrait
    ? `<div class="phead"><div class="tx">${head}</div><div class="pt" data-media="${esc(portrait.id)}" title="${esc(txt(portrait.title))}"><img src="${esc(mediaSrc(portrait))}" alt="${esc(txt(portrait.title))}"></div></div>`
    : head);
  const nodes = ENT_NODES.get(ref) || [];
  h += noteCue(ref);
  h += `<div class="chips" style="margin-bottom:10px">${nodes.length ? `<button class="btn ${S.focus === ref ? "on" : ""}" data-act="focus">${esc(tr(S.focus === ref ? "d.filterOn" : "d.filter"))}</button>` : ""}${entitySpan(e) ? `<button class="btn" data-act="zoomspan">${esc(tr("d.zoomSpan"))}</button>` : ""}</div>`;
  if (it.summary) h += `<p class="lead">${esc(txt(it.summary))}</p>`;
  if (it.bio) h += `<h4>${tr("h.bio")}</h4><p class="bio">${esc(txt(it.bio))}</p>`;
  if (e.kind === "place"){
    if (it.historical_names?.length) h += "<h4>" + tr("h.histNames") + "</h4>" + it.historical_names.map(hn => `<div class="src">${esc(hn.name)} <span style="color:var(--muted)">${esc(hn.from ? fmtDate(hn.from, LANG) + " – " + (hn.to ? fmtDate(hn.to, LANG) : "") : hn.to ? tr("until", {date:fmtDate(hn.to, LANG)}) : "")}</span></div>`).join("");
    if (it.coords) h += `<p style="margin-top:8px"><a href="https://www.openstreetmap.org/?mlat=${it.coords.lat}&mlon=${it.coords.lon}#map=${({country:5, region:7, water:9, city:12, district:14, site:15})[it.kind] || 10}/${it.coords.lat}/${it.coords.lon}" target="_blank" rel="noopener">${esc(tr("map"))}</a></p>`;
  }
  if (it.memberships?.length) h += "<h4>" + tr("h.memberships") + "</h4>" + it.memberships.map(mb => {
    const per = mb.from ? fmtDate(mb.from, LANG) + " – " + (mb.to ? fmtDate(mb.to, LANG) : "…") : mb.to ? tr("until", {date:fmtDate(mb.to, LANG)}) : "";
    return `<div class="mb"><span class="dt">${esc(per)}</span><span class="chip" data-ref="org:${esc(mb.org)}" title="${esc(tr("d.chip.org.title"))}">${esc(entName("org:" + mb.org))}</span>${mb.role ? `<span style="color:var(--muted)">${esc(txt(mb.role))}</span>` : ""}</div>`;
  }).join("");
  if (e.kind === "work" && it.authors?.length) h += "<h4>" + tr("h.authors") + "</h4>" + chips("person", it.authors);
  if (e.kind === "org" && it.parent) h += "<h4>" + tr("h.partOf") + "</h4>" + chips("org", [it.parent]);
  const subs = SUBORGS.get(ref) || [];
  if (subs.length) h += "<h4>" + tr("h.components") + "</h4>" + chips("org", subs.map(o => o.id));
  if (e.kind === "source" && it.url) h += `<p><a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.url)}</a></p>`;
  h += mediaHTML(ref, portrait);
  const works = WORKS_BY.get(ref) || [];
  if (works.length) h += "<h4>" + tr("h.works") + "</h4>" + chips("work", works.map(w => w.id));
  h += linksHTML(ref);
  if (nodes.length) h += `<h4>${tr("h.events", {n:nodes.length})}</h4>` + evList(nodes);
  if (it.aliases?.length) h += `<h4>${tr("h.aliases")}</h4><p>${esc(it.aliases.join(" · "))}</p>`;
  if (e.kind !== "source") h += sourcesHTML(it.sources);
  if (it.wikidata) h += `<p style="margin-top:10px;font-size:12px"><a href="https://www.wikidata.org/wiki/${esc(it.wikidata)}" target="_blank" rel="noopener">Wikidata ${esc(it.wikidata)} ↗</a></p>`;
  h += notesHTML(ref);
  h += `<p style="margin-top:18px;font-size:11px;color:var(--faint)">${esc(ref)}</p>`;
  detail.innerHTML = h; detail.classList.add("open"); detail.scrollTop = 0;
  detail._cur = ref;
}
detail.addEventListener("click", e => {
  const fig = e.target.closest("[data-media]"); if (fig) return openLightbox(fig.dataset.media);
  const a = e.target.closest("[data-act],[data-ref]"); if (!a) return;
  const act = a.dataset.act, ref = a.dataset.ref;
  if (act === "notes"){ const hh = detail.querySelector("#notes-h"); if (hh){ detail.querySelectorAll("details.note").forEach(d => d.open = true); detail.scrollTo({top: hh.offsetTop - 10, behavior:"smooth"}); } return; }
  if (act === "close"){ closeDetail(); S.sel = null; S.history = []; draw(); return; }
  if (act === "back"){ const r = S.history.pop(); if (r) { if (r.startsWith("node:")) select(r.slice(5), false); else showEntity(r, false); } return; }
  const cur = detail._cur;
  if (act === "zoom" && cur?.startsWith("node:")) return zoomToNode(NODES.get(cur.slice(5)));
  if (act === "focus") { setFocus(S.focus === cur ? null : cur); showEntity(cur, false); if (cur.startsWith("node:")) select(cur.slice(5), false); return; }
  if (act === "zoomspan"){ const sp = entitySpan(ENT.get(cur)); if (sp){ const pad = Math.max(1, (sp[1]-sp[0])*0.08); zoomTo(sp[0]-pad, sp[1]+pad); } return; }
  if (ref){
    if (ref.startsWith("node:")){ const n = NODES.get(ref.slice(5)); if (n){ select(n.id); revealNode(n); } }
    else if (a.classList.contains("chip")){ showEntity(ref); setFocus(ref); showEntity(ref, false); }
    else showEntity(ref);
  }
});
function setFocus(ref){
  S.focus = ref;
  const fb = $("focusbar");
  if (ref){
    const set = focusSet();
    $("focustxt").textContent = tr("d.focus.text", {name:entName(ref), events:tr("n.events", {n:set.size})});
    fb.style.display = "flex";
    // si aucun évènement filtré n'est dans la vue, on cadre sur eux
    const ns = [...set].map(id => NODES.get(id)).filter(Boolean);
    if (ns.length && !ns.some(n => n._t1 >= S.t0 && n._t0 <= S.t1)){
      const a = Math.min(...ns.map(n => n._t0)), b = Math.max(...ns.map(n => Math.min(n._t1, NOW)));
      const pad = Math.max(1, (b - a)*0.1); zoomTo(a - pad, b + pad);
    }
  } else fb.style.display = "none";
  draw();
}
$("focusclear").onclick = () => setFocus(null);

// ---------------------------------------------------------------- recherche
let SEARCH = [];
function buildSearch(){
  SEARCH = [];
  for (const [ref, e] of ENT){
    if (e.kind === "media") continue;
    const it = e.item, names = [...allTexts(it.name || it.title), ...allTexts(it.full_name), ...(it.aliases || []), ...((it.historical_names||[]).map(h => h.name)), it.id];
    SEARCH.push({ref, hay:norm(names.join(" | ")), e});
  }
}
let resSel = 0, resList = [];
$("q").addEventListener("input", () => {
  const q = norm($("q").value.trim()), box = $("results");
  if (q.length < 2){ box.style.display = "none"; return; }
  const words = q.split(/\s+/);
  resList = SEARCH.filter(s => words.every(w => s.hay.includes(w)))
    .map(s => ({s, score:(norm(entName(s.ref)).startsWith(q) ? 0 : 1) + (s.e.kind === "node" ? 0 : 0.5) - Math.min(0.4, (ENT_NODES.get(s.ref)||[]).length/20)}))
    .sort((a,b) => a.score - b.score).slice(0, 14).map(x => x.s);
  resSel = 0;
  const date = s => s.e.kind === "node" ? fmtDate(s.e.item.start, LANG).replace(/ \(.*\)$/, "") : "";
  box.innerHTML = resList.length ? resList.map((s,i) => `<div data-i="${i}" class="${i===0?"on":""}"><span class="k">${esc(tr("kindl." + s.e.kind))}</span><span>${esc(entName(s.ref))}</span><span class="d">${esc(date(s))}</span></div>`).join("") : `<div style="color:var(--muted)">${esc(tr("search.none"))}</div>`;
  box.style.display = "block";
});
$("q").addEventListener("keydown", e => {
  const box = $("results");
  if (e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); resSel = (resSel + (e.key === "ArrowDown" ? 1 : -1) + resList.length) % Math.max(1, resList.length); [...box.children].forEach((d,i) => d.classList.toggle("on", i === resSel)); }
  else if (e.key === "Enter" && resList[resSel]) pickResult(resList[resSel]);
  else if (e.key === "Escape"){ box.style.display = "none"; $("q").blur(); }
});
$("results").addEventListener("mousedown", e => { const d = e.target.closest("[data-i]"); if (d) pickResult(resList[+d.dataset.i]); });
$("q").addEventListener("blur", () => setTimeout(() => $("results").style.display = "none", 150));
function pickResult(s){
  $("results").style.display = "none"; $("q").value = "";
  if (s.e.kind === "node"){ select(s.e.item.id); revealNode(s.e.item); }
  else { showEntity(s.ref); if ((ENT_NODES.get(s.ref)||[]).length) { setFocus(s.ref); showEntity(s.ref, false); } }
}

// ---------------------------------------------------------------- panneau latéral
function buildLaneList(){
  const box = $("lanes"); box.innerHTML = "";
  for (const l of laneOrder()){
    const row = document.createElement("div"); row.className = "lane-row"; row.style.paddingLeft = (l.depth*14) + "px";
    row._lane = l; row.classList.toggle("off", !laneShown(l));
    const n = l.items.length;
    row.innerHTML = `<label><input type="checkbox" ${l.visible ? "checked" : ""}><span class="sw" style="background:${l.color}"></span><span class="nm">${esc(laneName(l))}</span><span style="color:var(--faint);font-size:12px">${n || ""}</span></label>` +
      (l.bars.some(b => b.level === 0) ? `<button class="bg-t ${l.bg ? "on" : ""}" title="${esc(tr("d.bg.title"))}">${esc(tr("d.bg"))}</button>` : "");
    row.querySelector("input").onchange = ev => { l.visible = ev.target.checked; storeLanes(); refreshLaneRows(); relayout(); draw(); };
    const bt = row.querySelector(".bg-t");
    if (bt) bt.onclick = () => { l.bg = !l.bg; bt.classList.toggle("on", l.bg); draw(); };
    box.appendChild(row);
  }
}
/** grise les sous-lignes dont un parent est décoché */
function refreshLaneRows(){ for (const row of $("lanes").children) row.classList.toggle("off", !laneShown(row._lane)); }
function setLanes(fn){ for (const l of ALL_LANES) fn(l); storeLanes(); buildLaneList(); relayout(); draw(); }
$("lanesAll").onclick = () => setLanes(l => { l.visible = true; });
$("lanesNone").onclick = () => setLanes(l => { if (!l.parent) l.visible = false; }); // les sous-lignes gardent leur état
$("lanesDef").onclick = () => setLanes(l => { l.visible = defaultVisible(l); });
function buildSide(){
  buildLaneList();
  const lg = $("legend"); lg.innerHTML = "";
  for (const f of FAMILIES){
    const d = document.createElement("div"); if (S.hiddenFam.has(f.id)) d.classList.add("off");
    const c = document.createElement("canvas"); c.width = 36; c.height = 36; c.style.width = c.style.height = "18px";
    const cc = c.getContext("2d"); cc.scale(2,2); drawShape(cc, f, 9, 9, 5, "#4a4e69", 1);
    d.appendChild(c); d.appendChild(document.createTextNode(I18N.fam(f.id)));
    d.title = f.types.map(k => I18N.type(k)).join(", ");
    d.onclick = () => { S.hiddenFam.has(f.id) ? S.hiddenFam.delete(f.id) : S.hiddenFam.add(f.id); d.classList.toggle("off"); draw(); };
    lg.appendChild(d);
  }
  updateDensityLabel();
}
function updateDensityLabel(){ $("densityLbl").textContent = S.rows ? tr("d.density", {n:S.rows}) : tr("d.density.none"); }
$("density").oninput = e => { S.rows = +e.target.value; updateDensityLabel(); relayout(); draw(); };
$("lang").onchange = e => { setLang(e.target.value); I18N.set(e.target.value); I18N.remember(LANG); applyUI(); };
/** (re)traduit toute l'interface : au démarrage et à chaque changement de langue */
function applyUI(){
  I18N.apply();
  document.title = tr("d.title");
  $("play").textContent = tr(playing ? "d.stop" : "d.play");
  $("rec").textContent = tr(recorder ? "d.rec.stop" : "d.rec");
  if (DB?.generated) $("stamp").textContent = tr("stamp", {date:new Date(DB.generated).toLocaleString(I18N.locale(), {dateStyle:"medium", timeStyle:"short"})});
  clearTextCache(); buildSide();
  if (S.focus) setFocus(S.focus);
  if (detail.classList.contains("open") && detail._cur) { const c = detail._cur; c.startsWith("node:") ? showNode(NODES.get(c.slice(5))) : showEntity(c, false); }
  draw();
}
$("fit").onclick = fitAll;
$("alllinks").onclick = e => { S.allLinks = !S.allLinks; e.currentTarget.classList.toggle("on", S.allLinks); draw(); };
$("sidetoggle").onclick = () => $("side").classList.toggle("open");

// ---------------------------------------------------------------- défilement + film
let playing = null;
function stopPlay(){ if (playing){ cancelAnimationFrame(playing.raf); playing = null; $("play").classList.remove("on"); $("play").textContent = tr("d.play"); } }
$("play").onclick = () => {
  if (playing) return stopPlay();
  cancelAnimationFrame(anim);
  playing = {last: performance.now()};
  $("play").classList.add("on"); $("play").textContent = tr("d.stop");
  const step = now => {
    const dt = (now - playing.last)/1000; playing.last = now;
    const sp = S.t1 - S.t0, v = sp / 14; // la fenêtre parcourt sa propre largeur en 14 s
    S.t0 += v*dt; S.t1 += v*dt;
    if (S.t1 >= Math.min(MAX_T, NOW + 2)) { clampT(); draw(); return stopPlay(); }
    draw(); playing.raf = requestAnimationFrame(step);
  };
  playing.raf = requestAnimationFrame(step);
};
let recorder = null;
$("rec").onclick = () => {
  const b = $("rec");
  if (recorder){ recorder.stop(); return; }
  if (!cv.captureStream || !window.MediaRecorder){ alert(tr("d.alert.noRec")); return; }
  const types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
  const mime = types.find(t => MediaRecorder.isTypeSupported(t)) || "";
  const stream = cv.captureStream(30), chunks = [];
  recorder = new MediaRecorder(stream, mime ? {mimeType:mime, videoBitsPerSecond:6e6} : undefined);
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    const blob = new Blob(chunks, {type: recorder.mimeType || "video/webm"});
    download(blob, `${tr("d.file")}-${stamp()}.${(recorder.mimeType||"").includes("mp4") ? "mp4" : "webm"}`);
    recorder = null; b.classList.remove("on"); b.textContent = tr("d.rec");
  };
  recorder.start(250); b.classList.add("on"); b.textContent = tr("d.rec.stop");
  // force des images régulières même sans mouvement
  (function tick(){ if (!recorder) return; draw(); setTimeout(tick, 200); })();
};
$("png").onclick = () => {
  const k = 2, off = document.createElement("canvas"); off.width = W*k; off.height = H*k;
  const oc = off.getContext("2d");
  const caption = `${shortYear(S.t0)} – ${shortYear(S.t1)}` + (S.focus ? " · " + entName(S.focus) : "");
  render(oc, W, H, k, {caption});
  render(ctx, W, H, DPR); // restaure les zones cliquables
  off.toBlob(b => download(b, `${tr("d.file")}-${stamp()}.png`), "image/png");
};

// ---------------------------------------------------------------- état dans l'URL (partageable)
let hashT = null;
function saveHashSoon(){ clearTimeout(hashT); hashT = setTimeout(saveHash, 400); }
function saveHash(){
  const p = new URLSearchParams();
  p.set("t", S.t0.toFixed(2) + "," + S.t1.toFixed(2));
  if (LANG !== I18N.detect()) p.set("l", LANG);
  p.set("v", ALL_LANES.filter(l => !l.parent && l.visible).map(l => l.id).join(",") || "-");
  const hid = ALL_LANES.filter(l => l.parent && !l.visible).map(l => l.id); if (hid.length) p.set("h", hid.join(","));
  const bg = ALL_LANES.filter(l => l.bg).map(l => l.id); if (bg.length) p.set("b", bg.join(","));
  if (S.sel) p.set("s", S.sel);
  if (S.focus) p.set("f", S.focus);
  if (S.rows !== 4) p.set("r", S.rows);
  if (S.hiddenFam.size) p.set("x", [...S.hiddenFam].join(","));
  if (S.allLinks) p.set("k", "1");
  try { history.replaceState(null, "", "#" + p.toString()); } catch(e) {}
}
function loadHash(){
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get("t")){ const [a,b] = p.get("t").split(",").map(Number); if (isFinite(a) && isFinite(b) && b > a){ S.t0 = a; S.t1 = b; } }
  const l = p.get("l"); if ([...I18N.LANGS, "orig"].includes(l)){ setLang(l); I18N.set(l); }
  if (p.has("v")){ const v = new Set(p.get("v").split(",")); for (const l of ALL_LANES) l.visible = !!l.parent || v.has(l.id); }
  else if (!p.has("h")) restoreLanes();   // pas de lien partagé : config mémorisée, sinon défaut
  // (ancien format de lien : h seul = tout visible sauf h)
  for (const id of (p.get("h")||"").split(",")) { const l = ALL_LANES.find(l => l.id === id); if (l) l.visible = false; }
  for (const id of (p.get("b")||"").split(",")) { const l = ALL_LANES.find(l => l.id === id); if (l) l.bg = true; }
  if (p.get("r")){ S.rows = Math.max(0, Math.min(7, +p.get("r"))); $("density").value = S.rows; }
  for (const f of (p.get("x")||"").split(",")) if (f) S.hiddenFam.add(f);
  if (p.get("k")){ S.allLinks = true; $("alllinks").classList.add("on"); }
  return {sel:p.get("s"), focus:p.get("f"), hasT: !!p.get("t")};
}

// ---------------------------------------------------------------- démarrage
function resize(){
  const r = $("stage").getBoundingClientRect();
  W = Math.max(200, r.width); H = Math.max(200, r.height); DPR = window.devicePixelRatio || 1;
  cv.width = Math.round(W*DPR); cv.height = Math.round(H*DPR);
  clampY(); render(ctx, W, H, DPR);
}
function start(raw, notes){
  indexDB(raw, notes); buildLanes(); buildSearch();
  const st = loadHash();
  $("lang").value = LANG;
  applyUI(); relayout();
  new ResizeObserver(resize).observe($("stage"));
  resize();
  if (!st.hasT) { S.t0 = 1785; S.t1 = NOW + 3; clampT(); }
  if (st.sel && NODES.has(st.sel)) select(st.sel);
  if (st.focus && ENT.has(st.focus)) setFocus(st.focus);
  draw();
}
if (window.TLDB) start(window.TLDB, window.TLDB_NOTES || []);
else { I18N.apply(); document.title = tr("d.title"); $("loader").style.display = "flex"; }

// diagnostic (comparaison avant / après une refonte) : window.__tl.dump()
window.__tl = {dump: () => ({nodes: NODES.size, ent: ENT.size, search: SEARCH.length, roots: ROOT_LANES.map(l => l.id),
  lanes: ALL_LANES.map(l => ({id:l.id, p:l.parent && l.parent.id, d:l.depth, color:l.color, items:l.items.map(i => [i.n.id, i.level, !!i.container, i.row ?? null])}))})};
