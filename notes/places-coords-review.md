---
id: places-coords-review
about: ['place:madagascar', 'place:vietnam', 'place:congo', 'place:brazil', 'place:chile', 'place:iran', 'place:iraq', 'place:kuwait', 'place:nicaragua', 'place:panama', 'place:guatemala', 'place:el-salvador', 'place:venezuela', 'place:haiti', 'place:dominican-republic', 'place:saint-domingue', 'place:grenada', 'place:west-bank', 'place:new-caledonia', 'place:guadeloupe', 'place:martinique', 'place:french-guiana', 'place:saint-helena', 'place:vendee', 'place:nord-pas-de-calais', 'place:larzac', 'place:california', 'place:texas', 'place:kansas', 'place:minnesota', 'place:colorado', 'place:hawaii', 'place:pennsylvania', 'place:oklahoma', 'place:mississippi', 'place:south-dakota', 'place:shanxi', 'place:hudson-valley', 'place:southampton-county', 'place:logan-county-west-virginia', 'place:standing-rock', 'place:yalu-river', 'place:strait-of-hormuz', 'place:chernobyl', 'place:fukushima', 'place:auschwitz', 'place:waterloo', 'place:austerlitz', 'place:saratoga', 'place:bethel-new-york', 'place:wukan', 'place:xiaogang', 'place:jintian', 'place:privolnoye', 'place:butka', 'place:kalinovka', 'place:yanovka', 'place:huayuankou', 'place:jinggangshan', 'place:wushe', 'place:el-mozote', 'place:lattimer', 'place:matewan', 'place:sand-creek']
tags: [verification, interpretation, source-non-consultee, wikidata]
sources:
- {ref: wp-en-wukan}
- {ref: wp-en-xiaogang-anhui}
- {ref: wp-en-jintian-guangxi}
- {ref: wp-en-privolnoye-stavropol-krai}
- {ref: wp-en-butka-russia}
- {ref: wp-en-kalinovka-khomutovsky-district}
- {ref: wp-en-bereslavka-ukraine}
- {ref: wp-en-huayuankou-henan}
status: draft
---

# Coordonnées ajoutées le 27 octobre 2026 : choix et contrôles

301 lieux sans `coords` ont reçu un point (latitude, longitude à deux décimales, soit environ 1 km de précision).

**À vérifier :**

1. **Méthode.** Coordonnées saisies de mémoire, puis recoupées hors ligne avec le fichier GeoNames *cities1000* (villes de plus de 1000 habitants) : 210 lieux concordent à moins de 15 km environ. Les autres n'ont pas d'équivalent dans ce fichier (pays, régions, sites, villages) et n'ont été contrôlés que par le nom de la localité la plus proche.
2. **Corrigés après consultation de Wikipédia** (l'estimation de mémoire était fausse de 20 à 80 km) : Wukan, Xiaogang, Jintian, Privolnoïe, Boutka, Kalinovka, Ianovka (aujourd'hui Bereslavka, Ukraine), Huayuankou.
3. **Pays, régions, États fédérés, îles et fleuves.** Le point est un point représentatif situé à l'intérieur du territoire (proche du centre, à la manière d'un emplacement d'étiquette), pas une frontière. Fleuve Yalou : point placé entre Dandong et Sinuiju. Détroit d'Ormuz : milieu du détroit. Hawaï : Maui. Saint-Domingue (colonie) : même point que Haïti.
4. **Site plutôt que ville éponyme.** Tchernobyl et Fukushima sont placés sur les centrales nucléaires (la ville de Fukushima est à 60 km de Fukushima Daiichi) ; Auschwitz sur le camp ; Saratoga sur le champ de bataille (parc historique national, pas Saratoga Springs) ; Bethel sur le site du festival de Woodstock ; Standing Rock à Fort Yates. Waterloo et Austerlitz restent sur les villes, à quelques kilomètres des champs de bataille.
5. **Petits lieux non recoupés par une source** : Jinggangshan (Ciping), Wushe, El Mozote, Lattimer, Matewan, Sand Creek, Larzac.
6. **Wikidata.** Aucune de ces fiches n'a d'identifiant Wikidata, qui permettrait un recoupement automatique.

**Choix retenu :** un seul point par lieu dans `coords`. Depuis le 27 octobre 2026, le champ `kind` (country, region, city, district, site, water) dit ce que représente ce point ; les lieux des points 3 et 4 sont classés `country`, `region`, `site` ou `water` en conséquence. Une emprise (`bbox`) n'est pas retenue pour l'instant.
