# Recherche du catalogue par mots

En production depuis le 9 octobre 2026 (PR #4, commit `78e7e8b`, service Render `fournisseur-blueseatra-api`). Code : [`backend/recherche_mots.py`](../backend/recherche_mots.py).

## Règle

- **Chaque mot doit être trouvé** : chaque mot saisi doit figurer dans au moins un des six champs de l'article, dans n'importe quel ordre. Ces champs sont `article`, `code`, `marque`, `ref_fournisseur`, `ref_fabricant` et `designation_fournisseur`.
- **Variantes d'écriture ignorées** :
  - la casse et les accents ;
  - le pluriel simple (« sols » trouve « sol », « interrupteurs » trouve « interrupteur ») ;
  - la virgule décimale (« 2,5 » trouve « 2.5 ») ;
  - les exposants (« CX³ », « mm² »).
- **Sécurité** : les mots sont échappés, aucun caractère saisi n'est interprété comme un opérateur. Avant, « 2P+T » ne trouvait rien et « ( » provoquait une erreur SQL. Les valeurs sont transmises en paramètres liés, jamais concaténées dans le SQL.
- **Limites** : 12 mots au plus, 100 caractères au plus par mot.

## Mesures (lecture seule sur `fournisseur.articles`)

| Test | Avant (phrase entière) | Après (par mots) | Perdus |
|---|---:|---:|---:|
| 284 libellés réels de devis Blueseatra | 29 trouvés | 39 trouvés | 0 |
| 240 références (15 par lot, 16 lots), 1 486 requêtes | 57,2 % | 100 % | 0 |

Script et résultats détaillés : [`docs/mesures/2026-10-08-test-240-references.py`](mesures/2026-10-08-test-240-references.py) et [`.txt`](mesures/2026-10-08-test-240-references.txt).

## Ce que cette recherche ne fait pas

- **Phrases longues** : une demande de devis entière (« Remplacement cylindre porte arrière avec fourniture de 6 clés ») ne donne aucun résultat, car chaque mot est exigé. Mesure : 0 % sur des phrases de demande simulées.
- **Où c'est traité** : ces demandes passent par la chaîne G3 du SaaS Blueseatra (`backend/recherche_g3.py`). Extraction des fournitures, recherche par mots pondérée et BM25, puis choix par le modèle et validation humaine : 33 besoins retrouvés sur 40, sur 17 demandes réelles.
