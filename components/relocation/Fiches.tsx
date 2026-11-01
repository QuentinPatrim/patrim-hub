"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Mail, Share2 } from "lucide-react";
import { Sheet, Spinner } from "@/components/ui";
import { copier, partager } from "@/components/assistant/outils";
import { gmailHref } from "@/components/matching/BrouillonMail";
import { adresseComplete } from "@/components/biens/utils";
import { AGENCE } from "@/components/documents/charte";
import { dureeBail, type Bail } from "@/components/bail/bail";
import { locationDe } from "@/components/location/bienLocation";
import { valeurIrl } from "@/components/location/loi";
import { listerDossiers } from "@/components/renseignements/client";
import { SITUATIONS_PRO, libelle, type Dossier, type PersonneDossier } from "@/components/renseignements/dossier";
import type { BienActes } from "@/components/documents/archive";
import type { Partie } from "@/components/offre/offre";
import { nomConseiller } from "@/lib/equipe";
import type { Bien } from "@/lib/types";
import { echeanceCaution, jourJ, relocationDe, totalRetenues } from "./relocation";

/* ============================================================
   Fiches « à recopier » : tout ce qu'il faut saisir dans ICS
   (nouveau locataire, bail, indice) et dans Immoaccess (GLI),
   champ par champ avec un bouton copier. Rien n'est envoyé :
   ICS et Immoaccess restent saisis à la main, une seule fois,
   à partir d'informations déjà propres.
   ============================================================ */

type Ligne = [string, string | number | undefined];
type Bloc = { titre: string; lignes: Ligne[] };

const eur2 = (n?: number) => (n == null ? undefined : `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const jj = (ymd?: string) => (ymd ? jourJ(ymd.slice(0, 10)) : undefined);
const CIV: Record<string, string> = { "M.": "Monsieur", Mme: "Madame" };

/** Bail retenu pour la saisie : le dernier signé, sinon le dernier rédigé. */
export function bailDuBien(b: Bien): { id: string; data: Bail } | undefined {
  const baux = ((b as BienActes).actes ?? []).filter((a) => a.kind === "bail") as { id: string; statut: string; data: Bail }[];
  const x = [...baux].reverse().find((a) => a.statut === "signe") ?? baux[baux.length - 1];
  return x ? { id: x.id, data: x.data } : undefined;
}

function garants(b: Bien, bailId?: string): Partie[] {
  return ((b as BienActes).actes ?? []).flatMap((a) => (a.kind === "caution" && (!bailId || !a.data.bailActeId || a.data.bailActeId === bailId) ? a.data.personnes : []));
}

const partie = (p: Partie, i: number, quoi: string): Bloc => ({
  titre: `${quoi} ${i + 1}`,
  lignes: [
    ["Civilité", p.civilite ? CIV[p.civilite] : undefined],
    ["Nom", p.nom?.toUpperCase()],
    ["Prénom", p.prenom],
    ["Né(e) le", jj(p.dateNaissance)],
    ["À", p.lieuNaissance],
    ["Adresse actuelle", p.adresse],
    ["Téléphone", p.tel],
    ["E-mail", p.email],
    ["Profession", p.profession],
  ],
});

export function blocsIcs(b: Bien): Bloc[] {
  const bail = bailDuBien(b);
  const loc = locationDe(b);
  const r = relocationDe(b);
  const x = bail?.data;
  const blocs: Bloc[] = [
    {
      titre: "Logement",
      lignes: [
        ["Adresse", adresseComplete(b)],
        ["Surface", b.surface ? `${b.surface.toLocaleString("fr-FR")} m²` : undefined],
        ["Pièces", b.pieces],
        ["Meublé", (x?.type ?? (loc?.meuble ? "meuble" : undefined)) === "meuble" ? "Oui" : x || loc?.meuble === false ? "Non" : undefined],
        ["Propriétaire", r?.proprietaire],
      ],
    },
  ];
  (x?.locataires ?? []).forEach((p, i) => blocs.push(partie(p, i, "Locataire")));
  if (x)
    blocs.push({
      titre: "Bail",
      lignes: [
        ["Type", x.type === "meuble" ? "Meublé" : "Vide (nu)"],
        ["Date d'effet", jj(x.debut)],
        ["Durée", `${dureeBail(x)} mois`],
        ["Loyer hors charges", eur2(x.loyer)],
        ["Charges", x.charges != null ? `${eur2(x.charges)} (${x.chargesMode === "forfait" ? "forfait" : x.chargesMode === "periodique" ? "versement périodique" : "provisions"})` : undefined],
        ["Dépôt de garantie", eur2(x.depot)],
        ["Paiement", `${x.paiement === "echu" ? "À terme échu" : "À terme à échoir"}, le ${x.jourPaiement}`],
        ["Indice (IRL de référence)", x.irl ? `${x.irl.trimestre}${x.irl.trimestre === 1 ? "er" : "e"} trimestre ${x.irl.annee} : ${valeurIrl(x.irl.valeur)}` : undefined],
        ["Révision", x.revision === "date" && x.revisionDate ? `Le ${x.revisionDate}` : "À la date anniversaire"],
        ["Honoraires locataire (bail)", eur2(x.honorairesLocataire?.bail)],
        ["Honoraires locataire (EDL)", eur2(x.honorairesLocataire?.edl)],
      ],
    });
  garants(b, bail?.id).forEach((p, i) => blocs.push(partie(p, i, "Garant")));
  blocs.push({ titre: "Garantie", lignes: [["Garantie loyers", r?.dossier?.garantie ? r.dossier.garantie.toUpperCase() : r?.gli ? "GLI" : undefined]] });
  return blocs.map((k) => ({ ...k, lignes: k.lignes.filter(([, v]) => v !== undefined && v !== "") })).filter((k) => k.lignes.length);
}

function personneImmo(p: PersonneDossier): Bloc {
  const x = p.reponses ?? {};
  const revenus = (x.salaire ?? 0) + (x.autresRevenus ?? 0);
  return {
    titre: `${p.role === "garant" ? "Garant" : p.principal ? "Locataire" : "Colocataire"} : ${[x.prenom ?? p.prenom, x.nom].filter(Boolean).join(" ")}`,
    lignes: [
      ["Civilité", x.civilite ? CIV[x.civilite] : undefined],
      ["Nom", x.nom?.toUpperCase()],
      ["Prénom", x.prenom ?? p.prenom],
      ["Date de naissance", jj(x.dateNaissance)],
      ["Lieu de naissance", x.lieuNaissance],
      ["Situation professionnelle", libelle(SITUATIONS_PRO, x.pro) || undefined],
      ["Profession", x.profession],
      ["Employeur", x.employeur],
      ["Depuis le", jj(x.depuis)],
      ["Revenus nets mensuels", revenus ? eur2(revenus) : undefined],
      ["dont autres revenus", x.autresRevenus ? `${eur2(x.autresRevenus)}${x.autresRevenusDetail ? ` (${x.autresRevenusDetail})` : ""}` : undefined],
      ["Téléphone", x.tel],
      ["E-mail", x.email],
    ],
  };
}

export function blocsImmoaccess(b: Bien, d?: Dossier): Bloc[] {
  const loc = locationDe(b);
  const r = relocationDe(b);
  const bail = bailDuBien(b)?.data;
  const blocs: Bloc[] = [
    {
      titre: "Le logement (côté propriétaire)",
      lignes: [
        ["Propriétaire", r?.proprietaire],
        ["Adresse du logement", adresseComplete(b)],
        ["Type", [b.pieces ? `T${b.pieces}` : b.type, (bail?.type ?? (loc?.meuble ? "meuble" : "nu")) === "meuble" ? "meublé" : "vide"].join(" ")],
        ["Surface", b.surface ? `${b.surface.toLocaleString("fr-FR")} m²` : undefined],
        ["Étage", b.etage != null ? (b.etage === 0 ? "RDC" : String(b.etage)) : r?.etageTexte],
        ["Loyer hors charges", eur2(bail?.loyer ?? loc?.loyer)],
        ["Charges", eur2(bail?.charges ?? loc?.charges)],
        ["Loyer charges comprises", (bail?.loyer ?? loc?.loyer) ? eur2((bail?.loyer ?? loc?.loyer ?? 0) + (bail?.charges ?? loc?.charges ?? 0)) : undefined],
        ["Dépôt de garantie", eur2(bail?.depot ?? loc?.depot)],
        ["Date d'entrée", jj(bail?.debut)],
      ],
    },
  ];
  if (d) d.personnes.filter((p) => p.reponses).forEach((p) => blocs.push(personneImmo(p)));
  else (bail?.locataires ?? []).forEach((p, i) => blocs.push(partie(p, i, "Locataire")));
  return blocs.map((k) => ({ ...k, lignes: k.lignes.filter(([, v]) => v !== undefined && v !== "") })).filter((k) => k.lignes.length);
}

const enTexte = (titre: string, blocs: Bloc[]) => [titre, ...blocs.map((k) => [`\n${k.titre.toUpperCase()}`, ...k.lignes.map(([l, v]) => `${l} : ${v}`)].join("\n"))].join("\n");

function Blocs({ blocs }: { blocs: Bloc[] }) {
  const [copie, setCopie] = useState<string | null>(null);
  async function c(cle: string, v: string) {
    await copier(v);
    setCopie(cle);
    setTimeout(() => setCopie((x) => (x === cle ? null : x)), 1500);
  }
  return (
    <div className="space-y-4">
      {blocs.map((k) => (
        <section key={k.titre}>
          <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">{k.titre}</h3>
          <ul className="divide-y divide-line/60 rounded-2xl border border-line/70 bg-surface">
            {k.lignes.map(([l, v]) => {
              const cle = `${k.titre}-${l}`;
              return (
                <li key={cle} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] text-muted">{l}</span>
                    <span className="block break-words text-sm font-medium">{v}</span>
                  </span>
                  <button className="btn-ghost btn-sm !h-10 !w-10 !px-0" aria-label={`Copier ${l}`} onClick={() => c(cle, String(v))}>
                    {copie === cle ? <Check size={16} className="text-ok" /> : <Copy size={16} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function FicheIcs({ b, open, onClose }: { b: Bien; open: boolean; onClose: () => void }) {
  const blocs = blocsIcs(b);
  const avecBail = !!bailDuBien(b);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="À recopier dans ICS"
      footer={
        <button className="btn-secondary w-full !h-11" onClick={() => copier(enTexte(`Saisie ICS · ${b.titre || b.adresse}`, blocs))}>
          <Copy size={16} /> Tout copier
        </button>
      }
    >
      {!avecBail && <p className="mb-3 rounded-xl bg-warn/10 px-3 py-2 text-[13px]">Aucun bail rédigé dans le Hub pour ce logement : seules les informations du logement sont prêtes. Rédigez le bail depuis la fiche du bien pour compléter le locataire, le loyer et l&apos;indice.</p>}
      <Blocs blocs={blocs} />
    </Sheet>
  );
}

export function FicheImmoaccess({ b, open, onClose }: { b: Bien; open: boolean; onClose: () => void }) {
  const [dossier, setDossier] = useState<Dossier | undefined>();
  const [etat, setEtat] = useState<"charge" | "ok" | "aucun" | "erreur">("charge");
  useEffect(() => {
    if (!open) return;
    let fini = false;
    setEtat("charge");
    listerDossiers(b.id)
      .then((ds) => {
        if (fini) return;
        const d = [...ds].filter((x) => x.personnes.some((p) => p.reponses)).sort((a, z) => z.creeLe.localeCompare(a.creeLe))[0];
        setDossier(d);
        setEtat(d ? "ok" : "aucun");
      })
      .catch(() => !fini && setEtat("erreur"));
    return () => {
      fini = true;
    };
  }, [open, b.id]);
  const blocs = blocsImmoaccess(b, dossier);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="À recopier dans Immoaccess"
      footer={
        <button className="btn-secondary w-full !h-11" onClick={() => copier(enTexte(`Immoaccess GLI · ${b.titre || b.adresse}`, blocs))}>
          <Copy size={16} /> Tout copier
        </button>
      }
    >
      {etat === "charge" ? (
        <div className="grid place-items-center py-10">
          <Spinner />
        </div>
      ) : (
        <>
          {etat !== "ok" && (
            <p className="mb-3 rounded-xl bg-warn/10 px-3 py-2 text-[13px]">
              {etat === "erreur" ? "Les fiches de renseignements ne se chargent pas pour l'instant." : "Aucune fiche de renseignements remplie pour ce logement."} Envoyez la fiche au candidat depuis « Renseignements » : son nom, sa date de naissance, son employeur et ses revenus apparaîtront ici.
            </p>
          )}
          <Blocs blocs={blocs} />
        </>
      )}
    </Sheet>
  );
}

/* ---------- Lettre de restitution du dépôt de garantie ---------- */

export function lettreCaution(b: Bien): { sujet: string; corps: string } {
  const r = relocationDe(b)!;
  const c = r.caution ?? {};
  const montant = c.montant ?? 0;
  const ret = c.retenues ?? [];
  const total = totalRetenues(r);
  const solde = Math.max(0, montant - total);
  const adresse = adresseComplete(b);
  const sujet = `Restitution de votre dépôt de garantie · ${adresse}`;
  const lignes = [
    "Madame, Monsieur,",
    "",
    `Suite à l'état des lieux de sortie du ${r.edls ? jourJ(r.edls) : "[date]"} du logement situé ${adresse}, nous revenons vers vous au sujet de votre dépôt de garantie de ${eur2(montant) ?? "[montant]"}.`,
    "",
  ];
  if (!ret.length) {
    lignes.push(`L'état des lieux de sortie étant conforme à l'état des lieux d'entrée, et sous réserve des sommes restant dues au titre des loyers et charges, nous vous restituons l'intégralité de ce dépôt, soit ${eur2(montant) ?? "[montant]"}.`);
  } else {
    lignes.push("Conformément à l'état des lieux de sortie et aux justificatifs joints, les sommes suivantes sont retenues :", "");
    ret.forEach((x) => lignes.push(`- ${x.libelle} : ${eur2(x.montant)}`));
    lignes.push("", `Total des retenues : ${eur2(total)}`, `Montant restitué : ${eur2(solde)}`);
  }
  lignes.push(
    "",
    "Le versement sera effectué par virement sur le compte dont vous nous avez communiqué les coordonnées. Si celles-ci ont changé, merci de nous transmettre un RIB à jour.",
    "",
    "Nous vous prions d'agréer, Madame, Monsieur, nos salutations distinguées.",
    "",
    nomConseiller(),
    `${AGENCE.nom} · ${AGENCE.adresse} · ${AGENCE.tel}`
  );
  return { sujet, corps: lignes.join("\n") };
}

export function LettreCaution({ b, open, onClose }: { b: Bien; open: boolean; onClose: () => void }) {
  const r = relocationDe(b);
  if (!r) return null;
  const { sujet, corps } = lettreCaution(b);
  const e = echeanceCaution(r, locationDe(b)?.loyer, new Date().toISOString().slice(0, 10));
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Lettre au locataire sortant"
      footer={
        <div className="grid grid-cols-3 gap-2">
          <button className="btn-secondary !h-11" onClick={() => copier(corps)}>
            <Copy size={16} /> Copier
          </button>
          <a className="btn-secondary !h-11" href={gmailHref(r.sortant?.email, sujet, corps)} target="_blank" rel="noreferrer">
            <Mail size={16} /> Gmail
          </a>
          <button className="btn-secondary !h-11" onClick={() => partager({ title: sujet, text: corps })}>
            <Share2 size={16} /> Partager
          </button>
        </div>
      }
    >
      {e && (
        <p className="mb-3 rounded-xl bg-surface-2 px-3 py-2 text-[13px]">
          À verser avant le <b>{jourJ(e.limite)}</b> ({e.mois} mois après l&apos;état des lieux de sortie{e.mois === 2 ? ", non conforme" : ""}).
        </p>
      )}
      <p className="mb-2 text-[12px] text-muted">Le décompte et le virement restent faits dans ICS. Ce texte est un brouillon : relisez-le avant envoi.</p>
      <pre className="whitespace-pre-wrap rounded-2xl border border-line/70 bg-surface p-3 font-sans text-sm leading-relaxed">{corps}</pre>
      {r.sortant?.nom && <p className="mt-2 text-[12px] text-muted">Destinataire : {r.sortant.nom}</p>}
    </Sheet>
  );
}

