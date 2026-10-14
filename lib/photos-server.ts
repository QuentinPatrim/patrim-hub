import type { SupabaseClient } from "@supabase/supabase-js";

/* Photos des biens : stockées dans Supabase Storage (seau « photos-biens »),
   sous un chemin impossible à deviner. Côté serveur uniquement. */

const SEAU = "photos-biens";
let seauPret = false;

async function preparerSeau(db: SupabaseClient) {
  if (seauPret) return;
  const { data } = await db.storage.getBucket(SEAU);
  if (!data) await db.storage.createBucket(SEAU, { public: true, fileSizeLimit: "6MB", allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] });
  seauPret = true;
}

/** Enregistre une image (base64, sans préfixe data:) et renvoie son adresse publique. */
export async function stockerPhoto(db: SupabaseClient, chemin: string, base64: string, type = "image/jpeg") {
  await preparerSeau(db);
  const octets = Buffer.from(base64.replace(/^data:[^,]+,/, ""), "base64");
  if (octets.length < 2000) throw new Error("Image vide ou illisible");
  const { error } = await db.storage.from(SEAU).upload(chemin, octets, { contentType: type, upsert: true, cacheControl: "31536000" });
  if (error) throw new Error(error.message);
  return db.storage.from(SEAU).getPublicUrl(chemin).data.publicUrl;
}
