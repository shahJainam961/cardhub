import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@cardhub/shared";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Button } from "../components/Button";
import { TopBar } from "../components/TopBar";
import { readDebugParams } from "../lib/random";
import type { AnyMessages, AnySnapshot, OnlineGameConfig } from "./OnlineRoom";

const CODE_CHARS = new RegExp(`[^${ROOM_CODE_ALPHABET}]`, "g");

export function OnlinePage<Snapshot extends AnySnapshot, Messages extends AnyMessages>({
  config,
}: {
  config: OnlineGameConfig<Snapshot, Messages>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { createRoom, status, error } = config.useStore();
  const [code, setCode] = useState("");

  const onCreate = async () => {
    const { botDelayMs } = readDebugParams(location.search);
    const created = await createRoom(botDelayMs === undefined ? {} : { botDelayMs });
    if (created) navigate(`${config.basePath}/room/${created}`);
  };

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-4 py-8">
      <TopBar back={{ to: "/", label: "Home" }} />
      <h1 className="headline text-4xl font-bold">Play {config.title} online</h1>

      {status === "error" && error && (
        <p className="rounded-2xl bg-cherry p-3 font-bold text-white" role="alert">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3 panel p-5">
        <h2 className="text-2xl font-semibold">Host a game</h2>
        <p className="text-sm text-ink/60">You&apos;ll get a code to share with friends.</p>
        <Button variant="accent" onClick={() => void onCreate()} disabled={status === "connecting"}>
          {status === "connecting" ? "Creating…" : "Create room"}
        </Button>
      </section>

      <form
        className="flex flex-col gap-3 panel p-5"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`${config.basePath}/room/${code}`);
        }}
      >
        <label htmlFor="room-code" className="font-display text-2xl font-semibold">
          Join with a code
        </label>
        <input
          id="room-code"
          className="field min-h-16 text-center font-display text-3xl tracking-[0.4em] uppercase"
          value={code}
          maxLength={ROOM_CODE_LENGTH}
          autoComplete="off"
          autoCapitalize="characters"
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(CODE_CHARS, ""))}
        />
        <Button type="submit" disabled={code.length !== ROOM_CODE_LENGTH}>
          Join room
        </Button>
      </form>
    </main>
  );
}
