import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CircleDashed, ClipboardCheck, Search } from "lucide-react";
import { api } from "@/lib/api";
import { eur, lotLabel } from "@/lib/format";
import { StatutBadge } from "@/components/StatutBadge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function Alertes() {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  useEffect(() => { api.alerts().then(setData); }, []);

  const filt = (arr, keys) =>
    !search ? arr : arr.filter((r) => keys.some((k) => String(r[k] ?? "").toLowerCase().includes(search.toLowerCase())));

  if (!data) return <div className="py-20 text-center text-muted-foreground">Chargement…</div>;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Alertes qualité</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Articles nécessitant une action avant d'être utilisés dans un devis.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-4">
        <StatBox Icon={CircleDashed} color="rose" label="À compléter" value={data.counts.a_completer} />
        <StatBox Icon={AlertTriangle} color="amber" label="À vérifier" value={data.counts.a_verifier} />
        <StatBox Icon={ClipboardCheck} color="blue" label="Contrôles cohérence" value={data.counts.controls} />
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input data-testid="alerts-search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrer les alertes…"
          className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-accent transition-colors" />
      </div>

      <Tabs defaultValue="completer" className="w-full">
        <TabsList data-testid="alerts-tabs">
          <TabsTrigger value="completer" data-testid="tab-completer">À compléter ({data.counts.a_completer})</TabsTrigger>
          <TabsTrigger value="verifier" data-testid="tab-verifier">À vérifier ({data.counts.a_verifier})</TabsTrigger>
          <TabsTrigger value="controls" data-testid="tab-controls">Contrôles ({data.counts.controls})</TabsTrigger>
        </TabsList>

        <TabsContent value="completer">
          <AlertTable rows={filt(data.a_completer, ["article", "code", "lot"])}
            cols={[
              { k: "code", h: "Code", mono: true },
              { k: "article", h: "Article", strong: true },
              { k: "lot", h: "Lot", fmt: lotLabel },
              { k: "sous_famille", h: "Sous-famille" },
              { k: "statut", h: "Statut", badge: true },
            ]} />
        </TabsContent>
        <TabsContent value="verifier">
          <AlertTable rows={filt(data.a_verifier, ["article", "code", "lot", "point_controle"])}
            cols={[
              { k: "code", h: "Code", mono: true },
              { k: "article", h: "Article", strong: true },
              { k: "fournisseur_retenu", h: "Fournisseur" },
              { k: "prix_achat_ht", h: "Prix HT", price: true },
              { k: "point_controle", h: "Point de contrôle" },
            ]} />
        </TabsContent>
        <TabsContent value="controls">
          <AlertTable rows={filt(data.controls, ["article", "lot", "nature", "fournisseur"])}
            cols={[
              { k: "lot", h: "Lot", fmt: lotLabel },
              { k: "article", h: "Article", strong: true },
              { k: "fournisseur", h: "Fournisseur" },
              { k: "prix_ht", h: "Prix HT", price: true },
              { k: "nature", h: "Nature", strong: true },
              { k: "action", h: "À faire" },
            ]} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const StatBox = ({ Icon, color, label, value }) => {
  const c = { rose: "text-rose-500 bg-rose-500/10", amber: "text-amber-500 bg-amber-500/10", blue: "text-blue-500 bg-blue-500/10" }[color];
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/70 bg-card p-4 flex items-center gap-3">
      <div className={`rounded-lg p-2.5 ${c}`}><Icon className="h-5 w-5" /></div>
      <div>
        <p className="font-mono text-2xl font-extrabold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </motion.div>
  );
};

const AlertTable = ({ rows, cols }) => (
  <div className="mt-3 rounded-xl border border-border/70 bg-card overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-secondary/40 text-xs uppercase text-muted-foreground">
            {cols.map((c) => <th key={c.k} className="px-3 py-2.5 text-left font-medium">{c.h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={cols.length} className="px-4 py-12 text-center text-muted-foreground">Aucune alerte 🎉</td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} data-testid={`alert-row-${i}`} className="border-b border-border/40 last:border-0 hover:bg-secondary/30 transition-colors">
              {cols.map((c) => (
                <td key={c.k} className={`px-3 py-2.5 ${c.mono ? "font-mono text-xs text-muted-foreground" : ""} ${c.strong ? "font-medium" : ""} ${c.price ? "font-mono tabular-nums" : ""}`}>
                  {c.badge ? <StatutBadge statut={r[c.k]} small />
                    : c.price ? (r[c.k] != null ? eur(r[c.k]) : "—")
                    : c.fmt ? c.fmt(r[c.k])
                    : (r[c.k] || "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);
