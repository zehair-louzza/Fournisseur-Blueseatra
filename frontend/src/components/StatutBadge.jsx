import { STATUT } from "@/lib/format";
import { CheckCircle2, AlertTriangle, CircleDashed } from "lucide-react";

const MAP = {
  fiable: {
    cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
    Icon: CheckCircle2,
  },
  a_verifier: {
    cls: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
    Icon: AlertTriangle,
  },
  a_completer: {
    cls: "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400",
    Icon: CircleDashed,
  },
};

export const StatutBadge = ({ statut, small }) => {
  const m = MAP[statut] || MAP.fiable;
  const { Icon } = m;
  return (
    <span
      data-testid={`statut-badge-${statut}`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium ${m.cls} ${
        small ? "text-[11px]" : "text-xs"
      }`}
    >
      <Icon className="h-3 w-3" />
      {STATUT[statut]?.label || statut}
    </span>
  );
};
