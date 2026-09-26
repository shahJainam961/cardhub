import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createAuthStore } from "./authStore";

const guestUser = { id: "u1", is_anonymous: true, email: "" };

/** Just enough of the Supabase client for the store: auth calls and one profiles query. */
function fakeClient(overrides: { session?: unknown; updateUserError?: string } = {}) {
  const profiles: Record<string, string> = { u1: "Guest 0042" };
  const update = vi.fn((values: { display_name: string }) => ({
    eq: (_column: string, id: string) => {
      profiles[id] = values.display_name;
      return Promise.resolve({ error: null });
    },
  }));
  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: overrides.session ?? null } })),
      signInAnonymously: vi.fn(async () => ({ data: { user: guestUser }, error: null })),
      updateUser: vi.fn(async () => ({
        error: overrides.updateUserError ? new Error(overrides.updateUserError) : null,
      })),
    },
    from: () => ({
      select: () => ({
        eq: (_column: string, id: string) => ({
          single: async () => ({ data: { display_name: profiles[id] }, error: null }),
        }),
      }),
      update,
    }),
  };
  return { client: client as unknown as SupabaseClient, raw: client, update };
}

describe("auth store", () => {
  it("works offline without Supabase", async () => {
    const store = createAuthStore(null);
    await store.getState().init();
    expect(store.getState().status).toBe("offline");
    expect(await store.getState().rename("Sam")).toBe(false);
  });

  it("creates a guest account on first launch, only once", async () => {
    const { client, raw } = fakeClient();
    const store = createAuthStore(client);
    await Promise.all([store.getState().init(), store.getState().init()]);
    expect(raw.auth.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({
      status: "ready",
      account: { id: "u1", displayName: "Guest 0042", isGuest: true, email: null },
    });
  });

  it("reuses a saved session instead of creating a new guest", async () => {
    const { client, raw } = fakeClient({
      session: { user: { id: "u1", is_anonymous: false, email: "me@example.com" } },
    });
    const store = createAuthStore(client);
    await store.getState().init();
    expect(raw.auth.signInAnonymously).not.toHaveBeenCalled();
    expect(store.getState().account).toMatchObject({ isGuest: false, email: "me@example.com" });
  });

  it("renames with trimming and rejects empty names", async () => {
    const { client, update } = fakeClient();
    const store = createAuthStore(client);
    await store.getState().init();

    expect(await store.getState().rename("   ")).toBe(false);
    expect(update).not.toHaveBeenCalled();

    expect(await store.getState().rename("  Sam  ")).toBe(true);
    expect(update).toHaveBeenCalledWith({ display_name: "Sam" });
    expect(store.getState().account?.displayName).toBe("Sam");
  });

  it("explains when an email already has an account", async () => {
    const { client } = fakeClient({
      updateUserError: "A user with this email address has already been registered",
    });
    const store = createAuthStore(client);
    await store.getState().init();
    expect(await store.getState().requestLinkCode("taken@example.com")).toBe(false);
    expect(store.getState().error).toMatch(/Sign in with it instead/);
  });

  it("falls back to offline when the server can't be reached", async () => {
    const { client, raw } = fakeClient();
    raw.auth.getSession.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const store = createAuthStore(client);
    await store.getState().init();
    expect(store.getState().status).toBe("offline");
  });
});
