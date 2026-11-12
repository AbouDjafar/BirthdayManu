import { useEffect, useState, type RefObject } from "react";
import { copyPublicQuizLink, createResultImage, downloadResultImage, publicQuizUrl, sharePreparedResult } from "./share";

type Props = {
  targetRef: RefObject<HTMLElement | null>;
  firstName: string;
  scorePercent: number;
  ready: boolean;
};

export function ShareResult({ targetRef, firstName, scorePercent, ready }: Props) {
  const identity = `${firstName}\u0000${scorePercent}`;
  const [prepared, setPrepared] = useState<{ identity: string; file: File } | null>(null);
  const file = prepared?.identity === identity ? prepared.file : null;
  const [preparing, setPreparing] = useState(false);
  const [captureError, setCaptureError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState("");
  const [manualCopy, setManualCopy] = useState(false);

  useEffect(() => {
    if (!ready || !targetRef.current) return;
    let alive = true;
    let generation = 0;
    const target = targetRef.current;
    const prepare = () => {
      const current = ++generation;
      setPreparing(true); setCaptureError(false);
      // This draws the score immediately; photo/font/network readiness is optional.
      void createResultImage(target, firstName, scorePercent)
        .then((image) => { if (alive && current === generation) setPrepared({ identity, file: image }); })
        .catch(() => { if (alive && current === generation) setCaptureError(true); })
        .finally(() => { if (alive && current === generation) setPreparing(false); });
    };
    const reconnect = () => {
      for (const portrait of target.querySelectorAll("img")) {
        if (portrait.complete && !portrait.naturalWidth && portrait.src) portrait.src = portrait.currentSrc || portrait.src;
      }
      prepare();
    };
    const portraitLoaded = (event: Event) => {
      if (event.target instanceof HTMLImageElement) prepare();
    };
    setMessage("");
    prepare();
    // load does not bubble. Capture also handles an img reinserted after Avatar's fallback.
    target.addEventListener("load", portraitLoaded, true);
    window.addEventListener("online", reconnect);
    return () => {
      alive = false;
      target.removeEventListener("load", portraitLoaded, true);
      window.removeEventListener("online", reconnect);
    };
  }, [targetRef, firstName, scorePercent, identity, ready, attempt]);

  const copy = async () => {
    try { await copyPublicQuizLink(); setManualCopy(false); setMessage("Le lien public du quiz est copié."); }
    catch { setManualCopy(true); setMessage("Sélectionne le lien ci-dessous pour le copier."); }
  };

  const download = () => {
    if (!file) return;
    try { downloadResultImage(file); setMessage("Ta carte est téléchargée. Ajoute le lien du quiz à ton partage."); }
    catch { setMessage("Le téléchargement est indisponible dans ce navigateur. Essaie le partage ou copie le lien."); }
  };

  const share = async () => {
    setSharing(true); setMessage("");
    try {
      // Do not await capture or clipboard before this call: native sharing needs the click.
      const result = await sharePreparedResult(file, scorePercent);
      if (result === "unavailable") {
        if (file) downloadResultImage(file);
        try {
          await copyPublicQuizLink();
          setManualCopy(false);
          setMessage(file ? "Ta carte est téléchargée et le lien public est copié. Tu peux les envoyer à tes amies." : "Le lien public est copié. Tu peux l’envoyer à tes amies.");
        } catch {
          setManualCopy(true);
          setMessage(file ? "Ta carte est téléchargée. Copie le lien ci-dessous pour l’envoyer avec ta carte." : "Copie le lien ci-dessous pour inviter tes amies.");
        }
      } else if (result === "text") {
        setMessage(file ? "Le message et le lien sont partagés. Télécharge la carte pour la joindre si besoin." : "Le message et le lien sont partagés.");
      } else if (result === "image") {
        setMessage("Ta carte, le message et le lien sont prêts dans le partage.");
      }
    } catch {
      setMessage("Le partage n’a pas abouti. Tu peux réessayer, télécharger la carte ou copier le lien.");
    } finally { setSharing(false); }
  };

  return (
    <div className="space-y-3 border-t border-border pt-4 text-center">
      <button type="button" className="btn btn-primary w-full" disabled={!ready || sharing} onClick={() => void share()}>
        {sharing ? "Ouverture du partage…" : "Partager mon résultat"}
      </button>
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-3 text-sm">
        <button type="button" className="min-h-11 underline disabled:opacity-50" disabled={!file} onClick={download}>Télécharger la carte</button>
        <button type="button" className="min-h-11 underline" onClick={() => void copy()}>Copier le lien</button>
      </div>
      {preparing && !file && <p role="status" className="text-sm text-muted-foreground">Ta carte de résultat se prépare. Tu peux déjà partager ton score et le lien.</p>}
      {captureError && !file && <div className="space-y-2 text-sm">
        <p role="status">La carte n’a pas pu être créée. Tu peux partager le message et le lien du quiz.</p>
        <button type="button" className="min-h-11 underline" onClick={() => setAttempt((value) => value + 1)}>Réessayer la création de la carte</button>
      </div>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      {manualCopy && <input aria-label="Lien public du quiz" className="w-full rounded-xl border border-border bg-background p-3 text-sm" value={publicQuizUrl()} readOnly onFocus={(event) => event.currentTarget.select()} />}
    </div>
  );
}
