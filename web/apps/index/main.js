/* Accueil : présente et ouvre les viewers, choix de la langue */
import { I18N } from "../../core/i18n.js";

const nav = document.getElementById("lang");
// langue : ?l= ou #l= dans l'adresse, sinon la dernière choisie, sinon celle du navigateur
const q = new URLSearchParams(location.search + "&" + location.hash.slice(1)).get("l");
if (I18N.LANGS.includes(q)) I18N.set(q);

function render(){
  I18N.apply();
  for (const el of document.querySelectorAll("[data-i18n-alt]")) el.alt = I18N.t(el.dataset.i18nAlt);
  document.title = I18N.t("home.title");
  document.querySelector('meta[name="description"]').content = I18N.t("m.desc");
  nav.innerHTML = I18N.LANGS.map(l => `<button type="button" lang="${l}" data-l="${l}" aria-pressed="${l === I18N.lang}" title="${I18N.NAMES[l]}">${l.toUpperCase()}</button>`).join("");
  // la langue suit le lecteur vers les viewers (mémorisée, et dans l'adresse quand elle diffère du navigateur)
  const nl = (navigator.languages && navigator.languages[0] || navigator.language || "fr").slice(0, 2).toLowerCase();
  const suffix = I18N.lang !== nl ? "#l=" + I18N.lang : "";
  document.getElementById("go-desktop").href = "desktop.html" + suffix;
  document.getElementById("go-mobile").href = "mobile.html" + suffix;
}
nav.addEventListener("click", e => {
  const b = e.target.closest("[data-l]"); if (!b) return;
  I18N.set(b.dataset.l); I18N.remember(b.dataset.l); render();
});

// appareil tactile à petit écran : la version mobile est mise en avant (et placée en premier)
const phone = matchMedia("(pointer: coarse) and (max-width: 820px)").matches;
const reco = document.getElementById(phone ? "go-mobile" : "go-desktop");
reco.classList.add("is-reco");
if (phone) reco.parentNode.prepend(reco);

render();
