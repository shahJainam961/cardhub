import type { BotLevel } from "@cardhub/bots";
import type {
  GameResult,
  MonopolyDealMove,
  MonopolyDealOptions,
  MonopolyDealView,
  PlayerId,
  UnoMove,
  UnoOptions,
  UnoView,
} from "@cardhub/engine";

/** Colyseus room names, one per online game. */
export const UNO_ROOM = "uno";
export const MONOPOLY_DEAL_ROOM = "monopoly-deal";

export const ROOM_CODE_LENGTH = 5;
/** No 0/O, 1/I/L, so codes are easy to read out loud. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export interface JoinOptions {
  /** Supabase access token; the server looks up the player's id and display name from it. */
  accessToken?: string;
  /** Only used when the server runs without Supabase (local development and tests). */
  devName?: string;
}

export interface CreateOptions<Options = unknown> extends JoinOptions {
  options?: Partial<Options>;
  /** Test hook: 0 makes bots act instantly (end-to-end runs). */
  botDelayMs?: number;
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

/** Everything one client needs to render a room. Each player gets their own copy. */
export interface RoomSnapshot<Options, View, Move> {
  code: string;
  /** The room name, e.g. "uno", so a client can tell a code for another game apart. */
  game: string;
  phase: RoomPhase;
  seats: OnlineSeat[];
  /** The seat this snapshot was built for. */
  you: PlayerId;
  options: Options;
  view: View | null;
  legalMoves: Move[];
  moveCount: number;
  log: string[];
  result: GameResult | null;
}

/** Client → server messages and their payloads. */
export interface ClientMessages<Options, Move> {
  move: Move;
  setOptions: Partial<Options>;
  addBot: { level: BotLevel };
  removeSeat: { seatId: PlayerId };
  start: Record<string, never>;
  playAgain: Record<string, never>;
}

/** Server → client messages. */
export interface ServerMessages<Snapshot> {
  snapshot: Snapshot;
  error: { message: string };
}

export type UnoRoomSnapshot = RoomSnapshot<UnoOptions, UnoView, UnoMove>;
export type UnoClientMessages = ClientMessages<UnoOptions, UnoMove>;

export type DealRoomSnapshot = RoomSnapshot<
  MonopolyDealOptions,
  MonopolyDealView,
  MonopolyDealMove
>;
export type DealClientMessages = ClientMessages<MonopolyDealOptions, MonopolyDealMove>;
