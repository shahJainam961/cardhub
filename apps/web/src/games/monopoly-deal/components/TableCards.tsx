import { useDroppable } from "@dnd-kit/core";
import { COLOR_INFO, DEAL_COLORS, setInfo, type PlayerTable } from "@cardhub/engine";
import { COLOR_NAMES, dealCardLabel } from "@cardhub/shared";
import { motion } from "motion/react";
import { useId } from "react";
import { COLOR_HEX, COLOR_TEXT } from "../colors";
import { DealCardView } from "./DealCardView";

/** A drop zone's look while a card is being dragged. */
export type ZoneState = "idle" | "valid" | "invalid";

export interface DropZone {
  id: string;
  state: ZoneState;
}

interface TableCardsProps {
  table: PlayerTable;
  /** Your own wilds you may re-color right now. */
  tappable?: ReadonlySet<string>;
  onTap?: (cardId: string) => void;
  /** Your own table: the bank and property rows accept dragged cards. */
  bankZone?: DropZone;
  propertyZone?: DropZone;
}

const bankTotal = (table: PlayerTable) => table.bank.reduce((sum, c) => sum + c.value, 0);

function zoneClass(state: ZoneState | undefined, over: boolean): string {
  if (state === "valid") {
    return over
      ? "bg-sunny/60 outline-4 outline-sunny"
      : "bg-sunny/20 outline-4 outline-dashed outline-sunny";
  }
  if (state === "invalid") return "opacity-40";
  return "";
}

function useZone(zone: DropZone | undefined) {
  const fallback = useId();
  // Always enabled while it's a zone at all: dnd-kit measures drop zones when a drag starts, and
  // invalid drops are ignored by the drop handler instead.
  return useDroppable({ id: zone?.id ?? fallback, disabled: !zone });
}

/**
 * Everything a player has laid on the table, shown as real cards (it's all public): their bank as
 * an overlapping row of money, and their properties as stacks grouped by color, each with its
 * progress, ✓ when complete, and any house or hotel. Cards keep their identity (`layoutId`), so a
 * card paid or stolen flies from one table to another.
 */
export function TableCards({ table, tappable, onTap, bankZone, propertyZone }: TableCardsProps) {
  const colors = DEAL_COLORS.filter((c) => setInfo(table, c).total > 0);
  const { setNodeRef: bankRef, isOver: overBank } = useZone(bankZone);
  const { setNodeRef: propertiesRef, isOver: overProperties } = useZone(propertyZone);

  // Nothing laid down yet (and not your own table, which needs its drop zones): one short line.
  if (!bankZone && table.bank.length === 0 && table.properties.length === 0) {
    return <p className="text-xs font-bold text-ink/45">No cards on the table yet</p>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        ref={bankRef}
        className={`-m-1 flex flex-col gap-1 rounded-2xl p-1 transition ${zoneClass(bankZone?.state, overBank)}`}
        aria-label={`Bank ${bankTotal(table)}M`}
      >
        <span className="text-xs font-extrabold" data-testid="bank-total">
          💰 Bank {bankTotal(table)}M
          {bankZone?.state === "valid" && <span className="ml-2 text-grape">drop to bank</span>}
        </span>
        {/* A long bank scrolls within the panel rather than widening the page. */}
        <div className="flex min-h-16 max-w-full items-end overflow-x-auto pr-2 pb-1">
          {table.bank.length === 0 && (
            <span className="flex h-16 w-11 items-center justify-center rounded-md border-2 border-dashed border-ink/30 text-[0.6rem] font-bold text-ink/40">
              empty
            </span>
          )}
          {table.bank.map((card, i) => (
            <motion.div
              key={card.id}
              layoutId={card.id}
              className={i === 0 ? "" : "-ml-7"}
              initial={{ y: -40, opacity: 0, scale: 0.6 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
            >
              <DealCardView card={card} size="sm" />
            </motion.div>
          ))}
        </div>
      </div>

      <div
        ref={propertiesRef}
        className={`-m-1 flex min-h-16 flex-wrap items-end gap-x-3 gap-y-3 rounded-2xl p-1 transition ${zoneClass(propertyZone?.state, overProperties)}`}
        aria-label="Properties"
      >
        {colors.length === 0 ? (
          <span className="pb-6 text-xs font-bold text-ink/45">
            {propertyZone?.state === "valid" ? "Drop a property here" : "No properties yet"}
          </span>
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
                <motion.span
                  key={complete ? "complete" : "partial"}
                  initial={complete ? { scale: 0.4, rotate: -20 } : false}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 10 }}
                  className={`self-start rounded-full border-2 border-ink px-2 text-[0.65rem] font-extrabold ${complete ? "shadow-[2px_2px_0_var(--color-ink)]" : ""}`}
                  style={{ background: COLOR_HEX[color], color: COLOR_TEXT[color] }}
                >
                  {total}/{COLOR_INFO[color].setSize}
                  {complete > 0 && " ✓"}
                  {buildings.map((b) => (b.card.action === "hotel" ? " 🏨" : " 🏠")).join("")}
                </motion.span>
                <div className="flex items-end">
                  {cards.map((p, i) => (
                    <motion.div
                      key={p.card.id}
                      layoutId={p.card.id}
                      className={i === 0 ? "" : "-ml-8"}
                      initial={{ y: -40, opacity: 0, rotate: -10 }}
                      animate={{ y: 0, opacity: 1, rotate: 0 }}
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
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
