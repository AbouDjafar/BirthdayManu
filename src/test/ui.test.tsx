import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Avatar, Modal, SIGNATURE, SignatureFooter } from "../app/ui";

afterEach(cleanup);

describe("éléments partagés", () => {
  it.each(["light", "night"] as const)("garde la signature sur la page et hors du modal %s", (tone) => {
    render(<><SignatureFooter /><Modal label="Un petit mot" tone={tone}><p>Le contenu de la fenêtre</p></Modal></>);
    const dialog = screen.getByRole("dialog", { name: "Un petit mot" });
    expect(within(dialog).getByText("Le contenu de la fenêtre")).toBeInTheDocument();
    expect(within(dialog).queryByText(SIGNATURE)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("contentinfo")).not.toBeInTheDocument();
    expect(within(screen.getByRole("contentinfo")).getByText(SIGNATURE)).toBeInTheDocument();
  });

  it("donne la priorité aux portraits visibles et diffère les autres", () => {
    const view = render(<Avatar n="welcome" size={190} priority />);
    expect(screen.getByRole("img")).toHaveAttribute("loading", "eager");
    expect(screen.getByRole("img")).toHaveAttribute("fetchpriority", "high");
    expect(screen.getByRole("img")).toHaveAttribute("width", "190");
    expect(screen.getByRole("img")).toHaveAttribute("height", "190");
    view.rerender(<Avatar n="thinking" />);
    expect(screen.getByRole("img")).toHaveAttribute("loading", "lazy");
    expect(screen.getByRole("img")).toHaveAttribute("fetchpriority", "auto");
  });

  it("remplace un portrait en panne sans retirer son alternative accessible puis peut en charger un autre", () => {
    const view = render(<Avatar n="welcome" alt="Manuella souriante" size={190} />);
    fireEvent.error(screen.getByRole("img", { name: "Manuella souriante" }));
    expect(screen.getByRole("img", { name: "Manuella souriante" })).toHaveTextContent("M");
    expect(screen.getByRole("img")).toHaveStyle({ width: "190px", height: "190px" });
    view.rerender(<Avatar n="thinking" alt="Manuella réfléchit" />);
    expect(screen.getByRole("img", { name: "Manuella réfléchit" }).tagName).toBe("IMG");
  });

  it("retente le portrait après une reconnexion", () => {
    render(<Avatar n="welcome" alt="Manuella" />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img").tagName).toBe("SPAN");
    fireEvent(window, new Event("online"));
    expect(screen.getByRole("img").tagName).toBe("IMG");
  });
});
