"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ClipboardPaste, FileUp, Upload } from "lucide-react";
import { Badge, Sheet } from "@/components/ui";
import { create, getAll, update, useCollection } from "@/lib/store";
import { nomComplet, today } from "@/lib/format";
import { locationSeule, type BienLocation, type InfosLocation } from "@/components/location/bienLocation";
import { candidats, fusionner, jourJ, lireListe, relocationDe, sansAccent, titreDepuisLigne, type InfosRelocation, type LigneListe } from "./relocation";
import type { Bien } from "@/lib/types";

/* ============================================================
   Import de la « LISTE LOCATIONS » (onglet « En publicité ») :
   fichier CSV exporté de Google Sheets, ou cellules copiées et
   collées. Lu sur l'appareil, puis rangé dans les biens du Hub
   Location (communs à l'équipe). Réimporter met la liste à jour
   sans toucher à ce qui a été saisi dans le Hub.
   ============================================================ */

const NOUVEAU = "nouveau";
const IGNORER = "ignorer";

export function ImportListe({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items: biens } = useCollection("biens");
  const { items: contacts } = useCollection("contacts");
  const [texte, setTexte] = useState("");
  const [choix, setChoix] = useState<Record<number, string>>({});
  const [bilan, setBilan] = useState<{ crees: number; maj: number } | null>(null);
  const fichier = useRef<HTMLInputElement>(null);

  const loc = useMemo(() => biens.filter(locationSeule), [biens]);
  const lignes = useMemo(() => (texte ? lireListe(texte) : []), [texte]);
  const proposes = useMemo(() => lignes.map((l) => candidats(l, loc)), [lignes, loc]);
  const cible = (i: number) => choix[i] ?? proposes[i][0]?.id ?? NOUVEAU;

  function fermer() {
    setTexte("");
    setChoix({});
    setBilan(null);
    onClose();
  }

  async function lireFichier(f?: File) {
    if (!f) return;
    setTexte(await f.text());
    setChoix({});
  }

  function proprietaireIds(nom?: string) {
    if (!nom) return undefined;
    const n = sansAccent(nom).toLowerCase().replace(/\s+/g, " ").trim();
    const c = contacts.find((x) => x.roles?.includes("vendeur") && [nomComplet(x), `${x.nom ?? ""} ${x.prenom ?? ""}`].some((s) => sansAccent(s).toLowerCase().trim() === n));
    return c ? [c.id] : undefined;
  }

  function importer() {
    const auj = today();
    let crees = 0;
    let maj = 0;
    lignes.forEach((l, i) => {
      const c = cible(i);
      if (c === IGNORER) return;
      const statut: InfosLocation["statut"] = l.vacant || (l.sortie && l.sortie <= auj) ? "a_louer" : "preavis";
      if (c === NOUVEAU) {
        const r = fusionner(undefined, l, auj);
        create("biens", {
          transaction: "location",
          statut: "retire",
          titre: titreDepuisLigne(l),
          type: l.typeBien,
          adresse: l.adresse,
          codePostal: l.codePostal,
          ville: l.ville,
          quartier: l.quartier,
          surface: l.surface,
          pieces: l.pieces,
          etage: l.etage,
          vendeurIds: proprietaireIds(l.proprietaire),
          location: { statut, meuble: l.meuble, relocation: r } as InfosRelocation,
        } as Omit<BienLocation, "id" | "createdAt" | "updatedAt">);
        crees++;
        return;
      }
      const b = getAll("biens").find((x) => x.id === c);
      if (!b) return;
      const avant = (b as BienLocation).location as InfosRelocation | undefined;
      const r = fusionner(avant?.relocation?.fermeeLe ? undefined : avant?.relocation, l, auj);
      update("biens", b.id, {
        surface: b.surface ?? l.surface,
        pieces: b.pieces ?? l.pieces,
        quartier: b.quartier ?? l.quartier,
        codePostal: b.codePostal ?? l.codePostal,
        adresse: l.adresse || b.adresse,
        vendeurIds: b.vendeurIds?.length ? b.vendeurIds : proprietaireIds(l.proprietaire),
        location: { ...(avant ?? {}), statut: avant?.statut === "a_louer" ? "a_louer" : statut, meuble: avant?.meuble ?? l.meuble, relocation: r },
      } as Partial<Bien>);
      maj++;
    });
    setBilan({ crees, maj });
  }

  return (
    <Sheet
      open={open}
      onClose={fermer}
      title="Importer la liste loc"
      wide
      footer={
        bilan ? (
          <button className="btn-primary w-full !h-11" onClick={fermer}>
            <Check size={16} /> Terminé
          </button>
        ) : lignes.length ? (
          <button className="btn-primary w-full !h-11" onClick={importer}>
            <Upload size={16} /> Importer {lignes.filter((_, i) => cible(i) !== IGNORER).length} logements
          </button>
        ) : undefined
      }
    >
      {bilan ? (
        <div className="space-y-2 text-sm">
          <p className="font-semibold">C&apos;est fait.</p>
          <p className="text-muted">
            {bilan.maj} dossier{bilan.maj > 1 ? "s" : ""} mis à jour, {bilan.crees} logement{bilan.crees > 1 ? "s" : ""} ajouté{bilan.crees > 1 ? "s" : ""} au Hub Location. Ce qui a été saisi dans le Hub (états des lieux, caution, ICS) n&apos;a pas bougé.
          </p>
        </div>
      ) : !lignes.length ? (
        <div className="space-y-4 text-sm">
          <p className="text-muted">
            Dans Google Sheets, ouvrez « LISTE LOCATIONS », onglet <b>En publicité</b>. Deux façons de faire, au choix :
          </p>
          <ol className="list-decimal space-y-1.5 pl-5 text-muted">
            <li>
              Sur ordinateur : <b>Fichier › Télécharger › Valeurs séparées par des virgules (.csv)</b>, puis choisissez le fichier ci-dessous.
            </li>
            <li>Sur téléphone ou ordinateur : sélectionnez tout l&apos;onglet (avec la ligne « ETAT, DPE… »), copiez, puis collez dans le cadre.</li>
          </ol>
          <input ref={fichier} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => lireFichier(e.target.files?.[0])} />
          <button className="btn-secondary w-full !h-11" onClick={() => fichier.current?.click()}>
            <FileUp size={16} /> Choisir le fichier .csv
          </button>
          <label className="block">
            <span className="label inline-flex items-center gap-1.5">
              <ClipboardPaste size={13} /> Ou collez les cellules ici
            </span>
            <textarea className="input min-h-[120px] font-mono text-[12px]" value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="ETAT	DPE	Relance DPE	GLI	Type de logement…" />
          </label>
          {texte && <p className="text-[13px] text-danger">Je ne trouve pas la ligne de titres (« ETAT », « Adresse »…). Vérifiez que l&apos;onglet « En publicité » est copié en entier.</p>}
          <p className="text-[12px] text-muted">Le fichier est lu sur cet appareil. Les logements vont dans le Hub Location, visible de l&apos;équipe, comme la liste aujourd&apos;hui.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            {lignes.length} logements lus. Pour chacun, vérifiez le bien du Hub auquel il se rattache (je propose celui de la même adresse).
          </p>
          <ul className="space-y-2">
            {lignes.map((l, i) => (
              <Ligne key={i} l={l} biens={proposes[i]} tous={loc} value={cible(i)} onChange={(v) => setChoix((c) => ({ ...c, [i]: v }))} />
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}

function Ligne({ l, biens, tous, value, onChange }: { l: LigneListe; biens: Bien[]; tous: Bien[]; value: string; onChange: (v: string) => void }) {
  const autres = tous.filter((b) => !biens.includes(b));
  return (
    <li className="rounded-2xl border border-line/70 bg-surface p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold text-sm">{titreDepuisLigne(l)}</span>
        {l.vacant ? <Badge tone="danger">Vacant</Badge> : l.sortie ? <Badge tone="warn">Libre le {jourJ(l.sortie)}</Badge> : null}
        {l.etat && <Badge tone="info">{l.etat.length > 34 ? `${l.etat.slice(0, 32)}…` : l.etat}</Badge>}
      </div>
      <div className="text-[13px] text-muted">{l.adresseBrute}</div>
      <select className="input !h-10 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {biens.map((b) => (
          <option key={b.id} value={b.id}>
            Rattacher à : {b.titre || b.adresse} {relocationDe(b) ? "(dossier existant)" : ""}
          </option>
        ))}
        <option value={NOUVEAU}>Nouveau logement dans le Hub</option>
        {autres.length > 0 && (
          <optgroup label="Autre bien à louer">
            {autres.map((b) => (
              <option key={b.id} value={b.id}>
                {b.titre || b.adresse} · {b.adresse}
              </option>
            ))}
          </optgroup>
        )}
        <option value={IGNORER}>Ne pas importer</option>
      </select>
    </li>
  );
}
