import { describe, expect, it } from "vitest";
import { scoreTier } from "@/app/storage";

describe("score tiers", () => {
  it("39% is teasing", () => expect(scoreTier(39).title).toContain("sûre"));
  it("40% is encouraging", () => expect(scoreTier(40).title).toBe("Pas mal du tout !"));
  it("70% is proud", () => expect(scoreTier(70).title).toBe("Trop fière de toi !"));
  it("90% is official best friend", () => expect(scoreTier(90).title).toContain("Meilleure amie officielle"));
});
