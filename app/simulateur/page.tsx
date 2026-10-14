"use client";

import { Check, Copy, Home, KeyRound, Mail, Share2, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge, Card, Field, cx } from "@/components/ui";
import { Choix, Interrupteur, Nombre } from "@/components/estimations/controls";
import { DEBT_LIMIT, DEFAULT_INPUTS, DURATIONS, FALLBACK_RATES, computeFinancing, notaryFees, verdict, type Duration, type FinancingInputs } from "@/lib/financing";
import { eur } from "@/lib/format";

/* ============================================================
   Simulateur de financement acquéreur : mensualité, frais de
   notaire, capacité d'emprunt (35 %), rentabilité locative.
   ============================================================ */

const STORE_KEY = "patrim-hub:simulateur";
const pc = (v: number | null | undefined, d = 1) => (v == null || !isFinite(v) ? "—" : `${(v * 100).toFixed(d).replace(".", ",")} %`);
const taux = (v: number) => `${v.toFixed(2).replace(".", ",")} %`;

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton h-64" />}>
      <Simulateur />
    </Suspense>
  );
}

function Simulateur() {
  const params = useSearchParams();
  const [i, setI] = useState<FinancingInputs>({ ...DEFAULT_INPUTS, price: 250000 });
  const [tauxPerso, setTauxPerso] = useState<number | undefined>();
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    let base: Partial<FinancingInputs> = {};
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) base = JSON.parse(raw);
    } catch {}
    const prix = Number(params.get("prix"));
    setI((x) => ({ ...x, ...base, ...(prix > 0 ? { price: prix } : {}) }));
    if (base.rate) setTauxPerso(base.rate);
  }, [params]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...i, rate: tauxPerso }));
    } catch {}
  }, [i, tauxPerso]);

  const set = (p: Partial<FinancingInputs>) => setI((x) => ({ ...x, ...p }));
  const inputs = { ...i, rate: tauxPerso };
  const r = useMemo(() => computeFinancing(inputs, FALLBACK_RATES), [i, tauxPerso]); // eslint-disable-line react-hooks/exhaustive-deps
  const v = useMemo(() => verdict(inputs, r, {}), [i, r]); // eslint-disable-line react-hooks/exhaustive-deps
  const locatif = i.project === "locatif";

  // Budget d'achat maximal (frais compris) à partir de la capacité d'emprunt
  const budgetMax = useMemo(() => {
    if (r.maxLoan == null) return null;
    const avantFrais = Math.max(0, (r.maxLoan - 800) / 1.012);
    const prix = (avantFrais + i.downPayment - i.works) / (1 + (i.newBuild ? 0.025 : 0.08));
    return Math.max(0, Math.floor(prix / 1000) * 1000);
  }, [r.maxLoan, i.downPayment, i.works, i.newBuild]);

  const endettementTone = r.debtRatio == null ? "neutral" : r.debtRatio <= 0.3 ? "ok" : r.debtRatio <= DEBT_LIMIT ? "warn" : "danger";

  const texte = useMemo(() => {
    const l: (string | null)[] = [
      "Simulation de financement – PATRIM",
      "",
      `Prix du bien : ${eur(i.price)}`,
      i.works ? `Travaux : ${eur(i.works)}` : null,
      `Frais de notaire estimés (${i.newBuild ? "neuf" : "ancien"}) : ${eur(r.notary)}`,
      `Garantie et frais de dossier : ${eur(r.guarantee)}`,
      `Apport personnel : ${eur(i.downPayment)}`,
      `Montant emprunté : ${eur(r.loan)} sur ${i.years} ans à ${taux(r.rate)}`,
      `Mensualité : ${eur(r.monthly)} par mois (dont assurance ${eur(r.monthlyInsurance)})`,
      `Coût total du crédit : ${eur(r.creditCost)}`,
      r.debtRatio != null ? `Taux d'endettement : ${pc(r.debtRatio)} (limite bancaire 35 %)` : null,
      r.maxLoan != null ? `Capacité d'emprunt à 35 % : ${eur(r.maxLoan)}${budgetMax ? `, soit un budget d'achat d'environ ${eur(budgetMax)} frais compris` : ""}` : null,
      locatif && r.grossYield != null ? `Loyer : ${eur(i.rent)} par mois · rendement brut ${pc(r.grossYield)} · rendement net ${pc(r.netYield)}` : null,
      locatif && r.cashflow != null ? `Effort mensuel estimé (avant impôt) : ${r.cashflow >= 0 ? "+" : "−"}${eur(Math.abs(r.cashflow))}` : null,
      "",
      "Simulation indicative, hors fiscalité, à confirmer par votre banque ou votre courtier.",
      "Quentin Delsol · PATRIM · 06 52 45 96 54",
    ];
    return l.filter((x) => x !== null).join("\n");
  }, [i, r, budgetMax, locatif]);

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      setTimeout(() => setCopie(false), 1800);
    } catch {}
  };
  const partager = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Simulation de financement", text: texte });
      } catch {}
    } else void copier();
  };

  return (
    <div>
      <div className="mb-5 sm:mb-7 animate-fade-up">
        <Link href="/estimations" className="text-xs text-muted hover:text-fg">
          ← Estimations
        </Link>
        <h1 className="h-title mt-1">Simulateur de financement</h1>
        <p className="mt-1 text-sm text-muted">Mensualité, frais, capacité d&apos;emprunt et rentabilité, en direct avec l&apos;acquéreur.</p>
      </div>

      {/* Résumé collant sur téléphone */}
      <div className="lg:hidden sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 sm:-mx-6 mb-4 border-b border-line bg-bg/90 px-4 sm:px-6 py-2.5 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted">Mensualité</div>
            <div className="font-serif text-xl font-semibold tabular-nums leading-tight">{eur(r.monthly)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted">{locatif && r.cashflow != null ? "Effort mensuel" : "Endettement"}</div>
            <div className="text-sm font-semibold tabular-nums">
              {locatif && r.cashflow != null ? `${r.cashflow >= 0 ? "+" : "−"}${eur(Math.abs(r.cashflow))}` : pc(r.debtRatio)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_400px] lg:items-start">
        {/* ------- Saisie ------- */}
        <div className="space-y-4">
          <Card title="Le projet">
            <div className="space-y-4">
              <Choix
                size="lg"
                value={i.project}
                onChange={(p) => p && set({ project: p })}
                options={[
                  { value: "rp", label: <><Home size={16} /> Résidence principale</> },
                  { value: "locatif", label: <><KeyRound size={16} /> Investissement locatif</> },
                ]}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Prix du bien">
                  <Nombre value={i.price} onChange={(n) => set({ price: n ?? 0 })} unit="€" />
                </Field>
                <Field label="Travaux">
                  <Nombre value={i.works || undefined} onChange={(n) => set({ works: n ?? 0 })} unit="€" placeholder="0" />
                </Field>
              </div>
              <Interrupteur checked={i.newBuild} onChange={(b) => set({ newBuild: b })} label="Logement neuf" hint={`Frais de notaire ≈ ${i.newBuild ? "2,5" : "8"} % : ${eur(notaryFees(i.price, i.newBuild))}`} />
            </div>
          </Card>

          <Card title="Le crédit">
            <div className="space-y-4">
              <Field label="Apport personnel">
                <Nombre value={i.downPayment || undefined} onChange={(n) => set({ downPayment: n ?? 0 })} unit="€" placeholder="0" />
              </Field>
              <div>
                <span className="label">Durée</span>
                <Choix value={i.years} onChange={(d) => d && set({ years: d as Duration })} options={DURATIONS.map((d) => ({ value: d, label: `${d} ans`, hint: taux(FALLBACK_RATES.grid[d]) }))} className="[&>button]:flex-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Taux du crédit" hint={tauxPerso ? "Taux saisi" : `Moyenne du marché (${FALLBACK_RATES.period.split("-").reverse().join("/")})`}>
                  <Nombre value={tauxPerso} onChange={setTauxPerso} unit="%" decimal placeholder={String(FALLBACK_RATES.grid[i.years]).replace(".", ",")} />
                </Field>
                <Field label="Assurance emprunteur" hint="% du capital par an">
                  <Nombre value={i.insuranceRate} onChange={(n) => set({ insuranceRate: n ?? 0 })} unit="%" decimal />
                </Field>
              </div>
            </div>
          </Card>

          <Card title="Les revenus du foyer">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Revenus nets / mois">
                <Nombre value={i.income || undefined} onChange={(n) => set({ income: n ?? 0 })} unit="€" placeholder="4 500" />
              </Field>
              <Field label="Crédits en cours / mois">
                <Nombre value={i.otherLoans || undefined} onChange={(n) => set({ otherLoans: n ?? 0 })} unit="€" placeholder="0" />
              </Field>
            </div>
          </Card>

          {locatif && (
            <Card title="La location" className="animate-fade-up">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Loyer hors charges / mois">
                  <Nombre value={i.rent || undefined} onChange={(n) => set({ rent: n ?? 0 })} unit="€" placeholder="850" />
                </Field>
                <Field label="Charges non récupérables / mois">
                  <Nombre value={i.charges || undefined} onChange={(n) => set({ charges: n ?? 0 })} unit="€" placeholder="40" />
                </Field>
                <Field label="Taxe foncière / an">
                  <Nombre value={i.propertyTax || undefined} onChange={(n) => set({ propertyTax: n ?? 0 })} unit="€" placeholder="900" />
                </Field>
                <Field label="Revalorisation / an">
                  <Nombre value={i.appreciation} onChange={(n) => set({ appreciation: n ?? 0 })} unit="%" decimal />
                </Field>
              </div>
            </Card>
          )}
        </div>

        {/* ------- Résultats ------- */}
        <div className="space-y-4 lg:sticky lg:top-6">
          <section className="card overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-brand via-brand to-coral" />
            <div className="card-pad">
              <div className="text-xs text-muted">Mensualité assurance comprise</div>
              <div className="font-serif text-[38px] font-semibold leading-tight tracking-tight tabular-nums">{eur(r.monthly)}</div>
              <div className="text-xs text-muted">
                {eur(r.monthlyPI)} de crédit + {eur(r.monthlyInsurance)} d&apos;assurance · {i.years} ans à {taux(r.rate)}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-sm">
                <Ligne k="Frais de notaire" v={eur(r.notary)} />
                <Ligne k="Garantie et dossier" v={eur(r.guarantee)} />
                <Ligne k="Montant emprunté" v={eur(r.loan)} />
                <Ligne k="Coût total du projet" v={eur(r.totalProject)} />
                <Ligne k="Coût du crédit" v={eur(r.creditCost)} hint="intérêts, assurance, garantie" />
                <Ligne
                  k="TAEG estimé"
                  v={
                    <span className="inline-flex items-center gap-1.5">
                      {r.taeg != null ? taux(r.taeg) : "—"}
                      {!r.usuryOk && <Badge tone="danger">Usure</Badge>}
                    </span>
                  }
                />
              </dl>
            </div>
          </section>

          <Card title="Capacité d'emprunt">
            {i.income > 0 ? (
              <div className="space-y-4">
                <div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span>Taux d&apos;endettement</span>
                    <span className={cx("font-semibold tabular-nums", endettementTone === "ok" ? "text-ok" : endettementTone === "warn" ? "text-warn" : "text-danger")}>{pc(r.debtRatio)}</span>
                  </div>
                  <div className="relative mt-2 h-2.5 rounded-full bg-surface-2">
                    <div
                      className={cx("absolute inset-y-0 left-0 rounded-full transition-all", endettementTone === "ok" ? "bg-ok" : endettementTone === "warn" ? "bg-warn" : "bg-danger")}
                      style={{ width: `${Math.min(100, ((r.debtRatio ?? 0) / 0.5) * 100)}%` }}
                    />
                    <div className="absolute -top-1 bottom-[-4px] w-0.5 bg-fg/60" style={{ left: `${(DEBT_LIMIT / 0.5) * 100}%` }} />
                  </div>
                  <div className="mt-1.5 text-[10px] text-muted">Le trait marque la limite bancaire de 35 %.</div>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <Ligne k="Emprunt maximal" v={eur(r.maxLoan)} hint={`à 35 % sur ${i.years} ans`} />
                  <Ligne k="Budget d'achat" v={budgetMax != null ? eur(budgetMax) : "—"} hint="frais de notaire compris" />
                  <Ligne k="Reste à vivre" v={r.residual != null ? `${eur(r.residual)} / mois` : "—"} />
                </dl>
              </div>
            ) : (
              <p className="text-sm text-muted">Renseignez les revenus du foyer pour calculer l&apos;endettement et le budget maximal.</p>
            )}
          </Card>

          {locatif && (
            <Card title="Rentabilité locative" className="animate-fade-up">
              {i.rent > 0 ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <Ligne k="Rendement brut" v={pc(r.grossYield)} />
                  <Ligne k="Rendement net" v={pc(r.netYield)} hint="avant impôt, vacance incluse" />
                  <Ligne
                    k="Effort mensuel"
                    v={r.cashflow != null ? <span className={r.cashflow >= 0 ? "text-ok" : "text-warn"}>{`${r.cashflow >= 0 ? "+" : "−"}${eur(Math.abs(r.cashflow))}`}</span> : "—"}
                    hint="loyer − charges − crédit"
                  />
                  <Ligne k="TRI sur 10 ans" v={r.irr10 != null ? `${r.irr10.toFixed(1).replace(".", ",")} %` : "—"} hint={i.downPayment < 1000 ? "nécessite un apport" : "revente incluse"} />
                  <Ligne k="Patrimoine net à 10 ans" v={eur(r.equity10)} />
                </dl>
              ) : (
                <p className="text-sm text-muted">Indiquez le loyer prévu pour calculer la rentabilité.</p>
              )}
            </Card>
          )}

          {(v.pros.length > 0 || v.cons.length > 0) && (
            <Card title="Points clés">
              <ul className="space-y-2 text-sm">
                {v.pros.map((t) => (
                  <li key={t} className="flex gap-2">
                    <TrendingUp size={15} className="mt-0.5 shrink-0 text-ok" />
                    {t}
                  </li>
                ))}
                {v.cons.map((t) => (
                  <li key={t} className="flex gap-2">
                    <Wallet size={15} className="mt-0.5 shrink-0 text-warn" />
                    {t}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="À envoyer à l'acquéreur">
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3 font-sans text-[12px] leading-relaxed text-fg/90">{texte}</pre>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button type="button" onClick={copier} className="btn-secondary">
                {copie ? <Check size={15} className="text-ok" /> : <Copy size={15} />} {copie ? "Copié" : "Copier"}
              </button>
              <button type="button" onClick={partager} className="btn-secondary">
                <Share2 size={15} /> Partager
              </button>
              <a href={`mailto:?subject=${encodeURIComponent("Votre simulation de financement")}&body=${encodeURIComponent(texte)}`} className="btn-secondary">
                <Mail size={15} /> Mail
              </a>
            </div>
            <p className="mt-2 text-[11px] text-muted">Calculs indicatifs, hors fiscalité. Rien n&apos;est envoyé automatiquement.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Ligne({ k, v, hint }: { k: string; v: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted">{k}</dt>
      <dd className="font-semibold tabular-nums">{v}</dd>
      {hint && <div className="text-[10px] text-muted">{hint}</div>}
    </div>
  );
}
