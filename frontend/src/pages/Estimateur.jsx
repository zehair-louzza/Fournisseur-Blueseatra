import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Calculator, Trash2, Save, FolderOpen, Plus, ShoppingCart, X, FileText, Percent,
  PieChart as PieIcon, Receipt, Layers, Wand2, Truck,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { eur, pct, lotLabel, lotNum } from "@/lib/format";
import { LOT_PALETTE } from "@/lib/colors";
import { useEstimate } from "@/lib/estimateStore";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

// local precise computation mirroring backend
const computeLine = (li) => {
  const pa = Number(li.prix_achat_ht) || 0;
  let marge = Number(li.marge_pct) || 0;
  if (marge >= 100) marge = 99;
  const qty = Number(li.quantite) || 0;
  const tva = Number(li.tva_pct) || 20;
  const pvu = marge > 0 ? pa / (1 - marge / 100) : pa;
  const totalAchat = pa * qty;
  const totalVente = pvu * qty;
  const tvaEur = (totalVente * tva) / 100;
  return {
    pvu, totalAchat, totalVente,
    margeEur: totalVente - totalAchat,
    tvaEur, ttc: totalVente + tvaEur,
  };
};

export default function Estimateur() {
  const { items, updateItem, removeItem, clear, setItems } = useEstimate();
  const [projects, setProjects] = useState([]);
  const [openLoad, setOpenLoad] = useState(false);
  const [openSave, setOpenSave] = useState(false);
  const [meta, setMeta] = useState({ nom: "", client: "", description: "" });
  const [currentId, setCurrentId] = useState(null);

  useEffect(() => { api.listProjects().then(setProjects); }, []);

  const totals = useMemo(() => {
    let ta = 0, tv = 0, tt = 0, ttc = 0;
    const perLot = {};
    items.forEach((li) => {
      const c = computeLine(li);
      ta += c.totalAchat; tv += c.totalVente; tt += c.tvaEur; ttc += c.ttc;
      const lot = lotLabel(li.lot) || "Autre";
      perLot[lot] = (perLot[lot] || 0) + c.totalVente;
    });
    return {
      totalAchat: ta, totalVente: tv, tva: tt, ttc,
      marge: tv - ta, margePct: tv ? ((tv - ta) / tv) * 100 : 0,
      perLot: Object.entries(perLot).map(([lot, montant]) => ({ lot, montant })).sort((a, b) => b.montant - a.montant),
    };
  }, [items]);

  const applyMargeAll = (val) => {
    const m = Number(val);
    if (isNaN(m)) return;
    setItems(items.map((i) => ({ ...i, marge_pct: m })));
    toast.success(`Marge de ${m}% appliquée à toutes les lignes`);
  };

  const applyTvaAll = (val) => {
    const t = Number(val);
    if (isNaN(t)) return;
    setItems(items.map((i) => ({ ...i, tva_pct: t })));
    toast.success(`TVA de ${t}% appliquée à toutes les lignes`);
  };

  const [showLotMarge, setShowLotMarge] = useState(false);
  const lotsInBasket = [...new Set(items.map((i) => i.lot))];
  const applyMargeLot = (lot, val) => {
    const m = Number(val);
    if (isNaN(m)) return;
    setItems(items.map((i) => (i.lot === lot ? { ...i, marge_pct: m } : i)));
    toast.success(`Marge ${m}% appliquée au lot ${lotLabel(lot)}`);
  };

  const [openGroup, setOpenGroup] = useState(false);
  const [bestLoading, setBestLoading] = useState(false);

  const applyBestPrices = async () => {
    if (!items.length) return;
    setBestLoading(true);
    try {
      const codes = [...new Set(items.map((i) => i.code.split("@")[0]))];
      const best = await api.bestPrices(codes);
      let changed = 0;
      let saved = 0;
      const next = items.map((i) => {
        const b = best[i.code.split("@")[0]];
        if (b && b.prix != null && b.prix < i.prix_achat_ht) {
          saved += (i.prix_achat_ht - b.prix) * (Number(i.quantite) || 0);
          changed += 1;
          return { ...i, prix_achat_ht: b.prix, fournisseur: b.fournisseur };
        }
        return i;
      });
      setItems(next);
      toast.success(
        changed
          ? `${changed} ligne(s) basculée(s) au meilleur prix — économie ${eur(saved)} sur l'achat`
          : "Toutes les lignes sont déjà au meilleur prix"
      );
    } catch {
      toast.error("Impossible de récupérer les meilleurs prix");
    } finally {
      setBestLoading(false);
    }
  };

  const parFournisseur = useMemo(() => {
    const groups = {};
    items.forEach((li) => {
      const f = li.fournisseur || "Non défini";
      if (!groups[f]) groups[f] = { fournisseur: f, lignes: [], total: 0 };
      const total = (Number(li.prix_achat_ht) || 0) * (Number(li.quantite) || 0);
      groups[f].lignes.push({ ...li, total_achat: total });
      groups[f].total += total;
    });
    return Object.values(groups).sort((a, b) => b.total - a.total);
  }, [items]);

  const saveProject = async () => {
    if (!meta.nom.trim()) { toast.error("Donnez un nom au projet"); return; }
    const body = { ...meta, lignes: items };
    try {
      let res;
      if (currentId) res = await api.updateProject(currentId, body);
      else { res = await api.createProject(body); setCurrentId(res.id); }
      setProjects(await api.listProjects());
      setOpenSave(false);
      toast.success("Projet enregistré");
    } catch {
      toast.error("Erreur lors de l'enregistrement");
    }
  };

  const loadProject = (p) => {
    setItems(p.lignes.map((l) => ({
      code: l.code, article: l.article, lot: l.lot, unite: l.unite,
      fournisseur: l.fournisseur, prix_achat_ht: l.prix_achat_ht,
      marge_pct: l.marge_pct, quantite: l.quantite, tva_pct: l.tva_pct,
    })));
    setMeta({ nom: p.nom, client: p.client || "", description: p.description || "" });
    setCurrentId(p.id);
    setOpenLoad(false);
    toast.success(`Projet « ${p.nom} » chargé`);
  };

  const deleteProject = async (id, e) => {
    e.stopPropagation();
    await api.deleteProject(id);
    setProjects(await api.listProjects());
    if (currentId === id) { setCurrentId(null); }
    toast.success("Projet supprimé");
  };

  const newProject = () => { clear(); setMeta({ nom: "", client: "", description: "" }); setCurrentId(null); };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Estimateur de projet</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {currentId ? `Projet : ${meta.nom}` : "Nouveau projet"} · {items.length} ligne{items.length > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button data-testid="new-project-btn" onClick={newProject}
            className="flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-secondary transition-colors">
            <Plus className="h-4 w-4" /> Nouveau
          </button>
          <button data-testid="load-project-btn" onClick={() => setOpenLoad(true)}
            className="flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-secondary transition-colors">
            <FolderOpen className="h-4 w-4" /> Charger
          </button>
          <button data-testid="save-project-btn" onClick={() => { if (!items.length) { toast.error("Ajoutez des articles d'abord"); return; } setMeta((m) => ({ ...m })); setOpenSave(true); }}
            className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Save className="h-4 w-4" /> Enregistrer
          </button>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-20 text-center">
          <ShoppingCart className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium">Votre panier d'estimation est vide</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ajoutez des articles depuis le catalogue pour construire votre devis.
          </p>
          <a href="/catalogue" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition-opacity">
            <Plus className="h-4 w-4" /> Parcourir le catalogue
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          {/* Lines table */}
          <div className="xl:col-span-2 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <Percent className="h-4 w-4 text-accent" />
                <span className="text-muted-foreground">Marge globale :</span>
                <input data-testid="global-marge-input" type="number" defaultValue={25}
                  onBlur={(e) => applyMargeAll(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyMargeAll(e.target.value)}
                  className="w-16 rounded border border-border bg-background px-2 py-1 text-right font-mono outline-none focus:border-accent" />
                <span>%</span>
              </label>
              <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <Receipt className="h-4 w-4 text-accent" />
                <span className="text-muted-foreground">TVA globale :</span>
                {[0, 5.5, 10, 20].map((t) => (
                  <button key={t} data-testid={`global-tva-${t}`} onClick={() => applyTvaAll(t)}
                    className="rounded-md border border-border px-2 py-0.5 font-mono text-xs hover:border-accent hover:bg-accent/10 transition-colors">
                    {t}%
                  </button>
                ))}
                <input data-testid="global-tva-custom" type="number" placeholder="libre"
                  onBlur={(e) => e.target.value !== "" && applyTvaAll(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && e.target.value !== "" && applyTvaAll(e.target.value)}
                  className="w-14 rounded border border-border bg-background px-2 py-1 text-right font-mono text-xs outline-none focus:border-accent" />
              </div>
              <button data-testid="toggle-marge-lot-btn" onClick={() => setShowLotMarge((v) => !v)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  showLotMarge ? "border-accent bg-accent/10 text-foreground" : "border-border bg-card hover:bg-secondary"
                }`}>
                <Layers className="h-4 w-4 text-accent" /> Marge par lot
              </button>
              <button data-testid="best-price-auto-btn" onClick={applyBestPrices} disabled={bestLoading}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary transition-colors disabled:opacity-60">
                <Wand2 className="h-4 w-4 text-accent" /> {bestLoading ? "Recherche…" : "Meilleur prix auto"}
              </button>
              <button data-testid="group-supplier-btn" onClick={() => setOpenGroup(true)}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary transition-colors">
                <Truck className="h-4 w-4 text-accent" /> Par fournisseur
              </button>
              <button onClick={clear} data-testid="clear-basket-btn"
                className="ml-auto flex items-center gap-1 text-sm text-muted-foreground hover:text-rose-500 transition-colors">
                <X className="h-4 w-4" /> Vider
              </button>
            </div>

            {showLotMarge && lotsInBasket.length > 0 && (
              <div data-testid="marge-lot-panel" className="rounded-xl border border-border/70 bg-card p-4">
                <p className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Layers className="h-4 w-4 text-accent" /> Marge spécifique par lot
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {lotsInBasket.map((lot) => (
                    <LotMargeRow key={lot} lot={lot} items={items} onApply={applyMargeLot} />
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-secondary/40 text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2.5 text-left font-medium">Article</th>
                      <th className="px-2 py-2.5 text-left font-medium">Fournisseur</th>
                      <th className="px-2 py-2.5 text-right font-medium">Achat HT</th>
                      <th className="px-2 py-2.5 text-center font-medium">Marge %</th>
                      <th className="px-2 py-2.5 text-center font-medium">Qté</th>
                      <th className="px-2 py-2.5 text-center font-medium">TVA %</th>
                      <th className="px-2 py-2.5 text-right font-medium">Vente HT</th>
                      <th className="px-3 py-2.5 text-right font-medium">Total HT</th>
                      <th className="px-3 py-2.5 text-right font-medium">TTC</th>
                      <th className="px-2 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((li) => {
                      const c = computeLine(li);
                      return (
                        <tr key={li.code} data-testid={`estimate-line-${li.code}`}
                          className="border-b border-border/40 last:border-0 hover:bg-secondary/30 transition-colors">
                          <td className="px-3 py-2.5 max-w-[220px]">
                            <p className="font-medium truncate">{li.article}</p>
                            <p className="text-xs text-muted-foreground truncate">{lotLabel(li.lot)} · {li.unite || "u"}</p>
                          </td>
                          <td className="px-2 py-2.5 text-xs text-muted-foreground max-w-[110px] truncate" title={li.fournisseur}>{li.fournisseur || "—"}</td>
                          <td className="px-2 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{eur(li.prix_achat_ht)}</td>
                          <td className="px-2 py-2.5 text-center">
                            <input data-testid={`marge-input-${li.code}`} type="number" value={li.marge_pct}
                              onChange={(e) => updateItem(li.code, { marge_pct: e.target.value === "" ? 0 : Number(e.target.value) })}
                              className="w-14 rounded border border-border bg-background px-1.5 py-1 text-right font-mono text-xs outline-none focus:border-accent" />
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <input data-testid={`qty-input-${li.code}`} type="number" min="0" value={li.quantite}
                              onChange={(e) => updateItem(li.code, { quantite: e.target.value === "" ? 0 : Number(e.target.value) })}
                              className="w-14 rounded border border-border bg-background px-1.5 py-1 text-right font-mono text-xs outline-none focus:border-accent" />
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <input data-testid={`tva-input-${li.code}`} type="number" min="0" value={li.tva_pct}
                              onChange={(e) => updateItem(li.code, { tva_pct: e.target.value === "" ? 0 : Number(e.target.value) })}
                              className="w-14 rounded border border-border bg-background px-1.5 py-1 text-right font-mono text-xs outline-none focus:border-accent" />
                          </td>
                          <td className="px-2 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{eur(c.pvu)}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums whitespace-nowrap">{eur(c.totalVente)}</td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap text-muted-foreground">{eur(c.ttc)}</td>
                          <td className="px-2 py-2.5 text-right">
                            <button data-testid={`remove-line-${li.code}`} onClick={() => removeItem(li.code)}
                              className="text-muted-foreground hover:text-rose-500 transition-colors">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Totals sidebar */}
          <div className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-border/70 bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Calculator className="h-4 w-4 text-accent" />
                <h2 className="font-display text-lg font-semibold">Récapitulatif chiffrage</h2>
              </div>
              <dl className="space-y-2.5 text-sm">
                <Row label="Total achat HT" value={eur(totals.totalAchat)} testid="total-achat" />
                <Row label="Marge dégagée" value={eur(totals.marge)} accent testid="total-marge"
                  extra={pct(totals.margePct)} />
                <Row label="Total vente HT" value={eur(totals.totalVente)} strong testid="total-vente-ht" />
                <Row label="TVA" value={eur(totals.tva)} testid="total-tva" />
                <div className="my-2 border-t border-border/60" />
                <div className="flex items-center justify-between" data-testid="total-ttc">
                  <dt className="font-display font-semibold">Total TTC</dt>
                  <dd className="font-mono text-2xl font-extrabold tabular-nums text-accent">{eur(totals.ttc)}</dd>
                </div>
              </dl>
            </motion.div>

            {totals.perLot.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                className="rounded-xl border border-border/70 bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <PieIcon className="h-4 w-4 text-accent" />
                  <h2 className="font-display text-lg font-semibold">Répartition par lot</h2>
                </div>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={totals.perLot} dataKey="montant" nameKey="lot" cx="50%" cy="50%" innerRadius={45} outerRadius={78} paddingAngle={2} isAnimationActive={false}>
                        {totals.perLot.map((_, i) => <Cell key={i} fill={LOT_PALETTE[i % LOT_PALETTE.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => eur(v)}
                        contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 space-y-1">
                  {totals.perLot.map((l, i) => (
                    <div key={l.lot} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 truncate">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: LOT_PALETTE[i % LOT_PALETTE.length] }} />
                        <span className="truncate">{l.lot}</span>
                      </span>
                      <span className="font-mono tabular-nums ml-2">{eur(l.montant, { max: 0 })}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      )}

      <Dialog open={openGroup} onOpenChange={setOpenGroup}>
        <DialogContent data-testid="group-supplier-dialog" className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Commandes par fournisseur</DialogTitle>
          </DialogHeader>
          <p className="-mt-2 text-xs text-muted-foreground">
            Regroupement des lignes du devis par enseigne (montants en prix d'achat HT), pour préparer vos bons de commande.
          </p>
          <div className="space-y-4">
            {parFournisseur.map((g) => (
              <div key={g.fournisseur} data-testid={`group-${g.fournisseur}`} className="rounded-xl border border-border/70 overflow-hidden">
                <div className="flex items-center justify-between bg-secondary/50 px-4 py-2.5">
                  <span className="flex items-center gap-2 font-medium"><Truck className="h-4 w-4 text-accent" />{g.fournisseur}</span>
                  <span className="font-mono font-semibold tabular-nums">{eur(g.total)}</span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {g.lignes.map((li) => (
                      <tr key={li.code} className="border-t border-border/40">
                        <td className="px-4 py-2">{li.article}</td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums whitespace-nowrap text-muted-foreground">{li.quantite} × {eur(li.prix_achat_ht)}</td>
                        <td className="px-4 py-2 text-right font-mono font-semibold tabular-nums whitespace-nowrap">{eur(li.total_achat)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-4 py-3">
              <span className="font-display font-semibold">Total achat HT</span>
              <span className="font-mono text-xl font-extrabold tabular-nums text-accent">
                {eur(parFournisseur.reduce((s, g) => s + g.total, 0))}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save dialog */}
      <Dialog open={openSave} onOpenChange={setOpenSave}>
        <DialogContent data-testid="save-project-dialog">
          <DialogHeader><DialogTitle className="font-display">Enregistrer le projet</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Nom du projet *</label>
              <input data-testid="project-name-input" value={meta.nom} onChange={(e) => setMeta({ ...meta, nom: e.target.value })}
                placeholder="Ex : Rénovation bureaux Aubervilliers"
                className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Client</label>
              <input data-testid="project-client-input" value={meta.client} onChange={(e) => setMeta({ ...meta, client: e.target.value })}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Description</label>
              <textarea data-testid="project-desc-input" value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })}
                rows={2} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setOpenSave(false)} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary transition-colors">Annuler</button>
            <button data-testid="confirm-save-btn" onClick={saveProject} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">Enregistrer</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load dialog */}
      <Dialog open={openLoad} onOpenChange={setOpenLoad}>
        <DialogContent data-testid="load-project-dialog" className="max-w-lg">
          <DialogHeader><DialogTitle className="font-display">Charger un projet</DialogTitle></DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {projects.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Aucun projet enregistré.</p>}
            {projects.map((p) => (
              <div key={p.id} data-testid={`project-item-${p.id}`} onClick={() => loadProject(p)}
                className="flex cursor-pointer items-center justify-between rounded-lg border border-border/70 p-3 hover:border-accent/60 hover:bg-secondary/40 transition-colors">
                <div className="min-w-0">
                  <p className="font-medium truncate flex items-center gap-2"><FileText className="h-4 w-4 text-accent shrink-0" />{p.nom}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.client && `${p.client} · `}{p.totaux?.nb_lignes || 0} lignes · {eur(p.totaux?.total_ttc)} TTC
                  </p>
                </div>
                <button onClick={(e) => deleteProject(p.id, e)} data-testid={`delete-project-${p.id}`}
                  className="ml-2 text-muted-foreground hover:text-rose-500 transition-colors"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Row = ({ label, value, strong, accent, extra, testid }) => (
  <div className="flex items-center justify-between" data-testid={testid}>
    <dt className="text-muted-foreground">{label}</dt>
    <dd className={`font-mono tabular-nums ${strong ? "font-bold text-base" : ""} ${accent ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
      {value}{extra && <span className="ml-1 text-xs text-muted-foreground">({extra})</span>}
    </dd>
  </div>
);

const LotMargeRow = ({ lot, items, onApply }) => {
  const current = items.find((i) => i.lot === lot)?.marge_pct ?? 25;
  const [val, setVal] = useState(current);
  useEffect(() => { setVal(current); }, [current]);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
      <span className="flex-1 truncate text-sm" title={lot}>{lotLabel(lot)}</span>
      <input data-testid={`marge-lot-input-${lotNum(lot)}`} type="number" value={val}
        onChange={(e) => setVal(e.target.value)}
        className="w-16 rounded border border-border bg-background px-2 py-1 text-right font-mono text-xs outline-none focus:border-accent" />
      <span className="text-xs text-muted-foreground">%</span>
      <button data-testid={`apply-marge-lot-${lotNum(lot)}`} onClick={() => onApply(lot, val)}
        className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
        OK
      </button>
    </div>
  );
};
