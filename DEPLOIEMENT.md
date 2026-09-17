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

Passer par le **pooler** (`aws-0-eu-west-1.pooler.supabase.com`) et non par
`db.<ref>.supabase.co` : la connexion directe est en IPv6, que Render ne route
pas en sortie.

### Frontend

| Variable | Obligatoire | Description |
|---|---|---|
| `REACT_APP_BACKEND_URL` | oui | URL publique du backend, sans `/api` final |

Cette variable est lue **au moment du build**, pas à l'exécution : après l'avoir
changée, il faut relancer un build du site statique.

## Commandes

Backend — build `pip install -r requirements.txt`,
démarrage `uvicorn server:app --host 0.0.0.0 --port $PORT`,
contrôle de santé `/api/health`.

Frontend — build `npm install && npm run build`, dossier publié `build`.

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
