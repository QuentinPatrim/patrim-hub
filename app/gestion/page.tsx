"use client";

/* Hub Gestion : relocations (du préavis au nouveau bail), cautions à restituer.
   C'est la « liste loc » de l'équipe, reliée aux biens du Hub Location. */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CalendarDays, ChevronRight, FileUp, FolderKanban, KeyRound, Phone, Plus, Search, Users, Wallet, X } from "lucide-react";
import { Badge, Empty, Field, PageHeader, Sheet, Tabs, cx } from "@/components/ui";
import { update, useCollection } from "@/lib/store";
import { eur, nomComplet, today } from "@/lib/format";
import { locationDe, locationSeule } from "@/components/location/bienLocation";
import { ImportListe } from "@/components/relocation/ImportListe";
import {
  GROUPES_TYPE,
  avancement,
  correspond,
  groupeType,
  heureVisite,
  loueDepuis,
  visitesPrevues,
  biensEnRelocation,
  dateSortie,
  echeanceCaution,
  etapesFaites,
  jourJ,
  patchRelocation,
  relocationDe,
  situation,
  type Relocation,
} from "@/components/relocation/relocation";
import type { Bien } from "@/lib/types";

type Vue = "relocations" | "cautions" | "fermes";

export default function Gestion() {
  const { items: biens } = useCollection("biens");
  const { items: rdvs } = useCollection("rdvs");
  const [vue, setVue] = useState<Vue>("relocations");
  const [importer, setImporter] = useState(false);
  const [preavis, setPreavis] = useState(false);
  const [q, setQ] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const auj = today();

  const dossiers = useMemo(() => biensEnRelocation(biens.filter(locationSeule)), [biens]);

  // Biens importés de la liste loc avant le 01/11 mis « À louer » sans annonce en ligne : ils repassent « En attente » (ou « En préavis »).
  useEffect(() => {
    dossiers.forEach((b) => {
      const loc = locationDe(b)!;
      const r = relocationDe(b)!;
      if (loc.statut === "a_louer" && !loc.site?.ref && r.importeLe && !r.fermeeLe)
        update("biens", b.id, patchRelocation(b, r, { statut: r.vacant || (r.sortie && r.sortie <= today()) ? "en_attente" : "preavis" }));
    });
  }, [dossiers]);
  const ouverts = dossiers
    .filter((b) => !relocationDe(b)!.fermeeLe)
    .filter((b) => !q.trim() || correspond(b, q))
    .sort((a, b) => cleTri(relocationDe(a)!).localeCompare(cleTri(relocationDe(b)!)));
  const fermes = dossiers.filter((b) => relocationDe(b)!.fermeeLe);
  const cautions = dossiers
    .map((b) => ({ b, e: echeanceCaution(relocationDe(b)!, locationDe(b)?.loyer, auj) }))
    .filter((x) => x.e)
    .sort((a, b) => a.e!.limite.localeCompare(b.e!.limite));
  const enRetard = cautions.filter((x) => x.e!.reste < 0).length;

  if (!mounted) return <div className="skeleton h-56 !rounded-3xl" />;

  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        title="Gestion"
        subtitle="Du préavis du locataire au nouveau bail, et la restitution du dépôt de garantie. ICS reste le logiciel de l'agence : ici, on suit et on prépare."
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary btn-sm !h-10" onClick={() => setImporter(true)}>
              <FileUp size={15} /> Liste loc
            </button>
            <button className="btn-primary btn-sm !h-10" onClick={() => setPreavis(true)}>
              <Plus size={15} /> Préavis reçu
            </button>
          </div>
        }
      />

      {enRetard > 0 && (
        <button onClick={() => setVue("cautions")} className="card card-pad flex w-full items-center gap-3 !border-danger/40 text-left">
          <AlertTriangle size={18} className="shrink-0 text-danger" />
          <span className="text-sm">
            <b>{enRetard} dépôt{enRetard > 1 ? "s" : ""} de garantie</b> à restituer hors délai : la majoration de 10 % du loyer court par mois commencé.
          </span>
        </button>
      )}

      <label className="relative block">
        <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          className="input !h-12 !pl-10 !pr-10"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setVue("relocations");
          }}
          placeholder="Quelqu'un appelle ? Rue, quartier, T2, nom, téléphone…"
          enterKeyHint="search"
        />
        {q && (
          <button className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center text-muted" aria-label="Effacer" onClick={() => setQ("")}>
            <X size={16} />
          </button>
        )}
      </label>

      <Tabs<Vue>
        value={vue}
        onChange={setVue}
        items={[
          { value: "relocations", label: "Relocations", count: ouverts.length },
          { value: "cautions", label: "Cautions", count: cautions.length },
          { value: "fermes", label: "Fermés", count: fermes.length },
        ]}
      />

      {vue === "relocations" &&
        (ouverts.length ? (
          <div className="space-y-5">
            {GROUPES_TYPE.map((g) => {
              const liste = ouverts.filter((b) => groupeType(b) === g);
              if (!liste.length) return null;
              return (
                <section key={g}>
                  <h2 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                    {g} <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] normal-case">{liste.length}</span>
                  </h2>
                  <ul className="space-y-2">
                    {liste.map((b) => (
                      <CarteRelocation key={b.id} b={b} rdvs={rdvs} auj={auj} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : q.trim() ? (
          <p className="card card-pad text-sm text-muted">Aucun logement ne correspond à « {q} ». Essayez le nom de la rue seul, le quartier ou le type (T2).</p>
        ) : (
          <Empty
            icon={<FolderKanban />}
            title="Aucune relocation en cours"
            text="Importez la liste loc de l'équipe, ou ouvrez un dossier dès qu'un préavis arrive."
            action={
              <button className="btn-primary" onClick={() => setImporter(true)}>
                <FileUp size={16} /> Importer la liste loc
              </button>
            }
          />
        ))}

      {vue === "cautions" &&
        (cautions.length ? (
          <ul className="space-y-2">
            {cautions.map(({ b, e }) => {
              const r = relocationDe(b)!;
              return (
                <li key={b.id}>
                  <Link href={`/gestion/${b.id}#caution`} className="card card-pad card-hover flex items-center gap-3">
                    <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", e!.reste < 0 ? "bg-danger/10 text-danger" : e!.reste <= 7 ? "bg-warn/10 text-warn" : "bg-brand/10 text-brand")}>
                      <Wallet size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{b.titre || b.adresse}</span>
                      <span className="block truncate text-[13px] text-muted">
                        {r.sortant?.nom || "Locataire sortant"} · EDL de sortie le {jourJ(r.edls!)}
                      </span>
                    </span>
                    <span className="text-right">
                      <Badge tone={e!.reste < 0 ? "danger" : e!.reste <= 7 ? "warn" : "neutral"}>{e!.reste < 0 ? `${-e!.reste} j de retard` : `${e!.reste} j`}</Badge>
                      <span className="mt-1 block text-[11px] text-muted">avant le {jourJ(e!.limite)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty icon={<Wallet />} title="Aucune caution à restituer" text="Dès qu'une date d'état des lieux de sortie est saisie dans un dossier, le délai de restitution s'affiche ici." />
        ))}

      {vue === "fermes" &&
        (fermes.length ? (
          <ul className="space-y-2">
            {fermes.map((b) => (
              <CarteRelocation key={b.id} b={b} rdvs={rdvs} auj={auj} />
            ))}
          </ul>
        ) : (
          <p className="card card-pad text-sm text-muted">Aucun dossier fermé.</p>
        ))}

      <Link href="/echeancier" className="card card-pad card-hover flex items-center gap-3 text-sm">
        <CalendarClock size={18} className="text-brand" />
        <span className="flex-1">
          <b>Échéancier</b> des logements loués : révisions de loyer, fins de bail, assurances
        </span>
        <ChevronRight size={16} className="text-muted" />
      </Link>

      <ImportListe open={importer} onClose={() => setImporter(false)} />
      <NouveauPreavis open={preavis} onClose={() => setPreavis(false)} biens={biens.filter(locationSeule)} />
    </div>
  );
}

const cleTri = (r: Relocation) => (r.vacant ? "0" : r.sortie ? `1${r.sortie}` : "2");

/** Fiche d'appel : en un regard, de quel logement on parle, qui l'occupe, les dispos, les candidats et les visites. */
function CarteRelocation({ b, rdvs, auj }: { b: Bien; rdvs: Parameters<typeof etapesFaites>[2]; auj: string }) {
  const r = relocationDe(b)!;
  const av = avancement(b, r, rdvs, auj);
  const s = situation(r, auj);
  const depuis = loueDepuis(b);
  const loyer = locationDe(b)?.loyer ?? r.loyerListe;
  const cands = (r.candidats ?? []).filter((c) => c.statut !== "refuse");
  const contactes = cands.filter((c) => c.contacteLe).length;
  const visites = visitesPrevues(r, auj);
  const retenu = (r.candidats ?? []).find((c) => c.statut === "retenu");
  const occupe = !r.vacant && !(r.sortie && r.sortie <= auj);
  return (
    <li>
      <Link href={`/gestion/${b.id}`} className="card card-pad card-hover block space-y-2.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">
              {b.titre || b.adresse}
              {loyer ? <span className="font-normal text-muted"> · {eur(loyer)}</span> : null}
            </div>
            <div className="text-[13px] text-muted">
              {b.adresse}
              {b.surface ? ` · ${b.surface.toLocaleString("fr-FR")} m²` : ""}
              {r.proprietaire ? ` · ${r.proprietaire}` : ""}
            </div>
          </div>
          <Badge tone={s.tone}>{s.label}</Badge>
        </div>
        {r.etat && <div className="rounded-xl bg-surface-2 px-3 py-2 text-[13px] font-medium">{r.etat}</div>}
        <ul className="space-y-1 text-[13px]">
          <li className="flex gap-2">
            <KeyRound size={14} className="mt-0.5 shrink-0 text-muted" />
            <span>
              {occupe ? (
                <>
                  Loué{depuis ? ` depuis le ${jourJ(depuis)}` : ""}
                  {r.sortant?.nom ? ` · ${r.sortant.nom}` : ""}
                  {r.sortie ? `, part le ${jourJ(r.sortie)}` : ""}
                </>
              ) : (
                <>Vide{r.sortie && r.sortie <= auj ? ` depuis le ${jourJ(r.sortie)}` : ""}</>
              )}
            </span>
          </li>
          {r.disponibilites && (
            <li className="flex gap-2">
              <Phone size={14} className="mt-0.5 shrink-0 text-muted" />
              <span className="line-clamp-2">{occupe ? "Dispos du locataire : " : "Visites : "}{r.disponibilites}</span>
            </li>
          )}
          <li className="flex gap-2">
            <Users size={14} className="mt-0.5 shrink-0 text-muted" />
            <span>
              {retenu ? (
                <>
                  <b>Retenu : {retenu.nom}</b>
                </>
              ) : cands.length ? (
                `${cands.length} candidat${cands.length > 1 ? "s" : ""}${contactes ? `, ${contactes} contacté${contactes > 1 ? "s" : ""}` : ""}`
              ) : (
                "Aucun candidat"
              )}
            </span>
          </li>
          {visites.length > 0 && (
            <li className="flex gap-2">
              <CalendarDays size={14} className="mt-0.5 shrink-0 text-brand" />
              <span>
                {visites.slice(0, 2).map((v, i) => (
                  <span key={v.id}>
                    {i ? " · " : ""}
                    <b>{heureVisite(v.visite!)}</b> {v.nom}
                    {v.visitePar ? ` (${v.visitePar})` : ""}
                  </span>
                ))}
                {visites.length > 2 ? ` · +${visites.length - 2}` : ""}
              </span>
            </li>
          )}
        </ul>
        <div className="flex flex-wrap items-center gap-1.5">
          {b.type !== "parking" && <Badge tone={r.dpeOk ? "ok" : r.dpeOk === false ? "danger" : "neutral"}>DPE {r.dpeOk ? "ok" : r.dpeOk === false ? "manquant" : "?"}</Badge>}
          <Badge tone={r.gli ? "ok" : "neutral"}>{r.gli ? "GLI" : "Sans GLI"}</Badge>
          {av.suite && !r.fermeeLe && <span className="min-w-0 truncate text-[12px] text-muted">Suite : {av.suite.label}</span>}
          <span className="ml-auto text-[12px] text-muted">
            {av.fait}/{av.total}
          </span>
        </div>
      </Link>
    </li>
  );
}

function NouveauPreavis({ open, onClose, biens }: { open: boolean; onClose: () => void; biens: Bien[] }) {
  const { items: contacts } = useCollection("contacts");
  const [bienId, setBienId] = useState("");
  const [recuLe, setRecuLe] = useState(today());
  const [duree, setDuree] = useState<1 | 3>(1);
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const possibles = biens.filter((b) => !relocationDe(b) || relocationDe(b)!.fermeeLe).sort((a, b) => (a.titre || a.adresse).localeCompare(b.titre || b.adresse));

  function choisir(id: string) {
    setBienId(id);
    const b = biens.find((x) => x.id === id);
    const loc = (locationDe(b!)?.locataireIds ?? []).map((i) => contacts.find((c) => c.id === i)).filter(Boolean);
    if (loc.length) {
      setNom(loc.map((c) => nomComplet(c!)).join(" et "));
      setTel(loc.map((c) => c!.tel).filter(Boolean).join(" / "));
    }
  }

  function ouvrir() {
    const b = biens.find((x) => x.id === bienId);
    if (!b) return;
    const r: Relocation = {
      ouverte: today(),
      preavis: { recuLe, duree, lrar: true },
      sortie: dateSortie(recuLe, duree),
      sortant: nom || tel ? { nom: nom || undefined, tel: tel || undefined } : undefined,
      proprietaire: relocationDe(b)?.proprietaire,
    };
    update("biens", b.id, patchRelocation(b, r, { statut: "preavis" }));
    onClose();
    window.location.href = `/gestion/${b.id}`;
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Préavis reçu"
      footer={
        <button className="btn-primary w-full !h-11" disabled={!bienId || !recuLe} onClick={ouvrir}>
          Ouvrir le dossier de relocation
        </button>
      }
    >
      <div className="space-y-3">
        <Field label="Logement">
          <select className="input" value={bienId} onChange={(e) => choisir(e.target.value)}>
            <option value="">Choisir…</option>
            {possibles.map((b) => (
              <option key={b.id} value={b.id}>
                {b.titre || b.adresse} · {b.adresse}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Lettre reçue le" hint="Date de réception du recommandé.">
            <input type="date" className="input" value={recuLe} onChange={(e) => setRecuLe(e.target.value)} />
          </Field>
          <Field label="Préavis" hint="Toulouse est en zone tendue : 1 mois.">
            <select className="input" value={duree} onChange={(e) => setDuree(+e.target.value as 1 | 3)}>
              <option value={1}>1 mois</option>
              <option value={3}>3 mois</option>
            </select>
          </Field>
        </div>
        {recuLe && (
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
            Logement libre le <b>{jourJ(dateSortie(recuLe, duree))}</b>
          </p>
        )}
        <Field label="Locataire sortant">
          <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="NOM Prénom" />
        </Field>
        <Field label="Téléphone">
          <input className="input" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} />
        </Field>
        <p className="text-[12px] text-muted">Pensez à enregistrer le préavis dans ICS comme d&apos;habitude : la fiche du dossier vous redonne les dates à saisir.</p>
      </div>
    </Sheet>
  );
}
