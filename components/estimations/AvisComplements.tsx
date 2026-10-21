"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, Field, cx } from "@/components/ui";
import { PhotosEditor } from "@/components/biens/PhotosEditor";
import { Choix, Interrupteur, Nombre } from "./controls";
import { DPE_CLASSES } from "./shared";
import { EQUIPEMENTS, asAvis, avisComplet, lignes, type AvisPlus } from "./avis";
import { eur } from "@/lib/format";
import { uid } from "@/lib/store";
import type { Bien, Contact, Estimation } from "@/lib/types";

/**
 * Carte « Pour l'avis de valeur » : tout ce que le PDF reprend en plus de l'estimation
 * (photos, énergie, charges, points forts, concurrence…). Pré-rempli avec le bien rattaché.
 * Les textes sont enregistrés en quittant le champ, le reste tout de suite.
 */
export function AvisComplements({ e, bien, proprio, maj }: { e: Estimation; bien?: Bien; proprio?: Contact; maj: (patch: Partial<Estimation>) => void }) {
  const [d, setD] = useState<AvisPlus>(() => avisComplet(e, bien));
  const [forts, setForts] = useState("");
  const [vigilance, setVigilance] = useState("");
  const [nouveau, setNouveau] = useState<{ adresse: string; prix?: number; surface?: number; portail: string }>({ adresse: "", portail: "" });
  const touche = useRef<AvisPlus>({});
  const derniere = useRef(e);
  derniere.current = e;

  useEffect(() => {
    const a = avisComplet(e, bien);
    setD(a);
    setForts((a.pointsForts ?? []).join("\n"));
    setVigilance((a.pointsVigilance ?? []).join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.id, bien?.id]);

  const enregistrer = () => {
    if (!Object.keys(touche.current).length) return;
    maj({ avis: { ...(asAvis(derniere.current).avis ?? {}), ...touche.current } } as Partial<Estimation>);
    touche.current = {};
  };
  const set = (patch: AvisPlus) => {
    setD((x) => ({ ...x, ...patch }));
    Object.assign(touche.current, patch);
  };
  const tout = (patch: AvisPlus) => {
    set(patch);
    enregistrer();
  };

  const enVente = d.enVente ?? [];
  const ajouterEnVente = () => {
    if (!nouveau.adresse.trim() || !nouveau.prix) return;
    tout({ enVente: [...enVente, { id: uid(), adresse: nouveau.adresse.trim(), prix: nouveau.prix, surface: nouveau.surface, portail: nouveau.portail.trim() || undefined }] });
    setNouveau({ adresse: "", portail: "" });
  };

  return (
    <div id="avis" className="scroll-mt-20" onBlur={enregistrer}>
      <Card title="Pour l'avis de valeur">
        <div className="space-y-5">
          <p className="text-[13px] text-muted">
            Tout ce qui est rempli ici apparaît dans le PDF. {bien ? "Les informations connues du bien sont reprises automatiquement." : "Les champs laissés vides ne sont pas affichés."}
          </p>

          <div>
            <span className="label">Photos (la première fait la couverture)</span>
            <PhotosEditor photos={d.photos ?? []} onChange={(photos) => tout({ photos })} />
            <div className="mt-3">
              <Interrupteur checked={!!d.pagesPhotos} onChange={(pagesPhotos) => tout({ pagesPhotos })} label="Ajouter les pages photos" hint="Toutes les photos en fin de document, 8 par page." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Année de construction">
              <Nombre value={d.annee} onChange={(annee) => set({ annee })} placeholder="1975" />
            </Field>
            <Field label="Taxe foncière">
              <Nombre value={d.taxeFonciere} onChange={(taxeFonciere) => set({ taxeFonciere })} unit="€/an" />
            </Field>
          </div>

          <div>
            <span className="label">Émissions de gaz (GES)</span>
            <Choix value={d.ges} onChange={(ges) => tout({ ges })} allowEmpty options={DPE_CLASSES.map((c) => ({ value: c, label: c }))} />
          </div>

          <div className="space-y-3">
            <Interrupteur checked={!!d.copro} onChange={(copro) => tout({ copro })} label="En copropriété" />
            {d.copro && (
              <Field label="Charges de copropriété">
                <Nombre value={d.chargesMois} onChange={(chargesMois) => set({ chargesMois })} unit="€/mois" decimal />
              </Field>
            )}
          </div>

          <div>
            <span className="label">Équipements et annexes</span>
            <div className="flex flex-wrap gap-2">
              {EQUIPEMENTS.map((x) => {
                const on = (d.equipements ?? []).includes(x);
                return (
                  <button
                    key={x}
                    type="button"
                    onClick={() => tout({ equipements: on ? (d.equipements ?? []).filter((y) => y !== x) : EQUIPEMENTS.filter((y) => y === x || (d.equipements ?? []).includes(y)) })}
                    className={cx("h-10 rounded-full border px-3.5 text-sm transition", on ? "border-accent bg-accent/10 font-medium text-accent" : "border-line hover:bg-surface-2")}
                  >
                    {x}
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Descriptif et prestations">
            <textarea className="input text-[13px]" rows={4} value={d.descriptif ?? ""} onChange={(ev) => set({ descriptif: ev.target.value })} placeholder="Séjour lumineux, cuisine équipée, double vitrage…" />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Points forts" hint="Un par ligne.">
              <textarea
                className="input text-[13px]"
                rows={4}
                value={forts}
                onChange={(ev) => {
                  setForts(ev.target.value);
                  set({ pointsForts: lignes(ev.target.value) });
                }}
              />
            </Field>
            <Field label="Points de vigilance" hint="Un par ligne.">
              <textarea
                className="input text-[13px]"
                rows={4}
                value={vigilance}
                onChange={(ev) => {
                  setVigilance(ev.target.value);
                  set({ pointsVigilance: lignes(ev.target.value) });
                }}
              />
            </Field>
          </div>

          <div className="space-y-3">
            <Field label="Valeur locative" hint="Facultatif : affiche le loyer et le rendement brut.">
              <Nombre value={d.loyer} onChange={(loyer) => set({ loyer })} unit="€/mois HC" decimal />
            </Field>
            <Interrupteur checked={!!d.loue} onChange={(loue) => tout({ loue })} label="Vendu loué" hint="Affiche la valeur libre et la valeur occupée." />
            {d.loue && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Valeur occupée basse">
                  <Nombre value={d.basLoue} onChange={(basLoue) => set({ basLoue })} unit="€" decimal />
                </Field>
                <Field label="Valeur occupée haute">
                  <Nombre value={d.hautLoue} onChange={(hautLoue) => set({ hautLoue })} unit="€" decimal />
                </Field>
              </div>
            )}
          </div>

          <div>
            <span className="label">Biens actuellement en vente (concurrence)</span>
            {enVente.length > 0 && (
              <ul className="mb-3 divide-y divide-line rounded-xl border border-line">
                {enVente.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.adresse}</div>
                      <div className="text-xs text-muted">{[eur(c.prix), c.surface ? `${c.surface} m²` : "", c.portail].filter(Boolean).join(" · ")}</div>
                    </div>
                    <button type="button" className="btn-ghost btn-sm !px-2.5 text-danger" aria-label="Retirer" onClick={() => tout({ enVente: enVente.filter((x) => x.id !== c.id) })}>
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-2 gap-2">
              <input className="input col-span-2" value={nouveau.adresse} onChange={(ev) => setNouveau({ ...nouveau, adresse: ev.target.value })} placeholder="Adresse ou rue" />
              <Nombre value={nouveau.prix} onChange={(prix) => setNouveau({ ...nouveau, prix })} unit="€" placeholder="Prix" />
              <Nombre value={nouveau.surface} onChange={(surface) => setNouveau({ ...nouveau, surface })} unit="m²" placeholder="Surface" decimal />
              <input className="input" value={nouveau.portail} onChange={(ev) => setNouveau({ ...nouveau, portail: ev.target.value })} placeholder="Portail (SeLoger…)" />
              <button type="button" className="btn-secondary" disabled={!nouveau.adresse.trim() || !nouveau.prix} onClick={ajouterEnVente}>
                <Plus size={15} /> Ajouter
              </button>
            </div>
          </div>

          <Field label="Adresse du propriétaire (couverture)">
            <input className="input" value={d.clientAdresse ?? ""} onChange={(ev) => set({ clientAdresse: ev.target.value || undefined })} placeholder={proprio?.adresse || "Facultatif"} />
          </Field>
        </div>
      </Card>
    </div>
  );
}
