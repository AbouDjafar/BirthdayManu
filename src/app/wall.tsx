import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, getLeaderboard, getMessages, subscribeToWall, type LeaderboardEntry, type WallMessage } from "./api";
import { go } from "./App";
import { Avatar, Modal } from "./ui";

const tilt = ["-rotate-1", "rotate-1", "-rotate-2", "rotate-2"];
const time = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
type Status = "connecting" | "live" | "polling" | "offline";
const statusLabels: Record<Status, string> = {
  connecting: "Connexion en cours…",
  live: "en direct",
  polling: "actualisé toutes les 15 secondes",
  offline: "connexion interrompue",
};
const sameMessage = (a: WallMessage, b: WallMessage) => a.createdAt === b.createdAt && a.firstName === b.firstName && a.body === b.body;

export function WallScreen() {
  const [board, setBoard] = useState<LeaderboardEntry[] | null>(null);
  const [msgs, setMsgs] = useState<WallMessage[] | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Status>("connecting");
  const [open, setOpen] = useState<WallMessage | null>(null);
  const alive = useRef(false);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const [ranking, messages] = await Promise.all([getLeaderboard(), getMessages()]);
      if (!alive.current || current !== generation.current) return;
      setBoard(ranking); setMsgs(messages); setError("");
      setOpen((previous) => previous && messages.some((message) => sameMessage(message, previous)) ? previous : null);
    } catch (reason) {
      if (alive.current && current === generation.current) setError(errorMessage(reason));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const unsubscribe = subscribeToWall(() => { void refresh(); }, (next) => {
      if (alive.current && next in statusLabels) setStatus(next as Status);
    });
    return () => { alive.current = false; generation.current++; unsubscribe(); };
  }, [refresh]);

  return (
    <>
      <header className="flex items-center justify-between">
        <a href="#/" className="font-hand text-2xl">Manuella · 12.12</a>
        <button className="btn btn-primary min-h-11 px-4 text-sm" onClick={() => go("/quiz")}>Jouer</button>
      </header>
      <div className="mt-6 flex items-end gap-3">
        <Avatar n="wall" size={80} className="animate-float" alt="" />
        <div>
          <h1 className="text-4xl font-black italic">Le mur</h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><span className={`h-2 w-2 rounded-full ${error || status === "offline" ? "bg-muted-foreground" : "animate-pulse bg-primary"}`} />{statusLabels[error ? "offline" : status]}</p>
        </div>
      </div>
      {(error || status === "offline") && <div className="mt-4 space-y-2 rounded-2xl border-2 border-ink bg-card p-4">
        <p role="alert">{error || "Le mur ne peut pas s’actualiser pour le moment."}</p>
        <button className="font-bold underline" onClick={() => void refresh()}>Réessayer le chargement du mur</button>
      </div>}
      <section className="mt-6 rounded-[1.75rem] border-[2.5px] border-ink bg-card p-5 shadow-sticker" aria-labelledby="lb">
        <h2 id="lb" className="mb-3 text-xl font-bold">Le classement de mon fan club</h2>
        {!board ? <p className="text-muted-foreground">{error ? "Classement indisponible." : "Chargement…"}</p> : board.length === 0 ? <p className="text-muted-foreground">La première place est libre. Je dis ça, je ne dis rien…</p> : (
          <ol className="space-y-2">
            {board.map((person, i) => (
              <li key={`${i}-${person.firstName}-${person.updatedAt}`} className="flex animate-slide items-center gap-3 rounded-2xl bg-muted px-4 py-3">
                <span className="w-7 text-center text-lg font-black">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <span className="block break-words font-bold">{person.firstName}</span>
                  {person.attempts > 1 && <span title={`${person.attempts} tentatives`} className="mt-1 inline-block max-w-full rounded-xl border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-semibold leading-4 text-primary">A rejoué plusieurs fois</span>}
                </div>
                <span className="shrink-0 font-display text-xl font-black italic text-primary">{person.bestScorePercent}%</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="mt-8" aria-labelledby="mots">
        <h2 id="mots" className="mb-4 text-xl font-bold">Vos petits mots, mes grands sourires</h2>
        {!msgs ? <p className="text-muted-foreground">{error ? "Messages indisponibles." : "Chargement…"}</p> : msgs.length === 0 ? <p className="text-muted-foreground">Je fais semblant d'être patiente… Qui m'écrit le premier petit mot ?</p> : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {msgs.map((message, i) => (
              <li key={`${message.createdAt}-${i}`} className={tilt[i % 4]}>
                <button onClick={() => setOpen(message)} className="w-full rounded-3xl border-[2.5px] border-ink bg-card p-5 text-left shadow-sticker">
                  <p className="line-clamp-4 break-words text-lg">{message.body}</p>
                  <p className="mt-3 font-hand text-2xl text-primary">— {message.firstName}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {open && <Modal label={`Mot de ${open.firstName}`} onClose={() => setOpen(null)}>
        <div className="space-y-4 pt-2">
          <p className="whitespace-pre-wrap break-words text-xl leading-relaxed">{open.body}</p>
          <p className="font-hand text-3xl text-primary">— {open.firstName}</p>
          <p className="text-sm text-muted-foreground">{time(open.createdAt)}</p>
        </div>
      </Modal>}
    </>
  );
}
