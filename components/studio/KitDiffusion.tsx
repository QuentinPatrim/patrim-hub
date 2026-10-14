"use client";

import { AlertTriangle, BookmarkPlus, Clapperboard, Copy, Facebook, FileText, Instagram, Linkedin, Mail, MessageCircleMore, RefreshCw, Share2, Smartphone, Sparkles, Users } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cx, Spinner } from "@/components/ui";
import { ask } from "@/lib/ai";
import { ACQUEREUR_ACTIF, topMatches, matchScore } from "@/lib/matching";
import { useCollection } from "@/lib/store";
import type { Bien, Canal } from "@/lib/types";
import { aCompleter, AutoTextarea, useToast } from "./bits";
import { AGENCE, CANAL, copier, enregistrerContenu, errMsg, faitsPublics, partager } from "./shared";

type Key = "annonce" | "instagram" | "facebook" | "linkedin" | "reel" | "story" | "mail";
interface Bloc {
  key: Key;
  titre?: string;
  texte: string;
  hashtags?: string;
}
type Kit = Partial<Record<Key, Bloc>>;

const META: Record<Key, { label: string; canal: Canal; icon: ReactNode; titreLabel?: string; titreMax?: number; aide: string }> = {
  annonce: { label: "Annonce portail", canal: "annonce", icon: <FileText size={16} />, titreLabel: "Titre", titreMax: 60, aide: "SeLoger, Leboncoin, Bien'ici, site PATRIM" },
  instagram: { label: "Post Instagram", canal: "instagram_post", icon: <Instagram size={16} />, titreLabel: "Accroche", aide: "Légende du post, hashtags locaux" },
  facebook: { label: "Post Facebook", canal: "facebook", icon: <Facebook size={16} />, aide: "Page de l'agence, groupes de quartier" },
  linkedin: { label: "Post LinkedIn", canal: "linkedin", icon: <Linkedin size={16} />, aide: "Réseau pro, investisseurs, mutations" },
  reel: { label: "Script de reel", canal: "instagram_reel", icon: <Clapperboard size={16} />, titreLabel: "Titre du reel", aide: "20 à 30 s, plans et textes à l'écran" },
  story: { label: "Story", canal: "instagram_story", icon: <Smartphone size={16} />, aide: "3 écrans + sticker" },
  mail: { label: "Mail aux acquéreurs", canal: "email", icon: <Mail size={16} />, titreLabel: "Objet", aide: "À envoyer en copie cachée" },
};
const ORDER: Key[] = ["annonce", "instagram", "facebook", "linkedin", "reel", "story", "mail"];

const SYSTEM = `Tu es le responsable marketing digital de l'agence PATRIM (Toulouse, Instagram @${AGENCE.instagram}). Tu écris des contenus de diffusion immobilière efficaces, sobres et précis, adaptés à chaque réseau.
Règles strictes :
- Utilise uniquement les faits fournis. Toute info utile manquante : écris [À compléter : …]. N'invente ni surface, ni étage, ni charges, ni orientation, ni proximité (écoles, métro…) non fournie.
- Prix toujours "honoraires inclus". Classe énergie (DPE) obligatoire dans l'annonce, les posts et le mail quand elle est connue ; si elle est inconnue, écris [À compléter : classe DPE] dans l'annonce.
- Jamais d'information sur le vendeur (identité, raison de la vente, situation), ni de marge de négociation, ni d'adresse exacte (quartier seulement).
- Pas de superlatifs creux. Emojis : quelques-uns sur Instagram, Facebook et story ; aucun dans l'annonce, LinkedIn sobre.
- Signature : ${AGENCE.conseiller}, PATRIM, ${AGENCE.tel}.
Réponds uniquement avec un objet JSON valide.`;

const SCHEMA_PARTS: Record<Key, string> = {
  annonce: `{ "titre": "titre d'annonce de 60 caractères maximum", "texte": "annonce portail complète (accroche, description pièce par pièce si connue, copropriété, DPE/GES, prix honoraires inclus, mention honoraires, contact)" }`,
  instagram: `{ "accroche": "première ligne qui arrête le défilement", "texte": "légende du post", "hashtags": ["#toulouse", "… 10 à 15 hashtags locaux (quartier, Toulouse, Occitanie, immobilier)"] }`,
  facebook: `{ "texte": "post Facebook" }`,
  linkedin: `{ "texte": "post LinkedIn" }`,
  reel: `{ "titre": "titre court", "plans": [ { "temps": "0-3 s", "plan": "ce que l'on filme", "texte_ecran": "texte affiché" } ], "legende": "légende du reel" }`,
  story: `{ "ecrans": ["texte écran 1", "texte écran 2", "texte écran 3"], "sticker": "idée de sticker (sondage, lien, question…)" }`,
  mail: `{ "objet": "objet du mail", "texte": "mail aux acquéreurs de notre base, vouvoiement, invitation à visiter" }`,
};
const schemaFor = (keys: Key[]) => "{\n" + keys.map((k) => ` "${k}": ${SCHEMA_PARTS[k]}`).join(",\n") + "\n}";

type Raw = {
  annonce?: { titre?: string; texte?: string };
  instagram?: { accroche?: string; texte?: string; hashtags?: string[] | string };
  facebook?: { texte?: string };
  linkedin?: { texte?: string };
  reel?: { titre?: string; plans?: { temps?: string; plan?: string; texte_ecran?: string }[]; legende?: string };
  story?: { ecrans?: string[]; sticker?: string };
  mail?: { objet?: string; texte?: string };
};

function toKit(r: Raw): Kit {
  const k: Kit = {};
  const tags = (h?: string[] | string) => (Array.isArray(h) ? h.join(" ") : h ?? "");
  if (r.annonce) k.annonce = { key: "annonce", titre: r.annonce.titre ?? "", texte: r.annonce.texte ?? "" };
  if (r.instagram) k.instagram = { key: "instagram", titre: r.instagram.accroche ?? "", texte: r.instagram.texte ?? "", hashtags: tags(r.instagram.hashtags) };
  if (r.facebook) k.facebook = { key: "facebook", texte: r.facebook.texte ?? "" };
  if (r.linkedin) k.linkedin = { key: "linkedin", texte: r.linkedin.texte ?? "" };
  if (r.reel)
    k.reel = {
      key: "reel",
      titre: r.reel.titre ?? "",
      texte:
        (r.reel.plans ?? []).map((p, i) => `${i + 1}. ${p.temps ?? ""} — ${p.plan ?? ""}\n   À l'écran : « ${p.texte_ecran ?? ""} »`).join("\n") + (r.reel.legende ? `\n\nLégende : ${r.reel.legende}` : ""),
    };
  if (r.story) k.story = { key: "story", texte: (r.story.ecrans ?? []).map((e, i) => `Écran ${i + 1} : ${e}`).join("\n") + (r.story.sticker ? `\nSticker : ${r.story.sticker}` : "") };
  if (r.mail) k.mail = { key: "mail", titre: r.mail.objet ?? "", texte: r.mail.texte ?? "" };
  return k;
}

export function texteComplet(b: Bloc) {
  if (b.key === "instagram") return [b.titre, b.texte, b.hashtags].filter(Boolean).join("\n\n");
  if (b.key === "mail") return b.texte;
  if (b.key === "annonce" || b.key === "reel") return [b.titre, b.texte].filter(Boolean).join("\n\n");
  return b.texte;
}

const storeKey = (id: string) => "patrim-hub:studio-kit:" + id;
const ETAPES = ["Lecture de la fiche du bien…", "Rédaction de l'annonce…", "Posts Instagram, Facebook, LinkedIn…", "Script du reel et story…", "Mail aux acquéreurs…", "Relecture : DPE, prix, confidentialité…"];

export function KitDiffusion({ bien }: { bien: Bien }) {
  const [kit, setKit] = useState<Kit>({});
  const [loading, setLoading] = useState<Key | "all" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [etape, setEtape] = useState(0);
  const { toast, node } = useToast();
  const contacts = useCollection("contacts").items;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey(bien.id));
      setKit(raw ? (JSON.parse(raw) as Kit) : {});
    } catch {
      setKit({});
    }
    setErr(null);
  }, [bien.id]);
  const save = (k: Kit) => {
    setKit(k);
    try {
      localStorage.setItem(storeKey(bien.id), JSON.stringify(k));
    } catch {}
  };

  useEffect(() => {
    if (loading !== "all") return;
    setEtape(0);
    const t = setInterval(() => setEtape((e) => Math.min(e + 1, ETAPES.length - 1)), 4500);
    return () => clearInterval(t);
  }, [loading]);

  const acquereurs = useMemo(
    () => topMatches(contacts.filter((c) => ACQUEREUR_ACTIF(c) && c.email), (c) => matchScore(c, bien), 55).map((m) => m.item),
    [contacts, bien]
  );

  const manque = [!bien.dpe && "classe DPE", !bien.prix && "prix", !bien.surface && "surface", !bien.photos?.length && "photos"].filter(Boolean) as string[];

  async function generer(only?: Key) {
    setLoading(only ?? "all");
    setErr(null);
    try {
      const schema = schemaFor(only ? [only] : ORDER);
      const res = await ask<Raw>({
        system: SYSTEM,
        smart: true,
        json: true,
        maxTokens: 9000,
        prompt: `Fiche du bien (faits vérifiés, seuls utilisables) :\n${faitsPublics(bien)}\n\n${only ? `Réécris uniquement le contenu « ${META[only].label} », avec une approche différente de la précédente.` : "Prépare le kit de diffusion complet."}\nFormat de réponse (JSON) :\n${schema}`,
      });
      if (!res.json) throw new Error("La réponse n'a pas pu être lue. Réessayez.");
      const k = toKit(res.json);
      save(only ? { ...kit, [only]: k[only] ?? kit[only] } : k);
      toast(only ? "Nouvelle version prête" : "Kit de diffusion prêt");
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setLoading(null);
    }
  }

  const blocs = ORDER.map((k) => kit[k]).filter(Boolean) as Bloc[];

  return (
    <div className="space-y-4">
      {node}
      {/* En-tête du kit */}
      <div className="card overflow-hidden">
        <div className="relative bg-ink text-white p-5 sm:p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/arcades.png" alt="" className="pointer-events-none absolute inset-x-0 bottom-0 w-full opacity-[0.08] invert" />
          <div className="relative">
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">Kit de diffusion</div>
            <h2 className="mt-1 font-serif text-xl sm:text-2xl font-semibold">7 contenus prêts à publier, en un clic</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ORDER.map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 h-7 text-[11px] text-white/85">
                  {META[k].icon} {META[k].label}
                </span>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button onClick={() => generer()} disabled={!!loading} className="btn bg-white text-ink hover:bg-cream">
                {loading === "all" ? <Spinner /> : <Sparkles size={16} />}
                {blocs.length ? "Tout régénérer" : "Générer le kit"}
              </button>
              <span className="text-xs text-white/55">Rédaction soignée, environ 30 à 60 secondes</span>
            </div>
          </div>
        </div>
        {manque.length > 0 && (
          <div className="flex items-start gap-2 px-5 py-3 text-xs text-warn bg-warn/5 border-t border-line">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>
              Fiche incomplète : {manque.join(", ")}. Les textes contiendront des <strong>[À compléter]</strong> à remplir avant publication.
            </span>
          </div>
        )}
      </div>

      {err && <div className="card card-pad text-sm text-danger border-danger/30">{err}</div>}

      {loading === "all" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card card-pad md:col-span-2 flex items-center gap-3">
            <Spinner className="text-accent" />
            <span key={etape} className="text-sm animate-fade-up">
              {ETAPES[etape]}
            </span>
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card card-pad space-y-3">
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-11/12" />
              <div className="skeleton h-3 w-4/5" />
              <div className="skeleton h-3 w-2/3" />
            </div>
          ))}
        </div>
      )}

      {loading !== "all" && blocs.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {blocs.map((b) => (
            <BlocCard
              key={b.key}
              bloc={b}
              busy={loading === b.key}
              onChange={(nb) => save({ ...kit, [b.key]: nb })}
              onRegen={() => generer(b.key)}
              toast={toast}
              bien={bien}
              acquereurs={b.key === "mail" ? acquereurs.map((c) => c.email!) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BlocCard({
  bloc,
  busy,
  onChange,
  onRegen,
  toast,
  bien,
  acquereurs,
}: {
  bloc: Bloc;
  busy: boolean;
  onChange: (b: Bloc) => void;
  onRegen: () => void;
  toast: (m: string) => void;
  bien: Bien;
  acquereurs?: string[];
}) {
  const m = META[bloc.key];
  const full = texteComplet(bloc);
  const trous = aCompleter(full + " " + (bloc.titre ?? ""));
  const tropLong = m.titreMax && (bloc.titre?.length ?? 0) > m.titreMax;
  const wide = bloc.key === "annonce" || bloc.key === "reel";

  return (
    <section className={cx("card flex flex-col animate-fade-up", wide && "md:col-span-2", busy && "opacity-60")}>
      <header className="flex items-center gap-2.5 px-4 sm:px-5 pt-4">
        <span className="grid place-items-center size-8 rounded-xl text-white" style={{ background: CANAL[m.canal].color }}>
          {m.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="h-section">{m.label}</div>
          <div className="text-[11px] text-muted truncate">{m.aide}</div>
        </div>
        {trous > 0 && (
          <span className="chip !border-warn/30 !bg-warn/10 !text-warn" title="Infos à compléter avant publication">
            {trous} à compléter
          </span>
        )}
        <button onClick={onRegen} disabled={busy} className="btn-ghost btn-sm !px-2" title="Proposer une autre version" aria-label="Proposer une autre version">
          {busy ? <Spinner /> : <RefreshCw size={15} />}
        </button>
      </header>
      <div className="card-pad pt-3 space-y-2.5 flex-1">
        {m.titreLabel && (
          <label className="block">
            <span className="label flex justify-between">
              {m.titreLabel}
              {m.titreMax && (
                <span className={cx("tabular-nums", tropLong ? "text-danger font-semibold" : "text-muted")}>
                  {bloc.titre?.length ?? 0} / {m.titreMax}
                </span>
              )}
            </span>
            <input className={cx("input font-medium", tropLong && "!border-danger")} value={bloc.titre ?? ""} onChange={(e) => onChange({ ...bloc, titre: e.target.value })} />
          </label>
        )}
        <AutoTextarea value={bloc.texte} minRows={5} onChange={(e) => onChange({ ...bloc, texte: e.target.value })} className={cx("text-[13.5px]", bloc.key === "reel" && "font-mono text-[12.5px]")} />
        {bloc.key === "instagram" && (
          <AutoTextarea value={bloc.hashtags ?? ""} minRows={2} onChange={(e) => onChange({ ...bloc, hashtags: e.target.value })} className="text-[12.5px] text-accent" />
        )}
        <div className="text-[11px] text-muted tabular-nums">{full.length.toLocaleString("fr-FR")} caractères</div>
      </div>
      <footer className="flex flex-wrap items-center gap-1.5 px-4 sm:px-5 pb-4">
        <button
          className="btn-secondary btn-sm"
          onClick={async () => {
            toast((await copier(full)) ? "Texte copié" : "Copie impossible");
          }}
        >
          <Copy size={14} /> Copier
        </button>
        <button
          className="btn-secondary btn-sm"
          onClick={async () => {
            const r = await partager({ title: bloc.titre || m.label, text: full });
            if (r === "copie") toast("Texte copié (partage indisponible)");
          }}
        >
          <Share2 size={14} /> Partager
        </button>
        <button
          className="btn-secondary btn-sm"
          onClick={() => {
            enregistrerContenu({
              bienId: bien.id,
              canal: m.canal,
              titre: bloc.titre || `${m.label} · ${bien.titre}`,
              texte: bloc.key === "instagram" ? [bloc.titre, bloc.texte].filter(Boolean).join("\n\n") : bloc.texte,
              hashtags: bloc.hashtags ? bloc.hashtags.split(/\s+/).filter((h) => h.startsWith("#")) : undefined,
              statut: "brouillon",
            });
            toast("Enregistré dans le calendrier");
          }}
        >
          <BookmarkPlus size={14} /> Enregistrer
        </button>
        {bloc.key === "mail" && (
          <a
            className="btn-primary btn-sm ml-auto"
            href={`mailto:?${acquereurs?.length ? `bcc=${encodeURIComponent(acquereurs.join(","))}&` : ""}subject=${encodeURIComponent(bloc.titre ?? "")}&body=${encodeURIComponent(bloc.texte)}`}
            title="Les adresses sont en copie cachée"
          >
            {acquereurs?.length ? <Users size={14} /> : <MessageCircleMore size={14} />}
            {acquereurs?.length ? `Ouvrir pour ${acquereurs.length} acquéreur${acquereurs.length > 1 ? "s" : ""}` : "Ouvrir dans le mail"}
          </a>
        )}
      </footer>
    </section>
  );
}
