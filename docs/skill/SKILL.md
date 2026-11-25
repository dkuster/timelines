---
name: "timeline-db"
description: "Générer, compléter ou corriger des timelines historiques dans la base JSON de Dom (dépôt git timelines). À utiliser pour créer une timeline, ajouter des événements, des entités ou des idées (courants, théories, mots d'ordre), ou vérifier la base."
---

# Base de timelines : génération et édition

La base est le dépôt git public `dkuster/timelines` (https://github.com/dkuster/timelines), cloné sur l'ordinateur de Dom (Windows) dans `C:\DEV\timelines`. Sa racine contient `data/`, `notes/`, `media/`, `schema/`, le paquet Python `tldb/`, `web/` (sources des pages), `docs/` et `README.md`. L'ancien dossier kDrive `timeline-db` n'est plus qu'une archive : ne jamais y écrire.

- La spécification lisible est le document « Base de timelines — spécification du format JSON » (https://claude.ai/artifact/VKqcPRot8LY14MDF5ZLNbB), parfois exporté en `SPEC.md` à la racine. En cas de doute sur le sens d'un champ, c'est elle qui fait foi.
- `schema/*.schema.json` fait foi pour la structure et les valeurs autorisées.
- `py -m tldb …`, lancé depuis la racine du dépôt, valide, formate et interroge la base ; `py -m tldb build` construit le site dans `dist/` (organisation du dépôt : `docs/architecture.md`).

## 1. Accéder à la base

1. Repérer le dossier parmi les dossiers connectés à la session (racine reconnaissable à `tldb/__main__.py`). S'il n'est pas connecté, demander à Dom de connecter le dossier `C:\DEV\timelines` depuis l'app de bureau. Ne jamais recréer une base vide à la place.
2. Si un shell sur son ordinateur est disponible, travailler directement dans le dossier : `py -m tldb …` (ou `python -m tldb …`). Il faut Python 3.9+ avec `jsonschema>=4.18` et `pyyaml` (`py -m pip install -r requirements.txt`). S'ils manquent, le dire à Dom plutôt que les installer d'office.
3. Sinon, copier `data/`, `notes/`, `schema/` et `tldb/` dans l'espace de travail, y exécuter `python3 -m tldb …` depuis la racine de la copie (avec `--no-media-files` pour `validate`), puis réécrire dans le dossier de Dom uniquement les fichiers modifiés.
4. Ne modifier que `data/` et `notes/` (le schéma et la spécification seulement si Dom le demande). Ne pas committer ni pousser sans que Dom le demande : un push sur `main` republie le site public. Ne jamais supprimer de fichier ni d'entité : une entité écartée passe en `disabled`, et seulement si Dom le demande.

## 2. Faire l'inventaire avant d'écrire

- `py -m tldb tree --depth 2` : voir les racines et les grandes périodes existantes.
- `py -m tldb index --grep <texte>` pour **chaque** personne, lieu, organisation, œuvre et source mentionnés. Chercher aussi les variantes (Lénine, Lenin, Oulianov ; Petrograd, Saint-Pétersbourg) : réutiliser l'identifiant existant plutôt que créer un doublon.
- Choisir les parents des nouveaux nœuds parmi les nœuds existants. S'il manque une racine (un pays, un mouvement), la créer avec un bloc `view` et le signaler. Une racine de courant ou de thème transversal (comme `marxism` ou `trotskyism`) reçoit `"kind": "theme"` dans ce bloc ; un pays ou une région n'en a pas besoin (`region` par défaut ; `global` est réservé à `world`). Le viewer mobile s'en sert pour inclure ou exclure les timelines thématiques de ses secondaires automatiques.

Pour une demande vaste ou floue (période, profondeur, source à suivre), poser une seule question de cadrage avant de générer. Pour un ajout précis, procéder directement. Au-delà d'une trentaine de nœuds, travailler par lots et valider entre chaque lot.

### Timeline « Monde »

La racine `world` (fichier `data/nodes/world.json`) donne le contexte mondial. Elle porte six sous-timelines thématiques, chacune avec son bloc `view`, que le visualiseur affiche ou masque :

- `world-economy` : crises, systèmes monétaires, chocs pétroliers, organisation du marché mondial ;
- `world-wars` : guerres entre États, grandes guerres civiles, génocides, massacres ;
- `world-states` : naissance et chute d'États, unifications, indépendances, traités, alliances, organisations internationales ;
- `world-disasters` : épidémies, famines, éruptions, séismes, catastrophes industrielles ;
- `world-science` : découvertes et inventions ;
- `world-culture` : jalons culturels et populaires (musique, arts visuels, littérature, cinéma, sport), en priorité les œuvres liées aux luttes sociales et révolutionnaires.

Règles :
- Un événement mondial a pour parent principal son thème (ou un nœud de ce thème, par exemple la Grande Dépression pour le krach de Wall Street). Les révolutions et les mouvements ouvriers restent dans les timelines de pays ou de mouvement.
- Un événement qui relève de plusieurs thèmes ou d'un pays reçoit des parents supplémentaires plutôt qu'un doublon.
- Dans `world-culture`, le domaine est porté par `tags` : `musique`, `arts visuels`, `littérature`, `cinéma`, `sport`, et `censure` pour les actes de censure ou de répression culturelle.
- Une relation avec un événement d'une autre timeline (une œuvre qui représente une guerre, une crise qui provoque une réaction en Suisse) s'écrit en lien, pas en parent.

### Apparition dans les autres timelines : `shared` et `deep`

Chaque fichier de `data/nodes/` porte une timeline, celle de sa racine ; un nœud appartient à la timeline de son fichier. Le visualiseur n'importe pas tout le sous-arbre d'un nœud venu d'ailleurs. Un enfant **c** d'un nœud **p** présent dans une timeline T y figure si :

1. c appartient à T ;
2. p appartient à T : c'est un rattachement direct de c à T ;
3. c porte `"shared": true` : il suit son parent partout où celui-ci apparaît ;
4. un rattachement marqué `"deep": true` a été traversé plus haut : tout le sous-arbre est importé.

Conséquences pour la rédaction :
- Pour qu'un nœud apparaisse dans une timeline précise, le rattacher explicitement à un nœud de cette timeline. C'est le cas par défaut : Trafalgar se rattache à la France et au Royaume-Uni, pas seulement aux guerres napoléoniennes.
- Réserver `shared` aux événements d'importance générale qui doivent suivre leur guerre ou leur crise partout : tournants d'une guerre mondiale, déclencheur d'une crise mondiale. Un épisode national (une bataille du front italien, une rafle) reste privé : il apparaît dans sa timeline et, par rattachement direct, sous son conteneur mondial, sans plus.
- Réserver `deep` à une timeline thématique ou voisine qui veut un sous-arbre entier d'une autre : par exemple la révolution de 1905 dans `bolshevism`. Le drapeau se pose dans `parents` du nœud importé, sur l'entrée qui pointe vers la timeline d'accueil : `{"id": "1905-first-revolution-period", "deep": true}`.
- `shared` et `deep` valent `false` par défaut et ne s'écrivent que lorsqu'ils valent `true`.
- `py -m tldb scope <racine>` montre ce qu'une timeline importe et pourquoi ; `py -m tldb scope --excluded` montre ce que la règle écarte. Après un ajout touchant une guerre ou une crise mondiale, vérifier ces deux sorties et signaler dans le rapport les choix `shared` et `deep`.

## 3. Règles de rédaction

### Statut
- Tout ce qui est créé porte `"status": "draft"`. Ne jamais écrire `final` : c'est Dom qui relit et valide.
- Ne pas modifier le contenu d'une entité `final`. Si une correction semble nécessaire, la proposer dans le rapport.
- Ne pas toucher aux entités `disabled`, ni les resuggérer.

### Identifiants
- Tous les identifiants sont **en anglais** : slug en minuscules, chiffres et tirets, sans accents. Cela vaut pour toutes les collections, pour les fichiers `data/nodes/<racine>.json` et pour les notes `notes/<id>.md`.
- Prendre la dénomination anglaise consacrée :
  - lieux : l'exonyme anglais (`bern`, `geneva`, `saint-petersburg`) ;
  - personnes : le nom d'usage dans sa translittération anglaise usuelle (`lenin`, `krupskaya`, `gapon`, `robert-grimm`) ;
  - organisations : le sigle ou le nom anglais (`rsdlp`, `bolsheviks`, `sps`) ;
  - œuvres : le titre anglais usuel (`communist-manifesto`), ou l'original quand l'anglais le garde (`jaccuse`) ;
  - nœuds : une description anglaise courte (`dreyfus-affair`, `lenin-swiss-exile`).
- Nœuds datés : préfixe de l'année de début (`1905-bloody-sunday`). Racines sans préfixe (`russia`, `switzerland`).
- Seuls les identifiants sont en anglais : titres, noms et résumés restent multilingues (voir plus bas).
- Un identifiant est définitif : ne jamais renommer un identifiant existant.

### Dates
- `date` est toujours grégorienne. La précision doit être honnête : `YYYY` ou `YYYY-MM` si le jour n'est pas sûr, avec `qualifier` (`circa`, `before`, `after`) si nécessaire. Ne jamais inventer un jour.
- Russie avant le 14 février 1918 : ajouter `original` (date julienne au format ISO) et `"calendar": "julian"`. Le décalage est de 12 jours au XIXe siècle et de 13 jours de mars 1900 à 1918. Le validateur contrôle la conversion.
- Les noms « Février » et « Octobre » viennent de l'ancien style : les dates grégoriennes tombent en mars et en novembre.
- Une période a `end` ; une période en cours a `ongoing: true`. Les deux s'excluent.

### Textes multilingues (`title`, `name`, `full_name`, `summary`, `caption`, `view.label`)
- Langues de travail : `fr`, `en` et `de`, plus la langue originale si elle diffère.
- **Titres et noms** : renseigner `orig` et le texte original quand il existe (titre d'œuvre, nom russe), puis les langues de travail. Préférer les dénominations consacrées dans chaque langue (« Petersburger Blutsonntag », pas une traduction littérale). Si l'original est incertain, l'omettre plutôt que le deviner.
- **Résumé** : une à deux phrases factuelles et neutres, 300 caractères au plus par langue, rédigées en français puis traduites. Toujours dans mes propres mots, sans citation de la source.
- **Marquage** : toute traduction automatique est listée dans `draft` (`"draft": ["en", "de"]`), même si elle semble sûre. Le texte français que je rédige n'y figure pas.
- **Translittération** (`ru-Latn`, …) : facultative. Si je l'ajoute, j'utilise un système cohérent.

### Sources
- Ne citer qu'une source présente dans `sources.json`, ou une page web réellement ouverte pendant le travail (dans ce cas, l'ajouter comme source `website` avec son `url`).
- `chapter` et `page` uniquement si je les connais vraiment. Ne jamais inventer de numéro de page ni de citation.
- Quand un fait est incertain (date contestée, chiffre), le vérifier par une recherche ; s'il reste incertain, le consigner dans une note de vérification (section 5).

### Entités liées
- Créer au besoin des entités `persons`, `places`, `organizations` et `works` **minimales** : `id`, `name` ou `title`, `type` si requis, dates si sûres, `status: draft`. Pas de biographie. Un lieu, même minimal, porte toujours `kind` et `coords`, et `country` sauf pour un fleuve ou un lac frontalier (section suivante) : il n'y a pas de lieu sans coordonnées.
- `works` sert à l'œuvre elle-même (livre, tableau, film, morceau, pièce, poème) ; sa parution, sa création ou sa première est un nœud (`publication`, `premiere`, `artwork`, `exhibition`) qui la référence dans `works`.
- Dans `works`, `date` est la première publication. Quand la rédaction précède nettement la publication (textes posthumes), renseigner `written_start` et, si connu, `written_end`. Un programme ou une résolution adoptés par une organisation portent `organizations` (auteur collectif).

### Lieux : coordonnées et nature (`kind`)

Les visualiseurs placent les événements sur une carte : un lieu sans coordonnées n'y apparaît pas. `kind` et `coords` sont donc **obligatoires** (`schema/places.schema.json`) : `validate` refuse en erreur tout lieu qui n'a pas l'un des deux. Chaque lieu est créé d'emblée avec :

- `kind`, la nature du lieu, qui dit ce que représente le point :

  | `kind` | Exemples | Point `coords` |
  |---|---|---|
  | `country` | Madagascar, Vietnam, Saint-Domingue (colonie) | point représentatif à l'intérieur du territoire, pas forcément le centre géométrique (archipel, pays en croissant) |
  | `region` | Vendée, Asturies, Texas, Hawaï, Crimée, Larzac, île, massif, comté | idem |
  | `city` | Genève, Saint-Pétersbourg, Zimmerwald (ville, bourg, village) | centre historique de la localité |
  | `district` | Harlem, Watts, Shamian | centre du quartier |
  | `site` | mines de la Léna, Buchenwald, Tchernobyl, Little Bighorn, une place, une usine | emplacement exact de l'événement, pas la ville voisine du même nom |
  | `water` | Èbre, baie de Bantry, détroit d'Ormuz, canal | milieu d'un détroit ou d'une baie ; pour un fleuve, le point où se passent les événements |

- `country` : code ISO 3166 du pays **actuel** ;
- `coords` : `{"lat": …, "lon": …}` en degrés décimaux, deux décimales (≈ 1 km). Un seul point : pas de polygone ni d'emprise, les frontières viennent du fond de carte daté du visualiseur.

Vérification des coordonnées :
- De mémoire, seulement pour les capitales et les grandes villes. Pour un village, un site, un lieu peu connu ou un nom porté par plusieurs lieux (Kalinovka, Privolnoïe, Xiaogang), ouvrir une page qui donne les coordonnées (Wikipédia, GeoHack), l'ajouter comme source `website` et la citer dans le nœud qui emploie le lieu (les lieux n'ont pas de champ `sources`) : les estimations de mémoire se sont déjà révélées fausses de 20 à 80 km.
- Choisir le lieu de l'événement, pas son homonyme : la centrale de Fukushima Daiichi n'est pas la ville de Fukushima ; le champ de bataille de Saratoga n'est pas Saratoga Springs.
- Si la position reste incertaine, enregistrer quand même un point approché et ouvrir une note de vérification (catégorie `coordonnees`).
- Un lieu qui a changé de nom garde un seul point ; ses noms d'époque vont dans `historical_names`.

### Idées (`ideas`)

La collection `data/ideas.json` décrit les idées : courants (`current`), théories, concepts, stratégies, mots d'ordre (`slogan`) et méthodes. Spécification : `docs/specs/ideas.md`.

- **Champs** : `name`, `type`, `tradition`, `broader` (idées plus générales ; forme l'arbre des courants), `timeline` (racine de la timeline d'un courant qui en a une, comme `bolshevism`), `summary` (une phrase, fr/en/de), `definition` (3 à 6 phrases factuelles, 1200 caractères au plus) et `appraisal`.
- **`definition` et `appraisal` sont séparées** : la définition reste factuelle ; l'appréciation donne le point de vue du marxisme révolutionnaire. Ne jamais mêler les deux.
- **Jalons (`milestones`)** : l'histoire de l'idée, dans l'ordre chronologique. Chaque jalon a une étape (`stage`) et au moins un champ parmi `date`, `work`, `node`. Sans `date`, il prend la date de publication de l'œuvre ou le début du nœud. Pour une œuvre posthume, donner `date` (date de rédaction) en plus de `work`. `note` dit en une phrase ce qui se passe.
- Un évènement qui met une idée à l'épreuve est un jalon `test` de l'idée, pas un lien. Une relation entre deux idées s'écrit en lien (`develops`, `revises`, `opposes`, `influences`, `continues`, `comparable_to`).
- La pensée adverse (libéralisme, fascisme, etc.) n'entre que si elle a pesé sur le mouvement ouvrier.
- `py -m tldb index --collection ideas` liste les idées ; `validate` contrôle les références des jalons, leur date calculable, leur ordre chronologique et les cycles de `broader`.

### Liens
- Uniquement pour une relation explicite et utile : cause, réaction, influence, prolongement, opposition, comparaison.
- Chaque lien porte `status: draft`, `provenance: {"by": "claude", "date": "<aujourd'hui>"}` et une `justification` d'une phrase.
- Ne pas recréer en lien ce qui est déjà exprimé ou calculé : la relation parent-enfant, la contemporanéité, les co-occurrences.
- Un lien `comparable_to` ne s'écrit qu'une fois, dans un seul sens.
- Les liens entre timelines différentes nourrissent le mode automatique du viewer mobile. `py -m tldb related <racine> <date>` montre quelles timelines seraient proposées à côté d'une autre, et pourquoi ; `py -m tldb related --gaps` liste les décennies où une timeline n'a aucun rapport avec les autres. Quand Dom demande d'enrichir les liens, partir de cette liste.

### Médias
- N'ajouter un média externe que si l'URL a été ouverte et vérifiée. Ne jamais inventer de chemin de fichier local : un fichier n'est référencé que si Dom l'a fourni.
- Renseigner `credit` et `license` quand ils sont connus (Wikimedia Commons les indique).

### Importance
Ne pas écrire de champ `importance`. Le filtrage est reporté à un futur classificateur multi-axes.

## 4. Écrire dans les fichiers

- Ranger un nœud dans `data/nodes/<racine>.json`, d'après la racine de son parent principal (le premier de `parents`). Une nouvelle racine reçoit son propre fichier, nommé d'après son identifiant.
- Ajouter les éléments à la fin de `items` sans réordonner l'existant. Passer par un script qui charge le JSON, ajoute et réécrit : ne jamais réécrire un fichier de mémoire, ni à partir d'une sortie d'outil tronquée.
- Lancer ensuite `py -m tldb format` pour obtenir le format canonique et des diffs propres.
- La taille d'une commande du shell distant est limitée : pour un gros lot (plusieurs dizaines d'entités), écrire le script et les données dans l'espace de travail, copier les fichiers à modifier, les réécrire dans le dossier de Dom, puis lancer `validate` et `format` dans son dossier.

## 5. Consigner les vérifications

Toute vérification restée ouverte devient une note dans `notes/`, jamais seulement une ligne du rapport. Cela couvre : dates contradictoires, incertaines ou de précision réduite, conversions juliennes, chiffres ou faits absents de la source consultée, source inaccessible, nom original ou actuel incertain, identifiant Wikidata absent ou ambigu, position d'un lieu incertaine, formulation interprétative, traductions automatiques d'un lot, fiches minimales à compléter.

- **Nom** : `notes/<id>-check.md` pour une entité (`1917-turin-insurrection-check`), `notes/<lot>-review.md` pour un lot (`italy-translations-review`). Identifiant en anglais, égal au nom du fichier. Plusieurs points sur une même entité vont dans la même note ; avant d'en créer une, vérifier qu'il n'en existe pas déjà une sur le sujet.
- **En-tête YAML** : `id`, `about` (toutes les entités concernées, références préfixées), `tags` commençant par `verification` puis une ou plusieurs catégories, `sources` (pages réellement consultées), `status: draft`.
- **Catégories** : `date-contradictoire`, `date-incertaine`, `date-imprecise`, `calendrier-julien`, `chiffre-non-confirme`, `fait-non-confirme`, `source-faible`, `source-non-consultee`, `lien-sans-source`, `nom-original`, `nom-actuel`, `coordonnees`, `wikidata`, `interpretation`, `traduction`, `a-completer`. N'en créer une nouvelle que si aucune ne convient, et la signaler dans le rapport.
- **Corps** en français : un titre qui nomme l'entité et la question, puis **À vérifier :** (liste numérotée : ce que disent les sources, où elles divergent) et **Choix retenu :** (ce qui est effectivement enregistré dans les données).
- Ne jamais supprimer une note. Quand Dom tranche, il ajoute **Résolution :** et passe la note en `final` ; une note sans objet passe en `disabled`.

```markdown
---
id: 1917-turin-insurrection-check
about: ['node:1917-turin-insurrection']
tags: [verification, date-contradictoire, chiffre-non-confirme]
sources:
- {ref: wp-en-1917-in-italy}
status: draft
---

# Insurrection de Turin 1917 : date et bilan à vérifier

**À vérifier :**

1. **Date de début.** *1917 in Italy* donne le 21 août ; on lit souvent le 22 août.
2. **Bilan.** La page consultée ne donne aucun chiffre.

**Choix retenu :** début le 21 août 1917, bilan non chiffré.
```

## 6. Valider

- Lancer `py -m tldb validate`. Corriger toutes les erreurs dues à mes ajouts. Pour les avertissements : les corriger, ou les expliquer dans le rapport.
- Un lieu sans `kind` ou sans `coords` est une erreur de schéma : la compléter avant d'écrire dans le dossier de Dom, jamais la laisser pour la relecture.
- Une erreur qui existait avant mon intervention est signalée à Dom, pas corrigée d'office.
- `py -m tldb format --check` doit être propre.

## 7. Rapport à Dom

Court et dans cet ordre :
1. **Ce qui a été créé** : nombre d'éléments par collection, nouvelles racines, rattachements.
2. **Notes de vérification** : la liste des notes créées ou complétées, chacune avec sa question en une ligne. Le détail est dans les notes, pas dans le rapport.
3. **Liens suggérés** : chaque lien avec sa justification en une ligne.
4. **Résultat de la validation.**

Si le dossier est un dépôt git, indiquer que `git diff` montre les changements. Ne jamais faire de commit sans demande explicite.

## Aide-mémoire : un lieu complet

```json
{
  "id": "zimmerwald",
  "name": {"fr": "Zimmerwald", "en": "Zimmerwald", "de": "Zimmerwald", "draft": ["en", "de"]},
  "kind": "city",
  "country": "CH",
  "coords": {"lat": 46.88, "lon": 7.47},
  "status": "draft"
}
```

## Aide-mémoire : un nœud complet

```json
{
  "id": "1905-bloody-sunday",
  "title": {
    "orig": "ru", "ru": "Кровавое воскресенье",
    "fr": "Dimanche rouge", "en": "Bloody Sunday", "de": "Petersburger Blutsonntag",
    "draft": ["en", "de"]
  },
  "aliases": ["Dimanche sanglant"],
  "type": "massacre",
  "start": {"date": "1905-01-22", "original": "1905-01-09", "calendar": "julian"},
  "summary": {
    "fr": "La troupe tire sur une manifestation pacifique conduite par le pope Gapone devant le palais d'Hiver.",
    "en": "Troops fire on a peaceful march led by the priest Gapon outside the Winter Palace.",
    "de": "Truppen schießen auf einen friedlichen Demonstrationszug unter Führung des Priesters Gapon vor dem Winterpalast.",
    "draft": ["en", "de"]
  },
  "parents": [{"id": "revolution-1905"}],
  "persons": ["gapon"],
  "places": ["saint-petersburg"],
  "sources": [{"ref": "woods-bolshevism"}],
  "status": "draft"
}
```

## Valeurs les plus utilisées

La liste complète se trouve dans `schema/` ; en cas de doute, lire le schéma.

- **Types de nœuds** :
  - `era`, `period`
  - `war`, `battle`, `revolution`, `insurrection`, `coup`, `massacre`, `repression`
  - `strike`, `demonstration`, `mutiny`
  - `election`, `vote`, `law`, `treaty`, `government`, `assassination`
  - `congress`, `conference`, `founding`, `split`, `merger`, `ban`
  - `birth`, `death`, `arrest`, `trial`, `exile`, `release`
  - `publication`, `speech`
  - `genocide`, `independence`, `unification`
  - `crisis`, `monetary`, `epidemic`, `famine`, `disaster`
  - `discovery`, `invention`
  - `premiere`, `artwork`, `exhibition`, `festival`, `competition`
  - `other`
- **Types d'œuvres** : `book`, `pamphlet`, `article`, `manifesto`, `speech`, `letter`, `newspaper`, `painting`, `sculpture`, `film`, `music`, `play`, `poem`, `programme`, `resolution`, `theses`, `other`.
- **Types de liens** : `leads_to`, `causes`, `reaction_to`, `influences`, `continues`, `develops`, `revises`, `opposes`, `references`, `comparable_to`.
- **Types d'idées** : `current`, `theory`, `concept`, `strategy`, `slogan`, `method`.
- **Traditions** : `marxist`, `socialist`, `anarchist`, `democratic`, `liberal`, `conservative`, `fascist`, `religious`, `other`.
- **Étapes des jalons** : `precursor`, `emergence`, `formulation`, `development`, `adoption`, `test`, `critique`, `revision`, `abandonment`, `revival`.
- **Natures de lieu** (`kind`) : `country`, `region`, `city`, `district`, `site`, `water`.
- **Préfixes de référence** : `node:`, `person:`, `place:`, `org:`, `work:`, `idea:`, `source:`, `media:`.