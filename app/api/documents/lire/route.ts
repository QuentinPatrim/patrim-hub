import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { checkAccess, complete, parseJson } from "@/lib/ai-server";
import { utilisateur } from "@/lib/auth-server";
import { cleServiceSupabase } from "@/lib/env";

/* POST /api/documents/lire : lecteur de documents d'un bien (PV d'AG, diagnostics,
   titre de propriété, appels de charges, taxe foncière…).
   - { depot: true } → { chemin, token } : dépôt temporaire pour un PDF trop lourd
     pour passer directement (seau privé « lecteur-temp », effacé dès la lecture).
   - { pdf | images | chemin, bien } → { lecture } : ce que dit le document, les
     valeurs à reporter sur la fiche et les points d'attention.
   Le document n'est jamais conservé. Aucune donnée personnelle n'est extraite. */

export const maxDuration = 300;

const SEAU = "lecteur-temp";
let seauPret = false;

function base() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = cleServiceSupabase();
  return url && service ? createClient(url, service, { auth: { persistSession: false } }) : null;
}

async function preparerSeau(db: NonNullable<ReturnType<typeof base>>) {
  if (seauPret) return;
  const { data } = await db.storage.getBucket(SEAU);
  if (!data) await db.storage.createBucket(SEAU, { public: false, fileSizeLimit: "32MB", allowedMimeTypes: ["application/pdf"] });
  seauPret = true;
}

const CONSIGNE = `Tu lis un document du dossier d'un bien à vendre ou à louer, pour le conseiller immobilier. Il peut s'agir d'un procès-verbal d'assemblée générale, d'un ou plusieurs diagnostics (DPE, amiante, plomb, électricité, gaz, termites, état des risques, Carrez), d'un titre de propriété, d'un appel de fonds ou relevé de charges, d'un avis de taxe foncière, d'un règlement de copropriété, d'un pré-état daté, ou d'autre chose.

Règles :
- Ne relève que ce qui est écrit dans le document. N'invente rien, ne complète rien de tête. Si une valeur est ambiguë, mets-la dans les points d'attention plutôt que dans les valeurs.
- N'extrais aucune donnée personnelle : pas de noms de personnes physiques, de dates de naissance, d'adresses personnelles, de situation familiale. Les noms de sociétés (syndic, diagnostiqueur, notaire) sont permis.
- Montants en euros, nombres sans espace ni symbole. Dates au format AAAA-MM-JJ.
- Points d'attention : ce qu'un acquéreur, un notaire ou le conseiller doit savoir (travaux votés ou à venir et leur coût, procédures, impayés du syndicat, ravalement, toiture, ascenseur, fonds travaux, présence d'amiante ou de plomb, anomalies électriques ou gaz, classe F ou G, zone à risque, écart avec la fiche du bien, mention manquante). « alerte » pour ce qui pèse sur le prix ou la vente, « info » sinon.

Réponds uniquement par un objet JSON :
{
  "type": "pv_ag" | "diagnostics" | "titre" | "charges" | "taxe_fonciere" | "reglement" | "pre_etat_date" | "autre",
  "titre": "intitulé court, ex. « PV d'AG du 12/05/2026 »",
  "date": "AAAA-MM-JJ du document, si connue",
  "resume": "3 à 5 phrases simples",
  "fiche": { "surface": nombre (Carrez si copro), "dpe": "A".."G", "ges": "A".."G", "chargesAnnuelles": nombre (part du lot, par an), "taxeFonciere": nombre, "lotsCopro": nombre (lots principaux de la copropriété), "anneeConstruction": nombre, "chauffage": "texte court" },
  "diagnostics": { "dpe" | "amiante" | "plomb" | "termites" | "electricite" | "gaz" | "erp" | "carrez" | "assainissement": { "date": "AAAA-MM-JJ du rapport", "presence": true/false pour amiante et plomb seulement } },
  "dossier": { "syndic": "nom et coordonnées professionnelles", "copropriete": "nom, nombre de lots", "lots": "numéros, nature, tantièmes", "charges": "détail (année, budget, quote-part)", "taxeFonciere": "détail (année)", "dpe": "date, n° ADEME, consommations", "ddt": "diagnostiqueur, date, liste", "occupation": "libre ou loué (loyer, fin de bail)" },
  "travaux": [ { "objet": "…", "montant": nombre total voté, "quotePart": nombre pour le lot si indiquée, "echeance": "AAAA-MM-JJ ou période", "statut": "voté" | "à l'étude" | "refusé" } ],
  "points": [ { "niveau": "alerte" | "info", "texte": "une phrase" } ],
  "questions": [ "question à poser au vendeur ou au syndic, au plus 5" ]
}
N'écris que les clés pour lesquelles le document donne une valeur.`;

export async function POST(req: Request) {
  const refus = await checkAccess(req);
  if (refus) return NextResponse.json({ error: refus }, { status: 401 });
  const b = await req.json().catch(() => ({}));

  if (b?.depot) {
    const db = base();
    const user = await utilisateur(req);
    if (!db || !user) return NextResponse.json({ error: "Le dépôt des gros fichiers demande la connexion au Hub." }, { status: 501 });
    await preparerSeau(db);
    const chemin = `${user.id}/${randomUUID()}.pdf`;
    const { data, error } = await db.storage.from(SEAU).createSignedUploadUrl(chemin);
    if (error || !data) return NextResponse.json({ error: error?.message || "Dépôt impossible" }, { status: 500 });
    return NextResponse.json({ chemin, token: data.token, seau: SEAU });
  }

  let pdf: string | undefined = typeof b?.pdf === "string" ? b.pdf.replace(/^data:[^,]+,/, "") : undefined;
  if (typeof b?.chemin === "string") {
    const db = base();
    const user = await utilisateur(req);
    if (!db || !user || !b.chemin.startsWith(`${user.id}/`)) return NextResponse.json({ error: "Fichier introuvable." }, { status: 403 });
    const { data, error } = await db.storage.from(SEAU).download(b.chemin);
    await db.storage.from(SEAU).remove([b.chemin]);
    if (error || !data) return NextResponse.json({ error: "Fichier introuvable, renvoie-le." }, { status: 404 });
    pdf = Buffer.from(await data.arrayBuffer()).toString("base64");
  }
  const images: { mediaType: string; data: string }[] = Array.isArray(b?.images) ? b.images.slice(0, 12) : [];
  if (!pdf && !images.length) return NextResponse.json({ error: "Aucun document reçu." }, { status: 400 });

  const contenu: Anthropic.ContentBlockParam[] = [
    ...(pdf ? [{ type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: pdf } }] : []),
    ...images.map((im) => ({ type: "image" as const, source: { type: "base64" as const, media_type: (im.mediaType === "image/png" ? "image/png" : "image/jpeg") as "image/jpeg", data: im.data } })),
    {
      type: "text" as const,
      text: `${CONSIGNE}\n\nCe que la fiche du bien indique aujourd'hui (pour repérer les écarts) : ${JSON.stringify(b?.bien ?? {}).slice(0, 2000)}${typeof b?.nom === "string" ? `\nNom du fichier : ${b.nom.slice(0, 120)}` : ""}`,
    },
  ];
  try {
    const text = await complete({ messages: [{ role: "user", content: contenu }], smart: true, effort: "medium", maxTokens: 6000 });
    const lecture = parseJson(text);
    if (!lecture) return NextResponse.json({ error: "Le document n'a pas pu être lu. Essaie avec des photos nettes des pages utiles." }, { status: 502 });
    return NextResponse.json({ lecture });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    return NextResponse.json({ error: /page|too large|too long/i.test(m) ? "Document trop long : garde seulement les pages utiles (100 pages au plus)." : m || "Lecture impossible." }, { status: 500 });
  }
}

/** Contrôle technique : lit un petit PV d'AG fictif généré ici (aucune donnée réelle). GET ?diag=1 */
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("diag") !== "1") return NextResponse.json({ ok: true });
  const lignes = ["PROCES-VERBAL D'ASSEMBLEE GENERALE DU 12/05/2026", "Residence Exemple - 40 lots principaux - Syndic : Cabinet Exemple", "Resolution 8 : ravalement des facades vote, budget 120 000 EUR, appels au 01/01/2027", "Resolution 9 : remplacement de l'ascenseur refuse", "Budget previsionnel 2026 : 48 000 EUR"];
  const flux = `BT /F1 11 Tf 50 780 Td 14 TL ${lignes.map((l) => `(${l}) Tj T*`).join(" ")} ET`;
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const pos: number[] = [];
  objets.forEach((o, i) => {
    pos.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${pos.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const t0 = Date.now();
  try {
    const text = await complete({
      messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(pdf, "latin1").toString("base64") } }, { type: "text", text: CONSIGNE }] }],
      smart: true,
      effort: "medium",
      maxTokens: 6000,
    });
    return NextResponse.json({ ms: Date.now() - t0, lecture: parseJson(text) });
  } catch (e) {
    return NextResponse.json({ ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) });
  }
}
