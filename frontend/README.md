# Interface Fournisseur Blueseatra

Site React du module d'achats matériels : tableau de bord, catalogue, comparateur de prix, estimateur de projet, fournisseurs, alertes qualité. Connexion par les comptes du SaaS [Blueseatra](https://github.com/zehair-louzza/Blueseatra).

## Démarrage

```bash
npm install
REACT_APP_BACKEND_URL=http://localhost:8002 REACT_APP_SAAS_API_URL=https://blueseatra-api.onrender.com npm start
npm run build      # version de production dans build/
```

| Variable | Rôle |
|---|---|
| `REACT_APP_BACKEND_URL` | URL de l'API du module Fournisseur |
| `REACT_APP_SAAS_API_URL` | URL de l'API Blueseatra, qui valide les jetons |

Hébergement : site statique sur Render (HashRouter). Architecture, routes et règles de cloisonnement : [README du dépôt](../README.md) et [DEPLOIEMENT.md](../DEPLOIEMENT.md).

## Licence

Logiciel propriétaire, tous droits réservés. Titulaire : Zehair Louzza, exploitant le nom commercial « Blueseatra ». Voir [LICENSE](../LICENSE).
