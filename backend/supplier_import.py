"""Import d'un catalogue fournisseur brut (CSV) dans les offres d'articles.

Concu pour les exports produits par la collecte automatique par API
(Rexel/Prolians/La Plateforme/SFIC/Point.P) : une ligne = un produit chez UN
fournisseur, colonnes en francais avec des noms variables selon la source.

Ne cree jamais d'article : une offre ne s'attache qu'a un article existant,
identifie par rapprochement MARQUE + REFERENCE FABRICANT (jamais la reference
seule : un meme numero designe des produits differents selon le fabricant),
avec repli sur une correspondance approchee du libelle si aucune reference
n'est exploitable. Les lignes sans correspondance sont renvoyees telles
quelles pour that l'utilisateur decide (ignorer / creer manuellement).
"""
import csv
import io
import re
import unicodedata
from datetime import datetime, timezone


# Alias de colonnes tolerants : le fichier peut venir de n'importe laquelle
# des collectes deja construites (voir le skill collecte-tarifs-fournisseurs-btp).
ALIAS = {
    "designation": ["Designation", "Désignation", "designation", "item_label",
                     "libellé de l'article", "libelle de l'article"],
    "marque": ["Marque", "marque", "brand", "nom de la marque"],
    "reference_fabricant": ["Reference fabricant", "Référence fabricant",
                             "reference", "référence de la marque"],
    "reference_fournisseur": ["Reference Rexel", "Reference Prolians", "Reference",
                               "Référence", "item_code", "code de l'article"],
    "prix_ht": ["Prix net HT", "Prix HT", "prix_ht", "purchase_price_ht",
                "prix net HT du client dans l'agence"],
    "prix_public": ["Prix public HT", "prix_public_ht"],
    "unite": ["Unite de vente", "Unité de vente", "Unite", "Unité", "unit",
              "libellé unité de vente (par m², ...)"],
    "ean": ["Code EAN", "ean", "code EAN"],
    "fiche_produit": ["Fiche produit", "URL"],
    "delai": ["Delai de livraison", "Délai", "Delai", "delay", "disponibilité"],
}


def _norm(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFD", str(s))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]+", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def _num(v):
    if v is None:
        return None
    s = str(v).strip().replace("\u00a0", "").replace(" ", "").replace(",", ".")
    if not s:
        return None
    try:
        f = float(s)
    except ValueError:
        return None
    return round(f, 4) if f > 0 else None


def _ref_key(marque, ref):
    """Cle de rapprochement MARQUE+REFERENCE. La reference seule ne suffit
    jamais (deja constate : une meme reference designe des produits
    differents selon la marque)."""
    m = re.sub(r"[^A-Za-z0-9]", "", str(marque or "")).upper()
    r = re.sub(r"[^A-Za-z0-9]", "", str(ref or "")).upper()
    if len(r) < 5 or not m:
        return None
    return f"{m}|{r}"


def _get(row, cols_normalisees, cle):
    for alias in ALIAS[cle]:
        v = cols_normalisees.get(_norm(alias))
        if v not in (None, ""):
            return v
    return None


def detect_delimiter(sample: str) -> str:
    return ";" if sample.count(";") >= sample.count(",") else ","


def parse_supplier_csv(content: bytes, fournisseur: str) -> dict:
    """Retourne {offres: [...], lignes_ignorees: n, total: n} — n'ecrit rien.

    Chaque offre : {ref_key, reference_fournisseur, reference_fabricant, marque,
    designation, fournisseur, prix_ht, prix_public, unite_vente, ean,
    fiche_produit, retrait, importe_le}.
    """
    texte = content.decode("utf-8-sig", errors="replace")
    delim = detect_delimiter(texte.splitlines()[0] if texte else "")
    lecteur = csv.DictReader(io.StringIO(texte), delimiter=delim)
    if not lecteur.fieldnames:
        raise ValueError("Fichier vide ou en-tête illisible.")

    horodatage = datetime.now(timezone.utc).isoformat()
    offres, ignorees, sans_prix = [], 0, 0
    for row in lecteur:
        cols = {_norm(k): v for k, v in row.items() if k}
        designation = _get(row, cols, "designation")
        if not designation:
            ignorees += 1
            continue
        marque = _get(row, cols, "marque")
        ref_fab = _get(row, cols, "reference_fabricant")
        prix = _num(_get(row, cols, "prix_ht"))
        if prix is None:
            sans_prix += 1
        offres.append({
            "ref_key": _ref_key(marque, ref_fab),
            "reference_fournisseur": _get(row, cols, "reference_fournisseur"),
            "reference_fabricant": ref_fab,
            "marque": marque,
            "designation": designation,
            "designation_norm": _norm(designation),
            "fournisseur": fournisseur,
            "prix_ht": prix,
            "prix_public": _num(_get(row, cols, "prix_public")),
            "unite_vente": _get(row, cols, "unite"),
            "ean": _get(row, cols, "ean"),
            "fiche_produit": _get(row, cols, "fiche_produit"),
            "retrait": _get(row, cols, "delai"),
            "importe_le": horodatage,
        })
    return {"offres": offres, "lignes_ignorees": ignorees, "sans_prix": sans_prix,
            "total_lu": len(offres) + ignorees}


async def appliquer_offres(db, fournisseur: str, offres: list) -> dict:
    """Attache chaque offre a l'article correspondant (par ref_key, puis par
    libelle approche), en REMPLACANT toute offre precedente de ce meme
    fournisseur sur cet article (pas d'accumulation de doublons a chaque
    reimport). Retourne un compte-rendu, n'invente jamais de prix ni
    d'article."""
    # index des articles existants par cle de rapprochement et par libelle normalise
    curseur = db.articles.find(
        {}, {"_id": 0, "code": 1, "marque": 1, "ref_fabricant": 1, "article": 1,
             "designation_fournisseur": 1})
    par_ref, par_libelle = {}, {}
    async for a in curseur:
        k = _ref_key(a.get("marque"), a.get("ref_fabricant"))
        if k:
            par_ref.setdefault(k, a["code"])
        for champ in ("article", "designation_fournisseur"):
            lib = _norm(a.get(champ))
            if lib:
                par_libelle.setdefault(lib, a["code"])

    rattachees, non_rattachees = 0, []
    par_code = {}
    for o in offres:
        code = None
        if o["ref_key"] and o["ref_key"] in par_ref:
            code = par_ref[o["ref_key"]]
        elif o["designation_norm"] in par_libelle:
            code = par_libelle[o["designation_norm"]]
        if code:
            par_code.setdefault(code, []).append(o)
            rattachees += 1
        else:
            non_rattachees.append({
                "designation": o["designation"], "marque": o["marque"],
                "reference_fabricant": o["reference_fabricant"],
                "prix_ht": o["prix_ht"],
            })

    for code, nouvelles in par_code.items():
        article = await db.articles.find_one({"code": code}, {"offers": 1})
        offres_actuelles = [
            off for off in (article or {}).get("offers", [])
            if off.get("fournisseur") != fournisseur
        ]
        for o in nouvelles:
            offres_actuelles.append({
                "fournisseur": o["fournisseur"],
                "type_prix": "Prix net HT collecté",
                "prix_ht": o["prix_ht"],
                "prix_public": o["prix_public"],
                "remise": None,
                "designation": o["designation"],
                "marque": o["marque"],
                "ref_fournisseur": o["reference_fournisseur"],
                "unite_vente": o["unite_vente"],
                "conditionnement": None,
                "retrait": o["retrait"],
                "fiabilite": "Collecte automatique",
                "fiche_produit": o["fiche_produit"],
                "rang": None,
                "importe_le": o["importe_le"],
            })
        await db.articles.update_one({"code": code}, {"$set": {"offers": offres_actuelles}})

    return {
        "fournisseur": fournisseur,
        "offres_traitees": len(offres),
        "offres_rattachees": rattachees,
        "articles_mis_a_jour": len(par_code),
        "offres_non_rattachees": len(non_rattachees),
        "exemples_non_rattaches": non_rattachees[:20],
    }
