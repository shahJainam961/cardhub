import { COLOR_INFO, DEAL_COLORS, setInfo, type PlayerTable } from "@cardhub/engine";
import { COLOR_NAMES, dealCardLabel } from "@cardhub/shared";
import { AnimatePresence, motion } from "motion/react";
import { COLOR_HEX, COLOR_TEXT } from "../colors";
import { DealCardView } from "./DealCardView";

interface TableCardsProps {
  table: PlayerTable;
  /** Your own wilds you may re-color right now. */
  tappable?: ReadonlySet<string>;
  onTap?: (cardId: string) => void;
}

const bankTotal = (table: PlayerTable) => table.bank.reduce((sum, c) => sum + c.value, 0);

/**
 * Everything a player has laid on the table, shown as real cards (it's all public): their bank as
 * an overlapping row of money, and their properties as stacks grouped by color, each with its
 * progress, ✓ when complete, and any house or hotel.
 */
export function TableCards({ table, tappable, onTap }: TableCardsProps) {
  const colors = DEAL_COLORS.filter((c) => setInfo(table, c).total > 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1" aria-label={`Bank ${bankTotal(table)}M`}>
        <span className="text-xs font-extrabold" data-testid="bank-total">
          💰 Bank {bankTotal(table)}M
        </span>
        <div className="flex min-h-16 items-end">
          {table.bank.length === 0 && (
            <span className="flex h-16 w-11 items-center justify-center rounded-md border-2 border-dashed border-ink/30 text-[0.6rem] font-bold text-ink/40">
              empty
            </span>
          )}
          <AnimatePresence initial={false}>
            {table.bank.map((card, i) => (
              <motion.div
                key={card.id}
                className={i === 0 ? "" : "-ml-7"}
                initial={{ y: -40, opacity: 0, scale: 0.6 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -30, opacity: 0 }}
              >
                <DealCardView card={card} size="sm" />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-3 gap-y-3" aria-label="Properties">
        {colors.length === 0 ? (
          <span className="pb-6 text-xs font-bold text-ink/45">No properties yet</span>
        ) : (
          colors.map((color) => {
            const { total, complete } = setInfo(table, color);
            const cards = table.properties.filter((p) => p.color === color);
            const buildings = table.buildings.filter((b) => b.color === color);
            return (
              <div
                key={color}
                className="flex flex-col gap-1"
                data-testid={`set-${color}`}
                aria-label={`${COLOR_NAMES[color]} ${total} of ${COLOR_INFO[color].setSize}${complete ? ", complete" : ""}`}
              >
                <span
                  className={`self-start rounded-full border-2 border-ink px-2 text-[0.65rem] font-extrabold ${complete ? "shadow-[2px_2px_0_var(--color-ink)]" : ""}`}
                  style={{ background: COLOR_HEX[color], color: COLOR_TEXT[color] }}
                >
                  {total}/{COLOR_INFO[color].setSize}
                  {complete > 0 && " ✓"}
                  {buildings.map((b) => (b.card.action === "hotel" ? " 🏨" : " 🏠")).join("")}
                </span>
                <div className="flex items-end">
                  <AnimatePresence initial={false}>
                    {cards.map((p, i) => (
                      <motion.div
                        key={p.card.id}
                        className={i === 0 ? "" : "-ml-8"}
                        initial={{ y: -40, opacity: 0, rotate: -10 }}
                        animate={{ y: 0, opacity: 1, rotate: 0 }}
                        exit={{ y: -30, opacity: 0 }}
                      >
                        {tappable?.has(p.card.id) ? (
                          <button
                            type="button"
                            className="relative cursor-pointer rounded-md"
                            aria-label={`Move ${dealCardLabel(p.card)}`}
                            onClick={() => onTap?.(p.card.id)}
                          >
                            <DealCardView card={p.card} size="sm" className="ring-2 ring-sunny" />
                            <span
                              className="absolute -top-2 -right-2 rounded-full border-2 border-ink bg-sunny px-1 text-[0.6rem]"
                              aria-hidden
                            >
                              ↻
                            </span>
                          </button>
                        ) : (
                          <DealCardView card={p.card} size="sm" />
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
