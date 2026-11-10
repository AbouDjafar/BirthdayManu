import questions from "./questions.json";

export type QuizResult = { scorePercent: number; bestScorePercent: number };
export type LeaderboardEntry = { firstName: string; bestScorePercent: number; attempts: number; updatedAt: string };
export type WallMessage = { firstName: string; body: string; createdAt: string };
export type ManuellaContent = { text: string; photoUrl?: string; bestScorePercent: number | null };
export type WallConnectionStatus = "connecting" | "live" | "polling" | "offline";

export function normalizeName(name: string) {
  const value = name.trim().replace(/\s+/g, " ");
  if (Array.from(value).length < 2 || Array.from(value).length > 30) throw new Error("NAME_INVALID");
  return value;
}

export function validatePlayerId(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("PLAYER_INVALID");
  }
}

export function answerTexts(answers: Record<string, number>): Record<string, string> {
  if (Object.keys(answers).length !== questions.length) throw new Error("ANSWERS_INVALID");
  return Object.fromEntries(questions.map((question) => {
    const index = answers[question.id];
    if (index === undefined || !Number.isInteger(index) || !question.options[index]) throw new Error("ANSWERS_INVALID");
    return [question.id, question.options[index]];
  }));
}

export function normalizeBody(body: string) {
  const value = body.trim().replace(/\s+/g, " ");
  if (!value || Array.from(value).length > 280) throw new Error("MESSAGE_INVALID");
  return value;
}
