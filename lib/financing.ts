/* ============================================================
   PROJECTION FINANCIÈRE (rendez-vous acquéreur)
   Crédit (mensualité, coût, TAEG, usure), endettement HCSF,
   reste à vivre, rentabilité locative, TRI sur 10 ans et
   verdict « bon coup ». Calculs indicatifs, hors fiscalité
   (voir le module fiscalité).
   ============================================================ */

export type Duration = 15 | 20 | 25;
export const DURATIONS: Duration[] = [15, 20, 25];

export interface Rates {
    /** Mois de référence des données BCE (AAAA-MM) */
    period: string;
    /** Taux nominal moyen des nouveaux crédits habitat à taux fixe > 10 ans (France) */
    nominal: number;
    /** TAEG moyen des nouveaux crédits habitat (France) */
    aprc: number;
    /** Grille indicative par durée */
    grid: Record<Duration, number>;
    /** Taux d'usure retenu et s'il est estimé (TAEG moyen + 1/3) */
    usury: number;
    usuryEstimated: boolean;
    live: boolean;
}

/** Écart usuel entre durées autour du taux moyen (majoritairement 20-25 ans) */
export const DURATION_SPREAD: Record<Duration, number> = { 15: -0.2, 20: -0.05, 25: 0.1 };

export const buildGrid = (nominal: number): Record<Duration, number> => ({
    15: +(nominal + DURATION_SPREAD[15]).toFixed(2),
    20: +(nominal + DURATION_SPREAD[20]).toFixed(2),
    25: +(nominal + DURATION_SPREAD[25]).toFixed(2),
});

/** Valeurs de secours : BCE, France, juillet 2026 */
export const FALLBACK_RATES: Rates = {
    period: "2026-07",
    nominal: 3.19,
    aprc: 3.8,
    grid: buildGrid(3.19),
    usury: +(3.8 * 4 / 3).toFixed(2),
    usuryEstimated: true,
    live: false,
};

export type Project = "rp" | "locatif";

export interface FinancingInputs {
    project: Project;
    price: number;
    works: number;
    newBuild: boolean;
    downPayment: number;
    years: Duration;
    /** Taux nominal saisi (sinon grille) */
    rate?: number;
    /** Assurance emprunteur, % du capital initial par an */
    insuranceRate: number;
    /** Revenus nets mensuels du foyer */
    income: number;
    /** Mensualités de crédits en cours */
    otherLoans: number;
    /** Locatif : loyer mensuel hors charges */
    rent: number;
    /** Charges non récupérables / mois */
    charges: number;
    /** Taxe foncière / an */
    propertyTax: number;
    /** Revalorisation annuelle du bien, % */
    appreciation: number;
}

export const DEFAULT_INPUTS: Omit<FinancingInputs, "price"> = {
    project: "rp",
    works: 0,
    newBuild: false,
    downPayment: 0,
    years: 20,
    insuranceRate: 0.25,
    income: 0,
    otherLoans: 0,
    rent: 0,
    charges: 0,
    propertyTax: 0,
    appreciation: 1.5,
};

/** Frais d'acquisition (« frais de notaire ») : ~8 % dans l'ancien (DMTO relevés en 2025), ~2,5 % dans le neuf */
export const notaryFees = (price: number, newBuild: boolean) => Math.round(price * (newBuild ? 0.025 : 0.08));
/** Garantie (caution type Crédit Logement) + frais de dossier */
export const guaranteeFees = (loan: number) => (loan > 0 ? Math.round(loan * 0.012 + 800) : 0);

export const DEBT_LIMIT = 0.35;
export const VACANCY = 1 / 24;       // ~2 semaines par an
export const PNO = 180;              // assurance propriétaire non occupant / an
export const RESALE_FEES = 0.05;     // frais de revente (agence, diagnostics)
export const RENT_INDEX = 0.015;     // indexation annuelle du loyer

export const monthlyPayment = (principal: number, annualRatePct: number, years: number) => {
    const n = years * 12;
    const r = annualRatePct / 100 / 12;
    if (principal <= 0) return 0;
    if (r === 0) return principal / n;
    return (principal * r) / (1 - Math.pow(1 + r, -n));
};

/** Capital restant dû après m mensualités */
const remaining = (principal: number, annualRatePct: number, years: number, m: number) => {
    const r = annualRatePct / 100 / 12;
    const pmt = monthlyPayment(principal, annualRatePct, years);
    if (r === 0) return Math.max(0, principal - pmt * m);
    return Math.max(0, principal * Math.pow(1 + r, m) - pmt * ((Math.pow(1 + r, m) - 1) / r));
};

/** Taux annuel (en %) qui annule la VAN de flux périodiques, par dichotomie */
function solveRate(flows: number[], periodsPerYear: number): number | null {
    const npv = (rate: number) => flows.reduce((s, f, i) => s + f / Math.pow(1 + rate, i), 0);
    // Borne basse : −5 %/mois (au-delà, les puissances débordent sur 300 échéances)
    let lo = periodsPerYear > 1 ? -0.05 : -0.99, hi = 1;
    let fLo = npv(lo), fHi = npv(hi);
    if (!isFinite(fLo) || !isFinite(fHi) || fLo * fHi > 0) return null;
    for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        const f = npv(mid);
        if (Math.abs(f) < 1e-7) { lo = hi = mid; break; }
        if (f * fLo > 0) { lo = mid; fLo = f; } else { hi = mid; fHi = f; }
    }
    const per = (lo + hi) / 2;
    return (Math.pow(1 + per, periodsPerYear) - 1) * 100;
}

export interface YearPoint { year: number; value: number; debt: number; equity: number }

export interface FinancingResult {
    rate: number;
    notary: number;
    guarantee: number;
    totalProject: number;
    loan: number;
    monthlyPI: number;
    monthlyInsurance: number;
    monthly: number;
    totalInterest: number;
    totalInsurance: number;
    creditCost: number;
    taeg: number | null;
    usuryOk: boolean;
    /** Taux d'endettement (HCSF : 70 % des loyers ajoutés aux revenus) */
    debtRatio: number | null;
    residual: number | null;
    /** Emprunt maximal à 35 % d'endettement sur la durée choisie */
    maxLoan: number | null;
    grossYield: number | null;
    netYield: number | null;
    cashflow: number | null;
    irr10: number | null;
    projection: YearPoint[];
    equity10: number;
}

export function computeFinancing(i: FinancingInputs, rates: Rates): FinancingResult {
    const rate = i.rate && i.rate > 0 ? i.rate : rates.grid[i.years];
    const notary = notaryFees(i.price, i.newBuild);
    const base = i.price + notary + i.works;
    const loanBeforeFees = Math.max(0, base - i.downPayment);
    const guarantee = guaranteeFees(loanBeforeFees);
    const loan = loanBeforeFees > 0 ? loanBeforeFees + guarantee : 0;
    const totalProject = base + guarantee;
    const n = i.years * 12;
    const monthlyPI = monthlyPayment(loan, rate, i.years);
    const monthlyInsurance = (loan * i.insuranceRate) / 100 / 12;
    const monthly = monthlyPI + monthlyInsurance;
    const totalInterest = monthlyPI * n - loan;
    const totalInsurance = monthlyInsurance * n;
    const creditCost = totalInterest + totalInsurance + guarantee;

    // TAEG : le client reçoit le capital net des frais, rembourse mensualités + assurance
    const taeg = loan > 0 ? solveRate([-(loan - guarantee), ...Array(n).fill(monthly)], 12) : null;
    const usuryOk = taeg === null || taeg <= rates.usury;

    const rentForDebt = i.project === "locatif" ? i.rent * 0.7 : 0;
    const revenue = i.income + rentForDebt;
    const debtRatio = revenue > 0 ? (monthly + i.otherLoans) / revenue : null;
    const residual = i.income > 0 ? i.income + (i.project === "locatif" ? i.rent : 0) - monthly - i.otherLoans : null;
    const maxMonthly = revenue > 0 ? revenue * DEBT_LIMIT - i.otherLoans : 0;
    const perEuro = monthlyPayment(1, rate, i.years) + i.insuranceRate / 100 / 12;
    const maxLoan = revenue > 0 ? Math.max(0, Math.round(maxMonthly / perEuro / 1000) * 1000) : null;

    // Rentabilité locative (avant impôt)
    const isRental = i.project === "locatif" && i.rent > 0;
    const yearlyRent = i.rent * 12 * (1 - VACANCY);
    const yearlyCosts = i.charges * 12 + i.propertyTax + PNO;
    const grossYield = isRental && i.price ? (i.rent * 12) / i.price : null;
    const netYield = isRental && base ? (yearlyRent - yearlyCosts) / base : null;
    const cashflow = isRental ? (yearlyRent - yearlyCosts) / 12 - monthly : null;

    // Projection 10 ans : valeur, dette, patrimoine net ; TRI sur l'apport
    const projection: YearPoint[] = [];
    const flows: number[] = [-i.downPayment];
    for (let y = 0; y <= 10; y++) {
        const value = i.price * Math.pow(1 + i.appreciation / 100, y);
        const debt = y * 12 >= n ? 0 : remaining(loan, rate, i.years, y * 12);
        projection.push({ year: y, value: Math.round(value), debt: Math.round(debt), equity: Math.round(value - debt) });
        if (y === 0) continue;
        const rentY = isRental ? yearlyRent * Math.pow(1 + RENT_INDEX, y - 1) : 0;
        const costsY = isRental ? yearlyCosts * Math.pow(1 + RENT_INDEX, y - 1) : 0;
        const paid = y * 12 <= n ? monthly * 12 : 0;
        let flow = isRental ? rentY - costsY - paid : 0;
        if (y === 10) flow += value * (1 - RESALE_FEES) - debt;
        flows.push(flow);
    }
    // Sans apport, le TRI n'a pas de sens (rendement infini sur 0 €)
    const irr10 = isRental && i.downPayment >= 1000 ? solveRate(flows, 1) : null;

    return {
        rate, notary, guarantee, totalProject, loan,
        monthlyPI, monthlyInsurance, monthly,
        totalInterest, totalInsurance, creditCost,
        taeg, usuryOk, debtRatio, residual, maxLoan,
        grossYield, netYield, cashflow,
        irr10: irr10 !== null && isFinite(irr10) && Math.abs(irr10) < 200 ? irr10 : null,
        projection,
        equity10: projection[10]?.equity ?? 0,
    };
}

export type VerdictLevel = "top" | "good" | "negotiate" | "avoid";
export interface Verdict { score: number; level: VerdictLevel; label: string; pros: string[]; cons: string[] }

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d).replace(".", ",")} %`;
const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

/** Verdict « bon coup ou non » : prix vs valeur, solvabilité, rentabilité */
export function verdict(i: FinancingInputs, r: FinancingResult, ctx: { estimatedValue?: number; dpe?: string; afterTax?: { cashflow: number; regime: string } | null }): Verdict {
    const pros: string[] = [], cons: string[] = [];
    let score = 0, max = 0;

    // Pondération : en locatif, la rentabilité pèse le plus
    const rental = i.project === "locatif";
    const W = rental ? { price: 25, debt: 15 } : { price: 30, debt: 25 };
    if (ctx.estimatedValue && i.price) {
        max += W.price;
        const gap = (i.price - ctx.estimatedValue) / ctx.estimatedValue;
        if (gap <= -0.03) { score += W.price; pros.push(`Prix ${pct(-gap, 0)} sous notre estimation`); }
        else if (gap <= 0.02) { score += W.price * 0.75; pros.push("Prix aligné sur le marché"); }
        else if (gap <= 0.05) { score += W.price * 0.4; cons.push(`Prix ${pct(gap, 0)} au-dessus de notre estimation`); }
        else cons.push(`Prix ${pct(gap, 0)} au-dessus de notre estimation : négociation nécessaire`);
    }

    if (r.debtRatio !== null) {
        max += W.debt;
        if (r.debtRatio <= 0.3) { score += W.debt; pros.push(`Endettement confortable (${pct(r.debtRatio)})`); }
        else if (r.debtRatio <= DEBT_LIMIT) { score += W.debt * 0.7; pros.push(`Endettement dans la norme (${pct(r.debtRatio)})`); }
        else cons.push(`Endettement de ${pct(r.debtRatio)} : au-delà des 35 % acceptés par les banques`);
    }
    if (!r.usuryOk) cons.push("TAEG au-dessus du taux d'usure estimé : augmenter l'apport ou la durée");

    if (rental && r.netYield !== null && r.cashflow !== null) {
        max += 35;
        if (r.netYield >= 0.05) { score += 20; pros.push(`Rendement net de ${pct(r.netYield)}`); }
        else if (r.netYield >= 0.04) { score += 14; pros.push(`Rendement net correct (${pct(r.netYield)})`); }
        else if (r.netYield >= 0.03) { score += 6; cons.push(`Rendement net modeste (${pct(r.netYield)})`); }
        else cons.push(`Rendement net faible (${pct(r.netYield)})`);
        // Cash-flow jugé après impôt (meilleur régime fiscal) quand il est connu : c'est ce que le client paie vraiment
        const cf = ctx.afterTax ? ctx.afterTax.cashflow : r.cashflow;
        const tag = ctx.afterTax ? ` après impôt (${ctx.afterTax.regime})` : "";
        if (cf >= 0) { score += 15; pros.push(`Autofinancé : +${eur(cf)} / mois${tag}`); }
        else if (cf >= -150) { score += 9; cons.push(`Effort d'épargne limité : ${eur(-cf)} / mois${tag}`); }
        else if (cf >= -350) { score += 4; cons.push(`Effort d'épargne de ${eur(-cf)} / mois${tag}`); }
        else cons.push(`Effort d'épargne élevé : ${eur(-cf)} / mois${tag}`);
        if (r.irr10 !== null) {
            max += 15;
            if (r.irr10 >= 8) { score += 15; pros.push(`TRI sur 10 ans de ${r.irr10.toFixed(1).replace(".", ",")} %`); }
            else if (r.irr10 >= 5) { score += 9; pros.push(`TRI sur 10 ans de ${r.irr10.toFixed(1).replace(".", ",")} %`); }
            else cons.push(`TRI sur 10 ans limité (${r.irr10.toFixed(1).replace(".", ",")} %)`);
        }
        const dpe = (ctx.dpe || "").toUpperCase();
        if (dpe === "G" || dpe === "F") { score -= 12; cons.push(`DPE ${dpe} : location ${dpe === "G" ? "interdite depuis 2025" : "interdite dès 2028"} sans travaux`); }
    } else if (!rental) {
        max += 20;
        if (r.residual !== null) {
            if (r.residual >= 1500) { score += 12; pros.push(`Reste à vivre de ${eur(r.residual)} / mois`); }
            else if (r.residual >= 900) { score += 6; }
            else cons.push(`Reste à vivre serré (${eur(r.residual)} / mois)`);
        }
        if (r.equity10 > i.downPayment) { score += 8; pros.push(`Patrimoine net estimé à ${eur(r.equity10)} dans 10 ans`); }
    }

    const s = max ? Math.max(0, Math.min(100, Math.round((score / max) * 100))) : 0;
    const level: VerdictLevel = s >= 75 ? "top" : s >= 55 ? "good" : s >= 35 ? "negotiate" : "avoid";
    const label = { top: "Bon coup", good: "Bonne opération", negotiate: "À négocier", avoid: "Déconseillé en l'état" }[level];
    return { score: s, level, label, pros, cons };
}
