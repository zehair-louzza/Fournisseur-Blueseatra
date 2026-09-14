from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import logging
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime, timezone

from catalogue_parser import parse_catalogue
from supplier_import import parse_supplier_csv, appliquer_offres

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="BlueSeaTra — Gestion Achats TCE")
api_router = APIRouter(prefix="/api")

logger = logging.getLogger("btp")

# ----------------- Helpers -----------------

def derive_statut(fiabilite: Optional[str]) -> str:
    f = (fiabilite or "").lower()
    if "compl" in f:
        return "a_completer"
    if "vérifier" in f or "verifier" in f or "valider" in f:
        return "a_verifier"
    return "fiable"


def compute_line(line: dict) -> dict:
    prix_achat = float(line.get("prix_achat_ht") or 0)
    marge = float(line.get("marge_pct") or 0)
    qty = float(line.get("quantite") or 0)
    tva = float(line.get("tva_pct") or 20)
    if marge >= 100:
        marge = 99.0
    prix_vente_unit = prix_achat / (1 - marge / 100) if marge > 0 else prix_achat
    total_achat = prix_achat * qty
    total_vente_ht = prix_vente_unit * qty
    marge_eur = total_vente_ht - total_achat
    montant_tva = total_vente_ht * tva / 100
    total_ttc = total_vente_ht + montant_tva
    line = dict(line)
    line["prix_vente_unit"] = round(prix_vente_unit, 2)
    line["total_achat_ht"] = round(total_achat, 2)
    line["total_vente_ht"] = round(total_vente_ht, 2)
    line["marge_eur"] = round(marge_eur, 2)
    line["montant_tva"] = round(montant_tva, 2)
    line["total_ttc"] = round(total_ttc, 2)
    return line


def compute_project(project: dict) -> dict:
    lines = [compute_line(li) for li in project.get("lignes", [])]
    project["lignes"] = lines
    total_achat = sum(li["total_achat_ht"] for li in lines)
    total_vente = sum(li["total_vente_ht"] for li in lines)
    total_tva = sum(li["montant_tva"] for li in lines)
    total_ttc = sum(li["total_ttc"] for li in lines)
    marge_globale = total_vente - total_achat
    par_lot = {}
    for li in lines:
        lot = li.get("lot") or "Autre"
        par_lot.setdefault(lot, 0.0)
        par_lot[lot] += li["total_vente_ht"]
    project["totaux"] = {
        "total_achat_ht": round(total_achat, 2),
        "total_vente_ht": round(total_vente, 2),
        "marge_eur": round(marge_globale, 2),
        "marge_pct": round((marge_globale / total_vente * 100) if total_vente else 0, 1),
        "total_tva": round(total_tva, 2),
        "total_ttc": round(total_ttc, 2),
        "nb_lignes": len(lines),
        "par_lot": [{"lot": k, "montant": round(v, 2)} for k, v in sorted(par_lot.items())],
    }
    return project


# ----------------- Models -----------------

class EstimateLine(BaseModel):
    code: Optional[str] = None
    article: str
    lot: Optional[str] = None
    unite: Optional[str] = None
    fournisseur: Optional[str] = None
    prix_achat_ht: float = 0
    marge_pct: float = 25
    quantite: float = 1
    tva_pct: float = 20


class ProjectCreate(BaseModel):
    nom: str
    client: Optional[str] = None
    description: Optional[str] = None
    lignes: List[EstimateLine] = []


class ProjectUpdate(BaseModel):
    nom: Optional[str] = None
    client: Optional[str] = None
    description: Optional[str] = None
    lignes: Optional[List[EstimateLine]] = None


# ----------------- Seed -----------------

async def seed_data():
    count = await db.articles.count_documents({})
    if count > 0:
        return
    data_file = ROOT_DIR / "catalogue_data.json"
    if not data_file.exists():
        logger.warning("catalogue_data.json missing, skip seed")
        return
    with open(data_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    arts = data.get("articles", [])
    for a in arts:
        a["statut"] = derive_statut(a.get("fiabilite"))
    if arts:
        await db.articles.insert_many(arts)
    for name in ("synthese", "sources", "parametres", "controls"):
        docs = data.get(name, [])
        if docs:
            await db[name].delete_many({})
            await db[name].insert_many(docs)
    logger.info("Seeded %d articles", len(arts))


@app.on_event("startup")
async def on_startup():
    await seed_data()
    await db.articles.create_index("code")
    await db.articles.create_index("lot")


# ----------------- Catalogue endpoints -----------------

@api_router.get("/health")
async def health():
    return {"status": "ok"}


@api_router.get("/filters")
async def get_filters():
    lots = sorted(await db.articles.distinct("lot"))
    fournisseurs = sorted([f for f in await db.articles.distinct("fournisseur_retenu") if f])
    sous_familles = sorted([s for s in await db.articles.distinct("sous_famille") if s])
    return {
        "lots": lots,
        "fournisseurs": fournisseurs,
        "sous_familles": sous_familles,
        "statuts": [
            {"value": "fiable", "label": "Fiable"},
            {"value": "a_verifier", "label": "À vérifier"},
            {"value": "a_completer", "label": "À compléter"},
        ],
    }


@api_router.get("/catalogue")
async def get_catalogue(
    search: Optional[str] = None,
    lot: Optional[str] = None,
    fournisseur: Optional[str] = None,
    statut: Optional[str] = None,
    sous_famille: Optional[str] = None,
    retenu: Optional[bool] = None,
    sort: str = "code",
    page: int = 1,
    page_size: int = 25,
):
    q = {}
    if retenu:
        q["statut"] = "fiable"
    if lot:
        q["lot"] = lot
    if fournisseur:
        q["fournisseur_retenu"] = fournisseur
    if statut:
        q["statut"] = statut
    if sous_famille:
        q["sous_famille"] = sous_famille
    if search:
        rx = {"$regex": search, "$options": "i"}
        q["$or"] = [
            {"article": rx}, {"code": rx}, {"marque": rx},
            {"ref_fournisseur": rx}, {"ref_fabricant": rx},
            {"designation_fournisseur": rx},
        ]
    sort_map = {
        "code": [("code", 1)],
        "prix_asc": [("prix_achat_ht", 1)],
        "prix_desc": [("prix_achat_ht", -1)],
        "article": [("article", 1)],
    }
    total = await db.articles.count_documents(q)
    cursor = db.articles.find(q, {"_id": 0}).sort(sort_map.get(sort, [("code", 1)]))
    cursor = cursor.skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@api_router.get("/catalogue/{code}")
async def get_article(code: str):
    art = await db.articles.find_one({"code": code}, {"_id": 0})
    if not art:
        raise HTTPException(404, "Article introuvable")
    return art


# ----------------- Stats / KPIs -----------------

@api_router.get("/stats/overview")
async def stats_overview():
    arts = await db.articles.find(
        {},
        {"_id": 0, "statut": 1, "type_prix": 1, "prix_achat_ht": 1,
         "offers": 1, "lot": 1, "fournisseur_retenu": 1, "retrait": 1},
    ).to_list(2000)
    total = len(arts)
    a_completer = a_verifier = fiable = votre_tarif = 0
    prix_releves = 0
    somme_prix = 0.0
    total_offres = 0
    nb_comparables = 0
    economie = 0.0
    valeur_best = 0.0
    valeur_cat = 0.0
    dispo = {"Retrait agence": 0, "Sur commande": 0, "Autre / à préciser": 0}
    fournisseurs = set()
    lots = set()
    for a in arts:
        st = a.get("statut")
        if st == "a_completer":
            a_completer += 1
        elif st == "a_verifier":
            a_verifier += 1
        else:
            fiable += 1
        if a.get("fournisseur_retenu"):
            fournisseurs.add(a["fournisseur_retenu"])
        if a.get("lot"):
            lots.add(a["lot"])
        if "tarif" in (a.get("type_prix") or "").lower():
            votre_tarif += 1
        p = a.get("prix_achat_ht")
        if p:
            prix_releves += 1
            somme_prix += p
            valeur_cat += p
        best_by = {}
        for o in a.get("offers", []):
            if o.get("prix_ht") is None:
                continue
            f = o["fournisseur"]
            if f not in best_by or o["prix_ht"] < best_by[f]:
                best_by[f] = o["prix_ht"]
        prices = list(best_by.values())
        total_offres += len(prices)
        if len(prices) >= 2:
            nb_comparables += 1
            economie += max(prices) - min(prices)
        best_p = min(prices) if prices else p
        if best_p is not None:
            valeur_best += best_p
        r = (a.get("retrait") or "").lower()
        if "commande" in r:
            dispo["Sur commande"] += 1
        elif "retrait" in r or "livraison" in r:
            dispo["Retrait agence"] += 1
        else:
            dispo["Autre / à préciser"] += 1
    couverture = round(prix_releves / total * 100, 1) if total else 0
    return {
        "total_articles": total,
        "prix_releves": prix_releves,
        "a_completer": a_completer,
        "a_verifier": a_verifier,
        "fiable": fiable,
        "votre_tarif": votre_tarif,
        "prix_moyen": round(somme_prix / prix_releves, 2) if prix_releves else 0,
        "valeur_catalogue": round(valeur_cat, 2),
        "valeur_meilleur_prix": round(valeur_best, 2),
        "economie_potentielle": round(economie, 2),
        "total_offres": total_offres,
        "nb_comparables": nb_comparables,
        "nb_lots": len(lots),
        "nb_fournisseurs": len(fournisseurs),
        "couverture": couverture,
        "disponibilite": [{"name": k, "value": v} for k, v in dispo.items() if v > 0],
    }


@api_router.get("/stats/by-lot")
async def stats_by_lot():
    pipeline = [
        {"$group": {
            "_id": "$lot",
            "articles": {"$sum": 1},
            "prix_moyen": {"$avg": "$prix_achat_ht"},
            "valeur": {"$sum": {"$ifNull": ["$prix_achat_ht", 0]}},
            "a_completer": {"$sum": {"$cond": [{"$eq": ["$statut", "a_completer"]}, 1, 0]}},
            "a_verifier": {"$sum": {"$cond": [{"$eq": ["$statut", "a_verifier"]}, 1, 0]}},
            "fiable": {"$sum": {"$cond": [{"$eq": ["$statut", "fiable"]}, 1, 0]}},
        }},
        {"$sort": {"_id": 1}},
    ]
    rows = await db.articles.aggregate(pipeline).to_list(100)
    return [
        {
            "lot": r["_id"],
            "articles": r["articles"],
            "prix_moyen": round(r["prix_moyen"] or 0, 2),
            "valeur": round(r["valeur"] or 0, 2),
            "a_completer": r["a_completer"],
            "a_verifier": r["a_verifier"],
            "fiable": r["fiable"],
        }
        for r in rows
    ]


@api_router.get("/stats/by-supplier")
async def stats_by_supplier():
    pipeline = [
        {"$match": {"fournisseur_retenu": {"$ne": None}}},
        {"$group": {
            "_id": "$fournisseur_retenu",
            "articles": {"$sum": 1},
            "prix_moyen": {"$avg": "$prix_achat_ht"},
            "valeur": {"$sum": {"$ifNull": ["$prix_achat_ht", 0]}},
            "votre_tarif": {"$sum": {"$cond": [
                {"$regexMatch": {"input": {"$ifNull": ["$type_prix", ""]}, "regex": "tarif", "options": "i"}}, 1, 0]}},
        }},
        {"$sort": {"articles": -1}},
    ]
    rows = await db.articles.aggregate(pipeline).to_list(100)
    sources = await db.sources.find({}, {"_id": 0}).to_list(100)
    smap = {s["enseigne"]: s for s in sources}
    out = []
    for r in rows:
        src = smap.get(r["_id"], {})
        out.append({
            "fournisseur": r["_id"],
            "articles": r["articles"],
            "prix_moyen": round(r["prix_moyen"] or 0, 2),
            "valeur": round(r["valeur"] or 0, 2),
            "votre_tarif": r["votre_tarif"],
            "site": src.get("site"),
            "acces": src.get("acces"),
            "offres_retenues": src.get("offres_retenues"),
        })
    return out


@api_router.get("/alerts")
async def get_alerts():
    a_completer = await db.articles.find({"statut": "a_completer"}, {"_id": 0}).to_list(500)
    a_verifier = await db.articles.find({"statut": "a_verifier"}, {"_id": 0}).to_list(500)
    controls = await db.controls.find({}, {"_id": 0}).to_list(500)
    return {
        "a_completer": a_completer,
        "a_verifier": a_verifier,
        "controls": controls,
        "counts": {
            "a_completer": len(a_completer),
            "a_verifier": len(a_verifier),
            "controls": len(controls),
        },
    }


@api_router.get("/parametres")
async def get_parametres():
    params = await db.parametres.find({}, {"_id": 0}).to_list(100)
    sources = await db.sources.find({}, {"_id": 0}).to_list(100)
    return {"parametres": params, "sources": sources}


# ----------------- Projects / Estimation -----------------

@api_router.post("/projects")
async def create_project(body: ProjectCreate):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["updated_at"] = doc["created_at"]
    doc = compute_project(doc)
    await db.projects.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api_router.get("/projects")
async def list_projects():
    projs = await db.projects.find({}, {"_id": 0}).sort("updated_at", -1).to_list(200)
    return projs


@api_router.get("/projects/{pid}")
async def get_project(pid: str):
    p = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Projet introuvable")
    return p


@api_router.put("/projects/{pid}")
async def update_project(pid: str, body: ProjectUpdate):
    p = await db.projects.find_one({"id": pid})
    if not p:
        raise HTTPException(404, "Projet introuvable")
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if "lignes" in upd:
        upd["lignes"] = [dict(li) for li in upd["lignes"]]
    p.update(upd)
    p["updated_at"] = datetime.now(timezone.utc).isoformat()
    p = compute_project(p)
    p.pop("_id", None)
    await db.projects.replace_one({"id": pid}, dict(p))
    return p


@api_router.delete("/projects/{pid}")
async def delete_project(pid: str):
    res = await db.projects.delete_one({"id": pid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Projet introuvable")
    return {"deleted": True}


@api_router.get("/comparateur")
async def comparateur():
    order = [
        "Au Forum du Bâtiment", "YESSS Électrique", "Rexel",
        "La Plateforme du Bâtiment", "Chausson Matériaux", "Point.P",
        "Prolians", "SFIC", "Icilux",
    ]
    arts = await db.articles.find({}, {"_id": 0}).to_list(2000)
    items = []
    total_eco = 0.0
    eco_pcts = []
    seen = set()
    for a in arts:
        prix = {}
        fiches = {}
        for o in a.get("offers", []):
            if not o.get("prix_ht"):
                continue
            f = o["fournisseur"]
            p = round(o["prix_ht"], 2)
            if f not in prix or p < prix[f]:
                prix[f] = p
                fiches[f] = o.get("fiche_produit")
        if len(prix) < 2:
            continue
        for f in prix:
            seen.add(f)
        best_f = min(prix, key=prix.get)
        best_p = prix[best_f]
        worst_p = max(prix.values())
        eco = worst_p - best_p
        eco_pct = (eco / worst_p * 100) if worst_p else 0
        total_eco += eco
        eco_pcts.append(eco_pct)
        items.append({
            "code": a["code"], "article": a["article"], "lot": a["lot"], "unite": a.get("unite"),
            "prix": prix, "fiches": {k: v for k, v in fiches.items() if v}, "nb_offres": len(prix),
            "best_fournisseur": best_f, "best_prix": best_p, "worst_prix": round(worst_p, 2),
            "economie_eur": round(eco, 2), "economie_pct": round(eco_pct, 1),
        })
    items.sort(key=lambda x: x["economie_eur"], reverse=True)
    fournisseurs = [f for f in order if f in seen] + sorted(seen - set(order))
    return {
        "items": items,
        "fournisseurs": fournisseurs,
        "total_economie": round(total_eco, 2),
        "nb_comparables": len(items),
        "economie_moy_pct": round(sum(eco_pcts) / len(eco_pcts), 1) if eco_pcts else 0,
    }


@api_router.post("/catalogue/import")
async def import_catalogue(file: UploadFile = File(...)):
    content = await file.read()
    try:
        data = parse_catalogue(content)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Fichier illisible : {e}")
    arts = data.get("articles", [])
    if not arts:
        raise HTTPException(400, "Aucun article reconnu dans le fichier (structure attendue : feuilles par lot).")
    updated, added = 0, 0
    for a in arts:
        a["statut"] = derive_statut(a.get("fiabilite"))
        existing = await db.articles.find_one({"code": a["code"]}, {"_id": 1})
        if existing:
            await db.articles.update_one({"code": a["code"]}, {"$set": a})
            updated += 1
        else:
            await db.articles.insert_one(dict(a))
            added += 1
    for name in ("synthese", "sources", "parametres", "controls"):
        docs = data.get(name, [])
        if docs:
            await db[name].delete_many({})
            await db[name].insert_many([dict(d) for d in docs])
    return {"updated": updated, "added": added, "total": len(arts)}


@api_router.post("/fournisseurs/{fournisseur}/import")
async def import_offres_fournisseur(fournisseur: str, file: UploadFile = File(...)):
    """Importe un catalogue fournisseur brut (CSV) tel que produit par la
    collecte automatique (skill collecte-tarifs-fournisseurs-btp). Attache
    chaque ligne comme OFFRE sur l'article existant correspondant — ne cree
    jamais d'article, n'invente jamais de prix. Remplace les offres
    precedentes de ce meme fournisseur a chaque reimport."""
    content = await file.read()
    try:
        analyse = parse_supplier_csv(content, fournisseur)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Fichier illisible : {e}")
    if not analyse["offres"]:
        raise HTTPException(400, "Aucune ligne exploitable (désignation manquante sur toutes les lignes).")
    resultat = await appliquer_offres(db, fournisseur, analyse["offres"])
    resultat["lignes_lues"] = analyse["total_lu"]
    resultat["lignes_ignorees_sans_designation"] = analyse["lignes_ignorees"]
    resultat["lignes_sans_prix"] = analyse["sans_prix"]
    return resultat


class CodesBody(BaseModel):
    codes: List[str]


@api_router.post("/best-prices")
async def best_prices(body: CodesBody):
    out = {}
    arts = await db.articles.find(
        {"code": {"$in": body.codes}},
        {"_id": 0, "code": 1, "offers": 1, "prix_achat_ht": 1, "fournisseur_retenu": 1},
    ).to_list(2000)
    for a in arts:
        best_p = a.get("prix_achat_ht")
        best_f = a.get("fournisseur_retenu")
        for o in a.get("offers", []):
            p = o.get("prix_ht")
            if p is not None and (best_p is None or p < best_p):
                best_p, best_f = p, o.get("fournisseur")
        if best_p is not None:
            out[a["code"]] = {"fournisseur": best_f, "prix": round(best_p, 2)}
    return out


@api_router.get("/stats/decision")
async def stats_decision():
    arts = await db.articles.find(
        {},
        {"_id": 0, "code": 1, "article": 1, "lot": 1, "unite": 1, "statut": 1,
         "offers": 1, "prix_achat_ht": 1, "fournisseur_retenu": 1},
    ).to_list(2000)
    economie_fiable = 0.0
    opp = []
    lot_wins = {}
    lot_total = {}
    for a in arts:
        best_by = {}
        for o in a.get("offers", []):
            p = o.get("prix_ht")
            if p is None:
                continue
            f = o["fournisseur"]
            if f not in best_by or p < best_by[f]:
                best_by[f] = p
        if len(best_by) < 2:
            continue
        ranked = sorted(best_by.items(), key=lambda x: x[1])
        best_f, best_p = ranked[0]
        worst_p = ranked[-1][1]
        eco = worst_p - best_p
        lot = a.get("lot") or "Autre"
        lot_wins.setdefault(lot, {})
        lot_wins[lot][best_f] = lot_wins[lot].get(best_f, 0) + 1
        lot_total[lot] = lot_total.get(lot, 0) + 1
        if a.get("statut") == "fiable":
            economie_fiable += eco
            opp.append({
                "code": a["code"], "article": a["article"], "lot": lot, "unite": a.get("unite"),
                "best_fournisseur": best_f, "best_prix": round(best_p, 2), "worst_prix": round(worst_p, 2),
                "economie_eur": round(eco, 2), "economie_pct": round(eco / worst_p * 100, 1) if worst_p else 0,
            })
    opp.sort(key=lambda x: x["economie_eur"], reverse=True)
    reco = []
    for lot, wins in lot_wins.items():
        f = max(wins, key=wins.get)
        reco.append({"lot": lot, "fournisseur": f, "wins": wins[f], "total": lot_total[lot]})
    reco.sort(key=lambda x: x["lot"])
    return {
        "economie_fiable": round(economie_fiable, 2),
        "nb_comparables_fiable": len(opp),
        "top_opportunites": opp[:12],
        "reco_par_lot": reco,
    }


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
