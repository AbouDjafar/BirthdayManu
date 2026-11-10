import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../app/api";
import { App } from "../app/App";
import questions from "../app/questions.json";
import { loadPlayer, saveManuellaCode, savePlayer } from "../app/storage";
import { SIGNATURE } from "../app/ui";

vi.mock("../app/api", () => ({
  errorMessage: (error: unknown) => error instanceof Error ? error.message : "Erreur de connexion",
  getMyBest: vi.fn(),
  getLeaderboard: vi.fn(),
  getMessages: vi.fn(),
  submitQuiz: vi.fn(),
  submitManuellaQuiz: vi.fn(),
  postMessage: vi.fn(),
  postManuellaMessage: vi.fn(),
  getManuellaContent: vi.fn(),
  subscribeToWall: vi.fn(),
}));

vi.mock("../app/ShareResult", () => ({
  ShareResult: ({ firstName, scorePercent, ready }: { firstName: string; scorePercent: number; ready: boolean }) =>
    <div data-testid="share-result" data-first-name={firstName} data-score={scorePercent} data-ready={String(ready)} />,
}));

let invalidate: () => void;
let unsubscribe: ReturnType<typeof vi.fn<() => void>>;
const privateContent = { text: "Une lettre reçue du serveur.", bestScorePercent: 80 };

function navigate(hash: string) {
  act(() => {
    window.history.replaceState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear(); sessionStorage.clear(); saveManuellaCode(null);
  window.history.replaceState(null, "", "#/");
  vi.mocked(api.getMyBest).mockResolvedValue({ firstName: "Alice", bestScorePercent: 80 });
  vi.mocked(api.getLeaderboard).mockResolvedValue([]);
  vi.mocked(api.getMessages).mockResolvedValue([]);
  vi.mocked(api.submitQuiz).mockResolvedValue({ scorePercent: 60, bestScorePercent: 80 });
  vi.mocked(api.submitManuellaQuiz).mockResolvedValue({ scorePercent: 100, bestScorePercent: 100 });
  vi.mocked(api.postMessage).mockResolvedValue({ ok: true });
  vi.mocked(api.postManuellaMessage).mockResolvedValue({ ok: true });
  vi.mocked(api.getManuellaContent).mockResolvedValue(privateContent);
  unsubscribe = vi.fn();
  vi.mocked(api.subscribeToWall).mockImplementation((callback, onStatus) => {
    invalidate = callback; onStatus?.("live"); return unsubscribe;
  });
  vi.spyOn(window, "matchMedia").mockImplementation((media) => ({
    matches: true, media, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function answerQuiz() {
  for (const question of questions) {
    const button = await screen.findByRole("button", { name: `A. ${question.options[0]}` });
    fireEvent.click(button);
  }
}

describe("parcours de l’application", () => {
  it.each(["#/inconnue", "#/m-%E0%A4%A"])("redirige silencieusement une route invalide %s", async (hash) => {
    navigate(hash);
    render(<App />);
    await waitFor(() => expect(window.location.hash).toBe("#/"));
    expect(screen.getByRole("button", { name: /Je relève le défi/ })).toBeInTheDocument();
    expect(api.getManuellaContent).not.toHaveBeenCalled();
  });

  it("valide le prénom, garde les réponses après une panne et termine le parcours avec réessai du mot", async () => {
    vi.mocked(api.submitQuiz).mockRejectedValueOnce(new Error("Réseau indisponible"));
    vi.mocked(api.postMessage).mockRejectedValueOnce(new Error("Attends 30 secondes"));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Je relève le défi/ }));
    const dialog = screen.getByRole("dialog", { name: "Ton prénom" });
    expect(within(dialog).getByText(SIGNATURE)).toBeInTheDocument();
    expect(screen.queryByText(/Mode démo/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Ton prénom" }), { target: { value: "A" } });
    expect(screen.getByRole("button", { name: "C'est parti" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Ton prénom" }), { target: { value: "Alice A." } });
    fireEvent.click(screen.getByRole("button", { name: "C'est parti" }));
    await answerQuiz();
    expect(await screen.findByRole("alert")).toHaveTextContent("Réseau indisponible");
    fireEvent.click(screen.getByRole("button", { name: "Réessayer l’envoi" }));
    expect(await screen.findByRole("button", { name: /Découvrir la surprise/ })).toBeInTheDocument();
    const resultCard = screen.getByLabelText("Carte de résultat");
    expect(within(resultCard).getByText("Alice A.")).toBeInTheDocument();
    expect(within(resultCard).getByText("60%")).toBeInTheDocument();
    expect(within(resultCard).getByRole("img")).toHaveAttribute("src", "/assets/portraits/etonnee.webp");
    expect(within(resultCard).queryByText(SIGNATURE)).not.toBeInTheDocument();
    expect(screen.getByTestId("share-result")).toHaveAttribute("data-first-name", "Alice A.");
    expect(screen.getByTestId("share-result")).toHaveAttribute("data-score", "60");
    expect(screen.getByTestId("share-result")).toHaveAttribute("data-ready", "true");
    expect(api.submitQuiz).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.submitQuiz).mock.calls[1]).toEqual(vi.mocked(api.submitQuiz).mock.calls[0]);
    fireEvent.click(screen.getByRole("button", { name: /Découvrir la surprise/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Touche pour dévoiler la photo" }));
    fireEvent.click(screen.getByRole("button", { name: /Me laisser un mot/ }));
    fireEvent.change(await screen.findByLabelText(/Ton message/), { target: { value: "Joyeux anniversaire !" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Attends 30 secondes");
    expect(screen.getByLabelText(/Ton message/)).toHaveValue("Joyeux anniversaire !");
    fireEvent.click(screen.getByRole("button", { name: /Réessayer l’envoi/ }));
    expect(await screen.findByRole("heading", { name: "Le mur" })).toBeInTheDocument();
    expect(api.postMessage).toHaveBeenLastCalledWith(loadPlayer()!.playerId, "Alice A.", "Joyeux anniversaire !");
  }, 12000);

  it("reconnaît le retour et crée une autre identité lorsque la participante change", async () => {
    const first = savePlayer("Alice");
    render(<App />);
    expect(await screen.findByText("80 %")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ce n'est pas moi" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Ton prénom" }), { target: { value: "Alice B." } });
    fireEvent.click(screen.getByRole("button", { name: "C'est parti" }));
    await screen.findByRole("dialog", { name: "Question 1 sur 5" });
    expect(loadPlayer()?.playerId).not.toBe(first.playerId);
  });

  it("restaure une session Manuella sans demander de prénom et utilise la soumission dédiée", async () => {
    const friend = savePlayer("Alice");
    saveManuellaCode("secret-test");
    navigate("#/quiz");
    render(<App />);
    await answerQuiz();
    expect(await screen.findByRole("button", { name: /Découvrir la surprise/ })).toBeInTheDocument();
    expect(api.submitManuellaQuiz).toHaveBeenCalledWith("secret-test", { q1: 0, q2: 0, q3: 0, q4: 0, q5: 0 });
    expect(api.submitQuiz).not.toHaveBeenCalled();
    expect(screen.getByTestId("share-result")).toHaveAttribute("data-first-name", "Manuella l'Anniversaireuse");
    expect(loadPlayer()).toEqual(friend);
  }, 10000);

  it("active l’accès privé validé et envoie un mot sous l’identité Manuella", async () => {
    const friend = savePlayer("Alice");
    navigate("#/m-secret-test");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Ouvrir ma lettre/ }));
    expect(screen.getByText(privateContent.text)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Je garde ça dans mon cœur" }));
    fireEvent.click(screen.getByRole("button", { name: "Voir le mur de mes amies" }));
    await screen.findByRole("heading", { name: "Le mur" });
    navigate("#/mot");
    fireEvent.change(await screen.findByLabelText(/Ton message/), { target: { value: "Merci mes amies !" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(api.postManuellaMessage).toHaveBeenCalledWith("secret-test", "Merci mes amies !"));
    expect(api.postMessage).not.toHaveBeenCalled();
    expect(loadPlayer()).toEqual(friend);
  });

  it("redirige un mauvais code et permet de réessayer une panne sans exposer de contenu", async () => {
    vi.mocked(api.getManuellaContent).mockRejectedValueOnce(new Error("Connexion coupée")).mockResolvedValueOnce(null);
    navigate("#/m-invalid");
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Connexion coupée");
    expect(screen.queryByText(privateContent.text)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(window.location.hash).toBe("#/"));
    expect(await screen.findByRole("button", { name: /Je relève le défi/ })).toBeInTheDocument();
  });

  it("permet de rouvrir un lien privé après une panne de restauration de session", async () => {
    saveManuellaCode("ancien-code");
    vi.mocked(api.getManuellaContent).mockRejectedValueOnce(new Error("Connexion coupée"));
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Connexion coupée");
    navigate("#/m-nouveau-code");
    expect(await screen.findByRole("button", { name: /Ouvrir ma lettre/ })).toBeInTheDocument();
    expect(api.getManuellaContent).toHaveBeenLastCalledWith("nouveau-code");
  });

  it("conserve les homonymes et retire un message modéré même s’il est ouvert", async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue([
      { firstName: "Alice", bestScorePercent: 100, updatedAt: "2026-12-11T12:00:00Z" },
      { firstName: "Alice", bestScorePercent: 60, updatedAt: "2026-12-11T12:01:00Z" },
    ]);
    vi.mocked(api.getMessages).mockResolvedValue([{ firstName: "Brenda", body: "Un mot à modérer", createdAt: "2026-12-11T12:00:00Z" }]);
    navigate("#/mur");
    const view = render(<App />);
    expect(await screen.findByText("100%")).toBeInTheDocument();
    expect(screen.getAllByText("Alice")).toHaveLength(2);
    fireEvent.click(await screen.findByRole("button", { name: /Un mot à modérer/ }));
    expect(screen.getByRole("dialog", { name: "Mot de Brenda" })).toBeInTheDocument();
    vi.mocked(api.getMessages).mockResolvedValue([]);
    act(() => invalidate());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText("Un mot à modérer")).not.toBeInTheDocument();
    expect(screen.getAllByText("Alice")).toHaveLength(2);
    view.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("annule la transition d’une question après une navigation", async () => {
    savePlayer("Alice");
    navigate("#/quiz");
    render(<App />);
    for (const question of questions.slice(0, -1)) {
      fireEvent.click(await screen.findByRole("button", { name: `A. ${question.options[0]}` }));
    }
    fireEvent.click(await screen.findByRole("button", { name: `A. ${questions.at(-1)!.options[0]}` }));
    navigate("#/mur");
    await screen.findByRole("heading", { name: "Le mur" });
    await new Promise((resolve) => setTimeout(resolve, 750));
    expect(api.submitQuiz).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#/mur");
  });

  it("affiche une panne du mur puis recharge les listes après réessai", async () => {
    vi.mocked(api.getMessages).mockRejectedValueOnce(new Error("Réseau indisponible"));
    navigate("#/mur");
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Réseau indisponible");
    expect(screen.getByRole("status")).toHaveTextContent("connexion interrompue");
    fireEvent.click(screen.getByRole("button", { name: "Réessayer le chargement du mur" }));
    expect(await screen.findByText(/Qui m'écrit le premier petit mot/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
