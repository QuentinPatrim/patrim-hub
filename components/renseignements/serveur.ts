import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { cleServiceSupabase } from "@/lib/env";
import { CONSERVATION_JOURS, type Dossier, type LogementPublic, type PersonneDossier, type Reponses, type RoleDossier, type StatutPersonne } from "./dossier";

/* ============================================================
   Dossiers de renseignements : accès serveur uniquement.
   Les tables hub_dossiers et hub_dossier_personnes n'ont aucune
   règle d'accès (RLS sans politique) : seule la clé serveur les lit.
   Le lien d'une personne contient un jeton aléatoire de 256 bits ;
   la base n'en garde que l'empreinte (SHA-256), le lien lui-même
   n'est stocké nulle part.
   Sans Supabase, en développement uniquement, les dossiers restent
   en mémoire (pour essayer l'appli) ; en production : indisponible.
   ============================================================ */

export const nouveauJeton = () => randomBytes(32).toString("base64url");
export const empreinte = (jeton: string) => createHash("sha256").update(jeton).digest("hex");
export const jetonValide = (j: string) => /^[A-Za-z0-9_-]{43}$/.test(j);

export interface DossierServeur extends Dossier {
  userId: string;
}
export interface PersonneServeur extends PersonneDossier {
  dossierId: string;
}

type RowDossier = { id: string; user_id: string; bien_id: string; logement: LogementPublic; ferme: boolean; created_at: string; expires_at: string };
type RowPersonne = {
  id: string;
  dossier_id: string;
  role: RoleDossier;
  principal: boolean;
  garant_de: string | null;
  prenom: string;
  reponses: Reponses;
  statut: StatutPersonne;
  updated_at: string;
  token_hash?: string;
};

const personneDe = (r: RowPersonne): PersonneServeur => ({
  id: r.id,
  dossierId: r.dossier_id,
  role: r.role,
  principal: r.principal,
  garantDe: r.garant_de ?? undefined,
  prenom: r.prenom,
  statut: r.statut,
  reponses: r.reponses ?? {},
  maj: r.updated_at,
});
const dossierDe = (d: RowDossier, ps: RowPersonne[]): DossierServeur => ({
  id: d.id,
  userId: d.user_id,
  bienId: d.bien_id,
  logement: d.logement,
  ferme: d.ferme,
  creeLe: d.created_at,
  expire: d.expires_at,
  personnes: ps
    .filter((p) => p.dossier_id === d.id)
    .map(personneDe)
    .sort((a, b) => Number(b.principal) - Number(a.principal) || (a.role === "garant" ? 1 : 0) - (b.role === "garant" ? 1 : 0)),
});

export interface Depot {
  parEmpreinte(h: string): Promise<{ personne: PersonneServeur; dossier: DossierServeur } | null>;
  dossier(id: string): Promise<DossierServeur | null>;
  personne(id: string): Promise<PersonneServeur | null>;
  dossiersDuBien(bienId: string): Promise<DossierServeur[]>;
  creerDossier(x: { userId: string; bienId: string; logement: LogementPublic; expire: string }): Promise<string>;
  ajouterPersonne(x: { dossierId: string; role: RoleDossier; principal: boolean; garantDe?: string; prenom: string; empreinte: string }): Promise<string>;
  majPersonne(id: string, patch: { reponses?: Reponses; statut?: StatutPersonne; prenom?: string; empreinte?: string }): Promise<void>;
  retirerPersonne(id: string): Promise<void>;
  majDossier(id: string, patch: { ferme?: boolean; expire?: string }): Promise<void>;
  supprimerDossier(id: string): Promise<void>;
  purger(): Promise<void>;
}

const limiteConservation = () => new Date(Date.now() - CONSERVATION_JOURS * 86400_000).toISOString();

function depotSupabase(url: string, cle: string): Depot {
  const db = createClient(url, cle, { auth: { persistSession: false } });
  const D = "hub_dossiers";
  const P = "hub_dossier_personnes";
  const COLS_P = "id,dossier_id,role,principal,garant_de,prenom,reponses,statut,updated_at";
  const ok = <T>(r: { data: T; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  const charger = async (rows: RowDossier[]) => {
    if (!rows.length) return [];
    const ps = ok(await db.from(P).select(COLS_P).in("dossier_id", rows.map((d) => d.id))) as RowPersonne[];
    return rows.map((d) => dossierDe(d, ps));
  };
  return {
    async parEmpreinte(h) {
      const p = ok(await db.from(P).select(COLS_P).eq("token_hash", h).maybeSingle()) as RowPersonne | null;
      if (!p) return null;
      const d = ok(await db.from(D).select("*").eq("id", p.dossier_id).maybeSingle()) as RowDossier | null;
      if (!d) return null;
      const [dossier] = await charger([d]);
      return { personne: personneDe(p), dossier };
    },
    async dossier(id) {
      const d = ok(await db.from(D).select("*").eq("id", id).maybeSingle()) as RowDossier | null;
      return d ? (await charger([d]))[0] : null;
    },
    async personne(id) {
      const p = ok(await db.from(P).select(COLS_P).eq("id", id).maybeSingle()) as RowPersonne | null;
      return p ? personneDe(p) : null;
    },
    async dossiersDuBien(bienId) {
      const rows = ok(await db.from(D).select("*").eq("bien_id", bienId).order("created_at", { ascending: false }).limit(100)) as RowDossier[];
      return charger(rows);
    },
    async creerDossier({ userId, bienId, logement, expire }) {
      const r = ok(await db.from(D).insert({ user_id: userId, bien_id: bienId, logement, expires_at: expire }).select("id").single()) as { id: string };
      return r.id;
    },
    async ajouterPersonne(x) {
      const r = ok(
        await db
          .from(P)
          .insert({ dossier_id: x.dossierId, role: x.role, principal: x.principal, garant_de: x.garantDe ?? null, prenom: x.prenom, token_hash: x.empreinte })
          .select("id")
          .single()
      ) as { id: string };
      return r.id;
    },
    async majPersonne(id, patch) {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.reponses) row.reponses = patch.reponses;
      if (patch.statut) row.statut = patch.statut;
      if (patch.prenom != null) row.prenom = patch.prenom;
      if (patch.empreinte) row.token_hash = patch.empreinte;
      ok(await db.from(P).update(row).eq("id", id));
    },
    async retirerPersonne(id) {
      ok(await db.from(P).update({ garant_de: null }).eq("garant_de", id));
      ok(await db.from(P).delete().eq("id", id));
    },
    async majDossier(id, patch) {
      const row: Record<string, unknown> = {};
      if (patch.ferme != null) row.ferme = patch.ferme;
      if (patch.expire) row.expires_at = patch.expire;
      ok(await db.from(D).update(row).eq("id", id));
    },
    async supprimerDossier(id) {
      ok(await db.from(D).delete().eq("id", id));
    },
    async purger() {
      ok(await db.from(D).delete().lt("created_at", limiteConservation()));
    },
  };
}

/* Mémoire : développement sans Supabase uniquement. */
type Memoire = { d: Map<string, RowDossier>; p: Map<string, RowPersonne & { token_hash: string }> };
function depotMemoire(): Depot {
  const g = globalThis as unknown as { __renseignements?: Memoire };
  const m = (g.__renseignements ??= { d: new Map(), p: new Map() });
  const tous = () => [...m.p.values()];
  const now = () => new Date().toISOString();
  return {
    async parEmpreinte(h) {
      const p = tous().find((x) => x.token_hash === h);
      const d = p && m.d.get(p.dossier_id);
      return p && d ? { personne: personneDe(p), dossier: dossierDe(d, tous()) } : null;
    },
    async dossier(id) {
      const d = m.d.get(id);
      return d ? dossierDe(d, tous()) : null;
    },
    async personne(id) {
      const p = m.p.get(id);
      return p ? personneDe(p) : null;
    },
    async dossiersDuBien(bienId) {
      return [...m.d.values()].filter((d) => d.bien_id === bienId).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((d) => dossierDe(d, tous()));
    },
    async creerDossier({ userId, bienId, logement, expire }) {
      const id = crypto.randomUUID();
      m.d.set(id, { id, user_id: userId, bien_id: bienId, logement, ferme: false, created_at: now(), expires_at: expire });
      return id;
    },
    async ajouterPersonne(x) {
      const id = crypto.randomUUID();
      m.p.set(id, { id, dossier_id: x.dossierId, role: x.role, principal: x.principal, garant_de: x.garantDe ?? null, prenom: x.prenom, reponses: {}, statut: "a_remplir", updated_at: now(), token_hash: x.empreinte });
      return id;
    },
    async majPersonne(id, patch) {
      const p = m.p.get(id);
      if (!p) return;
      m.p.set(id, {
        ...p,
        reponses: patch.reponses ?? p.reponses,
        statut: patch.statut ?? p.statut,
        prenom: patch.prenom ?? p.prenom,
        token_hash: patch.empreinte ?? p.token_hash,
        updated_at: now(),
      });
    },
    async retirerPersonne(id) {
      for (const p of tous()) if (p.garant_de === id) p.garant_de = null;
      m.p.delete(id);
    },
    async majDossier(id, patch) {
      const d = m.d.get(id);
      if (d) m.d.set(id, { ...d, ferme: patch.ferme ?? d.ferme, expires_at: patch.expire ?? d.expires_at });
    },
    async supprimerDossier(id) {
      m.d.delete(id);
      for (const p of tous()) if (p.dossier_id === id) m.p.delete(p.id);
    },
    async purger() {
      const limite = limiteConservation();
      for (const d of [...m.d.values()]) if (d.created_at < limite) await this.supprimerDossier(d.id);
    },
  };
}

export function depot(): Depot | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = cleServiceSupabase();
  if (url && cle) return depotSupabase(url, cle);
  if (!url && process.env.NODE_ENV !== "production") return depotMemoire();
  return null;
}

/** En-têtes de toutes les réponses : jamais en cache, jamais indexées. */
export const ENTETES = { "cache-control": "no-store, max-age=0", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer" };
