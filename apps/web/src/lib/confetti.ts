import confetti from "canvas-confetti";

const COLORS = ["#7b5cff", "#ff5fa2", "#ffd23f", "#2ed3a0", "#4cc3ff", "#ff8a3d"];

function reducedMotion(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** A big celebratory burst (wins). */
export function celebrate(): void {
  if (reducedMotion()) return;
  const burst = (x: number) =>
    void confetti({
      particleCount: 90,
      spread: 70,
      startVelocity: 45,
      origin: { x, y: 0.7 },
      colors: COLORS,
    });
  burst(0.2);
  burst(0.8);
  setTimeout(() => burst(0.5), 250);
}

/** A small pop of confetti at a point on screen (e.g. a completed set or "UNO!"). */
export function sparkle(x = 0.5, y = 0.5): void {
  if (reducedMotion()) return;
  void confetti({
    particleCount: 35,
    spread: 55,
    startVelocity: 25,
    scalar: 0.8,
    origin: { x, y },
    colors: COLORS,
  });
}
