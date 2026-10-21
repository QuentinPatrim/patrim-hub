import sharp from "sharp";

/* ============================================================
   PHOTO AUTOMATIQUE D'UNE ADRESSE (serveur)
   ------------------------------------------------------------
   1. Vue de rue : photos Panoramax (base ouverte IGN / OSM,
   dont les 360° de Toulouse Métropole). Une photo 360° est
   recadrée en vue "appareil photo" tournée vers l'adresse,
   et redressée grâce au tangage/roulis calculés par Panoramax.
   2. Repli : vue aérienne IGN (orthophoto) centrée sur l'adresse.
   Données ouvertes : aucune clé ni abonnement nécessaire.
   Repris de l'outil d'estimation Immotech (lib/addressPhoto.ts),
   avec une taille de sortie réglable (vignette ou couverture).
   ============================================================ */

export type AddressPhotoSource = "panoramax" | "ign";

export interface AddressPhoto {
  buffer: Buffer;
  source: AddressPhotoSource;
  credit: string;          // mention à afficher (licence ouverte)
  date?: string;           // date de prise de vue (ISO)
  variant: number;         // index de la vue renvoyée
  variants: number;        // nombre total de vues possibles (vues de rue + vue aérienne)
}

const PANORAMAX_SEARCH = "https://api.panoramax.xyz/api/search";
const IGN_WMS = "https://data.geopf.fr/wms-r/wms";

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function distance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** Cap (0° = nord, sens horaire) du point 1 vers le point 2 */
function bearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const angleDiff = (a: number, b: number) => ((a - b + 540) % 360) - 180;

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store", headers: { "User-Agent": "Patrim-Hub/1.0 (photo de couverture)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return res;
  } finally {
    clearTimeout(t);
  }
}

/* ---------- Panoramax : recherche et classement des vues ---------- */

interface StreetCandidate {
  lat: number; lon: number;
  distance: number;        // mètres jusqu'à l'adresse
  heading: number;         // cap vers l'adresse
  azimuth: number;         // cap du centre de la photo
  fov: number;             // champ horizontal (360 = panoramique)
  pitch: number; roll: number; // inclinaison de la caméra calculée par Panoramax
  date: string;
  producer: string;
  license: string;
  url: string;
  urlSd?: string;
  score: number;
}

const semanticNumber = (props: { semantics?: { key?: string; value?: unknown }[] } | undefined, key: string) => {
  const tag = (props?.semantics || []).find(s => s?.key === key);
  const n = Number(tag?.value);
  return Number.isFinite(n) ? n : 0;
};

async function searchStreetViews(lat: number, lon: number): Promise<StreetCandidate[]> {
  const url = `${PANORAMAX_SEARCH}?limit=50&place_position=${lon},${lat}&place_distance=3-40`;
  const res = await fetchWithTimeout(url, 6000);
  const json = await res.json();
  const now = Date.now();
  const all: StreetCandidate[] = [];
  for (const f of json?.features || []) {
    const p = f?.properties || {};
    const [clon, clat] = f?.geometry?.coordinates || [];
    const href = f?.assets?.hd?.href || f?.assets?.sd?.href;
    const azimuth = Number(p["view:azimuth"]);
    if (!href || !Number.isFinite(clat) || !Number.isFinite(clon) || !Number.isFinite(azimuth)) continue;
    const fov = Number(p["pers:interior_orientation"]?.field_of_view) || 0;
    const d = distance(clat, clon, lat, lon);
    const h = bearing(clat, clon, lat, lon);
    const is360 = fov >= 359;
    // Photo "classique" : l'adresse doit être bien dans le cadre
    if (!is360 && (!fov || Math.abs(angleDiff(h, azimuth)) > fov / 2 - 6)) continue;
    const pitch = semanticNumber(p, "pitch"), roll = semanticNumber(p, "roll");
    const ageYears = Math.max(0, (now - new Date(p.datetime || 0).getTime()) / (365.25 * 24 * 3600 * 1000));
    // Distance idéale ≈ 8–20 m (façade entière, pas trop écrasée)
    const distPenalty = d < 8 ? (8 - d) * 2.5 : d > 20 ? (d - 20) * 1.2 : 0;
    const tiltPenalty = Math.max(0, Math.abs(pitch) + Math.abs(roll) - 20); // très penchée : moins fiable
    all.push({
      lat: clat, lon: clon, distance: d, heading: h, azimuth, fov: is360 ? 360 : fov,
      pitch, roll, date: p.datetime || "", producer: p["geovisio:producer"] || "",
      license: p.license || "", url: href, urlSd: f?.assets?.sd?.href,
      score: distPenalty + ageYears * 2 + tiltPenalty,
    });
  }
  all.sort((a, b) => a.score - b.score);
  // Vues variées : on écarte les photos prises à moins de 5 m d'une vue déjà retenue
  const picked: StreetCandidate[] = [];
  for (const c of all) {
    if (picked.some(p => distance(p.lat, p.lon, c.lat, c.lon) < 5)) continue;
    picked.push(c);
    if (picked.length >= 6) break;
  }
  return picked;
}

/* ---------- Rendu : panoramique 360° → vue perspective ---------- */

async function renderFromPanorama(src: Buffer, c: StreetCandidate, W: number, H: number): Promise<Buffer> {
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const sw = info.width, sh = info.height, ch = info.channels;
  const out = Buffer.alloc(W * H * 3);
  // Cadrage : on lève un peu la vue pour prendre la façade, champ plus large quand on est près
  const viewPitch = clamp(toDeg(Math.atan2(4, c.distance)), 8, 22);
  const hfov = clamp(toDeg(2 * Math.atan(12 / c.distance)), 60, 95);
  const yaw = c.heading - c.azimuth;
  const f = W / 2 / Math.tan(toRad(hfov) / 2);
  const cy = Math.cos(toRad(yaw)), sy = Math.sin(toRad(yaw));
  const cp = Math.cos(toRad(viewPitch)), sp = Math.sin(toRad(viewPitch));
  // Redressement de la caméra (valeurs Panoramax, appliquées en sens inverse)
  const cP = Math.cos(toRad(-c.pitch)), sP = Math.sin(toRad(-c.pitch));
  const cR = Math.cos(toRad(-c.roll)), sR = Math.sin(toRad(-c.roll));
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      const x = u - W / 2 + 0.5, y = -(v - H / 2 + 0.5), z = f;
      const y1 = y * cp + z * sp, z1 = -y * sp + z * cp;          // tangage de la vue
      const x2 = x * cy + z1 * sy, z2 = -x * sy + z1 * cy;        // cap de la vue
      const y3 = y1 * cP + z2 * sP, z3 = -y1 * sP + z2 * cP;      // tangage caméra
      const x4 = x2 * cR + y3 * sR, y4 = -x2 * sR + y3 * cR;      // roulis caméra
      const lonA = Math.atan2(x4, z3), latA = Math.atan2(y4, Math.hypot(x4, z3));
      const px = (lonA / (2 * Math.PI) + 0.5) * sw - 0.5;
      const py = clamp((0.5 - latA / Math.PI) * sh - 0.5, 0, sh - 1.001);
      const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
      const xa = ((x0 % sw) + sw) % sw, xb = (xa + 1) % sw;
      const i00 = (y0 * sw + xa) * ch, i01 = (y0 * sw + xb) * ch;
      const i10 = ((y0 + 1) * sw + xa) * ch, i11 = ((y0 + 1) * sw + xb) * ch;
      const o = (v * W + u) * 3;
      for (let k = 0; k < 3; k++) {
        out[o + k] = (data[i00 + k] * (1 - fx) + data[i01 + k] * fx) * (1 - fy) + (data[i10 + k] * (1 - fx) + data[i11 + k] * fx) * fy;
      }
    }
  }
  return sharp(out, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
}

/** Photo classique (non panoramique) : recadrage 3:2 centré sur l'adresse */
async function renderFromFlat(src: Buffer, c: StreetCandidate, W: number, H: number): Promise<Buffer> {
  const img = sharp(src).rotate();
  const meta = await img.metadata();
  const w = meta.width || 0, h = meta.height || 0;
  if (!w || !h) throw new Error("Image illisible");
  const cropH = Math.min(h, Math.round(w / 1.5));
  const cropW = Math.min(w, Math.round(cropH * 1.5));
  const fpx = w / 2 / Math.tan(toRad(c.fov) / 2);
  const targetX = w / 2 + fpx * Math.tan(toRad(angleDiff(c.heading, c.azimuth)));
  const left = clamp(Math.round(targetX - cropW / 2), 0, w - cropW);
  const top = Math.round((h - cropH) / 2);
  return img.extract({ left, top, width: cropW, height: cropH }).resize(W, H, { fit: "cover" }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
}

function streetCredit(c: StreetCandidate) {
  const who = /toulouse/i.test(c.producer) ? "Toulouse Métropole" : c.producer || "contributeur";
  const year = c.date ? new Date(c.date).getFullYear() : "";
  return `Panoramax · ${who}${year ? ` · ${year}` : ""} (${c.license || "licence ouverte"})`;
}

/* ---------- Repli : vue aérienne IGN ---------- */

async function aerialView(lat: number, lon: number, W: number, H: number): Promise<Buffer> {
  const R = 6378137;
  const x = R * toRad(lon);
  const y = R * Math.log(Math.tan(Math.PI / 4 + toRad(lat) / 2));
  const k = 1 / Math.cos(toRad(lat));        // mètres au sol → unités Web Mercator
  const halfW = 60 * k, halfH = 40 * k;       // emprise ≈ 120 m × 80 m
  const bbox = [x - halfW, y - halfH, x + halfW, y + halfH].map(v => v.toFixed(2)).join(",");
  const url = `${IGN_WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ORTHOIMAGERY.ORTHOPHOTOS&STYLES=&CRS=EPSG:3857&BBOX=${bbox}&WIDTH=${W}&HEIGHT=${H}&FORMAT=image/jpeg`;
  const res = await fetchWithTimeout(url, 8000);
  if (!(res.headers.get("content-type") || "").startsWith("image/")) throw new Error("Réponse IGN inattendue");
  const base = Buffer.from(await res.arrayBuffer());
  // Repère Patrim au centre
  const k2 = W / 1200;
  const pin = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <circle cx="${W / 2}" cy="${H / 2}" r="${34 * k2}" fill="none" stroke="white" stroke-width="${5 * k2}" opacity="0.9"/>
      <circle cx="${W / 2}" cy="${H / 2}" r="${12 * k2}" fill="#6c1a1f" stroke="white" stroke-width="${4 * k2}"/>
    </svg>`
  );
  return sharp(base).composite([{ input: pin }]).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
}

/* ---------- Point d'entrée ---------- */

/**
 * Renvoie la vue n° `variant` de l'adresse : d'abord les vues de rue (de la plus
 * pertinente à la moins pertinente), puis la vue aérienne. Au-delà, on reboucle.
 * `mode: "aerien"` renvoie directement la vue aérienne.
 */
export async function getAddressPhoto(lat: number, lon: number, variant = 0, mode: "auto" | "aerien" = "auto", largeur = 1200): Promise<AddressPhoto> {
  const W = Math.round(clamp(largeur, 300, 1600));
  const H = Math.round((W * 2) / 3);
  let streets: StreetCandidate[] = [];
  if (mode === "auto") {
    try { streets = await searchStreetViews(lat, lon); } catch (e) { console.error("Panoramax indisponible :", e); }
  }
  const variants = streets.length + 1;
  const start = mode === "aerien" ? streets.length : ((variant % variants) + variants) % variants;
  // Si une vue de rue échoue (téléchargement…), on passe à la suivante, puis à la vue aérienne
  for (let i = start; i < streets.length; i++) {
    const c = streets[i];
    try {
      // Vignette : la photo basse définition suffit et se télécharge bien plus vite
      const res = await fetchWithTimeout(W <= 700 && c.urlSd ? c.urlSd : c.url, 12000);
      const src = Buffer.from(await res.arrayBuffer());
      const buffer = c.fov >= 360 ? await renderFromPanorama(src, c, W, H) : await renderFromFlat(src, c, W, H);
      return { buffer, source: "panoramax", credit: streetCredit(c), date: c.date, variant: i, variants };
    } catch (e) {
      console.error("Vue Panoramax ignorée :", e);
    }
  }
  const buffer = await aerialView(lat, lon, W, H);
  return { buffer, source: "ign", credit: "Vue aérienne © IGN (licence ouverte)", variant: streets.length, variants };
}
