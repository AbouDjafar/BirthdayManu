import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyPublicQuizLink, createResultImage, publicQuizUrl, resultShareData, sharePreparedResult } from "../app/share";

const image = new File(["png"], "resultat.png", { type: "image/png" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VITE_PUBLIC_SITE_URL", "");
  vi.stubGlobal("navigator", { share: undefined, canShare: undefined, clipboard: undefined });
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });
  window.history.replaceState(null, "", "#/m-code-tres-prive");
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("lien public et partage natif", () => {
  it("utilise le domaine Vercel configuré sans transmettre les paramètres ou le lien privé", () => {
    vi.stubEnv("VITE_PUBLIC_SITE_URL", "https://birthdaymanu.vercel.app/?token=secret#/m-secret");
    expect(publicQuizUrl()).toBe("https://birthdaymanu.vercel.app/#/");
    expect(resultShareData(60).url).toBe("https://birthdaymanu.vercel.app/#/");
  });
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

describe("carte locale indépendante des ressources réseau", () => {
  // A valid 1 x 1 PNG stands in for the browser encoder; drawing is inspected separately.
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0S0AAAAASUVORK5CYII=";
  let context: CanvasRenderingContext2D;
  let drawImage: ReturnType<typeof vi.fn>;
  let fillText: ReturnType<typeof vi.fn>;
  let exportPng: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    drawImage = vi.fn();
    fillText = vi.fn();
    context = {
      scale: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), arcTo: vi.fn(), closePath: vi.fn(),
      fill: vi.fn(), stroke: vi.fn(), arc: vi.fn(), save: vi.fn(), restore: vi.fn(), clip: vi.fn(),
      drawImage, fillText, measureText: (text: string) => ({ width: text.length * 8 }),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    exportPng = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(png);
  });

  it("produit immédiatement un PNG avec le vrai nom et le score malgré des polices bloquées et un portrait lent", async () => {
    Object.defineProperty(document, "fonts", { configurable: true, value: { ready: new Promise(() => {}) } });
    const target = document.createElement("div");
    const portrait = document.createElement("img");
    Object.defineProperty(portrait, "complete", { value: false });
    target.append(portrait);
    target.append(Object.assign(document.createElement("p"), { textContent: "Lettre privée à exclure" }));
    const file = await createResultImage(target, "Élodie A.", 80);
    expect(file.name).toBe("quiz-manuella-elodie-a.png");
    expect(file.type).toBe("image/png");
    expect(fillText).toHaveBeenCalledWith("Élodie A.", expect.any(Number), expect.any(Number), expect.any(Number));
    expect(fillText).toHaveBeenCalledWith("80 %", expect.any(Number), expect.any(Number), 132);
    expect(fillText).toHaveBeenCalledWith("M", expect.any(Number), expect.any(Number));
    expect(JSON.stringify(fillText.mock.calls)).not.toContain("Lettre privée");
    expect(drawImage).not.toHaveBeenCalled();
    const bytes = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(file);
    });
    expect(Array.from(new Uint8Array(bytes).slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(document.body.children).toHaveLength(0);
  });

  it("affiche zéro et génère la carte quand le portrait a échoué", async () => {
    const target = document.createElement("div");
    const portrait = document.createElement("img");
    Object.defineProperty(portrait, "complete", { value: true });
    target.append(portrait);
    await createResultImage(target, "Alice", 0);
    expect(fillText).toHaveBeenCalledWith("0 %", expect.any(Number), expect.any(Number), 132);
    expect(drawImage).not.toHaveBeenCalled();
    expect(exportPng).toHaveBeenCalledWith("image/png");
  });

  it("imprime la nouvelle adresse publique sur la carte sans le code privé", async () => {
    vi.stubEnv("VITE_PUBLIC_SITE_URL", "https://birthdaymanu.vercel.app/?token=secret#/m-secret");
    await createResultImage(document.createElement("div"), "Alice", 60);
    expect(fillText).toHaveBeenCalledWith("birthdaymanu.vercel.app/", expect.any(Number), expect.any(Number), 350);
    expect(JSON.stringify(fillText.mock.calls)).not.toContain("m-secret");
    expect(JSON.stringify(fillText.mock.calls)).not.toContain("token=secret");
  });

  it.each([
    { width: 84, height: 84, drawnWidth: 98, drawnHeight: 98 },
    { width: 320, height: 400, drawnWidth: 98, drawnHeight: 122.5 },
    { width: 400, height: 320, drawnWidth: 122.5, drawnHeight: 98 },
  ])("dessine tout le portrait disponible de $width × $height en conservant son ratio", async ({ width, height, drawnWidth, drawnHeight }) => {
    const target = document.createElement("div");
    const portrait = document.createElement("img");
    Object.defineProperties(portrait, { complete: { value: true }, naturalWidth: { value: width }, naturalHeight: { value: height } });
    target.append(portrait);
    await createResultImage(target, "Alice", 60);
    expect(drawImage).toHaveBeenCalledWith(portrait, 220 - drawnWidth / 2, 389 - drawnHeight / 2, drawnWidth, drawnHeight);
    expect(drawImage.mock.calls[0]).toHaveLength(5);
    expect(drawnWidth / drawnHeight).toBeCloseTo(width / height);
    expect(fillText).not.toHaveBeenCalledWith("M", expect.any(Number), expect.any(Number));
  });

  it("recrée une carte au monogramme si une image rend le canvas inexploitable", async () => {
    const target = document.createElement("div");
    const portrait = document.createElement("img");
    Object.defineProperties(portrait, { complete: { value: true }, naturalWidth: { value: 320 }, naturalHeight: { value: 320 } });
    target.append(portrait);
    exportPng.mockImplementationOnce(() => { throw new DOMException("Canvas tainted", "SecurityError"); });
    const file = await createResultImage(target, "Alice", 40);
    expect(file.type).toBe("image/png");
    expect(exportPng).toHaveBeenCalledTimes(2);
    expect(fillText).toHaveBeenCalledWith("M", expect.any(Number), expect.any(Number));
  });

  it("garde les trente caractères du prénom et espace les textes longs du score parfait du lien final", async () => {
    context.measureText = (text: string) => ({ width: text.length * Number(context.font.match(/(\d+)px/)?.[1] ?? 17) * 0.9 }) as TextMetrics;
    const name = "M".repeat(30);
    await createResultImage(document.createElement("div"), name, 100);
    const nameLines = fillText.mock.calls.filter((call) => call[2] === 94 || call[2] === 126);
    expect(nameLines).toHaveLength(2);
    expect(nameLines.map((call) => call[0]).join("")).toBe(name);
    expect(fillText).toHaveBeenCalledWith("100 %", expect.any(Number), expect.any(Number), 132);
    const callToAction = fillText.mock.calls.find((call) => String(call[0]).startsWith("À TON TOUR"))!;
    const footer = fillText.mock.calls.find((call) => String(call[0]).startsWith("aboudjafar.github.io"))!;
    const contentBaselines = fillText.mock.calls.filter((call) => call !== callToAction && call !== footer && Number(call[2]) >= 477).map((call) => Number(call[2]));
    expect(Number(callToAction[2]) - Math.max(...contentBaselines)).toBeGreaterThanOrEqual(45);
    expect(Number(footer[2]) - Number(callToAction[2])).toBeGreaterThanOrEqual(21);
    const canvas = exportPng.mock.contexts[0] as HTMLCanvasElement;
    expect(canvas.height / 2 - Number(footer[2])).toBeGreaterThanOrEqual(34);
  });

  it("signale une vraie erreur canvas sans attendre de ressources externes", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(createResultImage(document.createElement("div"), "Alice", 100)).rejects.toThrow("créée");
    expect(document.querySelector("canvas")).toBeNull();
  });
});
