"""Recherche du catalogue par mots (08/10/2026).

Mesure sur 284 libelles reels de devis Blueseatra contre fournisseur.articles :
la recherche par phrase entiere trouvait 29 libelles, la recherche par mots 39,
sans en perdre aucun. Ces tests fixent le comportement du filtre genere.
"""
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from recherche_mots import CHAMPS_RECHERCHE, filtre_recherche, mots_recherche  # noqa: E402
from db_postgres import _build_where  # noqa: E402


def _correspond(filtre, doc):
    """Evalue le filtre genere comme PostgreSQL (~* = regex insensible a la casse)."""
    def mot_ok(ou):
        return any(re.search(c[ch]["$regex"], doc.get(ch) or "", re.I) for c in ou["$or"] for ch in c)
    return all(mot_ok(ou) for ou in filtre["$and"])


ARTICLE = {"article": "Interrupteur va-et-vient encastré", "code": "EL-012",
           "marque": "Legrand", "ref_fournisseur": "067601", "ref_fabricant": "",
           "designation_fournisseur": "Céliane va et vient"}


def test_mots_dans_le_desordre():
    assert _correspond(filtre_recherche("encastré interrupteur"), ARTICLE)


def test_pluriel_et_singulier():
    # « interrupteurs » ne contenait pas la phrase « interrupteur » : perdu avant.
    assert _correspond(filtre_recherche("interrupteurs"), ARTICLE)


def test_mot_dans_un_autre_champ():
    assert _correspond(filtre_recherche("interrupteur legrand"), ARTICLE)


def test_tous_les_mots_sont_obligatoires():
    assert not _correspond(filtre_recherche("interrupteur schneider"), ARTICLE)


def test_accents_et_casse_ignores():
    assert _correspond(filtre_recherche("ENCASTRE celiane"), ARTICLE)
    assert _correspond(filtre_recherche("encastré"), {"article": "Spot encastre LED"})


def test_decimale_virgule_ou_point():
    doc = {"article": "Câble R2V 3G2,5 mm²"}
    assert _correspond(filtre_recherche("cable 3g2.5"), doc)
    assert _correspond(filtre_recherche("câble 3G2,5"), doc)


def test_caracteres_speciaux_neutralises():
    # Avant : la saisie etait une expression reguliere brute. « 2P+T » echouait
    # (« + » = repetition) et « ( » provoquait une erreur SQL.
    assert _correspond(filtre_recherche("prise 2P+T"), {"article": "Prise de courant 2P+T 16 A"})
    for saisie in ["(", "a|b", ".*", "[", "\\", "dis(joncteur"]:
        f = filtre_recherche(saisie)
        if f:
            for ou in f["$and"]:
                for c in ou["$or"]:
                    for v in c.values():
                        re.compile(v["$regex"])  # toujours une regex valide


def test_saisie_vide_aucun_filtre():
    assert filtre_recherche("") is None
    assert filtre_recherche("  ,;  ") is None


def test_bornes():
    assert len(mots_recherche(" ".join(f"m{i}" for i in range(30)))) == 12
    assert len(mots_recherche("x" * 500)[0]) == 100


def test_couvre_les_six_champs_historiques():
    assert set(CHAMPS_RECHERCHE) == {"article", "code", "marque", "ref_fournisseur",
                                     "ref_fabricant", "designation_fournisseur"}


def test_sql_genere_parametre():
    params = []
    sql = _build_where({"__tenant__": "t1", "$and": filtre_recherche("vis bois")["$and"]}, params)
    assert sql.count("~*") == 12 and "tenant_id = $1" in sql
    assert "vis" not in sql and "bois" not in sql       # valeurs en parametres lies
    assert len(params) == 13


def test_exposants_du_catalogue():
    # Mesure 240 references : « Contacteur de puissance CX³ » perdu.
    assert _correspond(filtre_recherche("Contacteur CX³"), {"article": "Contacteur CX³ 25 A"})
    assert _correspond(filtre_recherche("cable 2.5 mm2"), {"article": "Câble 2,5 mm²"})


def test_pluriel_des_mots_courts():
    # Mesure 240 references : « sols pvc », « sacs gravats », « vmcs » echouaient.
    assert _correspond(filtre_recherche("sols pvc"), {"article": "Sol PVC en le"})
    assert _correspond(filtre_recherche("sacs gravats"), {"article": "Sac a gravats renforce"})
    assert _correspond(filtre_recherche("vmcs simple flux"), {"article": "VMC simple flux"})
    assert _correspond(filtre_recherche("vis"), {"article": "Vis a bois"})   # 3 lettres : intact
