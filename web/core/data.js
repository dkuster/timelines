/* Chargement des fichiers de données produits par le build (dist/data/*.js).
   Par balise <script> et non par fetch : les pages fonctionnent aussi en file:// (double-clic). */
export function loadScript(src){
  return new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = src; s.onload = () => ok(); s.onerror = () => ko(new Error(src));
    document.head.appendChild(s);
  });
}
/** base publiée (window.TLDB), ou null si absente */
export async function loadBase(){
  if (!window.TLDB) try { await loadScript("data/base.js"); } catch(e){ return null; }
  return window.TLDB || null;
}
/** notes de vérification (frise seulement) ; [] si absentes */
export async function loadVerificationNotes(){
  if (!window.TLDB_NOTES) try { await loadScript("data/notes.js"); } catch(e){ return []; }
  return window.TLDB_NOTES || [];
}
