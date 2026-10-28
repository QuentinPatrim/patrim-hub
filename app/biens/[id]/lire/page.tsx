"use client";

/* Lecteur de documents d'un bien : PV d'AG, diagnostics, titre, charges, taxe foncière…
   Le document est lu puis oublié. Les valeurs trouvées ne vont sur la fiche qu'une fois cochées. */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, Copy, FileSearch, FileUp, Info, ShieldCheck } from "lucide-react";
import { Badge, Card, Empty, PageHeader, Spinner, cx } from "@/components/ui";
import { useDoc } from "@/lib/store";
import { today } from "@/lib/format";
import { TYPE_DOC, lireDocument, patchLecture, propositions, type Lecture, type Proposition } from "@/components/lecteur/lecteur";

export default function LireDocument() {
  const { id } = useParams<{ id: string }>();
  const { doc: b, update } = useDoc("biens", id);
  const [waited, setWaited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [nom, setNom] = useState("");
  const [props, setProps] = useState<Proposition[]>([]);
  const [retenues, setRetenues] = useState<Set<string>>(new Set());
  const [fait, setFait] = useState(0);
  const pdfRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const groupes = useMemo(() => {
    const g = new Map<string, Proposition[]>();
    for (const p of props) g.set(p.groupe, [...(g.get(p.groupe) ?? []), p]);
    return [...g.entries()];
  }, [props]);

  if (!b) {
    if (!waited) return <div className="skeleton h-40 rounded-3xl" />;
    return (
      <div className="card">
        <Empty title="Bien introuvable" action={<Link href="/biens" className="btn-primary">Retour aux biens</Link>} />
      </div>
    );
  }

  async function lire(files: FileList | null) {
    if (!files?.length || !b) return;
    setBusy(true);
    setErr("");
    setLecture(null);
    setFait(0);
    setNom(files.length > 1 ? `${files.length} photos` : files[0].name);
    try {
      const l = await lireDocument([...files], b);
      // Propositions figées pour cette lecture (la fiche change quand on reporte)
      const p = propositions(b, l);
      setLecture(l);
      setProps(p);
      setRetenues(new Set(p.filter((x) => x.conseillee).map((x) => x.cle)));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      if (pdfRef.current) pdfRef.current.value = "";
      if (photoRef.current) photoRef.current.value = "";
    }
  }

  function reporter() {
    if (!lecture || !b) return;
    void update(patchLecture(b, lecture, retenues, today()));
    setFait(retenues.size);
  }

  const basculer = (cle: string) =>
    setRetenues((r) => {
      const n = new Set(r);
      if (n.has(cle)) n.delete(cle);
      else n.add(cle);
      return n;
    });

  const alertes = lecture?.points?.filter((p) => p.niveau === "alerte") ?? [];
  const infos = lecture?.points?.filter((p) => p.niveau !== "alerte") ?? [];

  return (
    <div className="space-y-4 pb-6">
      <PageHeader back={`/biens/${b.id}`} title="Lire un document" subtitle={b.titre} />

      <Card>
        <p className="text-sm text-muted">
          PV d&apos;assemblée générale, diagnostics, titre de propriété, appel de charges, taxe foncière… Le Hub lit le document, te fait un résumé, relève les points d&apos;attention et te propose les valeurs à reporter sur la fiche.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy} onClick={() => pdfRef.current?.click()}>
            <FileUp size={16} /> Choisir un PDF
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => photoRef.current?.click()}>
            <Camera size={16} /> Photos des pages
          </button>
        </div>
        <input ref={pdfRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => void lire(e.target.files)} />
        <input ref={photoRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void lire(e.target.files)} />
        {busy && (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted">
            <Spinner /> Lecture de {nom}… Compte une minute pour un long PV d&apos;AG.
          </div>
        )}
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
      </Card>

      {lecture && (
        <>
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{TYPE_DOC[lecture.type] ?? "Document"}</Badge>
              <span className="text-sm font-semibold">{lecture.titre}</span>
            </div>
            {lecture.resume && <p className="mt-2 text-sm leading-relaxed">{lecture.resume}</p>}
          </Card>

          {(alertes.length > 0 || infos.length > 0 || (lecture.travaux?.length ?? 0) > 0) && (
            <Card title="Points d'attention">
              <ul className="space-y-2">
                {alertes.map((p, i) => (
                  <li key={`a${i}`} className="flex gap-2 text-sm">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" /> {p.texte}
                  </li>
                ))}
                {lecture.travaux?.map((t, i) => (
                  <li key={`t${i}`} className="flex gap-2 text-sm">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
                    <span>
                      Travaux {t.statut ?? ""} : {t.objet}
                      {t.montant ? `, ${t.montant.toLocaleString("fr-FR")} € au total` : ""}
                      {t.quotePart ? `, ${t.quotePart.toLocaleString("fr-FR")} € pour le lot` : ""}
                      {t.echeance ? ` (${t.echeance})` : ""}
                    </span>
                  </li>
                ))}
                {infos.map((p, i) => (
                  <li key={`i${i}`} className="flex gap-2 text-sm text-muted">
                    <Info size={16} className="mt-0.5 shrink-0" /> {p.texte}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {(lecture.questions?.length ?? 0) > 0 && (
            <Card
              title="Questions à poser"
              action={
                <button className="btn-ghost btn-sm" onClick={() => void navigator.clipboard?.writeText(lecture.questions!.map((q) => `- ${q}`).join("\n"))}>
                  <Copy size={14} /> Copier
                </button>
              }
            >
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {lecture.questions!.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="À reporter sur la fiche">
            {fait ? (
              <div className="flex items-start gap-2 text-sm">
                <Check size={18} className="shrink-0 text-ok" />
                <div>
                  {fait} élément{fait > 1 ? "s" : ""} reporté{fait > 1 ? "s" : ""}. Les points d&apos;attention sont dans « À vérifier » du dossier.{" "}
                  <Link href={`/biens/${b.id}`} className="font-medium text-accent">
                    Voir la fiche
                  </Link>
                </div>
              </div>
            ) : props.length ? (
              <div className="space-y-4">
                {groupes.map(([g, liste]) => (
                  <div key={g}>
                    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{g}</div>
                    <ul className="space-y-1.5">
                      {liste.map((p) => (
                        <li key={p.cle}>
                          <label className={cx("flex cursor-pointer items-start gap-3 rounded-xl border p-2.5", retenues.has(p.cle) ? "border-accent/40 bg-accent/5" : "border-line")}>
                            <input type="checkbox" className="mt-1 size-4 shrink-0" checked={retenues.has(p.cle)} onChange={() => basculer(p.cle)} />
                            <div className="min-w-0 text-sm">
                              <div className="font-medium">{p.label}</div>
                              {p.avant && <div className="text-xs text-muted line-through">{p.avant}</div>}
                              <div className="break-words">{p.apres}</div>
                            </div>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <button className="btn-primary w-full" disabled={!retenues.size} onClick={reporter}>
                  <Check size={16} /> Reporter {retenues.size} élément{retenues.size > 1 ? "s" : ""}
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted">Rien de nouveau par rapport à la fiche.</p>
            )}
          </Card>
        </>
      )}

      {!lecture && !busy && <Empty icon={<FileSearch size={22} />} title="Aucun document lu" text="Un PDF de 32 Mo au plus, ou jusqu'à 12 photos de pages." />}

      <div className="flex items-start gap-2 rounded-2xl border border-line p-3 text-xs text-muted">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ok" />
        <p>Le document n&apos;est pas conservé : il est lu puis effacé. Aucun nom, aucune date de naissance ni adresse personnelle n&apos;est relevé. Rien ne va sur la fiche sans ta validation.</p>
      </div>
    </div>
  );
}
