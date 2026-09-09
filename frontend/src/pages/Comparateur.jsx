import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Scale, TrendingDown, Search, ArrowRight, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { eur, pct, lotLabel } from "@/lib/format";
import { KpiCard } from "@/components/KpiCard";

export default function Comparateur() {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => { api.comparateur().then(setData); }, []);

  if (!data) return <div className="py-20 text-center text-muted-foreground">Chargement…</div>;

  const rows = data.items.filter(
    (r) => !search ||
      r.article.toLowerCase().includes(search.toLowerCase()) ||
      (r.lot || "").toLowerCase().includes(search.toLowerCase())
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

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input data-testid="comparateur-search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrer par article ou lot…"
          className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-accent transition-colors" />
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border/70 bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-secondary/40 text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Article</th>
                <th className="px-3 py-3 text-center font-medium">Offres</th>
                <th className="px-3 py-3 text-left font-medium">Moins cher</th>
                <th className="px-3 py-3 text-right font-medium">Prix min</th>
                <th className="px-3 py-3 text-right font-medium">Prix max</th>
                <th className="px-4 py-3 text-right font-medium">Économie</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Aucun article comparable.</td></tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.code} data-testid={`comparateur-row-${r.code}`}
                  className="border-b border-border/40 last:border-0 hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-2.5 max-w-[280px]">
                    <p className="font-medium truncate">{r.article}</p>
                    <p className="text-xs text-muted-foreground truncate">{lotLabel(r.lot)}</p>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-secondary px-2 text-xs font-semibold">{r.nb_offres}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <Trophy className="h-3.5 w-3.5 text-amber-500" />{r.best_fournisseur}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{eur(r.best_prix)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground line-through whitespace-nowrap">{eur(r.worst_prix)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      <ArrowRight className="h-3 w-3" />−{eur(r.economie_eur)}
                      <span className="ml-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[11px]">{pct(r.economie_pct, 0)}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
