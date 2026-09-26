import { Link } from "react-router";
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
      className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
      data-testid="account-badge"
    >
      <span className="font-semibold">{label}</span>
      {status === "ready" && account && (
        <span className="rounded-full bg-black/30 px-2 text-xs text-white/70">
          {account.isGuest ? "Guest" : "Saved"}
        </span>
      )}
    </Link>
  );
}
