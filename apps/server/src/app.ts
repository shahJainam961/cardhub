import { UNO_ROOM } from "@cardhub/shared";
import { defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { UnoRoom } from "./rooms/UnoRoom";

export function createServer() {
  return defineServer({
    transport: new WebSocketTransport(),
    rooms: { [UNO_ROOM]: defineRoom(UnoRoom) },
  });
}
