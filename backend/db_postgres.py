"""Couche de donnees Postgres (Supabase) exposant l'interface utilisee
jusqu'ici par le client Mongo.

Chaque "collection" est une table `<schema>.<nom>` de forme
`(id text primary key, doc jsonb)`. Les documents restent donc des objets
JSON libres, ce qui evite de figer un schema relationnel sur un catalogue
fournisseur dont les colonnes varient d'une enseigne a l'autre.

Seules les operations reellement utilisees par l'application sont
implementees. Les agregations ne sont PAS traduites ici : les deux
statistiques qui en avaient besoin sont ecrites en SQL directement dans
`server.py` via `db.raw(...)`, ce qui est plus lisible et plus rapide
qu'un traducteur de pipeline generique.
"""
from __future__ import annotations

import json
import os
import uuid
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import asyncpg


# --------------------------------------------------------------------------
# Traduction d'un filtre document vers une clause SQL
# --------------------------------------------------------------------------

def _build_condition(champ: str, valeur: Any, params: List[Any]) -> str:
    """Traduit `{champ: valeur}` en une condition SQL sur la colonne `doc`."""
    if isinstance(valeur, dict) and any(k.startswith("$") for k in valeur):
        conditions = []
        for operateur, operande in valeur.items():
            if operateur == "$regex":
                # `$options: "i"` => insensible a la casse (~*), sinon ~
                sensible = "i" not in (valeur.get("$options") or "")
                params.append(operande)
                conditions.append(
                    f"doc->>'{champ}' {'~' if sensible else '~*'} ${len(params)}"
                )
            elif operateur == "$options":
                continue  # traite avec $regex
            elif operateur == "$in":
                params.append([str(v) for v in operande])
                conditions.append(f"doc->>'{champ}' = ANY(${len(params)}::text[])")
            elif operateur == "$nin":
                params.append([str(v) for v in operande])
                conditions.append(
                    f"(doc->>'{champ}' IS NULL OR NOT (doc->>'{champ}' = ANY(${len(params)}::text[])))"
                )
            elif operateur == "$ne":
                if operande is None:
                    conditions.append(f"doc->>'{champ}' IS NOT NULL")
                else:
                    params.append(str(operande))
                    conditions.append(
                        f"(doc->>'{champ}' IS NULL OR doc->>'{champ}' <> ${len(params)})"
                    )
            elif operateur in ("$gt", "$gte", "$lt", "$lte"):
                signes = {"$gt": ">", "$gte": ">=", "$lt": "<", "$lte": "<="}
                params.append(float(operande))
                conditions.append(
                    f"(doc->>'{champ}')::numeric {signes[operateur]} ${len(params)}"
                )
            elif operateur == "$exists":
                conditions.append(
                    f"doc ? '{champ}'" if operande else f"NOT (doc ? '{champ}')"
                )
            else:
                raise NotImplementedError(f"Operateur non supporte : {operateur}")
        return "(" + " AND ".join(conditions) + ")" if conditions else "TRUE"

    if valeur is None:
        return f"doc->>'{champ}' IS NULL"

    if isinstance(valeur, bool):
        params.append(valeur)
        return f"(doc->>'{champ}')::boolean = ${len(params)}"

    params.append(str(valeur))
    return f"doc->>'{champ}' = ${len(params)}"


def _build_where(filtre: Optional[Dict[str, Any]], params: List[Any]) -> str:
    """Construit la clause WHERE complete (sans le mot-cle WHERE)."""
    if not filtre:
        return "TRUE"
    morceaux = []
    for champ, valeur in filtre.items():
        if champ == "$or":
            sous = [_build_where(sf, params) for sf in valeur]
            morceaux.append("(" + " OR ".join(sous) + ")")
        elif champ == "$and":
            sous = [_build_where(sf, params) for sf in valeur]
            morceaux.append("(" + " AND ".join(sous) + ")")
        else:
            morceaux.append(_build_condition(champ, valeur, params))
    return " AND ".join(morceaux) if morceaux else "TRUE"


def _appliquer_projection(
    doc: Dict[str, Any], row_id: str, projection: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    """Reproduit la semantique des projections : `{"champ": 1}` limite aux
    champs demandes, `{"_id": 0}` retire l'identifiant technique.

    `_id` est expose par defaut car du code appelant teste la verite du
    document retourne avec la projection `{"_id": 1}` : renvoyer un
    dictionnaire vide serait evalue comme faux et inverserait la logique.
    """
    if not projection:
        return {"_id": row_id, **doc}

    inclusions = [k for k, v in projection.items() if v and k != "_id"]
    garder_id = projection.get("_id", 1)

    if inclusions:
        sortie = {k: doc[k] for k in inclusions if k in doc}
    else:
        exclusions = {k for k, v in projection.items() if not v and k != "_id"}
        sortie = {k: v for k, v in doc.items() if k not in exclusions}

    if garder_id:
        sortie = {"_id": row_id, **sortie}
    return sortie


# --------------------------------------------------------------------------
# Curseur
# --------------------------------------------------------------------------

class Cursor:
    """Curseur paresseux : la requete n'est envoyee qu'a la consommation."""

    def __init__(self, collection: "Collection", filtre, projection):
        self._collection = collection
        self._filtre = filtre
        self._projection = projection
        self._sort: List[Tuple[str, int]] = []
        self._skip = 0
        self._limit: Optional[int] = None
        self._buffer: Optional[List[Dict[str, Any]]] = None

    def sort(self, cle, direction: int = 1) -> "Cursor":
        if isinstance(cle, str):
            self._sort = [(cle, direction)]
        else:  # liste de tuples [("code", 1)]
            self._sort = list(cle)
        return self

    def skip(self, n: int) -> "Cursor":
        self._skip = n
        return self

    def limit(self, n: int) -> "Cursor":
        self._limit = n
        return self

    async def _executer(self, plafond: Optional[int] = None) -> List[Dict[str, Any]]:
        params: List[Any] = []
        where = _build_where(self._filtre, params)
        sql = f"SELECT id, doc FROM {self._collection.qualified} WHERE {where}"

        if self._sort:
            # Le tri porte sur `doc->'champ'` (et non `->>`) : l'ordre jsonb
            # compare les nombres numeriquement, la ou une comparaison texte
            # placerait "100" avant "9".
            clauses = [
                f"doc->'{champ}' {'ASC' if sens >= 0 else 'DESC'}"
                for champ, sens in self._sort
            ]
            sql += " ORDER BY " + ", ".join(clauses)

        limite = self._limit
        if plafond is not None:
            limite = plafond if limite is None else min(limite, plafond)
        if limite is not None:
            params.append(limite)
            sql += f" LIMIT ${len(params)}"
        if self._skip:
            params.append(self._skip)
            sql += f" OFFSET ${len(params)}"

        lignes = await self._collection.db.fetch(sql, *params)
        return [
            _appliquer_projection(json.loads(l["doc"]), l["id"], self._projection)
            for l in lignes
        ]

    async def to_list(self, longueur: Optional[int] = None) -> List[Dict[str, Any]]:
        return await self._executer(longueur)

    def __aiter__(self) -> "Cursor":
        self._buffer = None
        self._index = 0
        return self

    async def __anext__(self) -> Dict[str, Any]:
        if self._buffer is None:
            self._buffer = await self._executer()
        if self._index >= len(self._buffer):
            raise StopAsyncIteration
        doc = self._buffer[self._index]
        self._index += 1
        return doc


class _Resultat:
    """Valeur de retour minimale des ecritures (equivalent pymongo)."""

    def __init__(self, matched: int = 0, modified: int = 0, deleted: int = 0):
        self.matched_count = matched
        self.modified_count = modified
        self.deleted_count = deleted


# --------------------------------------------------------------------------
# Collection
# --------------------------------------------------------------------------

class Collection:
    def __init__(self, db: "PostgresDatabase", nom: str):
        self.db = db
        self.nom = nom
        self.qualified = f'"{db.schema}"."{nom}"'

    # ---- lecture ----

    def find(self, filtre=None, projection=None) -> Cursor:
        return Cursor(self, filtre, projection)

    async def find_one(self, filtre=None, projection=None) -> Optional[Dict[str, Any]]:
        resultats = await Cursor(self, filtre, projection).to_list(1)
        return resultats[0] if resultats else None

    async def count_documents(self, filtre=None) -> int:
        params: List[Any] = []
        where = _build_where(filtre, params)
        return await self.db.fetchval(
            f"SELECT count(*) FROM {self.qualified} WHERE {where}", *params
        )

    async def distinct(self, champ: str, filtre=None) -> List[Any]:
        params: List[Any] = []
        where = _build_where(filtre, params)
        lignes = await self.db.fetch(
            f"SELECT DISTINCT doc->>'{champ}' AS v FROM {self.qualified} WHERE {where}",
            *params,
        )
        return [l["v"] for l in lignes if l["v"] is not None]

    # ---- ecriture ----

    def _identifiant(self, doc: Dict[str, Any]) -> str:
        return str(doc.get("id") or doc.get("code") or uuid.uuid4())

    async def insert_one(self, doc: Dict[str, Any]) -> _Resultat:
        doc = {k: v for k, v in doc.items() if k != "_id"}
        await self.db.execute(
            f"INSERT INTO {self.qualified} (id, doc) VALUES ($1, $2::jsonb)",
            self._identifiant(doc),
            json.dumps(doc),
        )
        return _Resultat(matched=1, modified=1)

    async def insert_many(self, docs: Iterable[Dict[str, Any]]) -> _Resultat:
        lignes = []
        for d in docs:
            d = {k: v for k, v in dict(d).items() if k != "_id"}
            lignes.append((self._identifiant(d), json.dumps(d)))
        if not lignes:
            return _Resultat()
        await self.db.executemany(
            f"INSERT INTO {self.qualified} (id, doc) VALUES ($1, $2::jsonb) "
            f"ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc",
            lignes,
        )
        return _Resultat(matched=len(lignes), modified=len(lignes))

    async def update_one(self, filtre, update) -> _Resultat:
        if "$set" not in update:
            raise NotImplementedError("Seul $set est supporte")
        modifications = {k: v for k, v in update["$set"].items() if k != "_id"}
        params: List[Any] = [json.dumps(modifications)]
        where = _build_where(filtre, params)
        # `||` fusionne au premier niveau : c'est exactement la semantique de
        # $set sur des champs de premier niveau, seuls utilises ici.
        sql = (
            f"UPDATE {self.qualified} SET doc = doc || $1::jsonb "
            f"WHERE id = (SELECT id FROM {self.qualified} WHERE {where} LIMIT 1)"
        )
        resultat = await self.db.execute(sql, *params)
        nb = int(resultat.split()[-1]) if resultat else 0
        return _Resultat(matched=nb, modified=nb)

    async def replace_one(self, filtre, doc, upsert: bool = False) -> _Resultat:
        doc = {k: v for k, v in dict(doc).items() if k != "_id"}
        params: List[Any] = [json.dumps(doc)]
        where = _build_where(filtre, params)
        resultat = await self.db.execute(
            f"UPDATE {self.qualified} SET doc = $1::jsonb "
            f"WHERE id = (SELECT id FROM {self.qualified} WHERE {where} LIMIT 1)",
            *params,
        )
        nb = int(resultat.split()[-1]) if resultat else 0
        if nb == 0 and upsert:
            await self.insert_one(doc)
            nb = 1
        return _Resultat(matched=nb, modified=nb)

    async def delete_one(self, filtre) -> _Resultat:
        params: List[Any] = []
        where = _build_where(filtre, params)
        resultat = await self.db.execute(
            f"DELETE FROM {self.qualified} "
            f"WHERE id = (SELECT id FROM {self.qualified} WHERE {where} LIMIT 1)",
            *params,
        )
        return _Resultat(deleted=int(resultat.split()[-1]) if resultat else 0)

    async def delete_many(self, filtre) -> _Resultat:
        params: List[Any] = []
        where = _build_where(filtre, params)
        resultat = await self.db.execute(
            f"DELETE FROM {self.qualified} WHERE {where}", *params
        )
        return _Resultat(deleted=int(resultat.split()[-1]) if resultat else 0)

    async def create_index(self, *_args, **_kwargs) -> None:
        """Sans effet : les index sont crees par la migration de schema."""
        return None


# --------------------------------------------------------------------------
# Base
# --------------------------------------------------------------------------

class PostgresDatabase:
    """Point d'entree. Le pool est cree paresseusement, a la premiere
    requete, car il doit appartenir a la boucle evenementielle en cours."""

    def __init__(self, dsn: str, schema: str = "fournisseur"):
        self.dsn = dsn
        self.schema = schema
        self._pool: Optional[asyncpg.Pool] = None

    def __getitem__(self, nom: str) -> Collection:
        return Collection(self, nom)

    def __getattr__(self, nom: str) -> Collection:
        if nom.startswith("_"):
            raise AttributeError(nom)
        return Collection(self, nom)

    async def pool(self) -> asyncpg.Pool:
        if self._pool is None:
            self._pool = await asyncpg.create_pool(
                self.dsn,
                min_size=1,
                max_size=int(os.environ.get("DB_POOL_MAX", "5")),
                ssl="require",
                # Le pooler Supabase ne gere pas les requetes preparees
                # persistantes : les desactiver evite l'erreur
                # "prepared statement already exists" en mode transaction.
                statement_cache_size=0,
            )
        return self._pool

    async def fetch(self, sql: str, *params):
        pool = await self.pool()
        async with pool.acquire() as conn:
            return await conn.fetch(sql, *params)

    async def fetchval(self, sql: str, *params):
        pool = await self.pool()
        async with pool.acquire() as conn:
            return await conn.fetchval(sql, *params)

    async def execute(self, sql: str, *params) -> str:
        pool = await self.pool()
        async with pool.acquire() as conn:
            return await conn.execute(sql, *params)

    async def executemany(self, sql: str, lignes: Sequence[Tuple]) -> None:
        pool = await self.pool()
        async with pool.acquire() as conn:
            await conn.executemany(sql, lignes)

    async def raw(self, sql: str, *params) -> List[Dict[str, Any]]:
        """Echappatoire pour les statistiques ecrites directement en SQL."""
        lignes = await self.fetch(sql, *params)
        return [dict(l) for l in lignes]

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None
