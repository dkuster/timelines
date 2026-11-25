/* Dessin sur canvas commun aux viewers : couleurs, formes des familles, mesure du texte. */

/** #rrggbb + opacité -> rgba() */
export function alpha(hex, a){ const n = parseInt(hex.slice(1),16); return `rgba(${n>>16},${(n>>8)&255},${n&255},${a})`; }

/** tracé de la forme d'une famille (triUp, triDown, diamond, square, star, dot, cercle par défaut) */
export function shapePath(c, kind, x, y, r){
  c.beginPath();
  switch (kind){
    case "triUp": c.moveTo(x, y-r*1.25); c.lineTo(x+r*1.1, y+r*0.8); c.lineTo(x-r*1.1, y+r*0.8); c.closePath(); break;
    case "triDown": c.moveTo(x, y+r*1.25); c.lineTo(x+r*1.1, y-r*0.8); c.lineTo(x-r*1.1, y-r*0.8); c.closePath(); break;
    case "diamond": c.moveTo(x, y-r*1.3); c.lineTo(x+r*1.05, y); c.lineTo(x, y+r*1.3); c.lineTo(x-r*1.05, y); c.closePath(); break;
    case "square": c.rect(x-r*0.88, y-r*0.88, r*1.76, r*1.76); break;
    case "star": for (let i=0;i<10;i++){ const a = -Math.PI/2 + i*Math.PI/5, rr = i%2 ? r*0.55 : r*1.3; c[i?"lineTo":"moveTo"](x+rr*Math.cos(a), y+rr*Math.sin(a)); } c.closePath(); break;
    case "dot": c.arc(x, y, r*0.7, 0, Math.PI*2); break;
    default: c.arc(x, y, r, 0, Math.PI*2);
  }
}

/** largeur d'un texte avec la police courante du contexte (mise en cache) */
const TM = new Map();
export function tw(c, s){ const k = c.font + "|" + s; let v = TM.get(k); if (v === undefined){ v = c.measureText(s).width; if (TM.size > 8000) TM.clear(); TM.set(k, v); } return v; }

/** nom de fichier horodaté pour les exports */
export function stamp(){ const d = new Date(), p = n => String(n).padStart(2,"0"); return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; }
/** téléchargement d'un Blob (export PNG, vidéo) */
export function download(blob, name){ const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
/** à vider quand la police ou la langue change */
export function clearTextCache(){ TM.clear(); }
