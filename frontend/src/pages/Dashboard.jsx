import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  CartesianGrid,
} from "recharts";
import {
  Package, Wallet, ShieldCheck, AlertTriangle, Layers3, Truck, TrendingUp, CircleDashed,
  TrendingDown, Target, Award, ArrowRight, Trophy,
} from "lucide-react";
import { api } from "@/lib/api";
import { eur, num, lotLabel } from "@/lib/format";
import { LOT_PALETTE } from "@/lib/colors";
import { KpiCard } from "@/components/KpiCard";

const DISPO_COLORS = { "Retrait agence": "#10b981", "Sur commande": "#f59e0b", "Autre / à préciser": "#94a3b8" };

export default function Dashboard() {
  const nav = useNavigate();
  const [ov, setOv] = useState(null);
  const [byLot, setByLot] = useState([]);
  const [dec, setDec] = useState(null);

  useEffect(() => {
    api.overview().then(setOv);
    api.byLot().then(setByLot);
    api.decision().then(setDec);
  }, []);

  const lotBar = byLot
    .map((l) => ({ ...l, label: lotLabel(l.lot) }))
    .sort((a, b) => b.valeur - a.valeur);

  const statusPie = ov
    ? [
        { name: "Fiable", value: ov.fiable, color: "#10b981" },
        { name: "À vérifier", value: ov.a_verifier, color: "#f59e0b" },
        { name: "À compléter", value: ov.a_completer, color: "#f43f5e" },
      ]
    : [];

  const dispoPie = ov?.disponibilite || [];

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-border/70">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1776875479148-e51ea920282c?crop=entropy&cs=srgb&fm=jpg&w=1600&q=80"
            alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[hsl(215,45%,10%)]/95 via-[hsl(215,45%,12%)]/85 to-[hsl(215,45%,14%)]/60" />
        </div>
        <div className="relative px-6 py-8 sm:px-8 sm:py-10">
          <p className="text-xs font-medium uppercase tracking-widest text-amber-400">Achats TCE · ANELEC Groupe</p>
          <h1 className="mt-2 font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">Tableau de bord</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-300">
            Vue d'ensemble du catalogue multi-fournisseurs : offres relevées, meilleurs prix et disponibilités.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard testid="kpi-total-articles" index={0} label="Articles au catalogue"
          value={ov ? num(ov.total_articles) : "…"} Icon={Package} accent="blue"
          sub={ov ? `${ov.nb_lots} lots · ${ov.nb_fournisseurs} fournisseurs` : ""} />
        <KpiCard testid="kpi-economie-fiable" index={1} label="Économie fiable identifiée"
          value={dec ? eur(dec.economie_fiable, { max: 0 }) : "…"} Icon={TrendingDown} accent="emerald"
          sub={dec ? `sur ${num(dec.nb_comparables_fiable)} articles fiables comparés` : ""} />
        <KpiCard testid="kpi-valeur" index={2} label="Valeur au meilleur prix"
          value={ov ? eur(ov.valeur_meilleur_prix, { max: 0 }) : "…"} Icon={Wallet} accent="amber"
          sub={ov ? `Catalogue retenu ${eur(ov.valeur_catalogue, { max: 0 })}` : ""} />
        <KpiCard testid="kpi-alertes" index={3} label="Articles à traiter"
          value={ov ? num(ov.a_completer + ov.a_verifier) : "…"} Icon={AlertTriangle} accent="rose"
          sub={ov ? `${ov.a_completer} à compléter · ${ov.a_verifier} à vérifier` : ""} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border/70 bg-card p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-accent" />
            <h2 className="font-display text-lg font-semibold">Valeur d'achat par lot</h2>
          </div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={lotBar} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k€`}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis type="category" dataKey="label" width={130}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => [eur(v, { max: 0 }), "Valeur achat"]} />
                <Bar dataKey="valeur" radius={[0, 4, 4, 0]}>
                  {lotBar.map((_, i) => (
                    <Cell key={i} fill={LOT_PALETTE[i % LOT_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-xl border border-border/70 bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="h-4 w-4 text-accent" />
            <h2 className="font-display text-lg font-semibold">Fiabilité des prix</h2>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} isAnimationActive={false}>
                  {statusPie.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1.5">
            {statusPie.map((s) => (
              <div key={s.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="font-mono font-semibold tabular-nums">{num(s.value)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Decision: top opportunités + disponibilité */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border/70 bg-card overflow-hidden lg:col-span-2">
          <div className="flex items-center gap-2 p-5 pb-3">
            <Target className="h-4 w-4 text-accent" />
            <h2 className="font-display text-lg font-semibold">Top opportunités d'achat</h2>
            <span className="ml-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">prix fiables</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border/60 bg-secondary/40 text-xs uppercase text-muted-foreground">
                  <th className="px-5 py-2.5 text-left font-medium">Article</th>
                  <th className="px-3 py-2.5 text-left font-medium">Meilleur fournisseur</th>
                  <th className="px-3 py-2.5 text-right font-medium">Prix mini</th>
                  <th className="px-5 py-2.5 text-right font-medium">Économie</th>
                </tr>
              </thead>
              <tbody>
                {(dec?.top_opportunites || []).map((o) => (
                  <tr key={o.code} data-testid={`opp-row-${o.code}`} onClick={() => nav("/comparateur")}
                    className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-secondary/40 transition-colors">
                    <td className="px-5 py-2.5 max-w-[240px]">
                      <p className="font-medium truncate">{o.article}</p>
                      <p className="text-xs text-muted-foreground truncate">{lotLabel(o.lot)}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      <span className="inline-flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5 text-amber-500" />{o.best_fournisseur}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                      {eur(o.best_prix)}{o.unite && <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">/{o.unite}</span>}
                    </td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        −{eur(o.economie_eur)}
                        <span className="ml-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[11px]">{o.economie_pct}%</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-1 p-3 text-xs text-muted-foreground">
            Ouvrir le comparateur <ArrowRight className="h-3 w-3" />
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-xl border border-border/70 bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Truck className="h-4 w-4 text-accent" />
            <h2 className="font-display text-lg font-semibold">Disponibilité / livraison</h2>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={dispoPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} isAnimationActive={false}>
                  {dispoPie.map((s, i) => <Cell key={i} fill={DISPO_COLORS[s.name] || LOT_PALETTE[i]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1.5">
            {dispoPie.map((s) => (
              <div key={s.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: DISPO_COLORS[s.name] || "#94a3b8" }} />
                  {s.name}
                </span>
                <span className="font-mono font-semibold tabular-nums">{num(s.value)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Fournisseur recommandé par lot */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border/70 bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Award className="h-4 w-4 text-accent" />
          <h2 className="font-display text-lg font-semibold">Fournisseur recommandé par lot</h2>
          <span className="text-xs text-muted-foreground">(le plus souvent le moins cher)</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(dec?.reco_par_lot || []).map((r, i) => (
            <div key={r.lot} data-testid={`reco-lot-${i}`} className="rounded-lg border border-border/60 bg-background p-3">
              <p className="text-xs text-muted-foreground truncate" title={r.lot}>{r.lot}</p>
              <p className="mt-1 flex items-center gap-1.5 font-medium truncate"><Trophy className="h-4 w-4 shrink-0 text-amber-500" />{r.fournisseur}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">moins cher sur {r.wins}/{r.total} articles comparés</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Lot table */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="rounded-xl border border-border/70 bg-card overflow-hidden">
        <div className="flex items-center gap-2 p-5 pb-3">
          <Layers3 className="h-4 w-4 text-accent" />
          <h2 className="font-display text-lg font-semibold">Synthèse par lot</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border/60 bg-secondary/40 text-xs uppercase text-muted-foreground">
                <th className="px-5 py-2.5 text-left font-medium">Lot</th>
                <th className="px-3 py-2.5 text-right font-medium">Articles</th>
                <th className="px-3 py-2.5 text-right font-medium">Prix moyen HT</th>
                <th className="px-3 py-2.5 text-right font-medium">Valeur achat</th>
                <th className="px-3 py-2.5 text-right font-medium">Fiables</th>
                <th className="px-5 py-2.5 text-right font-medium">À traiter</th>
              </tr>
            </thead>
            <tbody>
              {byLot.map((l, i) => (
                <tr key={l.lot} data-testid={`dashboard-lot-row-${i}`}
                  className="border-b border-border/40 last:border-0 hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: LOT_PALETTE[i % LOT_PALETTE.length] }} />
                      {l.lot}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{l.articles}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{eur(l.prix_moyen)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold">{eur(l.valeur, { max: 0 })}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{l.fiable}</td>
                  <td className="px-5 py-2.5 text-right font-mono tabular-nums">
                    {l.a_completer + l.a_verifier > 0 ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <CircleDashed className="h-3 w-3" />{l.a_completer + l.a_verifier}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
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
