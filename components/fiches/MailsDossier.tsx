"use client";

import { useState } from "react";
import { Building2, Check, Copy, Mail, Stethoscope } from "lucide-react";
import { Card, Sheet } from "@/components/ui";
import { getAll } from "@/lib/store";
import { conseiller, nomConseiller } from "@/lib/equipe";
import { dateCourte } from "@/lib/format";
import { dossierDe } from "@/components/biens/dossier";
import { DIAGS, diagnosticsDe } from "@/components/diagnostics/diagnostics";
import type { Bien, Contact } from "@/lib/types";
import { nomPersonne, type Fiche, type Reponses } from "./fiche";

/* ============================================================
   Dossier de vente : les deux mails que le conseiller écrit à
   chaque nouveau mandat, préparés depuis le bien et la fiche
   vendeur (même tournure que ses mails habituels). Rien ne part
   seul : le mail s'ouvre prêt dans sa messagerie.
   ============================================================ */

/** Diagnostiqueur habituel de l'agence. */
const DIAGNOSTIQUEUR = { nom: "Diagnostics Conseils", mail: "contacts@diagnosticsconseils.fr" };

const signature = () => {
  const c = conseiller();
  return ["Cordialement,", "", nomConseiller() || "[Votre nom]", "Patrim", "45, Allées Jean Jaurès", "31000 TOULOUSE", "05.61.99.08.08", ...(c.tel ? [c.tel] : [])].join("\n");
};

/** Le vendeur : d'après la fiche reçue, sinon le premier propriétaire du bien. */
function vendeurDe(b: Bien, fiches: Fiche[]): { nom: string; r: Reponses } {
  const f = fiches.find((x) => x.kind === "vendeur" && x.reponses?.nom);
  if (f) return { nom: nomPersonne(f.reponses!).replace(/^Monsieur/, "M.").replace(/^Madame/, "Mme"), r: f.reponses! };
  const c = (getAll("contacts") as Contact[]).find((x) => x.id === b.vendeurIds?.[0]);
  const nom = c ? [c.civilite, c.prenom, c.nom && !c.nom.includes("[À compléter]") ? c.nom.toUpperCase() : ""].filter(Boolean).join(" ") : "";
  return { nom: nom || "[nom du propriétaire]", r: {} };
}

const nature = (b: Bien, r: Reponses) => {
  const t = r.bienNature?.toLowerCase() ?? (b.type === "maison" ? "maison" : b.type === "appartement" ? "appartement" : "bien");
  return t === "appartement" && b.pieces ? `appartement T${b.pieces}` : t;
};
const de = (n: string) => (/^[aeiouyhé]/i.test(n) ? `de l'${n}` : n === "maison" ? "de la maison" : `du ${n}`);

function mailSyndic(b: Bien, fiches: Fiche[]) {
  const { nom, r } = vendeurDe(b, fiches);
  const d = dossierDe(b) ?? {};
  const syndic = r.syndic || d.syndic || "";
  const a = r.bienAdresse || [b.adresse, [b.codePostal, b.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const lots = r.lots || d.lots;
  return {
    a: syndic.match(/[^\s<>(),;:]+@[^\s<>(),;:]+\.[a-z]{2,}/i)?.[0] ?? "",
    syndic,
    extranet: r.extranetSyndic,
    sujet: `${b.adresse || a} - Vente ${de(nature(b, r))} de ${nom} - Demande de documents`,
    texte: [
      "Bonjour,",
      "",
      `Je me permets de vous contacter, de la part de ${nom}, en qualité de négociateur au sein de l'agence Patrim, mandatée pour la vente de son ${nature(b, r)} situé au ${a}${lots ? ` (${lots})` : ""}.`,
      "",
      "Afin de constituer le dossier destiné à l'acquéreur et au notaire, pourriez-vous me transmettre :",
      "",
      "- les procès-verbaux des trois dernières assemblées générales,",
      "- les diagnostics de l'immeuble et le carnet d'entretien,",
      "- la fiche synthétique et le règlement de copropriété,",
      "- le plan pluriannuel de travaux ou le diagnostic technique global, s'ils existent,",
      "- le montant du fonds de travaux attaché au lot et les travaux votés non encore appelés,",
      "- les deux derniers décomptes de charges.",
      "",
      "Si certains de ces éléments donnent lieu à une facturation, je vous remercie de me l'indiquer au préalable.",
      "",
      "Je vous remercie par avance et reste à votre disposition.",
      "",
      signature(),
    ].join("\n"),
  };
}

function mailDiagnostics(b: Bien, fiches: Fiche[]) {
  const { nom, r } = vendeurDe(b, fiches);
  const d = dossierDe(b) ?? {};
  const a = r.bienAdresse || [b.adresse, [b.codePostal, b.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const lots = r.lots || d.lots;
  const diags = diagnosticsDe(b);
  const faits = DIAGS.filter((x) => diags[x.cle]?.date).map((x) => `- ${x.label} du ${dateCourte(diags[x.cle]!.date!)}`);
  const declares = !faits.length && r.diagnostics?.length ? r.diagnostics.map((x) => `- ${x}`) : [];
  const copro = nature(b, r).startsWith("appartement") || !!lots;
  const loue = r.occupation === "loue" || /lou/i.test(d.occupation ?? "");
  const annee = r.anneeConstruction ?? b.anneeConstruction;
  const chauffage = r.chauffage || b.chauffage;
  return {
    sujet: `Diagnostics vente – ${a} – ${nom}`,
    texte: [
      "Bonjour,",
      "",
      `Dans le cadre de la vente ${de(nature(b, r))} de ${nom}, situé au ${a}${lots ? ` (${lots})` : ""}, il faudrait procéder à la mise en place des diagnostics vente${copro ? " pour ce bien en copropriété" : ""}.`,
      "",
      ...(faits.length
        ? ["Diagnostics déjà réalisés, que je peux vous transmettre :", ...faits, ""]
        : declares.length
          ? ["D'après le propriétaire, ces diagnostics ont déjà été réalisés :", ...declares, ""]
          : ["Je n'ai pas connaissance de diagnostics déjà réalisés pour ce bien.", ""]),
      [annee ? `Le bien a été construit vers ${annee}.` : "", chauffage ? `Chauffage : ${chauffage}.` : ""].filter(Boolean).join(" "),
      "",
      "Pourriez-vous me confirmer la liste des diagnostics à réaliser ?",
      "",
      loue ? "Le bien est actuellement loué. Coordonnées du locataire : [À compléter]" : "Pour l'accès au bien : [À compléter : clés à l'agence ou rendez-vous avec le propriétaire]",
      "",
      "Je reste à votre disposition s'il vous manque des éléments.",
      "",
      signature(),
    ]
      .filter((x, i, t) => !(x === "" && t[i - 1] === ""))
      .join("\n"),
  };
}

type Mail = { titre: string; a: string; sujet: string; texte: string; note?: string };

/** Carte de la page « Fiche vendeur » : les mails du dossier de vente. */
export function MailsDossier({ b, fiches }: { b: Bien; fiches: Fiche[] }) {
  const [mail, setMail] = useState<Mail | null>(null);
  const [copie, setCopie] = useState(false);
  const ouvrirSyndic = () => {
    const m = mailSyndic(b, fiches);
    setMail({
      titre: "Demander au syndic",
      a: m.a,
      sujet: m.sujet,
      texte: m.texte,
      note: [
        m.extranet ? "Le vendeur a accès à l'espace en ligne de son syndic : demandez-lui d'abord, c'est souvent plus rapide." : "",
        !m.a ? (m.syndic ? `Adresse du syndic à compléter (dossier : ${m.syndic}).` : "Syndic inconnu : ajoutez son adresse dans le mail.") : "",
      ]
        .filter(Boolean)
        .join(" "),
    });
  };
  const ouvrirDiag = () => {
    const m = mailDiagnostics(b, fiches);
    setMail({ titre: "Commander les diagnostics", a: DIAGNOSTIQUEUR.mail, sujet: m.sujet, texte: m.texte, note: "Joignez les anciens rapports si vous les avez. Complétez les [À compléter] avant d'envoyer." });
  };
  return (
    <>
      <Card title="Dossier de vente">
        <p className="text-sm text-muted">Les mails que vous écrivez à chaque mandat, déjà rédigés avec le bien et la fiche du vendeur.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {b.type !== "maison" && b.type !== "terrain" && (
            <button type="button" className="btn-secondary !h-11 !justify-start" onClick={ouvrirSyndic}>
              <Building2 size={16} className="text-accent" /> Demander au syndic
            </button>
          )}
          <button type="button" className="btn-secondary !h-11 !justify-start" onClick={ouvrirDiag}>
            <Stethoscope size={16} className="text-accent" /> Commander les diagnostics
          </button>
        </div>
      </Card>
      {mail && (
        <Sheet open onClose={() => setMail(null)} title={mail.titre}>
          {mail.note && <p className="mb-3 rounded-xl bg-warn/10 px-3 py-2 text-xs">{mail.note}</p>}
          <div className="mb-2 text-xs text-muted">
            À : {mail.a || "à compléter"} · Objet : {mail.sujet}
          </div>
          <pre className="mb-3 whitespace-pre-wrap break-words rounded-xl bg-surface-2 px-4 py-3 font-sans text-[13px]">{mail.texte}</pre>
          <div className="grid grid-cols-2 gap-2">
            <a className="btn-primary !h-12" href={`mailto:${mail.a}?subject=${encodeURIComponent(mail.sujet)}&body=${encodeURIComponent(mail.texte)}`}>
              <Mail size={16} /> Ouvrir le mail
            </a>
            <button
              type="button"
              className="btn-secondary !h-12"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(mail.texte);
                  setCopie(true);
                  setTimeout(() => setCopie(false), 2000);
                } catch {
                  /* copie impossible : le texte reste affiché */
                }
              }}
            >
              {copie ? <Check size={16} className="text-ok" /> : <Copy size={16} />} {copie ? "Copié" : "Copier"}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
