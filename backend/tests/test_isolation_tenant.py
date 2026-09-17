"""Verifie qu'aucune donnee ne franchit la frontiere entre deux clients.

Test direct de la couche de donnees, sans passer par HTTP : c'est elle qui
porte la garantie d'isolation.
"""
import asyncio
import os
import sys
import uuid
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"), reason="DATABASE_URL absent"
)

TENANT_A = f"test-a-{uuid.uuid4()}"
TENANT_B = f"test-b-{uuid.uuid4()}"


async def _scenario():
    from db_postgres import PostgresDatabase

    base = PostgresDatabase(os.environ["DATABASE_URL"], schema="fournisseur")
    a = base.for_tenant(TENANT_A)
    b = base.for_tenant(TENANT_B)
    resultats = {}
    try:
        # Les deux clients utilisent DELIBEREMENT le meme code article :
        # un code n'est unique que dans le perimetre d'un client.
        await a.articles.insert_one(
            {"code": "ART-1", "article": "Cable client A", "lot": "ELEC",
             "prix_achat_ht": 10.0, "statut": "fiable", "fournisseur_retenu": "Rexel"}
        )
        await b.articles.insert_one(
            {"code": "ART-1", "article": "Cable client B", "lot": "PLOMB",
             "prix_achat_ht": 99.0, "statut": "fiable", "fournisseur_retenu": "SFIC"}
        )

        resultats["a_voit"] = await a.articles.count_documents({})
        resultats["b_voit"] = await b.articles.count_documents({})
        resultats["a_article"] = (await a.articles.find_one({"code": "ART-1"}))["article"]
        resultats["b_article"] = (await b.articles.find_one({"code": "ART-1"}))["article"]
        resultats["a_lots"] = await a.articles.distinct("lot")
        resultats["b_lots"] = await b.articles.distinct("lot")

        # Une ecriture de A ne doit pas toucher la fiche de B
        await a.articles.update_one({"code": "ART-1"}, {"$set": {"prix_achat_ht": 42.0}})
        resultats["a_prix"] = (await a.articles.find_one({"code": "ART-1"}))["prix_achat_ht"]
        resultats["b_prix"] = (await b.articles.find_one({"code": "ART-1"}))["prix_achat_ht"]

        # Une suppression de masse de A ne doit pas vider B
        await a.articles.delete_many({})
        resultats["a_apres_purge"] = await a.articles.count_documents({})
        resultats["b_apres_purge"] = await b.articles.count_documents({})
    finally:
        await a.articles.delete_many({})
        await b.articles.delete_many({})
        await base.close()
    return resultats


@pytest.fixture(scope="module")
def r():
    return asyncio.run(_scenario())


def test_chacun_ne_voit_que_son_article(r):
    assert r["a_voit"] == 1 and r["b_voit"] == 1


def test_meme_code_articles_differents(r):
    assert r["a_article"] == "Cable client A"
    assert r["b_article"] == "Cable client B"


def test_les_filtres_ne_fuient_pas(r):
    assert r["a_lots"] == ["ELEC"]
    assert r["b_lots"] == ["PLOMB"]


def test_ecriture_confinee(r):
    assert r["a_prix"] == 42.0
    assert r["b_prix"] == 99.0  # inchange


def test_suppression_confinee(r):
    assert r["a_apres_purge"] == 0
    assert r["b_apres_purge"] == 1
