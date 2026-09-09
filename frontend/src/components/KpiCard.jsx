import { motion } from "framer-motion";

export const KpiCard = ({ label, value, sub, Icon, accent = "amber", index = 0, testid }) => {
  const accents = {
    amber: "text-amber-500 bg-amber-500/10",
    blue: "text-blue-500 bg-blue-500/10",
    emerald: "text-emerald-500 bg-emerald-500/10",
    rose: "text-rose-500 bg-rose-500/10",
    slate: "text-slate-500 bg-slate-500/10",
  };
  return (
    <motion.div
      data-testid={testid}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
      className="group relative overflow-hidden rounded-xl border border-border/70 bg-card p-5 shadow-sm hover:shadow-md hover:border-border transition-[box-shadow,border-color]"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 font-mono text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground tabular-nums">
            {value}
          </p>
          {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </div>
        {Icon && (
          <div className={`shrink-0 rounded-lg p-2.5 ${accents[accent]}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </motion.div>
  );
};
