import { motion, useReducedMotion } from "motion/react";
import { Link } from "react-router";
import { TopBar } from "../components/TopBar";

interface GameCard {
  id: string;
  name: string;
  blurb: string;
  art: string;
  /** The card's face color. */
  face: string;
  ready: boolean;
  online: boolean;
}

const GAMES: GameCard[] = [
  {
    id: "uno",
    name: "Uno",
    blurb: "Match colors and numbers, with house-rule variants.",
    art: "🃏",
    face: "#ff4d5e",
    ready: true,
    online: true,
  },
  {
    id: "monopoly-deal",
    name: "Monopoly Deal",
    blurb: "Collect property sets and charge rent.",
    art: "🏠",
    face: "#2ed3a0",
    ready: true,
    online: true,
  },
  {
    id: "chess",
    name: "Chess",
    blurb: "The classic strategy board game.",
    art: "♞",
    face: "#4cc3ff",
    ready: false,
    online: false,
  },
];

/** Where each card lands in the fanned hand on wide screens; phones stack them, slightly askew. */
const FAN = [
  "sm:-rotate-[7deg] sm:mt-5 rotate-1",
  "-rotate-1",
  "sm:rotate-[7deg] sm:mt-5 rotate-1",
];

export function HomePage() {
  const reduced = useReducedMotion();

  return (
    <main className="mx-auto flex min-h-full max-w-5xl flex-col gap-10 px-4 py-6">
      <TopBar logo={false} />

      <section className="text-center">
        <motion.h1
          className="headline text-7xl font-bold sm:text-8xl"
          initial={reduced ? false : { scale: 0.5, rotate: -8 }}
          animate={{ scale: 1, rotate: -2 }}
          transition={{ type: "spring", stiffness: 320, damping: 12 }}
        >
          cardhub
        </motion.h1>
        <p className="mt-4 text-lg font-extrabold text-white [text-shadow:2px_2px_0_var(--color-ink)]">
          Deal in your friends, or take on the bots.
        </p>
      </section>

      {/* The games are dealt from the deck into a fanned hand. */}
      <ul className="grid gap-6 sm:grid-cols-3 sm:gap-4" aria-label="Games">
        {GAMES.map((game, i) => {
          return (
            <motion.li
              key={game.id}
              // Tailwind's rotate uses the CSS `rotate` property, which combines with Motion's
              // transform, so the card flies in and still lands tilted.
              className={`panel flex flex-col overflow-hidden ${FAN[i]}`}
              initial={reduced ? false : { y: -260, x: (1 - i) * 120, scale: 0.4, opacity: 0 }}
              animate={{ y: 0, x: 0, scale: 1, opacity: 1 }}
              transition={{ delay: 0.25 + i * 0.12, type: "spring", stiffness: 210, damping: 18 }}
            >
              <div
                className="relative flex h-36 items-center justify-center border-b-[3px] border-ink"
                style={{ background: game.face }}
                aria-hidden
              >
                <span className="absolute top-2 left-3 font-display text-2xl font-bold text-white [-webkit-text-stroke:1px_var(--color-ink)]">
                  {game.name[0]}
                </span>
                <span className="flex size-24 items-center justify-center rounded-full border-[3px] border-ink bg-white text-6xl">
                  {game.art}
                </span>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h2 className="text-3xl font-semibold">{game.name}</h2>
                <p className="mt-1 flex-1 font-semibold text-ink/65">{game.blurb}</p>
                {game.ready ? (
                  <div className="mt-5 flex flex-col gap-3">
                    <Link
                      to={`/${game.id}/new`}
                      className="rounded-2xl border-[2.5px] border-ink bg-sunny px-4 py-2.5 text-center font-display text-lg font-semibold shadow-[3px_4px_0_var(--color-ink)] transition active:translate-x-[3px] active:translate-y-[4px] active:shadow-none"
                    >
                      Play {game.name}
                    </Link>
                    {game.online && (
                      <Link
                        to={`/${game.id}/online`}
                        className="rounded-2xl border-[2.5px] border-ink bg-grape px-4 py-2.5 text-center font-display text-lg font-semibold text-white shadow-[3px_4px_0_var(--color-ink)] transition active:translate-x-[3px] active:translate-y-[4px] active:shadow-none"
                      >
                        Play online
                      </Link>
                    )}
                  </div>
                ) : (
                  <span className="mt-5 rounded-2xl border-[2.5px] border-dashed border-ink/40 px-4 py-2.5 text-center font-display font-semibold text-ink/55">
                    Coming soon
                  </span>
                )}
              </div>
            </motion.li>
          );
        })}
      </ul>
    </main>
  );
}
