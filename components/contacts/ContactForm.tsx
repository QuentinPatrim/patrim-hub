"use client";

import { AlertTriangle, ClipboardPaste, Home, Sparkles, UserPlus, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { cx, Field, Sheet, Spinner } from "@/components/ui";
import { ask } from "@/lib/ai";
import { eur, nomComplet, ROLE, SOURCE, today } from "@/lib/format";
import { create, useCollection } from "@/lib/store";
import type { BienType, Contact, ContactRole, Criteres, Source } from "@/lib/types";
import { FlamesPicker, PickChip } from "./bits";
import { CriteresEditor, parseNum } from "./CriteresEditor";
import { normalize, SOURCES, trouverBien } from "./helpers";

type Draft = {
  civilite: "M." | "Mme" | "";
  prenom: string;
  nom: string;
  tel: string;
  email: string;
  role: ContactRole;
  source?: Source;
  chaleur?: 1 | 2 | 3;
  criteres: Criteres;
  bienOrigineId?: string;
  prochaineAction?: string;
  notes?: string;
  lead?: string; // texte collé, conservé dans l'historique
};

const EMPTY: Draft = { civilite: "", prenom: "", nom: "", tel: "", email: "", role: "acquereur", criteres: {}, chaleur: 2 };

type LeadJson = {
  civilite?: string;
  prenom?: string;
  nom?: string;
  tel?: string;
  email?: string;
  role?: string;
  source?: string;
  criteres?: { types?: string[]; budgetMin?: number | string; budgetMax?: number | string; surfaceMin?: number | string; piecesMin?: number | string; quartiers?: string[]; exterieur?: boolean; parking?: boolean; ascenseur?: boolean; remarques?: string };
  bien?: { ref?: string; prix?: number | string; adresse?: string; titre?: string };
  message?: string;
  prochaineAction?: string;
  chaleur?: number;
};

const SYSTEM_LEAD = `Tu extrais les informations d'un lead immobilier (mail de portail SeLoger, Leboncoin, Bien'ici, formulaire du site, ou note libre du conseiller).
Réponds UNIQUEMENT avec un objet JSON, sans texte autour, au format :
{"civilite":"M."|"Mme"|"","prenom":"","nom":"","tel":"","email":"","role":"acquereur"|"vendeur"|"prospect_vendeur","source":"seloger"|"leboncoin"|"bienici"|"site"|"telephone"|"vitrine"|"recommandation"|"instagram"|"pige"|"autre",
"criteres":{"types":["appartement"|"maison"|"terrain"|"local"|"immeuble"|"parking"],"budgetMin":nombre,"budgetMax":nombre,"surfaceMin":nombre,"piecesMin":nombre,"quartiers":["…"],"exterieur":bool,"parking":bool,"ascenseur":bool,"remarques":""},
"bien":{"ref":"référence de l'annonce si présente","prix":nombre,"adresse":"ville/quartier du bien","titre":""},
"message":"le message du client, résumé en une phrase","prochaineAction":"action courte à faire (ex. Rappeler pour qualifier)","chaleur":1|2|3}
Règles : n'invente rien ; omets les champs inconnus. Les montants sont des nombres en euros (320000, pas "320k"). Le téléphone au format 06 12 34 56 78. Le nom de famille dans "nom", le prénom dans "prenom".
Si le lead porte sur une annonce précise, déduis les critères de ce bien (type, budget proche du prix, secteur) seulement si le client n'a pas donné ses propres critères. La source est le portail émetteur du mail. Chaleur : 3 si le client demande une visite ou dit être finançable, 1 si simple demande d'info vague, sinon 2.`;

const BIEN_TYPES: BienType[] = ["appartement", "maison", "terrain", "local", "immeuble", "parking"];

export function ContactForm({ open, onClose, defaultRole }: { open: boolean; onClose: () => void; defaultRole?: ContactRole }) {
  const router = useRouter();
  const { items: biens } = useCollection("biens");
  const { items: contacts } = useCollection("contacts");
  const [mode, setMode] = useState<"form" | "lead">("form");
  const [d, setD] = useState<Draft>(EMPTY);
  const [lead, setLead] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    if (open) {
      setD({ ...EMPTY, role: defaultRole ?? "acquereur" });
      setMode("form");
      setLead("");
      setErr(null);
      setFilled(false);
    }
  }, [open, defaultRole]);

  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  const doublon = useMemo(() => {
    const t = d.tel.replace(/\D/g, "").slice(-9);
    const e = normalize(d.email);
    if (t.length < 9 && !e) return undefined;
    return contacts.find((c) => (t.length >= 9 && c.tel?.replace(/\D/g, "").endsWith(t)) || (e && normalize(c.email) === e));
  }, [d.tel, d.email, contacts]);

  const bienOrigine = biens.find((b) => b.id === d.bienOrigineId);
  const biensActifs = useMemo(() => biens.filter((b) => b.statut !== "vendu" && b.statut !== "retire"), [biens]);

  async function analyser() {
    if (!lead.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await ask<LeadJson>({ system: SYSTEM_LEAD, prompt: `Texte du lead :\n"""\n${lead.trim().slice(0, 12000)}\n"""`, json: true, effort: "low" });
      const j = res.json;
      if (!j || typeof j !== "object") throw new Error("Je n'ai pas réussi à lire ce texte. Vérifiez qu'il contient bien un nom ou des coordonnées.");
      const k = j.criteres ?? {};
      const criteres: Criteres = {
        types: (k.types ?? []).filter((t): t is BienType => BIEN_TYPES.includes(t as BienType)),
        budgetMin: parseNum(k.budgetMin ?? undefined),
        budgetMax: parseNum(k.budgetMax ?? undefined),
        surfaceMin: parseNum(k.surfaceMin ?? undefined),
        piecesMin: parseNum(k.piecesMin ?? undefined),
        quartiers: Array.isArray(k.quartiers) ? k.quartiers.filter(Boolean) : undefined,
        exterieur: k.exterieur || undefined,
        parking: k.parking || undefined,
        ascenseur: k.ascenseur || undefined,
        remarques: k.remarques || undefined,
      };
      if (!criteres.types?.length) delete criteres.types;
      if (!criteres.quartiers?.length) delete criteres.quartiers;
      const bien = trouverBien(biens, j.bien?.ref, parseNum(j.bien?.prix ?? undefined), j.bien?.adresse);
      const role: ContactRole = j.role === "vendeur" || j.role === "prospect_vendeur" ? j.role : "acquereur";
      const source = SOURCES.includes(j.source as Source) ? (j.source as Source) : undefined;
      const extraBien = !bien && (j.bien?.ref || j.bien?.prix) ? `Annonce : ${[j.bien?.titre, j.bien?.ref && `réf. ${j.bien.ref}`, j.bien?.prix && eur(parseNum(j.bien.prix))].filter(Boolean).join(" · ")}` : "";
      setD({
        civilite: j.civilite === "M." || j.civilite === "Mme" ? j.civilite : "",
        prenom: j.prenom ?? "",
        nom: j.nom ?? "",
        tel: j.tel ?? "",
        email: j.email ?? "",
        role,
        source,
        chaleur: j.chaleur === 1 || j.chaleur === 3 ? j.chaleur : 2,
        criteres,
        bienOrigineId: bien?.id,
        prochaineAction: j.prochaineAction || "Rappeler pour qualifier",
        notes: [j.message, extraBien].filter(Boolean).join("\n") || undefined,
        lead: lead.trim(),
      });
      setFilled(true);
      setMode("form");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "L'analyse a échoué.");
    } finally {
      setBusy(false);
    }
  }

  function enregistrer() {
    if (!d.nom.trim() && !d.prenom.trim()) {
      setErr("Indiquez au moins un nom ou un prénom.");
      return;
    }
    const now = new Date().toISOString();
    const historique: NonNullable<Contact["historique"]> = [];
    if (d.lead) historique.push({ date: now, type: "mail", texte: `Lead reçu${d.source ? ` (${SOURCE[d.source]})` : ""} :\n${d.lead.slice(0, 4000)}` });
    else historique.push({ date: now, type: "note", texte: "Fiche créée" });
    const criteres = Object.fromEntries(Object.entries(d.criteres).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length))) as Criteres;
    const c = create("contacts", {
      civilite: d.civilite,
      prenom: d.prenom.trim() || undefined,
      nom: d.nom.trim() || d.prenom.trim(),
      tel: d.tel.trim() || undefined,
      email: d.email.trim() || undefined,
      roles: [d.role],
      source: d.source,
      etape: d.role === "acquereur" ? "nouveau" : undefined,
      chaleur: d.chaleur,
      criteres: Object.keys(criteres).length ? criteres : undefined,
      bienOrigineId: d.bienOrigineId,
      biensProposes: d.bienOrigineId ? [d.bienOrigineId] : undefined,
      prochaineAction: d.prochaineAction || (d.role === "acquereur" ? "Rappeler pour qualifier" : "Prendre contact"),
      dateRelance: today(),
      notes: d.notes,
      historique,
    } as Omit<Contact, "id" | "createdAt" | "updatedAt">);
    onClose();
    router.push(`/contacts/${c.id}`);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <UserPlus size={18} className="text-accent" /> Nouveau contact
        </span>
      }
      footer={
        mode === "form" ? (
          <>
            <button className="btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button className="btn-primary flex-1 sm:flex-none" onClick={enregistrer}>
              Créer la fiche
            </button>
          </>
        ) : (
          <>
            <button className="btn-secondary" onClick={() => setMode("form")}>
              Saisie manuelle
            </button>
            <button className="btn-primary flex-1 sm:flex-none" onClick={analyser} disabled={busy || !lead.trim()}>
              {busy ? <Spinner /> : <Wand2 size={16} />} {busy ? "Lecture du lead…" : "Remplir la fiche"}
            </button>
          </>
        )
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
        {(
          [
            ["form", "Saisie rapide", UserPlus],
            ["lead", "Coller un lead", ClipboardPaste],
          ] as const
        ).map(([m, label, Icon]) => (
          <button key={m} onClick={() => setMode(m)} className={cx("h-9 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition", mode === m ? "bg-surface shadow-sm text-fg" : "text-muted")}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {err}
        </div>
      )}

      {mode === "lead" ? (
        <div className="space-y-3 animate-fade-up">
          <p className="text-sm text-muted leading-relaxed">
            Collez le mail reçu de SeLoger, Leboncoin, Bien&apos;ici ou du site, ou simplement une note prise au téléphone. L&apos;assistant remplit la fiche et retrouve le bien concerné : vous vérifiez avant d&apos;enregistrer.
          </p>
          <textarea
            className="input min-h-[220px] font-mono text-[13px]"
            value={lead}
            autoFocus
            onChange={(e) => setLead(e.target.value)}
            placeholder={"Ex. : Nouveau contact pour votre annonce Appartement T3 – Réf. TAPP99978 – 289 000 €\nNom : Martin Claire\nTél : 06 12 34 56 78\nMessage : Bonjour, je souhaiterais visiter…"}
          />
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={async () => {
              try {
                const t = await navigator.clipboard.readText();
                if (t) setLead(t);
              } catch {
                setErr("Impossible de lire le presse-papiers : collez le texte à la main.");
              }
            }}
          >
            <ClipboardPaste size={14} /> Coller depuis le presse-papiers
          </button>
        </div>
      ) : (
        <div className="space-y-4 animate-fade-up">
          {filled && (
            <div className="flex items-start gap-2 rounded-xl bg-accent/5 border border-accent/15 px-3 py-2.5 text-[13px]">
              <Sparkles size={15} className="mt-0.5 shrink-0 text-accent" />
              <span>Fiche préremplie à partir du lead. Vérifiez les informations avant de créer la fiche.</span>
            </div>
          )}
          <div>
            <span className="label">Rôle</span>
            <div className="flex flex-wrap gap-1.5">
              {(["acquereur", "vendeur", "prospect_vendeur"] as ContactRole[]).map((r) => (
                <PickChip key={r} active={d.role === r} onClick={() => set({ role: r })}>
                  {ROLE[r]}
                </PickChip>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
            <Field label="Civilité">
              <select className="input" value={d.civilite} onChange={(e) => set({ civilite: e.target.value as Draft["civilite"] })}>
                <option value="">—</option>
                <option value="Mme">Mme</option>
                <option value="M.">M.</option>
              </select>
            </Field>
            <Field label="Prénom">
              <input className="input" value={d.prenom} onChange={(e) => set({ prenom: e.target.value })} autoComplete="off" autoCapitalize="words" />
            </Field>
          </div>
          <Field label="Nom">
            <input className="input" value={d.nom} onChange={(e) => set({ nom: e.target.value })} autoComplete="off" autoCapitalize="words" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Téléphone">
              <input className="input" type="tel" inputMode="tel" value={d.tel} onChange={(e) => set({ tel: e.target.value })} placeholder="06 …" />
            </Field>
            <Field label="E-mail">
              <input className="input" type="email" inputMode="email" value={d.email} onChange={(e) => set({ email: e.target.value })} autoCapitalize="off" />
            </Field>
          </div>
          {doublon && (
            <div className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2.5 text-[13px]">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
              <span>
                Ce contact existe peut-être déjà :{" "}
                <Link href={`/contacts/${doublon.id}`} onClick={onClose} className="font-semibold text-accent underline underline-offset-2">
                  {nomComplet(doublon)}
                </Link>
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Source">
              <select className="input" value={d.source ?? ""} onChange={(e) => set({ source: (e.target.value || undefined) as Source | undefined })}>
                <option value="">—</option>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE[s]}
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <span className="label">Chaleur</span>
              <FlamesPicker value={d.chaleur} onChange={(v) => set({ chaleur: v })} />
            </div>
          </div>
          {biensActifs.length > 0 && (
            <Field label="Bien concerné" hint={bienOrigine ? `${bienOrigine.ref ? `Réf. ${bienOrigine.ref} · ` : ""}${eur(bienOrigine.prix)}` : "Le bien de l'annonce qui a amené ce contact (facultatif)"}>
              <div className="relative">
                <Home size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <select className="input pl-9" value={d.bienOrigineId ?? ""} onChange={(e) => set({ bienOrigineId: e.target.value || undefined })}>
                  <option value="">Aucun</option>
                  {biensActifs.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.titre || b.adresse}
                      {b.ref ? ` · ${b.ref}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
          )}
          {d.role === "acquereur" && (
            <div className="rounded-2xl border border-line p-3.5 bg-surface-2/40">
              <div className="mb-3 text-sm font-semibold">Ce qu&apos;il recherche</div>
              <CriteresEditor compact value={d.criteres} onChange={(c) => set({ criteres: c })} />
            </div>
          )}
          <Field label="Note">
            <textarea className="input" rows={2} value={d.notes ?? ""} onChange={(e) => set({ notes: e.target.value || undefined })} placeholder="Contexte, situation, disponibilités…" />
          </Field>
        </div>
      )}
    </Sheet>
  );
}
