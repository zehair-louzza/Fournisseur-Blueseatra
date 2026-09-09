import { useEffect, useState, useCallback, useRef } from "react";
import { Search, Filter, Plus, X, ExternalLink, Package, ChevronLeft, ChevronRight, Tag, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { eur, pct, lotLabel } from "@/lib/format";
import { StatutBadge } from "@/components/StatutBadge";
import { useEstimate } from "@/lib/estimateStore";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

export default function Catalogue() {
  const [filters, setFilters] = useState({ lots: [], fournisseurs: [], statuts: [] });
  const [q, setQ] = useState({ search: "", lot: ALL, fournisseur: ALL, statut: ALL, sort: "code" });
  const [data, setData] = useState({ items: [], total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [vue, setVue] = useState("tout");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);
  const { addItem, addOffer, items } = useEstimate();
  const pageSize = 25;

  useEffect(() => {
    api.filters().then(setFilters);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = { page, page_size: pageSize, sort: q.sort };
    if (q.search) params.search = q.search;
    if (q.lot !== ALL) params.lot = q.lot;
    if (q.fournisseur !== ALL) params.fournisseur = q.fournisseur;
    if (q.statut !== ALL && vue !== "retenus") params.statut = q.statut;
    if (vue === "retenus") params.retenu = true;
    api.catalogue(params).then((d) => { setData(d); setLoading(false); });
  }, [page, q, vue]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q, vue]);

  const handleImport = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImporting(true);
    const fd = new FormData();
    fd.append("file", f);
    try {
      const res = await api.importCatalogue(fd);
      toast.success(`Catalogue mis à jour : ${res.updated} article(s) actualisé(s), ${res.added} ajouté(s)`);
      api.filters().then(setFilters);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Échec de l'import du fichier");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));
  const inBasket = (code) => items.some((i) => i.code === code);

  const resetFilters = () =>
    setQ({ search: "", lot: ALL, fournisseur: ALL, statut: ALL, sort: "code" });
  const hasFilters = q.search || q.lot !== ALL || q.fournisseur !== ALL || q.statut !== ALL;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Catalogue matériels</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.total} article{data.total > 1 ? "s" : ""} · prix fournisseurs réels 2026
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleImport} data-testid="import-file-input" />
          <button data-testid="import-catalogue-btn" onClick={() => fileRef.current?.click()} disabled={importing}
            className="flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-60">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {importing ? "Import en cours…" : "Importer un fichier Excel"}
          </button>
        </div>
      </header>

      <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-card p-1 w-fit">
        {[{ k: "tout", l: "Produits examinés" }, { k: "retenus", l: "Prix retenus" }].map((t) => (
          <button key={t.k} data-testid={`vue-tab-${t.k}`} onClick={() => setVue(t.k)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              vue === t.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}>
            {t.l}
          </button>
        ))}
      </div>
      {vue === "retenus" ? (
        <p className="-mt-2 text-xs text-muted-foreground">
          Prix validés (correspondance confirmée), directement utilisables en devis. Les articles « à vérifier » et « à compléter » restent disponibles dans « Produits examinés » et l'estimateur.
        </p>
      ) : (
        <p className="-mt-2 text-xs text-muted-foreground">
          Tous les produits examinés (meilleur prix retenu par article). Ouvrez une ligne pour voir et utiliser chaque prix examiné par enseigne dans vos calculs.
        </p>
      )}

      {/* Filter bar */}
      <div className="sticky top-14 z-10 rounded-xl border border-border/70 bg-card/90 p-3 backdrop-blur-md shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              data-testid="catalogue-search-input"
              value={q.search}
              onChange={(e) => setQ({ ...q, search: e.target.value })}
              placeholder="Rechercher un article, une référence, une marque…"
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
            />
          </div>
          <Select value={q.lot} onValueChange={(v) => setQ({ ...q, lot: v })}>
            <SelectTrigger data-testid="lot-filter-select" className="h-10 w-[180px]">
              <SelectValue placeholder="Lot" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tous les lots</SelectItem>
              {filters.lots.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={q.fournisseur} onValueChange={(v) => setQ({ ...q, fournisseur: v })}>
            <SelectTrigger data-testid="supplier-filter-select" className="h-10 w-[190px]">
              <SelectValue placeholder="Fournisseur" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tous fournisseurs</SelectItem>
              {filters.fournisseurs.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={q.statut} onValueChange={(v) => setQ({ ...q, statut: v })} disabled={vue === "retenus"}>
            <SelectTrigger data-testid="statut-filter-select" className="h-10 w-[150px]">
              <SelectValue placeholder="Fiabilité" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Toutes fiabilités</SelectItem>
              {filters.statuts.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={q.sort} onValueChange={(v) => setQ({ ...q, sort: v })}>
            <SelectTrigger data-testid="sort-select" className="h-10 w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="code">Trier : Code</SelectItem>
              <SelectItem value="article">Nom A→Z</SelectItem>
              <SelectItem value="prix_asc">Prix croissant</SelectItem>
              <SelectItem value="prix_desc">Prix décroissant</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <button data-testid="reset-filters-btn" onClick={resetFilters}
              className="flex h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <X className="h-4 w-4" /> Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-secondary/40 text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Code</th>
                <th className="px-3 py-3 text-left font-medium">Article</th>
                <th className="px-3 py-3 text-left font-medium">Lot</th>
                <th className="px-3 py-3 text-left font-medium">Fournisseur</th>
                <th className="px-3 py-3 text-right font-medium">Prix achat HT</th>
                <th className="px-3 py-3 text-center font-medium">Fiabilité</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/40">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="h-5 w-full animate-pulse rounded bg-secondary" />
                    </td>
                  </tr>
                ))}
              {!loading && data.items.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                  <Package className="mx-auto mb-2 h-8 w-8 opacity-40" />Aucun article trouvé.
                </td></tr>
              )}
              {!loading && data.items.map((a) => (
                <tr key={a.code} data-testid={`catalogue-row-${a.code}`}
                  onClick={() => setDetail(a)}
                  className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-secondary/40 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">{a.code}</td>
                  <td className="px-3 py-2.5 max-w-[280px]">
                    <p className="font-medium text-foreground truncate">{a.article}</p>
                    {a.marque && <p className="text-xs text-muted-foreground truncate">{a.marque}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{lotLabel(a.lot)}</td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">{a.fournisseur_retenu || "—"}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                    {a.prix_achat_ht ? (<>{eur(a.prix_achat_ht)}{a.unite && <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">/{a.unite}</span>}</>) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center"><StatutBadge statut={a.statut} small /></td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      data-testid={`add-article-to-estimate-btn-${a.code}`}
                      disabled={!a.prix_achat_ht}
                      onClick={(e) => { e.stopPropagation(); addItem(a); }}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                        inBasket(a.code)
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                          : "border-border text-muted-foreground hover:border-accent hover:text-accent disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted-foreground"
                      }`}
                      title="Ajouter au panier d'estimation">
                      <Plus className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-border/60 px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            Page {page} / {totalPages}
          </span>
          <div className="flex gap-1.5">
            <button data-testid="prev-page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="flex h-8 items-center gap-1 rounded-lg border border-border px-3 disabled:opacity-40 hover:bg-secondary transition-colors">
              <ChevronLeft className="h-4 w-4" /> Préc.
            </button>
            <button data-testid="next-page-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
              className="flex h-8 items-center gap-1 rounded-lg border border-border px-3 disabled:opacity-40 hover:bg-secondary transition-colors">
              Suiv. <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="article-detail-dialog">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-xl pr-6">{detail.article}</DialogTitle>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="font-mono text-xs text-muted-foreground">{detail.code}</span>
                  <StatutBadge statut={detail.statut} small />
                  <span className="text-xs text-muted-foreground">{detail.lot}</span>
                </div>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Sous-famille" value={detail.sous_famille} />
                <Field label="Unité de métré" value={detail.unite} />
                <Field label="Marque" value={detail.marque} />
                <Field label="Réf. fabricant" value={detail.ref_fabricant} />
                <Field label="Fournisseur retenu" value={detail.fournisseur_retenu} />
                <Field label="Réf. fournisseur" value={detail.ref_fournisseur} />
                <Field label="Type de prix" value={detail.type_prix} />
                <Field label="Date du prix" value={detail.date_prix} />
                <Field label="Prix public réf." value={detail.prix_public_ref ? eur(detail.prix_public_ref) : null} />
                <Field label="Remise" value={detail.remise != null ? pct(detail.remise) : null} />
                <Field label="Conditionnement" value={detail.conditionnement} />
                <Field label="TVA" value={detail.tva_pct != null ? pct(detail.tva_pct, 0) : null} />
              </div>
              {detail.point_controle && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                  <strong>Point de contrôle : </strong>{detail.point_controle}
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg bg-secondary/60 p-4">
                <div>
                  <p className="text-xs text-muted-foreground">Prix achat HT retenu</p>
                  <p className="font-mono text-2xl font-extrabold tabular-nums">
                    {detail.prix_achat_ht ? eur(detail.prix_achat_ht) : "—"}
                    {detail.prix_achat_ht && detail.unite && <span className="ml-1 text-sm font-normal text-muted-foreground">/{detail.unite}</span>}
                  </p>
                </div>
                <button
                  data-testid="detail-add-to-estimate-btn"
                  disabled={!detail.prix_achat_ht}
                  onClick={() => { addItem(detail); }}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors">
                  <Plus className="h-4 w-4" /> Ajouter à l'estimation
                </button>
              </div>

              {detail.offers?.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <Tag className="h-4 w-4 text-accent" /> Produits examinés — toutes enseignes ({detail.offers.length})
                  </p>
                  <div className="overflow-hidden rounded-lg border border-border/60">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                          <th className="px-3 py-2 text-left font-medium">Fournisseur</th>
                          <th className="px-3 py-2 text-left font-medium">Type de prix</th>
                          <th className="px-3 py-2 text-right font-medium">Prix HT</th>
                          <th className="px-3 py-2 text-right font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...detail.offers].sort((a, b) => (a.prix_ht || 0) - (b.prix_ht || 0)).map((o, i) => (
                          <tr key={i} className="border-t border-border/40">
                            <td className="px-3 py-2">{o.fournisseur}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{o.type_prix}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums whitespace-nowrap">{eur(o.prix_ht)}{detail.unite && <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">/{detail.unite}</span>}</td>
                            <td className="px-3 py-2 text-right">
                              <button data-testid={`use-offer-btn-${i}`} disabled={!o.prix_ht}
                                onClick={() => addOffer(detail, o)}
                                className="rounded-md border border-border px-2 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-30 transition-colors">
                                Utiliser
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    « Utiliser » ajoute ce prix examiné précis au panier d'estimation, indépendamment du prix retenu.
                  </p>
                </div>
              )}
              {detail.fiche_produit && (
                <a href="#" onClick={(e) => e.preventDefault()}
                  className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" /> Fiche produit fournisseur
                </a>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Field = ({ label, value }) =>
  value ? (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground break-words">{value}</p>
    </div>
  ) : null;
