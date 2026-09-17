"""Authentification deleguee au SaaS Blueseatra.

Les comptes vivent dans le SaaS, pas ici : c'est lui qui detient les mots de
passe et qui signe les jetons. Cette application ne duplique donc ni compte ni
mot de passe. Elle presente le jeton recu a `/api/auth/me` du SaaS, seule
autorite sur sa validite, et en deduit l'utilisateur et sa societe.

Consequence voulue : aucun secret de signature n'est partage, et un compte
desactive cote SaaS perd l'acces ici des l'expiration du cache.
"""
from __future__ import annotations

import os
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx
from fastapi import Depends, Header, HTTPException

from database import db

SAAS_API_URL = os.environ.get("SAAS_API_URL", "").rstrip("/")

# Duree de mise en cache d'un jeton valide. Evite un aller-retour vers le SaaS
# a chaque requete tout en gardant une revocation rapide.
DUREE_CACHE = int(os.environ.get("AUTH_CACHE_SECONDS", "300"))

_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}


async def _profil_depuis_jeton(jeton: str) -> Dict[str, Any]:
    """Retourne le profil renvoye par le SaaS, ou leve 401."""
    entree = _cache.get(jeton)
    if entree and entree[0] > time.time():
        return entree[1]

    if not SAAS_API_URL:
        raise HTTPException(
            500,
            "Authentification non configuree : SAAS_API_URL doit etre definie "
            "cote serveur.",
        )

    try:
        async with httpx.AsyncClient(timeout=30) as http:
            reponse = await http.get(
                f"{SAAS_API_URL}/api/auth/me",
                headers={"Authorization": f"Bearer {jeton}"},
            )
    except httpx.RequestError as e:
        # Le SaaS injoignable n'est pas un probleme d'identifiants : le dire
        # clairement evite d'envoyer l'utilisateur se reconnecter pour rien.
        raise HTTPException(503, f"Service d'authentification injoignable : {e}")

    if reponse.status_code == 401:
        raise HTTPException(401, "Session expiree ou invalide. Reconnectez-vous.")
    if reponse.status_code != 200:
        raise HTTPException(503, "Le service d'authentification a repondu une erreur.")

    profil = reponse.json()
    if not (profil.get("tenant") or {}).get("id"):
        raise HTTPException(403, "Ce compte n'est rattache a aucune societe.")

    _cache[jeton] = (time.time() + DUREE_CACHE, profil)
    return profil


async def connexion_saas(email: str, mot_de_passe: str) -> Dict[str, Any]:
    """Relaie la connexion vers le SaaS et renvoie son jeton.

    Le navigateur ne peut pas appeler le SaaS directement : son domaine n'est
    pas dans les origines autorisees de ce service, et l'y ajouter reviendrait
    a modifier la production. Le relais garde donc une seule origine cote
    navigateur, sans toucher au SaaS.
    """
    if not SAAS_API_URL:
        raise HTTPException(500, "SAAS_API_URL doit etre definie cote serveur.")

    try:
        async with httpx.AsyncClient(timeout=60) as http:
            reponse = await http.post(
                f"{SAAS_API_URL}/api/auth/login",
                json={"email": email.strip().lower(), "password": mot_de_passe},
            )
    except httpx.RequestError as e:
        raise HTTPException(503, f"Service d'authentification injoignable : {e}")

    if reponse.status_code == 401:
        raise HTTPException(401, "Identifiants incorrects.")
    if reponse.status_code == 403:
        raise HTTPException(403, "Ce compte n'est rattache a aucune societe.")
    if reponse.status_code != 200:
        raise HTTPException(503, "Le service d'authentification a repondu une erreur.")

    return reponse.json()


class Identite:
    def __init__(self, user_id: str, email: str, tenant_id: str,
                 societes: Optional[List[Dict[str, str]]] = None):
        self.user_id = user_id
        self.email = email
        self.tenant_id = tenant_id
        self.societes = societes or []


async def identite_courante(
    authorization: Optional[str] = Header(None),
    x_tenant_id: Optional[str] = Header(None),
) -> Identite:
    """Dependance FastAPI : identifie l'appelant et sa societe active."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Authentification requise.")
    jeton = authorization.split(" ", 1)[1].strip()

    profil = await _profil_depuis_jeton(jeton)
    utilisateur = profil.get("user") or {}
    active = profil.get("tenant") or {}
    societes = [
        {"tenant_id": t["id"], "nom": t.get("name") or "Societe sans nom"}
        for t in (profil.get("tenants") or [])
        if t.get("id")
    ]

    tenant_id = active["id"]
    if x_tenant_id and x_tenant_id != tenant_id:
        # Changement de societe : n'accepter que celles auxquelles le SaaS
        # declare l'utilisateur rattache. Ne jamais faire confiance a l'en-tete.
        if x_tenant_id not in {s["tenant_id"] for s in societes}:
            raise HTTPException(403, "Acces refuse a cette societe.")
        tenant_id = x_tenant_id

    return Identite(
        user_id=utilisateur.get("id") or "",
        email=utilisateur.get("email") or "",
        tenant_id=tenant_id,
        societes=societes or [{"tenant_id": tenant_id,
                               "nom": active.get("name") or "Societe sans nom"}],
    )


async def base_du_tenant(identite: Identite = Depends(identite_courante)):
    """Dependance FastAPI : base de donnees restreinte a la societe appelante."""
    return db.for_tenant(identite.tenant_id)
