import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DAY = 86_400_000;
const ANCHOR = Date.UTC(2026, 10, 10);

export function isKeepaliveDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type) => Number(parts.find((part) => part.type === type).value);
  const day = Date.UTC(value("year"), value("month") - 1, value("day"));
  return ((day - ANCHOR) / DAY) % 2 === 0;
}

async function defaultCreateClient(url, key) {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function runKeepalive({ env = process.env, now = new Date(), force = env.KEEPALIVE_FORCE === "true", createClient = defaultCreateClient, logger = console } = {}) {
  if (!force && !isKeepaliveDay(now)) {
    logger.info("Aucune opération aujourd’hui : maintien actif tous les deux jours.");
    return { skipped: true };
  }
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key?.startsWith("sb_publishable_")) throw new Error("La configuration publique Supabase est incomplète.");
  try {
    const client = await createClient(url, key);
    const { error } = await client.rpc("get_leaderboard");
    if (error) throw new Error("RPC_FAILED");
  } catch {
    throw new Error("La requête de maintien actif Supabase a échoué.");
  }
  logger.info("Requête Supabase effectuée. Aucune donnée modifiée et aucun mail envoyé.");
  return { skipped: false };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.slice(2).some((value) => value !== "--force")) throw new Error("Argument inconnu : utiliser --force pour lancer immédiatement.");
    await runKeepalive({ ...(process.argv.includes("--force") ? { force: true } : {}) });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
