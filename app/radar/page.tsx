"use client";

/* Radar vendeurs : adresses où une vente se prépare peut-être, d'après
   des données publiques (DPE, audits énergétiques, BODACC) et le fichier
   PATRIM. Prospection par courrier ou boîtage uniquement : jamais d'appel
   sans l'accord préalable du propriétaire. */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, MapPin, Radar as IconeRadar, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Badge, Empty, PageHeader, Spinner, Tabs, cx } from "@/components/ui";
import { useCollection } from "@/lib/store";
import { dateCourte } from "@/lib/format";
import { mapsHref } from "@/components/biens/utils";
import { CP_TOULOUSE, SOURCE, chargerSignaux, horsPortefeuille, signauxFichier, type Signal, type Source } from "@/components/radar/radar";
import { ACTION, cleAdresse, enregistrerRadar, noterAction, useSuiviRadar, type Action } from "@/components/radar/suivi";

type Filtre = "tous" | Source | "faits";
const CLE_CACHE = "patrim-hub:radar-signaux";

export default function Radar() {
  const { items: biens } = useCollection("biens");
  const { items: estimations } = useCollection("estimations");
  const suivi = useSuiviRadar();
  const [publics, setPublics] = useState<Signal[]>([]);
  const [sources, setSources] = useState<Record<string, number | string>>({});
  const [jours, setJours] = useState(60);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [cpTexte, setCpTexte] = useState("");
  const [pret, setPret] = useState(false);
  const [vus, setVus] = useState(150);
  const cps = suivi?.codesPostaux?.length ? suivi.codesPostaux : CP_TOULOUSE;

  useEffect(() => {
    setPret(true);
    try {
      const c = JSON.parse(sessionStorage.getItem(CLE_CACHE) ?? "null");
      if (c?.signaux) {
        setPublics(c.signaux);
        setSources(c.sources ?? {});
      }
    } catch {}
  }, []);

  async function chercher() {
    setBusy(true);
    setErr("");
    try {
      const r = await chargerSignaux(cps, jours);
      setPublics(r.signaux);
      setSources(r.sources);
      try {
        sessionStorage.setItem(CLE_CACHE, JSON.stringify(r));
      } catch {}
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const faits = suivi?.faits ?? {};
  const etatDe = (s: Signal) => faits[s.id] ?? faits[`adr:${cleAdresse(s.adresse)}`];
  const tous = useMemo(
    () =>
      horsPortefeuille([...signauxFichier(biens, estimations), ...publics], biens)
        .filter((s) => faits[`adr:${cleAdresse(s.adresse)}`]?.action !== "refus")
        .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date)),
    [biens, estimations, publics, faits],
  );
  const aTraiter = tous.filter((s) => !etatDe(s));
  const traites = tous.filter((s) => etatDe(s) && etatDe(s)!.action !== "ignore");
  const liste = filtre === "faits" ? traites : filtre === "tous" ? aTraiter : aTraiter.filter((s) => s.source === filtre);

  if (!pret) return <div className="skeleton h-64 !rounded-2xl" />;

  return (
    <div className="space-y-4">
      <PageHeader title="Radar vendeurs" subtitle="Les adresses où une vente se prépare peut-être, d'après les données publiques et ton fichier." />

      <div className="card card-pad space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-muted mr-1">Secteurs</span>
          {cps.map((cp) => (
            <button key={cp} className="chip" onClick={() => void enregistrerRadar({ codesPostaux: cps.filter((x) => x !== cp) })} aria-label={`Retirer ${cp}`}>
              {cp} <X size={12} />
            </button>
          ))}
          <form
            className="inline-flex"
            onSubmit={(e) => {
              e.preventDefault();
              const cp = cpTexte.replace(/\D/g, "");
              if (cp.length === 5 && !cps.includes(cp)) void enregistrerRadar({ codesPostaux: [...cps, cp] });
              setCpTexte("");
            }}
          >
            <input className="input !h-8 !w-28 text-xs" inputMode="numeric" placeholder="+ code postal" value={cpTexte} onChange={(e) => setCpTexte(e.target.value)} />
          </form>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input !h-10 !w-auto text-sm" value={jours} onChange={(e) => setJours(Number(e.target.value))}>
            <option value={30}>30 derniers jours</option>
            <option value={60}>60 derniers jours</option>
            <option value={120}>4 derniers mois</option>
            <option value={365}>12 derniers mois</option>
          </select>
          <button className="btn-primary !h-10" onClick={chercher} disabled={busy}>
            {busy ? <Spinner /> : <RefreshCw size={15} />} {publics.length ? "Actualiser" : "Lancer le radar"}
          </button>
        </div>
        {Object.keys(sources).length > 0 && (
          <p className="text-xs text-muted">
            {Object.entries(sources)
              .map(([k, v]) => `${{ dpe: "DPE", audit: "Audits", bodacc: "BODACC" }[k] ?? k} : ${typeof v === "number" && k === "dpe" && v > 600 ? `${v} (600 plus parlants gardés)` : v}`)
              .join(" · ")}
          </p>
        )}
        {err && <p className="text-sm text-danger">{err}</p>}
      </div>

      <Tabs<Filtre>
        value={filtre}
        onChange={setFiltre}
        items={[
          { value: "tous", label: "À traiter", count: aTraiter.length },
          ...(["audit", "dpe", "bodacc", "fichier"] as Source[]).filter((s) => aTraiter.some((x) => x.source === s)).map((s) => ({ value: s as Filtre, label: SOURCE[s].label, count: aTraiter.filter((x) => x.source === s).length })),
          { value: "faits", label: "Déjà traités", count: traites.length },
        ]}
      />

      {liste.length ? (
        <ul className="space-y-2.5">
          {liste.slice(0, vus).map((s) => (
            <Carte key={s.id} s={s} etat={etatDe(s)} />
          ))}
          {liste.length > vus && (
            <li>
              <button className="btn-secondary w-full" onClick={() => setVus(vus + 150)}>
                Voir {Math.min(150, liste.length - vus)} de plus ({liste.length - vus} restants)
              </button>
            </li>
          )}
        </ul>
      ) : (
        <Empty icon={<IconeRadar size={22} />} title={publics.length ? "Rien à traiter ici" : "Lance le radar"} text="Le radar cherche les DPE récents, les audits énergétiques et les sociétés immobilières en liquidation sur tes secteurs, et reprend les estimations restées sans mandat." />
      )}

      <div className="flex items-start gap-2 rounded-2xl border border-line p-3 text-xs text-muted">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ok" />
        <p>
          Données publiques sur les logements, aucune donnée nominative de particulier. Prospection par courrier « Au propriétaire » ou par boîtage, avec la mention d&apos;opposition imprimée sur le courrier. Pas d&apos;appel sans accord préalable du propriétaire (loi du 11/08/2026). « Ne plus contacter » retire l&apos;adresse pour de bon.
        </p>
      </div>
    </div>
  );
}

function Carte({ s, etat }: { s: Signal; etat?: { action: Action; date: string } }) {
  const src = SOURCE[s.source];
  const cleAdr = `adr:${cleAdresse(s.adresse)}`;
  const params = new URLSearchParams({ adresse: s.adresse, source: s.source, ...(s.ville ? { ville: s.ville } : {}), ...(s.type ? { type: s.type } : {}) });
  return (
    <li className="card card-pad space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge tone={src.tone}>{src.label}</Badge>
        {s.classe && /^[A-G]$/.test(s.classe) && <Badge tone={s.classe >= "F" ? "danger" : "neutral"}>Classe {s.classe}</Badge>}
        <span className="text-xs text-muted">{dateCourte(s.date)}</span>
        {etat && <Badge tone="ok">{ACTION[etat.action]} · {dateCourte(etat.date)}</Badge>}
      </div>
      <div>
        <div className="text-sm font-semibold">{s.titre}</div>
        <div className="text-sm">{s.adresse}{s.ville && !s.adresse.toLowerCase().includes(s.ville.toLowerCase()) ? `, ${s.ville}` : ""}</div>
        {s.detail && <p className="mt-0.5 text-xs text-muted">{s.detail}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {s.source !== "bodacc" && (
          <Link className="btn-primary btn-sm !h-9" href={`/imprimer/courrier?${params}`}>
            <FileText size={14} /> Courrier
          </Link>
        )}
        {s.source !== "bodacc" && (
          <a className="btn-secondary btn-sm !h-9" href={mapsHref(s.adresse)} target="_blank" rel="noreferrer">
            <MapPin size={14} /> Y aller
          </a>
        )}
        {s.lien && (
          <a className="btn-secondary btn-sm !h-9" href={s.lien} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Annonce BODACC
          </a>
        )}
        {s.page && (
          <Link className="btn-secondary btn-sm !h-9" href={s.page}>
            <ExternalLink size={14} /> Fiche
          </Link>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 border-t border-line pt-2">
        {(["courrier", "boitage", "contact"] as Action[]).map((a) => (
          <button key={a} className={cx("chip", etat?.action === a && "!bg-ok/10 !text-ok")} onClick={() => void noterAction(s.id, etat?.action === a ? null : a)}>
            {ACTION[a]}
          </button>
        ))}
        <button className="chip" onClick={() => void noterAction(s.id, "ignore")}>Écarter</button>
        <button className="chip text-danger" onClick={() => void noterAction(cleAdr, "refus")}>Ne plus contacter</button>
      </div>
    </li>
  );
}
