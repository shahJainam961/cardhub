import { pickUnoBotAction, UNO_BOT_LEVELS } from "@cardhub/bots";
import { uno, type UnoMove, type UnoOptions, type UnoState, type UnoView } from "@cardhub/engine";
import { describeUnoMove } from "@cardhub/shared";
import { parseHouseRules, parseUnoMove } from "../validation";
import { GameRoom, type OnlineGame } from "./GameRoom";

const unoOnline: OnlineGame<UnoState, UnoMove, UnoView, UnoOptions> = {
  definition: uno,
  botLevels: UNO_BOT_LEVELS,
  parseMove: parseUnoMove,
  parseOptions: parseHouseRules,
  pickBotAction: pickUnoBotAction,
  describeMove: (before, after, player, move, nameOf) => [
    describeUnoMove(before, after, player, move, nameOf),
  ],
  thinkWeight: (_state, move) =>
    move.type === "draw" || move.type === "pass" ? "quick" : "normal",
};

export class UnoRoom extends GameRoom<UnoState, UnoMove, UnoView, UnoOptions> {
  protected readonly game = unoOnline;
}
