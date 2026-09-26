import type { TimeControl } from "../../core/clock";

export type TimeControlCategory = "bullet" | "blitz" | "rapid" | "classical";

export interface TimeControlPreset extends TimeControl {
  /** e.g. "5+3": minutes + increment seconds. */
  label: string;
  category: TimeControlCategory;
}

const preset = (
  minutes: number,
  incrementSeconds: number,
  category: TimeControlCategory,
): TimeControlPreset => ({
  label: `${minutes}+${incrementSeconds}`,
  category,
  initialMs: minutes * 60_000,
  incrementMs: incrementSeconds * 1_000,
});

export const TIME_CONTROL_PRESETS: readonly TimeControlPreset[] = [
  preset(1, 0, "bullet"),
  preset(2, 1, "bullet"),
  preset(3, 0, "blitz"),
  preset(3, 2, "blitz"),
  preset(5, 0, "blitz"),
  preset(5, 3, "blitz"),
  preset(10, 0, "rapid"),
  preset(10, 5, "rapid"),
  preset(15, 10, "rapid"),
  preset(30, 0, "classical"),
  preset(30, 20, "classical"),
];

export const CUSTOM_LIMITS = {
  minMinutes: 0.5,
  maxMinutes: 180,
  maxIncrementSeconds: 60,
} as const;

/** A custom time control, or null when outside the allowed range. */
export function customTimeControl(minutes: number, incrementSeconds: number): TimeControl | null {
  const { minMinutes, maxMinutes, maxIncrementSeconds } = CUSTOM_LIMITS;
  if (!Number.isFinite(minutes) || minutes < minMinutes || minutes > maxMinutes) return null;
  if (
    !Number.isInteger(incrementSeconds) ||
    incrementSeconds < 0 ||
    incrementSeconds > maxIncrementSeconds
  ) {
    return null;
  }
  return { initialMs: Math.round(minutes * 60_000), incrementMs: incrementSeconds * 1_000 };
}

/** "5+3", "½+0", or "Untimed". */
export function timeControlLabel(tc: TimeControl | null): string {
  if (!tc) return "Untimed";
  const minutes = tc.initialMs / 60_000;
  const shown =
    minutes === 0.5 ? "½" : Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
  return `${shown}+${tc.incrementMs / 1_000}`;
}
