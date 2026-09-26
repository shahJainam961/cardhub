import { expect, test } from "@playwright/test";
import { newClient } from "./supabase";

// Row Level Security checks run straight against the database API, without a browser.
test.skip(!!process.env.E2E_BASE_URL, "creates throwaway users; runs against the local stack only");

async function guest() {
  const client = newClient();
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  return { client, id: data.user!.id };
}

test("every new user gets a guest profile", async () => {
  const me = await guest();
  const { data, error } = await me.client
    .from("profiles")
    .select("display_name")
    .eq("id", me.id)
    .single();
  expect(error).toBeNull();
  expect(data?.display_name).toMatch(/^Guest \d{4}$/);
});

test("players can read other profiles but only change their own name", async () => {
  const [me, other] = await Promise.all([guest(), guest()]);

  const { data: visible } = await me.client.from("profiles").select("id").eq("id", other.id);
  expect(visible).toHaveLength(1);

  const { data: changed } = await me.client
    .from("profiles")
    .update({ display_name: "Hacked" })
    .eq("id", other.id)
    .select();
  expect(changed).toEqual([]);
  const { data: theirs } = await other.client
    .from("profiles")
    .select("display_name")
    .eq("id", other.id)
    .single();
  expect(theirs?.display_name).not.toBe("Hacked");

  const { error: ownError } = await me.client
    .from("profiles")
    .update({ display_name: "Me" })
    .eq("id", me.id);
  expect(ownError).toBeNull();
});

test("clients cannot create, delete or tamper with profile rows", async () => {
  const me = await guest();

  const { error: insertError } = await me.client
    .from("profiles")
    .insert({ id: crypto.randomUUID(), display_name: "Fake" });
  expect(insertError?.code).toBe("42501");

  const { error: columnError } = await me.client
    .from("profiles")
    .update({ created_at: "2000-01-01T00:00:00Z" })
    .eq("id", me.id);
  expect(columnError?.code).toBe("42501");

  const { error: deleteError } = await me.client.from("profiles").delete().eq("id", me.id);
  expect(deleteError?.code).toBe("42501");
});

test("names must be 1-20 characters", async () => {
  const me = await guest();
  for (const name of ["   ", "x".repeat(21)]) {
    const { error } = await me.client
      .from("profiles")
      .update({ display_name: name })
      .eq("id", me.id);
    expect(error?.code).toBe("23514");
  }
});

test("signed-out visitors cannot read profiles", async () => {
  const { data } = await newClient().from("profiles").select("id").limit(1);
  expect(data ?? []).toEqual([]);
});
