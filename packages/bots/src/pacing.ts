import type { Rng } from "@cardhub/engine";

/** How much thought a decision looks like it needs; weightier decisions take a bit longer. */
export type ThinkWeight = "quick" | "normal" | "hard";

const BASE_MS: Record<ThinkWeight, number> = { quick: 450, normal: 900, hard: 1_500 };

/**
 * A human-feeling pause before a bot acts: the base time for the decision, varied by ±35% so bots
 * don't move with a machine's rhythm. `scale` shortens or lengthens every pause (0 = instant).
 */
export function botThinkingTimeMs(weight: ThinkWeight, rng: Rng, scale = 1): number {
  return Math.round(BASE_MS[weight] * (0.65 + rng.next() * 0.7) * scale);
}
