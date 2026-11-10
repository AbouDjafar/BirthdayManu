import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  vi.mocked(createResultImage).mockResolvedValue(image);
  vi.mocked(copyPublicQuizLink).mockResolvedValue(undefined);
  vi.mocked(sharePreparedResult).mockResolvedValue("image");
});
afterEach(cleanup);

async function readyButton() {
  const button = await screen.findByRole("button", { name: "Partager mon résultat" });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe("actions de partage du résultat", () => {
  it("attend le score final avant de préparer l’image et de permettre le partage", async () => {
    const { rerender } = render(<ShareResult targetRef={targetRef} firstName="Alice" scorePercent={80} ready={false} />);
    expect(screen.getByRole("button", { name: "Partager mon résultat" })).toBeDisabled();
    expect(createResultImage).not.toHaveBeenCalled();
    rerender(<ShareResult targetRef={targetRef} firstName="Alice" scorePercent={80} ready />);
    await readyButton();
    expect(createResultImage).toHaveBeenCalledWith(targetRef.current, "Alice");
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
    fireEvent.click(await readyButton());
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
});
