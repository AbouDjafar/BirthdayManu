import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadManuellaCode, loadPlayer, MANUELLA_NAME, saveManuellaCode, savePlayer } from "../app/storage";

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); saveManuellaCode(null); vi.restoreAllMocks(); });

describe("identité des participantes", () => {
  it("conserve une identité valide lors du retour et en crée une autre pour une autre amie", () => {
    const first = savePlayer(" Alice A. ");
    expect(first.firstName).toBe("Alice A.");
    expect(first.playerId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(loadPlayer()).toEqual(first);
    expect(savePlayer("Alice A.").playerId).toBe(first.playerId);
    expect(savePlayer("Alice A.", true).playerId).not.toBe(first.playerId);
  });

  it("ignore des données locales corrompues ou une ancienne identité non UUID", () => {
    localStorage.setItem("manuella-bday-player", "{");
    expect(loadPlayer()).toBeNull();
    localStorage.setItem("manuella-bday-player", JSON.stringify({ playerId: "old-id", firstName: "Alice" }));
    expect(loadPlayer()).toBeNull();
    expect(() => savePlayer(" ")).toThrow();
  });

  it("garde la session privée séparée de l’identité amie", () => {
    const friend = savePlayer("Alice");
    saveManuellaCode("secret-test");
    expect(loadManuellaCode()).toBe("secret-test");
    expect(loadPlayer()).toEqual(friend);
    expect(localStorage.getItem("manuella-bday-player")).not.toContain("secret-test");
    expect(MANUELLA_NAME).toBe("Manuella l'Anniversaireuse");
    saveManuellaCode(null);
    expect(loadManuellaCode()).toBeNull();
  });

  it("garde la visite utilisable lorsque le stockage navigateur est refusé", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const friend = savePlayer("Brenda", true);
    expect(loadPlayer()).toEqual(friend);
    saveManuellaCode("temporary");
    expect(loadManuellaCode()).toBe("temporary");
    get.mockRestore();
  });
});
