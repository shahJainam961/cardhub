import type { SupabaseClient, User } from "@supabase/supabase-js";
import { create } from "zustand";
import { supabase } from "../lib/supabase";

export const MAX_NAME_LENGTH = 20;

export interface Account {
  id: string;
  displayName: string;
  /** Guests have no email yet; linking one keeps the same id and progress. */
  isGuest: boolean;
  email: string | null;
}

export type AuthStatus = "loading" | "ready" | "offline";

export interface AuthState {
  status: AuthStatus;
  account: Account | null;
  error: string | null;
  /** Signs in the saved session, or creates a guest account on first launch. */
  init(): Promise<void>;
  rename(displayName: string): Promise<boolean>;
  /** Guest → permanent account: sends a code to `email`, then `verifyLinkCode` confirms it. */
  requestLinkCode(email: string): Promise<boolean>;
  verifyLinkCode(email: string, code: string): Promise<boolean>;
  /** Signs in to an existing account on this device (replaces the current guest). */
  requestSignInCode(email: string): Promise<boolean>;
  verifySignInCode(email: string, code: string): Promise<boolean>;
  /** Signs out and continues as a brand-new guest. */
  signOut(): Promise<void>;
  clearError(): void;
}

function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/already been registered|already exists/i.test(message)) {
    return "That email already has an account. Sign in with it instead.";
  }
  if (/expired|invalid/i.test(message) && /token|otp|code/i.test(message)) {
    return "That code is wrong or has expired. Check the email or request a new code.";
  }
  if (/fetch|network/i.test(message)) return "Can't reach the server. Check your connection.";
  return message;
}

export function createAuthStore(client: SupabaseClient | null) {
  let initializing: Promise<void> | null = null;

  return create<AuthState>()((set, get) => {
    const loadAccount = async (user: User) => {
      const { data, error } = await client!
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      set({
        status: "ready",
        error: null,
        account: {
          id: user.id,
          displayName: data.display_name as string,
          isGuest: user.is_anonymous ?? false,
          email: user.email || null,
        },
      });
    };

    const startGuest = async () => {
      const { data, error } = await client!.auth.signInAnonymously();
      if (error) throw error;
      await loadAccount(data.user!);
    };

    /** Runs an action, turning failures into a user-facing error message. */
    const attempt = async (action: () => Promise<void>): Promise<boolean> => {
      if (!client) {
        set({ error: "Accounts are unavailable offline." });
        return false;
      }
      try {
        await action();
        return true;
      } catch (error) {
        set({ error: messageOf(error) });
        return false;
      }
    };

    return {
      status: client ? "loading" : "offline",
      account: null,
      error: null,

      init() {
        if (!client) return Promise.resolve();
        initializing ??= (async () => {
          try {
            const { data } = await client.auth.getSession();
            if (data.session) await loadAccount(data.session.user);
            else await startGuest();
          } catch (error) {
            set({ status: "offline", account: null, error: messageOf(error) });
          }
        })();
        return initializing;
      },

      rename(displayName) {
        const name = displayName.trim();
        if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
          set({ error: `Names must be 1-${MAX_NAME_LENGTH} characters.` });
          return Promise.resolve(false);
        }
        return attempt(async () => {
          const account = get().account;
          if (!account) throw new Error("Not signed in");
          const { error } = await client!
            .from("profiles")
            .update({ display_name: name })
            .eq("id", account.id);
          if (error) throw error;
          set({ account: { ...account, displayName: name }, error: null });
        });
      },

      requestLinkCode(email) {
        return attempt(async () => {
          const { error } = await client!.auth.updateUser({ email: email.trim() });
          if (error) throw error;
        });
      },

      verifyLinkCode(email, code) {
        return attempt(async () => {
          const { data, error } = await client!.auth.verifyOtp({
            email: email.trim(),
            token: code.trim(),
            type: "email_change",
          });
          if (error) throw error;
          await loadAccount(data.user!);
        });
      },

      requestSignInCode(email) {
        return attempt(async () => {
          const { error } = await client!.auth.signInWithOtp({
            email: email.trim(),
            options: { shouldCreateUser: false },
          });
          if (error) throw error;
        });
      },

      verifySignInCode(email, code) {
        return attempt(async () => {
          const { data, error } = await client!.auth.verifyOtp({
            email: email.trim(),
            token: code.trim(),
            type: "email",
          });
          if (error) throw error;
          await loadAccount(data.user!);
        });
      },

      async signOut() {
        await attempt(async () => {
          const { error } = await client!.auth.signOut();
          if (error) throw error;
          await startGuest();
        });
      },

      clearError() {
        set({ error: null });
      },
    };
  });
}

export const useAuthStore = createAuthStore(supabase);
