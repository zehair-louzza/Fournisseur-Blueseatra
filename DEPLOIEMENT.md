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
| `SAAS_API_URL` | oui | URL de l'API Blueseatra (vérification des jetons), ex. `https://blueseatra-api.onrender.com` |
| `SEED_TENANT_ID` | non | Société recevant le catalogue de démarrage. **Sans elle, aucun amorçage** : chaque nouveau compte part d'un catalogue vide, ce qui est le comportement attendu. |
| `AUTH_CACHE_SECONDS` | non | Durée de cache d'un jeton validé, par défaut 300 |

Passer par le **pooler** (`aws-0-eu-west-1.pooler.supabase.com`) et non par
`db.<ref>.supabase.co` : la connexion directe est en IPv6, que Render ne route
pas en sortie.

### Frontend

| Variable | Obligatoire | Description |
|---|---|---|
| `REACT_APP_BACKEND_URL` | oui | URL publique du backend, sans `/api` final |
| `REACT_APP_SAAS_API_URL` | oui | URL de l'API Blueseatra (écran de connexion) |

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

Frontend — build `cd frontend && npm install && npm run build`, dossier publié
`frontend/build`.

Le routage utilise `HashRouter` (URLs en `/#/catalogue`). Un hébergement
statique renvoie sinon une 404 sur toute sous-page ouverte directement ou
rafraîchie. Pour des URLs sans `#`, ajouter dans l'onglet
**Redirects/Rewrites** du site une règle `/*` → `/index.html` en **Rewrite**,
puis repasser à `BrowserRouter` dans `frontend/src/App.js`.

## Cloisonnement par société

Les comptes vivent dans le **SaaS Blueseatra**, pas ici : cette application ne
stocke ni compte ni mot de passe. L'écran de connexion appelle
`POST /api/auth/login` du SaaS, qui renvoie un jeton.

Le backend ne vérifie pas la signature du jeton lui-même : il le présente à
`GET /api/auth/me` du SaaS, seule autorité sur sa validité, et en déduit
l'utilisateur et sa société. Aucun secret de signature n'est partagé, et le
rôle applicatif n'a **aucun accès** au schéma `blueseatra` de production.

Attention : le SaaS n'utilise pas Supabase Auth. La table `auth.users` est vide,
les comptes sont dans `blueseatra.users` avec des empreintes bcrypt. Toute
tentative d'authentifier via Supabase Auth échouerait donc pour tout le monde.

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
