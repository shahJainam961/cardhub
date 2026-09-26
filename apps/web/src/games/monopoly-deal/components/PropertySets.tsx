import { COLOR_INFO, DEAL_COLORS, setInfo, type PlayerTable } from "@cardhub/engine";
import { COLOR_NAMES, dealCardLabel } from "@cardhub/shared";
import { COLOR_HEX, COLOR_TEXT } from "../colors";

interface PropertySetsProps {
  table: PlayerTable;
  /** Makes these property cards tappable (e.g. your own wilds to re-color). */
  tappable?: ReadonlySet<string>;
  onTap?: (cardId: string) => void;
  compact?: boolean;
}

/** A player's properties grouped by color, with progress (2/3), ✓ for complete sets and buildings. */
export function PropertySets({ table, tappable, onTap, compact = false }: PropertySetsProps) {
  const colors = DEAL_COLORS.filter((c) => setInfo(table, c).total > 0);
  if (colors.length === 0) return <p className="text-xs text-white/50">No properties yet</p>;

  return (
    <ul className="flex flex-wrap gap-1.5">
      {colors.map((color) => {
        const { total, complete } = setInfo(table, color);
        const size = COLOR_INFO[color].setSize;
        const cards = table.properties.filter((p) => p.color === color);
        const buildings = table.buildings.filter((b) => b.color === color);
        return (
          <li
            key={color}
            className={`rounded-md px-2 py-1 text-xs font-semibold ${complete ? "ring-2 ring-amber-300" : ""}`}
            style={{ background: COLOR_HEX[color], color: COLOR_TEXT[color] }}
            data-testid={`set-${color}`}
          >
            <span>
              {COLOR_NAMES[color]} {total}/{size}
              {complete > 0 && " ✓"}
              {buildings.map((b) => (b.card.action === "hotel" ? " 🏨" : " 🏠")).join("")}
            </span>
            {!compact && (
              <span className="mt-0.5 flex flex-col gap-0.5">
                {cards.map((p) =>
                  tappable?.has(p.card.id) ? (
                    <button
                      key={p.card.id}
                      type="button"
                      className="cursor-pointer rounded bg-white/85 px-1 text-left text-[0.65rem] text-slate-900 underline"
                      onClick={() => onTap?.(p.card.id)}
                    >
                      {dealCardLabel(p.card)} ↻
                    </button>
                  ) : (
                    <span
                      key={p.card.id}
                      className="rounded bg-white/70 px-1 text-[0.65rem] text-slate-900"
                    >
                      {dealCardLabel(p.card)}
                    </span>
                  ),
                )}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
