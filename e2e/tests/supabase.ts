import { createClient } from "@supabase/supabase-js";

export function supabaseSettings() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase is not configured. Run `pnpm db:start && pnpm db:env` first.");
  }
  return { url, key };
}

/** A fresh client with its own session, like a separate device. */
export function newClient() {
  const { url, key } = supabaseSettings();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const MAILBOX_URL = process.env.E2E_MAILBOX_URL ?? "http://127.0.0.1:54324";

interface MailSummary {
  ID: string;
  Created: string;
}

/**
 * Waits for the `nth` (0-based) email sent to `email` in the local Mailpit inbox and returns
 * the 6-digit code in it.
 */
export async function waitForCode(email: string, nth = 0, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const query = encodeURIComponent(`to:"${email}"`);
    const res = await fetch(`${MAILBOX_URL}/api/v1/search?query=${query}`);
    const { messages = [] } = (await res.json()) as { messages?: MailSummary[] };
    const sorted = [...messages].sort((a, b) => a.Created.localeCompare(b.Created));
    const message = sorted[nth];
    if (message) {
      const detail = (await (
        await fetch(`${MAILBOX_URL}/api/v1/message/${message.ID}`)
      ).json()) as {
        Text: string;
        HTML: string;
      };
      const code = (detail.Text || detail.HTML).match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No email #${nth + 1} with a code arrived for ${email}`);
}

export const uniqueEmail = () =>
  `player-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

export const uniqueName = (prefix: string) => `${prefix} ${Math.random().toString(36).slice(2, 7)}`;
