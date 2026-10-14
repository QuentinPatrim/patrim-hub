/* ============================================================
   ESTIMATION EXPRESS (rendez-vous, terrain)
   Base : prix médian au m² des ventes DVF autour de l'adresse
   (bien de même type, surface ± 25 %), ajusté selon quelques
   critères simples et lisibles. Chaque ajustement est affiché :
   l'agent explique le prix au client et l'affine au bureau.
   ============================================================ */

export type Condition = "a_renover" | "a_rafraichir" | "bon" | "refait" | "neuf";

export const CONDITIONS: { id: Condition; label: string; adj: number }[] = [
    { id: "a_renover", label: "À rénover", adj: -0.12 },
    { id: "a_rafraichir", label: "À rafraîchir", adj: -0.05 },
    { id: "bon", label: "Bon état", adj: 0 },
    { id: "refait", label: "Refait à neuf", adj: 0.05 },
    { id: "neuf", label: "Récent / neuf", adj: 0.08 },
];

export interface ExpressInput {
    propertyType: "Appartement" | "Maison";
    surface: number;
    rooms: number;
    floor?: number | null;          // appartements : 0 = RDC
    hasElevator?: boolean;
    condition: Condition;
    outdoor: boolean;               // balcon, terrasse, jardin
    parking: boolean;
    dpe?: string;                   // A…G
}

export interface MarketBase {
    medianSqm: number;
    p25: number;
    p75: number;
    count: number;
}

export interface Adjustment { label: string; pct: number }

export interface ExpressResult {
    baseSqm: number;
    adjustments: Adjustment[];
    totalPct: number;
    sqm: number;
    central: number;
    low: number;
    high: number;
    /** Écart entre les ventes (p25-p75) : plus il est large, plus la fourchette l'est */
    confidence: "élevée" | "moyenne" | "faible";
}

const round = (n: number, step = 1000) => Math.round(n / step) * step;

export function expressEstimate(input: ExpressInput, market: MarketBase): ExpressResult {
    const adjustments: Adjustment[] = [];
    const cond = CONDITIONS.find(c => c.id === input.condition);
    if (cond && cond.adj) adjustments.push({ label: cond.label, pct: cond.adj });

    if (input.propertyType === "Appartement" && input.floor !== null && input.floor !== undefined) {
        if (input.floor === 0) adjustments.push({ label: "Rez-de-chaussée", pct: -0.05 });
        else if (input.floor >= 3 && !input.hasElevator) adjustments.push({ label: `${input.floor}e étage sans ascenseur`, pct: -0.06 });
        else if (input.floor >= 3 && input.hasElevator) adjustments.push({ label: `${input.floor}e étage avec ascenseur`, pct: 0.03 });
    }
    if (input.outdoor) adjustments.push({ label: input.propertyType === "Maison" ? "Jardin / extérieur" : "Balcon ou terrasse", pct: 0.04 });
    if (input.parking) adjustments.push({ label: "Stationnement", pct: 0.03 });
    const dpe = (input.dpe || "").toUpperCase();
    if (dpe === "F" || dpe === "G") adjustments.push({ label: `DPE ${dpe} (passoire)`, pct: -0.08 });
    else if (dpe === "E") adjustments.push({ label: "DPE E", pct: -0.03 });
    else if (dpe === "A" || dpe === "B") adjustments.push({ label: `DPE ${dpe}`, pct: 0.03 });

    const totalPct = adjustments.reduce((s, a) => s + a.pct, 0);
    const sqm = market.medianSqm * (1 + totalPct);
    const central = round(sqm * input.surface);
    // Fourchette : ± 4 à 8 % selon la dispersion des ventes
    const spread = market.medianSqm ? (market.p75 - market.p25) / market.medianSqm : 0.3;
    const half = spread < 0.2 ? 0.04 : spread < 0.35 ? 0.06 : 0.08;
    const confidence = market.count >= 15 && spread < 0.25 ? "élevée" : market.count >= 6 && spread < 0.4 ? "moyenne" : "faible";
    return {
        baseSqm: market.medianSqm,
        adjustments,
        totalPct,
        sqm: Math.round(sqm),
        central,
        low: round(central * (1 - half)),
        high: round(central * (1 + half)),
        confidence,
    };
}

export const fmtEur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
export const fmtPct = (p: number) => `${p > 0 ? "+" : ""}${Math.round(p * 100)} %`;
