"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ChangeEvent } from "react";
import { AlertTriangle, Check, CheckCircle2, Circle, CircleDashed, Clock, Landmark, Mail } from "lucide-react";
import { Avatar, Card, Empty, Field, PageHeader, cx } from "@/components/ui";
import { ContactPicker } from "@/components/biens/ContactPicker";
import { PickChip, Toggle } from "@/components/contacts/bits";
import { BrouillonMail } from "@/components/matching/BrouillonMail";
import { dossierDe } from "@/components/biens/dossier";
import { ALERTES, diagnosticsSuivis, statutsDiags } from "@/components/diagnostics/diagnostics";
import {
  CHECKS,
  acceptationPret,
  acquereursDe,
  ajouterJours,
  avecPret,
  avecRetractation,
  dateTexte,
  echeances,
  finPreemption,
  finRetractation,
  incoherences,
  prochaine,
  venteDe,
  type EtatEcheance,
  type SuiviVente,
} from "@/components/vente/vente";
import { marquerVendu, messageAcquereur, messageNotaire, messageVendeur, noterPoint, passerEnCompromis, type Canal, type Message } from "@/components/vente/messages";
import { TEXTE_TON } from "@/components/vente/VenteFiche";
import { ApresVenteCard, venteSignee } from "@/components/vente/ApresVente";
import { BoutonsContact } from "@/components/vente/BoutonsContact";
import { useCollection, useDoc } from "@/lib/store";
import { dateCourte, initiales, nomComplet, today } from "@/lib/format";
import type { Bien, Contact } from "@/lib/types";

/* ============================================================
   Suivi de la vente, de l'avant-contrat à l'acte : les dates de
   l'avant-contrat, les délais qui en découlent (rétractation,
   prêt, préemption) et les points d'étape avec l'acquéreur, le
   vendeur et le notaire (messages prêts, jamais envoyés d'ici).
   Une fois l'acte signé : l'après-vente.
   ============================================================ */

const ICONE: Record<EtatEcheance, { Icon: typeof Circle; cls: string }> = {
  fait: { Icon: CheckCircle2, cls: "text-ok" },
  depasse: { Icon: AlertTriangle, cls: "text-danger" },
  bientot: { Icon: Clock, cls: "text-warn" },
  aCompleter: { Icon: CircleDashed, cls: "text-muted" },
  aVenir: { Icon: Circle, cls: "text-accent" },
};

type Brouillon = { titre: string; to?: string; tel?: string; sujet: string; corps: string; cle: string; texte: string };

export default function VentePage() {
  const { id } = useParams<{ id: string }>();
  const { doc: b, update } = useDoc("biens", id);
  const { items: contacts } = useCollection("contacts");
  const [mail, setMail] = useState<Brouillon | null>(null);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1200);
    return () => clearTimeout(t);
  }, []);

  if (!b) {
    if (!waited) return <div className="skeleton h-40 rounded-3xl" />;
    return (
      <div className="card">
        <Empty title="Bien introuvable" action={<Link href="/biens" className="btn-primary">Retour aux biens</Link>} />
      </div>
    );
  }

  const auj = today();
  const v = venteDe(b);
  const enregistrer = (patch: Partial<SuiviVente>) => update({ vente: { ...v, ...patch } } as Partial<Bien>);
  const champ = (cle: "signature" | "notification" | "depotAvant" | "depotFait" | "obtentionAvant" | "accord" | "offrePret" | "dia" | "renonciation" | "acte" | "acteHeure" | "acteSigne") => ({
    value: v[cle] ?? "",
    onChange: (e: ChangeEvent<HTMLInputElement>) => enregistrer({ [cle]: e.target.value || undefined }),
  });

  const liste = echeances(b, auj);
  const urgente = prochaine(liste);
  const alertes = incoherences(b);
  const pret = avecPret(b);
  const sru = avecRetractation(b);
  const ids = acquereursDe(b);
  const trouve = (x: string) => contacts.find((c) => c.id === x);
  const acquereurs = ids.map(trouve).filter(Boolean) as Contact[];
  const vendeurs = (b.vendeurIds ?? []).map(trouve).filter(Boolean) as Contact[];
  const d = dossierDe(b);
  const notaire = messageNotaire(b, auj);
  const diags = diagnosticsSuivis(b) ? statutsDiags(b, auj).filter((s) => ALERTES.includes(s.etat)) : null;
  const finSru = v.notification ? finRetractation(v.notification) : undefined;
  const titre = b.titre;

  const ouvrirMail = (c: Contact, m: Message, texte: string) => setMail({ titre: `Point avec ${nomComplet(c)}`, to: c.email, tel: c.tel, sujet: m.sujet, corps: m.mail, cle: c.id, texte });

  return (
    <div className="space-y-5 pb-6">
      <PageHeader back={`/biens/${b.id}`} title="Suivi de la vente" subtitle={titre} />

      {b.statut === "sous_offre" && v.signature && v.signature <= auj && (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm">
            L&apos;avant-contrat était prévu le {dateTexte(v.signature, auj)}. S&apos;il est signé, passez le bien en « Compromis » : ses acquéreurs passent aussi à cette étape.
          </p>
          <button type="button" className="btn-primary btn-sm mt-3 w-full sm:w-auto" onClick={() => passerEnCompromis(b)}>
            Passer en « Compromis »
          </button>
        </div>
      )}

      <Card title="Calendrier" pad={false}>
        <ol className="divide-y divide-line">
          {liste.map((x) => {
            const { Icon, cls } = ICONE[x.etat];
            return (
              <li key={x.cle} className={cx("flex items-start gap-3 px-4 py-3 sm:px-5", x === urgente && x.etat !== "aVenir" && "bg-surface-2")}>
                <Icon size={18} className={cx("mt-0.5 shrink-0", cls)} />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{x.label}</div>
                  <div className={cx("text-xs", TEXTE_TON[x.tone] ?? "text-muted")}>{x.texte}</div>
                </div>
              </li>
            );
          })}
        </ol>
        {alertes.length > 0 && (
          <div className="space-y-1.5 border-t border-line px-4 py-3 sm:px-5">
            {alertes.map((a) => (
              <p key={a} className="flex gap-2 text-xs text-warn">
                <AlertTriangle size={14} className="mt-px shrink-0" /> {a}
              </p>
            ))}
          </div>
        )}
      </Card>

      <Card title="Avant-contrat">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <PickChip active={v.avantContrat !== "promesse"} onClick={() => enregistrer({ avantContrat: "compromis" })}>
              Compromis
            </PickChip>
            <PickChip active={v.avantContrat === "promesse"} onClick={() => enregistrer({ avantContrat: "promesse" })}>
              Promesse de vente
            </PickChip>
          </div>
          <Field label="Date de signature" hint="Faite ou prévue.">
            <input type="date" className="input" {...champ("signature")} />
          </Field>
          <div>
            <span className="label">Acquéreur{ids.length > 1 ? "s" : ""}</span>
            <ContactPicker value={ids} onChange={(x) => enregistrer({ acquereurIds: x })} role="acquereur" max={2} placeholder="Rechercher l'acquéreur…" />
            {!v.acquereurIds && ids.length > 0 && <p className="mt-1 text-[11px] text-muted">Repris de l&apos;offre acceptée.</p>}
          </div>
        </div>
      </Card>

      <Card title="Délai de rétractation">
        <Toggle checked={sru} onChange={(x) => enregistrer({ sru: x })} label="Délai de rétractation de 10 jours" hint="Pour un acquéreur particulier qui achète un logement." />
        {sru && (
          <div className="mt-2 space-y-2">
            <Field label="Notification reçue par l'acquéreur le" hint="Première présentation de la lettre recommandée, papier ou électronique, ou remise en main propre.">
              <input type="date" className="input" {...champ("notification")} />
            </Field>
            {v.notification && finSru && (
              <p className="text-xs text-muted">
                Dernier jour pour se rétracter : <span className="font-medium text-fg">{dateTexte(finSru, auj, true)}</span>
                {finSru !== ajouterJours(v.notification, 10) ? " (le 10e jour tombe un samedi, un dimanche ou un jour férié : le délai est prolongé au jour ouvrable suivant)." : "."}
              </p>
            )}
          </div>
        )}
      </Card>

      <Card title="Prêt de l'acquéreur">
        {pret === undefined ? (
          <div>
            <p className="text-sm text-muted">L&apos;offre ne dit pas comment l&apos;acquéreur finance son achat.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <PickChip onClick={() => enregistrer({ pret: true })}>Avec un prêt</PickChip>
              <PickChip onClick={() => enregistrer({ pret: false })}>Comptant</PickChip>
            </div>
          </div>
        ) : (
          <Toggle checked={pret} onChange={(x) => enregistrer({ pret: x })} label="Achat financé par un prêt" hint="Sous condition suspensive d'obtention du prêt." />
        )}
        {pret && (
          <div className="mt-2 space-y-3">
            <div className="grid grid-cols-2 items-end gap-2">
              <Field label="Dépôt des demandes avant le">
                <input type="date" className="input" {...champ("depotAvant")} />
              </Field>
              <Field label="Demandes déposées le">
                <input type="date" className="input" {...champ("depotFait")} />
              </Field>
            </div>
            <div>
              <Field label="Obtention du prêt avant le" hint={v.obtentionAvant ? undefined : "La date limite figure dans l'avant-contrat."}>
                <input type="date" className="input" {...champ("obtentionAvant")} />
              </Field>
              {!v.obtentionAvant && v.signature && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted">Ou après la signature :</span>
                  {[30, 45, 60].map((n) => (
                    <PickChip key={n} onClick={() => enregistrer({ obtentionAvant: ajouterJours(v.signature!, n) })}>
                      {n} jours
                    </PickChip>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 items-end gap-2">
              <Field label="Accord de la banque le">
                <input type="date" className="input" {...champ("accord")} />
              </Field>
              <Field label="Offre de prêt reçue le">
                <input type="date" className="input" {...champ("offrePret")} />
              </Field>
            </div>
            {v.offrePret && <p className="text-xs text-muted">L&apos;acquéreur peut accepter l&apos;offre de prêt à partir du {dateTexte(acceptationPret(v.offrePret), auj, true)} (délai de réflexion de 10 jours).</p>}
          </div>
        )}
      </Card>

      <Card title="Acte de vente">
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_7rem] items-end gap-2">
            <Field label="Date de l'acte">
              <input type="date" className="input" {...champ("acte")} />
            </Field>
            <Field label="Heure">
              <input type="time" className="input" {...champ("acteHeure")} />
            </Field>
          </div>
          {d?.notaire && (
            <p className="flex gap-2 text-xs text-muted">
              <Landmark size={14} className="mt-px shrink-0" /> <span className="whitespace-pre-line">{d.notaire}</span>
            </p>
          )}
          <div className="grid grid-cols-2 items-end gap-2">
            <Field label="DIA reçue en mairie le">
              <input type="date" className="input" {...champ("dia")} />
            </Field>
            <Field label="Renonciation reçue le">
              <input type="date" className="input" {...champ("renonciation")} />
            </Field>
          </div>
          {v.dia && !v.renonciation && <p className="text-xs text-muted">La mairie a jusqu&apos;au {dateTexte(finPreemption(v.dia), auj)} pour préempter ; sans réponse, elle renonce.</p>}

          <Link href={`/biens/${b.id}/diagnostics`} className="block rounded-xl bg-surface-2 px-3 py-2.5 text-xs hover:bg-line/40">
            {diags === null ? (
              <span className="text-muted">Diagnostics : saisissez la date des rapports pour vérifier qu&apos;ils seront encore valables le jour de l&apos;acte.</span>
            ) : diags.length ? (
              <span className="block space-y-0.5">
                {diags.slice(0, 3).map((s) => (
                  <span key={s.cle} className={cx("block", s.tone === "danger" ? "text-danger" : "text-warn")}>
                    {s.label} : {s.texte}
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-ok">Diagnostics valables {v.acte && v.acte >= auj ? "le jour de l'acte" : "aujourd'hui"}.</span>
            )}
          </Link>

          <div>
            <span className="label">Avant l&apos;acte</span>
            <ul>
              {CHECKS.map((c) => {
                const fait = v.faits?.[c.cle];
                return (
                  <li key={c.cle}>
                    <button
                      type="button"
                      onClick={() => enregistrer({ faits: { ...v.faits, [c.cle]: fait ? undefined : auj } })}
                      className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-1 text-left"
                    >
                      <span className={cx("grid size-5 shrink-0 place-items-center rounded-md border transition", fait ? "border-brand bg-brand text-white" : "border-line")}>{fait && <Check size={13} />}</span>
                      <span className={cx("text-sm", fait && "text-muted line-through")}>{c.label}</span>
                      {fait && <span className="ml-auto shrink-0 text-[11px] text-muted">{dateCourte(fait)}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <Field label="Acte signé le">
            <input type="date" className="input" {...champ("acteSigne")} />
          </Field>
          {v.acteSigne && b.statut !== "vendu" && (
            <button type="button" className="btn-primary w-full" onClick={() => marquerVendu(b)}>
              Passer le bien en « Vendu »
            </button>
          )}
          {v.acteSigne && b.statut === "vendu" && <p className="text-sm text-ok">Vente conclue le {dateTexte(v.acteSigne, auj)}.</p>}
        </div>
      </Card>

      {venteSignee(b, auj) ? (
        <ApresVenteCard b={b} contacts={contacts} />
      ) : (
        <Card title="Faire le point" pad={false}>
          <ul className="divide-y divide-line">
            {acquereurs.map((c) => {
              const m = messageAcquereur(b, c, auj);
              return <Ligne key={c.id} c={c} role="Acquéreur" m={m} dernier={v.points?.[c.id]} onPoint={(canal) => noterPoint(b.id, c.id, canal, `Point sur l'achat : ${titre}`)} onMail={() => ouvrirMail(c, m, `Point sur l'achat : ${titre}`)} />;
            })}
            {vendeurs.map((c) => {
              const m = messageVendeur(b, c, auj);
              return <Ligne key={c.id} c={c} role="Vendeur" m={m} dernier={v.points?.[c.id]} onPoint={(canal) => noterPoint(b.id, c.id, canal, `Point sur la vente : ${titre}`)} onMail={() => ouvrirMail(c, m, `Point sur la vente : ${titre}`)} />;
            })}
            <li className="px-4 py-3.5 sm:px-5">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
                  <Landmark size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">Notaire</div>
                  <div className="truncate text-xs text-muted">{notaire.to || "Adresse à compléter dans le mail"}</div>
                  {v.points?.notaire && <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-ok"><Check size={13} /> Dernier point le {dateCourte(v.points.notaire)}</div>}
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary mt-2.5 w-full"
                onClick={() => setMail({ titre: "Point avec le notaire", to: notaire.to || undefined, sujet: notaire.sujet, corps: notaire.mail, cle: "notaire", texte: "" })}
              >
                <Mail size={16} /> Préparer le mail
              </button>
            </li>
          </ul>
          {!acquereurs.length && <p className="px-4 pt-1 text-xs text-muted sm:px-5">Choisissez l&apos;acquéreur dans « Avant-contrat » pour lui écrire.</p>}
          <p className="px-4 pb-4 pt-2 text-xs text-muted sm:px-5">Rien n&apos;est envoyé d&apos;ici : chaque message s&apos;ouvre dans votre messagerie pour relecture.</p>
        </Card>
      )}

      {mail && (
        <BrouillonMail
          open
          onClose={() => setMail(null)}
          titre={mail.titre}
          to={mail.to}
          tel={mail.tel}
          sujet={mail.sujet}
          corps={mail.corps}
          onPrepare={(canal) => noterPoint(b.id, mail.cle, canal === "whatsapp" ? "whatsapp" : "mail", mail.texte)}
        />
      )}
    </div>
  );
}

function Ligne({ c, role, m, dernier, onPoint, onMail }: { c: Contact; role: string; m: Message; dernier?: string; onPoint: (canal: Canal) => void; onMail: () => void }) {
  return (
    <li className="px-4 py-3.5 sm:px-5">
      <div className="flex items-start gap-3">
        <Avatar text={initiales(c)} />
        <div className="min-w-0 flex-1">
          <Link href={`/contacts/${c.id}`} className="block truncate font-medium hover:text-accent">
            {nomComplet(c)}
          </Link>
          <div className="text-xs text-muted">{role}</div>
          {dernier && (
            <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-ok">
              <Check size={13} /> Dernier point le {dateCourte(dernier)}
            </div>
          )}
        </div>
      </div>
      <BoutonsContact c={c} m={m} onPoint={onPoint} onMail={onMail} />
    </li>
  );
}
