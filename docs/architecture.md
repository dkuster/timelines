# Architecture du dépôt

_Réorganisation du 25 novembre 2026 (passage du dossier kDrive `timeline-db` au dépôt git public `dkuster/timelines`)._

## Décisions

- **Dépôt git public** `github.com/dkuster/timelines`, cloné dans `C:\DEV\timelines`, hors kDrive (un `.git` synchronisé
  risque des conflits de verrous). Le dossier kDrive `timeline-db` reste une archive en lecture.
- **Publication sur GitHub Pages** par GitHub Actions ; la publication FTP sur dkinformatique.ch est abandonnée.
- **Médias** : `media/other/` (images, audio, documents) et `media/video/`, séparés pour pouvoir brancher plus tard
  les vidéos ailleurs (stockage externe). Le champ `file` des médias reste relatif à `media/` (`other/images/…`).
- **esbuild** assemble le code des pages : sources en modules ES dans `web/`, bundles IIFE dans `dist/assets/`,
  compatibles avec l'ouverture par double-clic (`file://`), où les modules ES ne se chargent pas.

## Principe directeur

Les règles métier sont calculées une seule fois, en Python, au build ; les viewers ne font qu'afficher.

Appliqué aujourd'hui à la règle d'appartenance des nœuds aux timelines (`shared` / `deep`) : `tldb/scope.py` calcule
les lignes des viewers (`lanes`), le build les écrit dans `data/base.js`, `web/core/model.js` les indexe. Avant, la règle
existait en Python, dans la frise et dans le mobile. Le résultat a été vérifié identique sur toute la base (41 lignes,
contenu, niveaux, conteneurs, couleurs, rangées).

## Organisation

```
data/  notes/  schema/  media/      source de vérité (format inchangé)
tldb/                               paquet Python, « py -m tldb <commande> »
  model.py      chargement de la base (collections, entités, notes)
  schemas.py    validation JSON Schema
  dates.py      dates partielles, calendrier julien, années décimales
  scope.py      appartenance aux timelines, lignes des viewers
  validate.py   contrôles sémantiques
  fmt.py        format canonique
  related.py    secondaires automatiques du mobile (diagnostic)
  build.py      build du site (dist/) et serveur local
  basemaps.py   fonds de carte hors ligne
  cli.py        commandes
tests/                              pytest : dates, appartenance, build, validité de la base réelle
web/core/                           JS commun : i18n, text, dates, families, model, media, canvas, data
web/ui/                             fragments HTML communs aux fiches
web/apps/<page>/                    index.html + main.js par page (index, desktop, mobile, map)
web/public/                         copié tel quel dans dist/ (icônes, manifest, sw.js, data/basemaps.js)
web/prototypes/                     prototypes autonomes, copiés dans dist/
docs/                               architecture, spécifications, rapports, copie de la skill
.github/workflows/site.yml          vérification + publication
```

## Données publiées (`dist/data/`)

| Fichier | Contenu | Chargé par |
|---|---|---|
| `base.js` | `window.TLDB` : `format_version`, `generated`, `nodes` (avec `_home`), collections, `notes` hors vérification, `lanes` | toutes les pages |
| `notes.js` | `window.TLDB_NOTES` : notes de vérification | frise |
| `basemaps.js` | `window.TLDB_BASEMAPS` : fonds de carte | carte |

Les éléments `disabled` sont retirés au build. Il n'y a plus de doublon `data.js` / `data-mobile.js` (4,9 Mo au lieu
de 5,1 + 4,7 Mo). Chargement par `<script>` (pas de `fetch`), pour le double-clic hors ligne.

Le découpage par timeline racine, avec chargement à la demande, est reporté : la frise et le mode automatique du
mobile ont besoin de toute la base, et le gain ne justifie pas encore la complexité. À reprendre si la base grossit
fortement.

`lanes` : `[{id, sub: [...], items: [[id du nœud, niveau, conteneur 0/1], ...]}]`, une entrée par racine, dans l'ordre
des fichiers ; `sub` contient les sous-lignes (era de la même timeline rattachées à la racine).

## Vérification de la refonte

Les pages construites ont été comparées aux pages d'avant (`old`) par captures d'écran Chrome et par l'état interne
(`window.__tl.dump()`) : lignes, index, recherche et scores des secondaires automatiques identiques ; captures identiques
au pixel près, sauf la date des données dans l'en-tête de la frise.

## Ce qui reste à faire

- **Fiches** : la frise et le mobile ont des fiches au rendu volontairement différent (dates courtes, liens filtrés…) ;
  seuls `link` et `crumbs` sont partagés (`web/ui/html.js`). Une fiche commune paramétrable reste possible.
- **Carte** : code encore autonome (sa propre table des familles, ses dates, sa règle de rattachement aux racines :
  racine du nœud et racines de ses parents directs) ; seules les traductions viennent de `core/i18n.js`. À aligner sur
  `core/` et sur les lignes du build quand elle sortira du prototype.
- **Secondaires automatiques** : la formule de score existe en JS (mobile, `autoScores`) et en Python
  (`py -m tldb related`, outil de diagnostic). L'appartenance est commune ; les poids doivent encore être modifiés aux
  deux endroits.
- **Prototype idées** : autonome, avec ses propres données embarquées ; à brancher sur `data/base.js`.
- **Licences** du code et des données à choisir.
