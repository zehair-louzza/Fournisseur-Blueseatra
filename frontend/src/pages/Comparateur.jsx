import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Scale, TrendingDown, Search, Trophy, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { eur, pct, lotLabel } from "@/lib/format";
import { KpiCard } from "@/components/KpiCard";

const SHORT = {
  "Au Forum du Bâtiment": "Au Forum",
  "YESSS Électrique": "YESSS",
  "La Plateforme du Bâtiment": "La Plateforme",
  "Chausson Matériaux": "Chausson",
  "Point.P": "Point.P",
  Prolians: "Prolians",
  SFIC: "SFIC",
  Rexel: "Rexel",
  Icilux: "Icilux",
};
const shortName = (f) => SHORT[f] || f;

const F = ({ label, value }) =>
  value ? (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground break-words">{value}</p>
    </div>
  ) : null;

export default function Comparateur() {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState(null);
  const [sort, setSort] = useState("eco");

  useEffect(() => { api.comparateur().then(setData); }, []);

  const openDetail = (code) => api.article(code).then(setDetail);

  if (!data) return <div className="py-20 text-center text-muted-foreground">Chargement…</div>;

  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = data.items
    .filter((r) => {
      if (!terms.length) return true;
      const hay = `${r.article} ${lotLabel(r.lot)} ${r.best_fournisseur}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    })
    .sort((a, b) =>
      sort === "alpha"
        ? a.article.localeCompare(b.article, "fr", { sensitivity: "base" })
        : b.economie_eur - a.economie_eur
    );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Comparateur de prix</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Meilleur prix par article parmi vos fournisseurs et économie potentielle.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard testid="kpi-eco-total" index={0} label="Économie potentielle totale"
          value={eur(data.total_economie, { max: 0 })} Icon={TrendingDown} accent="emerald"
          sub="en choisissant le moins cher" />
        <KpiCard testid="kpi-comparables" index={1} label="Articles comparables"
          value={data.nb_comparables} Icon={Scale} accent="blue"
          sub="avec 2 offres ou plus" />
        <KpiCard testid="kpi-eco-moy" index={2} label="Économie moyenne / article"
          value={data.nb_comparables ? pct(data.economie_moy_pct) : "—"} Icon={Trophy} accent="amber"
          sub="écart moyen max→min" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input data-testid="comparateur-search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par termes (ex : cable rj45)…"
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-accent transition-colors" />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-card p-1">
          {[{ k: "eco", l: "Économie ↓" }, { k: "alpha", l: "A → Z" }].map((s) => (
            <button key={s.k} data-testid={`comparateur-sort-${s.k}`} onClick={() => setSort(s.k)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                sort === s.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}>
              {s.l}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{rows.length} article{rows.length > 1 ? "s" : ""}</span>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border/70 bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-secondary/40 text-xs uppercase text-muted-foreground">
                <th className="sticky left-0 z-10 bg-secondary/60 px-4 py-3 text-left font-medium backdrop-blur-sm">Article</th>
                <th className="px-3 py-3 text-left font-medium">Unité</th>
                {data.fournisseurs.map((f) => (
                  <th key={f} className="px-3 py-3 text-right font-medium whitespace-nowrap" title={f}>{shortName(f)}</th>
                ))}
                <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Économie</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={data.fournisseurs.length + 3} className="px-4 py-12 text-center text-muted-foreground">Aucun article comparable.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.code} data-testid={`comparateur-row-${r.code}`} onClick={() => openDetail(r.code)}
                  className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-secondary/40 transition-colors">
                  <td className="sticky left-0 z-10 bg-card px-4 py-2.5 max-w-[240px]">
                    <p className="font-medium truncate">{r.article}</p>
                    <p className="text-xs text-muted-foreground truncate">{lotLabel(r.lot)} · {r.nb_offres} offres</p>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{r.unite || "—"}</td>
                  {data.fournisseurs.map((f) => {
                    const p = r.prix[f];
                    const fiche = r.fiches?.[f];
                    const isBest = p != null && p === r.best_prix;
                    return (
                      <td key={f} className={`px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap ${
                        p == null ? "text-muted-foreground/30"
                          : isBest ? "font-bold text-emerald-600 dark:text-emerald-400"
                          : "text-foreground"
                      }`}>
                        {p == null ? "—" : fiche ? (
                          <a href={fiche} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                            data-testid={`fiche-link-${r.code}-${f}`} title={`Voir la fiche produit chez ${f}`}
                            className="inline-flex items-center justify-end gap-1 hover:underline decoration-dotted underline-offset-2">
                            {isBest && <Trophy className="h-3 w-3 text-amber-500" />}{eur(p)}<ExternalLink className="h-3 w-3 opacity-50" />
                          </a>
                        ) : (
                          <span className="inline-flex items-center justify-end gap-1">
                            {isBest && <Trophy className="h-3 w-3 text-amber-500" />}{eur(p)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      −{eur(r.economie_eur)}
                      <span className="ml-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[11px]">{pct(r.economie_pct, 0)}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="comparateur-detail-dialog">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-xl pr-6">{detail.article}</DialogTitle>
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                  <span className="font-mono">{detail.code}</span><span>·</span><span>{detail.lot}</span>
                  {detail.sous_famille && (<><span>·</span><span>{detail.sous_famille}</span></>)}
                </div>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <F label="Marque" value={detail.marque} />
                <F label="Réf. fabricant" value={detail.ref_fabricant} />
                <F label="Unité de métré" value={detail.unite} />
                <F label="Fournisseur retenu" value={detail.fournisseur_retenu} />
                <F label="Prix retenu (achat HT)" value={detail.prix_achat_ht ? eur(detail.prix_achat_ht) : null} />
                <F label="Date du prix" value={detail.date_prix} />
              </div>
              {detail.point_controle && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                  <strong>Point de contrôle : </strong>{detail.point_controle}
                </div>
              )}
              <div>
                <p className="mb-2 text-sm font-semibold">Prix par enseigne ({(detail.offers || []).length})</p>
                <div className="overflow-hidden rounded-lg border border-border/60">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                        <th className="px-3 py-2 text-left font-medium">Enseigne</th>
                        <th className="px-3 py-2 text-left font-medium">Type de prix</th>
                        <th className="px-3 py-2 text-right font-medium">Prix HT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...(detail.offers || [])].filter((o) => o.prix_ht != null).sort((a, b) => a.prix_ht - b.prix_ht).map((o, i) => (
                        <tr key={i} className="border-t border-border/40">
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1.5">
                              {i === 0 && <Trophy className="h-3.5 w-3.5 text-amber-500" />}{o.fournisseur}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{o.type_prix || "—"}</td>
                          <td className={`px-3 py-2 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${i === 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                            {o.fiche_produit ? (
                              <a href={o.fiche_produit} target="_blank" rel="noreferrer" title={`Fiche produit chez ${o.fournisseur}`}
                                className="inline-flex items-center gap-1 hover:underline decoration-dotted underline-offset-2">
                                {eur(o.prix_ht)}<ExternalLink className="h-3 w-3 opacity-50" />
                              </a>
                            ) : eur(o.prix_ht)}
                            {detail.unite && <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">/{detail.unite}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
