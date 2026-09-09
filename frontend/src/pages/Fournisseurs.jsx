import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { Truck, ExternalLink, BadgeCheck, Globe } from "lucide-react";
import { api } from "@/lib/api";
import { eur, num } from "@/lib/format";
import { LOT_PALETTE } from "@/lib/colors";

export default function Fournisseurs() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.bySupplier().then(setRows); }, []);

  const chart = rows.map((r) => ({ name: r.fournisseur, articles: r.articles }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Analyse fournisseurs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {rows.length} enseignes · comparaison prix moyens et couverture catalogue.
        </p>
      </header>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border/70 bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Truck className="h-4 w-4 text-accent" />
          <h2 className="font-display text-lg font-semibold">Nombre d'articles retenus par fournisseur</h2>
        </div>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ left: 0, right: 8, bottom: 40 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="name" angle={-25} textAnchor="end" height={60} interval={0}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip cursor={{ fill: "hsl(var(--secondary))" }}
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="articles" radius={[4, 4, 0, 0]}>
                {chart.map((_, i) => <Cell key={i} fill={LOT_PALETTE[i % LOT_PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {rows.map((r, i) => (
          <motion.div key={r.fournisseur} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }} data-testid={`supplier-card-${i}`}
            className="rounded-xl border border-border/70 bg-card p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm" style={{ background: LOT_PALETTE[i % LOT_PALETTE.length] }} />
                <h3 className="font-display font-semibold leading-tight">{r.fournisseur}</h3>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Stat label="Articles" value={num(r.articles)} />
              <Stat label="Prix moyen" value={eur(r.prix_moyen)} />
              <Stat label="Votre tarif" value={num(r.votre_tarif)} icon={<BadgeCheck className="h-3 w-3 text-emerald-500" />} />
              <Stat label="Valeur" value={eur(r.valeur, { max: 0 })} />
            </div>
            {r.acces && (
              <p className="mt-3 text-xs text-muted-foreground border-t border-border/50 pt-2">{r.acces}</p>
            )}
            {r.site && (
              <a href={r.site} target="_blank" rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-blue-500 hover:underline">
                <Globe className="h-3 w-3" /> {r.site.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const Stat = ({ label, value, icon }) => (
  <div>
    <p className="flex items-center gap-1 text-xs text-muted-foreground">{icon}{label}</p>
    <p className="mt-0.5 font-mono font-semibold tabular-nums">{value}</p>
  </div>
);
