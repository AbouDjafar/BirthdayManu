import test from "node:test";
import assert from "node:assert/strict";
import { buildDigest, isManuellaEligible, runNotifications } from "./notify.mjs";

const configuredEnv = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "test-placeholder",
  SMTP_USER: "sender@example.test",
  SMTP_PASS: "test-placeholder",
  MAIL_FROM: "Le mur <sender@example.test>",
  OWNER_EMAIL: "owner@example.test",
  MANUELLA_EMAIL: "recipient@example.test",
};
const beforeBirthday = new Date("2026-12-11T12:00:00Z");
const birthday = new Date("2026-12-11T23:00:00Z");

function message(id, extra = {}) {
  return {
    id: `message-${String(id).padStart(5, "0")}`,
    first_name: "Prénom confidentiel",
    body: "Contenu confidentiel, avec <script> conservé comme texte.</script>",
    created_at: "2026-12-11T10:00:00Z",
    hidden: false,
    notified_owner: false,
    notified_manuella: false,
    ...extra,
  };
}

function harness(rows = [], { env = configuredEnv, cap = 1_000, sendFailure, updateFailure } = {}) {
  const state = {
    rows: rows.map((row) => ({ ...row })),
    reads: [],
    updates: [],
    mails: [],
    logs: [],
    clientsCreated: 0,
    transportsCreated: 0,
    transportsClosed: 0,
  };
  const logger = Object.fromEntries(
    ["info", "error"].map((method) => [method, (text) => state.logs.push(text)]),
  );
  const client = {
    from(table) {
      assert.equal(table, "messages");
      const query = {
        filters: [],
        orders: [],
        start: 0,
        end: Infinity,
        selected: null,
        payload: null,
        ids: null,
        select(fields, options) {
          this.selected = fields;
          assert.deepEqual(options, { count: "exact" });
          return this;
        },
        eq(key, value) {
          this.filters.push((row) => row[key] === value);
          return this;
        },
        lte(key, value) {
          this.filters.push((row) => row[key] <= value);
          return this;
        },
        order(key, options) {
          assert.equal(options.ascending, true);
          this.orders.push(key);
          return this;
        },
        range(start, end) {
          this.start = start;
          this.end = end;
          return this;
        },
        update(payload) {
          this.payload = payload;
          return this;
        },
        in(key, ids) {
          assert.equal(key, "id");
          this.ids = ids;
          return this;
        },
        then(onFulfilled, onRejected) {
          return Promise.resolve().then(() => {
            if (this.payload) {
              assert.ok(this.ids, "updates must target exact ids");
              state.updates.push({ payload: this.payload, ids: this.ids });
              if (updateFailure) return { error: new Error("private database detail") };
              for (const row of state.rows) {
                if (this.ids.includes(row.id)) Object.assign(row, this.payload);
              }
              return { error: null };
            }
            let matching = state.rows.filter((row) => this.filters.every((filter) => filter(row)));
            matching = matching.sort((left, right) => {
              for (const key of this.orders) {
                if (left[key] < right[key]) return -1;
                if (left[key] > right[key]) return 1;
              }
              return 0;
            });
            state.reads.push({ start: this.start, end: this.end });
            const fields = this.selected.split(",").map((field) => field.trim());
            return {
              data: matching
                .slice(this.start, Math.min(this.end + 1, this.start + cap))
                .map((row) => Object.fromEntries(fields.map((field) => [field, row[field]]))),
              count: matching.length,
              error: null,
            };
          }).then(onFulfilled, onRejected);
        },
      };
      return query;
    },
  };
  return {
    state,
    async run(overrides = {}) {
      return runNotifications({
        env,
        now: beforeBirthday,
        logger,
        createClient: async () => {
          state.clientsCreated += 1;
          return client;
        },
        createTransport: async ({ user, pass }) => {
          state.transportsCreated += 1;
          assert.equal(user, configuredEnv.SMTP_USER);
          assert.equal(pass, configuredEnv.SMTP_PASS);
          return {
            async sendMail(mail) {
              state.mails.push(mail);
              if (sendFailure?.(mail)) {
                throw new Error(`Private SMTP failure involving ${mail.to} and ${mail.text}`);
              }
              return { accepted: [mail.to] };
            },
            close() {
              state.transportsClosed += 1;
            },
          };
        },
        ...overrides,
      });
    },
  };
}

test("missing Supabase configuration exits cleanly without creating clients", async () => {
  const app = harness([], { env: {} });
  const summary = await app.run();
  assert.equal(summary.skipped, true);
  assert.equal(summary.errors, 0);
  assert.equal(app.state.clientsCreated, 0);
  assert.equal(app.state.transportsCreated, 0);
});

test("configured Supabase is queried with no mail settings and no messages", async () => {
  const app = harness([], {
    env: {
      SUPABASE_URL: configuredEnv.SUPABASE_URL,
      SUPABASE_SECRET_KEY: configuredEnv.SUPABASE_SECRET_KEY,
    },
  });
  const summary = await app.run();
  assert.equal(app.state.reads.length, 1);
  assert.equal(summary.owner.status, "empty");
  assert.equal(app.state.transportsCreated, 0);
});

test("public key alone performs one keepalive RPC without logging data, sending mail or marking rows", async () => {
  const publicKey = "sb_publishable_test_placeholder";
  const app = harness([message(1)], {
    env: { ...configuredEnv, SUPABASE_SECRET_KEY: "", SUPABASE_PUBLISHABLE_KEY: publicKey },
  });
  let calls = 0;
  const summary = await app.run({
    now: birthday,
    createClient: async (url, key) => {
      assert.equal(url, configuredEnv.SUPABASE_URL);
      assert.equal(key, publicKey);
      return {
        rpc: async (name) => {
          calls += 1;
          assert.equal(name, "get_leaderboard");
          return { data: [{ first_name: "Confidential public name", best_score: 80 }], error: null };
        },
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(summary.keepAliveOnly, true);
  assert.equal(summary.errors, 0);
  assert.equal(app.state.transportsCreated, 0);
  assert.equal(app.state.mails.length, 0);
  assert.equal(app.state.updates.length, 0);
  assert.equal(app.state.reads.length, 0);
  assert.equal(app.state.logs.join("\n").includes("Confidential public name"), false);
  assert.equal(app.state.logs.join("\n").includes(publicKey), false);
});

test("public keepalive failure reports a safe error without SMTP or marking", async () => {
  const app = harness([], {
    env: { ...configuredEnv, SUPABASE_SECRET_KEY: "", SUPABASE_PUBLISHABLE_KEY: "public-placeholder" },
  });
  const summary = await app.run({
    createClient: async () => ({
      rpc: async () => ({ error: new Error("Private provider diagnostic and credentials") }),
    }),
  });
  assert.equal(summary.keepAliveOnly, true);
  assert.equal(summary.errors, 1);
  assert.equal(app.state.transportsCreated, 0);
  assert.equal(app.state.updates.length, 0);
  assert.equal(app.state.logs.join("\n").includes("Private provider diagnostic"), false);
});

test("privileged key takes precedence over the public keepalive key", async () => {
  const app = harness([], {
    env: { ...configuredEnv, SUPABASE_PUBLISHABLE_KEY: "public-placeholder" },
  });
  const summary = await app.run();
  assert.equal(summary.keepAliveOnly, false);
  assert.ok(app.state.reads.length > 0);
});

test("incomplete SMTP configuration never sends or marks pending messages", async () => {
  const app = harness([message(1)], { env: { ...configuredEnv, SMTP_PASS: "" } });
  const summary = await app.run();
  assert.equal(summary.owner.status, "mail-unconfigured");
  assert.ok(app.state.reads.length > 0);
  assert.equal(app.state.mails.length, 0);
  assert.equal(app.state.updates.length, 0);
});

test("date gate uses midnight in Douala, regardless of runner timezone", () => {
  assert.equal(isManuellaEligible(new Date("2026-12-11T22:59:59Z")), false);
  assert.equal(isManuellaEligible(birthday), true);
  assert.equal(isManuellaEligible(new Date("2026-12-12T10:00:00Z")), true);
  assert.throws(() => isManuellaEligible(birthday, "2026-02-31"));
  assert.throws(() => isManuellaEligible(birthday, "invalid"));
});

test("successful digest marks only exact sent ids, excluding hidden, future and already notified rows", async () => {
  const app = harness([
    message(1),
    message(2, { hidden: true }),
    message(3, { notified_owner: true }),
    message(4, { created_at: "2026-12-12T00:00:00Z" }),
  ]);
  const summary = await app.run();
  assert.equal(summary.owner.status, "sent");
  assert.equal(summary.owner.count, 1);
  assert.equal(summary.manuella.status, "not-due");
  assert.equal(app.state.mails.length, 1);
  assert.equal(app.state.transportsClosed, 1);
  assert.deepEqual(app.state.updates, [
    { payload: { notified_owner: true }, ids: [message(1).id] },
  ]);
  assert.equal(app.state.rows[0].notified_manuella, false);
  assert.equal(app.state.rows[1].notified_owner, false);
  assert.equal(app.state.rows[3].notified_owner, false);
  assert.ok(app.state.mails[0].text.includes(message(1).body));
});

test("failed owner send does not mark it and does not block Manuella", async () => {
  const app = harness([message(1)], {
    sendFailure: (mail) => mail.to === configuredEnv.OWNER_EMAIL,
  });
  const summary = await app.run({ now: birthday });
  assert.equal(summary.errors, 1);
  assert.equal(summary.owner.status, "send-error");
  assert.equal(summary.manuella.status, "sent");
  assert.equal(app.state.mails.length, 2);
  assert.equal(app.state.rows[0].notified_owner, false);
  assert.equal(app.state.rows[0].notified_manuella, true);
  assert.deepEqual(app.state.updates, [
    { payload: { notified_manuella: true }, ids: [message(1).id] },
  ]);
});

test("failed Manuella send preserves owner success independently", async () => {
  const app = harness([message(1)], {
    sendFailure: (mail) => mail.to === configuredEnv.MANUELLA_EMAIL,
  });
  const summary = await app.run({ now: birthday });
  assert.equal(summary.owner.status, "sent");
  assert.equal(summary.manuella.status, "send-error");
  assert.equal(app.state.rows[0].notified_owner, true);
  assert.equal(app.state.rows[0].notified_manuella, false);
});

test("dry run reads every recipient but creates no transport or updates", async () => {
  const app = harness([message(1)], { env: { ...configuredEnv, NOTIFY_DRY_RUN: "true" } });
  const summary = await app.run({ now: birthday });
  assert.equal(summary.owner.status, "dry-run");
  assert.equal(summary.manuella.status, "dry-run");
  assert.equal(app.state.transportsCreated, 0);
  assert.equal(app.state.updates.length, 0);
  assert.equal(app.state.rows[0].notified_owner, false);
});

test("more than 1000 messages are paginated without assuming the server page size", async () => {
  const rows = Array.from({ length: 1_205 }, (_, index) => message(index));
  const app = harness(rows, { cap: 137 });
  const summary = await app.run();
  assert.equal(summary.owner.count, 1_205);
  assert.equal(summary.owner.status, "sent");
  assert.equal(app.state.mails.length, 1);
  assert.equal(app.state.reads.length, 9);
  const updatedIds = app.state.updates.flatMap((update) => update.ids);
  assert.equal(new Set(updatedIds).size, rows.length);
  assert.deepEqual(updatedIds, rows.map((row) => row.id));
  assert.ok(app.state.updates.every((update) => update.ids.length <= 100));
});

test("an unconfirmed SMTP acceptance never marks messages", async () => {
  const app = harness([message(1)]);
  const summary = await app.run({
    createTransport: async () => ({ sendMail: async () => ({ accepted: [], rejected: ["private"] }) }),
  });
  assert.equal(summary.owner.status, "send-error");
  assert.equal(app.state.updates.length, 0);
});

test("database update failure is reported safely after SMTP acceptance", async () => {
  const app = harness([message(1)], { updateFailure: true });
  const summary = await app.run();
  assert.equal(summary.errors, 1);
  assert.equal(summary.owner.status, "mark-error");
  assert.equal(app.state.rows[0].notified_owner, false);
});

test("rerunning after a successful batch sends no duplicate digest", async () => {
  const app = harness([message(1)]);
  await app.run();
  const second = await app.run();
  assert.equal(second.owner.status, "empty");
  assert.equal(app.state.mails.length, 1);
});

test("logs contain no addresses, credentials or message content, including provider errors", async () => {
  const app = harness([message(1)], { sendFailure: () => true });
  await app.run();
  const logs = app.state.logs.join("\n");
  for (const forbidden of [
    configuredEnv.OWNER_EMAIL,
    configuredEnv.SMTP_USER,
    configuredEnv.SMTP_PASS,
    message(1).first_name,
    message(1).body,
    "Private SMTP failure",
  ]) {
    assert.equal(logs.includes(forbidden), false);
  }
});

test("legacy Supabase service role alias remains supported", async () => {
  const app = harness([], {
    env: {
      ...configuredEnv,
      SUPABASE_SECRET_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "legacy-test-placeholder",
    },
  });
  await app.run();
  assert.equal(app.state.clientsCreated, 1);
  assert.ok(app.state.reads.length > 0);
});

test("digest message id is stable, recipient-specific, and email uses plain text only", () => {
  const rows = [message(1)];
  const owner = buildDigest(rows, "owner", configuredEnv.MAIL_FROM, configuredEnv.OWNER_EMAIL);
  const duplicate = buildDigest(rows, "owner", configuredEnv.MAIL_FROM, configuredEnv.OWNER_EMAIL);
  const manuella = buildDigest(rows, "manuella", configuredEnv.MAIL_FROM, configuredEnv.MANUELLA_EMAIL);
  assert.equal(owner.messageId, duplicate.messageId);
  assert.notEqual(owner.messageId, manuella.messageId);
  assert.equal(owner.html, undefined);
  assert.equal(owner.disableFileAccess, true);
  assert.equal(owner.disableUrlAccess, true);
});
