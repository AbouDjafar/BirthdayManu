/** Fictional data only. This module is removed from Supabase production builds. */
import { answerTexts, normalizeBody, normalizeName, validatePlayerId, type LeaderboardEntry, type ManuellaContent, type WallMessage } from "./contracts";

const KEY = "birthdaymanu-demo-db-v1";
const EVENT = "birthdaymanu-demo-changed";
const MANUELLA_ID = "00000000-0000-4000-8000-000000000001";
const MANUELLA_NAME = "Manuella l'Anniversaireuse";
// Deliberately fictional, never used to configure the real database.
const DEMO_ANSWERS = { q1: "Rose bonbon", q2: "Marie", q3: "Ndolé", q4: "Un café", q5: "Sur une plage" };
type DemoPlayer = { firstName: string; bestScorePercent: number | null; updatedAt: string; attempts: number };
type DemoMessage = WallMessage & { id: string; playerId: string };
type DemoData = { version: 1; players: Record<string, DemoPlayer>; messages: DemoMessage[] };
let memory: DemoData | undefined;

function freshData(): DemoData {
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  return {
    version: 1,
    players: Object.fromEntries([
      ["Sandrine", 100], ["Laetitia", 80], ["Chloé", 60], ["Brenda", 40],
    ].map(([firstName, bestScorePercent], index) => [`demo-${index}`, { firstName, bestScorePercent, updatedAt: ago(90 - index * 20), attempts: 1 }])),
    messages: [
      { id: "demo-note-1", playerId: "demo-0", firstName: "Sandrine", body: "Joyeux anniversaire ma chérie ! Que cette année te ressemble : drôle, lumineuse et pleine de rose 💗", createdAt: ago(80) },
      { id: "demo-note-2", playerId: "demo-1", firstName: "Laetitia", body: "J'ai raté la question du plat… mais jamais celle de notre amitié. Je t'aime fort !", createdAt: ago(50) },
      { id: "demo-note-3", playerId: "demo-2", firstName: "Chloé", body: "Bon anniv' à la reine des lunettes roses 👓✨", createdAt: ago(20) },
    ],
  } as DemoData;
}

function load(): DemoData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw) as DemoData;
      if (data.version === 1 && data.players && typeof data.players === "object" && Array.isArray(data.messages)) return data;
    }
  } catch { /* memory fallback if browser storage is unavailable */ }
  return memory ??= freshData();
}

function save(data: DemoData) {
  memory = data;
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* memory only */ }
  window.dispatchEvent(new Event(EVENT));
}

function recordQuiz(playerId: string, firstName: string, answers: Record<string, number>) {
  const values = answerTexts(answers);
  const scorePercent = Math.round(Object.entries(DEMO_ANSWERS).filter(([key, value]) => values[key] === value).length / 5 * 100);
  const data = load();
  const previous = data.players[playerId];
  const bestScorePercent = Math.max(scorePercent, previous?.bestScorePercent ?? 0);
  data.players[playerId] = { firstName, bestScorePercent, attempts: (previous?.attempts ?? 0) + 1, updatedAt: new Date().toISOString() };
  save(data);
  return { scorePercent, bestScorePercent };
}

function recordMessage(playerId: string, firstName: string, body: string) {
  const value = normalizeBody(body);
  if (/\b(connasse|salope)\b/i.test(value)) throw new Error("MESSAGE_BLOCKED");
  const data = load();
  const own = data.messages.filter((message) => message.playerId === playerId);
  if (own.length >= 3) throw new Error("MESSAGE_LIMIT");
  if (own.some((message) => Date.now() - Date.parse(message.createdAt) < 30_000)) throw new Error("RATE_LIMITED");
  data.players[playerId] ??= { firstName, bestScorePercent: null, updatedAt: new Date().toISOString(), attempts: 0 };
  const canonicalName = data.players[playerId]!.firstName;
  data.messages.unshift({ id: crypto.randomUUID(), playerId, firstName: canonicalName, body: value, createdAt: new Date().toISOString() });
  save(data);
  return { ok: true as const };
}

function requireManuella(code: string) { if (code !== "demo") throw new Error("INVALID_ACCESS"); }

export const demoApi = {
  async submitQuiz(playerId: string, firstName: string, answers: Record<string, number>) {
    validatePlayerId(playerId);
    if (normalizeName(firstName).toLowerCase() === MANUELLA_NAME.toLowerCase()) throw new Error("RESERVED_NAME");
    return recordQuiz(playerId, normalizeName(firstName), answers);
  },
  async getMyBest(playerId: string) {
    validatePlayerId(playerId);
    const player = load().players[playerId];
    return player?.bestScorePercent != null ? { firstName: player.firstName, bestScorePercent: player.bestScorePercent } : null;
  },
  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    return Object.values(load().players).filter((player) => player.bestScorePercent !== null)
      .map((player) => ({ firstName: player.firstName, bestScorePercent: player.bestScorePercent!, updatedAt: player.updatedAt }))
      .sort((a, b) => b.bestScorePercent - a.bestScorePercent || a.updatedAt.localeCompare(b.updatedAt));
  },
  async postMessage(playerId: string, firstName: string, body: string) {
    validatePlayerId(playerId);
    if (normalizeName(firstName).toLowerCase() === MANUELLA_NAME.toLowerCase()) throw new Error("RESERVED_NAME");
    return recordMessage(playerId, normalizeName(firstName), body);
  },
  async getMessages(): Promise<WallMessage[]> {
    return load().messages.map(({ firstName, body, createdAt }) => ({ firstName, body, createdAt }));
  },
  async getManuellaContent(code: string): Promise<ManuellaContent | null> {
    if (code !== "demo") return null;
    return {
      text: "Ma Manuella,\n\nAujourd'hui le monde fête la personne qui rend le mien plus doux. Ton rire, tes lunettes roses, ta façon de danser quand personne ne regarde… je garde tout ça comme un trésor.\n\nJoyeux anniversaire, mon cœur. Que cette nouvelle année t'apporte autant de bonheur que tu m'en donnes chaque jour.\n\nAvec tout mon amour.",
      bestScorePercent: load().players[MANUELLA_ID]?.bestScorePercent ?? null,
    };
  },
  async submitManuellaQuiz(code: string, answers: Record<string, number>) {
    requireManuella(code);
    return recordQuiz(MANUELLA_ID, MANUELLA_NAME, answers);
  },
  async postManuellaMessage(code: string, body: string) {
    requireManuella(code);
    return recordMessage(MANUELLA_ID, MANUELLA_NAME, body);
  },
  subscribeToWall(callback: () => void) {
    const storage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) callback(); };
    window.addEventListener(EVENT, callback);
    window.addEventListener("storage", storage);
    return () => { window.removeEventListener(EVENT, callback); window.removeEventListener("storage", storage); };
  },
};
