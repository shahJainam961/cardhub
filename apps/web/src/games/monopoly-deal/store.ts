import { InvalidMoveError, type MonopolyDealMove, type PlayerId } from "@cardhub/engine";
import { create } from "zustand";
import { randomSeed } from "../../lib/random";
import {
  applyLocalMove,
  createLocalDealGame,
  revealHand,
  type LocalDealGame,
  type Seat,
} from "./localGame";

export interface DealSetup {
  seats: Seat[];
  /** Fixed seed and bot speed, used by end-to-end tests via URL parameters. */
  seed?: number;
  botSpeed?: number;
}

interface DealStore {
  game: LocalDealGame | null;
  lastSetup: DealSetup | null;
  error: string | null;
  start(setup: DealSetup): void;
  restart(): void;
  play(player: PlayerId, move: MonopolyDealMove): void;
  reveal(player: PlayerId): void;
  clearError(): void;
}

export const useDealStore = create<DealStore>()((set, get) => ({
  game: null,
  lastSetup: null,
  error: null,

  start(setup) {
    const game = createLocalDealGame(setup.seats, {
      seed: setup.seed ?? randomSeed(),
      botSpeed: setup.botSpeed ?? 1,
    });
    set({ game, lastSetup: setup, error: null });
  },

  restart() {
    const { lastSetup } = get();
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

  clearError() {
    set({ error: null });
  },
}));
