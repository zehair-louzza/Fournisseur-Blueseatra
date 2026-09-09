import openpyxl, json, re
from datetime import datetime

wb = openpyxl.load_workbook('/app/catalogue.xlsx', data_only=True)

LOT_SHEETS = [s for s in wb.sheetnames if re.match(r'^\d', s)]  # 00..16, 03b, 99
LOT_SHEETS = [s for s in LOT_SHEETS if not s.startswith('00')]  # skip catalogue d'origine

def clean(v):
    if v is None: return None
    if isinstance(v, str):
        v = v.strip()
        return v if v else None
    return v

def num(v):
    if v is None: return None
    if isinstance(v, (int, float)): return round(float(v), 4)
    if isinstance(v, str):
        v = v.replace('\u202f','').replace(' ','').replace(',','.').strip()
        try: return round(float(v),4)
        except ValueError: return None
    return None

# ---- Parse per-lot article sheets ----
articles = []
for sheet in LOT_SHEETS:
    ws = wb[sheet]
    rows = list(ws.iter_rows(values_only=True))
    if not rows: continue
    header = [str(c).strip() if c else '' for c in rows[0]]
    # find col indexes by header name
    def idx(name):
        for i,h in enumerate(header):
            if h.lower().startswith(name.lower()): return i
        return None
    for r in rows[1:]:
        code = clean(r[0]) if len(r)>0 else None
        if not code or not re.match(r'^[A-Z]{2,4}-\d', str(code)): continue
        a = {
            'code': code,
            'lot': sheet,
            'sous_famille': clean(r[1]) if len(r)>1 else None,
            'article': clean(r[2]) if len(r)>2 else None,
            'unite': clean(r[3]) if len(r)>3 else None,
            'designation_fournisseur': clean(r[4]) if len(r)>4 else None,
            'marque': clean(r[5]) if len(r)>5 else None,
            'ref_fabricant': clean(r[6]) if len(r)>6 else None,
            'ref_fournisseur': clean(r[7]) if len(r)>7 else None,
            'fournisseur_retenu': clean(r[8]) if len(r)>8 else None,
            'prix_achat_ht': num(r[9]) if len(r)>9 else None,
            'type_prix': clean(r[10]) if len(r)>10 else None,
            'prix_public_ref': num(r[11]) if len(r)>11 else None,
            'remise': num(r[12]) if len(r)>12 else None,
            'date_prix': clean(r[13]) if len(r)>13 else None,
            'fiabilite': clean(r[14]) if len(r)>14 else None,
            'conditionnement': clean(r[15]) if len(r)>15 else None,
            'point_controle': clean(r[16]) if len(r)>16 else None,
            'marge_pct': num(r[17]) if len(r)>17 else None,
            'prix_vente_ht': num(r[18]) if len(r)>18 else None,
            'tva_pct': num(r[19]) if len(r)>19 else 20,
            'retrait': clean(r[20]) if len(r)>20 else None,
            'fiche_produit': clean(r[21]) if len(r)>21 else None,
            'offers': [],
        }
        # normalise date to ISO-ish string dd/mm/yyyy already
        if isinstance(a['date_prix'], datetime):
            a['date_prix'] = a['date_prix'].strftime('%d/%m/%Y')
        articles.append(a)

by_code = {a['code']: a for a in articles}

# ---- Parse Base articles for multi-supplier offers ----
ws = wb['Base articles']
rows = list(ws.iter_rows(values_only=True))
for r in rows[1:]:
    code = clean(r[0])
    if not code or code not in by_code: continue
    offer = {
        'fournisseur': clean(r[5]),
        'type_prix': clean(r[6]),
        'prix_ht': num(r[7]),
        'prix_public': num(r[8]),
        'remise': num(r[9]),
        'designation': clean(r[10]),
        'marque': clean(r[11]),
        'ref_fournisseur': clean(r[12]),
        'unite_vente': clean(r[13]),
        'conditionnement': clean(r[14]),
        'retrait': clean(r[15]),
        'fiabilite': clean(r[16]),
        'rang': num(r[19]),
    }
    if offer['fournisseur'] and offer['prix_ht'] is not None:
        by_code[code]['offers'].append(offer)

# ---- Synthèse par lot ----
ws = wb['Synthèse']
synth = []
for r in list(ws.iter_rows(values_only=True))[4:]:
    lot = clean(r[0])
    if not lot or not re.match(r'^\d', str(lot)): continue
    synth.append({
        'lot': lot, 'articles': num(r[1]), 'prix_releves': num(r[2]),
        'dont_votre_tarif': num(r[3]), 'comparables': num(r[4]),
        'a_completer': num(r[5]), 'couverture': num(r[6]), 'prix_moyen_ht': num(r[7]),
    })

# ---- Sources / fournisseurs ----
ws = wb['Sources']
sources = []
for r in list(ws.iter_rows(values_only=True))[4:]:
    name = clean(r[0])
    if not name: continue
    sources.append({
        'enseigne': name, 'site': clean(r[1]), 'acces': clean(r[2]),
        'statut': clean(r[3]), 'tire': clean(r[4]),
        'produits_examines': num(r[5]), 'offres_retenues': num(r[6]),
    })

# ---- Paramètres ----
ws = wb['Paramètres']
params = []
for r in list(ws.iter_rows(values_only=True))[4:]:
    p = clean(r[0])
    if not p: continue
    params.append({'parametre': p, 'valeur': clean(r[1]), 'commentaire': clean(r[2])})

# ---- Contrôles qualité ----
ws = wb['Contrôles qualité']
controls = []
for r in list(ws.iter_rows(values_only=True))[4:]:
    lot = clean(r[0])
    if not lot: continue
    controls.append({
        'lot': lot, 'article': clean(r[1]), 'fournisseur': clean(r[2]),
        'prix_ht': num(r[3]), 'nature': clean(r[4]), 'action': clean(r[5]),
    })

data = {
    'articles': articles,
    'synthese': synth,
    'sources': sources,
    'parametres': params,
    'controls': controls,
    'meta': {
        'generated': datetime.now().isoformat(),
        'total_articles': len(articles),
        'lots': LOT_SHEETS,
    }
}

with open('/app/backend/catalogue_data.json','w',encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False)

print('articles:', len(articles))
print('with offers:', sum(1 for a in articles if a['offers']))
print('lots:', len(synth))
print('sources:', len(sources))
print('params:', len(params))
print('controls:', len(controls))
print('sample article:', json.dumps(articles[0], ensure_ascii=False)[:600])
print('fiabilite values:', sorted(set(str(a['fiabilite']) for a in articles))[:20])
