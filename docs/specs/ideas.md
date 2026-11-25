# Collection `ideas` : proposition à valider

> Note du 25 novembre 2026 : ce document date d'avant la réorganisation du dépôt. Les chemins `viewer/…`, `tools/…` et `build_viewer.py` correspondent aujourd'hui à `web/apps/…`, `tldb/` et `py -m tldb build` ; voir `docs/architecture.md`.

Statut : **proposition** (2026-10-26). Rien n'est encore implémenté : ni schéma, ni outil, ni données.

## 1. Principe

Les idées deviennent des entités au même titre que les personnes, les organisations ou les œuvres.
Chaque idée porte sa propre histoire sous la forme d'une suite de **jalons** datés (émergence, formulation,
mise à l'épreuve, révision…), chacun rattaché à une œuvre, un évènement et/ou des personnes de la base.

Les vues « penseurs », « œuvres », « idées », « courants » et « polémiques » ne sont pas saisies
séparément : le visualiseur les calcule à partir de ce socle.

```
person ──auteur──▶ work ──jalon──▶ idea ◀──jalon── node (évènement : épreuve des faits)
                                    │
                         broader / links (develops, revises, opposes…)
                                    ▼
                                   idea
```

## 2. Nouvelle collection `data/ideas.json`

Préfixe de référence : `idea:` (à ajouter au motif `ref` de `common.schema.json`).

| Champ | Type | Rôle |
|---|---|---|
| `id` | slug | anglais, comme partout (`permanent-revolution`) |
| `name` | localizedText | nom usuel (« Révolution permanente ») |
| `aliases` | stringList | autres noms (« Revolution in Permanenz », « trotskysme » pour un courant…) |
| `type` | enum | `current` (courant), `theory` (théorie, loi), `concept` (notion), `strategy` (stratégie ou tactique), `slogan` (mot d'ordre), `method` |
| `tradition` | enum | `marxist`, `socialist` (socialisme non marxiste), `anarchist`, `democratic` (révolutions bourgeoises, républicanisme), `liberal`, `conservative`, `fascist`, `religious`, `other` |
| `broader` | slugList | idées plus générales (`dictatorship-of-the-proletariat` → `marxist-theory-of-the-state`) ; forme l'arbre des courants |
| `timeline` | slug | pour un courant qui a sa propre timeline : sa racine (`bolshevism`) |
| `summary` | localizedText | une phrase d'accroche |
| `definition` | localizedText | 3 à 6 phrases factuelles, 1200 caractères au plus par langue (comme `bio`) |
| `appraisal` | localizedText | appréciation du point de vue du marxisme révolutionnaire, séparée de la définition ; facultative |
| `milestones` | array | jalons de l'histoire de l'idée (ci-dessous) |
| `wikidata`, `sources`, `tags`, `status` | communs | comme les autres collections |

Obligatoires : `id`, `name`, `type`.

### Jalons (`milestones[]`)

| Champ | Type | Rôle |
|---|---|---|
| `stage` | enum | voir ci-dessous (obligatoire) |
| `date` | dateValue | facultative si `work` ou `node` donne la date |
| `work` | slug | œuvre où l'idée apparaît, est formulée, critiquée… |
| `node` | slug | évènement : congrès qui l'adopte, révolution qui la met à l'épreuve |
| `persons` | slugList | utile quand il n'y a pas d'œuvre (lettre, discours non répertorié) ou pour préciser |
| `organizations` | slugList | organisation qui adopte, rejette ou applique |
| `note` | localizedText | ce qui se passe à ce jalon, en une ou deux phrases |
| `sources` | sourceList | |

Au moins un des champs `date`, `work` ou `node` est requis.

Étapes (`stage`) :

| Valeur | Sens |
|---|---|
| `precursor` | idée voisine ou germe chez un prédécesseur |
| `emergence` | première apparition, encore partielle |
| `formulation` | énoncé explicite, forme « classique » |
| `development` | approfondissement, extension à un nouveau domaine |
| `adoption` | adoptée par une organisation (programme, statuts, résolution de congrès) |
| `test` | mise à l'épreuve par les évènements (confirmation ou démenti, dit dans `note`) |
| `critique` | critique par un adversaire ou un courant rival |
| `revision` | modification du contenu, assumée ou non |
| `abandonment` | abandon explicite par une organisation ou un auteur |
| `revival` | reprise après éclipse (publication posthume, redécouverte) |

Date d'un jalon : `date` si présente, sinon la date de publication de `work`, sinon le début de `node`.
`validate` signale un jalon sans date calculable.

### Exemple

```json
{
  "id": "permanent-revolution",
  "name": {"orig": "de", "de": "Revolution in Permanenz", "fr": "Révolution permanente", "en": "Permanent revolution", "draft": ["de", "en"]},
  "type": "theory",
  "tradition": "marxist",
  "broader": ["marxism"],
  "summary": {"fr": "Dans les pays arriérés, seule la classe ouvrière peut accomplir les tâches de la révolution bourgeoise, et elle ne peut s'y arrêter."},
  "milestones": [
    {"stage": "emergence", "work": "address-of-the-central-committee-1850",
     "note": {"fr": "Marx et Engels appellent les ouvriers à rendre la révolution permanente face à la démocratie petite-bourgeoise."}},
    {"stage": "formulation", "work": "results-and-prospects"},
    {"stage": "test", "node": "1917-revolution-year",
     "note": {"fr": "Octobre confirme le pronostic : le prolétariat prend le pouvoir à la tête de la paysannerie."}},
    {"stage": "critique", "node": "1924-socialism-in-one-country", "persons": ["stalin"]},
    {"stage": "test", "node": "1927-stalin-trotsky-debate-on-china"},
    {"stage": "development", "work": "the-permanent-revolution"}
  ],
  "status": "draft"
}
```

## 3. Changements dans les collections existantes

**`works`**
- `date` = première publication (à préciser dans la description du champ).
- Nouveaux champs `written_start` et `written_end` (dateValue) : période de rédaction, quand elle diffère nettement
  (*L'Idéologie allemande* : rédaction 1845-1846, publication 1932).
- Nouveau champ `organizations` (slugList) : auteurs collectifs (programmes, résolutions de congrès).
- Nouveaux types : `programme`, `resolution`, `theses`.

**`persons`**
- Nouveau champ facultatif `phases` : `[{from, to, label, summary}]`, pour les ruptures dans un parcours
  (Plekhanov avant et après 1914, Kautsky avant et après 1910). Pas de « période de productivité maximale » stockée :
  la densité des œuvres sur la barre de vie la montre d'elle-même.

**`links`**
- `from` / `to` acceptent `idea:`.
- Deux nouveaux types : `develops` (B développe A) et `revises` (B révise A). Les types existants servent aussi
  entre idées : `opposes`, `influences`, `continues`, `comparable_to`.
- Pas de lien œuvre → idée ni évènement → idée : ce sont les jalons.

**`nodes`** : inchangé. Le visualiseur calcule à l'envers « idées liées à cet évènement » à partir des jalons.

**Outil** : `tldb.py` (COLLECTIONS, préfixe `idea`, contrôle des références des jalons, calcul de leur date,
cycles dans `broader`), `build_viewer.py` (embarquer `ideas`), SKILL de génération, spécification générale.

## 4. Vues que le socle permet

| Vue | Calcul |
|---|---|
| Penseurs | barre de vie + phases + œuvres en points + jalons d'idées où la personne apparaît |
| Œuvres | œuvres datées (rédaction → publication), colorées par courant de leurs idées |
| Idées | une ligne par idée, jalons en points colorés par étape |
| Courants | arbre `broader` des idées de type `current` en lignes qui naissent et se séparent ; dates des scissions tirées des jalons `adoption` / `critique` et des nœuds `split` |
| Polémiques | jalons `critique` regroupés avec les jalons qu'ils visent |
| Idées et évènements | jalons `test` affichés sur les lignes pays, en parallèle des crises (lignes `world`) |
| Contemporains | barres de vie superposées, filtrées par courant |

## 5. Premier lot : 55 idées

Notation : `work:`, `node:`, `person:`, `org:` = référence vers la base. La section 6 liste ce qui manque.
Les dates sont celles du jalon ; « publ. » = publication quand elle diffère de la rédaction.

### A. Courants (`current`)

1. **`babouvism`** (communisme des Égaux) · socialist
   - 1796 emergence `node:1796-conspiracy-of-the-equals` ; *Manifeste des Égaux* (`person:marechal`)
   - 1828 revival `work:conspiracy-for-equality` (Buonarroti) : transmission à Blanqui
2. **`utopian-socialism`** · socialist
   - 1808 emergence `work:theory-of-the-four-movements` (`person:fourier`)
   - 1813 development `work:a-new-view-of-society` (`person:robert-owen`)
   - 1848 critique `work:communist-manifesto` (chapitre III)
   - 1880 critique `work:socialism-utopian-and-scientific` : l'étiquette elle-même
3. **`blanquism`** · socialist
   - 1839 test `node:1839-insurrection-of-the-seasons` (`person:blanqui`)
   - 1871 test `node:1871-paris-commune` : majorité blanquiste de la Commune
   - 1874 critique `work:programme-of-the-blanquist-refugees` (`person:engels`)
4. **`anarchism`** · anarchist
   - 1840 emergence `work:what-is-property` : « je suis anarchiste »
   - 1847 critique `work:the-poverty-of-philosophy`
   - 1872 critique : exclusion de Bakounine au congrès de La Haye (`org:first-international`, `person:bakunin`)
   - 1892 development `work:the-conquest-of-bread` (`person:kropotkin`)
   - 1936 test `node:1936-spanish-revolution`
5. **`marxism`** · marxist
   - 1848 formulation `work:communist-manifesto`
   - 1867 development `work:das-kapital`
   - 1891 adoption `node:1891-erfurt-programme`
6. **`russian-populism`** (narodnisme) · socialist
   - 1857 emergence `work:kolokol` (`person:herzen`) : socialisme russe par la commune rurale
   - 1863 development `work:what-is-to-be-done-novel` (`person:chernyshevsky`)
   - 1874 test `node:1874-going-to-the-people`
   - 1881 test `node:1881-assassination-of-alexander-ii` (`org:narodnaya-volya`)
   - 1883 critique `node:1883-emancipation-of-labour-group` ; 1885 `work:our-differences` (`person:plekhanov`)
7. **`revisionism`** (réformisme) · socialist
   - 1899 formulation `work:preconditions-of-socialism`
   - 1899 critique `work:social-reform-or-revolution`
   - 1914 test `node:1914-spd-war-credits`
   - 1959 adoption `node:1959-godesberg-programme` : le SPD abandonne le marxisme
8. **`revolutionary-syndicalism`** · anarchist
   - 1895 emergence `node:1895-cgt-founding`
   - 1905 adoption `node:1905-iww-founding`
   - 1906 adoption `node:1906-charter-of-amiens`
   - 1912 development `work:miners-next-step`
   - 1914 test `node:1914-sacred-union` : la CGT se rallie
9. **`economism`** · socialist
   - 1899 formulation `work:credo-1899` (`person:kuskova`)
   - 1899 critique : *Protestation des sociaux-démocrates russes* (`person:lenin`)
   - 1902 critique `work:what-is-to-be-done`
10. **`menshevism`** · marxist
    - 1903 emergence `node:1903-rsdlp-second-congress` (`org:mensheviks`)
    - 1917 test `node:1917-first-coalition-government`
11. **`bolshevism`** · marxist · `timeline: bolshevism`
    - 1902 formulation `work:what-is-to-be-done`
    - 1903 emergence `node:1903-rsdlp-second-congress` (`org:bolsheviks`)
    - 1912 adoption `node:1912-prague-conference` : parti distinct
    - 1917 test `node:1917-second-congress-of-soviets`
    - 1919 adoption `node:1919-founding-of-the-comintern`
12. **`stalinism`** · marxist (se réclame du marxisme ; `appraisal` à rédiger)
    - 1924 emergence `node:1924-socialism-in-one-country`
    - 1927 test `node:1927-expulsion-of-trotsky-and-zinoviev`
    - 1936 test `node:1936-great-purge`
    - 1956 critique partielle `node:1956-secret-speech`
13. **`trotskyism`** · marxist
    - 1923 emergence `node:1923-declaration-of-the-46` ; `work:the-new-course` (`org:left-opposition`)
    - 1938 adoption `work:transitional-programme` (`org:fourth-international`)
14. **`maoism`** · marxist
    - 1927 emergence `node:1927-mao-report-on-hunan-peasant-movement` : la paysannerie force principale
    - 1940 formulation `work:on-new-democracy`
    - 1945 adoption `node:1945-seventh-ccp-congress` : « pensée Mao Zedong » dans les statuts
    - 1966 test `node:1966-cultural-revolution`

### B. Méthode et fondements

15. **`historical-materialism`** · method
    - 1845 emergence `work:the-german-ideology` (rédaction 1845-1846, publ. 1932)
    - 1859 formulation `work:contribution-to-the-critique-of-political-economy` (préface)
    - 1890 development : lettres d'Engels à Bloch contre le déterminisme économique
16. **`dialectical-materialism`** · method
    - 1812 precursor `work:science-of-logic` (`person:hegel`)
    - 1841 precursor `work:the-essence-of-christianity` (`person:feuerbach`)
    - 1845 emergence `work:theses-on-feuerbach` (publ. 1888)
    - 1878 formulation `work:anti-duhring`
    - 1891 development : le terme, attribué à Dietzgen (1887) et Plekhanov (1891) **à vérifier**
    - 1938 revision : *Matérialisme dialectique et matérialisme historique* (`person:stalin`), codification dogmatique
17. **`class-struggle`** · theory
    - 1820 precursor : historiens de la Restauration (Thierry, Guizot)
    - 1848 formulation `work:communist-manifesto`
    - 1852 development `work:letter-to-weydemeyer-1852` : « ce que j'ai apporté de nouveau »
18. **`alienation`** · concept
    - 1841 precursor `work:the-essence-of-christianity`
    - 1844 formulation `work:economic-and-philosophic-manuscripts` (publ. 1932)
    - 1932 revival : la publication relance un « marxisme humaniste »

### C. Économie

19. **`labour-theory-of-value`** · theory · liberal
    - 1776 emergence `work:the-wealth-of-nations`
    - 1817 formulation `work:principles-of-political-economy-ricardo`
    - 1867 revision `work:das-kapital`
    - 1871 critique : révolution marginaliste (Jevons, Menger, Walras)
20. **`surplus-value`** · theory
    - 1857 emergence `work:grundrisse` (rédaction 1857-1858, publ. 1939-1941)
    - 1865 development : *Salaire, prix et profit* (`person:marx`, publ. 1898)
    - 1867 formulation `work:das-kapital`
21. **`commodity-fetishism`** · concept
    - 1867 formulation `work:das-kapital` (livre I, chap. 1)
    - 1923 development `work:history-and-class-consciousness` : réification (`person:lukacs`)
22. **`imperialism`** · theory
    - 1902 precursor `work:imperialism-a-study` (`person:hobson`)
    - 1910 development `work:finance-capital` (`person:hilferding`)
    - 1913 development `work:the-accumulation-of-capital` (`person:rosa-luxemburg`)
    - 1916 formulation `work:imperialism-the-highest-stage-of-capitalism` (publ. 1917)
    - 1914 test `node:1914-first-world-war`
23. **`combined-and-uneven-development`** · theory
    - 1881 precursor : lettre de Marx à Vera Zassoulitch sur la commune russe (`person:zasulich`)
    - 1906 emergence `work:results-and-prospects`
    - 1930 formulation `work:history-of-the-russian-revolution` (chapitre 1)
24. **`labour-aristocracy`** · concept
    - 1858 emergence : lettre d'Engels à Marx sur le « prolétariat bourgeois » anglais
    - 1892 development : préface d'Engels à `work:condition-of-the-working-class-in-england`
    - 1916 formulation `work:imperialism-and-the-split-in-socialism`

### D. État et révolution

25. **`marxist-theory-of-the-state`** · theory
    - 1848 emergence `work:communist-manifesto`
    - 1884 formulation `work:origin-of-the-family`
    - 1917 development `work:the-state-and-revolution` (publ. 1918)
26. **`smashing-the-state-machine`** · concept · broader `marxist-theory-of-the-state`
    - 1852 emergence `work:eighteenth-brumaire`
    - 1871 test `node:1871-paris-commune`
    - 1871 formulation `work:civil-war-in-france`
    - 1872 adoption : préface au Manifeste, sa seule correction
    - 1917 development `work:the-state-and-revolution`
27. **`dictatorship-of-the-proletariat`** · concept · broader `marxist-theory-of-the-state`
    - 1850 emergence `work:class-struggles-in-france`
    - 1852 formulation `work:letter-to-weydemeyer-1852`
    - 1875 development `work:critique-of-the-gotha-programme`
    - 1891 development : Engels, « Regardez la Commune de Paris : c'était la dictature du prolétariat »
    - 1918 critique `work:the-dictatorship-of-the-proletariat-kautsky`
    - 1918 development `work:the-proletarian-revolution-and-the-renegade-kautsky`
    - 1976 abandonment : 22e congrès du PCF (`org:pcf`)
    - note : souvent attribuée à Blanqui, qui ne l'a pas employée (Hal Draper)
28. **`withering-away-of-the-state`** · concept · broader `marxist-theory-of-the-state`
    - 1878 formulation `work:anti-duhring`
    - 1917 development `work:the-state-and-revolution`
    - 1939 revision : Staline, maintien de l'État sous le communisme en cas d'encerclement (18e congrès) **à vérifier**
29. **`two-phases-of-communism`** · concept
    - 1875 formulation `work:critique-of-the-gotha-programme`
    - 1917 development `work:the-state-and-revolution`
    - 1936 revision `node:1936-stalin-constitution` : socialisme déclaré réalisé
30. **`permanent-revolution`** · theory : voir l'exemple de la section 2
31. **`stages-theory`** (révolution par étapes) · theory
    - 1883 emergence `node:1883-emancipation-of-labour-group` : révolution bourgeoise d'abord
    - 1905 formulation : positions mencheviks (`org:mensheviks`)
    - 1917 test `node:1917-february-to-october`
    - 1927 test `node:1927-shanghai-massacre` : « bloc des quatre classes »
    - 1940 development `work:on-new-democracy`
32. **`all-power-to-the-soviets`** · slogan
    - 1905 emergence `node:1905-petersburg-soviet`
    - 1917 formulation `work:april-theses`
    - 1917 abandonment provisoire après `node:1917-july-days`
    - 1917 adoption `node:1917-second-congress-of-soviets`
33. **`workers-control`** · concept
    - 1917 adoption `node:1917-decree-on-workers-control`
    - 1919 development `work:l-ordine-nuovo` : conseils d'usine de Turin
    - 1920 test `node:1920-occupation-of-the-factories`
    - 1921 revision `node:1921-nep-and-rise-of-the-bureaucracy`
34. **`degenerated-workers-state`** · theory
    - 1923 emergence `work:the-new-course`
    - 1936 formulation `work:the-revolution-betrayed` (publ. 1937)
    - 1948 critique : théories du capitalisme d'État (Tony Cliff)

### E. Parti, stratégie, tactique

35. **`self-emancipation-of-the-working-class`** · concept
    - 1843 precursor `work:the-workers-union` (Flora Tristan)
    - 1864 formulation `node:1864-founding-of-the-first-international` (considérants des statuts)
36. **`proletarian-internationalism`** · concept
    - 1848 formulation `work:communist-manifesto` : « Prolétaires de tous les pays, unissez-vous ! »
    - 1864 adoption `node:1864-founding-of-the-first-international`
    - 1914 test `node:1914-spd-war-credits` : faillite de la IIe Internationale
    - 1915 development `node:1915-zimmerwald-conference`
    - 1919 adoption `node:1919-founding-of-the-comintern`
    - 1943 abandonment `node:1943-dissolution-of-the-comintern`
37. **`vanguard-party`** · theory
    - 1847 precursor `org:communist-league`
    - 1902 formulation `work:what-is-to-be-done`
    - 1903 test `node:1903-rsdlp-second-congress`
    - 1920 adoption `work:twenty-one-conditions` (`org:comintern`)
38. **`democratic-centralism`** · concept
    - 1906 adoption `node:1906-rsdlp-fourth-congress`
    - 1920 adoption `work:twenty-one-conditions`
    - 1921 revision : interdiction des fractions au 10e congrès **nœud à créer**
39. **`mass-strike`** (grève de masse, grève générale) · strategy
    - 1842 precursor `node:1842-general-strike` (chartisme)
    - 1873 critique : *Les bakouninistes à l'œuvre* (`person:engels`)
    - 1905 test `node:1905-first-revolution-period`
    - 1906 formulation `work:the-mass-strike` (`person:rosa-luxemburg`)
    - 1906 adoption `node:1906-charter-of-amiens`
40. **`revolutionary-defeatism`** · strategy
    - 1914 emergence `node:1914-liebknecht-votes-against-war-credits`
    - 1915 formulation `work:socialism-and-war`
    - 1915 test `node:1915-zimmerwald-conference` (gauche de Zimmerwald)
41. **`national-self-determination`** · concept
    - 1903 adoption : programme du POSDR, point 9 (`org:rsdlp`)
    - 1914 formulation `work:the-right-of-nations-to-self-determination`
    - 1916 test `work:proclamation-of-the-irish-republic` : Lénine défend l'insurrection de Pâques
    - critique : Rosa Luxemburg **jalon à dater**
42. **`united-front`** · strategy
    - 1921 formulation : thèses de l'exécutif de l'Internationale communiste (décembre 1921)
    - 1922 adoption : 4e congrès de l'IC (`org:comintern`)
    - 1928 abandonment `node:1927-class-against-class` ; « social-fascisme »
    - 1931 development : écrits de Trotsky sur l'Allemagne (`person:trotsky`)
    - 1933 test `node:1933-hitler-appointed-chancellor`
43. **`popular-front`** · strategy
    - 1934 emergence `node:1934-unity-of-action-pact`
    - 1935 adoption : 7e congrès de l'IC, rapport Dimitrov (`org:comintern`)
    - 1936 test `node:1936-popular-front-election`
    - 1936 test `node:1936-spanish-revolution`
    - 1936 critique `work:whither-france` (`person:trotsky`)
44. **`transitional-programme`** · strategy
    - 1848 precursor `work:communist-manifesto` : mesures du chapitre II
    - 1922 emergence : revendications transitoires au 4e congrès de l'IC
    - 1938 formulation `work:transitional-programme` (`org:fourth-international`)
45. **`socialism-in-one-country`** · theory
    - 1924 formulation `node:1924-socialism-in-one-country`
    - 1928 critique `work:the-third-international-after-lenin` (`person:trotsky`)
    - 1928 adoption : programme du 6e congrès de l'IC (`org:comintern`)
46. **`hegemony`** · concept
    - 1883 emergence : « hégémonie du prolétariat » chez Plekhanov et Axelrod **à vérifier**
    - 1929 formulation `work:prison-notebooks` (`person:antonio-gramsci`, rédaction 1929-1935, publ. 1948-1951)
47. **`new-democracy`** · theory
    - 1940 formulation `work:on-new-democracy`
    - 1949 adoption `node:1949-cppcc-and-common-program`
    - 1956 abandonment `node:1956-socialist-transformation-of-industry`

### F. Émancipation et héritage démocratique

48. **`rights-of-man`** · concept · democratic
    - 1789 formulation `node:1789-declaration-of-the-rights-of-man`
    - 1791 development `work:rights-of-man` (`person:thomas-paine`)
49. **`womens-emancipation`** (perspective socialiste) · concept
    - 1791 precursor : *Déclaration des droits de la femme* (Olympe de Gouges)
    - 1848 precursor `work:declaration-of-sentiments`
    - 1879 formulation `work:woman-and-socialism` (`person:bebel`)
    - 1884 development `work:origin-of-the-family`
    - 1910 adoption : Journée internationale des femmes, Copenhague (`person:clara-zetkin`)
    - 1917 test `node:1917-international-womens-day-strike`
    - 1936 revision : interdiction de l'avortement en URSS **nœud à créer**

### G. Pensée adverse

50. **`economic-liberalism`** · liberal
    - 1776 formulation `work:the-wealth-of-nations`
    - 1846 adoption `node:1846-corn-laws-repeal`
51. **`malthusianism`** · conservative
    - 1798 formulation `work:essay-on-the-principle-of-population`
    - 1834 adoption `node:1834-new-poor-law`
    - 1844 critique : Engels, *Esquisse d'une critique de l'économie politique*
52. **`social-catholicism`** · religious
    - 1891 formulation `work:rerum-novarum`
    - 1931 development : *Quadragesimo anno*, corporatisme
53. **`fascism`** · fascist
    - 1919 emergence `node:1918-biennio-rosso-and-rise-of-fascism` (`work:il-popolo-d-italia`)
    - 1922 test `node:1922-fascist-regime`
    - 1932 formulation : *La dottrina del fascismo* (Mussolini, Gentile)
    - 1933 test `node:1933-third-reich`
    - 1935 critique : définition de Dimitrov, 7e congrès de l'IC
54. **`keynesianism`** · liberal
    - 1936 formulation `work:the-general-theory`
    - 1942 adoption `work:beveridge-report`
    - 1944 adoption `node:1944-bretton-woods-conference`
    - 1976 abandonment `node:1976-imf-crisis` (Callaghan : « on ne peut plus dépenser pour sortir de la récession »)
55. **`neoliberalism`** · liberal
    - 1938 emergence : colloque Walter Lippmann, Paris
    - 1944 formulation `work:the-road-to-serfdom`
    - 1947 adoption : fondation de la société du Mont-Pèlerin (Vaud)
    - 1973 test `node:1973-chilean-coup` : les « Chicago Boys »
    - 1979 adoption `node:1979-thatcherism`

## 6. Ce qui manque dans la base

Vérification automatique des références des sections 2 et 5 contre la base au 2026-10-26 :
166 références distinctes, 112 existent déjà.

**Œuvres à créer (47)** :
`a-new-view-of-society`, `address-of-the-central-committee-1850`, `anti-duhring`, `conspiracy-for-equality`,
`contribution-to-the-critique-of-political-economy`, `credo-1899`, `economic-and-philosophic-manuscripts`,
`essay-on-the-principle-of-population`, `finance-capital`, `grundrisse`, `history-and-class-consciousness`,
`history-of-the-russian-revolution`, `imperialism-a-study`, `imperialism-and-the-split-in-socialism`,
`imperialism-the-highest-stage-of-capitalism`, `letter-to-weydemeyer-1852`, `origin-of-the-family`, `our-differences`,
`principles-of-political-economy-ricardo`, `prison-notebooks`, `programme-of-the-blanquist-refugees`,
`results-and-prospects`, `science-of-logic`, `socialism-and-war`, `socialism-utopian-and-scientific`,
`the-accumulation-of-capital`, `the-conquest-of-bread`, `the-dictatorship-of-the-proletariat-kautsky`,
`the-essence-of-christianity`, `the-general-theory`, `the-german-ideology`, `the-mass-strike`, `the-new-course`,
`the-permanent-revolution`, `the-poverty-of-philosophy`, `the-proletarian-revolution-and-the-renegade-kautsky`,
`the-revolution-betrayed`, `the-right-of-nations-to-self-determination`, `the-road-to-serfdom`,
`the-state-and-revolution`, `the-third-international-after-lenin`, `the-wealth-of-nations`, `theses-on-feuerbach`,
`transitional-programme`, `twenty-one-conditions`, `whither-france`, `woman-and-socialism`

**Personnes à créer (16)**, dont 7 auteurs d'œuvres ci-dessus sans référence explicite dans les jalons :
`hegel`, `feuerbach`, `bebel`, `hilferding`, `hobson`, `kropotkin`, `kuskova`, `lukacs`, `marechal`,
`adam-smith`, `david-ricardo`, `thomas-malthus`, `john-maynard-keynes`, `friedrich-hayek`, `filippo-buonarroti`,
`georgi-dimitrov`

**Évènements à créer** (cités sans référence, à ajouter s'ils méritent un nœud) :
1872 congrès de La Haye de l'AIT · 1910 conférence de Copenhague (journée des femmes) · 1921 10e congrès du PCR(b)
et interdiction des fractions · 1922 4e congrès de l'IC · 1935 7e congrès de l'IC · 1936 interdiction de l'avortement
en URSS · 1938 colloque Walter Lippmann · 1938 fondation de la IVe Internationale · 1947 fondation de la société du
Mont-Pèlerin · 1976 22e congrès du PCF

## 7. Décisions à prendre

1. **`appraisal`** : garder ce champ séparé de la définition ? Il permet d'écrire la définition de façon factuelle
   et l'appréciation du point de vue du marxisme révolutionnaire à part, ce qui reste lisible pour un public large.
2. **Mots d'ordre** : idées de type `slogan` (proposé) ou collection à part ?
3. **Pensée adverse** : périmètre limité aux idées qui ont pesé sur le mouvement ouvrier (proposé), ou plus large ?
4. **Courants** : un courant est une idée (`marxism`, `bolshevism`) ; le parti qui le porte reste une organisation.
   La timeline `bolshevism` est reliée à l'idée par le champ `timeline`.
5. **Ordre de travail** proposé : schéma et outil, puis les 55 idées en `draft` avec les œuvres et personnes manquantes,
   puis le visualiseur (vue « idées » d'abord, « courants » ensuite).
