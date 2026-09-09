import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Settings2, Database, Info } from "lucide-react";
import { api } from "@/lib/api";
import { num } from "@/lib/format";

export default function Parametres() {
  const [data, setData] = useState({ parametres: [], sources: [] });
  useEffect(() => { api.parametres().then(setData); }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Paramètres de chiffrage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Valeurs de référence issues du catalogue — main-d'œuvre, TVA et sources de prix.
        </p>
      </header>

      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 flex gap-3 text-sm">
        <Info className="h-5 w-5 shrink-0 text-blue-500" />
        <p className="text-muted-foreground">
          La TVA applicable dépend de la nature des travaux : <strong className="text-foreground">20 %</strong> (neuf / fournitures),
          <strong className="text-foreground"> 10 %</strong> (rénovation logement +2 ans) ou
          <strong className="text-foreground"> 5,5 %</strong> (rénovation énergétique). Ces taux sont ajustables ligne par ligne dans l'estimateur.
        </p>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border/70 bg-card overflow-hidden">
        <div className="flex items-center gap-2 p-5 pb-3">
          <Settings2 className="h-4 w-4 text-accent" />
          <h2 className="font-display text-lg font-semibold">Paramètres par défaut</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border/60 bg-secondary/40 text-xs uppercase text-muted-foreground">
                <th className="px-5 py-2.5 text-left font-medium">Paramètre</th>
                <th className="px-3 py-2.5 text-right font-medium">Valeur</th>
                <th className="px-5 py-2.5 text-left font-medium">Commentaire</th>
              </tr>
            </thead>
            <tbody>
              {data.parametres.map((p, i) => (
                <tr key={i} data-testid={`param-row-${i}`} className="border-b border-border/40 last:border-0 hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-2.5 font-medium">{p.parametre}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums">{p.valeur ?? "—"}</td>
                  <td className="px-5 py-2.5 text-muted-foreground text-xs">{p.commentaire || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="rounded-xl border border-border/70 bg-card overflow-hidden">
        <div className="flex items-center gap-2 p-5 pb-3">
          <Database className="h-4 w-4 text-accent" />
          <h2 className="font-display text-lg font-semibold">Sources de prix</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border/60 bg-secondary/40 text-xs uppercase text-muted-foreground">
                <th className="px-5 py-2.5 text-left font-medium">Enseigne</th>
                <th className="px-3 py-2.5 text-left font-medium">Accès</th>
                <th className="px-3 py-2.5 text-left font-medium">Statut</th>
                <th className="px-3 py-2.5 text-right font-medium">Examinés</th>
                <th className="px-5 py-2.5 text-right font-medium">Retenues</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((s, i) => (
                <tr key={i} data-testid={`source-row-${i}`} className="border-b border-border/40 last:border-0 hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-2.5 font-medium">{s.enseigne}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{s.acces || "—"}</td>
                  <td className="px-3 py-2.5 text-xs">{s.statut || "—"}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{num(s.produits_examines)}</td>
                  <td className="px-5 py-2.5 text-right font-mono font-semibold tabular-nums">{num(s.offres_retenues)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
