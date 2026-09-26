import type { ReactNode } from "react";
import { Link } from "react-router";
import { AccountBadge } from "../account/AccountBadge";
import { AudioToggles } from "./AudioToggles";

/** Page header: logo (or a back link), optional title, then audio switches and the account. */
export function TopBar({
  back,
  logo = true,
  children,
}: {
  back?: { to: string; label: string };
  /** Hide the small logo (the home page shows a big one instead). */
  logo?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      {back ? (
        <Link
          to={back.to}
          className="rounded-full bg-white/25 px-4 py-2 font-display font-semibold text-white shadow-[0_3px_0_rgb(31_26_77/0.2)] hover:bg-white/35"
        >
          ← {back.label}
        </Link>
      ) : logo ? (
        <Link to="/" className="headline text-3xl font-bold tracking-tight">
          cardhub
        </Link>
      ) : (
        <span />
      )}
      {children}
      <div className="flex items-center gap-2">
        <AudioToggles />
        <AccountBadge />
      </div>
    </header>
  );
}
