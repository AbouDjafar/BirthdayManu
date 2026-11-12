import { scoreTier } from "./storage";

/** Never derive a share link from location.href: it can contain Manuella's private code. */
export function publicQuizUrl(origin = "https://aboudjafar.github.io", base = "/BirthdayManu/"): string {
  const path = new URL(base, `${origin}/`).pathname.replace(/\/?$/, "/");
  return `${origin}${path}#/`;
}

export function resultShareData(scorePercent: number): ShareData {
  return {
    title: "Le quiz de Manuella",
    text: `J'ai obtenu ${scorePercent} % au quiz de Manuella. Et toi, tu me bats ?`,
    url: publicQuizUrl(),
  };
}

const CARD_WIDTH = 440;
const CARD_HEIGHT = 680;
const INK = "#242c50";
const PINK = "#d53175";
const CREAM = "#fffaf3";

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function textLines(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) { lines.push(line); line = word; }
    else line = candidate;
    // Names can contain thirty characters without spaces. Keep them legible too.
    if (context.measureText(line).width > maxWidth) {
      let segment = "";
      for (const character of line) {
        if (segment && context.measureText(segment + character).width > maxWidth) { lines.push(segment); segment = character; }
        else segment += character;
      }
      line = segment;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Only read a portrait already available in the result card. Never start or await a request. */
function availablePortrait(target: HTMLElement): HTMLImageElement | null {
  return Array.from(target.querySelectorAll("img")).find((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) ?? null;
}

function drawResultCard(firstName: string, scorePercent: number, portrait: HTMLImageElement | null): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH * 2;
  canvas.height = CARD_HEIGHT * 2;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("La carte n’a pas pu être créée dans ce navigateur.");
  const score = Number.isFinite(scorePercent) ? Math.max(0, Math.min(100, Math.round(scorePercent))) : 0;
  const tier = scoreTier(score);
  const middle = CARD_WIDTH / 2;
  let nameSize = 34;
  context.font = `italic bold ${nameSize}px Georgia, serif`;
  let names = textLines(context, firstName, 350);
  while (names.length > 2 && nameSize > 18) {
    nameSize -= 2;
    context.font = `italic bold ${nameSize}px Georgia, serif`;
    names = textLines(context, firstName, 350);
  }
  context.font = "bold 25px Georgia, serif";
  const titles = textLines(context, tier.title, 354);
  context.font = "17px Arial, sans-serif";
  const lines = textLines(context, tier.text, 344);
  const paragraphY = 477 + titles.length * 29 + 20;
  const callToActionY = Math.max(625, paragraphY + Math.max(0, lines.length - 1) * 24 + 45);
  const footerY = callToActionY + 21;
  const height = Math.max(CARD_HEIGHT, footerY + 34);
  // Reassigning height resets the canvas state; draw after measurement so long text
  // can extend the card instead of ever overlapping the call to action or the link.
  canvas.height = height * 2;
  context.scale(2, 2);

  context.fillStyle = "#f5d4df";
  context.fillRect(0, 0, CARD_WIDTH, height);
  context.fillStyle = INK;
  roundedRect(context, 20, 22, CARD_WIDTH - 36, height - 36, 28);
  context.fill();
  context.fillStyle = CREAM;
  roundedRect(context, 14, 14, CARD_WIDTH - 36, height - 36, 28);
  context.fill();
  context.strokeStyle = INK;
  context.lineWidth = 2.5;
  context.stroke();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = PINK;
  context.font = "bold 13px Arial, sans-serif";
  context.fillText("LE QUIZ DE MANUELLA", middle, 55);
  context.fillStyle = INK;
  context.font = `italic bold ${nameSize}px Georgia, serif`;
  names.forEach((line, index) => context.fillText(line, middle, names.length === 1 ? 108 : 94 + index * 32, 350));

  context.lineWidth = 15;
  context.strokeStyle = "#f2dce4";
  context.beginPath();
  context.arc(middle, 235, 77, 0, Math.PI * 2);
  context.stroke();
  if (score > 0) {
    context.strokeStyle = PINK;
    context.lineCap = "round";
    context.beginPath();
    context.arc(middle, 235, 77, -Math.PI / 2, -Math.PI / 2 + (score / 100) * Math.PI * 2);
    context.stroke();
  }
  context.fillStyle = INK;
  context.font = "italic bold 56px Georgia, serif";
  context.fillText(`${score} %`, middle, 232, 132);
  context.font = "bold 11px Arial, sans-serif";
  context.fillStyle = "#776573";
  context.fillText("MON SCORE", middle, 269);

  // The monogram is a complete card, including when the optional photo is still offline.
  context.save();
  context.beginPath();
  context.arc(middle, 389, 49, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = "#f7c3d7";
  context.fillRect(middle - 49, 340, 98, 98);
  if (portrait) {
    // naturalWidth is density-corrected for responsive images. Drawing the whole
    // image avoids treating those CSS dimensions as source bitmap coordinates.
    const aspect = portrait.naturalWidth / portrait.naturalHeight;
    const width = 98 * Math.max(1, aspect);
    const height = 98 * Math.max(1, 1 / aspect);
    context.drawImage(portrait, middle - width / 2, 389 - height / 2, width, height);
  } else {
    context.fillStyle = PINK;
    context.font = "italic bold 68px Georgia, serif";
    context.fillText("M", middle - 2, 390);
  }
  context.restore();
  context.beginPath();
  context.arc(middle, 389, 49, 0, Math.PI * 2);
  context.strokeStyle = INK;
  context.lineWidth = 2.5;
  context.stroke();

  context.fillStyle = INK;
  context.font = "bold 25px Georgia, serif";
  titles.forEach((line, index) => context.fillText(line, middle, 477 + index * 29, 354));
  context.font = "17px Arial, sans-serif";
  context.fillStyle = "#706575";
  lines.forEach((line, index) => context.fillText(line, middle, paragraphY + index * 24, 344));
  context.fillStyle = PINK;
  context.font = "bold 12px Arial, sans-serif";
  context.fillText("À TON TOUR : TU ME CONNAIS VRAIMENT ?", middle, callToActionY);
  context.fillStyle = INK;
  context.font = "11px Arial, sans-serif";
  context.fillText("aboudjafar.github.io/BirthdayManu/", middle, footerY);
  return canvas;
}

function pngBytes(canvas: HTMLCanvasElement): Uint8Array<ArrayBuffer> {
  const data = canvas.toDataURL("image/png");
  const prefix = "data:image/png;base64,";
  if (!data.startsWith(prefix)) throw new Error("La carte n’a pas pu être créée.");
  return Uint8Array.from(atob(data.slice(prefix.length)), (character) => character.charCodeAt(0));
}

/**
 * Render a standalone local card from the authoritative score, without fetching fonts,
 * cloning private DOM content or waiting for the optional portrait. A late portrait can
 * replace the monogram by calling this again; even a tainted image falls back safely.
 */
export async function createResultImage(target: HTMLElement, firstName: string, scorePercent: number): Promise<File> {
  const portrait = availablePortrait(target);
  let data: Uint8Array<ArrayBuffer>;
  try { data = pngBytes(drawResultCard(firstName, scorePercent, portrait)); }
  catch (error) {
    if (!portrait) throw error;
    data = pngBytes(drawResultCard(firstName, scorePercent, null));
  }
  const name = firstName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "participante";
  return new File([data], `quiz-manuella-${name.toLowerCase()}.png`, { type: "image/png" });
}

export type NativeShareResult = "image" | "text" | "unavailable" | "cancelled";

/** Called directly in a click handler, with the image already prepared, for user activation. */
export async function sharePreparedResult(file: File | null, scorePercent: number): Promise<NativeShareResult> {
  if (typeof navigator.share !== "function") return "unavailable";
  const data = resultShareData(scorePercent);
  let supportsFiles = false;
  if (file && typeof navigator.canShare === "function") {
    try { supportsFiles = navigator.canShare({ files: [file] }); } catch { /* Share text instead. */ }
  }
  try {
    await navigator.share(supportsFiles && file ? { ...data, files: [file] } : data);
    return supportsFiles ? "image" : "text";
  } catch (error) {
    if (error && typeof error === "object" && "name" in error && error.name === "AbortError") return "cancelled";
    throw error;
  }
}

export function downloadResultImage(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Give mobile browsers enough time to consume the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function copyPublicQuizLink(): Promise<void> {
  const url = publicQuizUrl();
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(url); return; } catch { /* Try the browser fallback. */ }
  }
  const previousFocus = document.activeElement as HTMLElement | null;
  const input = document.createElement("textarea");
  input.value = url;
  input.setAttribute("readonly", "");
  input.style.cssText = "position:fixed;left:-10000px;top:0;";
  document.body.append(input);
  input.select();
  try {
    if (!document.execCommand?.("copy")) throw new Error("Copie manuelle nécessaire.");
  } finally {
    input.remove();
    previousFocus?.focus();
  }
}
