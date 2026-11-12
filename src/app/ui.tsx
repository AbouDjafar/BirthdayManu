import { useEffect, useRef, useState, type ReactNode } from "react";
import { avatar, avatarSrcSet } from "./storage";

export const SIGNATURE = "L'empereur Shah Jahan a construit le Taj-Mahal en plus de 22 ans pour sa bien aimée mais le Vizir a conçu cette oeuvre en moins de 22 jours pour sa dulcinée.";

export function SignatureFooter({ tone = "light" }: { tone?: "light" | "night" }) {
  return <footer className={`mx-auto mt-8 w-full max-w-lg border-t px-1 pt-5 text-center font-display text-xs italic leading-relaxed ${tone === "night" ? "border-gold/20 text-gold/75" : "border-border text-muted-foreground"}`}>
    <p>{SIGNATURE}</p>
  </footer>;
}

/** Accessible modal: bottom sheet on mobile, centered card on desktop. Esc closes, focus trapped. */
export function Modal({
  children, onClose, label, tone = "light",
}: { children: ReactNode; onClose?: () => void; label: string; tone?: "light" | "night" }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    const focusables = () =>
      [...el.querySelectorAll<HTMLElement>('button,[href],input,textarea,select,[tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute("disabled"));
    // Keep the result/name at the top even when the first action is lower down.
    (el.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0] ?? el).focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeRef.current) closeRef.current();
      if (e.key === "Tab") {
        const f = focusables();
        if (!f.length) { e.preventDefault(); el.focus(); return; }
        if (!el.contains(document.activeElement)) { e.preventDefault(); (e.shiftKey ? f[f.length - 1] : f[0])?.focus(); }
        else if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1]?.focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0]?.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus?.(); };
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 animate-fade bg-ink/40 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div
        ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
        className={`modal-scroll relative max-h-[92dvh] w-full animate-sheet overflow-y-auto rounded-t-[2rem] border-[2.5px] border-ink p-6 pb-8 shadow-soft sm:max-w-md sm:rounded-[2rem] ${tone === "night" ? "bg-night text-ink-foreground" : "bg-card"}`}
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-border sm:hidden" aria-hidden />
        {onClose && (
          <button onClick={onClose} aria-label="Fermer" className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full text-2xl leading-none">×</button>
        )}
        {children}
      </div>
    </div>
  );
}

export function Avatar({ n, size = 120, className = "", alt = "Manuella", priority = false }: { n: number | string; size?: number; className?: string; alt?: string; priority?: boolean }) {
  const source = avatar(n);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  useEffect(() => {
    const retry = () => setFailedSource(null);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);
  if (failedSource === source) return (
    <span
      role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}
      className={`grid shrink-0 place-items-center rounded-full border-[3px] border-ink bg-ink font-display text-4xl font-bold text-white shadow-sticker ${className}`}
      style={{ width: size, height: size }}
    >M</span>
  );
  return (
    <img
      src={source} srcSet={avatarSrcSet(n)} sizes={`${size}px`} alt={alt} width={size} height={size} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async"
      onError={() => setFailedSource(source)}
      className={`rounded-full border-[3px] border-ink bg-ink object-cover shadow-sticker ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function Sparkles() {
  const stars = [[8, 12], [85, 8], [18, 70], [92, 55], [50, 4], [70, 88], [4, 40]];
  return (
    <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
      {stars.map(([x, y], i) => (
        <span key={i} className="absolute animate-twinkle text-gold" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.4}s`, fontSize: 14 + (i % 3) * 8 }}>✦</span>
      ))}
    </div>
  );
}

/** Lightweight canvas confetti, disabled with prefers-reduced-motion. */
export function confetti(count = 120) {
  if (!count || typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = document.createElement("canvas");
  c.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:60";
  c.width = innerWidth; c.height = innerHeight;
  document.body.appendChild(c);
  const ctx = c.getContext("2d");
  if (!ctx) { c.remove(); return; }
  const colors = getComputedStyle(document.documentElement);
  const pal = ["--primary", "--gold", "--ink", "--blush"].map((v) => colors.getPropertyValue(v).trim());
  const ps = Array.from({ length: count }, () => ({
    x: c.width / 2 + (Math.random() - 0.5) * 80, y: c.height * 0.35,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
    r: Math.random() * 6 + 4, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3,
    col: pal[Math.floor(Math.random() * pal.length)], heart: Math.random() < 0.2,
  }));
  let t = 0;
  let frame = 0;
  const tick = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of ps) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.col ?? "#e84393";
      if (p.heart) { ctx.font = `${p.r * 3}px serif`; ctx.fillText("♥", 0, 0); } else ctx.fillRect(-p.r / 2, -p.r, p.r, p.r * 2);
      ctx.restore();
    }
    if (++t < 200) frame = requestAnimationFrame(tick); else c.remove();
  };
  tick();
  return () => { cancelAnimationFrame(frame); c.remove(); };
}
