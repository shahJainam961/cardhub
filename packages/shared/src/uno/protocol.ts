import type { BotLevel } from "@cardhub/bots";
import type { GameResult, PlayerId, UnoMove, UnoOptions, UnoView } from "@cardhub/engine";

/** Colyseus room name for online Uno. */
export const UNO_ROOM = "uno";

export const ROOM_CODE_LENGTH = 5;
/** No 0/O, 1/I/L, so codes are easy to read out loud. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export interface JoinOptions {
  /** Supabase access token; the server looks up the player's id and display name from it. */
  accessToken?: string;
  /** Only used when the server runs without Supabase (local development and tests). */
  devName?: string;
}

export interface CreateOptions extends JoinOptions {
  options?: Partial<UnoOptions>;
}

export interface OnlineSeat {
  id: PlayerId;
  name: string;
  kind: "human" | "bot";
  level: BotLevel;
  connected: boolean;
  isHost: boolean;
}

export type RoomPhase = "lobby" | "playing" | "finished";

/** Everything one client needs to render the room. Each player gets their own copy. */
export interface UnoRoomSnapshot {
  code: string;
  phase: RoomPhase;
  seats: OnlineSeat[];
  /** The seat this snapshot was built for. */
  you: PlayerId;
  options: UnoOptions;
  view: UnoView | null;
  legalMoves: UnoMove[];
  moveCount: number;
  log: string[];
  result: GameResult | null;
}

/** Client → server messages and their payloads. */
export interface UnoClientMessages {
  move: UnoMove;
  setOptions: Partial<UnoOptions>;
  addBot: { level: BotLevel };
  removeSeat: { seatId: PlayerId };
  start: Record<string, never>;
  playAgain: Record<string, never>;
}

/** Server → client messages. */
export interface UnoServerMessages {
  snapshot: UnoRoomSnapshot;
  error: { message: string };
}
