import { Link } from "react-router";
import { AccountBadge } from "../account/AccountBadge";

const GAMES = [
  {
    id: "uno",
    name: "Uno",
    blurb: "Match colors and numbers, with house-rule variants.",
    ready: true,
  },
  {
    id: "monopoly-deal",
    name: "Monopoly Deal",
    blurb: "Collect property sets and charge rent.",
    ready: false,
  },
  { id: "chess", name: "Chess", blurb: "The classic strategy board game.", ready: false },
];

export function HomePage() {
  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight">cardhub</h1>
          <p className="mt-2 text-white/70">
            Play card games with friends or against the computer.
          </p>
        </div>
        <AccountBadge />
      </header>
      <ul className="grid gap-4 sm:grid-cols-3">
        {GAMES.map((game) => (
          <li
            key={game.id}
            className="flex flex-col rounded-2xl bg-felt-800 p-5 ring-1 ring-white/10"
          >
            <h2 className="text-xl font-bold">{game.name}</h2>
            <p className="mt-1 flex-1 text-sm text-white/70">{game.blurb}</p>
            {game.ready ? (
              <Link
                to={`/${game.id}/new`}
                className="mt-4 rounded-xl bg-amber-400 px-4 py-2 text-center font-semibold text-slate-900 hover:bg-amber-300"
              >
                Play {game.name}
              </Link>
            ) : (
              <span className="mt-4 rounded-xl bg-white/5 px-4 py-2 text-center text-sm text-white/50">
                Coming soon
              </span>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
