import { useCallback, useEffect, useRef, useState } from "react";
import questions from "./questions.json";
import { errorMessage, getMyBest, postManuellaMessage, postMessage, submitManuellaQuiz, submitQuiz } from "./api";
import { go, useApp } from "./App";
import { asset, MANUELLA_NAME, scoreTier } from "./storage";
import { Avatar, Modal, confetti } from "./ui";
import { ShareResult } from "./ShareResult";
import { beginQuiz, isRetryableError, readQuiz, saveAnswers, saveQuizResult, type QuizScope } from "./quizState";

export function Header() {
  const { manuella, leaveManuella } = useApp();
  return (
    <header className="flex flex-wrap items-center justify-between gap-2">
      <a href="#/" className="font-hand text-2xl text-ink">Manuella · 12.12</a>
      <a href="#/mur" className="btn btn-ghost min-h-11 px-4 text-sm">Le mur</a>
      {manuella && <button className="w-full text-right text-xs text-muted-foreground underline" onClick={() => { leaveManuella(); go("/"); }}>Quitter l’accès Manuella</button>}
    </header>
  );
}

export function HomeScreen() {
  const { player, setName, manuella, result } = useApp();
  const [best, setBest] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [name, setNameInput] = useState("");
  const valid = name.trim().length >= 2 && name.trim().length <= 30;
  const firstName = manuella ? MANUELLA_NAME : player?.firstName;
  const scope = manuella ? { owner: manuella.code, private: true } : player ? { owner: player.playerId, private: false } : null;
  const pending = scope ? readQuiz(scope).pending : null;
  const shownBest = manuella
    ? result ? Math.max(manuella.bestScorePercent ?? 0, result.bestScorePercent) : manuella.bestScorePercent
    : result ? Math.max(best ?? 0, result.bestScorePercent) : best;

  useEffect(() => {
    if (!player || manuella) return;
    let alive = true;
    setBest(null); setError("");
    getMyBest(player.playerId).then((value) => { if (alive) setBest(value?.bestScorePercent ?? null); })
      .catch((reason: unknown) => { if (alive) setError(errorMessage(reason)); });
    return () => { alive = false; };
  }, [player, manuella, attempt]);

  return (
    <>
      <Header />
      <section className="flex flex-1 flex-col items-center justify-center gap-6 py-8 text-center">
        <div className="relative">
          <div className="absolute -inset-4 -z-10 rotate-6 rounded-[2.5rem] bg-stripes opacity-90" aria-hidden />
          <Avatar n="welcome" size={190} priority className="animate-float" alt="Manuella qui t'accueille les bras ouverts" />
          <span className="absolute -right-6 -top-3 rotate-12 rounded-full border-2 border-ink bg-gold px-3 py-1 text-sm font-extrabold text-ink shadow-sticker">12 déc.</span>
        </div>
        <div className="animate-slide">
          <h1 className="font-black italic text-ink">
            <span className="block font-hand text-3xl font-medium not-italic text-primary">C'est mon anniversaire,</span>{" "}
            <span className="mb-1 mt-1 block text-lg font-bold not-italic text-muted-foreground">l'anniversaire de votre star</span>{" "}
            <span className="block text-6xl leading-none sm:text-7xl">Manuella</span>
          </h1>
        </div>
        {firstName ? (
          <div className="space-y-4">
            <p className="text-lg">{manuella ? "La star est dans la place : " : "Te revoilà, "}<strong>{firstName}</strong> !</p>
            {shownBest !== null && <p className="max-w-sm text-muted-foreground">Ton meilleur score : <strong className="text-primary">{shownBest} %</strong>. {shownBest === 100 ? "Un sans faute ! Même moi, je suis impressionnée." : "Alors, on tente de battre ton record ?"}</p>}
            {error && <div className="space-y-2"><p role="alert">{error}</p><button className="underline" onClick={() => setAttempt((n) => n + 1)}>Réessayer le chargement du score</button></div>}
            <button className="btn btn-primary w-full max-w-xs text-lg" onClick={() => go("/quiz")}>{pending ? "Reprendre mon quiz" : "Rejouer"}</button>
            {result && <a href="#/resultat" className="block text-sm font-bold underline">Retrouver mon résultat</a>}
            {!manuella && <button className="block w-full text-sm text-muted-foreground underline" onClick={() => setOpen(true)}>Ce n'est pas moi</button>}
            {manuella && <a className="block text-sm underline" href={`#/m-${encodeURIComponent(manuella.code)}`}>Relire ma lettre</a>}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="max-w-sm text-lg text-muted-foreground">5 questions pour voir si tu me connais <em>vraiment</em>. Révise tes souvenirs, pas Wikipédia. Je te réserve une surprise à la fin.</p>
            <button className="btn btn-primary w-full max-w-xs text-lg" onClick={() => setOpen(true)}>Je relève le défi</button>
          </div>
        )}
      </section>
      {open && (
        <Modal label="Ton prénom" onClose={() => setOpen(false)}>
          <form className="space-y-5 text-center" onSubmit={(event) => { event.preventDefault(); if (!valid) return; setName(name.trim()); go("/quiz"); }}>
            <Avatar n="thinking" size={96} className="mx-auto animate-pop" alt="" />
            <h2 className="text-3xl font-bold">À qui ai-je l'honneur ?</h2>
            <label htmlFor="firstName" className="sr-only">Ton prénom</label>
            <input id="firstName" data-autofocus value={name} maxLength={30} autoComplete="given-name" onChange={(event) => setNameInput(event.target.value)} placeholder="Ton prénom"
              className="h-14 w-full rounded-2xl border-[2.5px] border-ink bg-background px-4 text-center text-xl font-bold outline-none focus:border-primary" />
            <p className="text-sm text-muted-foreground">Entre 2 et 30 caractères. Tu peux ajouter l’initiale de ton nom.</p>
            <button type="submit" disabled={!valid} className="btn btn-primary w-full">C'est parti</button>
          </form>
        </Modal>
      )}
    </>
  );
}

const REACTIONS = ["Je t'écoute… sans souffler !", "Voyons si tu suis mes aventures…", "Là, je reconnais les vraies !", "Attention, dossier d'enfance !", "Dernière question, je retiens mon souffle !"];

export function QuizScreen() {
  const { player, manuella, setResult } = useApp();
  const scope: QuizScope = manuella ? { owner: manuella.code, private: true } : { owner: player?.playerId ?? "", private: false };
  const [pending, setPending] = useState(() => readQuiz(scope).pending ?? beginQuiz(scope));
  const [answers, setAnswers] = useState(pending.answers);
  const [i, setI] = useState(() => {
    const next = questions.findIndex(question => pending.answers[question.id] === undefined);
    return next < 0 ? questions.length - 1 : next;
  });
  const [picked, setPicked] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [retryableFailure, setRetryableFailure] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  const [slow, setSlow] = useState(false);
  const alive = useRef(true);
  const busy = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; if (timer.current) clearTimeout(timer.current); if (retryTimer.current) clearTimeout(retryTimer.current); };
  }, []);
  useEffect(() => { if (!player && !manuella) go("/"); }, [player, manuella]);
  const q = questions[i]!;

  const send = useCallback(async (values: Record<string, number>) => {
    if (busy.current) return;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    busy.current = true; setSending(true); setSlow(false); setError("");
    try {
      const result = manuella
        ? await submitManuellaQuiz(manuella.code, values, pending.attemptId)
        : await submitQuiz(player!.playerId, player!.firstName, values, pending.attemptId);
      const confirmed = saveQuizResult(scope, result, pending.attemptId);
      if (!alive.current) return;
      setResult(confirmed); go("/resultat");
    } catch (reason) {
      if (alive.current) {
        setError(errorMessage(reason)); setSending(false); setRetryableFailure(isRetryableError(reason));
        if (isRetryableError(reason)) {
          retryTimer.current = setTimeout(() => { if (alive.current && navigator.onLine) void send(values); }, Math.min(30_000, 5_000 * 2 ** retryCount.current++));
        }
      }
    } finally { busy.current = false; }
  }, [player, manuella, pending.attemptId, scope.owner, scope.private, setResult]);

  useEffect(() => {
    const values = readQuiz(scope).pending?.answers;
    if (values && Object.keys(values).length === questions.length) void send(values);
    const online = () => {
      const saved = readQuiz(scope).pending;
      if (saved?.attemptId === pending.attemptId && Object.keys(saved.answers).length === questions.length) void send(saved.answers);
    };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [send]);
  useEffect(() => {
    if (!sending) return;
    const slowTimer = setTimeout(() => setSlow(true), 8_000);
    return () => clearTimeout(slowTimer);
  }, [sending]);

  if (!player && !manuella) return null;

  const choose = (idx: number) => {
    if (picked !== null) return;
    setPicked(idx);
    const next = { ...answers, [q.id]: idx };
    setAnswers(next);
    saveAnswers(scope, { attemptId: pending.attemptId, answers: next });
    timer.current = setTimeout(() => {
      if (!alive.current) return;
      if (i < questions.length - 1) { setI(i + 1); setPicked(null); }
      else void send(next);
    }, 650);
  };

  return (
    <>
      <Header />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center opacity-60" aria-hidden>
        <Avatar n={q.avatar} size={160} className="animate-float" alt="" />
      </div>
      <Modal label={sending || error ? "Vérification des réponses" : `Question ${i + 1} sur ${questions.length}`}>
        {sending ? (
          <div className="space-y-4 py-8 text-center" role="status">
            <Avatar n="thinking" size={110} className="mx-auto animate-wiggle" alt="" />
            <p className="font-hand text-3xl">Je vérifie tes réponses…</p>
            {slow && <p className="text-sm text-muted-foreground">La connexion prend son temps. Tes réponses sont sauvegardées ; ton résultat arrivera dès que le réseau le permettra.</p>}
          </div>
        ) : error ? (
          <div className="space-y-4 py-4 text-center">
            <h2 className="text-2xl font-bold">Tes réponses sont bien gardées</h2>
            <p role="alert">{error}</p>
            <p className="text-sm text-muted-foreground">Tes réponses restent sauvegardées, même si tu recharges la page. Tu peux réessayer sans recommencer le quiz.</p>
            <button className="btn btn-primary w-full" onClick={() => void send(answers)}>Réessayer l’envoi</button>
            {!retryableFailure && <button className="w-full text-sm underline" onClick={() => {
              if (retryTimer.current) clearTimeout(retryTimer.current);
              retryCount.current = 0;
              setPending(beginQuiz(scope)); setAnswers({}); setI(0); setPicked(null); setError("");
            }}>Recommencer avec une nouvelle partie</button>}
            <button className="w-full text-sm underline" onClick={() => go("/")}>Revenir à l’accueil</button>
          </div>
        ) : (
          <div key={q.id} className="animate-slide space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={questions.length} aria-valuenow={i + 1} aria-label="Progression">
                {questions.map((_, k) => <span key={k} className={`h-2.5 flex-1 rounded-full border-2 border-ink ${k <= i ? "bg-candy" : "bg-muted"}`} />)}
              </div>
              <span className="text-sm font-extrabold">{i + 1}/{questions.length}</span>
            </div>
            <div className="flex items-center gap-4">
              <Avatar n={q.avatar} size={72} priority className="shrink-0 animate-pop" alt="" />
              <p className="font-hand text-2xl text-primary">{REACTIONS[i]}</p>
            </div>
            <h2 className="text-2xl font-bold leading-tight">{q.text}</h2>
            <div className="grid gap-3">
              {q.options.map((option, idx) => (
                <button key={option} disabled={picked !== null} onClick={() => choose(idx)}
                  className={`min-h-14 rounded-2xl border-[2.5px] border-ink px-4 text-left text-lg font-bold transition-all ${picked === idx ? "translate-x-1 bg-candy text-primary-foreground" : "bg-background"} ${picked !== null && picked !== idx ? "opacity-50" : ""}`}>
                  <span className="mr-2 font-display italic text-primary">{String.fromCharCode(65 + idx)}.</span>
                  <span className={picked === idx ? "text-primary-foreground" : ""}>{option}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export function ResultScreen() {
  const { result, player, manuella } = useApp();
  const resultCardRef = useRef<HTMLDivElement>(null);
  const firstName = manuella ? MANUELLA_NAME : player?.firstName ?? "Une amie";
  useEffect(() => { if (!result) go("/"); }, [result]);
  useEffect(() => {
    if (!result) return;
    return confetti(scoreTier(result.scorePercent).confetti);
  }, [result]);
  if (!result) return null;
  const n = result.scorePercent;
  const tier = scoreTier(result.scorePercent);
  const C = 2 * Math.PI * 70;
  return (
    <>
      <Header /><div className="flex-1" />
      <Modal label="Ton score">
        <div className="space-y-4 text-center">
          <div ref={resultCardRef} className="space-y-4 rounded-3xl bg-card p-2" aria-label="Carte de résultat">
          <p className="break-words font-hand text-3xl text-primary">{firstName}</p>
          <div className="relative mx-auto h-48 w-48">
            <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90" aria-hidden>
              <circle cx="80" cy="80" r="70" fill="none" stroke="var(--muted)" strokeWidth="14" />
              <circle cx="80" cy="80" r="70" fill="none" stroke="var(--primary)" strokeWidth="14" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - n / 100)} />
            </svg>
            <div className="absolute inset-0 grid place-items-center"><span className="font-display text-5xl font-black italic" aria-live="polite">{n}%</span></div>
          </div>
          <Avatar n={tier.avatar} size={84} priority className="mx-auto animate-pop" alt="La réaction de Manuella" />
          <h2 className="text-3xl font-black">{tier.title}</h2><p className="text-muted-foreground">{tier.text}</p>
          </div>
          {result.bestScorePercent > result.scorePercent && <p className="text-sm">Ton record reste <strong>{result.bestScorePercent} %</strong>.</p>}
          <ShareResult targetRef={resultCardRef} firstName={firstName} scorePercent={result.scorePercent} ready />
          <button className="btn btn-gold w-full text-lg" onClick={() => go("/surprise")}>Découvrir la surprise</button>
        </div>
      </Modal>
    </>
  );
}

export function SurpriseScreen() {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => revealed ? confetti(80) : undefined, [revealed]);
  return (
    <>
      <Header /><div className="flex-1" />
      <Modal label="La surprise">
        <div className="space-y-5 text-center">
          <h2 className="text-3xl font-black">Un petit cadeau pour toi</h2>
          <button onClick={() => setRevealed(true)} disabled={revealed}
            aria-label={revealed ? "Photo dévoilée" : "Touche pour dévoiler la photo"}
            className="relative mx-auto block aspect-[607/1080] max-h-[55dvh] w-full max-w-[15rem] overflow-hidden rounded-[1.75rem] border-[3px] border-ink bg-card shadow-sticker disabled:opacity-100">
            <img src={asset("assets/surprise.webp")} srcSet={`${asset("assets/surprise-360.webp")} 360w, ${asset("assets/surprise.webp")} 607w`} sizes="240px" width={607} height={1080} loading="lazy" decoding="async" alt="Photo surprise de Manuella" className={`h-full w-full object-contain ${revealed ? "animate-unblur" : "scale-110 blur-2xl saturate-50"}`} />
            {!revealed && <span className="absolute inset-0 grid place-items-center bg-ink/30"><span className="rounded-full border-2 border-ink bg-card px-5 py-3 font-extrabold text-ink shadow-sticker animate-wiggle">Touche pour dévoiler</span></span>}
          </button>
          {revealed && <p className="animate-slide font-hand text-3xl leading-tight text-primary">Merci d'être là pour moi. Tu as survécu à mon quiz : tu mérites bien cette petite exclusivité !</p>}
          <button className="btn btn-primary w-full" disabled={!revealed} onClick={() => go("/mot")}>Me laisser un mot</button>
        </div>
      </Modal>
    </>
  );
}

export function NoteScreen() {
  const { player, manuella } = useApp();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  const busy = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!player && !manuella) go("/"); }, [player, manuella]);
  if (!player && !manuella) return null;
  const left = 280 - body.length;
  return (
    <>
      <Header /><div className="flex-1" />
      <Modal label="Laisser un mot">
        <form className="space-y-4" onSubmit={async (event) => {
          event.preventDefault();
          if (!body.trim() || busy.current) return;
          busy.current = true; setSending(true); setError("");
          try {
            if (manuella) await postManuellaMessage(manuella.code, body.trim());
            else await postMessage(player!.playerId, player!.firstName, body.trim());
            if (alive.current) go("/mur");
          } catch (reason) { if (alive.current) setError(errorMessage(reason)); }
          finally { busy.current = false; if (alive.current) setSending(false); }
        }}>
          <div className="flex items-center gap-3">
            <Avatar n="note" size={64} className="animate-pop" alt="" />
            <h2 className="text-2xl font-black leading-tight">À ton tour de me faire sourire</h2>
          </div>
          <label htmlFor="note" className="text-sm font-bold">Ton message (il sera visible sur le mur)</label>
          <textarea id="note" data-autofocus rows={5} maxLength={280} value={body} disabled={sending} onChange={(event) => setBody(event.target.value)}
            placeholder="Joyeux anniversaire ma belle…" className="w-full resize-none rounded-2xl border-[2.5px] border-ink bg-background p-4 text-lg outline-none focus:border-primary" />
          <p className={`text-right text-sm font-bold ${left < 20 ? "text-primary" : "text-muted-foreground"}`} aria-live="polite">{left} caractères restants</p>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={!body.trim() || sending} className="btn btn-primary w-full">{sending ? "Envoi…" : error ? "Réessayer l’envoi" : "Envoyer"}</button>
          <button type="button" disabled={sending} onClick={() => go("/mur")} className="block w-full py-2 text-center text-muted-foreground underline">Passer cette étape</button>
        </form>
      </Modal>
    </>
  );
}
