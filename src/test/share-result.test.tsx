import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShareResult } from "../app/ShareResult";
import { copyPublicQuizLink, createResultImage, downloadResultImage, sharePreparedResult } from "../app/share";

vi.mock("../app/share", () => ({
  createResultImage: vi.fn(),
  sharePreparedResult: vi.fn(),
  downloadResultImage: vi.fn(),
  copyPublicQuizLink: vi.fn(),
  publicQuizUrl: () => "https://aboudjafar.github.io/BirthdayManu/#/",
}));

const targetRef = { current: document.createElement("div") };
const image = new File(["png"], "resultat.png", { type: "image/png" });

beforeEach(() => {
  vi.resetAllMocks();
  targetRef.current.replaceChildren();
  vi.mocked(createResultImage).mockResolvedValue(image);
  vi.mocked(copyPublicQuizLink).mockResolvedValue(undefined);
  vi.mocked(sharePreparedResult).mockResolvedValue("image");
});
afterEach(cleanup);

async function readyButton() {
  const button = await screen.findByRole("button", { name: "Partager mon résultat" });
  await waitFor(() => expect(button).toBeEnabled());
  await waitFor(() => expect(screen.getByRole("button", { name: "Télécharger la carte" })).toBeEnabled());
  return button;
}

describe("actions de partage du résultat", () => {
  it("attend le score final avant de préparer l’image et de permettre le partage", async () => {
    const { rerender } = render(<ShareResult targetRef={targetRef} firstName="Alice" scorePercent={80} ready={false} />);
    expect(screen.getByRole("button", { name: "Partager mon résultat" })).toBeDisabled();
    expect(createResultImage).not.toHaveBeenCalled();
    rerender(<ShareResult targetRef={targetRef} firstName="Alice" scorePercent={80} ready />);
    await readyButton();
    expect(createResultImage).toHaveBeenCalledWith(targetRef.current, "Alice", 80);
    fireEvent.click(await readyButton());
    expect(sharePreparedResult).toHaveBeenCalledWith(image, 80);
    await readyButton();
  });

  it("télécharge la carte et copie le lien si le partage natif est absent", async () => {
    vi.mocked(sharePreparedResult).mockResolvedValue("unavailable");
    render(<ShareResult targetRef={targetRef} firstName="Alice" scorePercent={60} ready />);
    fireEvent.click(await readyButton());
    await waitFor(() => expect(downloadResultImage).toHaveBeenCalledWith(image));
    expect(copyPublicQuizLink).toHaveBeenCalled();
    expect(await screen.findByText(/Ta carte est téléchargée et le lien public est copié/)).toBeInTheDocument();
  });

  it("permet le partage texte et la nouvelle tentative après une erreur de capture", async () => {
    vi.mocked(createResultImage).mockRejectedValueOnce(new Error("Portrait indisponible"));
    render(<ShareResult targetRef={targetRef} firstName="Alice" scorePercent={40} ready />);
    const retry = await screen.findByRole("button", { name: "Réessayer la création de la carte" });
    fireEvent.click(screen.getByRole("button", { name: "Partager mon résultat" }));
    expect(sharePreparedResult).toHaveBeenCalledWith(null, 40);
    await waitFor(() => expect(screen.getByRole("button", { name: "Partager mon résultat" })).toBeEnabled());
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByRole("button", { name: "Télécharger la carte" })).toBeEnabled());
    expect(createResultImage).toHaveBeenCalledTimes(2);
  });

  it("une annulation ne provoque ni erreur ni téléchargement", async () => {
    vi.mocked(sharePreparedResult).mockResolvedValue("cancelled");
    render(<ShareResult targetRef={targetRef} firstName="Alice" scorePercent={80} ready />);
    fireEvent.click(await readyButton());
    await waitFor(() => expect(screen.getByRole("button", { name: "Partager mon résultat" })).toBeEnabled());
    expect(screen.queryByText(/n’a pas abouti/)).not.toBeInTheDocument();
    expect(downloadResultImage).not.toHaveBeenCalled();
  });

  it("fournit un lien sélectionnable lorsque le presse-papiers est bloqué", async () => {
    vi.mocked(copyPublicQuizLink).mockRejectedValue(new Error("Presse-papiers bloqué"));
    render(<ShareResult targetRef={targetRef} firstName="Alice" scorePercent={80} ready />);
    await readyButton();
    fireEvent.click(screen.getByRole("button", { name: "Copier le lien" }));
    expect(await screen.findByRole("textbox", { name: "Lien public du quiz" })).toHaveValue("https://aboudjafar.github.io/BirthdayManu/#/");
  });

  it("permet immédiatement le partage du score sans attendre la préparation de la carte", async () => {
    vi.mocked(createResultImage).mockReturnValue(new Promise(() => {}));
    vi.mocked(sharePreparedResult).mockResolvedValue("text");
    render(<ShareResult targetRef={targetRef} firstName="Alice" scorePercent={0} ready />);
    const button = screen.getByRole("button", { name: "Partager mon résultat" });
    expect(button).toBeEnabled();
    expect(screen.getByRole("button", { name: "Télécharger la carte" })).toBeDisabled();
    fireEvent.click(button);
    expect(sharePreparedResult).toHaveBeenCalledWith(null, 0);
    expect(await screen.findByText("Le message et le lien sont partagés.")).toBeInTheDocument();
  });

  it("actualise la carte avec le portrait chargé plus tard et conserve le téléchargement pendant ce temps", async () => {
    const portrait = document.createElement("img");
    targetRef.current.append(portrait);
    render(<ShareResult targetRef={targetRef} firstName="Alice" scorePercent={80} ready />);
    await readyButton();
    let resolvePortrait!: (file: File) => void;
    const withPortrait = new File(["png portrait"], "avec-portrait.png", { type: "image/png" });
    vi.mocked(createResultImage).mockReturnValueOnce(new Promise((resolve) => { resolvePortrait = resolve; }));
    fireEvent.load(portrait);
    expect(screen.getByRole("button", { name: "Télécharger la carte" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Télécharger la carte" }));
    expect(downloadResultImage).toHaveBeenCalledWith(image);
    resolvePortrait(withPortrait);
    await waitFor(() => expect(createResultImage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/Ta carte de résultat se prépare/)).not.toBeInTheDocument());
    fireEvent.click(await readyButton());
    expect(sharePreparedResult).toHaveBeenCalledWith(withPortrait, 80);
  });

  it("retente les ressources facultatives à la reconnexion", async () => {
    const portrait = document.createElement("img");
    portrait.src = "/assets/portraits/bisous.webp";
    targetRef.current.append(portrait);
    render(<ShareResult targetRef={targetRef} firstName="Alice" scorePercent={80} ready />);
    await readyButton();
    fireEvent(window, new Event("online"));
    await waitFor(() => expect(createResultImage).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/La carte n’a pas pu être créée/)).not.toBeInTheDocument();
  });

  it("inclut un portrait réinséré après le remplacement de l’image en erreur par un monogramme", async () => {
    const fallback = document.createElement("span");
    fallback.textContent = "M";
    targetRef.current.append(fallback);
    render(<ShareResult targetRef={targetRef} firstName="Alice" scorePercent={80} ready />);
    await readyButton();
    fireEvent(window, new Event("online"));
    await waitFor(() => expect(createResultImage).toHaveBeenCalledTimes(2));
    const portrait = document.createElement("img");
    fallback.replaceWith(portrait);
    const withPortrait = new File(["nouveau portrait"], "portrait.png", { type: "image/png" });
    vi.mocked(createResultImage).mockResolvedValueOnce(withPortrait);
    // A native load event does not bubble; the parent must listen during capture.
    fireEvent(portrait, new Event("load", { bubbles: false }));
    await waitFor(() => expect(createResultImage).toHaveBeenCalledTimes(3));
    fireEvent.click(await readyButton());
    expect(sharePreparedResult).toHaveBeenCalledWith(withPortrait, 80);
    await waitFor(() => expect(screen.getByRole("button", { name: "Partager mon résultat" })).toBeEnabled());
  });

  it("ne partage jamais la carte d’une identité précédente si sa préparation finit en retard", async () => {
    let resolvePrevious!: (file: File) => void;
    const previous = new File(["Alice"], "alice.png", { type: "image/png" });
    const current = new File(["Bob"], "bob.png", { type: "image/png" });
    vi.mocked(createResultImage)
      .mockReturnValueOnce(new Promise((resolve) => { resolvePrevious = resolve; }))
      .mockResolvedValueOnce(current);
    const { rerender } = render(<ShareResult targetRef={targetRef} firstName="Alice" scorePercent={80} ready />);
    rerender(<ShareResult targetRef={targetRef} firstName="Bob" scorePercent={20} ready />);
    await readyButton();
    await act(async () => { resolvePrevious(previous); });
    fireEvent.click(await readyButton());
    expect(sharePreparedResult).toHaveBeenCalledWith(current, 20);
    await waitFor(() => expect(screen.getByRole("button", { name: "Partager mon résultat" })).toBeEnabled());
  });
});
