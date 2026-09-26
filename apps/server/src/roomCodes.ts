import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@cardhub/shared";
import { randomInt } from "node:crypto";

// Single-process registry. Running several server processes would need a shared store (e.g. Redis).
const active = new Set<string>();

export function claimRoomCode(): string {
  for (;;) {
    const code = Array.from(
      { length: ROOM_CODE_LENGTH },
      () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)],
    ).join("");
    if (!active.has(code)) {
      active.add(code);
      return code;
    }
  }
}

export function releaseRoomCode(code: string): void {
  active.delete(code);
}
