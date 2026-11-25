/* Familles de types d'évènements (forme, poids), couleurs des liens et palette des timelines.
   Libellés : core/i18n.js (I18N.type, I18N.fam, I18N.link). */
export const FAMILIES = [
  {id:"struggle", shape:"triUp", w:6, types:["revolution","insurrection","strike","demonstration","mutiny"]},
  {id:"violence", shape:"diamond", w:5, types:["war","battle","massacre","repression","genocide","coup","assassination"]},
  {id:"crisis", shape:"triDown", w:4, types:["crisis","monetary","epidemic","famine","disaster"]},
  {id:"state", shape:"square", w:3, types:["election","vote","law","treaty","government","independence","unification","ban","trial"]},
  {id:"org", shape:"circle", w:3, types:["congress","conference","founding","split","merger","publication","speech"]},
  {id:"life", shape:"ring", w:2, types:["birth","death","arrest","exile","release"]},
  {id:"culture", shape:"star", w:2, types:["discovery","invention","premiere","artwork","exhibition","festival","competition"]},
  {id:"other", shape:"dot", w:1, types:["other","era","period"]},
];
export const FAM_OF = {}; FAMILIES.forEach(f => f.types.forEach(t => FAM_OF[t] = f));
export const LINK_COLORS = {leads_to:"#1f4e8c", causes:"#b3261e", reaction_to:"#8b1e3f", influences:"#2e6f40",
  continues:"#4a4e69", opposes:"#c25e00", references:"#7a5c3e", comparable_to:"#8e5c9e"};
export const PALETTE = ["#b3261e","#1f6f8b","#4a4e69","#b8860b","#2e6f40","#8e5c9e","#c25e00","#3a5fa0"];
