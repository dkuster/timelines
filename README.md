# timeline-db

Base de timelines historiques au format JSON : événements, périodes et timelines imbriquées, avec personnes, lieux, organisations, œuvres, idées, sources, liens, médias et notes.

- Spécification : https://claude.ai/artifact/VKqcPRot8LY14MDF5ZLNbB (exportable en Markdown sous `SPEC.md`)
- Idées (courants, théories, concepts, stratégies, mots d'ordre) et leurs jalons : `specs/ideas.md`
- Schémas : `schema/*.schema.json`, référencés par la clé `$schema` de chaque fichier de `data/` (validation et autocomplétion dans VS Code)
- Outil : `tools/tldb.py`
- Skill de génération pour Claude : `tools/skill/SKILL.md` (copie versionnée)

## Installation de l'outil

Python 3.9 ou plus récent, puis :

```
py -m pip install "jsonschema>=4.18" pyyaml
```

## Commandes

Depuis la racine du dossier :

```
py tools\tldb.py validate                 vérifier toute la base
py tools\tldb.py validate --quiet         erreurs seulement
py tools\tldb.py format                   remettre les fichiers au format canonique
py tools\tldb.py format --check           signaler sans modifier
py tools\tldb.py index --grep lenin       chercher une entité (id, titres, noms, alias)
py tools\tldb.py index --collection persons
py tools\tldb.py index --collection ideas
py tools\tldb.py tree                     arbre de toutes les racines
py tools\tldb.py tree russia --depth 2    sous-arbre limité
py tools\tldb.py scope germany            ce que la timeline germany importe des autres, et pourquoi
py tools\tldb.py scope --excluded         ce que la règle d'appartenance écarte (pour trier shared / deep)
py tools\tldb.py related russia 1917-11   secondaires que le mode automatique du mobile proposerait, et pourquoi
py tools\tldb.py related --gaps           décennies où aucune timeline n'est liée (liens à ajouter)
```

`validate` renvoie le code 1 s'il y a des erreurs : utilisable en hook de pré-commit.

## Appartenance aux timelines

Chaque fichier de `data/nodes/` porte une timeline, celle de sa racine. Un enfant c d'un nœud p présent dans une
timeline T y figure si c appartient à T, si p appartient à T (rattachement direct), si c porte `"shared": true`
(il suit son parent partout), ou sous un rattachement `"deep": true` (tout le sous-arbre est importé). Les descendants
d'un nœud venu d'une autre timeline ne suivent donc pas d'office : le front italien apparaît sous la Première Guerre
mondiale dans Monde, mais ni ses batailles ni lui-même dans la timeline France. `validate` signale un nœud absent de
sa propre timeline et un fichier de nœuds qui n'a pas exactement une racine.

## Accueil

`viewer/index.html` : page d'accueil qui présente et ouvre les deux viewers (logo : `viewer/icons/Timeline.jpg`).
Elle met en avant la version mobile sur un téléphone, la frise ailleurs, et propose FR / EN / DE ; la langue choisie
y est mémorisée dans le navigateur et reprise par la frise et le mobile.

## Visualiseur (frise)

```
py tools\build_viewer.py                regroupe data/ dans viewer/data.js
```

Puis ouvrir `viewer/index.html` (accueil) ou directement `viewer/desktop.html` (frise) par double-clic (aucun serveur ni connexion requis, sauf pour les images distantes).
Relancer `build_viewer.py` après chaque modification de la base. L'état de la vue (période, lignes, filtre, sélection)
est conservé dans l'adresse de la page : un lien copié rouvre la même vue.

Langues : le contenu s'affiche en FR, EN, DE ou dans la langue originale ; l'interface (boutons, aide, types,
familles, liens, mois) suit la langue choisie grâce aux tables de `viewer/i18n.js`, partagées par l'accueil et les deux viewers.
En mode « original », l'interface garde la dernière langue choisie. Langue par défaut : la dernière choisie sur
l'une des trois pages (mémorisée dans le navigateur), sinon celle du navigateur.
Pour ajouter une langue d'interface : copier le bloc `fr` de chaque table de `i18n.js`, traduire, ajouter le code à
`LANGS` et `LOCALES`. `I18N.missing()` dans la console liste les clés non traduites.
Les notes de `notes/` sont embarquées (en-tête et texte) et s'affichent dans le panneau de détail de chaque
évènement ou entité cité dans leur champ `about` ; l'infobulle de survol signale les évènements qui en ont.

## Viewer mobile

`viewer/mobile.html` : consultation sur téléphone tenu verticalement (spécification : `specs/viewer-mobile.md`).
En mode automatique (§ 16 de la spécification), on ne choisit que la timeline principale ; les secondaires sont choisies
d'après les liens, personnes et organisations partagés avec ce qui est à l'écran. Le champ `view.kind` des racines
(`theme` pour un courant, `global` pour Monde, `region` par défaut) permet d'inclure ou d'exclure les timelines thématiques.
`build_viewer.py` produit aussi `viewer/data-mobile.js` (sans les notes de vérification ni les éléments désactivés)
et met à jour la version de `viewer/sw.js`, pour que les téléphones récupèrent les nouvelles données.

En local, `mobile.html` s'ouvre par double-clic (mode téléphone des outils de développement du navigateur pour l'essayer).
L'installation comme appli et le hors-ligne ne fonctionnent qu'une fois la page publiée en HTTPS.

## Publication

Le site complet (accueil, frise, mobile) est publié sous https://dkinformatique.ch/timeline/ avec

```
py tools\publish.py                 build_viewer.py puis envoi FTP des fichiers modifiés
py tools\publish.py --dry-run       ce qui serait envoyé, sans connexion
py tools\publish.py --check         tester la connexion et la réponse du site
py tools\publish.py --all           tout renvoyer
py tools\publish.py --prune         supprimer aussi en ligne les fichiers disparus localement
py tools\publish.py --list          lister le contenu distant
```

Tout le dossier `viewer/` part (sauf ce que liste `EXCLUDE` en tête de `publish.py`), ainsi que `media/` :
la frise en ligne lit `data.js`, la base complète avec les notes, et le mobile `data-mobile.js`.
`viewer/.htaccess` demande aux navigateurs de revalider pages et données à chaque visite (la frise n'a pas de
service worker et garderait sinon d'anciennes données en cache) et compresse les gros fichiers de données ;
si l'hébergeur le refuse (erreur 500), `publish.py` le retire aussitôt du serveur et le signale.

Paramètres de connexion : `specs/ftp.md` (server, user, password), ou les variables d'environnement
`TLDB_FTP_SERVER`, `TLDB_FTP_USER`, `TLDB_FTP_PASSWORD` qui les remplacent. FTPS chiffré si le serveur l'accepte.
Seuls les fichiers changés depuis la dernière publication partent (`tools/.publish-state.json`), chacun sous un nom
temporaire puis renommé : d'abord les données et ressources, puis les pages, et `sw.js` en dernier pour que les
téléphones ne voient la nouvelle version qu'une fois tout en place. Le script vérifie ensuite que le site répond.

À la main : copier tout le contenu de `viewer/` à la racine du site (y compris `.htaccess`, fichier caché), et
`media/` en `timeline/media/` quand il contiendra des fichiers locaux. Après chaque `build_viewer.py`, recopier au
moins `data.js`, `data-mobile.js` et `sw.js` (ce dernier en dernier).

## Arborescence

```
data/nodes/*.json      nœuds, un fichier par racine
data/<collection>.json persons, places, organizations, works, ideas, sources, links, media
notes/*.md             notes longues, en-tête YAML
rapports/*.md          rapports de tri et de revue
media/                 fichiers locaux (images, videos, audio, documents)
schema/                JSON Schema
tools/                 tldb.py, build_viewer.py et la skill
viewer/                index.html (accueil), desktop.html (frise), mobile.html (téléphone), i18n.js (traductions),
                       data.js et data-mobile.js (générés), sw.js, manifest, icônes, .htaccess (en-têtes du site)
```
