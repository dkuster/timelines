/* Dates de la base (ISO partielles : AAAA, AAAA-MM, AAAA-MM-JJ) et années décimales.
   Le calendrier julien est vérifié et converti en amont (py -m tldb validate) : ici, date = grégorien. */
import { I18N } from "./i18n.js";
import { txt } from "./text.js";

export const MONTHS = I18N.MONTHS, MSHORT = I18N.MSHORT, QUAL = I18N.QUAL;

export function isLeap(y){ return (y%4===0 && y%100!==0) || y%400===0; }
export function daysInYear(y){ return isLeap(y) ? 366 : 365; }
export function dayOfYear(y,m,d){ const ml=[31,isLeap(y)?29:28,31,30,31,30,31,31,30,31,30,31]; let n=d; for(let i=0;i<m-1;i++) n+=ml[i]; return n; }
export function parseD(s){ const neg = s.startsWith("-"); const p = (neg?s.slice(1):s).split("-").map(Number); return {y:neg?-p[0]:p[0], m:p[1]||0, d:p[2]||0}; }
/** intervalle [a,b[ en années décimales couvert par une date de précision variable */
export function span(dv){
  const {y,m,d} = parseD(dv.date), D = daysInYear(y);
  if (d){ const a = y + (dayOfYear(y,m,d)-1)/D; return [a, a+1/D]; }
  if (m){ return [y + (dayOfYear(y,m,1)-1)/D, m===12 ? y+1 : y + (dayOfYear(y,m+1,1)-1)/D]; }
  return [y, y+1];
}
/** aujourd'hui en année décimale (fin des périodes en cours) */
export const NOW = (() => { const d = new Date(); return d.getFullYear() + (dayOfYear(d.getFullYear(), d.getMonth()+1, d.getDate())-1)/daysInYear(d.getFullYear()); })();

export function fmtRaw(s, lang){
  const {y,m,d} = parseD(s), L = MONTHS[lang] || MONTHS.fr;
  if (d) return lang==="de" ? `${d}. ${L[m-1]} ${y}` : lang==="en" ? `${d} ${L[m-1]} ${y}` : `${d===1?"1er":d} ${L[m-1]} ${y}`;
  if (m) return `${L[m-1]} ${y}`;
  return String(y);
}
export function fmtDate(dv, lang){
  if (!dv) return "";
  if (dv.display) return txt(dv.display); // texte libre, simple ou multilingue
  const l = MONTHS[lang] ? lang : I18N.lang;
  let s = (dv.qualifier ? QUAL[l][dv.qualifier] : "") + fmtRaw(dv.date, l);
  if (dv.original && dv.calendar === "julian") s += ` (${fmtRaw(dv.original, l)} ${I18N.t("julian")})`;
  else if (dv.original) s += ` (${dv.original})`;
  return s;
}
/** dates d'un nœud : début – fin, « depuis … » pour une période en cours */
export function fmtRange(n, lang){
  const a = fmtDate(n.start, lang);
  if (n.end){ const b = fmtDate(n.end, lang); return a === b ? a : a + " – " + b; }
  if (n.ongoing) return I18N.t("since", {date:a});
  return a;
}
