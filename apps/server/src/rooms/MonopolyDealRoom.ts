import { MONOPOLY_DEAL_BOT_LEVELS, pickMonopolyDealBotAction } from "@cardhub/bots";
import {
  monopolyDeal,
  type MonopolyDealMove,
  type MonopolyDealOptions,
  type MonopolyDealState,
  type MonopolyDealView,
} from "@cardhub/engine";
import { describeMonopolyDealMove } from "@cardhub/shared";
import { parseDealMove } from "../validation";
import { GameRoom, type OnlineGame } from "./GameRoom";

const dealOnline: OnlineGame<
  MonopolyDealState,
  MonopolyDealMove,
  MonopolyDealView,
  MonopolyDealOptions
> = {
  definition: monopolyDeal,
  botLevels: MONOPOLY_DEAL_BOT_LEVELS,
  parseMove: parseDealMove,
  // Official rules only: nothing is configurable from the lobby.
  parseOptions: () => ({}),
  pickBotAction: pickMonopolyDealBotAction,
  describeMove: describeMonopolyDealMove,
  thinkWeight: (state, move) => {
    if (move.type === "endTurn" || move.type === "accept")
      return state.pending ? "normal" : "quick";
    if (move.type === "bank" || move.type === "property") return "normal";
    return "hard";
  },
};

export class MonopolyDealRoom extends GameRoom<
  MonopolyDealState,
  MonopolyDealMove,
  MonopolyDealView,
  MonopolyDealOptions
> {
  protected readonly game = dealOnline;
}
