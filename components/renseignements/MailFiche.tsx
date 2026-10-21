"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Mail } from "lucide-react";
import { Field } from "@/components/ui";
import { nomConseiller } from "@/lib/equipe";
import type { LogementPublic, RoleDossier } from "./dossier";
import { copierMail, ecrireEntree, lireEntree, mailFiche, type InfosEntree } from "./mail";

/* Mail d'envoi de la fiche (trame de l'agence) : état des lieux et PDL à
   saisir une fois par bien (gardés sur l'appareil), aperçu mis en forme,
   copie pour Gmail ou ouverture de l'appli Mail. */

export function MailFiche({
  bienId,
  prenom,
  role,
  logement,
  url,
  deQui,
  garants,
  email,
}: {
  bienId: string;
  prenom: string;
  role: RoleDossier;
  logement: LogementPublic;
  url: string;
  deQui?: string;
  garants?: string[];
  email?: string;
}) {
  const [infos, setInfos] = useState<InfosEntree>({});
  const [copie, setCopie] = useState<"" | "ok" | "err">("");
  useEffect(() => {
    const x = lireEntree(bienId);
    setInfos({ ...x, edlDate: x.edlDate || logement.entree });
  }, [bienId, logement.entree]);
  const maj = (p: Partial<InfosEntree>) =>
    setInfos((x) => {
      const n = { ...x, ...p };
      ecrireEntree(bienId, n);
      return n;
    });

  const m = useMemo(() => mailFiche({ prenom, role, logement, url, deQui, garants, infos, signature: nomConseiller() }), [prenom, role, logement, url, deQui, garants, infos]);

  const copier = async () => {
    try {
      await copierMail(m.html, m.texte);
      setCopie("ok");
    } catch {
      setCopie("err");
    }
    setTimeout(() => setCopie(""), 2500);
  };

  return (
    <div className="space-y-3">
      {role !== "garant" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="État des lieux, le">
            <input type="date" className="input" value={infos.edlDate ?? ""} onChange={(e) => maj({ edlDate: e.target.value || undefined })} />
          </Field>
          <Field label="à">
            <input type="time" className="input" value={infos.edlHeure ?? ""} onChange={(e) => maj({ edlHeure: e.target.value || undefined })} />
          </Field>
          <div className="col-span-2">
            <Field label="Point de livraison électricité (PDL)">
              <input className="input" inputMode="numeric" placeholder="14 chiffres" value={infos.pdl ?? ""} onChange={(e) => maj({ pdl: e.target.value.trim() || undefined })} />
            </Field>
          </div>
        </div>
      )}
      <div className="rounded-xl border border-line bg-white px-4 py-3 text-[13px] dark:bg-white" style={{ colorScheme: "light" }} dangerouslySetInnerHTML={{ __html: m.html }} />
      {m.manque.length > 0 && <p className="text-xs text-warn">Surligné en jaune, à compléter dans le mail : {[...new Set(m.manque)].join(", ")}.</p>}
      <p className="text-xs text-muted">Pensez à joindre le RIB{role !== "garant" ? " et la notice d'entrée" : ""} dans le mail.</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-primary !h-12" onClick={copier}>
          {copie === "ok" ? <Check size={17} /> : <Copy size={17} />} {copie === "ok" ? "Copié" : copie === "err" ? "Copie refusée" : "Copier le mail"}
        </button>
        <a className="btn-secondary !h-12" href={`mailto:${email ?? ""}?subject=${encodeURIComponent(m.sujet)}&body=${encodeURIComponent(m.texte)}`}>
          <Mail size={17} /> Ouvrir dans Mail
        </a>
      </div>
      <p className="text-center text-xs text-muted">« Copier le mail » garde le gras et le lien : collez-le dans Gmail. « Ouvrir dans Mail » l&apos;ouvre sans mise en forme.</p>
    </div>
  );
}
