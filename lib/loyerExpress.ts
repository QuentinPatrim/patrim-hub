/* ============================================================
   ESTIMATION LOCATIVE EXPRESS (lib/loyerExpress.ts)
   Base : loyer au m² (quartier Toulouse ou saisie conseiller),
   ajusté selon les mêmes critères simples et lisibles que pour
   la vente. Chaque ajustement est affiché : l'agent explique le
   loyer au propriétaire et l'affine ensuite au bureau.
   ============================================================ */

import { CONDITIONS, type Condition } from "./expressEstimate";

export interface LoyerInput {
    propertyType: "Appartement" | "Maison";
    surface: number;
    rooms: number;
    floor?: number | null;
    hasElevator?: boolean;
    condition: Condition;
    outdoor: boolean;
    parking: boolean;
    dpe?: string;
    meuble: boolean;
}

export interface LoyersMarche {
    loyerM2: number;
    p25: number;
    p75: number;
    count: number;
}

export interface AjustementLoyer { label: string; pct: number }

export interface LoyerResult {
    loyerM2: number;
    ajustements: AjustementLoyer[];
    totalPct: number;
    sqm: number;
    central: number;
    low: number;
    high: number;
    confidence: "élevée" | "moyenne" | "faible";
    /** Plafond indicatif d'encadrement des loyers (logés 40 m² ou moins) */
    plafond?: number;
}

const round = (n: number, step = 10) => Math.round(n / step) * step;

export function calculerLoyer(input: LoyerInput, marche: LoyersMarche): LoyerResult {
    const ajustements: AjustementLoyer[] = [];

    const cond = CONDITIONS.find((c) => c.id === input.condition);
    if (cond && cond.adj) ajustements.push({ label: cond.label, pct: cond.adj });

    if (input.propertyType === "Appartement" && input.floor !== null && input.floor !== undefined) {
        if (input.floor === 0) ajustements.push({ label: "Rez-de-chaussée", pct: -0.05 });
        else if (input.floor >= 3 && !input.hasElevator) ajustements.push({ label: `${input.floor}e étage sans ascenseur`, pct: -0.05 });
        else if (input.floor >= 3 && input.hasElevator) ajustements.push({ label: `${input.floor}e étage avec ascenseur`, pct: 0.02 });
    }

    if (input.outdoor) ajustements.push({ label: input.propertyType === "Maison" ? "Jardin / extérieur" : "Balcon ou terrasse", pct: 0.03 });
    if (input.parking) ajustements.push({ label: "Stationnement", pct: 0.05 });

    const dpe = (input.dpe || "").toUpperCase();
    if (dpe === "F" || dpe === "G") ajustements.push({ label: `DPE ${dpe} (passoire)`, pct: -0.08 });
    else if (dpe === "E") ajustements.push({ label: "DPE E", pct: -0.03 });
    else if (dpe === "A" || dpe === "B") ajustements.push({ label: `DPE ${dpe}`, pct: 0.02 });

    if (input.meuble) ajustements.push({ label: "Location meublée", pct: 0.1 });

    const totalPct = ajustements.reduce((s, a) => s + a.pct, 0);
    const sqm = marche.loyerM2 * (1 + totalPct);
    const central = round(sqm * input.surface);

    // Fourchette plus resserrée que la vente : les loyers varient moins
    const spread = marche.loyerM2 ? (marche.p75 - marche.p25) / marche.loyerM2 : 0.3;
    const half = spread < 0.2 ? 0.04 : spread < 0.35 ? 0.06 : 0.08;
    const confidence =
        marche.count >= 10 && spread < 0.3 ? "élevée" : marche.count >= 3 && spread < 0.45 ? "moyenne" : "faible";

    return {
        loyerM2: marche.loyerM2,
        ajustements,
        totalPct,
        sqm: Math.round(sqm * 10) / 10,
        central,
        low: round(central * (1 - half)),
        high: round(central * (1 + half)),
        confidence,
    };
}

/* ---------- Encadrement des loyers à Toulouse ---------- */

/** Plafond d'encadrement des loyers par m² et par petite surface (décret n° 2025-686 du 24 juin 2025). */
export const MAX_LOYER_PLAFOND: Record<number, { min: number; max: number }> = {
    2025: { min: 13.19, max: 18.85 },
};

/**
 * Plafond indicatif du loyer de base hors charges (encadrement Toulouse).
 * Renvoie undefined si la surface dépasse 40 m² (petits logements
 * hors petites surfaces, décret n° 2025-686 du 24 juin 2025).
 */
export function plafondEncadrement(surface: number, annee = 2025) {
    if (surface <= 0 || surface > 40) return undefined;
    const p = MAX_LOYER_PLAFOND[annee] ?? MAX_LOYER_PLAFOND[2025];
    return Math.round(p.max * surface);
}

/* ---------- Loyers indicatifs par quartier de Toulouse ---------- */

/**
 * Ordres de grandeur de loyer de marché (CC/HF) constatés par l'agence
 * sur ses mises en gestion et ses recherches, pour départager les
 * quartiers et laisser l'agent recentrer à la main.
 */
export const LOYERS_QUARTIER: Record<string, { min: number; max: number }> = {
    "Capitole": { min: 16, max: 23 },
    "Arnaud-Bernard": { min: 14, max: 18 },
    "Saint-Georges": { min: 15, max: 20 },
    "Saint-Étienne": { min: 14, max: 18 },
    "Carmes": { min: 14, max: 19 },
    "Saint-Cyprien": { min: 13, max: 17 },
    "Amidonniers": { min: 14, max: 19 },
    "Compans": { min: 13, max: 17 },
    "Les Chalets": { min: 12, max: 16 },
    "Matabiau": { min: 12, max: 17 },
    "Saint-Aubin-Dupuy": { min: 14, max: 18 },
    "Le Busca": { min: 12, max: 17 },
    "Saint-Michel": { min: 11, max: 15 },
    "Ramier": { min: 11, max: 15 },
    "Fer-à-Cheval": { min: 11, max: 15 },
    "Patte d'Oie": { min: 11, max: 14 },
    "Sept Deniers": { min: 11, max: 15 },
    "Minimes": { min: 11, max: 15 },
    "Bonnefoy": { min: 11, max: 15 },
    "Marengo-Jolimont": { min: 12, max: 16 },
    "Guilhemery": { min: 11, max: 15 },
    "Côte Pavée": { min: 11, max: 15 },
    "Pont-des-Demoiselles": { min: 11, max: 15 },
    "Sauzelong-Rangueil": { min: 11, max: 15 },
    "Saint-Agne": { min: 11, max: 15 },
    "Jules-Julien": { min: 11, max: 15 },
    "Empalot": { min: 10, max: 13 },
    "Croix-de-Pierre": { min: 10, max: 13 },
    "Papus": { min: 10, max: 13 },
    "Faourette": { min: 10, max: 13 },
    "Fontaine-Lestang": { min: 10, max: 14 },
    "Bagatelle": { min: 10, max: 13 },
    "Arènes": { min: 11, max: 15 },
    "La Cépière": { min: 10, max: 14 },
    "Casselardit": { min: 10, max: 14 },
    "Ginestous": { min: 10, max: 13 },
    "Barrière-de-Paris": { min: 10, max: 14 },
    "Lalande": { min: 10, max: 14 },
    "Les Izards": { min: 10, max: 14 },
    "Croix-Daurade": { min: 11, max: 15 },
    "Gramont": { min: 11, max: 15 },
    "Roseraie": { min: 11, max: 15 },
    "Juncasse-Argoulets": { min: 11, max: 15 },
    "Soupetard": { min: 11, max: 16 },
    "Château-de-l'Hers": { min: 11, max: 15 },
    "La Terrasse": { min: 11, max: 15 },
    "Montaudran-Lespinet": { min: 11, max: 15 },
    "Rangueil-CHU-Facultés": { min: 11, max: 15 },
    "Pouvourville": { min: 11, max: 15 },
    "Zones d'Activités Sud": { min: 10, max: 13 },
    "La Fourguette": { min: 10, max: 13 },
    "Bellefontaine": { min: 10, max: 13 },
    "Reynerie": { min: 10, max: 13 },
    "Mirail-Université": { min: 10, max: 13 },
    "Saint-Simon": { min: 10, max: 13 },
    "Basso-Cambo": { min: 10, max: 13 },
    "Les Pradettes": { min: 10, max: 14 },
    "Lardenne": { min: 10, max: 14 },
    "Saint-Martin-du-Touch": { min: 11, max: 15 },
    "Purpan": { min: 12, max: 16 },
};
