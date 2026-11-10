const KEY = "manuella-bday-player";
const MANUELLA_KEY = "manuella-bday-session";
export const MANUELLA_NAME = "Manuella l'Anniversaireuse";
export type Player = { playerId: string; firstName: string };

let memory: Player | null = null;
let sessionMemory: string | null = null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function loadPlayer(): Player | null {
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
  try { window.localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* Keep this visit usable. */ }
  return p;
}

export function loadManuellaCode(): string | null {
  try { return window.sessionStorage.getItem(MANUELLA_KEY) || null; } catch { return sessionMemory; }
}

export function saveManuellaCode(code: string | null) {
  sessionMemory = code;
  try {
    if (code) window.sessionStorage.setItem(MANUELLA_KEY, code);
    else window.sessionStorage.removeItem(MANUELLA_KEY);
  } catch { /* Keep the secret in memory only when session storage is unavailable. */ }
}

export const asset = (p: string) => `${import.meta.env.BASE_URL ?? "/"}${p.replace(/^\//, "")}`;
export const avatar = (n: number) => asset(`assets/avatars/avatar-${n}.webp`);

export function scoreTier(s: number) {
  if (s >= 90) return { title: "Meilleure amie officielle 👑", text: "Certifié, tamponné, encadré. Tu la connais par cœur.", avatar: 4, confetti: 220 };
  if (s >= 70) return { title: "Trop fière de toi !", text: "Tu fais clairement partie du cercle très fermé.", avatar: 5, confetti: 120 };
  if (s >= 40) return { title: "Pas mal du tout !", text: "Encore quelques soirées pyjama et tu y es.", avatar: 3, confetti: 40 };
  return { title: "Euh… tu es sûre ?", text: "Manuella fait les gros yeux. Un petit café ensemble s'impose !", avatar: 1, confetti: 0 };
}
