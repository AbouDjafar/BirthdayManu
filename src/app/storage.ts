const KEY = "manuella-bday-player";
const MANUELLA_KEY = "manuella-bday-session";
export const MANUELLA_NAME = "Manuella l'Anniversaireuse";
export type Player = { playerId: string; firstName: string };

let memory: Player | null = null;
let sessionMemory: string | null = null;
let playerWriteFailed = false;
let sessionWriteFailed = false;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function loadPlayer(): Player | null {
  if (playerWriteFailed) return memory;
  let raw: string | null;
  try { raw = window.localStorage.getItem(KEY); } catch { return memory; }
  if (!raw) return null;
  try {
    const p: unknown = JSON.parse(raw);
    if (typeof p === "object" && p !== null && "playerId" in p && "firstName" in p &&
      typeof p.playerId === "string" && uuid.test(p.playerId) && typeof p.firstName === "string" &&
      p.firstName.trim().length >= 2 && p.firstName.trim().length <= 30) {
      return { playerId: p.playerId, firstName: p.firstName.trim() };
    }
    return null;
  } catch {
    return null;
  }
}

function newId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 15) | 64;
  bytes[8] = ((bytes[8] ?? 0) & 63) | 128;
  const hex = Array.from(bytes, (v) => v.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function savePlayer(firstName: string, newIdentity = false): Player {
  const name = firstName.trim();
  if (name.length < 2 || name.length > 30) throw new Error("Le prénom doit contenir entre 2 et 30 caractères.");
  const p = { playerId: (!newIdentity && loadPlayer()?.playerId) || newId(), firstName: name };
  memory = p;
  try { window.localStorage.setItem(KEY, JSON.stringify(p)); playerWriteFailed = false; }
  catch { playerWriteFailed = true; /* Keep this visit usable. */ }
  return p;
}

export function loadManuellaCode(): string | null {
  if (sessionWriteFailed) return sessionMemory;
  try { return window.sessionStorage.getItem(MANUELLA_KEY) || null; } catch { return sessionMemory; }
}

export function saveManuellaCode(code: string | null) {
  sessionMemory = code;
  try {
    if (code) window.sessionStorage.setItem(MANUELLA_KEY, code);
    else window.sessionStorage.removeItem(MANUELLA_KEY);
    sessionWriteFailed = false;
  } catch { sessionWriteFailed = true; /* Keep the secret in memory only when session storage is unavailable. */ }
}

export const asset = (p: string) => `${import.meta.env.BASE_URL ?? "/"}${p.replace(/^\//, "")}`;
const portraitRoles: Record<string, string> = {
  welcome: "bisous", thinking: "cogite", suspicious: "suspicieuse", hungry: "affamee",
  memory: "rememore", cozy: "somnole", private: "emue", note: "bisous", wall: "combattive",
  "score-0": "triste", "score-20": "combattive", "score-40": "akah",
  "score-60": "etonnee", "score-80": "bisous", "score-100": "emue",
};
const legacyPortraits = ["suspicieuse", "bisous", "cogite", "emue", "combattive", "somnole"];
const portraitName = (n: number | string) =>
  typeof n === "number" ? legacyPortraits[n - 1] ?? "bisous" : portraitRoles[n] ?? n;
// Keep a sharp, modest-size source for exported cards; inline avatars select a
// smaller rendition using their CSS size and the display's pixel density.
export const avatar = (n: number | string) => asset(`assets/portraits/${portraitName(n)}.webp`);
export const avatarSrcSet = (n: number | string) => {
  const portrait = portraitName(n);
  return [
    `${asset(`assets/portraits/${portrait}-160.webp`)} 160w`,
    `${asset(`assets/portraits/${portrait}-320.webp`)} 320w`,
    `${avatar(n)} ${portrait === "akah" ? 394 : 480}w`,
  ].join(", ");
};

export function scoreTier(s: number) {
  const score = Number.isFinite(s) ? Math.max(0, Math.min(100, s)) : 0;
  const portrait = `score-${Math.round(score / 20) * 20}`;
  if (score >= 90) return { title: "Meilleure amie officielle", text: "Certifié, tamponné, encadré. Tu me connais par cœur… je vais finir par te demander où j'ai posé mes lunettes.", avatar: portrait, confetti: 220 };
  if (score >= 70) return { title: "Trop fière de toi !", text: "Tu fais partie de mon cercle très privé. Mes derniers petits secrets ? Je les garde pour la saison suivante.", avatar: portrait, confetti: 120 };
  if (score >= 40) return { title: "Pas mal du tout !", text: "On a de bonnes bases. Je prescris quelques confidences et une soirée Netflix ensemble.", avatar: portrait, confetti: 40 };
  return { title: "Euh… tu es sûre ?", text: "Je fais les gros yeux, mais je t'aime quand même. On révise autour d'un bon plat ?", avatar: portrait, confetti: 0 };
}
