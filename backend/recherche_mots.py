"""Recherche du catalogue par MOTS plutot que par phrase entiere (08/10/2026).

POURQUOI
--------
L'ancienne recherche cherchait la saisie entiere, telle quelle, dans chaque
champ : « interrupteurs » ne trouvait pas « Interrupteur va-et-vient »,
« vis bois » ne trouvait pas « Vis a bois ». Mesure sur 284 libelles reels de
devis Blueseatra contre fournisseur.articles : 29 libelles trouves par phrase,
39 par mots, aucun perdu.

De plus la saisie etait passee BRUTE comme expression reguliere : « 2P+T »
ne trouvait rien (« + » est un operateur) et « ( » provoquait une erreur SQL.

REGLE
-----
Chaque mot saisi doit apparaitre dans l'un des champs de l'article
(ET entre les mots, OU entre les champs), dans n'importe quel ordre.
Casse et accents ignores, « 2,5 » = « 2.5 ». Les mots sont echappes : aucun
caractere saisi n'est interprete comme operateur. Les valeurs voyagent en
parametres lies (db_postgres), jamais concatenees dans le SQL.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Dict, List, Optional

CHAMPS_RECHERCHE = ("article", "code", "marque", "ref_fournisseur",
                    "ref_fabricant", "designation_fournisseur")
MAX_MOTS = 12
MAX_LONGUEUR_MOT = 100

# Chaque lettre de base accepte ses variantes accentuees (les champs du
# catalogue gardent leurs accents : « Câble », « encastré »).
_VARIANTES = {
    "a": "aàâäáã", "c": "cç", "e": "eéèêë", "i": "iîïí", "o": "oôöó",
    "u": "uùûüú", "y": "yÿ", "n": "nñ",
}


def _sans_accent(texte: str) -> str:
    texte = unicodedata.normalize("NFKD", texte)
    return "".join(c for c in texte if not unicodedata.combining(c)).lower()


def mots_recherche(saisie: str) -> List[str]:
    """Mots normalises de la saisie (minuscules, sans accents, bornes)."""
    texte = _sans_accent(saisie or "")
    texte = re.sub(r"(\d),(\d)", r"\1.\2", texte)         # 2,5 -> 2.5
    mots = [m.strip(".") for m in re.split(r"[^\w.+]+", texte)]
    return [_singulier(m)[:MAX_LONGUEUR_MOT] for m in mots if m][:MAX_MOTS]


def _singulier(mot: str) -> str:
    """Pluriel simple : « interrupteurs » cherche « interrupteur » (qui
    trouve aussi le pluriel). Mots courts intacts : « vis », « bois »."""
    if len(mot) > 4 and mot.isalpha() and mot[-1] in "sx":
        return mot[:-1]
    return mot


def _motif(mot: str) -> str:
    """Expression reguliere sure pour un mot : echappement, accents, decimales."""
    morceaux = []
    for c in mot:
        if c in _VARIANTES:
            morceaux.append(f"[{_VARIANTES[c]}]")
        elif c == ".":
            morceaux.append("[.,]")
        else:
            morceaux.append(re.escape(c))
    return "".join(morceaux)


def filtre_recherche(saisie: str) -> Optional[Dict[str, list]]:
    """Filtre document : {"$and": [{"$or": [{champ: {"$regex": ...}}, ...]}, ...]}.

    None si la saisie ne contient aucun mot (pas de filtre de recherche).
    """
    mots = mots_recherche(saisie)
    if not mots:
        return None
    return {"$and": [
        {"$or": [{champ: {"$regex": _motif(m), "$options": "i"}} for champ in CHAMPS_RECHERCHE]}
        for m in mots
    ]}
