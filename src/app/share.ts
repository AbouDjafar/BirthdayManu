import { toBlob } from "html-to-image";

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

function imageReady(image: HTMLImageElement): Promise<void> {
  if (image.complete) {
    return image.naturalWidth > 0
      ? Promise.resolve()
      : Promise.reject(new Error("Le portrait n’a pas pu être chargé."));
  }
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      image.removeEventListener("load", loaded);
      image.removeEventListener("error", failed);
      if (error) reject(error); else resolve();
    };
    const loaded = () => finish();
    const failed = () => finish(new Error("Le portrait n’a pas pu être chargé."));
    const timeout = setTimeout(() => finish(new Error("Le portrait met trop de temps à charger.")), 12_000);
    image.addEventListener("load", loaded, { once: true });
    image.addEventListener("error", failed, { once: true });
    // A lazy portrait can be outside the visible part of the result modal.
    image.loading = "eager";
  });
}

/** Render locally in the browser; no screenshot service receives the result or identity. */
export async function createResultImage(target: HTMLElement, firstName: string): Promise<File> {
  await document.fonts?.ready;
  await Promise.all(Array.from(target.querySelectorAll("img"), imageReady));

  // A separate, measured card avoids capturing scrollbars, buttons or private page content.
  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  container.style.cssText = "position:fixed;left:-10000px;top:0;pointer-events:none;";
  const card = document.createElement("div");
  const measuredWidth = target.getBoundingClientRect().width || target.scrollWidth || 360;
  const width = Math.min(440, Math.max(280, Math.ceil(measuredWidth) + 40));
  card.style.cssText = `width:${width}px;box-sizing:border-box;padding:20px;background:var(--card,#fffaf3);color:var(--ink,#242c50);border:2px solid var(--ink,#242c50);border-radius:24px;overflow:hidden;`;
  const copy = target.cloneNode(true) as HTMLElement;
  copy.style.width = "100%";
  copy.style.maxWidth = "none";
  copy.style.margin = "0";
  for (const element of [copy, ...copy.querySelectorAll<HTMLElement>("*")]) {
    element.removeAttribute("id");
    element.style.animation = "none";
    element.style.transition = "none";
  }
  card.append(copy);
  container.append(card);
  document.body.append(container);
  try {
    await Promise.all(Array.from(card.querySelectorAll("img"), imageReady));
    const blob = await toBlob(card, { pixelRatio: 2, width, cacheBust: false, preferredFontFormat: "woff2" });
    if (!blob) throw new Error("La carte n’a pas pu être créée.");
    const name = firstName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "participante";
    return new File([blob], `quiz-manuella-${name.toLowerCase()}.png`, { type: "image/png" });
  } finally {
    container.remove();
  }
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
