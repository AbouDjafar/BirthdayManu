import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ rpc: vi.fn(), subscribe: vi.fn(), on: vi.fn(), remove: vi.fn(), create: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: fake.create }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_only");
  fake.create.mockReturnValue({ rpc: fake.rpc, channel: () => ({ on: fake.on }), removeChannel: fake.remove });
  fake.on.mockReturnValue({ subscribe: fake.subscribe });
  fake.subscribe.mockReturnValue({});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("adaptateur Supabase", () => {
  it("convertit les indices en textes et les noms de champs RPC", async () => {
    fake.rpc.mockResolvedValue({ data: { score: 80, best: 100 }, error: null });
    const api = await import("../app/api");
    expect(await api.submitQuiz("c364be99-7adb-4c07-9dd3-53b13f33466a", "  Alice  ", { q1: 0, q2: 1, q3: 0, q4: 0, q5: 0 })).toEqual({ scorePercent: 80, bestScorePercent: 100 });
    expect(fake.rpc).toHaveBeenCalledWith("submit_quiz", {
      p_player_id: "c364be99-7adb-4c07-9dd3-53b13f33466a", p_first_name: "Alice",
      p_answers: { q1: "Bleu", q2: "Marie", q3: "Le ndolé", q4: "Les petits cailloux", q5: "Un voyage improvisé" },
    });
  });

  it("ne remplace jamais une panne par des données fictives", async () => {
    fake.rpc.mockReturnValue({ range: vi.fn().mockResolvedValue({ data: null, error: { message: "Failed to fetch" } }) });
    const api = await import("../app/api");
    await expect(api.getLeaderboard()).rejects.toThrow("Failed to fetch");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    vi.resetModules();
    const unconfigured = await import("../app/api");
    await expect(unconfigured.getMessages()).rejects.toThrow("BACKEND_NOT_CONFIGURED");
  });

  it("rejette un code privé malformé sans RPC et utilise les RPC dédiées", async () => {
    const api = await import("../app/api");
    expect(await api.getManuellaContent("demo")).toBeNull();
    expect(fake.rpc).not.toHaveBeenCalled();
    fake.rpc.mockResolvedValue({ data: { score: 60, best: 80 }, error: null });
    await api.submitManuellaQuiz("a".repeat(43), { q1: 0, q2: 1, q3: 0, q4: 0, q5: 0 });
    expect(fake.rpc.mock.calls[0]?.[0]).toBe("submit_manuella_quiz");
  });

  it("charge tous les messages même si Supabase limite les pages", async () => {
    const messages = Array.from({ length: 1_205 }, (_, index) => ({ first_name: `Amie ${index}`, body: "Bonjour", created_at: "2026-12-12T12:00:00Z" }));
    const range = vi.fn(async (start: number) => ({ data: messages.slice(start, start + 137), count: messages.length, error: null }));
    fake.rpc.mockReturnValue({ range });
    const api = await import("../app/api");
    const values = await api.getMessages();
    expect(values).toHaveLength(1_205);
    expect(values.at(-1)?.firstName).toBe("Amie 1204");
    expect(range).toHaveBeenLastCalledWith(1_096, 1_595);
  });

  it("passe au polling en panne puis reprend le temps réel et nettoie les timers", async () => {
    vi.useFakeTimers();
    const api = await import("../app/api");
    const refresh = vi.fn();
    const statuses = vi.fn();
    const stop = api.subscribeToWall(refresh, statuses);
    const state = fake.subscribe.mock.calls[0]![0] as (value: string) => void;
    expect(statuses).toHaveBeenCalledWith("connecting");
    state("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(100);
    expect(statuses).toHaveBeenLastCalledWith("live");
    expect(refresh).toHaveBeenCalledTimes(1);
    state("CHANNEL_ERROR");
    await vi.advanceTimersByTimeAsync(15_100);
    expect(statuses).toHaveBeenLastCalledWith("polling");
    expect(refresh).toHaveBeenCalledTimes(3);
    state("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(100);
    expect(refresh).toHaveBeenCalledTimes(4);
    stop();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(refresh).toHaveBeenCalledTimes(4);
    expect(fake.remove).toHaveBeenCalledOnce();
  });
});
