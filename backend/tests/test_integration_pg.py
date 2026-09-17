"""Test d'integration reel : l'application complete contre la base Postgres.

Necessite DATABASE_URL. Ignore automatiquement sinon, pour ne pas casser
une execution hors ligne de la suite unitaire.
"""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"), reason="DATABASE_URL absent"
)


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    import server

    with TestClient(server.app) as c:  # declenche startup (seed)
        yield c


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_seed_a_charge_les_articles(client):
    r = client.get("/api/stats/overview")
    assert r.status_code == 200
    assert r.json()["total_articles"] > 0


def test_catalogue_pagination_et_tri(client):
    r = client.get("/api/catalogue?page=1&page_size=5&sort=code")
    assert r.status_code == 200
    d = r.json()
    assert len(d["items"]) == 5
    assert d["total"] > 5
    codes = [i["code"] for i in d["items"]]
    assert codes == sorted(codes)


def test_catalogue_tri_prix_est_numerique(client):
    r = client.get("/api/catalogue?page=1&page_size=20&sort=prix_desc")
    prix = [i.get("prix_achat_ht") for i in r.json()["items"]]
    prix = [p for p in prix if p is not None]
    # un tri texte placerait 9 apres 100 : on verifie l'ordre numerique
    assert prix == sorted(prix, reverse=True)


def test_recherche_texte(client):
    r = client.get("/api/catalogue?search=cable&page_size=5")
    assert r.status_code == 200


def test_filtres(client):
    lots = client.get("/api/filters").json()["lots"]
    assert lots
    r = client.get(f"/api/catalogue?lot={lots[0]}&page_size=5")
    assert r.status_code == 200
    for item in r.json()["items"]:
        assert item["lot"] == lots[0]


def test_stats_by_lot(client):
    r = client.get("/api/stats/by-lot")
    assert r.status_code == 200
    rows = r.json()
    assert rows and all("lot" in x and "articles" in x for x in rows)


def test_stats_by_supplier(client):
    r = client.get("/api/stats/by-supplier")
    assert r.status_code == 200


def test_stats_decision_et_comparateur(client):
    assert client.get("/api/stats/decision").status_code == 200
    assert client.get("/api/comparateur").status_code == 200
    assert client.get("/api/alerts").status_code == 200
    assert client.get("/api/parametres").status_code == 200


def test_article_unitaire(client):
    code = client.get("/api/catalogue?page_size=1").json()["items"][0]["code"]
    r = client.get(f"/api/catalogue/{code}")
    assert r.status_code == 200
    assert r.json()["code"] == code
    assert client.get("/api/catalogue/CODE-INEXISTANT-XYZ").status_code == 404


def test_best_prices(client):
    codes = [i["code"] for i in client.get("/api/catalogue?page_size=3").json()["items"]]
    r = client.post("/api/best-prices", json={"codes": codes})
    assert r.status_code == 200


def test_cycle_de_vie_projet(client):
    cree = client.post("/api/projects", json={"nom": "Projet test", "lignes": []})
    assert cree.status_code == 200
    pid = cree.json()["id"]

    assert any(p["id"] == pid for p in client.get("/api/projects").json())
    assert client.get(f"/api/projects/{pid}").json()["nom"] == "Projet test"

    maj = client.put(f"/api/projects/{pid}", json={"nom": "Projet renomme", "lignes": []})
    assert maj.status_code == 200
    assert client.get(f"/api/projects/{pid}").json()["nom"] == "Projet renomme"

    assert client.delete(f"/api/projects/{pid}").status_code == 200
    assert client.get(f"/api/projects/{pid}").status_code == 404


def test_import_fournisseur_rattache_une_offre(client):
    """Verifie la fonctionnalite livree : un CSV fournisseur cree une offre
    sur un article existant, sans creer d'article."""
    article = client.get("/api/catalogue?page_size=50").json()["items"]
    cible = next((a for a in article if a.get("marque") and a.get("ref_fabricant")), None)
    if cible is None:
        pytest.skip("aucun article avec marque + reference fabricant")

    total_avant = client.get("/api/stats/overview").json()["total_articles"]

    csv = (
        "Designation;Marque;Reference fabricant;Prix net HT;Unite de vente\n"
        f"Article test integration;{cible['marque']};{cible['ref_fabricant']};123,45;U\n"
    ).encode("utf-8-sig")

    r = client.post(
        "/api/fournisseurs/FournisseurTest/import",
        files={"file": ("test.csv", csv, "text/csv")},
    )
    assert r.status_code == 200, r.text
    assert r.json()["offres_rattachees"] == 1

    # aucun article cree
    assert client.get("/api/stats/overview").json()["total_articles"] == total_avant

    # l'offre est bien lisible sur l'article
    fiche = client.get(f"/api/catalogue/{cible['code']}").json()
    offres = [o for o in fiche.get("offers", []) if o["fournisseur"] == "FournisseurTest"]
    assert len(offres) == 1
    assert offres[0]["prix_ht"] == 123.45

    # reimport : remplace, ne duplique pas
    r2 = client.post(
        "/api/fournisseurs/FournisseurTest/import",
        files={"file": ("test.csv", csv, "text/csv")},
    )
    assert r2.status_code == 200
    fiche2 = client.get(f"/api/catalogue/{cible['code']}").json()
    offres2 = [o for o in fiche2.get("offers", []) if o["fournisseur"] == "FournisseurTest"]
    assert len(offres2) == 1
