"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import { Card, Spinner } from "@/components/ui";
import { enregistrerLienAvis, useLienAvis } from "@/lib/profil";

/** Réglages : lien de la page où les clients laissent un avis, ajouté au remerciement après la vente. */
export function AvisCard() {
  const lien = useLienAvis();
  const [valeur, setValeur] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => setValeur(lien ?? ""), [lien]);

  const propre = valeur.trim();
  const valide = !propre || /^https:\/\/\S+$/i.test(propre);
  const change = propre !== (lien ?? "");

  const enregistrer = async () => {
    if (!valide) return;
    setBusy(true);
    setMsg("");
    try {
      await enregistrerLienAvis(propre || undefined);
      setMsg(propre ? "Lien enregistré : il sera ajouté aux remerciements après la vente." : "Lien retiré des remerciements.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Le lien n'a pas pu être enregistré.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Avis clients">
      <p className="text-sm text-muted">
        Après chaque vente, l&apos;appli prépare un remerciement pour l&apos;acquéreur et le vendeur. Collez ici le lien de la page Google où laisser un avis sur l&apos;agence : il sera ajouté au message.
      </p>
      <p className="mt-1 text-xs text-muted">Depuis la fiche Google de l&apos;agence, le bouton «&nbsp;Demander des avis&nbsp;» donne ce lien à copier.</p>
      <div className="mt-3 flex gap-2">
        <input
          className="input min-w-0"
          type="url"
          inputMode="url"
          placeholder="https://g.page/r/…/review"
          value={valeur}
          onChange={(e) => setValeur(e.target.value)}
          aria-label="Lien de la page d'avis"
        />
        <button type="button" className="btn-primary shrink-0" disabled={!valide || !change || busy} onClick={enregistrer}>
          {busy ? <Spinner /> : <Check size={15} />} Enregistrer
        </button>
      </div>
      {!valide && <p className="mt-1.5 text-xs text-warn">Le lien doit commencer par https://</p>}
      {lien && (
        <a href={lien} target="_blank" rel="noreferrer" className="mt-2 inline-flex h-10 items-center gap-1.5 text-sm font-medium text-accent hover:underline">
          <ExternalLink size={14} /> Tester le lien
        </a>
      )}
      {msg && <p className="mt-1 text-xs text-muted">{msg}</p>}
    </Card>
  );
}
