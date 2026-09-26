export interface ServerConfig {
  port: number;
  /** When unset the server runs in dev mode and trusts `devName` (local development and tests). */
  supabase: { url: string; key: string } | null;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  return {
    port: Number(env.PORT ?? 2567),
    supabase: url && key ? { url, key } : null,
  };
}
