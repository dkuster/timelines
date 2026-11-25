# Spécification du viewer mobile

_Version 1.1, 30 octobre 2026 (v1.0 du 26 octobre ; ajouts : mode automatique des secondaires, § 16, et liens hors de la loupe, § 17). Base au moment de la rédaction : 12 racines, 6 sous-timelines (Monde), 2 665 nœuds, 1 009 personnes, 321 liens, 15 médias, 182 notes._

Le viewer mobile est une application HTML pour consulter une ou plusieurs timelines, optimisée pour le téléphone tenu verticalement. Il complète le viewer de bureau (`viewer/desktop.html`, ex-`index.html`) sans le remplacer : il lit les mêmes données (`viewer/data.js`) et reprend les mêmes règles d'appartenance aux timelines.

## 1. Décisions prises

| Sujet | Décision |
|---|---|
| Échelle du temps | Linéaire (une année a partout la même hauteur à un zoom donné) ; les évènements trop serrés se regroupent |
| Icônes | 5 icônes permanentes sur le bord droit + un menu ⋯ pour les autres options |
| Diffusion | Publié en ligne sur un hébergement statique, installable comme une appli (PWA) et utilisable ensuite hors ligne |
| Mode ambiance | Reporté en v2 (décrit au § 11 pour ne pas bloquer le modèle de données) |

## 2. Périmètre

**v1** : choix des timelines, mode timeline (colonne principale, deux colonnes secondaires, bande des périodes, loupe), mode détail, recherche, filtres par famille, défilement automatique, reset, densité du texte, langue, partage d'un lien vers la vue, fonctionnement hors ligne.

**v1.1** : mode automatique des secondaires (§ 16), liens vers des évènements hors de la loupe ou de l'écran (§ 17).

**v2** : mode ambiance, export image et vidéo, filtre par importance (quand le classifieur existera), parcours guidés.

**Hors périmètre** : l'édition des données (la base reste modifiée par fichiers JSON et `tldb.py`).

## 3. Notions

- **Timeline sélectionnable** : la même notion que les lignes du viewer de bureau, c'est-à-dire une racine (`france`, `russia`…) ou un nœud de type `era` qui a des enfants (`world-culture`, `world-wars`…). Le contenu d'une timeline suit les règles d'appartenance du README (rattachement direct, `shared`, `deep`).
- **Timeline principale** : celle au centre, affichée en détail, avec ses périodes.
- **Timelines secondaires** : 0, 1 ou 2, affichées à gauche puis à droite, avec moins de détail.
- **Période** : nœud de type `era` ou `period`, ou nœud contenant d'autres nœuds de la timeline principale. Les périodes ne sont pas dessinées comme des évènements : elles alimentent la bande des périodes et les rubans (§ 4.3).
- **Évènement** : tout autre nœud. Un évènement de plus de 6 mois (ou `ongoing`) se dessine comme une barre, sinon comme un point.
- **Famille** : regroupement des 48 types en 8 familles avec leur forme (luttes ▲, guerres et répression ◆, crises ▼, État ■, organisations ●, vies ○, culture ★, autres ·), identique au bureau.
- **Date de la loupe** : la date qui se trouve sur la ligne centrale de l'écran. C'est la référence de toute la vue : bande des périodes, changement de timeline et liens partagés la conservent.

## 4. Écran

### 4.1 Disposition (téléphone de 390 × 844 px, deux secondaires)

```
┌──────────────────────────────────────┐
│ Russie / URSS                        │  en-tête (56 px)
│ 1914 – 1924                          │
├──────────────────────────────────────┤
│ 1re Guerre mondiale, fin du tsarisme │  bande des périodes (36 px)
├─────┬───────────────────────┬─────┬──┤
│1924 │                       │     │☰ │  ☰ timelines
│  ·  │ ▲ Kronstadt           │  ◆  │  │
│     │ ● Xe congrès          │     │◎ │  ◎ loupe
│  ◆  │                       │  ·  │  │
│ ┌───┴───────────────────────┴───┐ │⌕ │  ⌕ recherche
│ │ 25 oct. 1917 (7 nov.)         │ │  │
│ │ ▲ Insurrection d'Octobre      │ │▶ │  ▶ défilement auto
│ │ Les gardes rouges prennent…   │ │  │
│ │ 👤 📷 🔗 📝 📚           1/3 ‹ ›│ │⚲ │  ⚲ filtres
│ └───┬───────────────────────┬───┘ │  │
│  ▼  │ ▲ Journées de juillet │ ★   │⋯ │  ⋯ menu
│     │ ▲ Février             │     │  │
│1914 │                       │     │  │
└─────┴───────────────────────┴─────┴──┘
 France    colonne principale   Monde  rail
 (64 px)                       (64 px) (44 px)
```

Sans secondaire, la colonne principale occupe toute la largeur disponible. Avec une seule secondaire, celle-ci se place à gauche.

### 4.2 En-tête

- Ligne 1 : nom de la timeline principale (`view.label`, sinon `title`), avec un point de sa couleur.
- Ligne 2 : la plage affichée, de la date du bas à celle du haut (« 1914 – 1924 », « mars – nov. 1917 » aux zooms fins).
- Un tap sur l'en-tête ouvre le sélecteur de timelines.

### 4.3 Périodes

La bande des périodes affiche, pour la timeline principale seulement, la chaîne des périodes qui contiennent la date de la loupe, de la plus large à la plus fine, sans la racine déjà nommée dans l'en-tête : « Première Guerre mondiale et chute du tsarisme », puis « … › Grande Retraite » si une sous-période la contient. Quand une période est trop longue pour la largeur, seule la plus fine reste visible et le reste se coupe à gauche. Un tap ouvre la fiche de la période en mode détail. Quand la loupe passe d'une période à une autre, le texte change en fondu.

Les étendues des périodes apparaissent en plus comme de fins rubans colorés (4 px par niveau, 3 niveaux au plus) le long du bord gauche de la colonne principale. C'est ce qui montre où une période commence et où elle finit.

L'option « Périodes » du menu masque à la fois la bande et les rubans.

### 4.4 Colonne principale

- Le temps va de bas en haut : le plus récent en haut. Défiler vers le bas, c'est remonter dans le passé.
- Graduations horizontales discrètes, avec les années (ou les mois) écrites au bord gauche des colonnes. Leur pas s'adapte au zoom.
- Chaque évènement occupe une ligne : la forme de sa famille sur un trait vertical à gauche, puis son titre. En densité « mini-description », s'y ajoutent les deux premières lignes du résumé (les résumés font 150 caractères en médiane, 250 au plus).
- Un évènement long se dessine comme une barre verticale entre son début et sa fin, avec le titre à son début.
- Un petit repère signale les évènements qui ont une note (comme l'infobulle du bureau).

### 4.5 Colonnes secondaires

- Dans la couleur de leur timeline, avec ses formes de famille. Sans titre, sauf à la hauteur de la loupe (§ 4.6).
- Le nom de la timeline est écrit verticalement en tête de colonne.
- Elles partagent l'échelle de la principale : une même hauteur, c'est une même date sur les trois colonnes.

### 4.6 Loupe

Bande rectangulaire fixe au centre vertical de l'écran (environ 150 px de haut), sur toute la largeur des colonnes.

**Cible** : l'évènement de la timeline principale le plus proche de la ligne centrale, dans une tolérance de 40 px. Quand aucun évènement n'est dans la tolérance, la loupe présente la période la plus fine qui contient la date (titre, dates, résumé), en style atténué.

**Magnétisme** : quand le défilement s'arrête et qu'un évènement est à moins de 40 px du centre, la vue glisse pour le centrer (250 ms).

**Contenu** de la mini-fiche :
- la date, avec la date d'origine pour le calendrier julien ou républicain (« 25 oct. 1917 (7 nov.) ») ;
- la forme et le titre (2 lignes au plus) ;
- le résumé sur 3 lignes, coupé au mot ;
- une rangée d'icônes pour ce que la fiche contient : personnes 👤, organisations, lieux, œuvres, médias 📷, liens 🔗, notes 📝, sources 📚, sous-évènements. L'icône bio s'allume quand une des personnes citées a une biographie.

**Regroupement** : quand plusieurs évènements se trouvent dans la tolérance (1917 compte 34 évènements pour la Russie), la loupe affiche « 1/3 » et deux boutons ‹ › pour passer de l'un à l'autre dans l'ordre chronologique. Il n'y a pas de swipe dans la loupe, il est réservé au changement de timeline.

**Lecture synchronique** : à la hauteur de la loupe, chaque colonne secondaire écrit le titre de son évènement le plus proche (2 lignes de 64 px, puis coupé). On voit ainsi ce qui se passait ailleurs au même moment.

**Interactions** : quand l'évènement sous la loupe a des liens (`links.json`) vers des évènements visibles dans une colonne secondaire, une courbe fine les relie, colorée par type de lien comme sur le bureau. Les liens vers des évènements contemporains ou hors de l'écran sont traités au § 17.

**Gestes** : un tap sur la loupe ouvre le mode détail. Une fois la loupe masquée, la bande centrale disparaît ; un tap sur un évènement ouvre alors directement son détail.

### 4.7 Rail d'icônes et menu

Le rail est fixé le long du bord droit, avec des cibles de 44 × 44 px. Quand une option est active, son icône est pleine ; les filtres affichent un badge avec le nombre de familles masquées.

| Rail | Menu ⋯ |
|---|---|
| ☰ Timelines | Reset |
| ◎ Loupe (afficher / masquer) | Périodes (afficher / masquer) |
| ⌕ Recherche | Densité : titres seuls / mini-description |
| ▶ Défilement auto / ■ arrêt | Langue : FR / EN / DE / originale |
| ⚲ Filtres | Thème : système / clair / sombre |
| ⋯ Menu | Partager cette vue |
| | Aide des gestes |
| | À propos (date de génération des données) |

## 5. Échelle et zoom

- L'échelle est linéaire et commune à toutes les colonnes. La plage visible va de 2 mois à 250 ans, entre 1770 et l'année en cours plus un an.
- Les titres sont placés par priorité, avec la même heuristique que le bureau (famille, nombre de liens, nombre de personnes). Un évènement qui n'a pas la place pour son titre reste un point. Quand plusieurs points tombent à moins de 6 px les uns des autres, ils fusionnent en un seul repère « +5 ». En zoomant (pinch ou loupe), on les sépare.
- Le zoom par pinch se fait autour du point entre les deux doigts. La plage dans l'en-tête se met à jour en direct.

## 6. Gestes

| Geste | Effet |
|---|---|
| Glisser verticalement | Défilement dans le temps, avec inertie, puis magnétisme de la loupe |
| Pinch vertical | Change la plage de dates (zoom) |
| Double tap | Zoom ×2 centré sur le point tapé |
| Swipe horizontal (dans la zone des colonnes, à plus de 24 px des bords) | Change la timeline mise en avant (§ 7) |
| Tap sur la loupe | Mode détail de l'évènement ciblé |
| Tap sur un évènement de la colonne principale | Le centre sous la loupe (ou ouvre son détail si la loupe est masquée) |
| Tap sur un point d'une colonne secondaire | Le centre sous la loupe, qui affiche sa mini-fiche aux couleurs de sa timeline ; un second tap ouvre le détail |
| Tap sur la bande des périodes | Fiche de la période |
| Retour système (bouton ou geste Android, swipe depuis le bord iOS) | Fiche précédente en mode détail, sinon retour au mode timeline ; aucun effet en mode timeline |

La marge de 24 px aux bords évite le conflit avec les gestes système de retour. Un geste horizontal n'est reconnu que si son déplacement horizontal est plus du double du vertical.

## 7. Changement de timeline mise en avant

Les timelines choisies forment un carrousel de 2 ou 3 positions (gauche, centre, droite). Un swipe vers la gauche amène la colonne de droite au centre, l'ancienne principale à gauche et l'ancienne gauche à droite ; un swipe vers la droite fait l'inverse. L'animation dure 300 ms, les colonnes changent de largeur et de niveau de détail.

La date de la loupe et la plage sont conservées. La bande des périodes passe à la nouvelle principale. La timeline choisie comme principale dans le sélecteur reste la **principale de référence**, celle que Reset ramène au centre.

## 8. Mode détail

Le contenu est celui du panneau de détail du bureau, mis en page en une colonne plein écran :
- **Évènement** : fil d'Ariane, titre et titre original, dates (calendrier julien), type et famille, statut (brouillon / relu), résumé, notes, médias, personnes, organisations, lieux, œuvres, liens justifiés, sous-évènements, mots-clés, sources, autres noms.
- **Personne** : portrait, noms, activité, naissance et décès avec lieux (nom d'époque) et âge, accroche, biographie, appartenances datées, galerie, sources, Wikidata.
- **Autres entités** : résumé, évènements liés, sources, Wikidata.

Navigation :
- Barre du haut fixe : ← retour, titre court, ‹ › évènement précédent ou suivant de la timeline principale (pour lire une timeline fiche par fiche), ✕ retour au mode timeline.
- Tout ce qui est cité est un lien vers sa fiche ; chaque ouverture empile une entrée dans l'historique du navigateur, pour que le retour système fonctionne.
- Le bouton « Voir sur la timeline » d'un évènement revient au mode timeline, l'évènement centré sous la loupe. Quand l'évènement n'appartient à aucune timeline sélectionnée, sa timeline devient la principale, à la place de l'actuelle, en gardant les secondaires.
- Images : vignettes, puis visionneuse plein écran (pinch pour zoomer, swipe pour passer à l'image suivante, légende, crédit, licence, lien vers la source).
- Le filtre par entité du bureau (« Isoler ») n'est pas repris en v1.

## 9. Options en détail

### 9.1 Sélecteur de timelines

Panneau montant depuis le bas qui liste les racines et leurs sous-timelines, en arbre repliable, avec leur couleur. On choisit une principale (●) et au plus deux secondaires (◐, numérotées 1 = gauche, 2 = droite). Valider applique le choix, la date de la loupe est conservée. Une même timeline ne peut pas avoir deux rôles. Un interrupteur en haut du panneau passe en mode automatique : on ne choisit plus que la principale (§ 16.7).

### 9.2 Recherche

Écran plein avec un champ en haut et le clavier ouvert. On cherche dans les titres, alias, noms complets et noms historiques, dans toutes les langues, sans tenir compte des accents (comme le bureau). Les résultats sont groupés : évènements, personnes, organisations, lieux, œuvres ; chacun indique sa date et sa timeline. Un tap ouvre la fiche en mode détail.

### 9.3 Défilement automatique

Le temps avance du plus ancien au plus récent : la vue monte, les évènements défilent sous la loupe. Trois vitesses, réglées par un appui long sur ▶ : 1, 3 ou 10 ans par seconde à la plage courante. Le défilement s'arrête au dernier évènement, au toucher de l'écran et à l'ouverture d'un panneau. L'écran reste allumé pendant le défilement (Wake Lock, quand le navigateur le permet).

### 9.4 Filtres

Panneau listant les 8 familles avec leur forme et un interrupteur, plus « tout afficher ». Les filtres s'appliquent à toutes les colonnes ; les périodes ne sont jamais filtrées.

### 9.5 Reset

- La principale de référence revient au centre, et les secondaires reprennent leur place.
- La plage couvre les 10 années qui finissent au dernier évènement de la principale.
- La loupe se place sur ce dernier évènement.
- Les filtres sont tous retirés. Loupe, densité, langue et thème ne changent pas.

### 9.6 Partager cette vue

Ouvre le partage natif (Web Share), sinon copie le lien. Le lien rouvre exactement la même vue (§ 10).

## 10. État de la vue

L'état est écrit dans l'adresse, comme sur le bureau, pour qu'un lien copié rouvre la même vue :

| Paramètre | Contenu |
|---|---|
| `m` | timeline principale de référence |
| `c` | ordre courant du carrousel (`france,russia,world-culture`) |
| `t` | plage (`1914.00,1924.00`) |
| `x` | familles masquées |
| `d` | densité (`t` titres, `m` mini-description) |
| `p` | `0` si périodes masquées |
| `o` | `0` si loupe masquée |
| `l` | langue si autre que FR |
| `v` | fiche ouverte en mode détail (`node:1871-bloody-week`, `person:lenin`) |
| `a`, `f` | mode automatique et secondaires fixées (§ 16.8) |

Le dernier état est aussi mémorisé sur l'appareil. Une ouverture sans paramètres reprend cet état ; au tout premier lancement, l'aide des gestes s'affiche puis le sélecteur s'ouvre.

## 11. Mode ambiance (v2)

Quand le mode est actif, le fond de l'écran affiche une image et/ou joue un son liés à la période la plus fine sous la loupe.
- **Données** : ajouter un rôle `ambiance` à l'énumération `media.about.role` et rattacher les médias choisis à des périodes (`node:...`). Il faudra des sons : enregistrements d'époque, chants, discours, sous licence libre ou dans le domaine public (Wikimedia Commons, archive.org).
- **Image** : plein écran derrière les colonnes, atténuée (opacité de 15 à 25 %, flou léger) pour que le texte reste lisible ; fondu de 1 s au changement de période.
- **Son** : en boucle, fondu à l'entrée et à la sortie, volume réduit. Les navigateurs mobiles exigent un geste de l'utilisateur avant de jouer un son : l'activation se fait donc depuis le menu. Le son se coupe en mode détail.
- **Option** : réglage par type (image, son), et coupure automatique pendant le défilement rapide.

## 12. Diffusion et technique

- **Fichiers** : `viewer/mobile.html`, `viewer/manifest.webmanifest`, `viewer/sw.js`, icônes d'application ; les données restent dans `viewer/data.js`. `build_viewer.py` les produit tous et inscrit la date de génération dans le service worker pour forcer la mise à jour du cache.
- **Code commun** : extraire de `desktop.html` vers `viewer/common.js` ce qui est partagé (dates et calendriers, textes multilingues, appartenance aux lignes, familles, fiches de détail, recherche), pour que les deux viewers ne divergent pas.
- **Rendu** : les colonnes et les rubans en canvas, comme sur le bureau. La loupe, les bandes, les panneaux et le mode détail en HTML, ce qui facilite l'accessibilité et la sélection du texte. Aucune dépendance externe.
- **Hors ligne** : le service worker met en cache la page et les données (3,9 Mo, 1,1 Mo compressé). Les images distantes ne s'affichent qu'en ligne, une vignette grise les remplace sinon. Les fichiers locaux de `media/` publiés avec le site sont mis en cache à la consultation.
- **Hébergement** : n'importe quel hébergement statique en HTTPS, ce qu'exigent la PWA et le partage natif (GitHub Pages, Netlify, ou l'hébergement web d'Infomaniak). Le site lui-même reste à choisir.
- **Cibles** : Safari iOS 16 ou plus, Chrome Android 110 ou plus ; écrans de 360 à 430 px de large. En paysage, la même disposition s'élargit, sans mise en page spécifique.
- **Performance** : 60 images par seconde au défilement et au pinch avec la base complète, sur un téléphone milieu de gamme de 2022 ; premier affichage en moins de 2 s quand les données sont en cache.
- **Ergonomie** : zones sûres (encoche, barre de geste) respectées, texte de 14 px au moins pour les titres de la principale, contraste AA, thème sombre suivant le système.

## 13. Critères d'acceptation

1. Je choisis France en principale, Monde-culture et Russie en secondaires : les trois colonnes s'affichent alignées dans le temps.
2. En faisant défiler 1871, la bande affiche « Guerre de 1870 et Commune de Paris » et la loupe s'arrête sur chaque évènement de la Commune ; à la même hauteur, les secondaires indiquent leur évènement contemporain.
3. Un swipe vers la gauche met Russie au centre sans changer la date de la loupe ; Reset remet France au centre sur ses 10 dernières années.
4. Sur la Russie en 1917, la loupe annonce un regroupement « 1/n » et ‹ › parcourt les évènements ; un pinch les sépare.
5. Un tap sur la loupe ouvre le détail, je navigue vers Lénine puis vers une organisation, et le retour système refait le chemin à l'envers jusqu'à la timeline, à la même position.
6. Un lien partagé rouvre sur un autre téléphone la même vue, avec la même fiche ouverte.
7. En mode avion, l'appli installée s'ouvre et fonctionne, sauf les images distantes.
8. Le geste de retour depuis le bord d'iOS ou d'Android ne déclenche jamais de changement de timeline.

## 14. Questions ouvertes

- **Contenu publié** : la version en ligne publie-t-elle les nœuds `draft` (avec leur badge « brouillon ») et les notes de vérification, ou seulement le contenu `final` ? Les nœuds `disabled` sont exclus dans tous les cas. **Réponse** : afficher tous les drafts avec le badge "brouillon", ne pas afficher les notes de vérification.
- **Hébergement** : quel service et quelle adresse ; le site doit-il être public ou protégé par un mot de passe ? **Réponse** : public pour l'instant, il sera publié sous https://dkinformatique.ch/timeline/mobile.html
- **Bande des périodes** : l'interprétation retenue (chaîne des périodes à la date de la loupe, plus des rubans sur le bord gauche) correspond-elle à l'intention ? **Réponse** : question toujours ouverte, il faudra voir à l'usage.

## 15. Implémentation v1 (26 octobre 2026)

Livrée dans `viewer/mobile.html`, avec `manifest.webmanifest`, `sw.js`, `icons/` et `data-mobile.js` (produit par `build_viewer.py`). Choix faits pendant la réalisation :

- **Reset** : la loupe est placée sur le dernier évènement de la principale, avec une plage de 10 ans centrée sur lui. La moitié haute montre donc l'avenir (zone grisée), ce qui est inévitable puisque la loupe est fixe au centre.
- **Monde** : choisir une racine qui a des sous-timelines (Monde) affiche aussi le contenu de ses sous-timelines, chacune dans sa couleur.
- **Vitesses du défilement automatique** : 1, 3 ou 10 ans par seconde pour une plage de 10 ans, proportionnelles au zoom.
- **Notes** : non affichées (réponse au § 14) ; le repère « note » du § 4.4 est donc absent.
- **Code commun** : pas encore extrait dans `viewer/common.js` (§ 12) ; les fonctions partagées sont recopiées depuis `desktop.html` (ex-`index.html`) ; les traductions de l'interface sont communes dans `viewer/i18n.js`.
- **Médias locaux** : lus dans `../media/` en local et dans `media/` une fois publiés.

## 16. Mode automatique des secondaires (v1.1)

_Ajouté le 30 octobre 2026. Les poids et seuils ont été essayés sur la base du jour (3 305 nœuds, 361 liens) ; ils restent à affiner à l'usage avec `tldb.py related` (§ 16.9)._

### 16.1 Principe

L'utilisateur ne choisit que la timeline principale ; les deux secondaires sont choisies par l'appli parmi les timelines qui ont le plus de rapports avec ce que montre l'écran. Le point d'entrée naturel est la recherche : on cherche un évènement, on ouvre sa fiche, « Voir sur la timeline » le centre sous la loupe dans sa timeline, et les secondaires montrent où il résonne ailleurs. Les secondaires se mettent ensuite à jour quand on se déplace dans le temps.

Le mode manuel du § 9.1 reste disponible ; le mode automatique est une option du sélecteur.

### 16.2 Nature des timelines

Nouveau champ `view.kind` sur les racines, dans `nodes.schema.json` :

| Valeur | Sens | Racines |
|---|---|---|
| `region` (défaut si absent) | pays ou région | france, russia, africa, latin-america… |
| `theme` | courant ou thème transversal | marxism, bolshevism, stalinism, trotskyism |
| `global` | évènements mondiaux | world |

`tldb.py validate` accepte le champ ; `build_viewer.py` le transmet aux deux viewers. Une nouvelle racine thématique doit recevoir `"kind": "theme"`, ce que la skill de génération rappellera.

### 16.3 Candidates

- Les candidates sont les racines, sauf la principale. Les sous-timelines de Monde ne sont pas candidates séparément : Monde, quand il est choisi, s'affiche avec ses sous-timelines comme au § 15.
- Les timelines `theme` ne sont candidates que si l'option « Inclure les timelines thématiques » est cochée (§ 16.7). Monde (`global`) est toujours candidat.
- La principale peut elle-même être une timeline thématique.

### 16.4 Calcul du score

Le calcul porte sur la **fenêtre** : la plage affichée, centrée sur la date de la loupe, élargie à 3 ans au moins. En deçà, presque aucune timeline ne passe le plancher (essai : Russie, novembre 1917, plage d'un an, aucune candidate), et les secondaires disparaîtraient à chaque zoom fin, par exemple après « Voir sur la timeline » sur une période courte comme la Commune. Pour chaque évènement e de la principale situé dans la fenêtre et non masqué par les filtres, et pour chaque candidate T :

1. **Liens explicites** (`links.json`) entre e et un nœud o qui appartient à T (et pas à la principale) : poids selon le type, multiplié par la proximité de o (point 4).

   | Type | Poids |
   |---|---|
   | `causes`, `leads_to`, `reaction_to`, `opposes` | 5 |
   | `influences`, `continues` | 4 |
   | `comparable_to` | 3 |
   | `references` | 2 |

2. **Entités partagées** : pour chaque personne, organisation, œuvre ou lieu cité par e, et cité aussi par au moins un nœud de T, on ajoute poids × rareté × proximité du nœud de T le plus proche. Poids : personnes 2, organisations 2, œuvres 1, lieux 0,5 (les capitales sont citées partout, en particulier par Monde). Rareté : 1 / log2(1 + n), n étant le nombre de nœuds qui citent l'entité ; une personne citée une seule fois ailleurs vaut 1, Marx (des centaines de citations) presque rien.
3. **Évènement commun** : e appartient aussi à T (rattachement à un parent de T, `shared`, `deep`) : 1. Faible à dessein : il n'apporte qu'un doublon dans l'autre colonne.
4. **Proximité** d'un nœud o : 1 si o tombe dans la fenêtre, puis décroissance linéaire jusqu'à 0 à une largeur de fenêtre au-delà de ses bords. Un lien vers 1871 compte pleinement quand on regarde 1866-1876, à moitié vers 1881, plus du tout en 1886.
5. **Plafond** : la contribution d'un évènement e à une candidate T est plafonnée à 6, pour qu'une poignée d'évènements très chargés ne décide pas seule.
6. **Position** : chaque contribution est multipliée par 1 au centre de la fenêtre, 0,5 à ses bords. Ce qui est sous la loupe pèse le plus.

Score(T) = somme sur les évènements de la fenêtre. Les scores croissent avec la plage ; seules comptent leurs valeurs relatives, plus un plancher de 1 en dessous duquel une candidate est ignorée (bruit).

L'index des signaux (pour chaque nœud : timelines liées, entités et leur rareté) est calculé au chargement des données. Le calcul d'une fenêtre ne parcourt que ses évènements : quelques millisecondes.

### 16.5 Stabilité

Les colonnes ne doivent pas changer à chaque cran de défilement.

- **Moment du calcul** : à l'arrêt du défilement (fin de l'inertie et du magnétisme), à la fin d'un pinch, après un changement de principale, de filtres ou de l'option thématique. Jamais pendant un glissé.
- **Défilement automatique** : nouveau calcul quand la période la plus fine de la bande change, et au plus toutes les 3 secondes.
- **Hystérésis** : une secondaire en place n'est remplacée que si une autre candidate obtient au moins 1,5 fois son score. Une secondaire qui tombe sous le plancher reste tant qu'aucune candidate ne la remplace.
- **Places** : une secondaire qui reste garde son côté ; une nouvelle prend la place libérée, la gauche d'abord.
- **Aucune candidate** : au premier calcul, Monde (sauf s'il est la principale) ; ensuite, les secondaires en place sont gardées.
- **Animation** : la colonne remplacée s'efface et la nouvelle apparaît en fondu (300 ms), avec son nom vertical.

### 16.6 Comprendre et fixer une secondaire

- Un tap sur le nom vertical d'une secondaire ouvre un panneau (feuille du bas, comme le sélecteur) : son statut (choisie automatiquement, fixée, ou choisie à la main), puis ses rapports avec la fenêtre, par catégorie avec leur nombre et les premiers noms (« Liens (1) Proclamation de l'Empire allemand », « Personnes (1) Marx »…).
- **Fixer cette colonne** (mode automatique seulement) : la colonne n'est plus remplacée (cadenas sous son nom) ; l'autre reste automatique. Le même interrupteur la libère.
- **Remplacer par** : les autres candidates avec leur score en barre courte, puis « Autres timelines » (score sous le plancher). Le choix remplace la colonne et, en mode automatique, la fixe. Le panneau sert aussi en mode manuel, pour remplacer une secondaire sans passer par le sélecteur.
- Une secondaire automatique se reconnaît à un petit « A » sous son nom vertical ; une secondaire fixée, au cadenas.

### 16.7 Activation

- **Sélecteur (§ 9.1)** : en haut du panneau, un interrupteur « Secondaires : manuelles / automatiques ». En automatique, on ne choisit que la principale ; la case « Inclure les timelines thématiques » apparaît, cochée par défaut.
- **Recherche et mode détail** : en mode automatique, « Voir sur la timeline » met toujours la timeline de l'évènement en principale (celle de son fichier), centre l'évènement sous la loupe et recalcule les secondaires. En mode manuel, la règle du § 8 ne change pas.
- **Swipe (§ 7)** : le carrousel fonctionne comme avant ; une fois la nouvelle principale au centre, l'ancienne principale reste en secondaire fixée temporairement (jusqu'au prochain déplacement dans le temps) et l'autre colonne est recalculée.
- **Reset (§ 9.5)** : ramène la principale de référence et recalcule ; les fixations sont levées.
- **Premier lancement** : le sélecteur s'ouvre en mode automatique.

### 16.8 État dans l'adresse

| Paramètre | Contenu |
|---|---|
| `a` | absent : manuel ; `1` : automatique avec thèmes ; `2` : automatique sans thèmes |
| `f` | secondaires fixées (`russia`) |

`c` continue d'indiquer les colonnes affichées : un lien partagé rouvre exactement les mêmes colonnes, même si les données ou les poids ont changé depuis ; le calcul automatique reprend au premier déplacement.

### 16.9 Outil de calibrage

`py tools\tldb.py related <timeline> <date> [--range 10] [--no-themes]` affiche les candidates et le détail de leur score (liens, personnes, organisations, lieux, évènements communs), avec la même formule que le viewer. `--gaps` liste, pour chaque timeline et chaque décennie, les fenêtres sans candidate au-dessus du plancher : ce sont les endroits où la base manque de liens entre timelines.

Essais du 30 octobre 2026 (plage de 10 ans, sans thèmes) :

| Principale, date de la loupe | Secondaires proposées |
|---|---|
| France, mai 1871 | Allemagne, Monde, Espagne |
| Russie, novembre 1917 | France, Suisse, Allemagne |
| Russie, novembre 1917, plage d'un an | Allemagne, Hongrie, Autriche |
| Allemagne, janvier 1919 | Russie, Hongrie, Autriche |
| Espagne, août 1936 | France, Monde, Italie |
| Chine, avril 1927 | Russie, Monde, Royaume-Uni |
| Irlande, avril 1916 | Royaume-Uni (rien d'autre au-dessus du plancher) |
| Amérique latine, 1959 | États-Unis, Monde |

Avec les thèmes, ceux-ci passent souvent en tête (Bolchevisme pour la Russie en 1917, Stalinisme pour l'Espagne en 1936), parce que beaucoup de personnes et d'organisations y sont partagées.

### 16.10 Critères d'acceptation

1. En mode automatique, je cherche « Commune de Paris », j'ouvre la fiche, « Voir sur la timeline » : France au centre, deux secondaires remplies, et le panneau de chaque secondaire dit pourquoi elle est là.
2. Je fais défiler doucement de 1871 à 1880 : les secondaires ne changent pas à chaque arrêt, seulement quand une autre timeline devient nettement plus pertinente, et une secondaire qui reste ne change pas de côté.
3. Je décoche « Inclure les timelines thématiques » : aucune timeline thématique n'apparaît en secondaire.
4. Je fixe une secondaire puis je me déplace de 50 ans : elle reste, l'autre change.
5. Un lien partagé avec `a=1` rouvre les mêmes colonnes ; le calcul reprend au premier déplacement.

## 17. Liens hors de la loupe (v1.1, tous modes)

_Ajouté le 30 octobre 2026._ En v1, une courbe n'est dessinée que si l'évènement lié est visible dans une colonne secondaire, hors de la bande de la loupe. Les liens vers un évènement hors de l'écran, ou contemporain (dans la bande), ne sont pas montrés. Or 66 % des liens entre timelines relient des évènements qui se chevauchent ou ont lieu la même année, et près d'un quart ont un écart de plus de trois ans.

**Principe** : les colonnes partagent toujours la même échelle. On ne décale jamais une colonne pour aligner un lien ; la pente de la courbe montre le délai entre les deux évènements.

- **Cible dans la bande de la loupe** : pas de courbe, mais une pastille de la couleur du type de lien devant la date que la secondaire affiche à la hauteur de la loupe (§ 4.6, lecture synchronique). Si l'évènement lié n'est pas celui dont la secondaire affiche le titre, son titre remplace celui-ci.
- **Cible visible hors de la bande** : courbe oblique, comme en v1.
- **Cible hors de l'écran** : une courbe pointillée va jusqu'au bord haut ou bas de la colonne secondaire ; une étiquette donne la direction, l'année et le début du titre (« ▲ 1893 Création des Tisserands… »). Elle est placée dans la colonne principale, contre la colonne secondaire, pour ne pas recouvrir le nom vertical. Plusieurs cibles du même côté dans la même colonne se regroupent (« ▼ 3 ») ; un tap déplie la liste.
- **Saut** : un tap sur l'étiquette fait glisser la vue (400 ms) jusqu'à la date de la cible, toutes colonnes ensemble, la plage restant la même. La cible est centrée sous la loupe avec sa mini-fiche aux couleurs de sa timeline (comme un tap sur un point d'une secondaire). Une pastille « ← 4 juin 1844 · Révolte des tisserands silésiens » apparaît en haut de la colonne principale, sous les étiquettes : un tap ramène à la date, la plage et la cible de départ. Elle disparaît après un déplacement de plus d'une plage ou un nouveau saut.
- **Mode automatique** : après un saut, les secondaires ne sont pas recalculées avant le prochain déplacement manuel, pour que la colonne de la cible reste à l'écran.
- Les liens restent présentés en entier, avec leur justification, dans le mode détail (§ 8).

## 18. Implémentation v1.1 (30 octobre 2026)

Livrée dans `viewer/mobile.html` et `viewer/i18n.js` (textes FR, EN, DE), avec `view.kind` dans `schema/nodes.schema.json` (`theme` sur marxism, bolshevism, stalinism et trotskyism, `global` sur world) et `tldb.py related`.

- **Même formule des deux côtés** : `autoScores()` dans `mobile.html` et `RelatedIndex.scores()` dans `tldb.py`. Un poids changé d'un côté doit l'être de l'autre ; les deux donnent les mêmes classements (France, mai 1871 : Allemagne 8,8, Monde 8,7, Italie 8,2 dans le viewer, 8,3 dans l'outil, l'écart venant des familles et des conteneurs comptés un peu différemment).
- **Coût** : 1 à 4 ms par calcul (Russie sur 10 ans, Monde sur 250 ans), fait seulement à l'arrêt du défilement.
- **Stabilité observée** : France, de 1871 à 1883 par pas d'un an sur une plage de 10 ans, thèmes inclus : trois changements de colonnes (1876, 1879, 1883).
- **Panneaux ouverts depuis la frise** : le fond assombri ignore les clics pendant 450 ms après l'ouverture, sans quoi le clic émulé qui suit un toucher refermait aussitôt le panneau.
- **Premier lancement** : le mode automatique est actif et le sélecteur s'ouvre avec l'interrupteur sur « Automatiques ». Un ancien état mémorisé sur l'appareil, sans `a`, garde le mode manuel.
- `tldb.py related --gaps --no-themes` relevait le 30 octobre 116 décennies sans aucune candidate (Suisse et Irlande 13 chacune, Allemagne, Hongrie et Espagne 11 chacune) : ce sont les endroits où ajouter des liens entre pays rendra le mode automatique le plus utile.
