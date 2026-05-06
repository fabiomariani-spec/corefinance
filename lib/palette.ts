export const PALETTE = [
  "#6366f1", "#8b5cf6", "#a855f7", "#ec4899",
  "#ef4444", "#f97316", "#f59e0b", "#84cc16",
  "#10b981", "#14b8a6", "#3b82f6", "#6b7280",
] as const;

export type PaletteColor = (typeof PALETTE)[number];
