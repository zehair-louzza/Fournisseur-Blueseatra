"""Point d'entree ASGI a la racine du depot.

Render execute les commandes de build et de demarrage depuis la racine, alors
que l'application vit dans `backend/`. Ce module charge l'application reelle
sous un nom distinct (`api`) pour qu'il n'y ait aucune ambiguite entre ce
fichier et `backend/server.py`, qui portent tous deux le nom `server`.

Demarrage en production : `uvicorn server:app` depuis la racine.
Developpement local, equivalent : `cd backend && uvicorn server:app`.
"""
import importlib.util
import pathlib
import sys

BACKEND = pathlib.Path(__file__).resolve().parent / "backend"

# Les modules de l'application s'importent entre eux sans prefixe
# (`from auth import ...`) : leur dossier doit donc etre sur le chemin.
sys.path.insert(0, str(BACKEND))

_spec = importlib.util.spec_from_file_location("api", BACKEND / "server.py")
_module = importlib.util.module_from_spec(_spec)
sys.modules["api"] = _module
_spec.loader.exec_module(_module)

app = _module.app
