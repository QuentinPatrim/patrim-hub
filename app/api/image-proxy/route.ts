import { utilisateur } from "@/lib/auth-server";

/* GET /api/image-proxy?u=… : relit une photo d'un autre site (patrim.fr, cartes…) pour que le
   téléphone puisse la mettre dans le PDF de l'avis de valeur. Réservé à l'utilisateur connecté. */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await utilisateur(req))) return new Response("Connexion requise", { status: 401 });
  const u = new URL(req.url).searchParams.get("u") || "";
  let cible: URL;
  try {
    cible = new URL(u);
  } catch {
    return new Response("Adresse invalide", { status: 400 });
  }
  if (cible.protocol !== "https:" || /^[\d.]+$|^\[|localhost/i.test(cible.hostname)) return new Response("Adresse refusée", { status: 400 });
  try {
    const r = await fetch(cible, { headers: { "user-agent": "Mozilla/5.0 PATRIM Hub" }, cache: "no-store" });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !type.startsWith("image/")) return new Response("Image introuvable", { status: 404 });
    const corps = await r.arrayBuffer();
    if (corps.byteLength > 12_000_000) return new Response("Image trop lourde", { status: 413 });
    return new Response(corps, { headers: { "content-type": type, "cache-control": "private, max-age=600" } });
  } catch {
    return new Response("Image injoignable", { status: 502 });
  }
}
