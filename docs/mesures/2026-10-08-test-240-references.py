import json, re, sys, unicodedata
sys.path.insert(0, "/home/user/workspace/fournisseur-inspect/backend")
from db_postgres import _build_where
from recherche_mots import filtre_recherche, CHAMPS_RECHERCHE
A = json.load(open("/home/user/workspace/mesure-tolerance/echantillon_240.json"))
STOP = {"de","du","des","la","le","les","et","en","pour","a","au","aux","avec","sur","sans","un","une"}
def sa(t): return "".join(c for c in unicodedata.normalize("NFKD", t) if not unicodedata.combining(c)).lower()
def mots(t): return [w for w in re.findall(r"[\w+]+", t or "") if len(w) >= 3 and sa(w) not in STOP and not w.isdigit()]
def variantes(a):
    v = []
    if a["ref_f"]: v.append(("ref_fournisseur", a["ref_f"]))
    if a["ref_fab"]: v.append(("ref_fabricant", a["ref_fab"].split("/")[-1]))
    v.append(("designation_exacte", a["article"]))
    m = mots(a["article"])
    if len(m) >= 2: v.append(("mots_desordre", " ".join(reversed(m[:3]))))
    if m:
        w = sa(m[0]); w = w if w.endswith(("s","x")) else w + "s"
        v.append(("pluriel_sans_accent", " ".join([w] + [sa(x) for x in m[1:3]])))
    if a["marque"] and m: v.append(("marque_produit", f"{a['marque'].split()[0].lower()} {m[0].lower()}"))
    if a["dfour"]: v.append(("copie_designation_fournisseur", " ".join(a["dfour"].split()[:4])))
    return v
def lit(x): return "'" + str(x).replace("'", "''") + "'"
def inline(w, p): return re.sub(r"\$(\d+)", lambda m: lit(p[int(m.group(1)) - 1]), w)
def sqlc(filtre, code):
    p = []; w = inline(_build_where(filtre, p), p)
    return (f"(SELECT jsonb_build_object('nb', count(*), 'cible', bool_or(id = {lit(code)}),"
            f" 'rang', CASE WHEN bool_or(id = {lit(code)}) THEN 1 + count(*) FILTER (WHERE doc->>'code' < (SELECT doc->>'code' FROM fournisseur.articles WHERE id = {lit(code)})) END)"
            f" FROM fournisseur.articles WHERE {w})")
cas, parts = [], []
for a in A:
    for typ, q in variantes(a):
        i = len(cas)
        try:
            re.compile(q); ancien = sqlc({"$or": [{c: {"$regex": q, "$options": "i"}} for c in CHAMPS_RECHERCHE]}, a["id"])
        except re.error:
            ancien = "jsonb_build_object('erreur', true)"
        f = filtre_recherche(q)
        nouveau = sqlc({"$and": f["$and"]}, a["id"]) if f else "jsonb_build_object('nb',0)"
        cas.append(dict(i=i, lot=a["lot"], code=a["code"], article=a["article"], type=typ, requete=q))
        parts.append(f"SELECT {i} i, {ancien} ancien, {nouveau} nouveau")
json.dump(cas, open("/home/user/workspace/mesure-tolerance/cas240.json", "w"), ensure_ascii=False)
for b in range(0, len(parts), 160):
    open(f"/home/user/workspace/mesure-tolerance/t240_{b//160}.sql", "w").write(
        "BEGIN READ ONLY; SET LOCAL statement_timeout='170s';\n" + "\nUNION ALL ".join(parts[b:b+160]) + ";\nROLLBACK;")
from collections import Counter
print(len(cas), (len(parts)+159)//160, Counter(c["type"] for c in cas))
