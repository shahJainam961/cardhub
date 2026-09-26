import type { JoinOptions } from "@cardhub/shared";
import { ServerError } from "@colyseus/core";
import type { ServerConfig } from "./config";

export interface VerifiedPlayer {
  id: string;
  name: string;
}

const MAX_NAME = 20;

/**
 * Resolves who is joining. With Supabase configured, the access token is checked with Supabase
 * and the display name comes from the player's profile, so clients cannot impersonate others.
 */
export async function verifyPlayer(
  config: ServerConfig,
  options: JoinOptions | undefined,
): Promise<VerifiedPlayer> {
  if (!config.supabase) {
    const name =
      typeof options?.devName === "string" ? options.devName.trim().slice(0, MAX_NAME) : "";
    if (!name) throw new ServerError(400, "A name is required");
    // The name is the identity in dev mode, so rejoining with it reclaims the seat.
    return { id: `dev-${name}`, name };
  }

  const token = options?.accessToken;
  if (typeof token !== "string" || !token) throw new ServerError(401, "Sign in to play online");
  const { url, key } = config.supabase;
  const headers = { apikey: key, Authorization: `Bearer ${token}` };

  const userResponse = await fetch(`${url}/auth/v1/user`, { headers });
  if (!userResponse.ok) throw new ServerError(401, "Your session has expired, please reload");
  const { id } = (await userResponse.json()) as { id: string };

  const profileResponse = await fetch(
    `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=display_name`,
    { headers },
  );
  const [profile] = profileResponse.ok
    ? ((await profileResponse.json()) as { display_name: string }[])
    : [];
  if (!profile) throw new ServerError(401, "Your profile could not be loaded");
  return { id, name: profile.display_name };
}
