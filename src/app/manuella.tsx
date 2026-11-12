import { useEffect, useRef, useState } from "react";
import { errorMessage, getManuellaContent } from "./api";
import { go, useApp } from "./App";
import { Avatar, SignatureFooter, Modal, confetti } from "./ui";

export function ManuellaScreen({ code }: { code: string }) {
  const { activateManuella, leaveManuella } = useApp();
  const [content, setContent] = useState<{ text: string; photoUrl?: string | undefined; bestScorePercent: number | null } | null>(null);
  const [opened, setOpened] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const stopConfetti = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setError("");
    getManuellaContent(code).then((value) => {
      if (!alive) return;
      if (!value) { leaveManuella(); go("/"); }
      else { activateManuella(code, value.bestScorePercent); setContent(value); }
    }).catch((reason: unknown) => { if (alive) setError(errorMessage(reason)); });
    return () => { alive = false; };
  }, [code, attempt, activateManuella, leaveManuella]);
  useEffect(() => () => { stopConfetti.current?.(); }, []);

  return (
    <div className="fixed inset-0 overflow-y-auto bg-night text-ink-foreground">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {Array.from({ length: 24 }, (_, i) => (
          <span key={i} className="absolute animate-twinkle text-gold" style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, animationDelay: `${(i % 7) * 0.35}s`, fontSize: 8 + (i % 4) * 5 }}>✦</span>
        ))}
      </div>
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 py-10 text-center">
        {error ? <div className="space-y-4"><p role="alert">{error}</p><button className="btn btn-gold" onClick={() => setAttempt((n) => n + 1)}>Réessayer</button></div> : !content ? (
          <p className="font-hand text-3xl" role="status">Chut… c'est privé</p>
        ) : (
          <>
            <Avatar n="private" size={170} priority className="animate-float" alt="Manuella, le cœur qui bat" />
            <p className="font-hand text-3xl text-gold">Joyeux anniversaire</p>
            <h1 className="text-5xl font-black italic">Manuella</h1>
            {!done ? (
              <button className="btn btn-gold text-lg" onClick={() => { setOpened(true); stopConfetti.current?.(); stopConfetti.current = confetti(60); }}>Ouvrir ma lettre</button>
            ) : (
              <div className="grid w-full gap-3">
                <button className="btn btn-primary text-lg" onClick={() => go("/quiz")}>Jouer au quiz</button>
                <button className="btn btn-ghost text-lg" onClick={() => go("/mur")}>Voir le mur de mes amies</button>
              </div>
            )}
          </>
        )}
        <SignatureFooter tone="night" />
      </div>
      {opened && content && (
        <Modal label="Lettre pour Manuella" tone="night" onClose={() => { setOpened(false); setDone(true); }}>
          <article className="space-y-4 pt-4">
            {content.photoUrl && <img src={content.photoUrl} alt="" className="w-full rounded-2xl border-2 border-gold" />}
            <p className="whitespace-pre-wrap font-display text-lg italic leading-relaxed">{content.text}</p>
            <p className="text-right text-4xl text-gold" aria-hidden>♥</p>
            <button className="btn btn-gold w-full" onClick={() => { setOpened(false); setDone(true); }}>Je garde ça dans mon cœur</button>
          </article>
        </Modal>
      )}
    </div>
  );
}
