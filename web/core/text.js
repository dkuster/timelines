/* Textes multilingues du contenu : langue d'affichage, choix de la traduction, échappement. */
import { I18N } from "./i18n.js";

/** langue du contenu : fr, en, de ou orig ; l'interface suit I18N.lang */
export let LANG = I18N.lang;
export function setLang(l){ LANG = l; }
export const tr = I18N.t;

/** texte d'un champ multilingue {fr, en, de, orig, draft} dans la langue d'affichage */
export function txt(lt){
  if (!lt) return "";
  if (typeof lt === "string") return lt;
  if (LANG === "orig" && lt.orig && lt[lt.orig]) return lt[lt.orig];
  for (const k of [LANG, "fr", "en", "de", lt.orig]) if (k && lt[k]) return lt[k];
  for (const k in lt) if (k !== "orig" && k !== "draft" && typeof lt[k] === "string") return lt[k];
  return "";
}
export function esc(s){ return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
/** forme sans accents et en minuscules, pour la recherche */
export function norm(s){ return String(s).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase(); }
/** toutes les traductions d'un champ multilingue */
export function allTexts(lt){ if (!lt) return []; if (typeof lt === "string") return [lt]; return Object.entries(lt).filter(([k,v]) => k!=="orig" && k!=="draft" && typeof v==="string").map(([,v]) => v); }
