import { createClient, type SupabaseClient, type RealtimeChannel } from "@supabase/supabase-js";
import { answerTexts, normalizeBody, normalizeName, validatePlayerId, type LeaderboardEntry, type ManuellaContent, type QuizResult, type WallConnectionStatus, type WallMessage } from "./contracts";
export type { LeaderboardEntry, ManuellaContent, QuizResult, WallConnectionStatus, WallMessage } from "./contracts";

export const isDemo = import.meta.env.VITE_DATA_MODE !== "supabase";
const demo = () => import("./demo").then((module) => module.demoApi);
let client: SupabaseClient | undefined;

function getClient() {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key?.startsWith("sb_publishable_")) throw new Error("BACKEND_NOT_CONFIGURED");
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }
  return client;
}

async function rpc<T>(name: string, parameters?: Record<string, unknown>): Promise<T> {
  const { data, error } = await getClient().rpc(name, parameters);
  if (error) throw new Error(error.message);
  return data as T;
}

const result = (value: { score: number; best: number }): QuizResult => ({ scorePercent: value.score, bestScorePercent: value.best });

export async function submitQuiz(playerId: string, firstName: string, answers: Record<string, number>): Promise<QuizResult> {
  if (import.meta.env.VITE_DATA_MODE !== "supabase") return (await demo()).submitQuiz(playerId, firstName, answers);
  validatePlayerId(playerId);
  return result(await rpc("submit_quiz", { p_player_id: playerId, p_first_name: normalizeName(firstName), p_answers: answerTexts(answers) }));
}

export async function getMyBest(playerId: string) {
  if (import.meta.env.VITE_DATA_MODE !== "supabase") return (await demo()).getMyBest(playerId);
  validatePlayerId(playerId);
  const value = await rpc<{ first_name: string; best_score: number } | null>("get_my_best", { p_player_id: playerId });
  return value ? { firstName: value.first_name, bestScorePercent: value.best_score } : null;
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  if (import.meta.env.VITE_DATA_MODE !== "supabase") return (await demo()).getLeaderboard();
  const values = await rpc<{ first_name: string; best_score: number; updated_at: string }[]>("get_leaderboard");
  return values.map((value) => ({ firstName: value.first_name, bestScorePercent: value.best_score, updatedAt: value.updated_at }));
}

export async function getMessages(): Promise<WallMessage[]> {
  if (import.meta.env.VITE_DATA_MODE !== "supabase") return (await demo()).getMessages();
  const values = await rpc<{ first_name: string; body: string; created_at: string }[]>("get_messages");
  return values.map((value) => ({ firstName: value.first_name, body: value.body, createdAt: value.created_at }));
}

export async function postMessage(playerId: string, firstName: string, body: string) {
  if (import.meta.env.VITE_DATA_MODE !== "supabase") return (await demo()).postMessage(playerId, firstName, body);
  validatePlayerId(playerId);
  await rpc("post_message", { p_player_id: playerId, p_first_name: normalizeName(firstName), p_body: normalizeBody(body) });
  return { ok: true as const };
}

export async function getManuellaContent(code: string): Promise<ManuellaContent | null> {
  if (import.meta.env.VITE_DATA_MODE !== "supabase") return (await demo()).getManuellaContent(code);
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(code)) return null;
  return rpc("get_manuella_content", { p_code: code });
}

export async function submitManuellaQuiz(code: string, answers: Record<string, number>): Promise<QuizResult> {
  if (import.meta.env.VITE_DATA_MODE !== "supabase") return (await demo()).submitManuellaQuiz(code, answers);
  return result(await rpc("submit_manuella_quiz", { p_code: code, p_answers: answerTexts(answers) }));
}

export async function postManuellaMessage(code: string, body: string) {
  if (import.meta.env.VITE_DATA_MODE !== "supabase") return (await demo()).postManuellaMessage(code, body);
  await rpc("post_manuella_message", { p_code: code, p_body: normalizeBody(body) });
  return { ok: true as const };
}

/** Realtime contains only invalidations. Private IDs and table rows never cross the channel. */
export function subscribeToWall(callback: () => void, onStatus?: (status: WallConnectionStatus) => void): () => void {
  let disposed = false;
  let stopDemo: (() => void) | undefined;
  let channel: RealtimeChannel | undefined;
  let polling: ReturnType<typeof setInterval> | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const invalidate = () => {
    if (disposed || debounce) return;
    debounce = setTimeout(() => { debounce = undefined; if (!disposed) callback(); }, 100);
  };
  const clearPolling = () => { if (polling) clearInterval(polling); polling = undefined; };
  const status = (value: WallConnectionStatus) => { if (!disposed) onStatus?.(value); };
  const startPolling = (value: WallConnectionStatus = "polling") => {
    status(navigator.onLine ? value : "offline");
    if (!polling) polling = setInterval(invalidate, 15_000);
  };
  const visibility = () => { if (document.visibilityState === "visible") invalidate(); };
  const online = () => { invalidate(); if (polling) status("polling"); };
  const offline = () => startPolling("offline");

  if (import.meta.env.VITE_DATA_MODE !== "supabase") {
    status("demo");
    void demo().then((adapter) => {
      if (!disposed) { stopDemo = adapter.subscribeToWall(invalidate); invalidate(); }
    });
  } else {
    startPolling("connecting");
    try {
      channel = getClient().channel("birthday-wall").on("broadcast", { event: "changed" }, invalidate)
        .subscribe((state) => {
          if (disposed) return;
          if (state === "SUBSCRIBED") { clearPolling(); status("live"); invalidate(); }
          else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(state)) { startPolling(); invalidate(); }
        });
    } catch { startPolling("offline"); }
  }
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("online", online);
  window.addEventListener("offline", offline);
  return () => {
    disposed = true;
    stopDemo?.();
    clearPolling();
    if (debounce) clearTimeout(debounce);
    if (channel && client) void client.removeChannel(channel);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("online", online);
    window.removeEventListener("offline", offline);
  };
}

export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/RATE_LIMIT|30.second|trop.rapide/i.test(message)) return "Un tout petit instant : attends 30 secondes entre deux messages.";
  if (/MESSAGE_LIMIT|maximum.*3|trois.(messages|mots)/i.test(message)) return "Tu as déjà laissé tes trois petits mots. Merci pour tout cet amour !";
  if (/MESSAGE_BLOCKED|mot.interdit|Reformule ton mot/i.test(message)) return "Ce mot ne passe pas le filtre. Reformule ton message avec douceur.";
  if (/RESERVED_NAME|pr.nom est r.serv./i.test(message)) return "Ce nom est réservé à Manuella. Utilise ton prénom.";
  if (/NAME_INVALID|pr.nom/i.test(message)) return "Choisis un prénom entre 2 et 30 caractères.";
  if (/MESSAGE_INVALID|mot doit contenir/i.test(message)) return "Ton message doit contenir entre 1 et 280 caractères.";
  if (/QUIZ_NOT_CONFIGURED|BACKEND_NOT_CONFIGURED|quiz n.est pas encore configur./i.test(message)) return "Le quiz n’est pas encore configuré. Reviens dans un petit moment.";
  if (/ANSWERS_INVALID|R.ponds aux cinq|r.ponses du quiz sont invalides/i.test(message)) return "Il manque une réponse. Recommence le quiz pour toutes les compléter.";
  if (/INVALID_ACCESS|Acc.s indisponible/i.test(message)) return "Ton accès privé doit être rouvert depuis le lien que tu as reçu.";
  if (/Termine d.abord le quiz/i.test(message)) return "Termine d’abord le quiz avant de laisser un mot.";
  return "La connexion a eu un petit raté. Réessaie : ta saisie est conservée.";
}
