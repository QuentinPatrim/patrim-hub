"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, HeartHandshake } from "lucide-react";
import { Avatar, Card, Spinner } from "@/components/ui";
import { BrouillonMail } from "@/components/matching/BrouillonMail";
import { useCollection } from "@/lib/store";
import { useLienAvis } from "@/lib/profil";
import { eur, initiales, nomComplet, today } from "@/lib/format";
import type { Bien, Contact } from "@/lib/types";
import { dateTexte, venteDe } from "./vente";
import { anniversaireDe, apresAFaire, clientsVente, nAns, nouvellesFaites, type ClientVente } from "./apres";
import { marcheQuartier, messageMerci, messageNouvelles, noterApres, type Marche, type Message } from "./messages";
import { BoutonsContact } from "./BoutonsContact";

/* ============================================================
   Après l'acte : un remerciement (avec le lien pour laisser un
   avis), puis des nouvelles à chaque date anniversaire de la
   vente, avec les prix du quartier pour l'acquéreur. Messages
   prêts à relire, jamais envoyés d'ici.
   ============================================================ */

const ROLE = { acquereur: "Acquéreur", vendeur: "Vendeur" } as const;
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** « 4 250 €/m² », sans retour à la ligne avant l'euro. */
const prixM2 = (n: number) => `${eur(n).replace(/ €$/, "\u00a0€")}/m²`;
/** Jour (à Paris) d'une date ISO, avec l'année si ce n'est pas celle d'aujourd'hui. */
const jourDe = (iso: string, auj: string) => dateTexte(new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }), auj);
/** Acte saisi et passé : la vente est faite. */
export const venteSignee = (b: Bien, auj = today()) => !!venteDe(b).acteSigne && venteDe(b).acteSigne! <= auj;

type Brouillon = { c: Contact; m: Message; quoi: "merci" | "nouvelles"; texte: string };

/** Carte du suivi de la vente, une fois l'acte signé : un message par client. */
export function ApresVenteCard({ b, contacts }: { b: Bien; contacts: Contact[] }) {
  const auj = today();
  const v = venteDe(b);
  const lienAvis = useLienAvis();
  const [mail, setMail] = useState<Brouillon | null>(null);
  /** undefined : recherche en cours ; null : pas assez de ventes publiées. */
  const [marche, setMarche] = useState<Marche | null>();
  const ann = v.acteSigne ? anniversaireDe(v.acteSigne, auj) : undefined;
  const ouvert = !!ann?.ouvert;
  const clients = clientsVente(b)
    .map((x) => ({ ...x, c: contacts.find((c) => c.id === x.id) }))
    .filter((x): x is ClientVente & { c: Contact } => !!x.c);
  const avecAcquereur = clients.some((x) => x.role === "acquereur");

  useEffect(() => {
    if (!ouvert || !avecAcquereur || !v.acteSigne) return;
    let actif = true;
    setMarche(undefined);
    marcheQuartier(b, v.acteSigne).then(
      (m) => actif && setMarche(m ?? null),
      () => actif && setMarche(null)
    );
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, avecAcquereur, v.acteSigne, b.id, b.adresse, b.surface, b.type]);

  if (!v.acteSigne || !ann) return null;
  const quoi = ouvert ? "nouvelles" : "merci";
  const titre = b.titre || b.adresse;

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <HeartHandshake size={16} className="text-accent" /> Après la vente
        </span>
      }
      pad={false}
    >
      <div className="space-y-2 px-4 pb-1 pt-3 text-sm sm:px-5">
        {ouvert ? (
          <p>
            {ann.date > auj ? `Le ${dateTexte(ann.date, auj)}, cela fera ${nAns(ann.n)}` : `Cela fait ${nAns(ann.n)}`} que la vente est signée : le bon moment pour prendre des nouvelles.
          </p>
        ) : (
          <p className="text-muted">
            Vente signée le {dateTexte(v.acteSigne, auj)}. Un mot de remerciement maintenant, puis des nouvelles à chaque date anniversaire : c&apos;est ce qui fait revenir les clients, et leurs proches.
          </p>
        )}
        {quoi === "merci" && !lienAvis && (
          <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-xs">
            Ajoutez le lien de votre page d&apos;avis Google dans les{" "}
            <Link href="/reglages" className="font-medium underline">
              réglages
            </Link>{" "}
            : il sera ajouté au remerciement.
          </p>
        )}
        {ouvert && avecAcquereur && (
          <p className="flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-xs">
            {marche === undefined ? (
              <>
                <Spinner className="mt-px size-3.5 shrink-0" /> Recherche des prix du quartier pour le message de l&apos;acquéreur…
              </>
            ) : marche ? (
              <span>
                Prix du quartier ajouté au message de l&apos;acquéreur&nbsp;: {prixM2(marche.dernier.prixM2)} en {marche.dernier.annee}, contre {prixM2(marche.achat.prixM2)} en {marche.achat.annee} (prix médian des
                ventes comparables à moins de {marche.rayon >= 1000 ? `${marche.rayon / 1000} km` : `${marche.rayon} m`}).
              </span>
            ) : (
              <span>Pas assez de ventes publiées autour du bien pour donner les prix du quartier : le message n&apos;en parle pas.</span>
            )}
          </p>
        )}
      </div>

      {clients.length ? (
        <ul className="divide-y divide-line">
          {clients.map(({ c, role }) => {
            const m = quoi === "merci" ? messageMerci(b, c, role, lienAvis) : messageNouvelles(b, c, role, ann.n, role === "acquereur" ? (marche ?? undefined) : undefined);
            const texte = quoi === "merci" ? `Remerciement après la vente : ${titre}` : `Nouvelles, ${nAns(ann.n)} après la vente : ${titre}`;
            const merci = v.merci?.[c.id];
            const nouvelles = nouvellesFaites(b, c.id, ann) ? v.nouvelles?.[c.id] : undefined;
            return (
              <li key={c.id} className="px-4 py-3.5 sm:px-5">
                <div className="flex items-start gap-3">
                  <Avatar text={initiales(c)} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/contacts/${c.id}`} className="block truncate font-medium hover:text-accent">
                      {nomComplet(c)}
                    </Link>
                    <div className="text-xs text-muted">{ROLE[role]}</div>
                    {(merci || nouvelles) && (
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-medium text-ok">
                        {merci && (
                          <span className="inline-flex items-center gap-1">
                            <Check size={13} /> Remerciement le {jourDe(merci, auj)}
                          </span>
                        )}
                        {nouvelles && (
                          <span className="inline-flex items-center gap-1">
                            <Check size={13} /> Nouvelles le {jourDe(nouvelles, auj)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <BoutonsContact c={c} m={m} onPoint={(canal) => noterApres(b.id, c.id, quoi, canal, texte)} onMail={() => setMail({ c, m, quoi, texte })} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 pt-2 text-xs text-muted sm:px-5">Choisissez l&apos;acquéreur dans «&nbsp;Avant-contrat&nbsp;» pour préparer les messages.</p>
      )}
      <p className="px-4 pb-4 pt-2 text-xs text-muted sm:px-5">
        {!ouvert && `Prochaines nouvelles à donner le ${dateTexte(ann.date, auj)}, ${nAns(ann.n)} après la vente. `}
        Rien n&apos;est envoyé d&apos;ici : chaque message s&apos;ouvre dans votre messagerie pour relecture.
      </p>

      {mail && (
        <BrouillonMail
          open
          onClose={() => setMail(null)}
          titre={mail.quoi === "merci" ? `Remercier ${nomComplet(mail.c)}` : `Nouvelles à ${nomComplet(mail.c)}`}
          to={mail.c.email}
          tel={mail.c.tel}
          sujet={mail.m.sujet}
          corps={mail.m.mail}
          onPrepare={(canal) => noterApres(b.id, mail.c.id, mail.quoi, canal === "whatsapp" ? "whatsapp" : "mail", mail.texte)}
        />
      )}
    </Card>
  );
}

/** Carte de la fiche d'un bien vendu : ce qu'il reste à faire après la vente. */
export function ApresVenteFiche({ b }: { b: Bien }) {
  const { items: contacts } = useCollection("contacts");
  const auj = today();
  const v = venteDe(b);
  const signee = venteSignee(b, auj);
  const a = apresAFaire(b, auj);
  const noms = (l: ClientVente[]) =>
    l
      .map((x) => contacts.find((c) => c.id === x.id))
      .filter((c): c is Contact => !!c)
      .map(nomComplet)
      .join(", ") || "vos clients";

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <HeartHandshake size={16} className="text-accent" /> Après la vente
        </span>
      }
      action={
        <Link href={`/biens/${b.id}/vente`} className="btn-ghost btn-sm">
          {signee ? "Ouvrir" : "Compléter"}
        </Link>
      }
    >
      {!signee ? (
        <p className="text-sm text-muted">
          Saisissez la date de l&apos;acte et l&apos;acquéreur dans le suivi de la vente : l&apos;appli prépare le remerciement, puis des nouvelles à chaque date anniversaire.
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          <li className="text-muted">Vente signée le {dateTexte(v.acteSigne!, auj)}.</li>
          {a.merci.length > 0 && (
            <li>
              <span className="font-medium">À remercier</span>
              <span className="block text-xs text-warn">{noms(a.merci)}</span>
            </li>
          )}
          {a.nouvelles.length > 0 && a.anniversaire && (
            <li>
              <span className="font-medium">{majuscule(nAns(a.anniversaire.n))} déjà</span>
              <span className="block text-xs text-warn">Prendre des nouvelles de {noms(a.nouvelles)}</span>
            </li>
          )}
          {!a.merci.length && !a.nouvelles.length && a.anniversaire && <li className="text-xs text-muted">Prochaines nouvelles à donner le {dateTexte(a.anniversaire.date, auj)}.</li>}
          {b.statut !== "vendu" && <li className="text-xs text-muted">Passez le bien en «&nbsp;Vendu&nbsp;» depuis le suivi de la vente.</li>}
        </ul>
      )}
    </Card>
  );
}
