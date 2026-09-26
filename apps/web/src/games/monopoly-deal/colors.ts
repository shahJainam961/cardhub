import type { DealColor } from "@cardhub/engine";

/** Card colors, close to the printed deck. */
export const COLOR_HEX: Record<DealColor, string> = {
  brown: "#8b5a2b",
  lightBlue: "#7dd3fc",
  purple: "#c026d3",
  orange: "#f97316",
  red: "#dc2626",
  yellow: "#facc15",
  green: "#16a34a",
  darkBlue: "#1d4ed8",
  railroad: "#1f2937",
  utility: "#bef264",
};

/** Readable text on top of each color. */
export const COLOR_TEXT: Record<DealColor, string> = {
  brown: "#fff",
  lightBlue: "#0f172a",
  purple: "#fff",
  orange: "#0f172a",
  red: "#fff",
  yellow: "#0f172a",
  green: "#fff",
  darkBlue: "#fff",
  railroad: "#fff",
  utility: "#0f172a",
};
