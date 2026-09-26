import type { CSSProperties, ReactNode } from "react";
import { useElementSize } from "../hooks/useElementSize";

export interface TableSeat {
  id: string;
  content: ReactNode;
}

/**
 * Seat angles (degrees, screen coordinates: 180 = left, 270 = top, 360 = right) for the other
 * players, in turn order clockwise from the viewer at the bottom. Few players sit near the top;
 * more spread down the sides.
 */
export function seatAngles(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [270];
  // Up to a half circle; big tables also wrap a little way down the sides.
  const span = Math.min(count > 6 ? 216 : 176, 44 * count);
  return Array.from({ length: count }, (_, i) => 270 - span / 2 + (span * i) / (count - 1));
}

// The felt's ellipse inside the table area, in percent: center and radii.
const CX = 50;
const CY = 54;
const RX = 47;
const RY = 42;
/** The table is at most this many times as wide as it is tall, and as tall as it is wide. */
const MAX_ASPECT = 2.4;
const MAX_TALL = 1.3;

interface RoundTableProps {
  /** Everyone but the viewer, in turn order starting after them. */
  seats: TableSeat[];
  /** The viewer's own place at the bottom of the rim. */
  mySeat?: ReactNode;
  /** The middle of the table: piles, log and the main buttons. */
  children: ReactNode;
  /** Felt colors, center then edge. */
  felt: [string, string];
  /** Small seats (big tables on small screens) sit closer to the edges. */
  dense?: boolean;
  /**
   * Half the seat size as CSS variables (`--seat-half-w`, `--seat-half-h`), which keeps seats on
   * screen at the edges; for games whose seats are bigger than the default.
   */
  seatVars?: string;
}

/**
 * A round (oval) game table filling the space it's given: a rim with a hard sticker shadow, felt
 * in the middle, and the other players seated around the edge like at a real table.
 */
export function RoundTable({
  seats,
  mySeat,
  children,
  felt,
  dense = false,
  seatVars,
}: RoundTableProps) {
  const angles = seatAngles(seats.length);
  const [measure, { width, height }] = useElementSize<HTMLElement>();
  // Keep the table round-ish: on tall phones it would otherwise stretch into a long oval.
  const stage: CSSProperties =
    width > 0 && height > 0
      ? { width: Math.min(width, height * MAX_ASPECT), height: Math.min(height, width * MAX_TALL) }
      : { inset: 0 };
  // With players at the sides, the middle narrows so piles and log stay clear of them.
  const middleInset = seats.length >= 4 ? "inset-x-[19%]" : "inset-x-[10%]";
  return (
    <section
      ref={measure}
      aria-label="Table"
      className="relative flex min-h-0 w-full flex-1 items-center justify-center"
    >
      <div className="relative" style={stage}>
        <div
          className="absolute rounded-[50%] border-[3px] border-ink bg-tangerine shadow-[4px_6px_0_var(--color-ink)]"
          style={{
            left: `${CX - RX}%`,
            right: `${100 - CX - RX}%`,
            top: `${CY - RY}%`,
            bottom: `${100 - CY - RY}%`,
            backgroundImage:
              "repeating-linear-gradient(115deg, rgb(255 255 255 / 0.14) 0 6px, transparent 6px 14px)",
          }}
          aria-hidden
        >
          <div
            className="absolute inset-[9px] rounded-[50%] border-[3px] border-ink/80 sm:inset-[12px]"
            style={{
              background: `radial-gradient(ellipse at 50% 42%, ${felt[0]} 0%, ${felt[1]} 78%)`,
              boxShadow: "inset 0 6px 0 rgb(31 26 77 / 0.25)",
            }}
          />
        </div>

        {/* The middle: kept clear of the seats along the top of the rim. */}
        <div
          className={`absolute top-[27%] bottom-[9%] flex flex-col items-center justify-center gap-1.5 ${middleInset}`}
        >
          {children}
        </div>

        <ul aria-label="Players" className="pointer-events-none absolute inset-0">
          {seats.map((seat, i) => {
            const angle = (angles[i]! * Math.PI) / 180;
            const x = CX + RX * Math.cos(angle);
            const y = CY + RY * Math.sin(angle);
            const style: CSSProperties = {
              // Kept fully on screen even where the rim touches the edge.
              left: `clamp(var(--seat-half-w), ${x}%, calc(100% - var(--seat-half-w)))`,
              top: `clamp(var(--seat-half-h), ${y}%, calc(100% - var(--seat-half-h)))`,
            };
            return (
              <li
                key={seat.id}
                className={`pointer-events-auto absolute z-10 -translate-x-1/2 -translate-y-1/2 ${
                  seatVars ??
                  (dense
                    ? "[--seat-half-h:2rem] [--seat-half-w:1.9rem]"
                    : "[--seat-half-h:2.75rem] [--seat-half-w:2.6rem] sm:[--seat-half-w:4rem]")
                }`}
                style={style}
              >
                {seat.content}
              </li>
            );
          })}
        </ul>

        {mySeat && <div className="absolute bottom-0 left-1/2 z-10 -translate-x-1/2">{mySeat}</div>}
      </div>
    </section>
  );
}
