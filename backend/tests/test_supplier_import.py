"""Tests unitaires du parsing/rapprochement d'un import de catalogue fournisseur.

Ne necessite ni serveur ni base de donnees : `appliquer_offres` est testee
avec un faux curseur mongo minimal.
"""
import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from supplier_import import parse_supplier_csv, appliquer_offres, _ref_key  # noqa: E402


def test_parse_csv_reconnait_les_colonnes_rexel():
    csv_txt = (
        "Fournisseur;Famille;Designation;Marque;Reference Rexel;Reference fabricant;"
        "Code EAN;Prix net HT;Unite de vente;Fiche produit\n"
        "Rexel;Cablage;Cable RO2V 3G2.5;Nexans;12345;NX-3G25;3600000000001;"
        "1,2345;Metre;https://exemple/produit\n"
    ).encode("utf-8-sig")
    r = parse_supplier_csv(csv_txt, "Rexel")
    assert r["total_lu"] == 1
    assert r["lignes_ignorees"] == 0
    o = r["offres"][0]
    assert o["designation"] == "Cable RO2V 3G2.5"
    assert o["marque"] == "Nexans"
    assert o["prix_ht"] == 1.2345
    assert o["ref_key"] == _ref_key("Nexans", "NX-3G25")


def test_parse_csv_ignore_ligne_sans_designation():
    csv_txt = "Designation;Marque;Prix net HT\n;Nexans;10\n".encode("utf-8-sig")
    r = parse_supplier_csv(csv_txt, "Rexel")
    assert len(r["offres"]) == 0
    assert r["lignes_ignorees"] == 1
    assert r["total_lu"] == 1


def test_ref_key_refuse_reference_trop_courte():
    # une reference de moins de 5 caracteres est trop generique : elle doit
    # etre ignoree pour eviter les faux rapprochements (incident deja constate)
    assert _ref_key("Legrand", "412") is None
    assert _ref_key("Legrand", "412408") == "LEGRAND|412408"


def test_ref_key_sans_marque_est_nul():
    assert _ref_key("", "412408") is None


class _FauxCurseur:
    def __init__(self, docs):
        self._docs = docs

    def __aiter__(self):
        self._i = 0
        return self

    async def __anext__(self):
        if self._i >= len(self._docs):
            raise StopAsyncIteration
        d = self._docs[self._i]
        self._i += 1
        return d


class _FauxCollection:
    def __init__(self, articles):
        self._articles = {a["code"]: a for a in articles}
        self.updates = []

    def find(self, *_args, **_kwargs):
        return _FauxCurseur(list(self._articles.values()))

    async def find_one(self, filtre, *_args, **_kwargs):
        code = filtre.get("code")
        return self._articles.get(code)

    async def update_one(self, filtre, update):
        code = filtre.get("code")
        self.updates.append((code, update))
        if code in self._articles:
            self._articles[code].update(update.get("$set", {}))

    async def insert_many(self, docs):
        for d in docs:
            self._articles[d["code"]] = dict(d)


class _FauseDB:
    def __init__(self, articles):
        self.articles = _FauxCollection(articles)
        # appliquer_offres refuse une base non cloisonnee : on simule ici
        # une base deja restreinte a un client.
        self.tenant_id = "tenant-test"


def test_appliquer_offres_rattache_par_marque_et_reference():
    db = _FauseDB([
        {"code": "ELE-0001", "marque": "Legrand", "ref_fabricant": "412408",
         "article": "Telerupteur", "designation_fournisseur": None, "offers": []},
    ])
    offres = [{
        "ref_key": _ref_key("Legrand", "412408"), "reference_fournisseur": "R1",
        "reference_fabricant": "412408", "marque": "Legrand",
        "designation": "Telerupteur Legrand", "designation_norm": "telerupteur legrand",
        "fournisseur": "Rexel", "prix_ht": 29.99, "prix_public": None,
        "unite_vente": "Piece", "ean": None, "fiche_produit": None,
        "retrait": None, "importe_le": "2026-01-01T00:00:00+00:00",
    }]
    res = asyncio.run(appliquer_offres(db, "Rexel", offres))
    assert res["offres_rattachees"] == 1
    assert res["articles_mis_a_jour"] == 1
    assert res["offres_non_rattachees"] == 0
    offer = db.articles._articles["ELE-0001"]["offers"][0]
    assert offer["fournisseur"] == "Rexel"
    assert offer["prix_ht"] == 29.99


def test_appliquer_offres_reimport_remplace_sans_dupliquer():
    db = _FauseDB([
        {"code": "ELE-0001", "marque": "Legrand", "ref_fabricant": "412408",
         "article": "Telerupteur", "designation_fournisseur": None,
         "offers": [{"fournisseur": "Rexel", "prix_ht": 100.0}]},
    ])
    offres = [{
        "ref_key": _ref_key("Legrand", "412408"), "reference_fournisseur": "R1",
        "reference_fabricant": "412408", "marque": "Legrand",
        "designation": "Telerupteur Legrand", "designation_norm": "telerupteur legrand",
        "fournisseur": "Rexel", "prix_ht": 29.99, "prix_public": None,
        "unite_vente": "Piece", "ean": None, "fiche_produit": None,
        "retrait": None, "importe_le": "2026-01-02T00:00:00+00:00",
    }]
    asyncio.run(appliquer_offres(db, "Rexel", offres))
    offres_finales = db.articles._articles["ELE-0001"]["offers"]
    assert len(offres_finales) == 1  # pas de doublon, l'ancienne offre Rexel a ete remplacee
    assert offres_finales[0]["prix_ht"] == 29.99


def _offre_sans_correspondance():
    return {
        "ref_key": None, "reference_fournisseur": "R1", "reference_fabricant": None,
        "marque": "MarqueInconnue", "designation": "Produit jamais vu",
        "designation_norm": "produit jamais vu", "fournisseur": "Rexel",
        "prix_ht": 10.0, "prix_public": None, "unite_vente": "U", "ean": None,
        "fiche_produit": None, "retrait": None, "famille": None,
        "importe_le": "2026-01-01T00:00:00+00:00",
    }


def test_ligne_sans_correspondance_cree_un_article():
    """Un compte vide doit pouvoir constituer son catalogue par import."""
    db = _FauseDB([])
    res = asyncio.run(appliquer_offres(db, "Rexel", [_offre_sans_correspondance()]))
    assert res["articles_crees"] == 1
    assert res["offres_rattachees"] == 0
    cree = list(db.articles._articles.values())[0]
    assert cree["article"] == "Produit jamais vu"
    assert cree["prix_achat_ht"] == 10.0
    assert cree["code"] == "R1"  # reprend la reference fournisseur
    # regle absolue : la marge et le prix de vente ne sont jamais calcules
    assert cree["marge_pct"] is None
    assert cree["prix_vente_ht"] is None


def test_creation_desactivable():
    db = _FauseDB([])
    res = asyncio.run(
        appliquer_offres(db, "Rexel", [_offre_sans_correspondance()], creer_articles=False)
    )
    assert res["articles_crees"] == 0
    assert res["offres_non_rattachees"] == 1
    assert len(db.articles._articles) == 0


def test_refuse_une_base_non_cloisonnee():
    """Non-regression : l'import a d'abord ete branche par erreur sur la base
    globale. Le compte-rendu restait plausible alors que l'ecriture partait
    dans le catalogue d'un autre client. Le refus doit etre explicite."""
    db = _FauseDB([])
    db.tenant_id = None
    with pytest.raises(ValueError, match="cloisonnement"):
        asyncio.run(appliquer_offres(db, "Rexel", [_offre_sans_correspondance()]))
