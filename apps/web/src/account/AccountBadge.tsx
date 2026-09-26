import { Link } from "react-router";
import { Avatar } from "../components/Avatar";
import { useAuthStore } from "./authStore";

export function AccountBadge() {
  const { status, account } = useAuthStore();

  const label =
    status === "loading"
      ? "Signing in…"
      : status === "offline"
        ? "Offline"
        : (account?.displayName ?? "");

  return (
    <Link
      to="/account"
      className="flex items-center gap-2 rounded-full bg-white py-1 pr-4 pl-1 text-sm text-ink shadow-[0_4px_0_rgb(31_26_77/0.2)] transition hover:-translate-y-0.5"
      data-testid="account-badge"
    >
      <Avatar name={account?.displayName ?? "?"} size="sm" />
      <span className="font-display font-semibold">{label}</span>
      {status === "ready" && account && (
        <span
          className={`rounded-full px-2 text-xs font-bold ${account.isGuest ? "bg-cloud text-ink/70" : "bg-mint text-white"}`}
        >
          {account.isGuest ? "Guest" : "Saved"}
        </span>
      )}
    </Link>
  );
}
