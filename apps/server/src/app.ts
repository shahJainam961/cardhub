import { UNO_ROOM } from "@cardhub/shared";
import { createEndpoint, createRouter, defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { UnoRoom } from "./rooms/UnoRoom";

/** The deployed commit, so release checks can wait until the new server is live. */
const version = createEndpoint("/version", { method: "GET" }, async () => ({
  commit: process.env.RENDER_GIT_COMMIT ?? "dev",
}));

export function createServer() {
  return defineServer({
    transport: new WebSocketTransport(),
    rooms: { [UNO_ROOM]: defineRoom(UnoRoom) },
    routes: createRouter({ version }),
  });
}
