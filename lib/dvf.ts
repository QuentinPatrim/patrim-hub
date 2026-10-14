/* ============================================================
   MOTEUR DVF — ventes réelles (Demandes de Valeurs Foncières)
   ------------------------------------------------------------
   Source : fichiers "DVF géolocalisées" publiés par Etalab sur
   files.data.gouv.fr (une archive CSV par commune et par année).
   Remplace l'ancienne API api.cquest.org/dvf (hors service).

   Usage serveur uniquement (route /api/comparables).
   ============================================================ */

const DVF_BASE = "https://files.data.gouv.fr/geo-dvf/latest/csv";
const FIRST_DVF_YEAR = 2021; // plus ancienne année publiée dans "latest"

export type DvfPropertyType = "Appartement" | "Maison";

export interface DvfSale {
    id: string;
    date: string;            // ISO yyyy-mm-dd
    price: number;
    surface: number;         // surface réelle bâtie
    carrez: number | null;   // surface Carrez déclarée (si dispo)
    rooms: number;
    type: DvfPropertyType;
    address: string;
    postcode: string;
    city: string;
    lat: number;
    lon: number;
    distance: number;        // mètres depuis le bien estimé
    pricePerSqm: number;
    dependances: number;     // caves / parkings vendus avec
    landSurface: number;     // terrain (maisons)
    isVefa: boolean;
}

export interface DvfStats {
    count: number;
    median: number;
    p25: number;
    p75: number;
    min: number;
    max: number;
    byYear: { year: number; median: number; count: number }[];
}

export interface DvfSearchParams {
    address: string;
    surface: number;
    propertyType: string;
    radius?: number;          // mètres
    surfaceTolerance?: number; // 0.25 = ±25 %
    rooms?: number;           // si > 0 : ±1 pièce
    includeVefa?: boolean;
    limit?: number;
    /** Comparables déjà saisis : on retrouve leur date/distance dans DVF (prix exact, surface ±1 m²) */
    knownSales?: { id: string; price: number; surface: number }[];
}

export interface DvfSearchResult {
    center: { lat: number; lon: number; label: string; citycode: string };
    communes: string[];
    years: number[];
    sales: DvfSale[];
    stats: DvfStats | null;
    matches: Record<string, { dvfId: string; date: string; distance: number }>;
}

/* ---------- Géocodage (Géoplateforme IGN, repli BAN historique) ---------- */

async function fetchJson(url: string, timeout = 4000): Promise<any> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(t);
    }
}

export async function geocode(address: string) {
    const q = encodeURIComponent(address.trim());
    const endpoints = [
        `https://data.geopf.fr/geocodage/search?q=${q}&limit=1`,
        `https://api-adresse.data.gouv.fr/search/?q=${q}&limit=1`,
    ];
    for (const url of endpoints) {
        try {
            const data = await fetchJson(url);
            const f = data?.features?.[0];
            if (f) {
                const [lon, lat] = f.geometry.coordinates;
                return { lon, lat, citycode: f.properties.citycode as string, label: f.properties.label as string };
            }
        } catch { /* on tente l'endpoint suivant */ }
    }
    return null;
}

async function reverseCitycode(lon: number, lat: number): Promise<string | null> {
    const endpoints = [
        `https://data.geopf.fr/geocodage/reverse?lon=${lon}&lat=${lat}&limit=1`,
        `https://api-adresse.data.gouv.fr/reverse/?lon=${lon}&lat=${lat}&limit=1`,
    ];
    for (const url of endpoints) {
        try {
            const data = await fetchJson(url, 3000);
            const code = data?.features?.[0]?.properties?.citycode;
            if (code) return code;
        } catch { /* suivant */ }
    }
    return null;
}

/* ---------- Géométrie ---------- */

export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3;
    const p1 = (lat1 * Math.PI) / 180;
    const p2 = (lat2 * Math.PI) / 180;
    const dp = ((lat2 - lat1) * Math.PI) / 180;
    const dl = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function offsetPoint(lat: number, lon: number, dxMeters: number, dyMeters: number) {
    const dLat = dyMeters / 111_320;
    const dLon = dxMeters / (111_320 * Math.cos((lat * Math.PI) / 180));
    return { lat: lat + dLat, lon: lon + dLon };
}

/* ---------- Mise en forme des adresses DVF ---------- */

const VOIE_TYPES: Record<string, string> = {
    AV: "Avenue", BD: "Boulevard", R: "Rue", RUE: "Rue", ALL: "Allées", CHE: "Chemin",
    IMP: "Impasse", PL: "Place", QU: "Quai", QUA: "Quai", RTE: "Route", CRS: "Cours",
    ESP: "Esplanade", PROM: "Promenade", SQ: "Square", PAS: "Passage", RPT: "Rond-point",
    CITE: "Cité", RES: "Résidence", LOT: "Lotissement", HAM: "Hameau", SEN: "Sentier",
    FG: "Faubourg", PORT: "Port", VOIE: "Voie", TSSE: "Traverse", PLA: "Plan",
};
const LOWER_WORDS = new Set(["DE", "DU", "DES", "LA", "LE", "LES", "D", "L", "ET", "AU", "AUX", "SUR", "SOUS"]);

export function prettifyDvfStreet(raw: string) {
    const words = (raw || "").trim().split(/\s+/).filter(Boolean);
    return words
        .map((w, i) => {
            if (i === 0 && VOIE_TYPES[w]) return VOIE_TYPES[w];
            if (i > 0 && LOWER_WORDS.has(w)) return w.toLowerCase();
            return w
                .toLowerCase()
                .split("-")
                .map(p => p.charAt(0).toUpperCase() + p.slice(1))
                .join("-");
        })
        .join(" ")
        .replace(/\b([dl]) ([A-Z])/g, "$1'$2");
}

/* ---------- Téléchargement + parsing CSV (avec cache mémoire) ---------- */

interface RawLocal {
    type: DvfPropertyType; surface: number; rooms: number; carrez: number | null;
    addrNum: string; street: string; postcode: string; city: string; lat: number; lon: number;
    key: string;
}

/** Mutation compacte (on ne garde que ce qui sert au calcul, pour limiter la mémoire) */
interface RawMutation {
    id: string;
    date: string;
    nature: string;
    price: number;
    locals: RawLocal[];   // appartements / maisons (dédoublonnés)
    dependances: number;
    land: number;         // somme des surfaces de terrain (parcelles distinctes)
    otherLocals: number;  // locaux industriels/commerciaux
}

// Cache mémoire par commune/année, borné (une instance Vercel "chaude" le réutilise)
const fileCache = new Map<string, { at: number; mutations: RawMutation[] }>();
const inFlight = new Map<string, Promise<RawMutation[]>>();
const CACHE_TTL = 1000 * 60 * 60 * 12; // 12 h (les fichiers sont publiés 2×/an)
const CACHE_MAX_ENTRIES = 15; // ≈ 15 Mo par commune-année pour une grande ville

function cacheSet(key: string, mutations: RawMutation[]) {
    fileCache.delete(key);
    fileCache.set(key, { at: Date.now(), mutations });
    while (fileCache.size > CACHE_MAX_ENTRIES) {
        const oldest = fileCache.keys().next().value;
        if (oldest === undefined) break;
        fileCache.delete(oldest);
    }
}

function splitCsvLine(line: string): string[] {
    if (!line.includes('"')) return line.split(",");
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (c === "," && !inQuotes) {
            out.push(cur); cur = "";
        } else cur += c;
    }
    out.push(cur);
    return out;
}

async function loadCommuneYear(citycode: string, year: number): Promise<RawMutation[]> {
    const key = `${citycode}-${year}`;
    const cached = fileCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL) return cached.mutations;
    const pending = inFlight.get(key);
    if (pending) return pending;
    const p = downloadCommuneYear(citycode, year)
        .then(m => { cacheSet(key, m); return m; })
        .finally(() => inFlight.delete(key));
    inFlight.set(key, p);
    return p;
}

async function downloadCommuneYear(citycode: string, year: number): Promise<RawMutation[]> {
    const dep = citycode.startsWith("97") ? citycode.slice(0, 3) : citycode.slice(0, 2);
    const url = `${DVF_BASE}/${year}/communes/${dep}/${citycode}.csv`;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12000);
    let text = "";
    try {
        const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
        if (res.status === 404) return [];
        if (!res.ok) throw new Error(`DVF ${year} HTTP ${res.status}`);
        text = await res.text();
    } finally {
        clearTimeout(t);
    }

    const lines = text.split("\n");
    const header = splitCsvLine(lines[0]);
    const col = (name: string) => header.indexOf(name);
    const C = {
        id: col("id_mutation"), date: col("date_mutation"), nature: col("nature_mutation"),
        price: col("valeur_fonciere"), num: col("adresse_numero"), suffix: col("adresse_suffixe"),
        street: col("adresse_nom_voie"), cp: col("code_postal"), city: col("nom_commune"),
        parcel: col("id_parcelle"), type: col("type_local"), surface: col("surface_reelle_bati"),
        rooms: col("nombre_pieces_principales"), land: col("surface_terrain"),
        lon: col("longitude"), lat: col("latitude"),
        lots: [1, 2, 3, 4, 5].map(i => col(`lot${i}_numero`)),
        carrez: [1, 2, 3, 4, 5].map(i => col(`lot${i}_surface_carrez`)),
    };

    interface Acc { m: RawMutation; parcels: Set<string>; localKeys: Set<string> }
    const byId = new Map<string, Acc>();
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const f = splitCsvLine(line);
        const nature = f[C.nature];
        // Seules les ventes (et VEFA) nous intéressent : on ignore le reste dès le parsing
        if (nature !== "Vente" && nature !== "Vente en l'état futur d'achèvement") continue;
        const id = f[C.id];
        let acc = byId.get(id);
        if (!acc) {
            acc = {
                m: { id, date: f[C.date], nature, price: Number(f[C.price]) || 0, locals: [], dependances: 0, land: 0, otherLocals: 0 },
                parcels: new Set(), localKeys: new Set(),
            };
            byId.set(id, acc);
        }
        const m = acc.m;
        const parcel = f[C.parcel];
        if (parcel && !acc.parcels.has(parcel)) { acc.parcels.add(parcel); m.land += Number(f[C.land]) || 0; }

        const type = f[C.type];
        if (type === "Appartement" || type === "Maison") {
            const surface = Number(f[C.surface]) || 0;
            const rooms = Number(f[C.rooms]) || 0;
            const addrNum = `${f[C.num] || ""}${f[C.suffix] || ""}`;
            // Le n° de lot distingue deux logements identiques vendus ensemble
            const lots = C.lots.map(ci => (ci >= 0 ? f[ci] : "")).filter(Boolean).join("+");
            const localKey = `${type}|${surface}|${rooms}|${addrNum}|${f[C.street]}|${lots}`;
            if (!acc.localKeys.has(localKey)) {
                acc.localKeys.add(localKey);
                const carrezValues = C.carrez.map(ci => (ci >= 0 ? Number(f[ci]) || 0 : 0)).filter(v => v > 0);
                m.locals.push({
                    type, surface, rooms, key: localKey,
                    carrez: carrezValues.length ? carrezValues.reduce((a, b) => a + b, 0) : null,
                    addrNum, street: f[C.street], postcode: f[C.cp], city: f[C.city],
                    lat: Number(f[C.lat]), lon: Number(f[C.lon]),
                });
            }
        } else if (type === "Dépendance") {
            m.dependances++;
        } else if (type) {
            m.otherLocals++;
        }
    }

    return Array.from(byId.values(), a => a.m);
}

/* ---------- Statistiques ---------- */

function quantile(sorted: number[], q: number) {
    if (sorted.length === 0) return 0;
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

export function computeStats(sales: DvfSale[]): DvfStats | null {
    if (sales.length === 0) return null;
    const ppm = sales.map(s => s.pricePerSqm).sort((a, b) => a - b);
    const years = new Map<number, number[]>();
    sales.forEach(s => {
        const y = Number(s.date.slice(0, 4));
        if (!years.has(y)) years.set(y, []);
        years.get(y)!.push(s.pricePerSqm);
    });
    return {
        count: sales.length,
        median: Math.round(quantile(ppm, 0.5)),
        p25: Math.round(quantile(ppm, 0.25)),
        p75: Math.round(quantile(ppm, 0.75)),
        min: Math.round(ppm[0]),
        max: Math.round(ppm[ppm.length - 1]),
        byYear: Array.from(years.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([year, arr]) => {
                const s = arr.sort((a, b) => a - b);
                return { year, median: Math.round(quantile(s, 0.5)), count: s.length };
            }),
    };
}

/* ---------- Recherche principale ---------- */

export async function searchDvfComparables(params: DvfSearchParams): Promise<DvfSearchResult | { error: string; status: number }> {
    const {
        address, surface, propertyType,
        radius = 500, surfaceTolerance = 0.25, rooms = 0,
        includeVefa = false, limit = 30, knownSales = [],
    } = params;

    const center = await geocode(address);
    if (!center) return { error: "Adresse introuvable. Vérifiez l'adresse du bien (étape 1).", status: 404 };

    // Communes couvertes par le rayon : centre + 4 points cardinaux
    const communes = new Set<string>([center.citycode]);
    const probes = [[radius, 0], [-radius, 0], [0, radius], [0, -radius]].map(([dx, dy]) => offsetPoint(center.lat, center.lon, dx, dy));
    const probeCodes = await Promise.all(probes.map(p => reverseCitycode(p.lon, p.lat)));
    probeCodes.forEach(c => { if (c) communes.add(c); });
    const communeList = Array.from(communes).slice(0, 5);

    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let y = currentYear; y >= FIRST_DVF_YEAR; y--) years.push(y);

    const loads = await Promise.allSettled(
        communeList.flatMap(code => years.map(y => loadCommuneYear(code, y).then(m => ({ y, m }))))
    );
    // Fusion par id : une vente à cheval sur deux communes apparaît dans les deux fichiers
    const mergedById = new Map<string, RawMutation>();
    const yearsFound = new Set<number>();
    let failures = 0;
    loads.forEach(r => {
        if (r.status !== "fulfilled") { failures++; return; }
        if (r.value.m.length) yearsFound.add(r.value.y);
        for (const m of r.value.m) {
            const prev = mergedById.get(m.id);
            if (!prev) { mergedById.set(m.id, m); continue; }
            const keys = new Set(prev.locals.map(l => l.key));
            mergedById.set(m.id, {
                ...prev,
                locals: [...prev.locals, ...m.locals.filter(l => !keys.has(l.key))],
                dependances: prev.dependances + m.dependances,
                land: prev.land + m.land,
                otherLocals: prev.otherLocals + m.otherLocals,
            });
        }
    });
    const mutations = Array.from(mergedById.values());
    if (mutations.length === 0) {
        return {
            error: failures > 0
                ? "Le serveur DVF (data.gouv.fr) ne répond pas pour le moment. Réessayez dans quelques instants."
                : "Aucune donnée DVF pour cette commune (Alsace-Moselle et Mayotte ne sont pas couverts).",
            status: 502,
        };
    }

    const wantedType: DvfPropertyType = propertyType.toLowerCase().includes("maison") ? "Maison" : "Appartement";
    const minS = surface * (1 - surfaceTolerance);
    const maxS = surface * (1 + surfaceTolerance);

    const sales: DvfSale[] = [];
    for (const m of mutations) {
        const isVefa = m.nature === "Vente en l'état futur d'achèvement";
        if (m.nature !== "Vente" && !(includeVefa && isVefa)) continue;
        if (m.price < 10000) continue;
        // Un seul logement dans la mutation, sinon le prix n'est pas attribuable
        if (m.locals.length !== 1 || m.otherLocals > 0) continue;
        const local = m.locals[0];
        if (local.type !== wantedType) continue;
        if (!local.surface || local.surface < minS || local.surface > maxS) continue;
        if (rooms > 0 && local.rooms > 0 && Math.abs(local.rooms - rooms) > 1) continue;
        if (!Number.isFinite(local.lat) || !Number.isFinite(local.lon)) continue;
        const distance = distanceMeters(center.lat, center.lon, local.lat, local.lon);
        if (distance > radius) continue;

        const pricePerSqm = m.price / local.surface;
        if (pricePerSqm < 300 || pricePerSqm > 30000) continue; // valeurs aberrantes

        const landSurface = m.land;
        sales.push({
            id: m.id,
            date: m.date,
            price: Math.round(m.price),
            surface: local.surface,
            carrez: local.carrez,
            rooms: local.rooms,
            type: local.type,
            address: `${local.addrNum ? local.addrNum + " " : ""}${prettifyDvfStreet(local.street)}`.trim(),
            postcode: local.postcode,
            city: local.city,
            lat: local.lat,
            lon: local.lon,
            distance: Math.round(distance),
            pricePerSqm: Math.round(pricePerSqm),
            dependances: m.dependances,
            landSurface: wantedType === "Maison" ? landSurface : 0,
            isVefa,
        });
    }

    // Rapprochement des comparables saisis à la main (sans filtre de rayon / pièces / date)
    const matches: DvfSearchResult["matches"] = {};
    for (const k of knownSales) {
        const price = Math.round(Number(k.price) || 0);
        if (!price) continue;
        let best: { m: RawMutation; d: number } | null = null;
        for (const m of mutations) {
            if (Math.round(m.price) !== price || m.locals.length !== 1) continue;
            const local = m.locals[0];
            if (Math.abs(local.surface - Number(k.surface)) > 1) continue;
            const d = distanceMeters(center.lat, center.lon, local.lat, local.lon);
            if (!best || d < best.d) best = { m, d };
        }
        if (best && best.d <= 5000) matches[k.id] = { dvfId: best.m.id, date: best.m.date, distance: Math.round(best.d) };
    }
    const matchedIds = new Set(Object.values(matches).map(m => m.dvfId));

    // Tri par pertinence : récence puis proximité de surface et distance
    const now = Date.now();
    const score = (s: DvfSale) => {
        const ageYears = (now - new Date(s.date).getTime()) / (365.25 * 24 * 3600 * 1000);
        const surfaceGap = Math.abs(s.surface - surface) / surface;
        return ageYears * 1.0 + surfaceGap * 4 + (s.distance / radius) * 1.5;
    };
    sales.sort((a, b) => score(a) - score(b));

    return {
        center: { lat: center.lat, lon: center.lon, label: center.label, citycode: center.citycode },
        communes: communeList,
        years: Array.from(yearsFound).sort(),
        sales: sales.filter(s => !matchedIds.has(s.id)).slice(0, limit),
        stats: computeStats(sales),
        matches,
    };
}
