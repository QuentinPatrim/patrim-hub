"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, FileText, Mail, RefreshCw, Share2, Sparkles } from "lucide-react";
import { Sheet, Spinner, cx } from "@/components/ui";
import { useCollection } from "@/lib/store";
import { titrePublic } from "@/lib/titrePublic";
import { gmailHref } from "@/components/matching/BrouillonMail";
import { rapportHebdo } from "./rapportHebdo";
import { ask } from "@/lib/ai";
import { dateCourte, eur, nomComplet } from "@/lib/format";
import type { Bien, Contact, Rdv } from "@/lib/types";
import { joursDepuis, mailHref, prixM2 } from "./utils";

type RdvCr = Rdv & { crDetail?: { ressenti?: string; positifs?: string; negatifs?: string; suite?: string } };

/** Rapport d'activité pour le vendeur, généré par l'IA, sans jamais révéler l'identité des visiteurs. */
export function RapportVendeur({ open, onClose, bien, visites, vendeurs, nbCompatibles, nbProposes }: { open: boolean; onClose: () => void; bien: Bien; visites: RdvCr[]; vendeurs: Contact[]; nbCompatibles: number; nbProposes: number }) {
  const [texte, setTexte] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copie, setCopie] = useState(false);
  const [mode, setMode] = useState<"semaine" | "ia">("semaine");
  const { items: contacts } = useCollection("contacts");
  const hebdo = useMemo(() => rapportHebdo({ bien, rdvs: visites, contacts, vendeurs }), [bien, visites, contacts, vendeurs]);
  const [texteHebdo, setTexteHebdo] = useState("");

  useEffect(() => {
    if (open) {
      setErr("");
      setCopie(false);
      setTexteHebdo(hebdo.texte);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hebdo.texte]);

  const faites = visites.filter((v) => v.statut !== "annule" && new Date(v.debut).getTime() < Date.now());
  const prevues = visites.filter((v) => v.statut === "prevu" && new Date(v.debut).getTime() >= Date.now());
  const jours = joursDepuis(bien.dateMiseEnVente);

  const generer = async () => {
    setBusy(true);
    setErr("");
    try {
      // Les visiteurs sont anonymisés : seule leur numérotation est transmise.
      const lignes = faites
        .slice()
        .sort((a, b) => a.debut.localeCompare(b.debut))
        .map((v, i) => {
          const d = v.crDetail ?? {};
          return [
            `Visite ${i + 1} (${dateCourte(v.debut)})`,
            v.avisClient ? `intérêt ${v.avisClient}/5` : "",
            d.ressenti ? `ressenti : ${d.ressenti}` : "",
            d.positifs ? `a aimé : ${d.positifs}` : "",
            d.negatifs ? `réserves : ${d.negatifs}` : "",
            v.suite ? `suite : ${v.suite}` : "",
            !d.positifs && !d.negatifs && v.compteRendu ? `notes : ${v.compteRendu.replace(/\n/g, " ; ")}` : "",
          ]
            .filter(Boolean)
            .join(" – ");
        });
      const pm2 = prixM2(bien);
      const salutation = vendeurs.length ? vendeurs.map((v) => [v.civilite, v.nom].filter(Boolean).join(" ") || nomComplet(v)).join(" et ") : "";
      const res = await ask({
        system:
          "Tu rédiges, pour un conseiller immobilier, le compte rendu d'activité envoyé au propriétaire vendeur d'un bien en vente. Ton professionnel, chaleureux, factuel et transparent. RÈGLES STRICTES : ne jamais mentionner le nom, le prénom, la profession, la situation familiale, le budget ou toute information permettant d'identifier un visiteur (parle de « un couple de visiteurs », « une visiteuse », « le visiteur n°2 »…) ; ne jamais mentionner de durée de visite ; ne rien inventer qui ne figure pas dans les données. Texte brut, sans markdown, prêt à coller dans un e-mail.",
        prompt: `Bien : ${bien.titre}${bien.quartier ? ` (${bien.quartier})` : ""}
Prix affiché : ${bien.prix ? eur(bien.prix) : "non renseigné"}${pm2 ? ` (${eur(pm2)}/m²)` : ""}
${jours != null ? `En vente depuis ${jours} jours.` : ""}
Visites réalisées : ${faites.length}
Visites programmées à venir : ${prevues.length}
Acquéreurs de notre fichier correspondant au bien : ${nbCompatibles}
Acquéreurs à qui le bien a été proposé directement : ${nbProposes}
${bien.annonceUrl ? "Annonce en ligne : oui" : ""}

Retours de visite (anonymisés) :
${lignes.length ? lignes.join("\n") : "Aucune visite réalisée pour l'instant."}

Rédige le compte rendu adressé au vendeur${salutation ? ` (${salutation})` : ""}, avec :
1. une courte introduction ;
2. l'activité (visites, intérêt suscité) ;
3. la synthèse des retours des visiteurs (points appréciés, réserves récurrentes) ;
4. 2 à 4 recommandations concrètes et argumentées (présentation, prix, disponibilités, travaux…) adaptées aux retours ;
5. la suite prévue et une formule de politesse signée « Quentin Delsol – PATRIM ».`,
      });
      setTexte(res.text.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "L'assistant n'a pas répondu.");
    } finally {
      setBusy(false);
    }
  };

  const emails = vendeurs.map((v) => v.email).filter(Boolean).join(",");
  const sujet = mode === "semaine" ? hebdo.sujet : `Point sur la commercialisation – ${titrePublic(bien)}`;
  const courant = mode === "semaine" ? texteHebdo : texte;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      wide
      title={
        <span className="inline-flex items-center gap-2">
          <FileText size={16} className="text-accent" /> Rapport vendeur
        </span>
      }
      footer={
        courant ? (
          <div className="flex flex-wrap gap-2 w-full justify-end">
            {mode === "ia" ? (
              <button className="btn-ghost btn-sm mr-auto" onClick={generer} disabled={busy}>
                {busy ? <Spinner /> : <RefreshCw size={14} />} Régénérer
              </button>
            ) : (
              <button className="btn-ghost btn-sm mr-auto" onClick={() => setTexteHebdo(hebdo.texte)}>
                <RefreshCw size={14} /> Rétablir
              </button>
            )}
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button className="btn-secondary btn-sm" onClick={() => navigator.share({ title: sujet, text: courant }).catch(() => {})}>
                <Share2 size={14} /> Partager
              </button>
            )}
            <a className="btn-secondary btn-sm" href={gmailHref(emails, sujet, courant)} target="_blank" rel="noreferrer">
              <Mail size={14} /> Gmail
            </a>
            <a className="btn-secondary btn-sm" href={mailHref(emails, sujet, courant)}>
              <Mail size={14} /> E-mail
            </a>
            <button
              className="btn-primary btn-sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(courant);
                  setCopie(true);
                  setTimeout(() => setCopie(false), 2000);
                } catch {}
              }}
            >
              <Copy size={14} /> {copie ? "Copié ✓" : "Copier"}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
        {(
          [
            ["semaine", "Point de la semaine"],
            ["ia", "Rapport rédigé (IA)"],
          ] as const
        ).map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)} className={cx("h-10 rounded-lg text-sm font-medium transition", mode === m ? "bg-surface shadow-sm text-fg" : "text-muted")}>
            {label}
          </button>
        ))}
      </div>
      {mode === "semaine" ? (
        <>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <Mini label="Visites (7 j)" value={hebdo.visites.length} />
            <Mini label="Demandes (7 j)" value={hebdo.demandes} />
            <Mini label="Proposé (7 j)" value={hebdo.proposes} />
          </div>
          <p className="mb-3 text-xs text-muted">
            Du {dateCourte(hebdo.debut)} au {dateCourte(hebdo.fin)} · visiteurs anonymes · complétez la ligne « [À compléter] » avant l&apos;envoi.
          </p>
          <textarea className="input min-h-[50dvh] text-sm leading-relaxed" value={texteHebdo} onChange={(e) => setTexteHebdo(e.target.value)} />
        </>
      ) : (
        <>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Mini label="Visites faites" value={faites.length} />
        <Mini label="À venir" value={prevues.length} />
        <Mini label="Acquéreurs ciblés" value={nbCompatibles} />
      </div>
      {texte ? (
        <textarea className="input min-h-[50vh] text-sm leading-relaxed" value={texte} onChange={(e) => setTexte(e.target.value)} />
      ) : (
        <div className="rounded-2xl border border-dashed border-line p-6 text-center">
          <p className="text-sm text-muted max-w-md mx-auto">
            L&apos;assistant rédige un point d&apos;activité pour votre vendeur à partir des visites et de leurs comptes rendus : retours, réserves, recommandations. Les visiteurs restent anonymes.
          </p>
          <button className="btn-primary mt-4" onClick={generer} disabled={busy}>
            {busy ? <Spinner /> : <Sparkles size={16} />} {busy ? "Rédaction…" : "Générer le rapport"}
          </button>
          {!faites.some((v) => v.compteRendu || v.avisClient) && faites.length > 0 && <p className="mt-3 text-xs text-warn">Astuce : remplissez les comptes rendus de visite pour un rapport plus riche.</p>}
        </div>
      )}
        </>
      )}
      {err && <p className="mt-3 text-sm text-danger">{err}</p>}
    </Sheet>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5 text-center">
      <div className="font-serif text-xl font-semibold">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
