import { beforeEach, describe, expect, it, vi } from "vitest";

const alice = "c364be99-7adb-4c07-9dd3-53b13f33466a";
const other = "0d5a61b3-4f0e-46a8-a878-abd52731b38b";
const answers = { q1: 0, q2: 1, q3: 0, q4: 0, q5: 0 };

beforeEach(() => { localStorage.clear(); vi.resetModules(); });

describe("démo persistante", () => {
  it("conserve le meilleur score après rechargement sans fusionner les homonymes", async () => {
    let { demoApi } = await import("../app/demo");
    expect(await demoApi.submitQuiz(alice, "Alice", answers)).toEqual({ scorePercent: 100, bestScorePercent: 100 });
    await demoApi.submitQuiz(other, "Alice", { q1: 1, q2: 0, q3: 1, q4: 1, q5: 1 });
    vi.resetModules();
    ({ demoApi } = await import("../app/demo"));
    expect(await demoApi.getMyBest(alice)).toEqual({ firstName: "Alice", bestScorePercent: 100 });
    expect(await demoApi.submitQuiz(alice, "Alice", { ...answers, q1: 1 })).toEqual({ scorePercent: 80, bestScorePercent: 100 });
    expect((await demoApi.getLeaderboard()).filter((p) => p.firstName === "Alice")).toHaveLength(2);
  });

  it("refuse les réponses partielles ou les faux identifiants", async () => {
    const { demoApi } = await import("../app/demo");
    await expect(demoApi.submitQuiz(alice, "Alice", { q1: 0 })).rejects.toThrow("ANSWERS_INVALID");
    await expect(demoApi.submitQuiz("invalid", "Alice", answers)).rejects.toThrow("PLAYER_INVALID");
  });

  it("applique délai, quota et validation sans couper le texte", async () => {
    const { demoApi } = await import("../app/demo");
    const clock = vi.spyOn(Date, "now");
    const now = Date.now();
    await demoApi.postMessage(alice, "Alice", "  Un   joli mot  ");
    expect((await demoApi.getMessages())[0]?.body).toBe("Un joli mot");
    await expect(demoApi.postMessage(alice, "Alice", "Encore")).rejects.toThrow("RATE_LIMITED");
    clock.mockReturnValue(now + 31_000);
    await demoApi.postMessage(alice, "Alice", "Deuxième");
    clock.mockReturnValue(now + 62_000);
    await demoApi.postMessage(alice, "Alice", "Troisième");
    await expect(demoApi.postMessage(alice, "Alice", "Quatrième")).rejects.toThrow("MESSAGE_LIMIT");
    await expect(demoApi.postMessage(other, "Alice", "x".repeat(281))).rejects.toThrow("MESSAGE_INVALID");
    clock.mockRestore();
  });

  it("classe Manuella séparément et invalide les mauvais codes", async () => {
    const { demoApi } = await import("../app/demo");
    await demoApi.submitQuiz(alice, "Alice", answers);
    expect(await demoApi.getManuellaContent("wrong")).toBeNull();
    await expect(demoApi.submitManuellaQuiz("wrong", answers)).rejects.toThrow("INVALID_ACCESS");
    await demoApi.submitManuellaQuiz("demo", answers);
    expect((await demoApi.getLeaderboard()).filter((p) => p.firstName === "Manuella l'Anniversaireuse")).toHaveLength(1);
    expect((await demoApi.getMyBest(alice))?.firstName).toBe("Alice");
    expect((await demoApi.getManuellaContent("demo"))?.bestScorePercent).toBe(100);
  });
});
