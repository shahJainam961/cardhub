import { InvalidMoveError, type PlayerId, type UnoMove, type UnoOptions } from "@cardhub/engine";
import { create } from "zustand";
import { randomSeed } from "../../lib/random";
import {
  applyLocalMove,
  createLocalUnoGame,
  revealHand,
  type LocalUnoGame,
  type Seat,
} from "./localGame";

export const DEFAULT_BOT_DELAY_MS = 700;

export interface UnoSetup {
  seats: Seat[];
  options: Partial<UnoOptions>;
  /** Fixed seed and bot speed, used by end-to-end tests via URL parameters. */
  seed?: number;
  botDelayMs?: number;
}

interface UnoStore {
  game: LocalUnoGame | null;
  lastSetup: UnoSetup | null;
  error: string | null;
  start(setup: UnoSetup): void;
  restart(): void;
  play(player: PlayerId, move: UnoMove): void;
  reveal(player: PlayerId): void;
}

export const useUnoStore = create<UnoStore>()((set, get) => ({
  game: null,
  lastSetup: null,
  error: null,

  start(setup) {
    const game = createLocalUnoGame(setup.seats, setup.options, {
      seed: setup.seed ?? randomSeed(),
      botDelayMs: setup.botDelayMs ?? DEFAULT_BOT_DELAY_MS,
    });
    set({ game, lastSetup: setup, error: null });
  },

  restart() {
    const { lastSetup } = get();
    // A fixed seed would replay the exact same game, so "play again" always reshuffles.
    if (lastSetup) get().start({ ...lastSetup, seed: randomSeed() });
  },

  play(player, move) {
    const { game } = get();
    if (!game) return;
    try {
      set({ game: applyLocalMove(game, player, move), error: null });
    } catch (error) {
      if (!(error instanceof InvalidMoveError)) throw error;
      set({ error: error.reason });
    }
  },

  reveal(player) {
    const { game } = get();
    if (game) set({ game: revealHand(game, player) });
  },
}));
