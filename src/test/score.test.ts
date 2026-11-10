import { describe, expect, it } from "vitest";
import { avatar, scoreTier } from "@/app/storage";

describe("score tiers", () => {
  it("39% is teasing", () => expect(scoreTier(39).title).toContain("sûre"));
  it("40% is encouraging", () => expect(scoreTier(40).title).toBe("Pas mal du tout !"));
  it("70% is proud", () => expect(scoreTier(70).title).toBe("Trop fière de toi !"));
  it("90% is official best friend", () => expect(scoreTier(90).title).toContain("Meilleure amie officielle"));

  it("uses a distinct portrait for each achievable score", () => {
    const scores = [0, 20, 40, 60, 80, 100];
    expect(scores.map((score) => scoreTier(score).avatar)).toEqual(scores.map((score) => `score-${score}`));
    expect(new Set(scores.map((score) => scoreTier(score).avatar)).size).toBe(6);
    expect(scores.map((score) => avatar(scoreTier(score).avatar))).toEqual([
      "/assets/portraits/triste.webp", "/assets/portraits/combattive.webp", "/assets/portraits/akah.webp",
      "/assets/portraits/etonnee.webp", "/assets/portraits/bisous.webp", "/assets/portraits/emue.webp",
    ]);
  });

  it("rounds unexpected intermediate scores to the closest portrait and bounds the result", () => {
    expect(scoreTier(39).avatar).toBe("score-40");
    expect(scoreTier(-10).avatar).toBe("score-0");
    expect(scoreTier(115).avatar).toBe("score-100");
  });

  it("keeps all score titles free of emoji and dashes", () => {
    for (const score of [0, 20, 40, 60, 80, 100]) {
      expect(scoreTier(score).title).not.toMatch(/\p{Extended_Pictographic}|[-–—]/u);
    }
  });
});
