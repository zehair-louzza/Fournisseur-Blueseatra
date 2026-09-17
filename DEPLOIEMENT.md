# Déploiement

## Architecture

| Composant | Hébergement | Rôle |
|---|---|---|
| Backend FastAPI | Render — service web (`rootDir: backend`) | API `/api/*` |
| Frontend React | Render — site statique (`rootDir: frontend`) | Interface |
| Base de données | Supabase Postgres, schéma `fournisseur` | Articles, offres, projets |

Le schéma `fournisseur` est **séparé du schéma `blueseatra`** qui porte les
données de production du SaaS : les deux ne se touchent pas.

## Stockage

Les documents sont stockés en JSONB (`id text primary key, doc jsonb`), un par
table/collection : `articles`, `projects`, `sources`, `parametres`, `controls`,
`synthese`. Ce choix conserve la souplesse de schéma nécessaire à un catalogue
fournisseur dont les colonnes varient d'une enseigne à l'autre, tout en
profitant des index et des agrégations SQL de Postgres.

`backend/db_postgres.py` expose l'interface documentaire utilisée par
`server.py`. Les deux statistiques agrégées (`/api/stats/by-lot`,
`/api/stats/by-supplier`) sont écrites directement en SQL.

## Variables d'environnement

### Backend

| Variable | Obligatoire | Description |
|---|---|---|
| `DATABASE_URL` | oui | Chaîne Postgres Supabase (**pooler**, port 5432). Le rôle dédié est `fournisseur_app`, pas le rôle `postgres`. |
| `DB_SCHEMA` | non | Schéma, par défaut `fournisseur` |
| `CORS_ORIGINS` | non | Origines autorisées, séparées par des virgules. Par défaut `*` — à restreindre à l'URL du frontend. |
| `DB_POOL_MAX` | non | Taille max du pool, par défaut 5 |
| `SUPABASE_URL` | oui | URL du projet Supabase (vérification des jetons) |
| `SUPABASE_ANON_KEY` | oui | Clé publiable Supabase |
| `SEED_TENANT_ID` | non | Société recevant le catalogue de démarrage. **Sans elle, aucun amorçage** : chaque nouveau compte part d'un catalogue vide, ce qui est le comportement attendu. |
| `AUTH_CACHE_SECONDS` | non | Durée de cache d'un jeton validé, par défaut 300 |

Passer par le **pooler** (`aws-0-eu-west-1.pooler.supabase.com`) et non par
`db.<ref>.supabase.co` : la connexion directe est en IPv6, que Render ne route
pas en sortie.

### Frontend

| Variable | Obligatoire | Description |
|---|---|---|
| `REACT_APP_BACKEND_URL` | oui | URL publique du backend, sans `/api` final |
| `REACT_APP_SUPABASE_URL` | oui | URL du projet Supabase |
| `REACT_APP_SUPABASE_ANON_KEY` | oui | Clé publiable Supabase |

Cette variable est lue **au moment du build**, pas à l'exécution : après l'avoir
changée, il faut relancer un build du site statique.

## Commandes

Backend — build `pip install -r requirements.txt`,
démarrage `uvicorn server:app --host 0.0.0.0 --port $PORT`,
contrôle de santé `/api/health`.

Ces deux commandes s'exécutent **depuis la racine du dépôt**, pas depuis
`backend/`. La racine porte donc un `requirements.txt` qui délègue à
`backend/requirements.txt`, et un `server.py` qui charge l'application réelle.
En local, `cd backend && uvicorn server:app` reste équivalent.

Frontend — build `npm install && npm run build`, dossier publié `build`.

## Cloisonnement par société

L'utilisateur se connecte avec son compte Supabase (le même que sur le SaaS).
Le backend ne vérifie pas la signature du jeton lui-même : il interroge Supabase
Auth, seule autorité sur sa validité. Cela évite de détenir le secret de
signature du projet.

La société est ensuite lue dans `blueseatra.tenant_users`. Une politique de
lecture seule (`fournisseur_app_lecture`) autorise le rôle applicatif à lire
cette table et `company_profiles` — rien d'autre du schéma de production.

**Toute** lecture et écriture passe par `db.for_tenant(...)`, qui injecte la
société dans chaque requête. Un code article n'est unique que dans le périmètre
d'une société : deux clients peuvent légitimement utiliser le même.

`appliquer_offres` **refuse** une base non cloisonnée. Ce garde-fou vient d'un
défaut réel : l'import avait été branché sur la base globale et son compte-rendu
restait plausible alors que l'écriture partait chez une autre société.

## Amorçage des données

Au premier démarrage, si la table `articles` est vide, le backend charge
`backend/catalogue_data.json` (397 articles). Les démarrages suivants ne
réécrivent rien.

## Tests

```bash
cd backend
pip install -r requirements-dev.txt
pytest tests/test_supplier_import.py          # unitaires, sans base
DATABASE_URL="postgresql://..." pytest tests/  # intégration, base réelle
```

Les tests d'intégration sont ignorés automatiquement si `DATABASE_URL` est absent.
