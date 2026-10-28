import { NextResponse } from "next/server";
import { checkAccess } from "@/lib/ai-server";

/* ============================================================
   Radar vendeurs : signaux publics d'une vente à venir.
   - DPE des logements existants (ADEME, open data) : adresse, date,
     classe. Un DPE récent précède souvent une vente ou une location.
   - Audits énergétiques réglementaires (ADEME), quand la base répond :
     obligatoires pour vendre une maison classée E, F ou G.
   - BODACC : sociétés civiles immobilières de Haute-Garonne en
     liquidation ou en dissolution (un bien à vendre, un liquidateur).
   Aucune donnée nominative de particulier : des adresses de logements
   et des sociétés. Prospection par courrier ou boîtage uniquement.
   POST { codesPostaux: string[], jours: number }
   GET ?diag=1 : champs reçus de chaque source (contrôle technique, sans données).
   ============================================================ */

export const maxDuration = 60;

const ADEME = "https://data.ademe.fr/data-fair/api/v1/datasets";
const BODACC = "https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records";

export interface SignalPublic {
  id: string;
  source: "dpe" | "audit" | "bodacc";
  date: string; // AAAA-MM-JJ
  adresse: string;
  codePostal?: string;
  ville?: string;
  lat?: number;
  lon?: number;
  titre: string;
  detail?: string;
  classe?: string;
  type?: string;
  surface?: number;
  lien?: string;
  score: number;
}

type Ligne = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? "" : String(v)).trim();
const premier = (l: Ligne, ...cles: string[]) => cles.map((k) => txt(l[k])).find(Boolean) ?? "";
const nombre = (v: unknown) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const jourDe = (v: string) => v.slice(0, 10);

async function json(url: string, timeout = 15000): Promise<{ ok: boolean; status: number; data: any }> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { signal: c.signal, cache: "no-store", headers: { accept: "application/json" } });
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => null) };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(t);
  }
}

/** Lignes d'un jeu ADEME, filtrées par codes postaux et date (syntaxe Lucene de data-fair). */
async function lignesAdeme(dataset: string, champDate: string, champCp: string, cps: string[], depuis: string, taille = 1000, champs?: string[]) {
  const qs = `${champCp}:(${cps.map((c) => `"${c}"`).join(" OR ")}) AND ${champDate}:[${depuis} TO *]`;
  const url = `${ADEME}/${dataset}/lines?size=${taille}&sort=-${champDate}&qs=${encodeURIComponent(qs)}${champs ? `&select=${champs.join(",")}` : ""}`;
  const r = await json(url, 25000);
  // Champ inconnu dans cette version du jeu : on reprend sans sélection
  return r.ok || !champs ? r : json(url.replace(/&select=[^&]*/, ""), 25000);
}

const CHAMPS_DPE = ["numero_dpe", "date_etablissement_dpe", "date_reception_dpe", "adresse_ban", "adresse_brut", "complement_adresse_logement", "code_postal_ban", "nom_commune_ban", "etiquette_dpe", "type_batiment", "surface_habitable_logement", "numero_etage_appartement", "annee_construction", "_geopoint"];
const CHAMPS_AUDIT = ["n_audit", "id_etape", "etape_travaux", "date_etablissement_audit", "date_reception_audit", "adresse_ban", "adresse_brut", "code_postal_ban", "nom_commune_ban", "classe_bilan_dpe", "surface_habitable_logement", "_geopoint"];

function geopoint(l: Ligne) {
  const g = txt(l._geopoint);
  const [lat, lon] = g.split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : {};
}

async function dpe(cps: string[], depuis: string, auj: string): Promise<{ signaux: SignalPublic[]; erreur?: string }> {
  // Champ de date : réception par l'ADEME, sinon établissement
  let r: Awaited<ReturnType<typeof json>> = { ok: false, status: 0, data: null };
  for (const id of await idDpe()) {
    r = await lignesAdeme(id, "date_reception_dpe", "code_postal_ban", cps, depuis, 5000, CHAMPS_DPE);
    if (!r.ok) r = await lignesAdeme(id, "date_etablissement_dpe", "code_postal_ban", cps, depuis, 5000, CHAMPS_DPE);
    if (r.ok) break;
  }
  if (!r.ok) return { signaux: [], erreur: `Base des DPE indisponible (${r.status || "réseau"}).` };
  const lignes: Ligne[] = r.data?.results ?? [];
  const signaux = lignes
    .map((l): SignalPublic | null => {
      const adresse = premier(l, "adresse_ban", "adresse_brut");
      if (!adresse) return null;
      const date = jourDe(premier(l, "date_etablissement_dpe", "date_reception_dpe"));
      const classe = premier(l, "etiquette_dpe").toUpperCase();
      const type = premier(l, "type_batiment").toLowerCase();
      const surface = nombre(l.surface_habitable_logement);
      const complement = premier(l, "complement_adresse_logement");
      const etage = premier(l, "numero_etage_appartement");
      const age = Math.round((new Date(auj).getTime() - new Date(date).getTime()) / 86400000);
      const passoire = classe === "F" || classe === "G";
      return {
        id: `dpe:${premier(l, "numero_dpe", "_id") || adresse + date}`,
        source: "dpe",
        date,
        adresse: [adresse, complement].filter(Boolean).join(", "),
        codePostal: premier(l, "code_postal_ban", "code_postal_brut"),
        ville: premier(l, "nom_commune_ban", "nom_commune_brut"),
        ...geopoint(l),
        titre: `DPE ${classe || "?"} · ${type === "maison" ? "maison" : type === "appartement" ? "appartement" : type || "logement"}${surface ? ` de ${Math.round(surface)} m²` : ""}`,
        detail: [etage && type === "appartement" ? `étage ${etage}` : "", premier(l, "annee_construction") ? `construit en ${premier(l, "annee_construction")}` : "", passoire ? "passoire thermique : vente ou travaux à venir" : ""].filter(Boolean).join(" · "),
        classe,
        type,
        surface,
        score: (age <= 15 ? 3 : age <= 45 ? 2 : 1) + (passoire ? 2 : 0) + (type === "maison" ? 1 : 0),
      };
    })
    .filter((s): s is SignalPublic => !!s);
  // Un même logement peut avoir plusieurs DPE (refait) : on garde le plus récent
  const vus = new Map<string, SignalPublic>();
  for (const s of signaux) {
    const cle = `${s.adresse.toLowerCase()}|${s.surface ?? ""}`;
    const d = vus.get(cle);
    if (!d || d.date < s.date) vus.set(cle, s);
  }
  return { signaux: [...vus.values()] };
}

/** Jeu ADEME des DPE des logements existants (l'identifiant a changé au fil des versions). */
async function idDpe(): Promise<string[]> {
  const r = await json(`${ADEME}?q=${encodeURIComponent("DPE logements existants")}&size=30&select=id,title`);
  const liste: { id: string; title?: string }[] = r.data?.results ?? [];
  const bons = liste.filter((d) => /dpe/i.test(d.id + " " + (d.title ?? "")) && /existant/i.test(d.id + " " + (d.title ?? "")) && !/tertiaire|neuf|avant|2012|audit/i.test(d.title ?? ""));
  return [...new Set(["dpe03existant", ...bons.map((d) => d.id)])];
}

/** Jeu ADEME des audits énergétiques, s'il est publié (trouvé par recherche dans le catalogue). */
async function idAudits(): Promise<string | undefined> {
  const r = await json(`${ADEME}?q=audit%20energetique%20logement&size=20&select=id,title`);
  const liste: { id: string; title?: string }[] = r.data?.results ?? [];
  return liste.find((d) => /audit/i.test(d.id + " " + (d.title ?? "")) && !/tertiaire|entreprise|copro/i.test(d.id + " " + (d.title ?? "")))?.id;
}

async function audits(cps: string[], depuis: string): Promise<{ signaux: SignalPublic[]; erreur?: string }> {
  const id = await idAudits();
  if (!id) return { signaux: [], erreur: "Base des audits énergétiques introuvable." };
  // Les noms de champs varient d'un jeu à l'autre : on essaie les plus courants
  for (const [date, cp] of [
    ["date_etablissement_audit", "code_postal_ban"],
    ["date_reception_audit", "code_postal_ban"],
    ["date_etablissement", "code_postal_ban"],
  ]) {
    const r = await lignesAdeme(id, date, cp, cps, depuis, 3000, CHAMPS_AUDIT);
    if (!r.ok) continue;
    // Une ligne par étape de travaux : on garde une ligne par audit (l'état initial)
    const parAudit = new Map<string, Ligne>();
    for (const l of (r.data?.results ?? []) as Ligne[]) {
      const k = premier(l, "n_audit", "numero_audit") || premier(l, "adresse_ban");
      const etape = premier(l, "id_etape", "etape_travaux");
      if (!parAudit.has(k) || /^0$|initial/i.test(etape)) parAudit.set(k, l);
    }
    const lignes = [...parAudit.values()];
    return {
      signaux: lignes
        .map((l): SignalPublic | null => {
          const adresse = premier(l, "adresse_ban", "adresse_brut");
          if (!adresse) return null;
          const classe = premier(l, "classe_bilan_dpe", "etiquette_dpe").toUpperCase();
          const surface = nombre(l.surface_habitable_logement);
          return {
            id: `audit:${premier(l, "numero_audit", "n_audit", "_id") || adresse}`,
            source: "audit",
            date: jourDe(premier(l, date)),
            adresse,
            codePostal: premier(l, "code_postal_ban"),
            ville: premier(l, "nom_commune_ban"),
            ...geopoint(l),
            titre: `Audit énergétique${classe ? ` · classe ${classe}` : ""}${surface ? ` · ${Math.round(surface)} m²` : ""}`,
            detail: "Audit obligatoire avant la vente d'une maison classée E, F ou G : vente probable",
            classe,
            type: "maison",
            surface,
            score: 6,
          };
        })
        .filter((s): s is SignalPublic => !!s),
    };
  }
  return { signaux: [], erreur: "Base des audits énergétiques : format non reconnu." };
}

async function bodacc(depuis: string): Promise<{ signaux: SignalPublic[]; erreur?: string }> {
  const where = `numerodepartement="31" AND dateparution>=date'${depuis}' AND (familleavis="collective" OR familleavis="radiation" OR familleavis="modification")`;
  const out: SignalPublic[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const r = await json(`${BODACC}?where=${encodeURIComponent(where)}&order_by=dateparution%20desc&limit=100&offset=${offset}`);
    if (!r.ok) return { signaux: out, erreur: out.length ? undefined : `BODACC indisponible (${r.status || "réseau"}).` };
    const lignes: Ligne[] = r.data?.results ?? [];
    for (const l of lignes) {
      const brut = JSON.stringify(l);
      if (!/soci[ée]t[ée] civile immobili|\bSCI\b/i.test(brut)) continue;
      const liquidation = /liquidation/i.test(brut);
      const dissolution = /dissolution/i.test(brut);
      if (!liquidation && !dissolution) continue;
      const nom = premier(l, "commercant") || "Société civile immobilière";
      out.push({
        id: `bodacc:${premier(l, "id", "numeroannonce") || nom + premier(l, "dateparution")}`,
        source: "bodacc",
        date: jourDe(premier(l, "dateparution")),
        adresse: [premier(l, "ville"), premier(l, "cp")].filter(Boolean).join(" ") || "Haute-Garonne",
        codePostal: premier(l, "cp"),
        ville: premier(l, "ville"),
        titre: `${nom} · ${liquidation ? "liquidation" : "dissolution"}`,
        detail: liquidation ? "Le liquidateur doit vendre les actifs : à contacter (professionnel)" : "Dissolution : les biens de la société vont être vendus ou partagés",
        lien: premier(l, "url_complete") || "https://www.bodacc.fr",
        score: liquidation ? 5 : 4,
      });
    }
    if (lignes.length < 100) break;
  }
  return { signaux: out };
}

export async function POST(req: Request) {
  const refus = await checkAccess(req);
  if (refus) return NextResponse.json({ error: refus }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const cps: string[] = (Array.isArray(b?.codesPostaux) ? b.codesPostaux : []).map((x: unknown) => String(x).replace(/\D/g, "")).filter((x: string) => x.length === 5).slice(0, 30);
  if (!cps.length) return NextResponse.json({ error: "Choisis au moins un code postal." }, { status: 400 });
  const jours = Math.min(Math.max(Number(b?.jours) || 60, 7), 365);
  const auj = new Date().toISOString().slice(0, 10);
  const depuis = new Date(Date.now() - jours * 86400000).toISOString().slice(0, 10);
  const [d, a, s] = await Promise.all([dpe(cps, depuis, auj), audits(cps, depuis), bodacc(depuis)]);
  return NextResponse.json({
    depuis,
    signaux: [...a.signaux, ...s.signaux, ...d.signaux],
    sources: { dpe: d.erreur ?? d.signaux.length, audit: a.erreur ?? a.signaux.length, bodacc: s.erreur ?? s.signaux.length },
  });
}

/** Contrôle technique : les champs renvoyés par chaque source, sans aucune ligne. */
export async function GET(req: Request) {
  const diag = new URL(req.url).searchParams.get("diag");
  if (diag === "2") {
    // Essai complet sur Toulouse, 60 jours : nombres et titres seulement, sans adresse
    const auj = new Date().toISOString().slice(0, 10);
    const depuis = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    const t0 = Date.now();
    const [d, a, b] = await Promise.all([dpe(["31000", "31100", "31200", "31300", "31400", "31500"], depuis, auj), audits(["31000", "31100", "31200", "31300", "31400", "31500"], depuis), bodacc(depuis)]);
    const resume = (x: { signaux: SignalPublic[]; erreur?: string }) => ({ n: x.signaux.length, erreur: x.erreur, exemples: x.signaux.slice(0, 3).map((s) => `${s.date} ${s.titre} (score ${s.score})`) });
    return NextResponse.json({ ms: Date.now() - t0, dpe: resume(d), audits: resume(a), bodacc: resume(b) });
  }
  if (diag !== "1") return NextResponse.json({ ok: true });
  const champs = (r: { ok: boolean; status: number; data: any }) => ({ status: r.status, total: r.data?.total ?? r.data?.total_count, champs: Object.keys(r.data?.results?.[0] ?? {}) });
  const depuis = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const id = await idAudits();
  const where = `numerodepartement="31" AND dateparution>=date'${depuis}'`;
  return NextResponse.json({
    dpe: await Promise.all((await idDpe()).map(async (id) => ({ id, ...champs(await lignesAdeme(id, "date_reception_dpe", "code_postal_ban", ["31000"], depuis, 1)) }))),
    audits: { id, ...(id ? champs(await json(`${ADEME}/${id}/lines?size=1`)) : {}) },
    bodacc: champs(await json(`${BODACC}?where=${encodeURIComponent(where)}&limit=1`)),
  });
}
