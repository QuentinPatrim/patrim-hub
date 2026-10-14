"use client";

import { useMemo, useState } from "react";
import { Check, Search, UserPlus, X } from "lucide-react";
import { Avatar, cx } from "@/components/ui";
import { create as createDoc, update as updateDoc, useCollection } from "@/lib/store";
import { ROLE, initiales, nomComplet } from "@/lib/format";
import type { ContactRole } from "@/lib/types";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Sélection de contacts avec recherche et création rapide.
 * `role` : rôle donné aux contacts créés ici, et ajouté aux contacts choisis qui ne l'ont pas encore.
 */
export function ContactPicker({
  value,
  onChange,
  role,
  placeholder = "Rechercher un contact…",
  max,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  role: ContactRole;
  placeholder?: string;
  max?: number;
}) {
  const { items: contacts } = useCollection("contacts");
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ prenom: "", nom: "", tel: "", email: "" });

  const selected = value.map((id) => contacts.find((c) => c.id === id)).filter(Boolean) as typeof contacts;
  const full = max != null && value.length >= max;

  const results = useMemo(() => {
    const s = norm(q.trim());
    return contacts
      .filter((c) => !value.includes(c.id))
      .filter((c) => !s || norm([c.prenom, c.nom, c.tel, c.email].filter(Boolean).join(" ")).includes(s) || (c.tel ?? "").replace(/\s/g, "").includes(s.replace(/\s/g, "")))
      .sort((a, b) => Number(b.roles?.includes(role)) - Number(a.roles?.includes(role)) || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
      .slice(0, 6);
  }, [contacts, q, value, role]);

  const pick = (id: string) => {
    const c = contacts.find((x) => x.id === id);
    if (c && !c.roles?.includes(role)) updateDoc("contacts", id, { roles: [...(c.roles ?? []), role] });
    onChange([...value, id]);
    setQ("");
  };

  const startCreate = () => {
    const parts = q.trim().split(/\s+/);
    const looksTel = /^[\d\s+.]{6,}$/.test(q.trim());
    const looksMail = q.includes("@");
    setDraft({
      prenom: !looksTel && !looksMail && parts.length > 1 ? parts[0] : "",
      nom: !looksTel && !looksMail ? (parts.length > 1 ? parts.slice(1).join(" ") : parts[0] ?? "") : "",
      tel: looksTel ? q.trim() : "",
      email: looksMail ? q.trim() : "",
    });
    setCreating(true);
  };

  const saveNew = () => {
    if (!draft.nom.trim() && !draft.prenom.trim()) return;
    const c = createDoc("contacts", {
      prenom: draft.prenom.trim() || undefined,
      nom: draft.nom.trim() || draft.prenom.trim(),
      tel: draft.tel.trim() || undefined,
      email: draft.email.trim() || undefined,
      roles: [role],
      ...(role === "acquereur" ? { etape: "nouveau" as const } : {}),
      historique: [{ date: new Date().toISOString(), type: "note", texte: "Fiche créée" }],
    });
    onChange([...value, c.id]);
    setCreating(false);
    setQ("");
  };

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <ul className="space-y-1.5">
          {selected.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/60 px-3 py-2">
              <Avatar text={initiales(c)} className="!size-8 text-[11px]" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{nomComplet(c)}</div>
                <div className="text-xs text-muted truncate">{[c.tel, c.email].filter(Boolean).join(" · ") || "Sans coordonnées"}</div>
              </div>
              <button type="button" onClick={() => onChange(value.filter((v) => v !== c.id))} className="grid place-items-center size-9 rounded-lg text-muted hover:bg-surface hover:text-danger" aria-label="Retirer">
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 space-y-2 animate-fade-up">
          <div className="text-xs font-semibold text-accent">Nouveau contact · {ROLE[role]}</div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Prénom" value={draft.prenom} onChange={(e) => setDraft({ ...draft, prenom: e.target.value })} autoFocus />
            <input className="input" placeholder="Nom" value={draft.nom} onChange={(e) => setDraft({ ...draft, nom: e.target.value })} />
            <input className="input" placeholder="Téléphone" inputMode="tel" value={draft.tel} onChange={(e) => setDraft({ ...draft, tel: e.target.value })} />
            <input className="input" placeholder="E-mail" inputMode="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setCreating(false)}>
              Annuler
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={saveNew} disabled={!draft.nom.trim() && !draft.prenom.trim()}>
              <Check size={14} /> Créer et ajouter
            </button>
          </div>
        </div>
      ) : (
        !full && (
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setFocus(true)}
              onBlur={() => setTimeout(() => setFocus(false), 150)}
              placeholder={placeholder}
              className="input pl-9"
            />
            {focus && (
              <div className="absolute z-20 mt-1.5 w-full rounded-xl border border-line bg-surface shadow-card overflow-hidden animate-fade-up">
                {results.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(c.id)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2"
                  >
                    <Avatar text={initiales(c)} className="!size-8 text-[11px]" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{nomComplet(c)}</div>
                      <div className="text-xs text-muted truncate">{[c.roles?.map((r) => ROLE[r]).join(", "), c.tel].filter(Boolean).join(" · ")}</div>
                    </div>
                  </button>
                ))}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={startCreate}
                  className={cx("flex w-full items-center gap-3 px-3 py-3 text-left text-sm font-medium text-accent hover:bg-accent/5", results.length > 0 && "border-t border-line")}
                >
                  <span className="grid place-items-center size-8 rounded-full bg-accent/10">
                    <UserPlus size={15} />
                  </span>
                  {q.trim() ? `Créer « ${q.trim()} »` : `Nouveau ${ROLE[role].toLowerCase()}`}
                </button>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
