"""Test d'integration reel : l'application complete contre la base Postgres.

Necessite DATABASE_URL. Ignore automatiquement sinon, pour ne pas casser
une execution hors ligne de la suite unitaire.
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


TENANT_TEST = f"test-integration-{uuid.uuid4()}"


@pytest.fixture(scope="module")
def client():
    """Application reelle, sur un tenant de test isole.

    L'authentification Supabase est remplacee par une identite fixe : ce
    test verifie le comportement applicatif, pas le fournisseur d'identite.
    L'isolation entre clients est verifiee separement dans
    test_isolation_tenant.py.
    """
    from fastapi.testclient import TestClient
    import server
    from auth import base_du_tenant, identite_courante, Identite

    server.app.dependency_overrides[base_du_tenant] = (
        lambda: server.db.for_tenant(TENANT_TEST)
    )
    server.app.dependency_overrides[identite_courante] = (
        lambda: Identite("user-test", "test@example.com", TENANT_TEST)
    )

    # Catalogue de depart charge dans le tenant de test
    os.environ["SEED_TENANT_ID"] = TENANT_TEST

    with TestClient(server.app) as c:  # declenche startup (seed)
        yield c

    async def _purge():
        tdb = server.db.for_tenant(TENANT_TEST)
        for nom in ("articles", "projects", "sources", "parametres", "controls", "synthese"):
            await tdb[nom].delete_many({})
        await server.db.close()

    asyncio.run(_purge())
    server.app.dependency_overrides.clear()


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

    # L'offre est lisible sur un article portant bien la meme marque et la
    # meme reference. On ne presume pas DE QUEL article il s'agit : plusieurs
    # articles du catalogue peuvent partager ce couple, et le rapprochement
    # retient le premier.
    def articles_avec_offre_test():
        # On lit les offres depuis la liste elle-meme plutot que fiche par
        # fiche : un code article peut contenir un caractere qui ne survit
        # pas dans une URL, ce qui masquerait silencieusement le resultat.
        trouves = []
        page = 1
        while True:
            lot = client.get(f"/api/catalogue?page={page}&page_size=200").json()
            for a in lot["items"]:
                offres = [
                    o for o in a.get("offers", [])
                    if o.get("fournisseur") == "FournisseurTest"
                ]
                if offres:
                    trouves.append((a, offres))
            if page * 200 >= lot["total"]:
                return trouves
            page += 1

    porteurs = articles_avec_offre_test()
    assert len(porteurs) == 1, "l'offre doit se poser sur exactement un article"
    fiche, offres = porteurs[0]
    assert len(offres) == 1
    assert offres[0]["prix_ht"] == 123.45
    assert fiche["marque"] == cible["marque"]
    assert fiche["ref_fabricant"] == cible["ref_fabricant"]

    # reimport : remplace, ne duplique pas
    r2 = client.post(
        "/api/fournisseurs/FournisseurTest/import",
        files={"file": ("test.csv", csv, "text/csv")},
    )
    assert r2.status_code == 200
    porteurs2 = articles_avec_offre_test()
    assert len(porteurs2) == 1
    assert len(porteurs2[0][1]) == 1


def test_acces_refuse_sans_authentification():
    """Sans jeton, aucune donnee de catalogue ne doit sortir."""
    from fastapi.testclient import TestClient
    import server

    surcharges = dict(server.app.dependency_overrides)
    server.app.dependency_overrides.clear()
    try:
        brut = TestClient(server.app)
        for chemin in ("/api/catalogue", "/api/stats/overview", "/api/filters",
                       "/api/projects", "/api/comparateur"):
            assert brut.get(chemin).status_code == 401, chemin
        # l'import est lui aussi ferme
        assert brut.post(
            "/api/fournisseurs/X/import",
            files={"file": ("a.csv", b"Designation;Prix net HT\nX;1\n", "text/csv")},
        ).status_code == 401
        # seul le controle de sante reste ouvert (sonde de la plateforme)
        assert brut.get("/api/health").status_code == 200
    finally:
        server.app.dependency_overrides.update(surcharges)
