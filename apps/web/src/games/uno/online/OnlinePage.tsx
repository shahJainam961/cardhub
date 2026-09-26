import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@cardhub/shared";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Button } from "../../../components/Button";
import { readDebugParams } from "../../../lib/random";
import { useOnlineStore } from "./onlineStore";

const CODE_CHARS = new RegExp(`[^${ROOM_CODE_ALPHABET}]`, "g");

export function OnlinePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { createRoom, status, error } = useOnlineStore();
  const [code, setCode] = useState("");

  const onCreate = async () => {
    const { botDelayMs } = readDebugParams(location.search);
    const created = await createRoom(botDelayMs === undefined ? {} : { botDelayMs });
    if (created) navigate(`/uno/room/${created}`);
  };

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-black">Play Uno online</h1>
        <Link to="/" className="text-sm text-white/70 underline">
          Home
        </Link>
      </header>

      {status === "error" && error && (
        <p className="rounded-xl bg-red-600/90 p-3" role="alert">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3 rounded-2xl bg-felt-800 p-4">
        <h2 className="text-lg font-bold">Host a game</h2>
        <p className="text-sm text-white/70">You&apos;ll get a code to share with friends.</p>
        <Button onClick={() => void onCreate()} disabled={status === "connecting"}>
          {status === "connecting" ? "Creating…" : "Create room"}
        </Button>
      </section>

      <form
        className="flex flex-col gap-3 rounded-2xl bg-felt-800 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`/uno/room/${code}`);
        }}
      >
        <label htmlFor="room-code" className="text-lg font-bold">
          Join with a code
        </label>
        <input
          id="room-code"
          className="min-h-14 rounded-lg bg-black/30 px-3 text-center text-2xl font-bold tracking-[0.4em] uppercase"
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
