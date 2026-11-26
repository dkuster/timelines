# Timelines

Base de timelines historiques des mouvements sociaux, politiques et révolutionnaires depuis 1789, et les pages qui
permettent de la consulter : frise de bureau, viewer mobile, carte dans le temps.

Site publié : https://dkuster.github.io/timelines/ (reconstruit à chaque push sur `main`).

- Spécification du format : https://claude.ai/artifact/VKqcPRot8LY14MDF5ZLNbB (exportable en Markdown sous `SPEC.md`)
- Organisation du dépôt et choix d'architecture : [`docs/architecture.md`](docs/architecture.md)
- Idées (courants, théories, concepts, stratégies, mots d'ordre) : [`docs/specs/ideas.md`](docs/specs/ideas.md)
- Viewer mobile : [`docs/specs/viewer-mobile.md`](docs/specs/viewer-mobile.md)
- Skill de génération pour Claude : [`docs/skill/SKILL.md`](docs/skill/SKILL.md) (copie versionnée)
- Veille mensuelle (nouveaux évènements, curseur `veille/watch.json`) : [`docs/veille.md`](docs/veille.md)

## Discussions

Vous pouvez participer à son développement, faire des remarques ou des suggestions, pour cela rejoignez le groupe Telegram https://t.me/+EaGghQtukBFlOWU0

## Arborescence

```
data/nodes/*.json        nœuds, un fichier par timeline racine
data/<collection>.json   persons, places, organizations, works, ideas, sources, links, media
veille/watch.json        curseur de la veille mensuelle (docs/veille.md)
notes/*.md               notes longues (en-tête YAML) ; tag « verification » : points à vérifier
media/other/             images, audio, documents locaux ; media/video/ : vidéos (branchable ailleurs plus tard)
schema/                  JSON Schema, référencés par la clé $schema de chaque fichier de data/
tldb/                    outil Python : validation, formatage, requêtes, build du site
tests/                   tests pytest
web/core/                code JavaScript commun aux pages (dates, textes, i18n, index de la base, médias, canvas)
web/ui/                  fragments HTML communs (fiches)
web/apps/<page>/         une page par dossier : index (accueil), desktop (frise), mobile, map (carte)
web/public/              fichiers copiés tels quels : icônes, manifest, service worker, fonds de carte
web/prototypes/          prototypes autonomes (idées)
docs/                    architecture, spécifications, rapports, skill
dist/                    site construit (généré, non versionné)
```

## Installation

Python 3.9 ou plus récent et Node.js 18 ou plus récent, puis, à la racine du dépôt :

```
py -m pip install -r requirements.txt
npm install
```

## Commandes

Depuis la racine du dépôt (`python -m tldb` hors Windows) :

```
py -m tldb validate                 vérifier toute la base (code 1 s'il y a des erreurs)
py -m tldb validate --quiet         erreurs seulement
py -m tldb watch                    veille : timelines à mettre à jour ce mois-ci
py -m tldb format                   remettre les fichiers au format canonique
py -m tldb format --check           signaler sans modifier
py -m tldb index --grep lenin       chercher une entité (id, titres, noms, alias)
py -m tldb index --collection ideas
py -m tldb tree russia --depth 2    arbre d'une racine (sans argument : toutes)
py -m tldb scope germany            ce que la timeline germany importe des autres, et pourquoi
py -m tldb scope --excluded         ce que la règle d'appartenance écarte (pour trier shared / deep)
py -m tldb related russia 1917-11   secondaires que le mode automatique du mobile proposerait, et pourquoi
py -m tldb related --gaps           décennies où aucune timeline n'est liée (liens à ajouter)

py -m tldb build                    construire le site dans dist/
py -m tldb build --no-minify        idem, code lisible (débogage)
py -m tldb serve                    construire, servir sur http://localhost:8000 et reconstruire à chaque modification
py -m tldb basemaps --years 1900 1914 1920   régénérer les fonds de carte (Internet + npm install -g mapshaper)

py -m pytest                        tests
npm run lint                        vérification du code des pages
```

## Consulter la base en local

`py -m tldb build`, puis ouvrir `dist/index.html` (accueil), `dist/desktop.html` (frise), `dist/mobile.html` ou
`dist/map.html` par double-clic : aucun serveur ni connexion n'est nécessaire, sauf pour les images distantes.
Relancer le build après chaque modification de la base ou des pages, ou laisser tourner `py -m tldb serve`.
L'installation du mobile comme appli et le hors-ligne ne fonctionnent qu'en http(s) (`serve`, ou le site publié).

Le build écrit dans `dist/` :

- `data/base.js` : la base publiée (sans les éléments `disabled`), avec les lignes des viewers déjà calculées ;
- `data/notes.js` : les notes de vérification, chargées par la frise seulement ;
- `data/basemaps.js` : les fonds de carte ;
- `assets/<page>.js` : le code de chaque page, assemblé par esbuild depuis `web/` ;
- les pages, `media/`, les icônes, le manifest et le service worker (dont la version change à chaque build).

## Appartenance aux timelines

Chaque fichier de `data/nodes/` porte une timeline, celle de sa racine. Un enfant c d'un nœud p présent dans une
timeline T y figure si c appartient à T, si p appartient à T (rattachement direct), si c porte `"shared": true`
(il suit son parent partout), ou sous un rattachement `"deep": true` (tout le sous-arbre est importé). Les descendants
d'un nœud venu d'une autre timeline ne suivent donc pas d'office : le front italien apparaît sous la Première Guerre
mondiale dans Monde, mais ni ses batailles ni lui-même dans la timeline France. `validate` signale un nœud absent de
sa propre timeline et un fichier de nœuds qui n'a pas exactement une racine.

Cette règle est implémentée une seule fois, dans `tldb/scope.py` : le build en tire les lignes des viewers.

## Pages

- **Accueil** (`index.html`) : présente et ouvre les viewers ; met en avant le mobile sur un téléphone, la frise ailleurs ;
  propose FR / EN / DE, choix mémorisé dans le navigateur et repris par toutes les pages.
- **Frise** (`desktop.html`) : une ligne par timeline, zoom, fiches détaillées, liens, recherche, export PNG et vidéo.
  L'état de la vue est dans l'adresse : un lien copié rouvre la même vue.
- **Mobile** (`mobile.html`) : téléphone tenu verticalement, timeline principale et secondaires automatiques
  (spécification : `docs/specs/viewer-mobile.md`) ; installable et hors ligne une fois publié.
- **Carte** (`map.html`, prototype) : évènements sur des fonds aux frontières historiques, lus avec un curseur temporel.
- **Idées** (`ideas-proto.html`, prototype autonome) : courants, penseurs et œuvres.

Langues : le contenu s'affiche en FR, EN, DE ou dans la langue originale ; l'interface suit grâce aux tables de
`web/core/i18n.js`. Pour ajouter une langue d'interface : copier le bloc `fr` de chaque table, traduire, ajouter le
code à `LANGS` et `LOCALES`. `I18N.missing()` dans la console liste les clés non traduites.

## Publication

Le workflow `.github/workflows/site.yml` vérifie la base et le code à chaque push et pull request (validation, format,
tests, lint, build), puis publie `dist/` sur GitHub Pages à chaque push sur `main`. Première mise en place : dans les
réglages du dépôt sur GitHub, *Settings → Pages → Build and deployment → Source : GitHub Actions*.

Le dépôt est public : n'y mettre aucun secret (le fichier `.env`, s'il sert un jour, est ignoré par git).

## Licences

À préciser (code, données). Les fonds de carte dérivent de historical-basemaps (André Ourednik, GPL-3.0) et de
Natural Earth (domaine public).
