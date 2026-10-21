"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { authHeaders } from "@/lib/ai";

/* Bouton « Enregistrer en PDF » des documents du Hub. Le PDF est fabriqué par le
   serveur (/api/pdf) à partir de la page affichée : même mise en page sur iPhone,
   Android et ordinateur, sans les marges que Safari ajoutait à l'impression.
   Si le serveur ne répond pas, on retombe sur l'impression du navigateur. */

let nomDocument = "";
/** Nom du fichier PDF du document affiché (le titre de l'onglet est remis à « PATRIM Hub » par l'appli). */
export function nommerPdf(nom: string) {
  nomDocument = nom;
  return nom;
}

/** Copie de la page telle qu'affichée, sans la barre d'outils ni les scripts. */
function instantane(): string {
  const doc = document.documentElement.cloneNode(true) as HTMLElement;
  doc.querySelectorAll("script, noscript, iframe, .no-print, nextjs-portal, link[rel='preload'][as='script'], link[rel='modulepreload']").forEach((n) => n.remove());
  const head = doc.querySelector("head");
  const base = document.createElement("base");
  base.href = window.location.origin + "/";
  head?.prepend(base);
  return "<!doctype html>" + doc.outerHTML;
}

async function fabriquer(nom: string): Promise<File> {
  const r = await fetch("/api/pdf", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ html: instantane(), nom }) });
  if (!r.ok || !(r.headers.get("content-type") ?? "").includes("pdf")) throw new Error("pdf");
  return new File([await r.blob()], `${nom}.pdf`, { type: "application/pdf" });
}

/** Sur téléphone : feuille de partage (Enregistrer dans Fichiers, Mail, WhatsApp…). Sinon : téléchargement. */
async function livrer(f: File) {
  const tactile = window.matchMedia("(pointer: coarse)").matches;
  if (tactile && navigator.canShare?.({ files: [f] })) {
    try {
      await navigator.share({ files: [f], title: f.name });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      if ((e as Error).name === "NotAllowedError") throw e; // le geste a expiré pendant la préparation : un second appui suffit
    }
  }
  const url = URL.createObjectURL(f);
  const a = document.createElement("a");
  a.href = url;
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function BoutonPdf({ nom, className, style, children }: { nom?: string; className?: string; style?: CSSProperties; children: ReactNode }) {
  const [etat, setEtat] = useState<"pret" | "prepa" | "relancer">("pret");
  const [fichier, setFichier] = useState<File | null>(null);

  async function clic() {
    if (etat === "prepa") return;
    if (etat === "relancer" && fichier) {
      setEtat("pret");
      await livrer(fichier).catch(() => {});
      return;
    }
    setEtat("prepa");
    let f: File;
    try {
      f = await fabriquer((nom || nomDocument || "Document PATRIM").trim());
    } catch {
      setEtat("pret");
      window.print();
      return;
    }
    try {
      await livrer(f);
      setEtat("pret");
    } catch {
      setFichier(f);
      setEtat("relancer");
    }
  }

  return (
    <button type="button" onClick={clic} aria-busy={etat === "prepa"} className={className} style={{ ...style, opacity: etat === "prepa" ? 0.75 : undefined }}>
      {etat === "prepa" ? "Préparation du PDF…" : etat === "relancer" ? "PDF prêt : ouvrir" : children}
    </button>
  );
}
