"use client";

/* Espace vendeur : page publique ouverte par le propriétaire avec son lien secret.
   Uniquement ce que le conseiller a publié (voir components/vendeur/espace.ts). */

import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, ExternalLink, Mail, Phone } from "lucide-react";
import { C } from "@/components/documents/charte";
import type { EspacePublic } from "@/components/vendeur/espace";

const TZ = "Europe/Paris";
const jour = (iso: string) => new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: TZ });
const jourHeure = (iso: string) => new Date(iso).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: TZ }).replace(":", "h");
const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const TON: Record<string, string> = { ok: "#2f7d4f", warn: "#b7791f", danger: "#c0392b", info: "#2c6fb0", neutral: C.muted };

export default function EspaceVendeur() {
  const { id } = useParams<{ id: string }>();
  const [e, setE] = useState<EspacePublic | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let annule = false;
    fetch(`/api/espace-vendeur/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (annule) return;
        if (d?.espace) setE(d.espace);
        else setErreur(true);
      })
      .catch(() => !annule && setErreur(true));
    return () => {
      annule = true;
    };
  }, [id]);

  useEffect(() => {
    if (e) document.title = `${e.titre} · Suivi de votre vente · PATRIM`;
  }, [e]);

  if (!e)
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center" style={{ background: C.paper, color: C.ink, colorScheme: "light" }}>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="PATRIM" className="mx-auto h-10 w-auto" />
          <p className="mt-6 text-sm" style={{ color: C.slate }}>
            {erreur ? "Ce lien n'est plus actif. Contactez l'agence PATRIM au 05 61 99 08 08." : "Chargement…"}
          </p>
        </div>
      </div>
    );

  const s = e.stats;
  return (
    <div className="min-h-dvh pb-10" style={{ background: C.paper, color: C.ink, colorScheme: "light" }}>
      <header className="px-4 py-4" style={{ background: C.brand }}>
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="PATRIM" className="h-8 w-auto brightness-0 invert" />
          <span className="text-xs font-medium text-white/80">Suivi de votre vente</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        <section className="overflow-hidden rounded-2xl bg-white" style={{ border: `1px solid ${C.line}` }}>
          {e.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={e.photo} alt="" className="h-48 w-full object-cover sm:h-64" />
          )}
          <div className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.brand }}>
              {e.statut}
            </div>
            <h1 className="mt-1 text-xl font-bold">{e.titre}</h1>
            {e.lieu && <p className="text-sm" style={{ color: C.slate }}>{e.lieu}</p>}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm" style={{ color: C.slate }}>
              {e.prix ? <span><b style={{ color: C.ink }}>{eur(e.prix)}</b> honoraires inclus</span> : null}
              {e.enVenteDepuis && <span>En vente depuis le {jour(e.enVenteDepuis)}</span>}
              {e.mandat?.type && <span>Mandat {e.mandat.type.toLowerCase()}{e.mandat.fin ? ` jusqu'au ${jour(e.mandat.fin)}` : ""}</span>}
            </div>
            {e.annonceUrl && (
              <a href={e.annonceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: C.brand }}>
                Voir l&apos;annonce <ExternalLink size={14} />
              </a>
            )}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Chiffre n={s.visites} label={s.visites > 1 ? "visites réalisées" : "visite réalisée"} detail={s.visites30 ? `dont ${s.visites30} ce mois-ci` : undefined} />
          <Chiffre n={e.aVenir.length} label={e.aVenir.length > 1 ? "visites prévues" : "visite prévue"} />
          <Chiffre n={s.demandes} label={s.demandes > 1 ? "demandes reçues" : "demande reçue"} />
          <Chiffre n={s.proposes} label={s.proposes > 1 ? "acquéreurs contactés" : "acquéreur contacté"} detail="dans notre fichier" />
        </section>

        {e.aVenir.length > 0 && (
          <Bloc titre="Prochaines visites">
            <ul className="space-y-1.5 text-sm">
              {e.aVenir.map((d) => (
                <li key={d} className="flex items-center gap-2">
                  <CalendarDays size={15} style={{ color: C.brand }} /> <span className="first-letter:uppercase">{jourHeure(d)}</span>
                </li>
              ))}
            </ul>
          </Bloc>
        )}

        {e.etapes.length > 0 && (
          <Bloc titre="Les étapes de la vente">
            <ol className="space-y-2.5">
              {e.etapes.map((x, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: x.etat === "fait" ? TON.ok : x.etat === "depasse" ? TON.danger : x.etat === "bientot" ? TON.warn : C.line }} />
                  <div>
                    <div className="font-semibold">{x.label}</div>
                    <div style={{ color: C.slate }}>{x.texte}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Bloc>
        )}

        <Bloc titre="Retours des visiteurs">
          {e.retours.length ? (
            <ul className="space-y-3">
              {e.retours.map((r, i) => (
                <li key={i} className="text-sm" style={{ borderTop: i ? `1px solid ${C.line}` : undefined, paddingTop: i ? 12 : 0 }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">Visite du {jour(r.date)}</span>
                    {r.avis ? <span style={{ color: C.brand }}>Intérêt {r.avis}/5</span> : null}
                  </div>
                  {r.ressenti && <p style={{ color: C.slate }}>{r.ressenti}</p>}
                  {r.positifs && <p><span style={{ color: TON.ok }}>Apprécié :</span> {r.positifs}</p>}
                  {r.negatifs && <p><span style={{ color: TON.warn }}>Réserves :</span> {r.negatifs}</p>}
                  {!r.ressenti && !r.positifs && !r.negatifs && <p style={{ color: C.muted }}>Retour à venir.</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm" style={{ color: C.muted }}>Pas encore de visite.</p>
          )}
        </Bloc>

        {e.diagnostics.length > 0 && (
          <Bloc titre="Vos diagnostics">
            <ul className="space-y-1.5 text-sm">
              {e.diagnostics.map((d) => (
                <li key={d.label} className="flex justify-between gap-3">
                  <span className="font-medium">{d.label}</span>
                  <span className="text-right" style={{ color: TON[d.tone] ?? C.slate }}>{d.texte}</span>
                </li>
              ))}
            </ul>
          </Bloc>
        )}

        <Bloc titre="Votre conseiller">
          <div className="text-sm font-semibold">{e.conseiller.nom}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={`tel:${e.conseiller.tel.replace(/[^\d+]/g, "")}`} className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white" style={{ background: C.brand }}>
              <Phone size={16} /> {e.conseiller.tel}
            </a>
            {e.conseiller.mail && (
              <a href={`mailto:${e.conseiller.mail}`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold" style={{ border: `1px solid ${C.line}`, color: C.brand }}>
                <Mail size={16} /> Écrire
              </a>
            )}
          </div>
        </Bloc>

        <p className="px-1 text-center text-xs" style={{ color: C.muted }}>
          Mis à jour le {jour(e.maj)}. Les visiteurs ne sont jamais nommés. PATRIM, 45 allées Jean Jaurès, 31000 Toulouse.
        </p>
      </main>
    </div>
  );
}

function Chiffre({ n, label, detail }: { n: number; label: string; detail?: string }) {
  return (
    <div className="rounded-2xl bg-white p-3" style={{ border: `1px solid ${C.line}` }}>
      <div className="text-2xl font-bold" style={{ color: C.brand }}>{n}</div>
      <div className="text-xs font-medium">{label}</div>
      {detail && <div className="text-[11px]" style={{ color: C.muted }}>{detail}</div>}
    </div>
  );
}

function Bloc({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4" style={{ border: `1px solid ${C.line}` }}>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide" style={{ color: C.brand }}>{titre}</h2>
      {children}
    </section>
  );
}
