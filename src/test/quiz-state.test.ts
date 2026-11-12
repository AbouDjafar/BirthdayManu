import { beforeEach, describe, expect, it, vi } from "vitest";
import { beginQuiz, readQuiz, saveAnswers, saveQuizResult } from "../app/quizState";

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); });
const friend = { owner: "11111111-1111-4111-8111-111111111111", private: false };

describe("sauvegarde du quiz sur connexion lente", () => {
  it("conserve réponses et identifiant pour reprendre une partie, puis garde le résultat", () => {
    const pending = beginQuiz(friend);
    saveAnswers(friend, { ...pending, answers: { q1: 0, q2: 1 } });
    expect(readQuiz(friend).pending).toEqual({ ...pending, answers: { q1: 0, q2: 1 } });
    saveQuizResult(friend, { scorePercent: 0, bestScorePercent: 80 }, pending.attemptId);
    expect(readQuiz(friend)).toMatchObject({ pending: null, result: { scorePercent: 0, bestScorePercent: 80 } });
    const next = beginQuiz(friend);
    expect(next.attemptId).not.toBe(pending.attemptId);
    expect(readQuiz(friend).result?.scorePercent).toBe(0);
  });

  it("sépare amies et Manuella et ne stocke aucun code privé dans localStorage", () => {
    const privateScope = { owner: "CODE_DE_SESSION_SYNTHETIQUE", private: true };
    beginQuiz(friend);
    const pending = beginQuiz(privateScope);
    saveQuizResult(privateScope, { scorePercent: 100, bestScorePercent: 100 }, pending.attemptId);
    expect(readQuiz(friend).result).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain(privateScope.owner);
    expect(readQuiz({ owner: "AUTRE_CODE", private: true }).result).toBeNull();
  });

  it("ignore les données corrompues et ne supprime pas une nouvelle partie quand une ancienne réponse arrive", () => {
    localStorage.setItem(`manuella-quiz-${friend.owner}`, "{");
    expect(readQuiz(friend).pending).toBeNull();
    const old = beginQuiz(friend);
    const current = beginQuiz(friend);
    saveQuizResult(friend, { scorePercent: 40, bestScorePercent: 40 }, old.attemptId);
    expect(readQuiz(friend).pending?.attemptId).toBe(current.attemptId);
    localStorage.setItem(`manuella-quiz-${friend.owner}`, JSON.stringify({ owner: friend.owner, result: { scorePercent: 200, bestScorePercent: 200 }, pending: { attemptId: current.attemptId, answers: { q1: 99 } } }));
    expect(readQuiz(friend)).toMatchObject({ pending: null, result: null });
  });

  it("conserve le meilleur score local lorsqu’un ancien reçu est récupéré", () => {
    const old = beginQuiz(friend);
    const recent = beginQuiz(friend);
    saveQuizResult(friend, { scorePercent: 100, bestScorePercent: 100 }, recent.attemptId);
    saveQuizResult(friend, { scorePercent: 40, bestScorePercent: 40 }, old.attemptId);
    expect(readQuiz(friend).result).toEqual({ scorePercent: 40, bestScorePercent: 100 });
  });

  it("garde la partie en mémoire si le quota empêche les écritures mais permet encore les lectures", () => {
    const limited = { owner: "22222222-2222-4222-8222-222222222222", private: false };
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Quota exceeded", "QuotaExceededError"); });
    const pending = beginQuiz(limited);
    saveAnswers(limited, { ...pending, answers: { q1: 0 } });
    expect(readQuiz(limited).pending).toEqual({ ...pending, answers: { q1: 0 } });
    saveQuizResult(limited, { scorePercent: 60, bestScorePercent: 60 }, pending.attemptId);
    expect(readQuiz(limited).result?.scorePercent).toBe(60);
    write.mockRestore();
  });
});
