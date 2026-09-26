import type { Room as ClientRoom } from "@colyseus/sdk";

/** A connected test player that records every snapshot and error it receives. */
export interface Player<Snapshot> {
  room: ClientRoom;
  snapshots: Snapshot[];
  errors: string[];
  latest(): Snapshot;
  /** Resolves with the next snapshot (or the current one) matching `predicate`. */
  waitFor(predicate: (s: Snapshot) => boolean, timeoutMs?: number): Promise<Snapshot>;
  waitForError(): Promise<string>;
}

export function track<Snapshot>(room: ClientRoom): Player<Snapshot> {
  const snapshots: Snapshot[] = [];
  const errors: string[] = [];
  const listeners = new Set<() => void>();
  room.onMessage("snapshot", (s: Snapshot) => {
    snapshots.push(s);
    listeners.forEach((l) => l());
  });
  room.onMessage("error", (e: { message: string }) => {
    errors.push(e.message);
    listeners.forEach((l) => l());
  });
  const until = <T>(check: () => T | undefined, timeoutMs = 5_000) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(listener);
        reject(new Error("Timed out waiting for the server"));
      }, timeoutMs);
      const listener = () => {
        const value = check();
        if (value === undefined) return;
        clearTimeout(timer);
        listeners.delete(listener);
        resolve(value);
      };
      listeners.add(listener);
      listener();
    });
  return {
    room,
    snapshots,
    errors,
    latest: () => snapshots.at(-1)!,
    // Checks the latest snapshot now and then each new one as it arrives, so it never
    // matches a stale snapshot from earlier in the game.
    waitFor: (predicate, timeoutMs) =>
      until(() => {
        const latest = snapshots.at(-1);
        return latest && predicate(latest) ? latest : undefined;
      }, timeoutMs),
    waitForError: () => {
      const seen = errors.length;
      return until(() => errors[seen]);
    },
  };
}
