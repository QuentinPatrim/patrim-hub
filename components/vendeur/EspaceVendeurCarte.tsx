"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, Link2, Send, Unlink } from "lucide-react";
import { Card, Spinner } from "@/components/ui";
import { useCollection } from "@/lib/store";
import { dateCourte } from "@/lib/format";
import { cloudEnabled } from "@/lib/supabase";
import { copier, partager } from "@/components/assistant/outils";
import type { Bien } from "@/lib/types";
import { couperEspace, empreinte, espaceDe, lienEspace, photoEspace, publierEspace } from "./espace";

/** Carte « Espace vendeur » de la fiche : crée le lien, le tient à jour à chaque ouverture de la fiche, le coupe. */
export function EspaceVendeurCarte({ b, compatibles }: { b: Bien; compatibles: number }) {
  const { items: contacts } = useCollection("contacts");
  const { items: rdvs } = useCollection("rdvs");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const espace = espaceDe(b);
  const photo = useMemo(() => photoEspace(b, compatibles, contacts, rdvs), [b, compatibles, contacts, rdvs]);
  const a_jour = espace?.empreinte === empreinte(photo);

  // Fiche ouverte et quelque chose a changé : la page du vendeur suit, sans rien demander.
  useEffect(() => {
    if (!espace || a_jour || busy) return;
    const t = setTimeout(() => void publierEspace(b, photo).catch(() => {}), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [espace?.id, a_jour]);

  if (!cloudEnabled) return null;

  async function creer() {
    setBusy(true);
    setErr("");
    try {
      await publierEspace(b, photo);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function envoyer() {
    if (!espace) return;
    const r = await partager({
      title: "Suivi de votre vente",
      text: `Bonjour, voici votre espace pour suivre la vente de votre bien (visites, retours des visiteurs, prochaines étapes). Il se met à jour au fil de la commercialisation : ${lienEspace(espace.id)}`,
    });
    if (r === "copie") setNote("Message copié");
  }

  return (
    <Card title="Espace vendeur">
      {!espace ? (
        <>
          <p className="text-sm text-muted">
            Une page à envoyer au propriétaire : visites, retours anonymes des visiteurs, demandes reçues, étapes de la vente et diagnostics. Elle se met à jour toute seule quand tu ouvres cette fiche. Ni nom de visiteur, ni montant d&apos;offre.
          </p>
          <button className="btn-primary mt-3" onClick={creer} disabled={busy}>
            {busy ? <Spinner /> : <Link2 size={16} />} Créer le lien
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            Lien actif{espace.maj ? `, à jour du ${dateCourte(espace.maj)}` : ""}. {a_jour ? "" : "Mise à jour en cours…"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary btn-sm !h-9" onClick={envoyer}>
              <Send size={14} /> Envoyer au vendeur
            </button>
            <button className="btn-secondary btn-sm !h-9" onClick={() => void copier(lienEspace(espace.id)).then(() => setNote("Lien copié"))}>
              <Copy size={14} /> Copier
            </button>
            <a className="btn-secondary btn-sm !h-9" href={lienEspace(espace.id)} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Voir
            </a>
            <button
              className="btn-ghost btn-sm !h-9 text-danger"
              onClick={() => {
                if (confirm("Couper le lien ? Le propriétaire ne pourra plus ouvrir la page.")) void couperEspace(b);
              }}
            >
              <Unlink size={14} /> Couper
            </button>
          </div>
        </>
      )}
      {note && <p className="mt-2 text-xs text-ok">{note}</p>}
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
    </Card>
  );
}
