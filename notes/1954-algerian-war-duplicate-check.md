---
id: 1954-algerian-war-duplicate-check
about: ['node:1954-algerian-war', 'node:1954-algerian-war-of-independence', 'node:1962-algerian-independence']
tags: [verification, a-completer]
sources:
- {ref: wp-en-algerian-war}
- {ref: universalis-algeria-chronology}
status: draft
---

# Guerre d'Algérie : nœud world et sous-timeline française

**À vérifier :**

1. Le nœud `world` « Guerre d'Algérie » (1er novembre 1954 → 19 mars 1962, cessez-le-feu) a reçu comme second parent la sous-timeline française « Guerre d'Algérie (1954-1962) », qui va jusqu'à l'indépendance (5 juillet 1962). Les deux titres sont presque identiques et le nœud apparaît comme doublon dans la frise.
2. La sous-timeline a deux parents (Quatrième et Cinquième République) : les deux avertissements de débordement sont attendus.
3. Indépendance : *Algerian War* signale que de Gaulle reconnaît l'indépendance le 3 juillet et que le 5 juillet est la date proclamée par l'Exécutif provisoire ; Universalis donne le 3 juillet.

**Choix retenu :** les deux nœuds coexistent ; possibilité de passer le nœud `world` en `disabled` ou de retirer son second parent.
