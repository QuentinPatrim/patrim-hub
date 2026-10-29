"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download, Mail, Share2 } from "lucide-react";
import { Sheet, Spinner, cx } from "@/components/ui";
import { AGENCE } from "@/components/documents/charte";
import { authHeaders } from "@/lib/ai";
import { cloudEnabled, supabase } from "@/lib/supabase";
import { uid, update } from "@/lib/store";
import { googleConnecte } from "@/lib/googleClient";
import { conseiller, nomConseiller } from "@/lib/equipe";
import type { Contact, Estimation } from "@/lib/types";

/* « Envoyer » sur l'avis de valeur : le PDF est fabriqué sur le téléphone, puis
   - soit un brouillon Gmail complet (destinataire, objet, message, PDF, signature) est
     préparé par le script Google (Hub.gs) dans les 5 minutes ;
   - soit le PDF part tout de suite vers l'appli Gmail avec le message (partage du téléphone).
   Rien n'est jamais envoyé au client sans que Quentin appuie lui-même sur Envoyer dans Gmail. */

const MOT: Record<string, { mot: string; situe: string }> = {
  appartement: { mot: "appartement", situe: "situé" },
  maison: { mot: "maison", situe: "située" },
  immeuble: { mot: "immeuble", situe: "situé" },
  parking: { mot: "stationnement", situe: "situé" },
};

export function mailAvis(e: Estimation, proprio?: Contact) {
  const m = MOT[e.type] ?? MOT.appartement;
  const rue = (e.adresse || "").trim();
  const lieu = [rue, [e.codePostal, e.ville].filter(Boolean).join(" ")].filter(Boolean).join(" ");
  const civ = proprio?.civilite === "M." ? "Monsieur" : proprio?.civilite === "Mme" ? "Madame" : "";
  const bonjour = proprio?.nom && civ ? `Bonjour ${civ} ${proprio.nom},` : "Bonjour Madame, Monsieur,";
  const tel = AGENCE.conseillerTel.replace(/\./g, " ");
  return {
    sujet: `Estimation de votre ${m.mot}${rue ? ` – ${rue}` : ""}`,
    texte: [
      bonjour,
      "",
      `Comme convenu, veuillez trouver ci-joint l'estimation de votre ${m.mot}${lieu ? ` ${m.situe} ${lieu}` : ""}.`,
      "Je reste à votre disposition pour tout complément d'information ou question de votre part.",
      `Je suis joignable au ${tel}.`,
      "",
      "Bonne journée.",
      "",
      "Cordialement,",
    ].join("\n"),
    fichier: `Avis de valeur - ${rue || "estimation"}.pdf`.replace(/[\\/:*?"<>|]/g, " "),
  };
}

/** Met chaque image dans la page sous forme de données, pour que la capture ne soit pas bloquée par un autre site. */
async function figerImages(racine: HTMLElement) {
  const h = await authHeaders();
  const enDonnees = async (src: string) => {
    const memeSite = new URL(src, location.href).origin === location.origin;
    const r = await fetch(src, { mode: "cors", signal: AbortSignal.timeout(10_000) }).catch(() => null);
    const ok = r?.ok || memeSite ? r : await fetch(`/api/image-proxy?u=${encodeURIComponent(src)}`, { headers: { authorization: h.authorization ?? "" }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!ok?.ok) throw new Error("image");
    const b = await ok.blob();
    return await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = rej;
      fr.readAsDataURL(b);
    });
  };
  const imgs = [...racine.querySelectorAll("img")].filter((i) => i.style.display !== "none" && i.src && !i.src.startsWith("data:"));
  await Promise.all(
    imgs.map(async (i) => {
      try {
        const d = await enDonnees(i.currentSrc || i.src);
        await new Promise<void>((res) => {
          setTimeout(res, 3000);
          i.onload = () => res();
          i.onerror = () => res();
          i.srcset = "";
          i.src = d;
        });
      } catch {
        i.style.display = "none"; // une photo injoignable ne doit pas bloquer tout le PDF
      }
    })
  );
}

const VIDE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** PDF A4 de toutes les pages de l'avis (une image par page, rendu identique à l'écran). */
export async function fabriquerPdf(scene: HTMLElement, avancement?: (n: number, total: number) => void): Promise<Blob> {
  const [{ toJpeg, getFontEmbedCSS }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const zoomAvant = scene.style.zoom;
  scene.style.zoom = "1";
  try {
    await figerImages(scene);
    const pages = [...scene.querySelectorAll<HTMLElement>(".print-page")];
    // Polices lues une seule fois pour toutes les pages (sinon chaque page les retélécharge)
    const fontEmbedCSS = pages[0] ? await Promise.race([getFontEmbedCSS(pages[0]), new Promise<string>((r) => setTimeout(() => r(""), 15_000))]).catch(() => "") : "";
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    for (let n = 0; n < pages.length; n++) {
      avancement?.(n + 1, pages.length);
      const jpeg = await toJpeg(pages[n], {
        quality: 0.86,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        fontEmbedCSS,
        style: { margin: "0", boxShadow: "none", borderRadius: "0" },
        imagePlaceholder: VIDE,
        filter: (el) => !(el instanceof HTMLElement && (el.classList.contains("no-print") || (el.tagName === "IMG" && el.style.display === "none"))),
      });
      if (n) pdf.addPage("a4", "portrait");
      pdf.addImage(jpeg, "JPEG", 0, 0, 210, 297, undefined, "FAST");
    }
    return pdf.output("blob");
  } finally {
    scene.style.zoom = zoomAvant;
  }
}

const enBase64 = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(",")[1] ?? "");
    fr.onerror = rej;
    fr.readAsDataURL(b);
  });

export function EnvoyerAvis({ open, onClose, estimation: e, proprio, scene }: { open: boolean; onClose: () => void; estimation: Estimation; proprio?: Contact; scene: () => HTMLElement | null }) {
  const modele = mailAvis(e, proprio);
  const [a, setA] = useState(proprio?.email ?? "");
  const [sujet, setSujet] = useState(modele.sujet);
  const [texte, setTexte] = useState(modele.texte);
  const [pdf, setPdf] = useState<Blob>();
  const [etat, setEtat] = useState("");
  const [erreur, setErreur] = useState("");
  const [fait, setFait] = useState<"" | "brouillon" | "gmail" | "partage">("");
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    if (!open) return;
    setA(proprio?.email ?? "");
    setSujet(modele.sujet);
    setTexte(modele.texte);
    setFait("");
    setErreur("");
    setPdf(undefined);
    const s = scene();
    if (!s) return;
    let fini = false;
    setEtat("Préparation du PDF…");
    // Laisse la feuille s'afficher avant le gros calcul
    const t = setTimeout(() => {
      fabriquerPdf(s, (n, total) => !fini && setEtat(`Préparation du PDF… page ${n}/${total}`))
        .then((b) => !fini && setPdf(b))
        .catch((x) => (console.error("PDF avis", x), !fini && setErreur("Le PDF n'a pas pu être préparé sur ce téléphone. Utilise le bouton PDF puis Gmail.")))
        .finally(() => !fini && setEtat(""));
    }, 250);
    return () => {
      fini = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const noter = (comment: string) => {
    if (!proprio) return;
    const h = proprio.historique ?? [];
    update("contacts", proprio.id, { historique: [...h, { date: new Date().toISOString(), type: "mail", texte: `Avis de valeur ${comment} (${e.adresse || "estimation"})` }], dernierContact: new Date().toISOString() } as Partial<Contact>);
  };

  const brouillon = async () => {
    if (!pdf || !supabase) return;
    setErreur("");
    setEtat("Envoi vers Gmail…");
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Connecte-toi d'abord.");
      const direct = googleConnecte();
      const cle = uid();
      // « direct » : créé tout de suite dans le Gmail de la personne connectée ; sinon le script Google le reprend
      const { error } = await supabase.from("hub_docs").insert({
        id: cle,
        kind: "brouillon_mail",
        user_id: u.user.id,
        updated_at: new Date().toISOString(),
        data: { statut: direct ? "direct" : "a_creer", a: a.trim(), sujet, texte, pdfNom: modele.fichier, pdf: await enBase64(pdf), estimationId: e.id, creeLe: new Date().toISOString() },
      });
      if (error) throw new Error(error.message);
      if (direct) {
        const s = conseiller();
        const r = await fetch("/api/google/brouillon", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ id: cle, signature: { nom: nomConseiller(), titre: s.titre, tel: s.tel, mail: s.mail } }) });
        if (!r.ok) {
          // Connexion Google perdue : le brouillon repasse par le script Google
          await supabase.from("hub_docs").update({ data: { statut: "a_creer", a: a.trim(), sujet, texte, pdfNom: modele.fichier, pdf: await enBase64(pdf), estimationId: e.id, creeLe: new Date().toISOString() } }).eq("id", cle);
          setFait("brouillon");
          noter("préparé en brouillon Gmail");
          return;
        }
        setFait("gmail");
        noter("mis en brouillon dans Gmail");
        return;
      }
      setFait("brouillon");
      noter("préparé en brouillon Gmail");
    } catch (x) {
      setErreur(x instanceof Error ? x.message : "Le brouillon n'a pas pu être préparé.");
    } finally {
      setEtat("");
    }
  };

  const fichier = pdf ? new File([pdf], modele.fichier, { type: "application/pdf" }) : undefined;
  const peutPartager = typeof navigator !== "undefined" && !!fichier && !!navigator.canShare?.({ files: [fichier] });
  const partager = async () => {
    if (!fichier) return;
    try {
      await navigator.share({ files: [fichier], title: sujet, text: texte });
      setFait("partage");
      noter("partagé depuis le téléphone");
    } catch {}
  };
  const telecharger = () => {
    if (!pdf) return;
    const url = URL.createObjectURL(pdf);
    const l = document.createElement("a");
    l.href = url;
    l.download = modele.fichier;
    l.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const copierAdresse = async () => {
    try {
      await navigator.clipboard.writeText(a);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {}
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Mail size={16} className="text-accent" /> Envoyer l&apos;avis de valeur
        </span>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="label">À</span>
          <div className="flex gap-2">
            <input className="input" type="email" value={a} onChange={(ev) => setA(ev.target.value)} placeholder="adresse e-mail du propriétaire" />
            {a && (
              <button className="btn-secondary !h-11 shrink-0 px-3" onClick={copierAdresse} aria-label="Copier l'adresse">
                {copie ? <Check size={16} /> : <Copy size={16} />}
              </button>
            )}
          </div>
        </label>
        <label className="block">
          <span className="label">Objet</span>
          <input className="input" value={sujet} onChange={(ev) => setSujet(ev.target.value)} />
        </label>
        <label className="block">
          <span className="label">Message</span>
          <textarea className="input min-h-[220px] text-sm" value={texte} onChange={(ev) => setTexte(ev.target.value)} />
          <span className="mt-1 block text-xs text-muted">Ta signature PATRIM (avec le logo) est ajoutée dans le brouillon Gmail.</span>
        </label>

        <div className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
          {etat ? (
            <span className="inline-flex items-center gap-2 text-muted">
              <Spinner /> {etat}
            </span>
          ) : pdf ? (
            <span className="inline-flex items-center gap-2">
              <Check size={15} className="text-emerald-600" /> {modele.fichier} · {(pdf.size / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo
              <button className="ml-1 text-xs text-accent underline" onClick={telecharger}>
                <Download size={12} className="inline" /> voir
              </button>
            </span>
          ) : (
            <span className="text-muted">PDF en attente</span>
          )}
        </div>
        {erreur && <p className="text-sm text-danger">{erreur}</p>}

        {fait === "gmail" ? (
          <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
            Le brouillon est dans <b>Gmail &gt; Brouillons</b>, avec le PDF et ta signature.{" "}
            <a className="font-semibold underline" href="https://mail.google.com/mail/u/0/#drafts" target="_blank" rel="noreferrer">
              Ouvrir Gmail
            </a>
            , relis-le et appuie sur Envoyer.
          </p>
        ) : fait === "brouillon" ? (
          <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
            C&apos;est parti : le brouillon apparaît dans <b>Gmail &gt; Brouillons</b> d&apos;ici 5 minutes, avec le PDF et ta signature. Relis-le et appuie sur Envoyer.
          </p>
        ) : (
          <div className="grid gap-2">
            {cloudEnabled && (
              <button className="btn-primary !h-12" disabled={!pdf || !a.trim() || !!etat} onClick={brouillon}>
                <Mail size={16} /> Préparer le brouillon Gmail
              </button>
            )}
            {peutPartager && (
              <button className={cx(cloudEnabled ? "btn-secondary" : "btn-primary", "!h-12")} disabled={!!etat} onClick={partager}>
                <Share2 size={16} /> Ouvrir dans Gmail maintenant
              </button>
            )}
            {peutPartager && <p className="text-xs text-muted">« Maintenant » : Gmail s&apos;ouvre avec le PDF et le message, il te reste à choisir le destinataire (copie l&apos;adresse avec le bouton à côté).</p>}
            {fait === "partage" && <p className="text-xs text-emerald-600">Partagé. Pense à appuyer sur Envoyer dans Gmail.</p>}
          </div>
        )}
        <p className="text-xs text-muted">Rien n&apos;est envoyé au client depuis le Hub : c&apos;est toi qui appuies sur Envoyer dans Gmail.</p>
      </div>
    </Sheet>
  );
}
