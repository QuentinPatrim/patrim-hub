"use client";

import { useState } from "react";
import { CalendarPlus, Check, Phone, Plus, Trash2, UserPlus } from "lucide-react";
import { Badge, Field, cx } from "@/components/ui";
import { create } from "@/lib/store";
import { today } from "@/lib/format";
import { conseiller } from "@/lib/equipe";
import { adresseComplete } from "@/components/biens/utils";
import type { Bien } from "@/lib/types";
import { STATUTS_CANDIDAT, heureVisite, jourJ, nouveauCandidat, type Candidat, type StatutCandidat } from "./relocation";

/* ============================================================
   Candidats d'un logement, visibles de toute l'équipe : qui a
   appelé, quand on l'a contacté, sa visite (date, qui la fait),
   où en est son dossier. Une visite peut partir dans l'agenda.
   ============================================================ */

const ORDRE: Record<StatutCandidat, number> = { retenu: 0, dossier: 1, visite: 2, a_rappeler: 3, nouveau: 4, refuse: 5 };
const telHref = (t: string) => `tel:${t.split("/")[0].replace(/[^\d+]/g, "")}`;

export function Candidats({ b, liste, onChange }: { b: Bien; liste: Candidat[]; onChange: (c: Candidat[]) => void }) {
  const auj = today();
  const [ajout, setAjout] = useState(false);
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const [note, setNote] = useState("");
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState<Record<string, Partial<Candidat>>>({});

  const tries = [...liste].sort((a, z) => ORDRE[a.statut] - ORDRE[z.statut] || (z.contacteLe ?? z.ajouteLe).localeCompare(a.contacteLe ?? a.ajouteLe));
  const maj = (id: string, p: Partial<Candidat>) => onChange(liste.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const val = (c: Candidat) => ({ ...c, ...brouillon[c.id] });
  const ecrire = (id: string, p: Partial<Candidat>) => setBrouillon((x) => ({ ...x, [id]: { ...x[id], ...p } }));
  const valider = (id: string) => {
    if (!brouillon[id]) return;
    maj(id, brouillon[id]);
    setBrouillon(({ [id]: _, ...reste }) => reste);
  };

  function ajouter() {
    if (!nom.trim() && !tel.trim()) return;
    onChange([...liste, nouveauCandidat({ nom: nom.trim() || "Candidat", tel: tel.trim() || undefined, note: note.trim() || undefined, contacteLe: auj }, auj)]);
    setNom("");
    setTel("");
    setNote("");
    setAjout(false);
  }

  function agenda(c: Candidat) {
    if (!c.visite) return;
    const debut = new Date(c.visite);
    const rdv = create("rdvs", {
      type: "visite",
      debut: debut.toISOString(),
      fin: new Date(debut.getTime() + 30 * 60000).toISOString(),
      titre: `Visite ${b.titre || b.adresse} · ${c.nom}`,
      bienId: b.id,
      lieu: adresseComplete(b),
      statut: "prevu",
      compteRendu: c.tel ? `Candidat : ${c.nom} ${c.tel}` : undefined,
    });
    maj(c.id, { rdvId: rdv.id, statut: c.statut === "nouveau" || c.statut === "a_rappeler" ? "visite" : c.statut });
  }

  return (
    <div className="card card-pad space-y-3" id="candidats">
      <div className="flex items-center justify-between">
        <h2 className="h-section">Candidats et visites</h2>
        <button className="btn-secondary btn-sm !h-10" onClick={() => setAjout((x) => !x)}>
          <UserPlus size={15} /> Candidat
        </button>
      </div>

      {ajout && (
        <div className="space-y-2 rounded-2xl bg-surface-2 p-3">
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} autoFocus />
            <input className="input" placeholder="Téléphone" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} />
          </div>
          <input className="input" placeholder="Note (situation, garant, date d'entrée souhaitée…)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-primary w-full !h-11" onClick={ajouter}>
            <Plus size={16} /> Ajouter (contacté aujourd&apos;hui)
          </button>
        </div>
      )}

      {tries.length ? (
        <ul className="divide-y divide-line/60">
          {tries.map((c0) => {
            const c = val(c0);
            const st = STATUTS_CANDIDAT.find((s) => s.v === c.statut)!;
            const open = ouvert === c.id;
            return (
              <li key={c.id} className={cx("py-2.5", c.statut === "refuse" && "opacity-60")}>
                <div className="flex items-center gap-2">
                  <button className="min-w-0 flex-1 text-left" onClick={() => setOuvert(open ? null : c.id)}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold">{c.nom}</span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </span>
                    <span className="block text-[12px] text-muted">
                      {[c.contacteLe ? `Contacté le ${jourJ(c.contacteLe)}` : "Pas encore contacté", c.visite && `Visite ${heureVisite(c.visite)}${c.visitePar ? ` avec ${c.visitePar}` : ""}`, c.note].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                  {c.tel && (
                    <a href={telHref(c.tel)} className="btn-ghost !h-10 !w-10 !px-0" aria-label={`Appeler ${c.nom}`} onClick={() => maj(c.id, { contacteLe: auj })}>
                      <Phone size={16} />
                    </a>
                  )}
                </div>
                {open && (
                  <div className="mt-2 space-y-2.5 rounded-2xl bg-surface-2 p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {STATUTS_CANDIDAT.map((s) => (
                        <button key={s.v} className={cx("chip !h-9", c.statut === s.v && "!bg-brand !text-white")} onClick={() => maj(c.id, { statut: s.v })}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Nom">
                        <input className="input" value={c.nom} onChange={(e) => ecrire(c.id, { nom: e.target.value })} onBlur={() => valider(c.id)} />
                      </Field>
                      <Field label="Téléphone">
                        <input className="input" inputMode="tel" value={c.tel ?? ""} onChange={(e) => ecrire(c.id, { tel: e.target.value })} onBlur={() => valider(c.id)} />
                      </Field>
                      <Field label="Visite le">
                        <input type="datetime-local" className="input" value={c.visite ?? ""} onChange={(e) => maj(c.id, { visite: e.target.value || undefined, rdvId: undefined })} />
                      </Field>
                      <Field label="Faite par">
                        <input className="input" value={c.visitePar ?? ""} placeholder={conseiller().prenom} onChange={(e) => ecrire(c.id, { visitePar: e.target.value })} onBlur={() => valider(c.id)} />
                      </Field>
                    </div>
                    <Field label="Note">
                      <textarea className="input min-h-[56px]" value={c.note ?? ""} onChange={(e) => ecrire(c.id, { note: e.target.value })} onBlur={() => valider(c.id)} />
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-secondary btn-sm !h-10" onClick={() => maj(c.id, { contacteLe: auj })}>
                        <Check size={14} /> Contacté aujourd&apos;hui
                      </button>
                      {c.visite &&
                        (c.rdvId ? (
                          <span className="chip !h-10">Dans l&apos;agenda</span>
                        ) : (
                          <button className="btn-secondary btn-sm !h-10" onClick={() => agenda({ ...c, visitePar: c.visitePar || conseiller().prenom })}>
                            <CalendarPlus size={14} /> Mettre dans l&apos;agenda
                          </button>
                        ))}
                      <button className="btn-ghost btn-sm !h-10 ml-auto text-danger" onClick={() => onChange(liste.filter((x) => x.id !== c.id))}>
                        <Trash2 size={14} /> Retirer
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">Aucun candidat pour l&apos;instant. Ajoutez la personne au moment de l&apos;appel : toute l&apos;équipe la verra.</p>
      )}
    </div>
  );
}
