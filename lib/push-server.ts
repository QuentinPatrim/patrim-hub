import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ============================================================
   Notifications sur le téléphone (Web Push), sans dépendance :
   signature VAPID (ES256) et chiffrement aes128gcm (RFC 8291).
   Les abonnements sont des lignes « push » de hub_docs, une par
   appareil. Côté serveur uniquement. Ne contacte jamais un client :
   les notifications vont au conseiller lui-même.
   ============================================================ */

const b64u = (b: Buffer) => b.toString("base64url");
const deB64u = (s: string) => Buffer.from(s, "base64url");

export const clePubliqueVapid = () => process.env.VAPID_PUBLIC_KEY?.trim();
const clePriveeVapid = () => process.env.VAPID_PRIVATE_KEY?.trim();
const SUJET = "mailto:contact@patrim.fr";

export interface Abonnement {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
export interface Notif {
  titre: string;
  texte: string;
  /** Page de l'appli à ouvrir au toucher. */
  url?: string;
  /** Une notification du même tag remplace la précédente. */
  tag?: string;
  /** Sans son ni vibration (briefing du matin). */
  discret?: boolean;
}

function jwtVapid(audience: string) {
  const pub = deB64u(clePubliqueVapid()!);
  const key = createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: clePriveeVapid()!, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: "jwk",
  });
  const enTete = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const corps = b64u(Buffer.from(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUJET })));
  const sig = sign("sha256", Buffer.from(`${enTete}.${corps}`), { key, dsaEncoding: "ieee-p1363" });
  return `${enTete}.${corps}.${b64u(sig)}`;
}

const hkdf = (sel: Buffer, ikm: Buffer, info: Buffer, n: number) => {
  const prk = createHmac("sha256", sel).update(ikm).digest();
  return createHmac("sha256", prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, n);
};

/** Chiffre le message pour l'appareil (aes128gcm, un seul bloc). */
function chiffrer(a: Abonnement, message: Buffer) {
  const clientPub = deB64u(a.keys.p256dh);
  const authSecret = deB64u(a.keys.auth);
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const serveurPub = ecdh.getPublicKey();
  const partage = ecdh.computeSecret(clientPub);
  const ikm = hkdf(authSecret, partage, Buffer.concat([Buffer.from("WebPush: info\0"), clientPub, serveurPub]), 32);
  const sel = randomBytes(16);
  const cek = hkdf(sel, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(sel, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const c = createCipheriv("aes-128-gcm", cek, nonce);
  const chiffre = Buffer.concat([c.update(Buffer.concat([message, Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([sel, rs, Buffer.from([serveurPub.length]), serveurPub, chiffre]);
}

/** Envoie à un appareil. Renvoie le code HTTP (404 ou 410 : abonnement périmé). */
export async function envoyerPush(a: Abonnement, n: Notif): Promise<number> {
  if (!clePubliqueVapid() || !clePriveeVapid()) return 0;
  const audience = new URL(a.endpoint).origin;
  const res = await fetch(a.endpoint, {
    method: "POST",
    headers: {
      TTL: String(24 * 3600),
      Urgency: "high",
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      Authorization: `vapid t=${jwtVapid(audience)}, k=${clePubliqueVapid()}`,
    },
    body: new Uint8Array(chiffrer(a, Buffer.from(JSON.stringify(n)))),
  });
  return res.status;
}

/** Envoie à tous les appareils d'un compte et retire les abonnements périmés. Renvoie le nombre d'appareils joints. */
export async function notifier(db: SupabaseClient, userId: string, n: Notif): Promise<number> {
  if (!clePubliqueVapid() || !clePriveeVapid()) return 0;
  const { data } = await db.from("hub_docs").select("id,data").eq("user_id", userId).eq("kind", "push");
  let ok = 0;
  for (const r of (data ?? []) as { id: string; data: Abonnement }[]) {
    try {
      const code = await envoyerPush(r.data, n);
      if (code === 404 || code === 410) await db.from("hub_docs").delete().eq("id", r.id);
      else if (code >= 200 && code < 300) ok++;
    } catch {
      /* appareil injoignable : on réessaiera à la prochaine notification */
    }
  }
  return ok;
}
