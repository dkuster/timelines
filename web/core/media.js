/* Médias : images d'une entité, adresse des fichiers locaux, portrait principal. */
import { span } from "./dates.js";
import { MEDIA_ABOUT } from "./model.js";

/** images liées à une référence, dans l'ordre chronologique (sans date : à la fin) */
export function imagesOf(ref){
  const t = m => m.date ? span(m.date)[0] : 1e9;
  return (MEDIA_ABOUT.get(ref) || []).filter(m => m.kind === "image" && (m.url || m.file)).sort((a,b) => t(a) - t(b));
}
/** fichiers locaux : media/ à côté des pages (copié par le build) ; file = other/… ou video/… */
export function mediaSrc(m){ return m.url || ("media/" + m.file); }
/** portrait principal d'une entité : primary, sinon le premier portrait */
export function primaryPortrait(ref){
  const ms = imagesOf(ref), ab = m => m.about.find(a => a.ref === ref) || {};
  return ms.find(m => ab(m).primary) || ms.find(m => ab(m).role === "portrait") || null;
}
