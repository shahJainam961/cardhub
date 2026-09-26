import {
  UNO_ROOM,
  type CreateOptions,
  type JoinOptions,
  type UnoClientMessages,
  type UnoRoomSnapshot,
} from "@cardhub/shared";
import { Client, type Room } from "@colyseus/sdk";
import { create } from "zustand";
import { useAuthStore } from "../../../account/authStore";
import { supabase } from "../../../lib/supabase";

const client = new Client(import.meta.env.VITE_GAME_SERVER_URL || "http://localhost:2567");

/** How long to wait for the server to confirm a deliberate leave. */
const LEAVE_TIMEOUT_MS = 1_000;

type Status = "idle" | "connecting" | "connected" | "error";

interface OnlineStore {
  status: Status;
  /** The code being joined or currently joined. */
  code: string | null;
  snapshot: UnoRoomSnapshot | null;
  /** True while the connection dropped and the SDK is reconnecting. */
  reconnecting: boolean;
  /** Joining/connection failure. */
  error: string | null;
  /** Rejected request (e.g. an illegal move), shown briefly over the table. */
  notice: string | null;
  createRoom(options?: { botDelayMs?: number }): Promise<string | null>;
  joinRoom(code: string): Promise<void>;
  send<K extends keyof UnoClientMessages>(type: K, payload: UnoClientMessages[K]): void;
  leave(): Promise<void>;
}

/** The server checks the access token with Supabase; `devName` is only used in dev mode. */
async function joinOptions(): Promise<JoinOptions> {
  await useAuthStore.getState().init();
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  return {
    ...(session ? { accessToken: session.access_token } : {}),
    devName: useAuthStore.getState().account?.displayName ?? "Player",
  };
}

function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/not found|invalid room/i.test(message))
    return "No room with that code. Check the code and try again.";
  if (/fetch|network|ECONNREFUSED|websocket/i.test(message)) {
    return "Can't reach the game server. Check your connection and try again.";
  }
  return message;
}

let room: Room | null = null;

export const useOnlineStore = create<OnlineStore>()((set, get) => {
  const attach = (joined: Room) => {
    room = joined;
    joined.onMessage("snapshot", (snapshot: UnoRoomSnapshot) =>
      set({ snapshot, status: "connected", code: snapshot.code, notice: null }),
    );
    joined.onMessage("error", ({ message }: { message: string }) => set({ notice: message }));
    joined.onDrop(() => set({ reconnecting: true }));
    joined.onReconnect(() => set({ reconnecting: false }));
    joined.onLeave(() => {
      if (room !== joined) return;
      room = null;
      set({
        status: "error",
        snapshot: null,
        reconnecting: false,
        error: "You were disconnected from the room.",
      });
    });
  };

  const detach = async () => {
    const current = room;
    room = null;
    if (!current) return;
    // Some hosts' proxies (e.g. Render) drop the WebSocket close handshake, so `leave()` may
    // never resolve and the SDK would treat the leave as a dropped connection and keep
    // reconnecting. The server has already received the leave message by then, so turn
    // reconnection off and stop waiting after a moment.
    current.reconnection.enabled = false;
    await Promise.race([
      current.leave(true).catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, LEAVE_TIMEOUT_MS)),
    ]);
  };

  return {
    status: "idle",
    code: null,
    snapshot: null,
    reconnecting: false,
    error: null,
    notice: null,

    async createRoom(options = {}) {
      await detach();
      set({ status: "connecting", code: null, snapshot: null, error: null, notice: null });
      try {
        const createOptions: CreateOptions & { botDelayMs?: number } = {
          ...(await joinOptions()),
          ...options,
        };
        const joined = await client.create(UNO_ROOM, createOptions);
        attach(joined);
        set({ code: joined.roomId });
        return joined.roomId;
      } catch (error) {
        set({ status: "error", error: messageOf(error) });
        return null;
      }
    },

    async joinRoom(rawCode) {
      const code = rawCode.trim().toUpperCase();
      const { status, code: currentCode } = get();
      // Already joined or joining this room (React may mount the page twice in development).
      if (currentCode === code && (status === "connecting" || status === "connected")) return;
      await detach();
      set({ status: "connecting", code, snapshot: null, error: null, notice: null });
      try {
        attach(await client.joinById(code, await joinOptions()));
      } catch (error) {
        set({ status: "error", error: messageOf(error) });
      }
    },

    send(type, payload) {
      room?.send(type, payload);
    },

    async leave() {
      await detach();
      set({
        status: "idle",
        code: null,
        snapshot: null,
        reconnecting: false,
        error: null,
        notice: null,
      });
    },
  };
});
