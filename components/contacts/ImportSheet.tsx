"use client";

import { CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { cx, Sheet, Spinner } from "@/components/ui";
import { eurK, ROLE } from "@/lib/format";
import { bulkCreate, useCollection } from "@/lib/store";
import type { Contact } from "@/lib/types";
import { detectColumns, FIELD_LABEL, parseCsv, rowsToContacts, type CsvField } from "./csv";

export function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items: contacts } = useCollection("contacts");
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<string[][] | null>(null);
  const [cols, setCols] = useState<(CsvField | null)[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const reset = () => {
    setTable(null);
    setCols([]);
    setFileName("");
    setDone(null);
    setErr(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  async function readFile(f: File) {
    setErr(null);
    setDone(null);
    try {
      const buf = await f.arrayBuffer();
      let text = new TextDecoder("utf-8").decode(buf);
      if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf); // fichiers Excel anciens
      const rows = parseCsv(text);
      if (rows.length < 2) throw new Error("Le fichier semble vide : il faut une ligne d'en-têtes puis au moins un contact.");
      setTable(rows);
      setCols(detectColumns(rows[0]));
      setFileName(f.name);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lecture impossible.");
    }
  }

  const result = useMemo(() => (table ? rowsToContacts(table.slice(1), cols, contacts) : null), [table, cols, contacts]);
  const reconnues = cols.filter(Boolean).length;
  const hasName = cols.includes("nom") || cols.includes("nomComplet") || cols.includes("prenom") || cols.includes("tel") || cols.includes("email");

  async function importer() {
    if (!result?.rows.length) return;
    setBusy(true);
    try {
      await bulkCreate("contacts", result.rows as Partial<Contact>[]);
      setDone(result.rows.length);
      setTable(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Import interrompu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      wide
      title={
        <span className="flex items-center gap-2">
          <FileSpreadsheet size={18} className="text-accent" /> Importer des contacts
        </span>
      }
      footer={
        done != null ? (
          <button className="btn-primary" onClick={close}>
            Voir mes contacts
          </button>
        ) : table ? (
          <>
            <button className="btn-secondary" onClick={reset}>
              Autre fichier
            </button>
            <button className="btn-primary flex-1 sm:flex-none" disabled={busy || !result?.rows.length || !hasName} onClick={importer}>
              {busy && <Spinner />} Importer {result?.rows.length ?? 0} contact{(result?.rows.length ?? 0) > 1 ? "s" : ""}
            </button>
          </>
        ) : undefined
      }
    >
      {err && <div className="mb-4 rounded-xl border border-danger/25 bg-danger/10 px-3 py-2.5 text-sm text-danger">{err}</div>}

      {done != null ? (
        <div className="flex flex-col items-center text-center py-10 animate-fade-up">
          <span className="grid place-items-center size-14 rounded-2xl bg-ok/10 text-ok mb-3">
            <CheckCircle2 size={28} />
          </span>
          <div className="font-serif text-xl font-semibold">{done} contacts importés</div>
          <p className="mt-1 text-sm text-muted">Ils sont maintenant dans votre liste et dans le pipeline.</p>
        </div>
      ) : !table ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void readFile(f);
            }}
            className={cx("w-full flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 transition", drag ? "border-accent bg-accent/5" : "border-line hover:border-accent/40 hover:bg-surface-2/50")}
          >
            <span className="grid place-items-center size-12 rounded-2xl bg-accent/10 text-accent">
              <Upload size={22} />
            </span>
            <span className="font-medium">Choisir un fichier CSV</span>
            <span className="text-xs text-muted">ou le déposer ici · export Excel, Google Sheets ou ancienne appli</span>
          </button>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void readFile(f);
              e.target.value = "";
            }}
          />
          <div className="rounded-xl bg-surface-2 p-3.5 text-[13px] text-muted leading-relaxed">
            Les colonnes sont reconnues automatiquement : nom, prénom, téléphone, e-mail, statut, type de bien, pièces, budget, surface, quartiers, source, dates de contact et de relance, notes… Les contacts déjà présents (même téléphone ou même e-mail) ne sont pas recréés.
          </div>
        </div>
      ) : (
        <div className="space-y-4 animate-fade-up">
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="À importer" value={result?.rows.length ?? 0} tone="ok" />
            <MiniStat label="Déjà connus" value={result?.doublons ?? 0} />
            <MiniStat label="Lignes vides" value={result?.ignores ?? 0} />
          </div>
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="h-section">Colonnes de « {fileName} »</span>
              <span className="text-xs text-muted">
                {reconnues}/{cols.length} reconnues
              </span>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {table[0].map((h, i) => (
                <label key={i} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium" title={h}>
                    {h || `Colonne ${i + 1}`}
                  </span>
                  <span className="text-muted text-xs">→</span>
                  <select
                    className={cx("h-8 rounded-lg border border-line bg-surface-2 px-2 text-xs max-w-[150px]", cols[i] ? "text-fg" : "text-muted")}
                    value={cols[i] ?? ""}
                    onChange={(e) => {
                      const v = (e.target.value || null) as CsvField | null;
                      setCols((cs) => cs.map((c, j) => (j === i ? v : v && c === v ? null : c)));
                    }}
                  >
                    <option value="">Ignorer</option>
                    {(Object.keys(FIELD_LABEL) as CsvField[]).map((f) => (
                      <option key={f} value={f}>
                        {FIELD_LABEL[f]}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {!hasName && <p className="mt-2 text-xs text-danger">Indiquez au moins la colonne du nom, du téléphone ou de l&apos;e-mail.</p>}
          </div>
          {!!result?.rows.length && (
            <div>
              <div className="h-section mb-2">Aperçu</div>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {result.rows.slice(0, 5).map((c, i) => (
                  <li key={i} className="px-3 py-2.5 text-sm">
                    <div className="font-medium">{[c.prenom, c.nom].filter(Boolean).join(" ")}</div>
                    <div className="text-xs text-muted truncate">
                      {[c.roles?.[0] && ROLE[c.roles[0]], c.tel, c.email, c.criteres?.budgetMax && `≤ ${eurK(c.criteres.budgetMax)}`, c.criteres?.quartiers?.join(", ")].filter(Boolean).join(" · ")}
                    </div>
                  </li>
                ))}
              </ul>
              {result.rows.length > 5 && <p className="mt-1.5 text-xs text-muted">… et {result.rows.length - 5} autres</p>}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone?: "ok" }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 px-3 py-2.5">
      <div className={cx("font-serif text-xl font-semibold", tone === "ok" && "text-ok")}>{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
