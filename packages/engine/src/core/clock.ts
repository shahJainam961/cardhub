/** Time for each player plus seconds added after every move ("Fischer" increment). */
export interface TimeControl {
  initialMs: number;
  incrementMs: number;
}

/**
 * A two-player chess clock. Pure data: the host (server or local game) passes the current time in,
 * so the same code works on the server (official time online) and on a device.
 */
export interface ClockState {
  remainingMs: [number, number];
  /** Whose clock is running (0 or 1), or null when stopped or paused. */
  running: 0 | 1 | null;
  /** When the running clock last started. */
  since: number | null;
}

export function startClock(tc: TimeControl, first: 0 | 1, now: number): ClockState {
  return { remainingMs: [tc.initialMs, tc.initialMs], running: first, since: now };
}

/** Time left for each player at `now` (the running clock counts down live). */
export function remainingMs(clock: ClockState, now: number): [number, number] {
  const left: [number, number] = [...clock.remainingMs];
  if (clock.running !== null && clock.since !== null) {
    left[clock.running] = Math.max(0, left[clock.running] - (now - clock.since));
  }
  return left;
}

/** The player who has run out of time, if any. */
export function flaggedPlayer(clock: ClockState, now: number): 0 | 1 | null {
  if (clock.running === null) return null;
  return remainingMs(clock, now)[clock.running] <= 0 ? clock.running : null;
}

/** The running player finished their move: charge their time, add the increment, start the other clock. */
export function pressClock(clock: ClockState, tc: TimeControl, now: number): ClockState {
  if (clock.running === null) return clock;
  const left = remainingMs(clock, now);
  const mover = clock.running;
  left[mover] += tc.incrementMs;
  return { remainingMs: left, running: mover === 0 ? 1 : 0, since: now };
}

/** Stops the running clock, keeping its time (e.g. during a pass-and-play handoff). */
export function pauseClock(clock: ClockState, now: number): ClockState {
  return { remainingMs: remainingMs(clock, now), running: null, since: null };
}

export function resumeClock(clock: ClockState, player: 0 | 1, now: number): ClockState {
  return { ...clock, running: player, since: now };
}

/** Milliseconds until the running player's flag falls (Infinity when stopped). */
export function msUntilFlag(clock: ClockState, now: number): number {
  if (clock.running === null) return Infinity;
  return remainingMs(clock, now)[clock.running];
}
