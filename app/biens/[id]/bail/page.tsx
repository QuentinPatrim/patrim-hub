"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, FileSignature, PenLine, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Card, Empty, Field, PageHeader, cx } from "@/components/ui";
import { ContactPicker } from "@/components/biens/ContactPicker";
import { BrouillonMail } from "@/components/matching/BrouillonMail";
import { NumInput } from "@/components/contacts/CriteresEditor";
import { PickChip, Toggle } from "@/components/contacts/bits";
import { EtapeBtn, Etat, PartieForm } from "@/components/documents/Parties";
import { enregistrerActe } from "@/components/documents/archive";
import { enregistrerParties, manquants, partieDepuisContact, type ContactEtatCivil, type Partie } from "@/components/offre/offre";
import {
  ANNEXES,
  AUTRES_PARTIES,
  CHAMPS_BAILLEUR,
  CHAMPS_LOCATAIRE,
  COMMUNS,
  EQUIPEMENTS,
  MOBILIER,
  PRIVATIFS,
  QUALITES,
  alertesBail,
  bailInitial,
  depotMax,
  dureeBail,
  ecrireBail,
  effacerBail,
  honorairesBailleur,
  lireBail,
  mailDemandeBail,
  premiereEcheance,
  repartir,
  titreBail,
  type Bail,
} from "@/components/bail/bail";
import { IRL, PLAFONDS, ZONES, ajouterMois, dateActe, dureeTexte, eurosCts, plafondsLocataire, trimestreTexte, valeurIrl } from "@/components/location/loi";
import { useCollection, useDoc } from "@/lib/store";
import { nomComplet } from "@/lib/format";
import { titrePublic } from "@/lib/titrePublic";

/* ============================================================
   Rédiger un bail d'habitation (vide ou meublé) : 1. les parties
   (bailleur, locataires, ce qui manque), 2. la rédaction, puis le
   PDF PATRIM prêt à déposer sur ICSIGN.
   ============================================================ */

const PERIODES = ["Avant 1949", "De 1949 à 1974", "De 1975 à 1989", "De 1989 à 2005", "Depuis 2005"];

export default function BailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { doc: b } = useDoc("biens", id);
  const { items: contactsRaw } = useCollection("contacts");
  const contacts = contactsRaw as ContactEtatCivil[];
  const [x, setX] = useState<Bail | null>(null);
  const [etape, setEtape] = useState<"parties" | "redaction">("parties");
  const [demande, setDemande] = useState<{ p: Partie; role: "locataire" | "bailleur" } | null>(null);
  const [waited, setWaited] = useState(false);
  const [totalHono, setTotalHono] = useState<number | undefined>();
  const init = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const proprietaires = () => (b?.vendeurIds ?? []).map((v) => contacts.find((c) => c.id === v)).filter(Boolean) as ContactEtatCivil[];

  useEffect(() => {
    if (!b || init.current) return;
    init.current = true;
    const existant = lireBail(b.id);
    if (existant) {
      setX(existant);
      if (existant.locataires.length) setEtape("redaction");
    } else setX(bailInitial(b, proprietaires()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b, contacts]);

  useEffect(() => {
    if (x) ecrireBail(x);
  }, [x]);

  const set = (patch: Partial<Bail>) => setX((v) => (v ? { ...v, ...patch } : v));
  const choisir = (cle: "bailleurs" | "locataires", ids: string[]) => {
    if (!x) return;
    set({ [cle]: ids.map((cid) => x[cle].find((p) => p.contactId === cid) ?? partieDepuisContact(contacts.find((c) => c.id === cid)!)) });
  };
  const setPartie = (cle: "bailleurs" | "locataires", i: number, patch: Partial<Partie>) => x && set({ [cle]: x[cle].map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const basculer = (cle: "autresParties" | "equipements" | "privatifs" | "communs" | "annexes" | "mobilier", v: string) =>
    x && set({ [cle]: x[cle].includes(v) ? x[cle].filter((y) => y !== v) : [...x[cle], v] });

  const totalManquants = useMemo(
    () => (x ? x.bailleurs.reduce((n, p) => n + manquants(p, CHAMPS_BAILLEUR).length, 0) + x.locataires.reduce((n, p) => n + manquants(p, CHAMPS_LOCATAIRE).length, 0) : 0),
    [x]
  );
  const alertes = useMemo(() => (x ? alertesBail(x, b?.dpe) : []), [x, b?.dpe]);

  if (!b || !x) {
    if (!waited) return <div className="skeleton h-40 rounded-3xl" />;
    return (
      <div className="card">
        <Empty title="Bien introuvable" action={<Link href="/biens" className="btn-primary">Retour aux biens</Link>} />
      </div>
    );
  }

  const duree = dureeBail(x);
  const max = depotMax(x);
  const plafonds = plafondsLocataire(x.zone, x.surface);
  const hb = honorairesBailleur(x);
  const coloc = x.locataires.length > 1;
  const voirPdf = () => {
    enregistrerParties([...x.bailleurs, ...x.locataires], contacts);
    const acteId = enregistrerActe(b.id, "bail", x);
    ecrireBail({ ...x, acteId });
    router.push(`/imprimer/bail/${b.id}?acte=${acteId}`);
  };

  const TypeChoix = (
    <div className="grid grid-cols-2 gap-2">
      {(["nu", "meuble"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => set({ type: t, menageSortie: t === "meuble" ? x.menageSortie ?? true : x.menageSortie, chargesMode: t === "nu" && x.chargesMode === "forfait" && !coloc ? "provisions" : x.chargesMode })}
          className={cx("rounded-2xl border px-3 py-3 text-left transition", x.type === t ? "border-accent bg-accent/5" : "border-line bg-surface")}
        >
          <span className={cx("block text-sm font-semibold", x.type === t && "text-accent")}>{t === "nu" ? "Logement vide" : "Logement meublé"}</span>
          <span className="mt-0.5 block text-xs text-muted">{t === "nu" ? "3 ans (6 ans pour une société), dépôt 1 mois" : "1 an (9 mois étudiant), dépôt 2 mois"}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-5 pb-6">
      <PageHeader back={`/biens/${b.id}`} title="Bail de location" subtitle={b.titre} />

      <div className="grid grid-cols-2 gap-2 animate-fade-up">
        <EtapeBtn n={1} actif={etape === "parties"} fait={etape === "redaction"} onClick={() => setEtape("parties")}>
          Les parties
        </EtapeBtn>
        <EtapeBtn n={2} actif={etape === "redaction"} onClick={() => setEtape("redaction")} disabled={!x.locataires.length}>
          Rédaction
        </EtapeBtn>
      </div>

      {etape === "parties" ? (
        <>
          <Card title="Type de location">{TypeChoix}</Card>
          <Card title="Bailleur – le propriétaire">
            <ContactPicker value={x.bailleurs.map((p) => p.contactId!).filter(Boolean)} onChange={(ids) => choisir("bailleurs", ids)} role="vendeur" max={4} placeholder="Rechercher le propriétaire…" />
            <Etat parties={x.bailleurs} champs={CHAMPS_BAILLEUR} onDemande={(p) => setDemande({ p, role: "bailleur" })} />
          </Card>
          <Card title={coloc ? "Colocataires" : "Locataire(s)"}>
            <ContactPicker value={x.locataires.map((p) => p.contactId!).filter(Boolean)} onChange={(ids) => choisir("locataires", ids)} role="locataire" max={6} placeholder="Rechercher ou créer le locataire…" />
            <Etat parties={x.locataires} champs={CHAMPS_LOCATAIRE} onDemande={(p) => setDemande({ p, role: "locataire" })} />
            <p className="mt-2 text-xs text-muted">Un couple marié ou pacsé : ajoutez les deux personnes. Plusieurs personnes sans lien : c&apos;est une colocation.</p>
          </Card>
          <div className="card card-pad space-y-3 animate-fade-up">
            {totalManquants > 0 ? (
              <p className="text-sm">
                <span className="font-semibold">Il manque {totalManquants} information{totalManquants > 1 ? "s" : ""}.</span>{" "}
                <span className="text-muted">Préparez le mail de demande (bouton « Demander »), ou complétez vous-même à l&apos;étape suivante.</span>
              </p>
            ) : x.locataires.length ? (
              <p className="text-sm text-ok font-medium inline-flex items-center gap-1.5">
                <Check size={16} /> Tout est là pour rédiger le bail.
              </p>
            ) : (
              <p className="text-sm text-muted">Choisissez au moins un locataire pour commencer.</p>
            )}
            <button className="btn-primary w-full !h-12" disabled={!x.locataires.length} onClick={() => setEtape("redaction")}>
              <PenLine size={16} /> Rédiger le bail maintenant <ArrowRight size={16} />
            </button>
          </div>
        </>
      ) : (
        <>
          <Card title="Type de location">{TypeChoix}</Card>

          {x.bailleurs.map((p, i) => (
            <PartieForm key={p.contactId ?? i} titre={x.bailleurs.length > 1 ? `Bailleur ${i + 1}` : "Bailleur"} p={p} champs={CHAMPS_BAILLEUR} onChange={(v) => setPartie("bailleurs", i, v)} />
          ))}
          <Card title="Qualité du bailleur">
            <div className="flex flex-wrap gap-2">
              {QUALITES.map((q) => (
                <PickChip key={q.v} active={x.qualiteBailleur === q.v} onClick={() => set({ qualiteBailleur: q.v })}>
                  {q.label}
                </PickChip>
              ))}
            </div>
            {x.qualiteBailleur !== "physique" && (
              <div className="mt-3 grid grid-cols-2 items-end gap-3">
                <Field label="Dénomination de la société">
                  <input className="input" value={x.societe ?? ""} onChange={(e) => set({ societe: e.target.value })} placeholder="Ex. SCI DES LILAS" />
                </Field>
                <Field label="Siège social">
                  <input className="input" value={x.siege ?? ""} onChange={(e) => set({ siege: e.target.value })} />
                </Field>
              </div>
            )}
            <p className="mt-2 text-xs text-muted">
              {x.qualiteBailleur === "morale"
                ? "Une société (hors SCI familiale) loue pour 6 ans minimum en location vide."
                : x.qualiteBailleur === "sci_familiale"
                  ? "SCI entre parents et alliés jusqu'au 4e degré : mêmes règles qu'un particulier (3 ans)."
                  : "La personne choisie ci-dessus loue en son nom propre."}
            </p>
            <div className="mt-2 border-t border-line pt-2">
              <Toggle checked={x.parPatrim} onChange={(v) => set({ parPatrim: v })} label="Représenté par PATRIM, mandataire gestionnaire" hint="Le bail indique les coordonnées de gestion de l'agence." />
              <Toggle checked={x.bailleurSigne} onChange={(v) => set({ bailleurSigne: v })} label="Le bailleur signe aussi sur ICSIGN" hint="Sinon, PATRIM signe pour lui au titre du mandat de gestion." />
            </div>
          </Card>

          {x.locataires.map((p, i) => (
            <PartieForm key={p.contactId ?? i} titre={coloc ? `Colocataire ${i + 1}` : "Locataire"} p={p} champs={CHAMPS_LOCATAIRE} onChange={(v) => setPartie("locataires", i, v)} />
          ))}

          <Card title="Le logement">
            <div className="space-y-3">
              <Field label="Identifiant fiscal du logement" hint="12 chiffres, sur l'espace impots.gouv.fr du propriétaire (« Biens immobiliers »).">
                <input className="input" inputMode="numeric" value={x.identifiantFiscal ?? ""} onChange={(e) => set({ identifiantFiscal: e.target.value })} />
              </Field>
              <Field label="Localisation (adresse, bâtiment, étage, porte)">
                <input className="input" value={x.localisation} onChange={(e) => set({ localisation: e.target.value })} />
              </Field>
              <Choix label="Type d'habitat" value={x.habitat} options={[["collectif", "Immeuble collectif"], ["individuel", "Maison individuelle"]]} onChange={(v) => set({ habitat: v })} />
              <Choix label="Régime juridique de l'immeuble" value={x.regime} options={[["copropriete", "Copropriété"], ["mono", "Monopropriété"]]} onChange={(v) => set({ regime: v })} />
              <div>
                <span className="label">Période de construction</span>
                <div className="flex flex-wrap gap-2">
                  {PERIODES.map((p) => (
                    <PickChip key={p} active={x.periode === p} onClick={() => set({ periode: p })}>
                      {p}
                    </PickChip>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 items-end gap-3">
                <Field label="Surface habitable" hint="Pas la surface Carrez : sans les murs, gaines, marches, ni les pièces de moins de 1,80 m sous plafond.">
                  <Montant value={x.surface} onChange={(v) => set({ surface: v })} suffix="m²" />
                </Field>
                <Field label="Pièces principales">
                  <NumInput value={x.pieces} onChange={(v) => set({ pieces: v })} />
                </Field>
              </div>
              <Cases label="Autres parties du logement" liste={AUTRES_PARTIES} actifs={x.autresParties} onToggle={(v) => basculer("autresParties", v)} plus={x.autresPartiesPlus} onPlus={(v) => set({ autresPartiesPlus: v })} />
              <Cases label="Équipements du logement" liste={EQUIPEMENTS} actifs={x.equipements} onToggle={(v) => basculer("equipements", v)} plus={x.equipementsPlus} onPlus={(v) => set({ equipementsPlus: v })} />
              <Choix label="Chauffage" value={x.chauffage} options={[["individuel", "Individuel"], ["collectif", "Collectif"]]} onChange={(v) => set({ chauffage: v })} />
              {x.chauffage === "collectif" && <input className="input" placeholder="Répartition (ex. tantièmes, compteurs)" value={x.chauffageRepartition ?? ""} onChange={(e) => set({ chauffageRepartition: e.target.value })} />}
              <Choix label="Eau chaude" value={x.eauChaude} options={[["individuelle", "Individuelle"], ["collective", "Collective"]]} onChange={(v) => set({ eauChaude: v })} />
              {x.eauChaude === "collective" && <input className="input" placeholder="Répartition (ex. compteurs divisionnaires)" value={x.eauChaudeRepartition ?? ""} onChange={(e) => set({ eauChaudeRepartition: e.target.value })} />}
              <Choix label="Destination" value={x.usage} options={[["habitation", "Habitation principale"], ["mixte", "Habitation et profession"]]} onChange={(v) => set({ usage: v })} />
              {x.usage === "mixte" && <input className="input" placeholder="Profession exercée" value={x.profession ?? ""} onChange={(e) => set({ profession: e.target.value })} />}
              <Cases label="À l'usage privatif du locataire" liste={PRIVATIFS} actifs={x.privatifs} onToggle={(v) => basculer("privatifs", v)} plus={x.privatifsPlus} onPlus={(v) => set({ privatifsPlus: v })} placeholder="Ex. cave n° 12, place n° 31" />
              <Cases label="Parties communes" liste={COMMUNS} actifs={x.communs} onToggle={(v) => basculer("communs", v)} plus={x.communsPlus} onPlus={(v) => set({ communsPlus: v })} />
            </div>
          </Card>

          <Card title="Durée">
            <div className="space-y-3">
              <Field label="Date de prise d'effet">
                <input type="date" className="input" value={x.debut ?? ""} onChange={(e) => set({ debut: e.target.value || undefined })} />
              </Field>
              {x.type === "nu" ? (
                <Toggle
                  checked={x.dureeReduite}
                  onChange={(v) => set({ dureeReduite: v, dureeReduiteMois: x.dureeReduiteMois ?? 12 })}
                  label="Durée réduite (1 an minimum)"
                  hint="Seulement si un événement précis (professionnel ou familial) oblige le bailleur à reprendre le logement."
                />
              ) : (
                <Toggle checked={x.etudiant} onChange={(v) => set({ etudiant: v })} label="Location à un étudiant (9 mois)" hint="Bail de 9 mois, non reconduit : il prend fin à son terme." />
              )}
              {x.type === "nu" && x.dureeReduite && (
                <div className="grid grid-cols-[110px_1fr] items-end gap-3">
                  <Field label="Durée">
                    <NumInput value={x.dureeReduiteMois} onChange={(v) => set({ dureeReduiteMois: v })} suffix="mois" />
                  </Field>
                  <Field label="Événement justifiant">
                    <input className="input" value={x.evenement ?? ""} onChange={(e) => set({ evenement: e.target.value })} placeholder="Ex. mutation professionnelle prévue en…" />
                  </Field>
                </div>
              )}
              <Recap lignes={[["Durée du bail", dureeTexte(duree)], ["Fin de la première période", x.debut ? dateActe(veille(ajouterMois(x.debut, duree)), { majuscule: false }) : "—"]]} />
            </div>
          </Card>

          <Card title="Loyer">
            <div className="space-y-3">
              <Field label="Loyer mensuel hors charges">
                <Montant value={x.loyer} onChange={(v) => set({ loyer: v })} suffix="€" />
              </Field>
              <Toggle
                checked={x.decretRelocation}
                onChange={(v) => set({ decretRelocation: v })}
                label="Zone tendue : évolution du loyer encadrée à la relocation"
                hint="Toulouse est en zone tendue : le loyer ne peut pas dépasser celui du précédent locataire (sauf exceptions)."
              />
              {x.decretRelocation && (
                <>
                  <Toggle checked={x.premiereLocation} onChange={(v) => set({ premiereLocation: v })} label="Première location (ou logement inoccupé depuis plus de 18 mois)" />
                  {!x.premiereLocation && (
                    <div className="grid grid-cols-2 items-end gap-3">
                      <Field label="Loyer du dernier locataire">
                        <Montant value={x.dernierLoyer} onChange={(v) => set({ dernierLoyer: v })} suffix="€" />
                      </Field>
                      <Field label="Versé jusqu'au">
                        <input type="date" className="input" value={x.dernierLoyerDate ?? ""} onChange={(e) => set({ dernierLoyerDate: e.target.value || undefined })} />
                      </Field>
                      <Field label="Dernière révision">
                        <input type="date" className="input" value={x.derniereRevision ?? ""} onChange={(e) => set({ derniereRevision: e.target.value || undefined })} />
                      </Field>
                    </div>
                  )}
                </>
              )}
              <Toggle checked={x.encadrement} onChange={(v) => set({ encadrement: v })} label="Encadrement des loyers (loyer de référence)" hint="Toulouse n'est pas concernée : à laisser désactivé." />
              {x.encadrement && (
                <div className="grid grid-cols-2 items-end gap-3">
                  <Field label="Loyer de référence">
                    <Montant value={x.loyerReference} onChange={(v) => set({ loyerReference: v })} suffix="€/m²" />
                  </Field>
                  <Field label="Référence majorée">
                    <Montant value={x.loyerReferenceMajore} onChange={(v) => set({ loyerReferenceMajore: v })} suffix="€/m²" />
                  </Field>
                  <Field label="Complément de loyer">
                    <Montant value={x.complementLoyer} onChange={(v) => set({ complementLoyer: v })} suffix="€" />
                  </Field>
                  <Field label="Ce qui le justifie">
                    <input className="input" value={x.complementMotif ?? ""} onChange={(e) => set({ complementMotif: e.target.value })} />
                  </Field>
                </div>
              )}
              <div>
                <span className="label">Révision annuelle (IRL)</span>
                <div className="flex flex-wrap gap-2">
                  <PickChip active={x.revision === "anniversaire"} onClick={() => set({ revision: "anniversaire" })}>
                    Date anniversaire du bail
                  </PickChip>
                  <PickChip active={x.revision === "date"} onClick={() => set({ revision: "date" })}>
                    Autre date
                  </PickChip>
                </div>
                {x.revision === "date" && <input type="date" className="input mt-2" value={x.revisionDate ?? ""} onChange={(e) => set({ revisionDate: e.target.value || undefined })} />}
              </div>
              <Field label="Indice de référence" hint="Dernier indice publié à la signature. La liste se met à jour avec l'appli.">
                <select
                  className="input"
                  value={`${x.irl.annee}-${x.irl.trimestre}`}
                  onChange={(e) => {
                    const i = IRL.find((v) => `${v.annee}-${v.trimestre}` === e.target.value);
                    if (i) set({ irl: i });
                  }}
                >
                  {IRL.map((i) => (
                    <option key={`${i.annee}-${i.trimestre}`} value={`${i.annee}-${i.trimestre}`}>
                      {trimestreTexte(i.trimestre)} trimestre {i.annee} : {valeurIrl(i.valeur)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>

          <Card title="Charges et paiement">
            <div className="space-y-3">
              <div>
                <span className="label">Charges récupérables</span>
                <div className="flex flex-wrap gap-2">
                  <PickChip active={x.chargesMode === "provisions"} onClick={() => set({ chargesMode: "provisions" })}>
                    Provisions + régularisation
                  </PickChip>
                  <PickChip active={x.chargesMode === "periodique"} onClick={() => set({ chargesMode: "periodique" })}>
                    Sur justificatif
                  </PickChip>
                  {(x.type === "meuble" || coloc) && (
                    <PickChip active={x.chargesMode === "forfait"} onClick={() => set({ chargesMode: "forfait" })}>
                      Forfait
                    </PickChip>
                  )}
                </div>
              </div>
              {x.chargesMode !== "periodique" && (
                <Field label={x.chargesMode === "forfait" ? "Forfait de charges mensuel" : "Provision mensuelle"}>
                  <Montant value={x.charges} onChange={(v) => set({ charges: v })} suffix="€" />
                </Field>
              )}
              <Field label="Ce que couvrent les charges">
                <input className="input" value={x.chargesDetail} onChange={(e) => set({ chargesDetail: e.target.value })} />
              </Field>
              {coloc && (
                <>
                  <Toggle checked={x.assuranceColoc} onChange={(v) => set({ assuranceColoc: v })} label="Le bailleur assure le logement pour les colocataires" hint="Montant récupéré par douzième avec le loyer." />
                  {x.assuranceColoc && (
                    <Field label="Prime annuelle récupérable">
                      <Montant value={x.assuranceColocAnnuelle} onChange={(v) => set({ assuranceColocAnnuelle: v })} suffix="€" />
                    </Field>
                  )}
                </>
              )}
              <Choix label="Paiement" value={x.paiement} options={[["echoir", "À échoir (en début de mois)"], ["echu", "À terme échu"]]} onChange={(v) => set({ paiement: v })} />
              <Field label="Date de paiement">
                <input className="input" value={x.jourPaiement} onChange={(e) => set({ jourPaiement: e.target.value })} />
              </Field>
              <Recap lignes={[["Total de la première échéance", x.loyer ? eurosCts(premiereEcheance(x)) : "—"]]} />
            </div>
          </Card>

          <Card title="Dépôt de garantie">
            <div className="flex items-end gap-2">
              <Field label="Montant" className="flex-1">
                <Montant value={x.depot} onChange={(v) => set({ depot: v })} suffix="€" />
              </Field>
              {max != null && (
                <button type="button" className="btn-secondary shrink-0" onClick={() => set({ depot: max })}>
                  {x.type === "meuble" ? "2 mois" : "1 mois"}
                </button>
              )}
            </div>
            {max != null && <p className="mt-1.5 text-xs text-muted">Maximum : {max.toLocaleString("fr-FR")} € ({x.type === "meuble" ? "2 mois" : "1 mois"} de loyer hors charges).</p>}
          </Card>

          <Card title="Honoraires">
            <div className="space-y-3">
              <div className="flex items-end gap-2">
                <Field label="Frais d'agence du locataire (total)" className="flex-1">
                  <Montant value={totalHono} onChange={setTotalHono} suffix="€" />
                </Field>
                <button type="button" className="btn-secondary shrink-0" disabled={!totalHono} onClick={() => totalHono && set({ honorairesLocataire: repartir(totalHono, x.surface) })}>
                  Répartir
                </button>
              </div>
              <p className="-mt-1.5 text-xs text-muted">Répartition PATRIM : état des lieux à 3 €/m², le reste pour la visite, le dossier et le bail.</p>
              <div className="grid grid-cols-2 items-end gap-3">
                <Field label="Locataire : visite, dossier, bail" hint={plafonds ? `Plafond ${plafonds.bail.toLocaleString("fr-FR")} €` : undefined}>
                  <Montant value={x.honorairesLocataire.bail} onChange={(v) => set({ honorairesLocataire: { ...x.honorairesLocataire, bail: v } })} suffix="€" />
                </Field>
                <Field label="Locataire : état des lieux" hint={plafonds ? `Plafond ${plafonds.edl.toLocaleString("fr-FR")} €` : undefined}>
                  <Montant value={x.honorairesLocataire.edl} onChange={(v) => set({ honorairesLocataire: { ...x.honorairesLocataire, edl: v } })} suffix="€" />
                </Field>
              </div>
              <Toggle checked={x.memeHonoraires} onChange={(v) => set({ memeHonoraires: v, honorairesBailleur: v ? x.honorairesBailleur : { ...x.honorairesLocataire, autres: x.honorairesBailleur.autres } })} label="Le bailleur paie les mêmes montants" />
              {!x.memeHonoraires && (
                <div className="grid grid-cols-2 items-end gap-3">
                  <Field label="Bailleur : visite, dossier, bail">
                    <Montant value={x.honorairesBailleur.bail} onChange={(v) => set({ honorairesBailleur: { ...x.honorairesBailleur, bail: v } })} suffix="€" />
                  </Field>
                  <Field label="Bailleur : état des lieux">
                    <Montant value={x.honorairesBailleur.edl} onChange={(v) => set({ honorairesBailleur: { ...x.honorairesBailleur, edl: v } })} suffix="€" />
                  </Field>
                </div>
              )}
              <Field label="Bailleur : autres prestations (facultatif)">
                <Montant value={x.honorairesBailleur.autres} onChange={(v) => set({ honorairesBailleur: { ...x.honorairesBailleur, autres: v } })} suffix="€" />
              </Field>
              <Field label="Zone (plafonds)">
                <select className="input" value={x.zone} onChange={(e) => set({ zone: e.target.value as Bail["zone"] })}>
                  {ZONES.map((z) => (
                    <option key={z.v} value={z.v}>
                      {z.label} : {PLAFONDS.bail[z.v].toLocaleString("fr-FR")} €/m² + {PLAFONDS.edl.toLocaleString("fr-FR")} €/m²
                    </option>
                  ))}
                </select>
              </Field>
              <Recap
                lignes={[
                  ["Total locataire", eurosCts((x.honorairesLocataire.bail ?? 0) + (x.honorairesLocataire.edl ?? 0))],
                  ["Total bailleur", eurosCts((hb.bail ?? 0) + (hb.edl ?? 0) + (hb.autres ?? 0))],
                ]}
              />
            </div>
          </Card>

          <Card title="Travaux (facultatif)">
            <div className="space-y-3">
              <Field label="Travaux faits depuis le dernier locataire (montant et nature)">
                <textarea className="input min-h-[60px] text-sm" value={x.travaux ?? ""} onChange={(e) => set({ travaux: e.target.value })} />
              </Field>
              <Field label="Hausse de loyer après travaux du bailleur">
                <textarea className="input min-h-[60px] text-sm" value={x.majorationTravaux ?? ""} onChange={(e) => set({ majorationTravaux: e.target.value })} />
              </Field>
              <Field label="Baisse de loyer pour travaux du locataire">
                <textarea className="input min-h-[60px] text-sm" value={x.diminutionTravaux ?? ""} onChange={(e) => set({ diminutionTravaux: e.target.value })} />
              </Field>
            </div>
          </Card>

          {x.type === "meuble" && (
            <Card title="Mobilier (obligatoire)">
              <p className="mb-2 text-xs text-muted">Liste minimum du décret du 31 juillet 2015. Cochez ce qui est dans le logement.</p>
              <div className="grid gap-1">
                {MOBILIER.map((m) => (
                  <label key={m} className="flex min-h-10 cursor-pointer items-start gap-3 rounded-xl px-1 py-1.5 text-sm">
                    <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[#6c191e]" checked={x.mobilier.includes(m)} onChange={() => basculer("mobilier", m)} />
                    {m}
                  </label>
                ))}
              </div>
              <Field label="Inventaire détaillé (annexé au bail)" className="mt-3" hint="Une ligne par pièce. Peut aussi être fait avec l'état des lieux.">
                <textarea className="input min-h-[110px] text-sm" value={x.inventaire ?? ""} onChange={(e) => set({ inventaire: e.target.value })} placeholder={"Séjour : canapé 3 places, table basse, 4 chaises…\nChambre : lit 140 x 190, matelas, couette, rideaux occultants…"} />
              </Field>
            </Card>
          )}

          <Card title="Conditions particulières">
            <div className="space-y-2">
              <Toggle checked={x.catnat} onChange={(v) => set({ catnat: v })} label="Sinistre catastrophe naturelle ou technologique indemnisé" hint="Déclaration du bailleur." />
              {x.type === "meuble" && (
                <Toggle checked={x.menageSortie} onChange={(v) => set({ menageSortie: v })} label="Ménage de sortie refacturé sur justificatif" hint="Remplace l'ancien « forfait ménage de 250 € », qui risque d'être jugé comme une pénalité interdite." />
              )}
              <div className="grid grid-cols-2 items-end gap-3 pt-1">
                <Field label="Zone de bruit (aéroport)">
                  <input className="input" value={x.zoneBruit ?? ""} onChange={(e) => set({ zoneBruit: e.target.value })} placeholder="Laisser vide si aucune" />
                </Field>
                <Field label="Ancien locataire part le">
                  <input type="date" className="input" value={x.congePrecedent ?? ""} onChange={(e) => set({ congePrecedent: e.target.value || undefined })} />
                </Field>
              </div>
              <Field label="Autres conditions (facultatif)">
                <textarea className="input min-h-[70px] text-sm" value={x.conditionsParticulieres ?? ""} onChange={(e) => set({ conditionsParticulieres: e.target.value })} />
              </Field>
            </div>
          </Card>

          <Card title="Annexes jointes">
            <div className="grid gap-1">
              {ANNEXES.map((a) => (
                <label key={a} className="flex min-h-10 cursor-pointer items-start gap-3 rounded-xl px-1 py-1.5 text-sm">
                  <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[#6c191e]" checked={x.annexes.includes(a)} onChange={() => basculer("annexes", a)} />
                  {a}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">La notice d&apos;information, la liste des charges et celle des réparations locatives sont ajoutées au PDF automatiquement.</p>
          </Card>

          <Card title="Signataire pour PATRIM">
            <div className="grid grid-cols-2 items-end gap-3">
              <Field label="Nom">
                <input className="input" value={x.signataire.nom} onChange={(e) => set({ signataire: { ...x.signataire, nom: e.target.value } })} />
              </Field>
              <Field label="Qualité">
                <input className="input" value={x.signataire.qualite} onChange={(e) => set({ signataire: { ...x.signataire, qualite: e.target.value } })} />
              </Field>
              <Field label="E-mail (signature)">
                <input className="input" inputMode="email" value={x.signataire.email ?? ""} onChange={(e) => set({ signataire: { ...x.signataire, email: e.target.value } })} />
              </Field>
              <Field label="Portable (signature)">
                <input className="input" inputMode="tel" value={x.signataire.tel ?? ""} onChange={(e) => set({ signataire: { ...x.signataire, tel: e.target.value } })} />
              </Field>
            </div>
            <p className="mt-2 text-xs text-muted">Même signataire que pour les mandats, gardé sur ce téléphone.</p>
          </Card>

          {alertes.length > 0 && (
            <div className="card card-pad space-y-2">
              <h2 className="h-section">À vérifier</h2>
              {alertes.map((a) => (
                <p key={a.texte} className={cx("flex items-start gap-2 text-sm", a.niveau === "danger" ? "text-danger" : "text-warn")}>
                  <TriangleAlert size={15} className="mt-0.5 shrink-0" /> {a.texte}
                </p>
              ))}
            </div>
          )}

          <div className="card card-pad space-y-2">
            <button className="btn-primary w-full !h-12" onClick={voirPdf}>
              <FileSignature size={17} /> Voir le bail et créer le PDF
            </button>
            <Link href={`/biens/${b.id}/caution${x.acteId ? `?bail=${x.acteId}&nouvelle=1` : ""}`} className="btn-secondary w-full">
              <ShieldCheck size={16} /> Préparer un acte de cautionnement
            </Link>
            {totalManquants > 0 && <p className="text-center text-xs text-warn">{totalManquants} information{totalManquants > 1 ? "s" : ""} manquante{totalManquants > 1 ? "s" : ""} : elles apparaîtront en [À compléter].</p>}
            <button
              className="btn-ghost btn-sm w-full text-muted"
              onClick={() => {
                effacerBail(b.id);
                setEtape("parties");
                setX(bailInitial(b, proprietaires(), x.type));
              }}
            >
              <RotateCcw size={13} /> Recommencer un bail vierge
            </button>
          </div>
        </>
      )}

      {demande && (
        <BrouillonMail
          open
          onClose={() => setDemande(null)}
          titre={`Demander à ${nomComplet(demande.p)}`}
          to={demande.p.email}
          tel={demande.p.tel}
          {...mailDemandeBail(demande.p, demande.role, `${titreBail(x)} ${titrePublic(b)}`)}
        />
      )}
    </div>
  );
}

/* ---------- Petits éléments du formulaire ---------- */

/** Le bail du 1er novembre 2026 pour un an se termine le 31 octobre 2027. */
function veille(ymd: string) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Montant avec décimales (loyer, charges, surface) : 570,50. */
function Montant({ value, onChange, suffix }: { value?: number; onChange: (v?: number) => void; suffix?: string }) {
  const [txt, setTxt] = useState<string | null>(null);
  const shown = txt ?? (value != null ? value.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "");
  return (
    <div className="relative">
      <input
        inputMode="decimal"
        className={cx("input tabular-nums", suffix && "pr-12")}
        value={shown}
        onChange={(e) => {
          setTxt(e.target.value);
          const t = e.target.value.replace(/[\s  €]/g, "").replace(",", ".");
          const n = t === "" ? undefined : Number(t);
          onChange(n != null && !isNaN(n) ? Math.round(n * 100) / 100 : undefined);
        }}
        onBlur={() => setTxt(null)}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{suffix}</span>}
    </div>
  );
}

function Choix<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, l]) => (
          <PickChip key={v} active={value === v} onClick={() => onChange(v)}>
            {l}
          </PickChip>
        ))}
      </div>
    </div>
  );
}

function Cases({ label, liste, actifs, onToggle, plus, onPlus, placeholder = "Autre (facultatif)" }: { label: string; liste: readonly string[]; actifs: string[]; onToggle: (v: string) => void; plus?: string; onPlus: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-2">
        {liste.map((v) => (
          <PickChip key={v} active={actifs.includes(v)} onClick={() => onToggle(v)}>
            {actifs.includes(v) && <Check size={12} />} {v}
          </PickChip>
        ))}
      </div>
      <input className="input mt-2" value={plus ?? ""} onChange={(e) => onPlus(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function Recap({ lignes }: { lignes: [string, ReactNode][] }) {
  return (
    <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm space-y-1">
      {lignes.map(([l, v]) => (
        <div key={l} className="flex justify-between gap-3">
          <span className="text-muted">{l}</span>
          <span className="font-semibold">{v}</span>
        </div>
      ))}
    </div>
  );
}
