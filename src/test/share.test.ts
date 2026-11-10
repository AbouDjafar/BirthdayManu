import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toBlob } from "html-to-image";
import { copyPublicQuizLink, createResultImage, publicQuizUrl, resultShareData, sharePreparedResult } from "../app/share";

vi.mock("html-to-image", () => ({ toBlob: vi.fn() }));

const originalNavigator = navigator;
const image = new File(["png"], "resultat.png", { type: "image/png" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("navigator", { share: undefined, canShare: undefined, clipboard: undefined });
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });
  window.history.replaceState(null, "", "#/m-code-tres-prive");
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("lien public et partage natif", () => {
  it("partage toujours l’accueil, sans le hash privé ou la query de la page", () => {
    expect(publicQuizUrl("https://aboudjafar.github.io", "/BirthdayManu/")).toBe("https://aboudjafar.github.io/BirthdayManu/#/");
    expect(publicQuizUrl("https://exemple.test", "/BirthdayManu?code=secret#/m-secret")).toBe("https://exemple.test/BirthdayManu/#/");
    const data = resultShareData(80);
    expect(data.text).toContain("80 %");
    expect(data.url).toBe("https://aboudjafar.github.io/BirthdayManu/#/");
    expect(JSON.stringify(data)).not.toContain("code-tres-prive");
  });

  it("envoie l’image, le message et le lien si le navigateur accepte les fichiers", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { share, canShare });
    const pending = sharePreparedResult(image, 60);
    // The native API is invoked synchronously before the first await.
    expect(share).toHaveBeenCalledWith({ ...resultShareData(60), files: [image] });
    expect(canShare).toHaveBeenCalledWith({ files: [image] });
    expect(await pending).toBe("image");
  });

  it.each([false, undefined])("partage le texte quand le partage de fichiers vaut %s", async (supported) => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, canShare: supported === undefined ? undefined : () => supported });
    expect(await sharePreparedResult(image, 20)).toBe("text");
    expect(share).toHaveBeenCalledWith(resultShareData(20));
    expect(share.mock.calls[0]?.[0]).not.toHaveProperty("files");
  });

  it("propose le repli si le partage natif est absent", async () => {
    expect(await sharePreparedResult(image, 100)).toBe("unavailable");
  });

  it("traite une annulation sans erreur et conserve les autres erreurs", async () => {
    const share = vi.fn().mockRejectedValueOnce(new DOMException("Annulé", "AbortError")).mockRejectedValueOnce(new Error("Bloqué"));
    vi.stubGlobal("navigator", { share });
    expect(await sharePreparedResult(null, 40)).toBe("cancelled");
    await expect(sharePreparedResult(null, 40)).rejects.toThrow("Bloqué");
  });

  it("copie uniquement le lien public", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await copyPublicQuizLink();
    expect(writeText).toHaveBeenCalledWith("https://aboudjafar.github.io/BirthdayManu/#/");
  });

  it("signale une copie impossible sans laisser de champ temporaire", async () => {
    await expect(copyPublicQuizLink()).rejects.toThrow("Copie manuelle");
    expect(document.querySelector("textarea")).toBeNull();
  });
});

describe("capture locale de la carte", () => {
  it("capture seulement la cible, attend les polices et produit un fichier PNG", async () => {
    vi.stubGlobal("navigator", originalNavigator);
    let resolveFonts!: () => void;
    Object.defineProperty(document, "fonts", { configurable: true, value: { ready: new Promise<void>((resolve) => { resolveFonts = resolve; }) } });
    const target = document.createElement("div");
    target.innerHTML = '<h2 id="nom">Élodie</h2><p>80 %</p>';
    document.body.append(target);
    const privateElement = document.createElement("p");
    privateElement.textContent = "Une lettre privée à ne pas capturer";
    document.body.append(privateElement);
    vi.mocked(toBlob).mockImplementation(async (card) => {
      expect(card.textContent).toContain("Élodie");
      expect(card.textContent).toContain("80 %");
      expect(card.textContent).not.toContain("lettre privée");
      expect(card.querySelector("[id]")).toBeNull();
      return new Blob(["image"], { type: "image/png" });
    });
    const pending = createResultImage(target, "Élodie A.");
    expect(toBlob).not.toHaveBeenCalled();
    resolveFonts();
    const file = await pending;
    expect(file.name).toBe("quiz-manuella-elodie-a.png");
    expect(file.type).toBe("image/png");
    expect(toBlob).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ pixelRatio: 2, width: 400, cacheBust: false }));
    expect(document.body.children).toHaveLength(2);
  });

  it("nettoie la carte temporaire si la création échoue", async () => {
    vi.mocked(toBlob).mockResolvedValue(null);
    const target = document.createElement("div");
    await expect(createResultImage(target, "Alice")).rejects.toThrow("créée");
    expect(document.body.children).toHaveLength(0);
  });

  it("refuse un portrait cassé plutôt que de publier une carte sans image", async () => {
    const target = document.createElement("div");
    target.append(document.createElement("img"));
    await expect(createResultImage(target, "Alice")).rejects.toThrow("portrait");
    expect(toBlob).not.toHaveBeenCalled();
  });
});
