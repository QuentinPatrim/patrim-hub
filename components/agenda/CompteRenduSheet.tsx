"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Mic, Send, Sparkles, Square, Star } from "lucide-react";
import { Field, Sheet, Spinner, cx } from "@/components/ui";
import { ask } from "@/lib/ai";
import { getAll, update } from "@/lib/store";
import { addDays, dateCourte, nomComplet, today } from "@/lib/format";
import type { Contact } from "@/lib/types";
import { RESSENTI, SUITE, titreRdv, type CrDetail, type RdvExt, type Ressenti, type SuiteKey } from "./utils";

type IaCr = { note?: number; ressenti?: Ressenti; positifs?: string; negatifs?: string; suite?: SuiteKey; prochaineAction?: string; resume?: string };

/** Compose le texte du compte rendu enregistré dans rdv.compteRendu. */
export function texteCompteRendu(d: CrDetail, note?: number) {
  return [
    note ? `Note du client : ${note}/5` : "",
    d.ressenti ? `Ressenti : ${RESSENTI[d.ressenti].label}` : "",
    d.positifs ? `Points positifs : ${d.positifs}` : "",
    d.negatifs ? `Points négatifs : ${d.negatifs}` : "",
    d.suite ? `Suite : ${SUITE[d.suite].label}` : "",
    d.prochaineAction ? `Prochaine action : ${d.prochaineAction}` : "",
    d.notes ? `Notes : ${d.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

type SpeechRec = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

export function CompteRenduSheet({ rdv, onClose }: { rdv?: RdvExt; onClose: () => void }) {
  const open = !!rdv;
  const [note, setNote] = useState<number | undefined>();
  const router = useRouter();
  const [d, setD] = useState<CrDetail>({});
  const [dictee, setDictee] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ecoute, setEcoute] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  const [vocal, setVocal] = useState(false);

  useEffect(() => {
    if (!rdv) return;
    setNote(rdv.avisClient);
    setD(rdv.crDetail ?? (rdv.compteRendu ? { notes: rdv.compteRendu } : {}));
    setDictee("");
    setErr("");
    setVocal(typeof window !== "undefined" && !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rdv?.id]);
  useEffect(() => () => rec.current?.stop(), []);

  const bien = rdv?.bienId ? getAll("biens").find((b) => b.id === rdv.bienId) : undefined;
  const contacts = (rdv?.contactIds ?? []).map((id) => getAll("contacts").find((c) => c.id === id)).filter(Boolean) as Contact[];
  const set = <K extends keyof CrDetail>(k: K, v: CrDetail[K]) => setD((x) => ({ ...x, [k]: v }));

  const toggleMicro = () => {
    if (ecoute) {
      rec.current?.stop();
      return;
    }
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "fr-FR";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) t += e.results[i][0].transcript;
      if (t) setDictee((x) => (x ? x.trimEnd() + " " : "") + t.trim());
    };
    r.onend = () => setEcoute(false);
    r.onerror = () => setEcoute(false);
    rec.current = r;
    r.start();
    setEcoute(true);
  };

  const mettreEnForme = async () => {
    if (!dictee.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const res = await ask<IaCr>({
        json: true,
        system:
          "Tu aides un conseiller immobilier à rédiger le compte rendu d'une visite à partir de ses notes dictées. Tu ne rajoutes aucun fait qui n'est pas dans les notes. Réponds uniquement en JSON.",
        prompt: `Bien visité : ${bien ? `${bien.titre} (${bien.quartier || bien.ville})` : "non précisé"}.
Visiteurs : ${contacts.map((c) => nomComplet(c)).join(", ") || "non précisé"}.
Notes dictées par le conseiller :
"""${dictee.trim()}"""

Renvoie un objet JSON avec ces clés :
- "note" : intérêt du client de 1 à 5 (entier), déduit des notes, ou null si impossible ;
- "ressenti" : "enthousiaste" | "positif" | "mitige" | "negatif" ;
- "positifs" : les points positifs relevés par le client, en une phrase courte (ou "") ;
- "negatifs" : les points négatifs ou objections, en une phrase courte (ou "") ;
- "suite" : "offre" | "seconde_visite" | "reflexion" | "pas_interesse" ;
- "prochaineAction" : la prochaine action concrète conseillée au conseiller, en une phrase à l'infinitif (ex. "Rappeler jeudi pour connaître sa décision") ;
- "resume" : 1 à 2 phrases neutres résumant la visite.`,
      });
      const j = res.json;
      if (!j) throw new Error("La mise en forme n'a pas abouti, réessayez.");
      if (j.note && j.note >= 1 && j.note <= 5) setNote(Math.round(j.note));
      setD((x) => ({
        ...x,
        ressenti: j.ressenti && j.ressenti in RESSENTI ? j.ressenti : x.ressenti,
        positifs: j.positifs || x.positifs,
        negatifs: j.negatifs || x.negatifs,
        suite: j.suite && j.suite in SUITE ? j.suite : x.suite,
        prochaineAction: j.prochaineAction || x.prochaineAction,
        notes: j.resume || x.notes,
      }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "L'assistant n'a pas répondu.");
    } finally {
      setBusy(false);
    }
  };

  // Visite réussie : la fiche acquéreur part tout de suite, l'offre sera prête quand il se décidera
  const ficheAcquereur = bien && rdv?.type === "visite" && contacts.length === 1 && (d.suite === "offre" || d.suite === "seconde_visite") ? `/biens/${bien.id}/fiche-acquereur?nouveau=1&contact=${contacts[0].id}` : null;

  const save = (ensuite?: string) => {
    if (!rdv) return;
    const detail: CrDetail = { ...d, notes: [d.notes, dictee.trim() && !d.notes ? dictee.trim() : ""].filter(Boolean).join("\n") || undefined };
    const texte = texteCompteRendu(detail, note);
    update("rdvs", rdv.id, {
      compteRendu: texte || undefined,
      avisClient: note as RdvExt["avisClient"],
      suite: detail.suite ? SUITE[detail.suite].label : undefined,
      crDetail: detail,
      statut: "fait",
    } as Partial<RdvExt>);

    const ligne = [
      `Visite${bien ? ` « ${bien.titre} »` : ""} du ${dateCourte(rdv.debut)}`,
      note ? `${note}/5` : "",
      detail.ressenti ? RESSENTI[detail.ressenti].label.toLowerCase() : "",
      detail.suite ? `suite : ${SUITE[detail.suite].label.toLowerCase()}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const resume = [ligne, detail.positifs && `+ ${detail.positifs}`, detail.negatifs && `– ${detail.negatifs}`].filter(Boolean).join("\n");

    contacts.forEach((c) => {
      const hist = (c.historique ?? []).filter((h) => !(h.type === "visite" && h.texte.startsWith(ligne.split(" · ")[0])));
      const patch: Partial<Contact> = {
        historique: [...hist, { date: new Date().toISOString(), type: "visite", texte: resume }],
        dernierContact: new Date().toISOString(),
      };
      if (detail.prochaineAction) patch.prochaineAction = detail.prochaineAction;
      if (detail.suite === "offre") patch.etape = "offre";
      else if ((detail.suite === "seconde_visite" || detail.suite === "reflexion") && (!c.etape || c.etape === "nouveau" || c.etape === "qualifie")) patch.etape = "visite";
      if (detail.suite === "reflexion" || detail.suite === "seconde_visite") patch.dateRelance = addDays(today(), 2);
      update("contacts", c.id, patch);
    });
    onClose();
    if (ensuite) router.push(ensuite);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      wide
      title={
        <div className="min-w-0">
          <div>Compte rendu</div>
          {rdv && <div className="text-xs font-normal text-muted truncate">{titreRdv(rdv, bien, contacts)}</div>}
        </div>
      }
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          {ficheAcquereur && (
            <button className="btn-secondary" title="Enregistrer, puis envoyer la fiche acquéreur" onClick={() => save(ficheAcquereur)}>
              <Send size={16} /> + Fiche acquéreur
            </button>
          )}
          <button className="btn-primary" onClick={() => save()}>
            <Check size={16} /> Enregistrer
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Dictée */}
        <div className="rounded-2xl border border-accent/20 bg-accent/[0.04] p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-xs font-semibold text-accent">Dictée rapide</div>
            {vocal && (
              <button type="button" onClick={toggleMicro} className={cx("btn-sm btn", ecoute ? "bg-danger text-white" : "btn-secondary")}>
                {ecoute ? (
                  <>
                    <Square size={12} /> Arrêter
                  </>
                ) : (
                  <>
                    <Mic size={14} /> Dicter
                  </>
                )}
              </button>
            )}
          </div>
          <textarea
            className="input min-h-[96px] bg-surface"
            value={dictee}
            onChange={(e) => setDictee(e.target.value)}
            placeholder="Racontez la visite en vrac : ce qu'ils ont aimé, ce qui coince, leur budget, la suite…"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted">L'IA remplit la fiche ci-dessous, vous relisez.</p>
            <button type="button" className="btn-primary btn-sm" onClick={mettreEnForme} disabled={busy || !dictee.trim()}>
              {busy ? <Spinner /> : <Sparkles size={14} />} Mettre en forme avec l&apos;IA
            </button>
          </div>
          {err && <p className="mt-2 text-xs text-danger">{err}</p>}
        </div>

        <div>
          <span className="label">Intérêt du client</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setNote(note === n ? undefined : n)} className="grid place-items-center size-11 rounded-xl hover:bg-surface-2 transition active:scale-90" aria-label={`${n} sur 5`}>
                <Star size={26} className={cx("transition", note && n <= note ? "fill-gold text-gold" : "text-line")} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Ressenti</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(RESSENTI) as Ressenti[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => set("ressenti", d.ressenti === k ? undefined : k)}
                className={cx("h-11 rounded-xl border text-sm font-medium transition", d.ressenti === k ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:bg-surface-2")}
              >
                <span className="mr-1.5">{RESSENTI[k].emoji}</span>
                {RESSENTI[k].label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Points positifs">
            <textarea className="input min-h-[72px]" value={d.positifs ?? ""} onChange={(e) => set("positifs", e.target.value)} placeholder="Luminosité, séjour, quartier…" />
          </Field>
          <Field label="Points négatifs / objections">
            <textarea className="input min-h-[72px]" value={d.negatifs ?? ""} onChange={(e) => set("negatifs", e.target.value)} placeholder="Travaux salle de bain, bruit…" />
          </Field>
        </div>

        <div>
          <span className="label">Suite</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(SUITE) as SuiteKey[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => set("suite", d.suite === k ? undefined : k)}
                className={cx(
                  "h-11 rounded-xl border text-sm font-medium transition",
                  d.suite === k ? (k === "offre" ? "border-brand bg-brand text-white" : "border-accent bg-accent/10 text-accent") : "border-line text-muted hover:bg-surface-2"
                )}
              >
                {SUITE[k].label}
              </button>
            ))}
          </div>
          {d.suite === "offre" && <p className="mt-2 text-xs text-accent">Le contact passera à l&apos;étape « Offre ».</p>}
        </div>

        <Field label="Prochaine action">
          <input className="input" value={d.prochaineAction ?? ""} onChange={(e) => set("prochaineAction", e.target.value)} placeholder="Rappeler jeudi, envoyer les diagnostics…" />
        </Field>
        <Field label="Résumé / notes">
          <textarea className="input min-h-[72px]" value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}
