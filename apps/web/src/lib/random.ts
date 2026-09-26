export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

/** Optional `?seed=` and `?botDelay=` URL parameters, used by end-to-end tests. */
export function readDebugParams(search: string): { seed?: number; botDelayMs?: number } {
  const params = new URLSearchParams(search);
  const seed = Number(params.get("seed"));
  const botDelayMs = Number(params.get("botDelay"));
  return {
    ...(params.has("seed") && Number.isInteger(seed) ? { seed: seed >>> 0 } : {}),
    ...(params.has("botDelay") && botDelayMs >= 0 ? { botDelayMs } : {}),
  };
}
