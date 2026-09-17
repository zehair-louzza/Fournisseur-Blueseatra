"""Instance unique de la base, partagee par l'application et l'authentification.

Elle vit dans son propre module pour eviter un import circulaire : `auth.py`
a besoin de la base pour resoudre la societe d'un utilisateur, alors que
`server.py` a besoin de `auth.py` pour proteger ses routes.
"""
import os

from db_postgres import PostgresDatabase

# Stockage Postgres (Supabase), schema dedie `fournisseur` : isole des tables
# de production du SaaS, qui vivent dans le schema `blueseatra`.
db = PostgresDatabase(
    os.environ["DATABASE_URL"],
    schema=os.environ.get("DB_SCHEMA", "fournisseur"),
)
