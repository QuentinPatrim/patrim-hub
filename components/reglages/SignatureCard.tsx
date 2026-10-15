"use client";

import { useState } from "react";
import { PenLine, Trash2, Upload } from "lucide-react";
import { Card, Spinner } from "@/components/ui";
import { enregistrerSignature, preparerSignature, useSignature } from "@/lib/profil";

/** Réglages : signature manuscrite apposée sur les avis de valeur (stockée dans votre compte, pas dans l'appli). */
export function SignatureCard() {
  const signature = useSignature();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const choisir = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    setMsg("");
    try {
      await enregistrerSignature(await preparerSignature(f));
      setMsg("Signature enregistrée. Elle apparaîtra sur vos avis de valeur.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "La signature n'a pas pu être enregistrée.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Signature des avis de valeur">
      <p className="text-sm text-muted">
        Photographiez votre signature à l&apos;encre foncée sur une feuille blanche. Le fond est retiré automatiquement. Elle est gardée dans votre compte et n&apos;apparaît que sur vos avis de valeur.
      </p>
      <div className="mt-3 grid place-items-center h-28 rounded-2xl border border-dashed border-line bg-[#fff]">
        {signature ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signature} alt="Votre signature" className="max-h-24 max-w-[80%] object-contain" />
        ) : (
          <span className="flex items-center gap-2 text-sm text-[#7a7f87]">
            <PenLine size={16} /> Aucune signature
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="btn-primary !h-11 flex-1 sm:flex-none cursor-pointer">
          {busy ? <Spinner /> : <Upload size={16} />} {signature ? "Remplacer" : "Ajouter ma signature"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => choisir(e.target.files?.[0])} />
        </label>
        {signature && (
          <button
            className="btn-secondary !h-11"
            onClick={() =>
              enregistrerSignature(undefined).then(
                () => setMsg("Signature retirée des avis de valeur."),
                (e: Error) => setMsg(e.message)
              )
            }
          >
            <Trash2 size={15} /> Retirer
          </button>
        )}
      </div>
      {msg && <p className="mt-3 text-sm text-accent">{msg}</p>}
    </Card>
  );
}
