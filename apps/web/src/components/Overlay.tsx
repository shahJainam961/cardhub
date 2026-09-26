import type { ReactNode } from "react";

/** Full-screen modal panel for pickers, handoffs and the game-over screen. */
export function Overlay({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-sm rounded-2xl bg-felt-800 p-6 text-center shadow-2xl ring-1 ring-white/10">
        <h2 className="mb-4 text-xl font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
