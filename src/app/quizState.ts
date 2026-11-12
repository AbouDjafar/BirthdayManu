import questions from "./questions.json";
import type { QuizResult } from "./contracts";

export type QuizScope = { owner: string; private: boolean };
export type PendingQuiz = { attemptId: string; answers: Record<string, number> };
type SavedQuiz = { owner: string; pending: PendingQuiz | null; result: QuizResult | null };
const memory = new Map<string, SavedQuiz>();
const failedWrites = new Set<string>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const key = (scope: QuizScope) => scope.private ? "manuella-quiz-private" : `manuella-quiz-${scope.owner}`;
const store = (scope: QuizScope) => scope.private ? window.sessionStorage : window.localStorage;
const empty = (scope: QuizScope): SavedQuiz => ({ owner: scope.owner, pending: null, result: null });

export function newAttemptId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function readQuiz(scope: QuizScope): SavedQuiz {
  if (failedWrites.has(key(scope))) {
    const cached = memory.get(key(scope));
    if (cached?.owner === scope.owner) return cached;
  }
  let raw: string | null;
  try { raw = store(scope).getItem(key(scope)); } catch {
    const cached = memory.get(key(scope));
    return cached?.owner === scope.owner ? cached : empty(scope);
  }
  if (!raw) return empty(scope);
  try {
    const value = JSON.parse(raw);
    if (value?.owner !== scope.owner) return empty(scope);
    const result = value.result;
    const score = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100;
    const validResult = result && score(result.scorePercent) && score(result.bestScorePercent) && result.bestScorePercent >= result.scorePercent;
    const pending = value.pending;
    const validPending = pending && uuid.test(pending.attemptId) && pending.answers &&
      typeof pending.answers === "object" && !Array.isArray(pending.answers) &&
      Object.entries(pending.answers).every(([id, index]) => {
        const q = questions.find(question => question.id === id);
        return q && typeof index === "number" && Number.isInteger(index) && index >= 0 && index < q.options.length;
      });
    return { owner: scope.owner, pending: validPending ? pending : null, result: validResult ? result : null };
  } catch { return empty(scope); }
}

function save(scope: QuizScope, value: SavedQuiz) {
  memory.set(key(scope), value);
  try {
    store(scope).setItem(key(scope), JSON.stringify(value));
    failedWrites.delete(key(scope));
  } catch { failedWrites.add(key(scope)); /* Continue in memory if storage is full or unavailable. */ }
}

export function beginQuiz(scope: QuizScope): PendingQuiz {
  const pending = { attemptId: newAttemptId(), answers: {} };
  save(scope, { ...readQuiz(scope), pending });
  return pending;
}

export function saveAnswers(scope: QuizScope, pending: PendingQuiz) {
  save(scope, { ...readQuiz(scope), pending });
}

export function saveQuizResult(scope: QuizScope, result: QuizResult, attemptId: string) {
  const current = readQuiz(scope);
  // A response from an abandoned older tab must not erase a newer attempt.
  const confirmed = { ...result, bestScorePercent: Math.max(result.bestScorePercent, current.result?.bestScorePercent ?? 0) };
  save(scope, { ...current, result: confirmed, pending: current.pending?.attemptId === attemptId ? null : current.pending });
  return confirmed;
}

export function isRetryableError(error: unknown): boolean {
  return !!error && typeof error === "object" && "retryable" in error && error.retryable === true;
}
