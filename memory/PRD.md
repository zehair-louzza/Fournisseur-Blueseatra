# PRD — BlueSeaTra · Gestion des Achats Matériels TCE

## Problème initial (verbatim)
« Une application installée localement sur Windows pour gérer l'achat des matériels de notre entreprise. Bien soignée, moderne, lisible et attractive, avec des calculs bien précis. Basée sur le fichier fourni (Catalogue TCE — prix fournisseurs réels 2026). Avec des KPI, indicateurs et visualisations pour estimer des projets. »

## Choix utilisateur
- Application **web moderne** (React + FastAPI + MongoDB), accessible depuis Windows via navigateur.
- Fonction principale : **catalogue matériels + prix fournisseurs**.
- KPI : coût total estimé projet, répartition par lot, analyse fournisseurs, alertes qualité.
- **Accès libre** (pas de login).
- Français, devise Euro.
- Objectif futur : intégration dans le SaaS **blueseatra.com** → architecture modulaire prévue.
- TVA sélectionnable (0 / 5,5 / 10 / 20 %) et librement modifiable dans l'estimateur.

## Architecture
- Backend FastAPI (`/api/*`), MongoDB. Seed automatique au démarrage depuis `/app/backend/catalogue_data.json` (397 articles, généré via `/app/ingest.py` depuis l'Excel).
- Frontend React (React Router, Recharts, framer-motion, sonner, shadcn/ui). Thème clair/sombre. Panier persistant en localStorage.
- Calculs précis côté backend (`compute_line`/`compute_project`) et miroir côté frontend :
  - Prix vente HT = Prix achat HT / (1 − Marge%)
  - TVA = Vente HT × TVA%
  - TTC = Vente HT + TVA

## Implémenté (2026-06)
- **Tableau de bord** : 4 KPI, graphique valeur par lot, donut fiabilité, synthèse par lot. Bannière pro sobre.
- **Catalogue** : recherche, filtres (lot/fournisseur/fiabilité), tri, pagination, dialog détail avec offres multi-fournisseurs, ajout au panier.
- **Estimateur de projet** : lignes éditables (marge, quantité, TVA), marge globale + presets TVA globaux + TVA libre, récap chiffrage (achat/marge/vente HT/TVA/TTC), répartition par lot, sauvegarde/chargement/suppression de projets.
- **Fournisseurs** : graphique + cartes analytiques par enseigne (9 fournisseurs).
- **Alertes qualité** : onglets À compléter / À vérifier / Contrôles cohérence, recherche.
- **Paramètres** : paramètres de chiffrage + sources de prix.

## Tests
- Backend : 15/15 pytest OK, calculs vérifiés (8,46 € × 10, marge 25 %, TVA 20 % → 112,80 / 22,56 / 135,36 €).
- Frontend : tous les flux OK. Bug crash recherche Alertes corrigé (coercition String).

## Backlog (P1/P2)
- Export PDF/Excel des devis (P1).
- Comparateur de prix multi-fournisseurs par article dédié (P2).
- Import/mise à jour du catalogue via upload Excel (P2).
- Auth + multi-tenant pour intégration blueseatra.com (P2).
