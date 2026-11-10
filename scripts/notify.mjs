import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const NOTIFICATION_TIMEZONE = "Africa/Douala";
export const DEFAULT_NOTIFY_FROM = "2026-12-12";
const PAGE_SIZE = 500;
const UPDATE_BATCH_SIZE = 100;

export function localDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: NOTIFICATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isManuellaEligible(now, from = DEFAULT_NOTIFY_FROM) {
  const parsed = new Date(`${from}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== from
  ) {
    throw new Error("INVALID_NOTIFICATION_DATE");
  }
  return localDate(now) >= from;
}

/** Fetch every eligible row, even if the server caps pages below PAGE_SIZE. */
export async function getPendingMessages(client, flag, cutoff) {
  const messages = [];
  let expectedCount = 0;
  for (;;) {
    const { data, error, count } = await client
      .from("messages")
      .select("id, first_name, body, created_at", { count: "exact" })
      .eq("hidden", false)
      .eq(flag, false)
      .lte("created_at", cutoff)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(messages.length, messages.length + PAGE_SIZE - 1);

    if (error || !Array.isArray(data)) {
      throw new Error("READ_MESSAGES_FAILED");
    }
    if (typeof count === "number") expectedCount = count;
    if (data.length === 0) {
      if (messages.length < expectedCount) {
        throw new Error("INCOMPLETE_MESSAGES_PAGE");
      }
      return messages;
    }
    messages.push(...data);
    if (typeof count === "number" && messages.length >= count) return messages;
    // Advance by the actual row count, not the requested/server page size.
  }
}

export async function markMessagesNotified(client, flag, messages) {
  const ids = messages.map((message) => message.id);
  for (let offset = 0; offset < ids.length; offset += UPDATE_BATCH_SIZE) {
    const { error } = await client
      .from("messages")
      .update({ [flag]: true })
      .in("id", ids.slice(offset, offset + UPDATE_BATCH_SIZE));
    if (error) throw new Error("MARK_MESSAGES_FAILED");
  }
}

export function buildDigest(messages, recipient, from, to) {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([recipient, messages]))
    .digest("hex");
  const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
    timeZone: NOTIFICATION_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  });
  const entries = messages.map(
    (message) =>
      `${message.first_name} — ${dateFormatter.format(new Date(message.created_at))}\n${message.body}`,
  );
  return {
    from,
    to,
    subject: "De nouveaux mots sur le mur 💌",
    text: [
      `${messages.length} nouveau(x) mot(s) t'attendent sur le mur.`,
      ...entries,
      "Ces messages sont publics sur le mur. Les horaires sont ceux de Douala.",
    ].join("\n\n"),
    // Stable for an identical batch; SMTP does not guarantee deduplication.
    messageId: `<wall-${fingerprint}@notifications.invalid>`,
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

async function defaultCreateClient(url, key) {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function defaultCreateTransport({ user, pass }) {
  const { default: nodemailer } = await import("nodemailer");
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
  });
}

/** Dependencies are injectable; importing this module never sends mail. */
export async function runNotifications({
  env = process.env,
  now = new Date(),
  dryRun = ["true", "1"].includes(env.NOTIFY_DRY_RUN?.toLowerCase()),
  createClient = defaultCreateClient,
  createTransport = defaultCreateTransport,
  logger = console,
} = {}) {
  const summary = { skipped: false, dryRun, errors: 0, owner: null, manuella: null };
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    logger.info("Configuration Supabase absente ou incomplète : notifications en attente de configuration.");
    summary.skipped = true;
    return summary;
  }

  let client;
  try {
    client = await createClient(url, key);
  } catch {
    logger.error("Connexion Supabase impossible. Vérifier la configuration des notifications.");
    summary.errors += 1;
    return summary;
  }

  let manuellaEligible = false;
  try {
    manuellaEligible = isManuellaEligible(now, env.MANUELLA_NOTIFY_FROM || DEFAULT_NOTIFY_FROM);
  } catch {
    logger.error("Date de début invalide : notifications Manuella suspendues.");
    summary.errors += 1;
  }

  const mailReady = Boolean(env.SMTP_USER && env.SMTP_PASS && env.MAIL_FROM);
  let transport;
  const recipients = [
    { role: "owner", label: "auteur", flag: "notified_owner", to: env.OWNER_EMAIL },
    ...(manuellaEligible
      ? [{ role: "manuella", label: "Manuella", flag: "notified_manuella", to: env.MANUELLA_EMAIL }]
      : []),
  ];
  if (!manuellaEligible) summary.manuella = { status: "not-due", count: 0 };

  try {
    for (const recipient of recipients) {
      let messages;
      try {
        // Always read the database, even without SMTP or pending messages.
        messages = await getPendingMessages(client, recipient.flag, now.toISOString());
      } catch {
        logger.error(`Notifications ${recipient.label} : lecture en base impossible.`);
        summary[recipient.role] = { status: "read-error", count: 0 };
        summary.errors += 1;
        continue;
      }

      const result = { status: "empty", count: messages.length };
      summary[recipient.role] = result;
      if (messages.length === 0) {
        logger.info(`Notifications ${recipient.label} : aucun nouveau message.`);
        continue;
      }
      if (dryRun) {
        result.status = "dry-run";
        logger.info(`Simulation ${recipient.label} : ${messages.length} message(s), aucun envoi ni marquage.`);
        continue;
      }
      if (!mailReady || !recipient.to) {
        result.status = "mail-unconfigured";
        logger.info(`Notifications ${recipient.label} : configuration mail incomplète, aucun envoi ni marquage.`);
        continue;
      }

      try {
        transport ||= await createTransport({ user: env.SMTP_USER, pass: env.SMTP_PASS });
        const info = await transport.sendMail(
          buildDigest(messages, recipient.role, env.MAIL_FROM, recipient.to),
        );
        const accepted = info?.accepted?.some((address) => {
          const value = typeof address === "string" ? address : address.address;
          return value?.toLowerCase() === recipient.to.toLowerCase();
        });
        if (!accepted) throw new Error("SMTP_ACCEPTANCE_MISSING");
      } catch {
        result.status = "send-error";
        summary.errors += 1;
        logger.error(`Notifications ${recipient.label} : envoi non confirmé, messages conservés pour une prochaine tentative.`);
        continue;
      }

      try {
        await markMessagesNotified(client, recipient.flag, messages);
        result.status = "sent";
        logger.info(`Notifications ${recipient.label} : récapitulatif accepté, ${messages.length} message(s) marqué(s).`);
      } catch {
        result.status = "mark-error";
        summary.errors += 1;
        logger.error(`Notifications ${recipient.label} : envoi accepté mais marquage incomplet. Un doublon est possible au prochain passage.`);
      }
    }
  } finally {
    transport?.close?.();
  }
  return summary;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const args = process.argv.slice(2);
  if (args.some((argument) => argument !== "--dry-run")) {
    console.error("Argument inconnu. Utiliser node scripts/notify.mjs [--dry-run].");
    process.exitCode = 1;
  } else {
    try {
      const summary = await runNotifications({
        ...(args.includes("--dry-run") ? { dryRun: true } : {}),
      });
      if (summary.errors) process.exitCode = 1;
    } catch {
      // Provider errors may include addresses, message text or credentials.
      console.error("Notifications interrompues par une erreur technique. Aucun détail sensible n'est journalisé.");
      process.exitCode = 1;
    }
  }
}
