export const eur = (v, opts = {}) => {
  if (v === null || v === undefined || isNaN(v)) return "—";
  const max = opts.max ?? 2;
  const min = Math.min(opts.min ?? 2, max);
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  }).format(v);
};

export const num = (v, d = 0) => {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(v);
};

export const pct = (v, d = 1) => {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v)} %`;
};

// short lot label without leading "01 · "
export const lotLabel = (lot) => (lot || "").replace(/^\d+[a-z]?\s*·\s*/i, "");
export const lotNum = (lot) => (lot || "").match(/^\d+[a-z]?/)?.[0] || "";

export const STATUT = {
  fiable: { label: "Fiable", color: "emerald" },
  a_verifier: { label: "À vérifier", color: "amber" },
  a_completer: { label: "À compléter", color: "rose" },
};
