import test from "node:test";
import assert from "node:assert/strict";
import { isKeepaliveDay, runKeepalive } from "./keepalive.mjs";

test("every other day stays consistent across month boundaries in Douala", () => {
  assert.equal(isKeepaliveDay(new Date("2026-11-10T06:17:00Z")), true);
  assert.equal(isKeepaliveDay(new Date("2026-11-11T06:17:00Z")), false);
  assert.equal(isKeepaliveDay(new Date("2026-11-30T06:17:00Z")), true);
  assert.equal(isKeepaliveDay(new Date("2026-12-01T06:17:00Z")), false);
  assert.equal(isKeepaliveDay(new Date("2026-12-02T06:17:00Z")), true);
  assert.equal(isKeepaliveDay(new Date("2026-11-11T22:59:59Z")), false);
  assert.equal(isKeepaliveDay(new Date("2026-11-11T23:00:00Z")), true);
});
const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only" };
const logger = { info() {} };
test("off days make no request", async () => {
  const result = await runKeepalive({ now: new Date("2026-11-11T06:17:00Z"), env, logger, createClient: () => { throw new Error("Should not run"); } });
  assert.deepEqual(result, { skipped: true });
});
test("force makes one public read and never uses a privileged key", async () => {
  let calls = 0;
  await runKeepalive({ env: { ...env, SUPABASE_SECRET_KEY: "not-used" }, force: true, logger, createClient: (url, key) => {
    assert.equal(url, env.SUPABASE_URL); assert.equal(key, env.SUPABASE_PUBLISHABLE_KEY);
    return { rpc: async (name) => { calls++; assert.equal(name, "get_leaderboard"); return { error: null }; } };
  } });
  assert.equal(calls, 1);
});
test("missing configuration is reported", async () => {
  await assert.rejects(runKeepalive({ env: {}, force: true, logger }), /configuration publique/);
});
test("provider details are not leaked on failure", async () => {
  await assert.rejects(runKeepalive({ env, force: true, logger, createClient: () => ({ rpc: async () => { throw new Error("secret provider details"); } }) }), { message: "La requête de maintien actif Supabase a échoué." });
});
