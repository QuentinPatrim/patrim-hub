/* ============================================================
   LES 60 GRANDS QUARTIERS DE TOULOUSE
   Source : Toulouse Métropole, open data « recensement population
   2020 – grands quartiers » (code INSEE du grand quartier et centre
   géographique). SeLoger numérote ses quartiers toulousains dans le
   même ordre : identifiant NBH2FR(9838 + n° du quartier), ex.
   Capitole (01) → NBH2FR9839, Le Busca (12) → NBH2FR9850.
   ============================================================ */

export interface Quartier { name: string; n: number; lat: number; lon: number }

export const TOULOUSE_QUARTIERS: Quartier[] = [
    { name: "Capitole", n: 1, lat: 43.60222, lon: 1.44057 },
    { name: "Arnaud-Bernard", n: 2, lat: 43.60758, lon: 1.4398 },
    { name: "Saint-Georges", n: 3, lat: 43.60337, lon: 1.44815 },
    { name: "Saint-Étienne", n: 4, lat: 43.5971, lon: 1.44828 },
    { name: "Carmes", n: 5, lat: 43.59608, lon: 1.44124 },
    { name: "Saint-Cyprien", n: 6, lat: 43.59803, lon: 1.43375 },
    { name: "Amidonniers", n: 7, lat: 43.60626, lon: 1.42338 },
    { name: "Compans", n: 8, lat: 43.61069, lon: 1.43019 },
    { name: "Les Chalets", n: 9, lat: 43.6134, lon: 1.44267 },
    { name: "Matabiau", n: 10, lat: 43.60988, lon: 1.44951 },
    { name: "Saint-Aubin-Dupuy", n: 11, lat: 43.60261, lon: 1.45376 },
    { name: "Le Busca", n: 12, lat: 43.59072, lon: 1.45404 },
    { name: "Saint-Michel", n: 13, lat: 43.58766, lon: 1.44512 },
    { name: "Ramier", n: 14, lat: 43.58148, lon: 1.4337 },
    { name: "Fer-à-Cheval", n: 15, lat: 43.59081, lon: 1.4288 },
    { name: "Patte d'Oie", n: 16, lat: 43.59811, lon: 1.4247 },
    { name: "Sept Deniers", n: 17, lat: 43.6182, lon: 1.41053 },
    { name: "Minimes", n: 18, lat: 43.61918, lon: 1.43214 },
    { name: "Bonnefoy", n: 19, lat: 43.61955, lon: 1.45464 },
    { name: "Marengo-Jolimont", n: 20, lat: 43.61176, lon: 1.4619 },
    { name: "Guilhemery", n: 21, lat: 43.60257, lon: 1.46612 },
    { name: "Côte Pavée", n: 22, lat: 43.59308, lon: 1.46932 },
    { name: "Pont-des-Demoiselles", n: 23, lat: 43.58271, lon: 1.46925 },
    { name: "Sauzelong-Rangueil", n: 24, lat: 43.57915, lon: 1.45912 },
    { name: "Saint-Agne", n: 25, lat: 43.58116, lon: 1.44787 },
    { name: "Jules-Julien", n: 26, lat: 43.57523, lon: 1.45205 },
    { name: "Empalot", n: 27, lat: 43.57881, lon: 1.44019 },
    { name: "Croix-de-Pierre", n: 28, lat: 43.57772, lon: 1.42437 },
    { name: "Papus", n: 29, lat: 43.57286, lon: 1.41547 },
    { name: "Faourette", n: 30, lat: 43.5791, lon: 1.41514 },
    { name: "Fontaine-Lestang", n: 31, lat: 43.58439, lon: 1.41962 },
    { name: "Bagatelle", n: 32, lat: 43.58224, lon: 1.41012 },
    { name: "Arènes", n: 33, lat: 43.59111, lon: 1.41897 },
    { name: "La Cépière", n: 34, lat: 43.59017, lon: 1.40748 },
    { name: "Casselardit", n: 35, lat: 43.60038, lon: 1.40941 },
    { name: "Ginestous", n: 36, lat: 43.64496, lon: 1.41301 },
    { name: "Barrière-de-Paris", n: 37, lat: 43.6336, lon: 1.43002 },
    { name: "Lalande", n: 38, lat: 43.65292, lon: 1.43464 },
    { name: "Les Izards", n: 39, lat: 43.63979, lon: 1.44301 },
    { name: "Croix-Daurade", n: 40, lat: 43.6408, lon: 1.4577 },
    { name: "Gramont", n: 41, lat: 43.63819, lon: 1.48326 },
    { name: "Roseraie", n: 42, lat: 43.62635, lon: 1.46848 },
    { name: "Juncasse-Argoulets", n: 43, lat: 43.61649, lon: 1.47598 },
    { name: "Soupetard", n: 44, lat: 43.60812, lon: 1.47657 },
    { name: "Château-de-l'Hers", n: 45, lat: 43.59808, lon: 1.48363 },
    { name: "La Terrasse", n: 46, lat: 43.584, lon: 1.4851 },
    { name: "Montaudran-Lespinet", n: 47, lat: 43.56874, lon: 1.49241 },
    { name: "Rangueil-CHU-Facultés", n: 48, lat: 43.56262, lon: 1.45456 },
    { name: "Pouvourville", n: 49, lat: 43.54621, lon: 1.45272 },
    { name: "Zones d'Activités Sud", n: 50, lat: 43.55411, lon: 1.41632 },
    { name: "La Fourguette", n: 51, lat: 43.56298, lon: 1.41082 },
    { name: "Bellefontaine", n: 52, lat: 43.56291, lon: 1.39916 },
    { name: "Reynerie", n: 53, lat: 43.57031, lon: 1.39969 },
    { name: "Mirail-Université", n: 54, lat: 43.57829, lon: 1.40171 },
    { name: "Saint-Simon", n: 55, lat: 43.55752, lon: 1.37851 },
    { name: "Basso-Cambo", n: 56, lat: 43.57348, lon: 1.37932 },
    { name: "Les Pradettes", n: 57, lat: 43.58236, lon: 1.39008 },
    { name: "Lardenne", n: 58, lat: 43.59543, lon: 1.38476 },
    { name: "Saint-Martin-du-Touch", n: 59, lat: 43.61045, lon: 1.36863 },
    { name: "Purpan", n: 60, lat: 43.61209, lon: 1.39773 },
];

export const selogerQuartierId = (q: Quartier) => `NBH2FR${9838 + q.n}`;

const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
    const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLon = ((b.lon - a.lon) * Math.PI) / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
};

/**
 * Quartiers de Toulouse autour d'un point : celui du bien (le plus proche)
 * et tous ceux dont le centre est dans le rayon, du plus proche au plus éloigné.
 */
export function quartiersAround(point: { lat: number; lon: number }, radiusKm: number): Quartier[] {
    const r = Number.isFinite(radiusKm) && radiusKm >= 0 ? radiusKm : 2;
    const sorted = TOULOUSE_QUARTIERS.map(q => ({ q, d: km(point, q) })).sort((a, b) => a.d - b.d);
    return sorted.filter((x, i) => i === 0 || x.d <= r).map(x => x.q);
}
