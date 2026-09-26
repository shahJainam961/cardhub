import { existsSync } from "node:fs";

// Local development settings written by `pnpm db:env`; production uses real environment variables.
const localEnv = new URL("../.env.local", import.meta.url);
if (existsSync(localEnv)) process.loadEnvFile(localEnv);

const { readConfig } = await import("./config");
const { GameRoom } = await import("./rooms/GameRoom");
const { createServer } = await import("./app");

const config = readConfig();
GameRoom.config = config;
await createServer().listen(config.port);
console.log(
  `cardhub game server listening on :${config.port} (${config.supabase ? "Supabase auth" : "dev mode, no auth"})`,
);
