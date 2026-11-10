import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles.css";

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() {
    if (this.state.failed) return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
        <h1 className="text-3xl font-bold">Petit contretemps…</h1>
        <p>La page a besoin d’un nouveau départ. Tes données enregistrées sont conservées.</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Recharger</button>
      </main>
    );
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><ErrorBoundary><App /></ErrorBoundary></StrictMode>,
);
