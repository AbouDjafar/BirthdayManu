import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WallScreen } from "../app/wall";
import * as api from "../app/api";

vi.mock("../app/App", () => ({ go: vi.fn() }));
vi.mock("../app/api", () => ({
  errorMessage: () => "Connexion interrompue",
  getLeaderboard: vi.fn().mockResolvedValue([
    { firstName: "Alice", bestScorePercent: 100, attempts: 1, updatedAt: "2026-12-11T12:00:00Z" },
    { firstName: "Brenda", bestScorePercent: 80, attempts: 2, updatedAt: "2026-12-11T12:01:00Z" },
    { firstName: "Claire", bestScorePercent: 60, attempts: 2147483647, updatedAt: "2026-12-11T12:02:00Z" },
  ]),
  getMessages: vi.fn().mockResolvedValue([]),
  subscribeToWall: vi.fn(() => () => {}),
}));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("compteur des tentatives au classement", () => {
  it("n’étiquette pas la première tentative et affiche le nombre réel pour chaque rejeu", async () => {
    render(<WallScreen />);
    await screen.findByText("100%");
    const ranking = screen.getByRole("region", { name: "Le classement de mon fan club" });
    const rows = within(ranking).getAllByRole("listitem");
    expect(within(rows[0]!).queryByText(/tentatives/)).not.toBeInTheDocument();
    expect(within(rows[1]!).getByText("2 tentatives")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("2147483647 tentatives")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Brenda")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("80%")).toBeInTheDocument();
  });

  it("affiche la première réponse lente et regroupe les invalidations pendant son chargement", async () => {
    const firstRanking = deferred<api.LeaderboardEntry[]>();
    const firstMessages = deferred<api.WallMessage[]>();
    const nextRanking = deferred<api.LeaderboardEntry[]>();
    const nextMessages = deferred<api.WallMessage[]>();
    vi.mocked(api.getLeaderboard).mockReturnValueOnce(firstRanking.promise).mockReturnValueOnce(nextRanking.promise);
    vi.mocked(api.getMessages).mockReturnValueOnce(firstMessages.promise).mockReturnValueOnce(nextMessages.promise);
    let invalidate!: () => void;
    vi.mocked(api.subscribeToWall).mockImplementationOnce((callback) => {
      invalidate = callback;
      return () => {};
    });
    render(<WallScreen />);
    act(() => { invalidate(); invalidate(); invalidate(); invalidate(); });
    expect(api.getLeaderboard).toHaveBeenCalledTimes(1);
    expect(api.getMessages).toHaveBeenCalledTimes(1);

    const ranking = [{ firstName: "Alice lente", bestScorePercent: 80, attempts: 2, updatedAt: "2026-12-11T12:00:00Z" }];
    await act(async () => {
      firstRanking.resolve(ranking);
      firstMessages.resolve([{ firstName: "Alice lente", body: "Un mot arrivé malgré la connexion lente", createdAt: "2026-12-11T12:00:00Z" }]);
    });
    // The queued request remains unresolved: the first result must still show.
    expect(screen.getByText("Alice lente")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(api.getLeaderboard).toHaveBeenCalledTimes(2);
    expect(api.getMessages).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: /Un mot arrivé malgré la connexion lente/ }));
    expect(screen.getByRole("dialog", { name: "Mot de Alice lente" })).toBeInTheDocument();

    await act(async () => {
      nextRanking.resolve([{ ...ranking[0]!, bestScorePercent: 100 }]);
      nextMessages.resolve([]);
    });
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.getLeaderboard).toHaveBeenCalledTimes(2);
  });
});
