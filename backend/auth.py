"""Authentification et resolution du tenant.

Le client se connecte avec son compte Supabase (le meme que sur le SaaS) et
transmet son jeton. Le backend ne verifie pas la signature lui-meme : il
interroge Supabase Auth, qui est la seule autorite sur la validite d'un
jeton. Cela evite d'avoir a detenir le secret de signature du projet.

Le tenant est ensuite lu dans `blueseatra.tenant_users`, la table qui fait
deja autorite cote SaaS. Aucun tenant n'est invente ni devine ici.
"""
from __future__ import annotations

import os
import time
from typing import Dict, Optional, Tuple

import httpx
from fastapi import Depends, Header, HTTPException

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

# Duree de mise en cache d'un jeton valide. Evite un aller-retour vers
# Supabase Auth a chaque requete tout en gardant une revocation rapide.
DUREE_CACHE = int(os.environ.get("AUTH_CACHE_SECONDS", "300"))

_cache: Dict[str, Tuple[float, str, str]] = {}  # jeton -> (peremption, user_id, email)


async def _utilisateur_depuis_jeton(jeton: str) -> Tuple[str, str]:
    """Retourne (user_id, email) si le jeton est valide, sinon leve 401."""
    entree = _cache.get(jeton)
    if entree and entree[0] > time.time():
        return entree[1], entree[2]

    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(
            500,
            "Authentification non configuree : SUPABASE_URL et SUPABASE_ANON_KEY "
            "doivent etre definies cote serveur.",
        )

    async with httpx.AsyncClient(timeout=10) as http:
        reponse = await http.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"Authorization": f"Bearer {jeton}", "apikey": SUPABASE_ANON_KEY},
        )

    if reponse.status_code != 200:
        raise HTTPException(401, "Session expiree ou invalide. Reconnectez-vous.")

    donnees = reponse.json()
    user_id = donnees.get("id")
    if not user_id:
        raise HTTPException(401, "Jeton sans identifiant utilisateur.")

    email = donnees.get("email") or ""
    _cache[jeton] = (time.time() + DUREE_CACHE, user_id, email)
    return user_id, email


class Identite:
    def __init__(self, user_id: str, email: str, tenant_id: str):
        self.user_id = user_id
        self.email = email
        self.tenant_id = tenant_id


async def identite_courante(
    authorization: Optional[str] = Header(None),
    x_tenant_id: Optional[str] = Header(None),
) -> Identite:
    """Dependance FastAPI : identifie l'appelant et son tenant."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Authentification requise.")
    jeton = authorization.split(" ", 1)[1].strip()

    user_id, email = await _utilisateur_depuis_jeton(jeton)

    from server import db  # import differe : evite un cycle a l'import

    lignes = await db.raw(
        "SELECT tenant_id FROM blueseatra.tenant_users WHERE user_id = $1", user_id
    )
    tenants = [l["tenant_id"] for l in lignes]
    if not tenants:
        raise HTTPException(
            403,
            "Ce compte n'est rattache a aucune societe. Contactez votre "
            "administrateur Blueseatra.",
        )

    # Un utilisateur peut appartenir a plusieurs societes : il choisit
    # laquelle via l'en-tete, sinon la premiere par defaut.
    if x_tenant_id:
        if x_tenant_id not in tenants:
            raise HTTPException(403, "Acces refuse a cette societe.")
        tenant_id = x_tenant_id
    else:
        tenant_id = sorted(tenants)[0]

    return Identite(user_id, email, tenant_id)


async def base_du_tenant(identite: Identite = Depends(identite_courante)):
    """Dependance FastAPI : base de donnees restreinte au tenant appelant."""
    from server import db

    return db.for_tenant(identite.tenant_id)
