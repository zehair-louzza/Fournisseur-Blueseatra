// Consistent color per lot for charts
export const LOT_PALETTE = [
  "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#eab308", "#a855f7", "#22c55e", "#0ea5e9",
  "#d946ef", "#fb7185",
];

export const colorForLot = (lot, lots = []) => {
  const idx = lots.indexOf(lot);
  return LOT_PALETTE[(idx >= 0 ? idx : (lot || "").length) % LOT_PALETTE.length];
};
