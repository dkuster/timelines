# Tri après l'introduction de `shared` et `deep` — 25 octobre 2026

**Statut : appliqué le 25 octobre 2026**, sections A à E. Validation : 0 erreur ; 56 avertissements, dont 6 nouveaux, tous des dates qui débordent du parent pour les rattachements de la section E (même type que ceux déjà acceptés).

## La règle

Chaque fichier de `data/nodes/` porte une timeline, celle de sa racine. Un enfant **c** d'un nœud **p** déjà présent dans une timeline **T** y figure si :

1. **c** appartient à T (même fichier) ;
2. **p** appartient à T : c'est un rattachement direct de c à T ;
3. **c** est `shared: true` : il suit son parent dans toutes les timelines où celui-ci apparaît ;
4. un rattachement `deep: true` a été traversé plus haut : tout le sous-arbre est importé dans la timeline de ce parent.

Autrement dit, on entre dans une autre timeline d'un seul pas explicite. Au-delà, seuls les nœuds `shared` suivent, sauf sous un rattachement `deep`.

L'ancien comportement importait tout le sous-arbre. La nouvelle règle écarte **172 apparitions** (un même nœud compte une fois par timeline). Ce rapport les trie toutes.

Pour revoir la liste à tout moment :

```
py tools\tldb.py scope --excluded           ce que la règle écarte, par timeline
py tools\tldb.py scope germany              ce que la timeline Allemagne importe, et pourquoi
```

## Synthèse

| Timeline | Ancien modèle | Règle seule | Après recommandations | Rétablis | Retraits voulus |
|---|---:|---:|---:|---:|---:|
| bolshevism | 72 | 39 | 72 | 33 | 0 |
| france | 361 | 331 | 341 | 10 | 20 |
| germany | 163 | 159 | 160 | 1 | 3 |
| ireland | 114 | 108 | 114 | 6 | 0 |
| russia | 441 | 423 | 427 | 4 | 14 |
| united-kingdom | 299 | 255 | 274 | 19 | 25 |
| united-states | 348 | 325 | 331 | 6 | 17 |
| world | 306 | 292 | 292 | 0 | 14 |
| italy, spain, switzerland | — | inchangé | inchangé | 0 | 0 |

Les recommandations n'ajoutent rien que l'ancien modèle n'affichait pas déjà : elles rétablissent seulement ce qui est pertinent. La section E, à part, propose des ajouts nouveaux.

## A. Marquer `shared: true` — 10 nœuds

Ce sont des événements d'importance générale, qui doivent suivre leur guerre ou leur crise partout où elle apparaît.

| Nœud | Origine | Rétabli dans | Pourquoi |
|---|---|---|---|
| `1854-siege-of-sevastopol` — Siège de Sébastopol | world | russia, united-kingdom | Cœur de la guerre de Crimée pour les deux belligérants. |
| `1856-treaty-of-paris` — Traité de Paris | russia | united-kingdom | Clôt la guerre de Crimée ; il doit suivre la guerre. |
| `1873-vienna-stock-crash` — Krach de Vienne | world | united-kingdom | Déclencheur de la Longue Dépression. |
| `1941-holocaust` — Shoah | world | france, russia, united-kingdom, united-states | Fait majeur de la Seconde Guerre mondiale ; ses épisodes nationaux (Vél d'Hiv, Babi Yar, ghetto de Rome) réapparaissent alors chacun dans sa propre timeline. |
| `1942-wannsee-conference` — Conférence de Wannsee | world | germany, france, russia, united-kingdom, united-states | Organisation de la « solution finale » : elle suit la Shoah, y compris en Allemagne, où elle manquait. |
| `1941-operation-barbarossa` — Invasion de l'URSS | germany | france, united-kingdom, united-states | Tournant de la guerre mondiale. |
| `1942-battle-of-stalingrad` — Bataille de Stalingrad | germany | france, united-kingdom, united-states | Idem. |
| `1945-unconditional-surrender` — Capitulation sans condition | germany | france, united-kingdom, united-states | Fin de la guerre en Europe. |
| `1945-hiroshima-nagasaki` — Hiroshima et Nagasaki | world | france, russia, united-kingdom | Fin de la guerre et ouverture de l'ère nucléaire. |
| `2008-lehman-brothers-bankruptcy` — Faillite de Lehman Brothers | world | united-kingdom | Déclencheur de la crise mondiale de 2008. |

## B. Poser `deep: true` sur un rattachement — 6 rattachements

Ces timelines veulent un sous-arbre entier venu d'ailleurs. Le drapeau se pose dans `parents` du nœud importé, sur l'entrée qui pointe vers la timeline d'accueil.

| Nœud importé | Rattachement à marquer `deep` | Rétablis | Pourquoi |
|---|---|---:|---|
| `1905-russian-revolution` | `1905-first-revolution-period` (bolshevism) | 24 | Le livre d'Alan Woods suit 1905 en détail : soviet de Pétersbourg, Potemkine, Doumas, Stolypine. Tsushima et Portsmouth viennent avec, ce qui reste cohérent. |
| `1917-february-revolution` | `1917-revolution-year` (bolshevism) | 6 | Journée des femmes, soviet de Petrograd, prikaz n° 1, gouvernement provisoire : la trame du livre. |
| `1917-second-congress-of-soviets` | `1917-revolution-year` (bolshevism) | 2 | Décrets sur la paix et sur la terre. |
| `1917-seizure-of-power` | `1917-revolution-year` (bolshevism) | 1 | Prise du palais d'Hiver. |
| `1968-northern-ireland-troubles` | `ireland` (racine) | 6 | Marche de Derry, Bogside, internement, Bloody Sunday, grève de l'UWC, grève de la faim de 1981 : tous centraux pour l'Irlande, mais rangés dans le fichier Royaume-Uni. |
| `1919-irish-war-of-independence` | `1918-post-war-upsurge-and-general-strike` (united-kingdom) | 6 | Bloody Sunday de Dublin, incendie de Cork, mort de MacSwiney : la répression britannique relève aussi de la timeline Royaume-Uni. Le soviet de Limerick et la grève des munitions viennent avec. |

## C. Rattacher explicitement — 8 rattachements

Ces nœuds concernent une timeline précise, pas toutes celles de leur guerre.

| Nœud | Ajouter dans `parents` | Timeline | Pourquoi |
|---|---|---|---|
| `1796-napoleons-italian-campaign` — Campagne d'Italie de Bonaparte | `1789-french-revolution` | france | Campagne française par excellence ; tremplin de Bonaparte. |
| `1805-battle-of-trafalgar` — Trafalgar | `1799-consulate-and-empire` | france | Bataille franco-britannique avant tout. |
| `1805-battle-of-trafalgar` | `1789-wars-against-revolution-and-repression` | united-kingdom | Idem. |
| `1808-peninsular-war` — Guerre d'indépendance espagnole | `1799-consulate-and-empire` | france | Guerre française ; ses batailles restent espagnoles (voir D). |
| `1808-peninsular-war` | `1789-wars-against-revolution-and-repression` | united-kingdom | Campagne de Wellington. |
| `1812-french-invasion-of-russia` — Campagne de Russie | `1799-consulate-and-empire` | france | Désastre décisif de l'Empire ; la Moskova et Moscou restent russes. |
| `1943-allied-invasion-of-sicily` — Débarquement en Sicile | `1939-second-world-war-and-coalition` | united-kingdom | Opération anglo-américaine, qui provoque la chute de Mussolini. |
| `1943-allied-invasion-of-sicily` | `1929-depression-new-deal-and-second-world-war` | united-states | Idem. |

## D. Retraits voulus — 93 apparitions

Ces nœuds ne doivent plus apparaître dans les timelines indiquées. Leur conteneur, guerre ou période, y reste visible.

**Guerres napoléoniennes**
- Dos de Mayo, Bailén, second siège de Saragosse, Vitoria (espagnols) — retirés de france, united-kingdom, world. La guerre d'Espagne y reste comme barre (voir C).
- La Moskova, prise et incendie de Moscou (russes) — retirés de france, united-kingdom, world. La campagne de Russie reste en France (voir C).
- Campagne d'Italie de Bonaparte, campagne de Russie — retirées de united-kingdom.

**Guerre de Crimée**
- Le Piémont dans la guerre de Crimée — retiré de russia, united-kingdom ; reste en Italie et dans Monde.

**Première Guerre mondiale**
- Front italien — retiré de france, russia, united-kingdom, united-states ; reste en Italie et dans Monde.
- Isonzo, Caporetto, Piave, Vittorio Veneto — retirés de france, russia, united-kingdom, united-states, world. C'est le cas qui a lancé la réforme. Dans Monde, le front italien suffit.
- Proclamation de la République irlandaise — retirée de united-kingdom, où l'insurrection de Pâques reste visible.

**Entre-deux-guerres**
- Le Royaume-Uni abandonne l'étalon-or — retiré de united-states ; reste au Royaume-Uni et dans Monde.
- Création de l'IRI — retirée de united-states.

**Seconde Guerre mondiale**
- L'Italie dans la Seconde Guerre mondiale — retirée de france, russia, united-kingdom, united-states.
- Invasion de la Grèce, perte de l'Afrique orientale, désastre de l'ARMIR — retirés de france, russia, united-kingdom, united-states, world. Option : rattacher l'ARMIR à `1941-great-patriotic-war`, puisqu'il est écrasé lors de la contre-offensive soviétique sur le Don.
- Débarquement en Sicile — retiré de france, russia, world. Il reste en Italie et passe au Royaume-Uni et aux États-Unis (voir C).
- Républicains espagnols à Mauthausen — retiré de france, russia, united-kingdom, united-states. Option : rattacher à `1939-defeat-vichy-and-resistance`, car la plupart avaient été capturés en 1940 dans les compagnies de travailleurs étrangers de l'armée française.
- Babi Yar, Vél d'Hiv, ghetto de Rome — retirés des timelines étrangères. Chacun reste dans la sienne (Russie, France, Italie) sous la Shoah devenue `shared`.
- Invasion soviétique de la Mandchourie — retirée de france, united-kingdom, united-states ; reste en Russie et dans Monde.

**Période récente**
- Grèves pour la sécurité face au Covid (italiennes) — retirées de united-kingdom, united-states.

## E. Absences préexistantes — hors tri

Ces manques existaient déjà avant la réforme ; ils concernent les grandes guerres elles-mêmes. Les avertissements de dates qu'ils produisent sont du même type que ceux déjà acceptés pour la France, le Royaume-Uni et la Russie.

| Ajouter dans `parents` de | Parent | Timeline | Effet |
|---|---|---|---|
| `1914-first-world-war` | `1914-war-and-revolutionary-opposition` | germany | La guerre manquait en Allemagne (ta remarque de départ). |
| `1914-first-world-war` | `1915-great-war` | italy | La guerre manquait en Italie. |
| `1939-second-world-war` | `1933-third-reich` | germany | Elle manquait en Allemagne ; Hiroshima suit (shared). |
| `1939-second-world-war` | `italy` (racine, car la guerre couvre deux périodes italiennes) | italy | Elle manquait en Italie ; Barbarossa, Stalingrad, Shoah, Wannsee, capitulation et Hiroshima suivent (shared). |
| `1853-crimean-war` | `1851-second-empire` | france | La France, belligérante principale, n'avait pas la guerre ; Sébastopol et le traité de Paris suivent (shared). |
| `1803-napoleonic-wars` | `1789-autocracy-napoleonic-wars-and-decembrists` | russia | La guerre manquait en Russie. |
| `1803-napoleonic-wars` | `1789-french-revolution-to-march-revolution` | germany | Idem en Allemagne. |
| `1803-napoleonic-wars` | `1789-jacobin-and-napoleonic-italy` | italy | Idem en Italie. |
| `1803-napoleonic-wars` | `spain` (racine) | spain | Idem en Espagne. |
