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
  Subject: string;
}

/** Subjects of the code emails (see supabase/config.toml templates). */
export type CodeEmail = "link" | "signIn";
const SUBJECTS: Record<CodeEmail, string> = {
  link: "Confirm your email for cardhub",
  signIn: "Your cardhub sign-in code",
};

/**
 * Waits for the code email of the given kind sent to `email` in the local Mailpit inbox and returns
 * its 6-digit code. Picked by subject, not order: two emails can arrive within the same second.
 */
export async function waitForCode(
  email: string,
  kind: CodeEmail,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const query = encodeURIComponent(`to:"${email}" subject:"${SUBJECTS[kind]}"`);
    const res = await fetch(`${MAILBOX_URL}/api/v1/search?query=${query}`);
    const { messages = [] } = (await res.json()) as { messages?: MailSummary[] };
    const message = messages.find((m) => m.Subject === SUBJECTS[kind]);
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
  throw new Error(`No "${SUBJECTS[kind]}" email with a code arrived for ${email}`);
}

export const uniqueEmail = () =>
  `player-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

export const uniqueName = (prefix: string) => `${prefix} ${Math.random().toString(36).slice(2, 7)}`;
