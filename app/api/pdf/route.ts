import { utilisateur } from "@/lib/auth-server";

/* Fabrique le PDF d'un document du Hub (offre, mandat, bail, fiche…) avec le même
   moteur partout : la page telle qu'elle est affichée est envoyée ici, ouverte dans
   un Chrome du serveur et enregistrée en A4. Le résultat ne dépend plus du
   téléphone (Safari ajoutait ses propres marges et réduisait la feuille).
   Rien n'est gardé : le document est rendu puis oublié.
   POST { html, nom } (compte connecté obligatoire) → application/pdf. */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_HTML = 4_000_000;
const refus = (error: string, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

async function navigateur() {
  const puppeteer = (await import("puppeteer-core")).default;
  const local = process.env.CHROME_PATH;
  if (local) return puppeteer.launch({ executablePath: local, args: ["--no-sandbox"] });
  const chromium = (await import("@sparticuz/chromium")).default;
  return puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args });
}

const nomFichier = (v: unknown) =>
  (typeof v === "string" ? v : "document")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w .,()'-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "document";

export async function POST(req: Request) {
  const local = !process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!local && !(await utilisateur(req))) return refus("Connexion requise.", 401);

  const corps = (await req.json().catch(() => null)) as { html?: unknown; nom?: unknown } | null;
  const html = corps?.html;
  if (typeof html !== "string" || !html || html.length > MAX_HTML) return refus("Document illisible.", 400);
  const origine = new URL(req.url).origin;

  const nav = await navigateur();
  try {
    const page = await nav.newPage();
    // Le document ne fait rien d'autre que s'afficher : pas de script, et seules les
    // ressources de la page (styles, polices, images) sont chargées.
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (r) => {
      const u = r.url();
      const memeSite = u.startsWith(origine + "/");
      const ressource = ["stylesheet", "font", "image"].includes(r.resourceType());
      if (u.startsWith("data:") || (ressource && (memeSite || u.startsWith("https://")))) r.continue();
      else r.abort();
    });
    await page.setViewport({ width: 1200, height: 1600 });
    await page.emulateMediaType("print");
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    await page.waitForNetworkIdle({ idleTime: 300, timeout: 15_000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nomFichier(corps?.nom)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return refus("Le PDF n'a pas pu être préparé.", 500);
  } finally {
    await nav.close();
  }
}
