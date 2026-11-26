# Veille mensuelle des timelines

Une tâche planifiée tourne le 1er de chaque mois. Elle cherche les évènements récents à ajouter aux timelines et propose les ajouts dans une **Pull Request**. Rien n'arrive sur `main`, donc sur le site public, sans relecture et merge par Dom.

## Le curseur : `veille/watch.json`

Chaque timeline active y porte `last_checked` (AAAA-MM) : la recherche a été faite jusqu'à la fin de ce mois. Ce curseur n'est **pas** la date du dernier évènement : il avance même quand rien n'a été ajouté.

- `group` : 0 = revue chaque mois (`world`) ; 1, 2, 3 = rotation trimestrielle (groupe 1 en janvier, avril, juillet, octobre ; groupe 2 en février, mai, août, novembre ; groupe 3 en mars, juin, septembre, décembre).
- Une timeline **en retard** (plus de 3 mois à couvrir) est traitée quel que soit son groupe.
- `lag_months` (1) : recul. Le 1er décembre, la période couverte s'arrête fin octobre, pour ne retenir que des évènements dont l'existence fait consensus.
- `active: false` : timeline close (bolchevisme, stalinisme), hors veille.
- Une nouvelle racine doit y être ajoutée (`validate` le signale), avec son groupe et un `last_checked` réaliste.

Commandes :

```
py -m tldb watch                    plan du mois : timelines à traiter, période, nombre de nœuds ongoing
py -m tldb watch --all              idem + état de tous les curseurs
py -m tldb watch --ongoing france   nœuds ongoing d'une timeline (à réviser)
py -m tldb watch --done france      avancer le curseur jusqu'à la fin de la période couverte
```

## Procédure de la tâche

Cette procédure complète la skill `timeline-db` (copie : `docs/skill/SKILL.md`), dont toutes les règles de rédaction s'appliquent. Dans la tâche planifiée, deux points de la skill changent : le clone du dépôt est la base de travail (§ 1), et les commits sont permis, **sur la branche de veille uniquement**.

1. **Préparer.** Cloner `dkuster/timelines`, `pip install -r requirements.txt`, créer la branche `veille/AAAA-MM-JJ` (date du jour). Lancer `python -m tldb watch` : c'est la liste de travail, dans l'ordre affiché (la plus en retard d'abord).
2. **Pour chaque timeline de la liste :**
   1. Inventaire : `tldb tree <racine> --depth 2`, les derniers nœuds du fichier, `tldb watch --ongoing <racine>`.
   2. Recherche web des évènements de la période (`since` → `until`). L'axe principal est l'évolution des rapports de force entre les classes et de la conscience révolutionnaire : grèves et mouvements de masse, élections et gouvernements qui changent ces rapports de force, lois sociales ou répressives, répression, coups d'État, guerres, crises économiques, fondations, scissions et congrès du mouvement ouvrier. Pour `world` : les six thèmes (économie, guerres, États, catastrophes, sciences, culture) et l'écologie. Pour `marxism` et `trotskyism` : congrès, fondations, scissions et publications marquantes.
   3. Sélection : seulement les évènements dont l'existence fait consensus. Pas de faits divers, de sondages ni de simples déclarations. Environ 5 nœuds par trimestre couvert au plus (20 au plus par timeline et par passage). Avant d'ajouter, vérifier avec `tldb index --grep` que le nœud n'existe pas déjà (dans cette timeline ou une autre) ; si oui, ajouter un rattachement plutôt qu'un doublon.
   4. Révision des nœuds ongoing : si une période s'est clairement terminée (guerre, gouvernement, mouvement), poser `end` et retirer `ongoing` sur un nœud `draft` ; pour un nœud `final`, ne rien modifier et le proposer dans le rapport.
   5. Écrire selon la skill : `status: draft`, identifiants en anglais, fr/en/de avec `draft`, sources `website` réellement ouvertes, lieux avec `kind` et `coords`, notes de vérification dans `notes/`.
   6. `python -m tldb watch --done <racine>`, puis `python -m tldb validate --no-media-files` (0 erreur due aux ajouts), `python -m tldb format`, puis un commit : `veille(<racine>): <since> → <until>, N nœud(s)`.
   Une timeline sans rien à ajouter avance quand même son curseur (commit « rien à ajouter »).
3. **Budget.** Le premier passage (rattrapage) est long. Traiter les timelines une par une, avec un commit chacune. Si le travail devient trop long pour une seule session, s'arrêter après la timeline en cours : les autres gardent leur curseur, restent en retard et seront reprises au passage suivant.
4. **Rapport** dans `docs/rapports/veille-AAAA-MM-JJ.md`, repris dans la description de la PR. Pour chaque timeline traitée : nœuds ajoutés (id, date, titre), ongoing clos ou proposés à la clôture, candidats écartés avec la raison en une ligne, notes de vérification créées. Puis : timelines non traitées, résultat de la validation.
5. **Publier.** Pousser la branche et ouvrir une PR vers `main` intitulée « Veille du AAAA-MM-JJ ». Ne jamais pousser sur `main`, ne jamais merger. Si aucune timeline n'a reçu d'ajout, ouvrir quand même la PR : elle avance les curseurs.

## Relecture par Dom

La CI vérifie la PR (validation, format, tests, build). Dom relit le diff et le rapport, corrige ou retire ce qui ne convient pas, puis merge. Les candidats écartés à tort peuvent être ajoutés à la main ; si un critère de sélection se révèle mauvais, corriger cette page : la tâche la relit à chaque passage.
