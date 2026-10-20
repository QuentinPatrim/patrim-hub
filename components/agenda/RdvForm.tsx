"use client";

import { useEspace } from "@/components/espace/espace";
import { locationSeule } from "@/components/location/bienLocation";
import { useEffect, useMemo, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { Field, Sheet, cx } from "@/components/ui";
import { ContactPicker } from "@/components/biens/ContactPicker";
import { adresseComplete } from "@/components/biens/utils";
import { create, getAll, remove, update, useCollection } from "@/lib/store";
import { RDV_TYPE, STATUT_BIEN, addDays, dateLongue, heure, today } from "@/lib/format";
import type { Contact, Rdv, RdvType } from "@/lib/types";
import { DUREE_DEFAUT, RDV_ICON, hhmm, jourDe, versIso } from "./utils";

const TYPES: RdvType[] = ["visite", "estimation", "rdv_vendeur", "appel", "signature", "autre"];
const DUREES = [15, 30, 45, 60, 90, 120];

export type RdvInitial = Partial<Rdv> & { jour?: string };

/** Création / modification d'un rendez-vous, dans une feuille. */
export function RdvForm({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial?: RdvInitial; onSaved?: (r: Rdv) => void }) {
  const { items: tousBiens } = useCollection("biens");
  const loc = useEspace() === "location";
  // Hub Location : les biens à louer ; Hub Transaction : les biens en vente
  const biens = useMemo(() => tousBiens.filter((b) => locationSeule(b) === loc || b.id === initial?.bienId), [tousBiens, loc, initial?.bienId]);
  const editing = !!initial?.id;
  const [type, setType] = useState<RdvType>("visite");
  const [jour, setJour] = useState(today());
  const [h, setH] = useState("10:00");
  const [duree, setDuree] = useState(45);
  const [bienId, setBienId] = useState("");
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [lieu, setLieu] = useState("");
  const [lieuAuto, setLieuAuto] = useState(true);
  const [titre, setTitre] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!open) return;
    const i = initial ?? {};
    const t = i.type ?? "visite";
    setType(t);
    if (i.debut) {
      setJour(jourDe(i.debut));
      setH(hhmm(i.debut));
      setDuree(i.fin ? Math.max(15, Math.round((new Date(i.fin).getTime() - new Date(i.debut).getTime()) / 60000)) : DUREE_DEFAUT[t]);
    } else {
      setJour(i.jour ?? today());
      const now = new Date();
      const next = new Date(now.getTime() + 60 * 60000);
      setH(i.jour && i.jour !== today() ? "10:00" : `${String(next.getHours()).padStart(2, "0")}:00`);
      setDuree(DUREE_DEFAUT[t]);
    }
    setBienId(i.bienId ?? "");
    setContactIds(i.contactIds ?? []);
    const b = i.bienId ? getAll("biens").find((x) => x.id === i.bienId) : undefined;
    setLieu(i.lieu ?? (b ? adresseComplete(b) : ""));
    setLieuAuto(!i.lieu);
    setTitre(i.titre ?? "");
    setConfirmDel(false);
    // On ne réinitialise qu'à l'ouverture de la feuille.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const bien = biens.find((b) => b.id === bienId);

  const biensTries = useMemo(
    () => [...biens].sort((a, b) => Number(b.statut === "en_vente" || b.statut === "mandat_signe") - Number(a.statut === "en_vente" || a.statut === "mandat_signe") || a.titre.localeCompare(b.titre)),
    [biens]
  );

  const raccourcis = [
    { label: "Aujourd'hui", v: today() },
    { label: "Demain", v: addDays(today(), 1) },
    { label: "Après-demain", v: addDays(today(), 2) },
  ];

  const save = () => {
    const debut = versIso(jour, h);
    const fin = new Date(new Date(debut).getTime() + duree * 60000).toISOString();
    const data = {
      type,
      debut,
      fin,
      bienId: bienId || undefined,
      contactIds,
      lieu: lieu.trim() || undefined,
      titre: titre.trim() || undefined,
    };
    let r: Rdv | undefined;
    if (editing) r = update("rdvs", initial!.id!, data);
    else {
      r = create("rdvs", { ...data, statut: "prevu" });
      // Suivi des acquéreurs : visite planifiée
      if (type === "visite") {
        const contacts = getAll("contacts");
        contactIds.forEach((id) => {
          const c = contacts.find((x) => x.id === id);
          if (!c) return;
          const patch: Partial<Contact> = {
            historique: [...(c.historique ?? []), { date: new Date().toISOString(), type: "note", texte: `Visite planifiée le ${dateLongue(debut)} à ${heure(debut)}${bien ? ` – ${bien.titre}` : ""}` }],
          };
          if (c.roles?.includes("acquereur") && (!c.etape || c.etape === "nouveau" || c.etape === "qualifie")) patch.etape = "visite";
          if (bienId && !(c.biensProposes ?? []).includes(bienId)) patch.biensProposes = [...(c.biensProposes ?? []), bienId];
          update("contacts", id, patch);
        });
      }
    }
    if (r) onSaved?.(r);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Modifier le rendez-vous" : "Nouveau rendez-vous"}
      footer={
        <>
          {editing && (
            <button
              className={cx("btn-ghost mr-auto", confirmDel ? "text-danger" : "text-muted")}
              onClick={() => {
                if (!confirmDel) return setConfirmDel(true);
                remove("rdvs", initial!.id!);
                onClose();
              }}
            >
              <Trash2 size={16} /> {confirmDel ? "Confirmer" : "Supprimer"}
            </button>
          )}
          <button className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button className="btn-primary" onClick={save}>
            <Check size={16} /> {editing ? "Enregistrer" : "Planifier"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map((t) => {
            const Icon = RDV_ICON[t];
            const on = type === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setType(t);
                  if (!editing) setDuree(DUREE_DEFAUT[t]);
                }}
                className={cx("flex flex-col items-center justify-center gap-1 h-16 rounded-xl border text-xs font-medium transition", on ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:bg-surface-2")}
              >
                <Icon size={18} strokeWidth={1.7} />
                {RDV_TYPE[t]}
              </button>
            );
          })}
        </div>

        <div>
          <div className="flex gap-1.5 mb-2 overflow-x-auto no-scrollbar">
            {raccourcis.map((r) => (
              <button key={r.v} type="button" onClick={() => setJour(r.v)} className={cx("chip !h-8 !px-3 shrink-0", jour === r.v && "!bg-accent/10 !text-accent !border-accent/30")}>
                {r.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_96px_96px] gap-2">
            <Field label="Date">
              <input type="date" className="input" value={jour} onChange={(e) => setJour(e.target.value)} />
            </Field>
            <Field label="Heure">
              <input type="time" className="input" step={300} value={h} onChange={(e) => setH(e.target.value)} />
            </Field>
            <Field label="Durée">
              <select className="input" value={duree} onChange={(e) => setDuree(Number(e.target.value))}>
                {DUREES.map((d) => (
                  <option key={d} value={d}>
                    {d < 60 ? `${d} min` : `${d / 60} h${d % 60 ? " 30" : ""}`}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <Field label="Bien">
          <select
            className="input"
            value={bienId}
            onChange={(e) => {
              const id = e.target.value;
              setBienId(id);
              const b = biens.find((x) => x.id === id);
              if (lieuAuto || !lieu) {
                setLieu(b ? adresseComplete(b) : "");
                setLieuAuto(true);
              }
            }}
          >
            <option value="">Aucun bien</option>
            {biensTries.map((b) => (
              <option key={b.id} value={b.id}>
                {b.titre} – {b.quartier || b.ville} ({STATUT_BIEN[b.statut].label})
              </option>
            ))}
          </select>
        </Field>

        <div>
          <span className="label">{type === "visite" ? "Acquéreur(s)" : "Contact(s)"}</span>
          <ContactPicker value={contactIds} onChange={setContactIds} role={type === "visite" ? "acquereur" : type === "estimation" || type === "rdv_vendeur" ? "prospect_vendeur" : "acquereur"} placeholder="Rechercher ou créer un contact…" />
        </div>

        <Field label="Lieu" hint={bien && lieuAuto ? "Adresse du bien, modifiable" : undefined}>
          <input
            className="input"
            value={lieu}
            onChange={(e) => {
              setLieu(e.target.value);
              setLieuAuto(false);
            }}
            placeholder={type === "appel" ? "Par téléphone" : "Adresse du rendez-vous"}
          />
        </Field>

        <Field label="Intitulé (facultatif)">
          <input className="input" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Généré automatiquement si vide" />
        </Field>
      </div>
    </Sheet>
  );
}
