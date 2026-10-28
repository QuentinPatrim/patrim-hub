"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Copy, Download, ExternalLink, Globe, Printer, Unlink } from "lucide-react";
import { Card, Spinner } from "@/components/ui";
import { cloudEnabled } from "@/lib/supabase";
import { copier } from "@/components/assistant/outils";
import { qrSvg } from "@/components/qr/qr";
import { C } from "@/components/documents/charte";
import type { Bien, Contact } from "@/lib/types";
import { empreinteFiche, fichePageWeb, lienPageWeb, pageWebDe, publierPageWeb, retirerPageWeb } from "./pageweb";

/** Carte « Page web & QR vitrine » de la fiche du bien. */
export function PageWebCarte({ b, vendeurs }: { b: Bien; vendeurs: Contact[] }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const page = pageWebDe(b);
  const f = useMemo(() => fichePageWeb(b, vendeurs), [b, vendeurs]);
  const aJour = page?.empreinte === empreinteFiche(f);
  const lien = page ? lienPageWeb(page.id) : "";
  const qr = useMemo(() => (lien ? qrSvg(lien, C.brand) : ""), [lien]);

  // La page suit la fiche : remise à jour discrète quand quelque chose a changé.
  useEffect(() => {
    if (!page || aJour || busy) return;
    const t = setTimeout(() => void publierPageWeb(b, f).catch(() => {}), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id, aJour]);

  if (!cloudEnabled) return null;

  async function creer() {
    setBusy(true);
    setErr("");
    try {
      await publierPageWeb(b, f);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function telechargerQr() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([qr], { type: "image/svg+xml" }));
    a.download = `QR ${f.titre}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <Card title="Page web & QR vitrine">
      {!page ? (
        <>
          <p className="text-sm text-muted">
            Une page pour ce bien (photos, fiche, « Demander une visite ») avec son QR code à mettre en vitrine. Chaque demande arrive dans tes contacts, à rappeler le jour même, et te prévient sur le téléphone. Jamais l&apos;adresse exacte.
          </p>
          <button className="btn-primary mt-3" onClick={creer} disabled={busy}>
            {busy ? <Spinner /> : <Globe size={16} />} Créer la page
          </button>
        </>
      ) : (
        <div className="flex gap-4">
          <div className="w-28 shrink-0 overflow-hidden rounded-lg border border-line" dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="min-w-0 flex-1">
            <p className="break-all text-xs text-muted">{lien}</p>
            {!aJour && <p className="mt-1 text-xs text-muted">Mise à jour en cours…</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <Link className="btn-primary btn-sm !h-9" href={`/imprimer/vitrine/${b.id}`}>
                <Printer size={14} /> Affiche vitrine
              </Link>
              <button className="btn-secondary btn-sm !h-9" onClick={() => void copier(lien).then(() => setNote("Lien copié"))}>
                <Copy size={14} /> Lien
              </button>
              <button className="btn-secondary btn-sm !h-9" onClick={telechargerQr}>
                <Download size={14} /> QR
              </button>
              <a className="btn-secondary btn-sm !h-9" href={lien} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> Voir
              </a>
              <button
                className="btn-ghost btn-sm !h-9 text-danger"
                onClick={() => {
                  if (confirm("Retirer la page ? Le QR code ne mènera plus nulle part.")) void retirerPageWeb(b);
                }}
              >
                <Unlink size={14} /> Retirer
              </button>
            </div>
          </div>
        </div>
      )}
      {note && <p className="mt-2 text-xs text-ok">{note}</p>}
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
    </Card>
  );
}
