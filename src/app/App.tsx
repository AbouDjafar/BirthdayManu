import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { loadManuellaCode, loadPlayer, saveManuellaCode, savePlayer, type Player } from "./storage";
import { errorMessage, getManuellaContent } from "./api";
import { HomeScreen, QuizScreen, ResultScreen, SurpriseScreen, NoteScreen } from "./screens";
import { WallScreen } from "./wall";
import { ManuellaScreen } from "./manuella";
import { SignatureFooter, Sparkles } from "./ui";
import { readQuiz } from "./quizState";

const ROUTES = ["/", "/quiz", "/resultat", "/surprise", "/mot", "/mur"];
export function go(path: string) { window.location.hash = `#${path}`; }
function readHash() { return window.location.hash.replace(/^#/, "") || "/"; }
function privateCode(path: string): string | null {
  const match = path.match(/^\/m-([^/]+)$/);
  if (!match) return null;
  try { return decodeURIComponent(match[1] ?? "") || null; } catch { return null; }
}
type Result = { scorePercent: number; bestScorePercent: number };
function savedResult() {
  const code = loadManuellaCode();
  const player = loadPlayer();
  const scope = code ? { owner: code, private: true } : player ? { owner: player.playerId, private: false } : null;
  return scope ? readQuiz(scope).result : null;
}
type ManuellaSession = { code: string; bestScorePercent: number | null };
type Ctx = {
  player: Player | null;
  setName: (name: string) => Player;
  result: Result | null;
  setResult: (result: Result | null) => void;
  manuella: ManuellaSession | null;
  activateManuella: (code: string, best: number | null) => void;
  leaveManuella: () => void;
};
const AppCtx = createContext<Ctx>(null!);
export const useApp = () => useContext(AppCtx);

export function App() {
  const [path, setPath] = useState(readHash);
  const [player, setPlayer] = useState<Player | null>(loadPlayer);
  const [result, setResult] = useState<Result | null>(savedResult);
  const [manuella, setManuella] = useState<ManuellaSession | null>(() => {
    const code = loadManuellaCode();
    const cached = savedResult();
    return code && cached && readHash() === "/resultat" ? { code, bestScorePercent: cached.bestScorePercent } : null;
  });
  const [restoreCode, setRestoreCode] = useState(() => privateCode(readHash()) || (readHash() === "/resultat" && savedResult()) ? null : loadManuellaCode());
  const [restoreError, setRestoreError] = useState("");
  const [restoreAttempt, setRestoreAttempt] = useState(0);

  useEffect(() => {
    const on = () => { setPath(readHash()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const activateManuella = useCallback((code: string, best: number | null) => {
    saveManuellaCode(code);
    setManuella({ code, bestScorePercent: best });
    setResult(readQuiz({ owner: code, private: true }).result);
  }, []);
  const leaveManuella = useCallback(() => {
    saveManuellaCode(null); setManuella(null); setRestoreCode(null);
    const friend = loadPlayer();
    setResult(friend ? readQuiz({ owner: friend.playerId, private: false }).result : null);
  }, []);
  const setName = useCallback((name: string) => {
    const p = savePlayer(name, true); setPlayer(p); setResult(null); return p;
  }, []);
  useEffect(() => {
    if (privateCode(path)) setRestoreCode(null);
  }, [path]);
  useEffect(() => {
    if (!restoreCode) return;
    let alive = true;
    setRestoreError("");
    getManuellaContent(restoreCode).then((content) => {
      if (!alive) return;
      if (content) activateManuella(restoreCode, content.bestScorePercent);
      else saveManuellaCode(null);
      setRestoreCode(null);
    }).catch((error: unknown) => { if (alive) setRestoreError(errorMessage(error)); });
    return () => { alive = false; };
  }, [restoreCode, restoreAttempt, activateManuella]);

  const ctx = useMemo(() => ({ player, setName, result, setResult, manuella, activateManuella, leaveManuella }),
    [player, setName, result, manuella, activateManuella, leaveManuella]);
  const code = privateCode(path);
  const known = code !== null || ROUTES.includes(path);
  useEffect(() => { if (!known) go("/"); }, [known]);

  let screen = <HomeScreen />;
  if (restoreCode) screen = (
    <div className="my-auto space-y-4 py-12 text-center">
      {restoreError ? <><p role="alert">{restoreError}</p><button className="btn btn-primary" onClick={() => setRestoreAttempt((n) => n + 1)}>Réessayer</button><button className="block w-full underline" onClick={() => { leaveManuella(); go("/"); }}>Revenir à l’accueil</button></> : <p role="status">On retrouve ta place, Manuella…</p>}
    </div>
  );
  else if (code !== null) screen = <ManuellaScreen key={code} code={code} />;
  else if (path === "/quiz") screen = <QuizScreen />;
  else if (path === "/resultat") screen = <ResultScreen />;
  else if (path === "/surprise") screen = <SurpriseScreen />;
  else if (path === "/mot") screen = <NoteScreen />;
  else if (path === "/mur") screen = <WallScreen />;

  return (
    <AppCtx.Provider value={ctx}>
      <Sparkles />
      <main className="relative mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 pb-10 pt-6">
        {screen}
        <SignatureFooter />
      </main>
    </AppCtx.Provider>
  );
}
