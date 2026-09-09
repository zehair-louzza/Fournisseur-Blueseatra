"""Backend tests for BlueSeaTra BTP procurement app."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "https://procurement-hub-301.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Health ----------
def test_health(s):
    r = s.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ---------- Stats ----------
def test_stats_overview(s):
    r = s.get(f"{API}/stats/overview", timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ["total_articles", "prix_releves", "a_completer", "a_verifier",
              "fiable", "prix_moyen", "valeur_catalogue", "nb_lots",
              "nb_fournisseurs", "couverture"]:
        assert k in d, f"missing {k}"
    assert d["total_articles"] > 0
    print("overview", d)


def test_stats_by_lot(s):
    r = s.get(f"{API}/stats/by-lot", timeout=15)
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list) and len(rows) > 0
    for row in rows:
        for k in ["lot", "articles", "prix_moyen", "valeur",
                  "a_completer", "a_verifier", "fiable"]:
            assert k in row


def test_stats_by_supplier(s):
    r = s.get(f"{API}/stats/by-supplier", timeout=15)
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list) and len(rows) > 0
    assert "fournisseur" in rows[0]
    assert "articles" in rows[0]


# ---------- Catalogue ----------
def test_filters(s):
    r = s.get(f"{API}/filters", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert len(d["lots"]) > 0
    assert len(d["fournisseurs"]) > 0
    assert len(d["statuts"]) == 3


def test_catalogue_default(s):
    r = s.get(f"{API}/catalogue", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["total"] > 0
    assert len(d["items"]) <= 25
    assert "_id" not in (d["items"][0] if d["items"] else {})


def test_catalogue_search(s):
    r = s.get(f"{API}/catalogue", params={"search": "béton"}, timeout=15)
    assert r.status_code == 200


def test_catalogue_pagination(s):
    r1 = s.get(f"{API}/catalogue", params={"page": 1, "page_size": 10}, timeout=15).json()
    r2 = s.get(f"{API}/catalogue", params={"page": 2, "page_size": 10}, timeout=15).json()
    assert len(r1["items"]) == 10
    assert r1["items"][0]["code"] != r2["items"][0]["code"]


def test_catalogue_filter_by_lot(s):
    filters = s.get(f"{API}/filters", timeout=15).json()
    lot = filters["lots"][0]
    r = s.get(f"{API}/catalogue", params={"lot": lot}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    for it in d["items"]:
        assert it["lot"] == lot


def test_catalogue_get_by_code(s):
    d = s.get(f"{API}/catalogue", timeout=15).json()
    code = d["items"][0]["code"]
    r = s.get(f"{API}/catalogue/{code}", timeout=15)
    assert r.status_code == 200
    assert r.json()["code"] == code


def test_catalogue_get_404(s):
    r = s.get(f"{API}/catalogue/DOES_NOT_EXIST_XYZ", timeout=15)
    assert r.status_code == 404


# ---------- Alerts / Parametres ----------
def test_alerts(s):
    r = s.get(f"{API}/alerts", timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ["a_completer", "a_verifier", "controls", "counts"]:
        assert k in d


def test_parametres(s):
    r = s.get(f"{API}/parametres", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "parametres" in d
    assert "sources" in d


# ---------- Projects CRUD + calc correctness ----------
def test_project_crud_and_computation(s):
    payload = {
        "nom": "TEST_Projet_Calc",
        "client": "TEST_client",
        "description": "verification calculs",
        "lignes": [{
            "code": "T001",
            "article": "Test article",
            "lot": "LotTest",
            "unite": "u",
            "fournisseur": "F1",
            "prix_achat_ht": 8.46,
            "marge_pct": 25,
            "quantite": 10,
            "tva_pct": 20,
        }],
    }
    r = s.post(f"{API}/projects", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    proj = r.json()
    pid = proj["id"]
    tot = proj["totaux"]
    # Expected: vente_ht=8.46/0.75*10 = 112.8, tva=22.56, ttc=135.36
    assert abs(tot["total_vente_ht"] - 112.8) < 0.05, tot
    assert abs(tot["total_tva"] - 22.56) < 0.05, tot
    assert abs(tot["total_ttc"] - 135.36) < 0.05, tot

    # GET
    r = s.get(f"{API}/projects/{pid}", timeout=15)
    assert r.status_code == 200
    assert r.json()["nom"] == "TEST_Projet_Calc"

    # LIST
    r = s.get(f"{API}/projects", timeout=15)
    assert r.status_code == 200
    assert any(p["id"] == pid for p in r.json())

    # UPDATE
    upd = {"lignes": [{
        "code": "T001", "article": "Test article", "lot": "LotTest",
        "fournisseur": "F1", "prix_achat_ht": 100, "marge_pct": 20,
        "quantite": 2, "tva_pct": 10,
    }]}
    r = s.put(f"{API}/projects/{pid}", json=upd, timeout=15)
    assert r.status_code == 200
    tot = r.json()["totaux"]
    # vente = 100/0.8 * 2 = 250; tva 10% = 25; ttc=275
    assert abs(tot["total_vente_ht"] - 250) < 0.05
    assert abs(tot["total_tva"] - 25) < 0.05
    assert abs(tot["total_ttc"] - 275) < 0.05

    # DELETE
    r = s.delete(f"{API}/projects/{pid}", timeout=15)
    assert r.status_code == 200
    r = s.get(f"{API}/projects/{pid}", timeout=15)
    assert r.status_code == 404


def test_project_delete_404(s):
    r = s.delete(f"{API}/projects/nonexistent-xyz", timeout=15)
    assert r.status_code == 404



# ---------- Comparateur ----------
def test_comparateur(s):
    r = s.get(f"{API}/comparateur", timeout=30)
    assert r.status_code == 200
    d = r.json()
    for k in ["items", "fournisseurs", "total_economie", "nb_comparables", "economie_moy_pct"]:
        assert k in d, f"missing {k}"
    assert isinstance(d["fournisseurs"], list) and len(d["fournisseurs"]) >= 2
    assert isinstance(d["items"], list) and len(d["items"]) > 0
    it = d["items"][0]
    for k in ["code", "article", "lot", "prix", "nb_offres", "best_fournisseur", "best_prix", "economie_eur", "economie_pct"]:
        assert k in it, f"missing item field {k}"
    assert isinstance(it["prix"], dict)
    assert it["nb_offres"] >= 2
    # sorted by economie desc
    ecos = [x["economie_eur"] for x in d["items"]]
    assert ecos == sorted(ecos, reverse=True)
    print(f"comparateur: {d['nb_comparables']} items, {len(d['fournisseurs'])} fournisseurs, total_eco={d['total_economie']}")


# ---------- Catalogue retenu=true ----------
def test_catalogue_retenu(s):
    r = s.get(f"{API}/catalogue", params={"retenu": "true", "page_size": 100}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["total"] > 0
    for it in d["items"]:
        assert it.get("statut") == "fiable", f"non-fiable item: {it.get('code')} statut={it.get('statut')}"
    # compare vs total
    r_all = s.get(f"{API}/catalogue", timeout=15).json()
    print(f"retenu={d['total']}  total={r_all['total']}")
    assert d["total"] < r_all["total"]


# ---------- Import xlsx ----------
def test_import_catalogue():
    path = "/app/catalogue.xlsx"
    assert os.path.exists(path), "Test xlsx missing"
    # total before
    before = requests.get(f"{API}/catalogue", timeout=15).json()["total"]
    with open(path, "rb") as f:
        files = {"file": ("catalogue.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        r = requests.post(f"{API}/catalogue/import", files=files, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ["updated", "added", "total"]:
        assert k in d
    assert d["updated"] > 0
    print(f"import: updated={d['updated']} added={d['added']} total={d['total']}")
    after = requests.get(f"{API}/catalogue", timeout=15).json()["total"]
    # data should still be coherent (~397)
    assert abs(after - before) <= 5, f"total drift: before={before} after={after}"


def test_import_catalogue_bad_file():
    files = {"file": ("bad.xlsx", b"not-an-xlsx", "application/octet-stream")}
    r = requests.post(f"{API}/catalogue/import", files=files, timeout=30)
    assert r.status_code == 400
