import { createClient } from "@supabase/supabase-js";
import { cleServiceSupabase } from "@/lib/env";
import { empreinte, jetonValide, nouveauJeton, ENTETES } from "@/components/renseignements/serveur";
import { CONSERVATION_JOURS, type Controle, type ContextePublic, type Fiche, type KindFiche, type Reponses, type StatutFiche } from "./fiche";

/* ============================================================
   Fiches vendeur et acquéreur : accès serveur uniquement.
   La table hub_fiches n'a aucune règle d'accès (RLS sans politique) :
   seule la clé serveur la lit. Le lien contient un jeton aléatoire de
   256 bits ; la base n'en garde que l'empreinte (SHA-256).
   Sans Supabase, en développement uniquement, les fiches restent en
   mémoire (pour essayer l'appli) ; en production : indisponible.
   ============================================================ */

export { empreinte, jetonValide, nouveauJeton, ENTETES };

export interface FicheServeur extends Fiche {
  userId: string;
}

type Row = {
  id: string;
  user_id: string;
  bien_id: string;
  kind: KindFiche;
  contexte: ContextePublic;
  prenom: string;
  reponses: Reponses;
  controle?: Controle;
  statut: StatutFiche;
  ferme: boolean;
  created_at: string;
  updated_at: string;
  expires_at: string;
  token_hash?: string;
};

const ficheDe = (r: Row): FicheServeur => ({
  id: r.id,
  userId: r.user_id,
  kind: r.kind,
  bienId: r.bien_id,
  contexte: r.contexte ?? { titre: "" },
  prenom: r.prenom,
  statut: r.statut,
  reponses: r.reponses ?? {},
  controle: r.controle ?? {},
  ferme: r.ferme,
  creeLe: r.created_at,
  expire: r.expires_at,
  maj: r.updated_at,
});

export interface DepotFiches {
  parEmpreinte(h: string): Promise<FicheServeur | null>;
  fiche(id: string): Promise<FicheServeur | null>;
  duBien(bienId: string, kind?: KindFiche): Promise<FicheServeur[]>;
  creer(x: { userId: string; bienId: string; kind: KindFiche; contexte: ContextePublic; prenom: string; reponses?: Reponses; empreinte: string; expire: string }): Promise<string>;
  maj(id: string, patch: { reponses?: Reponses; controle?: Controle; statut?: StatutFiche; prenom?: string; empreinte?: string; ferme?: boolean; expire?: string }): Promise<void>;
  supprimer(id: string): Promise<void>;
  purger(): Promise<void>;
}

const limiteConservation = () => new Date(Date.now() - CONSERVATION_JOURS * 86400_000).toISOString();
// Toutes les colonnes : la colonne « controle » (migration 0008) peut manquer sans tout bloquer.
const COLS = "*";

function ligneMaj(patch: Parameters<DepotFiches["maj"]>[1]) {
  const row: Record<string, unknown> = {};
  if (patch.reponses || patch.statut || patch.prenom != null) row.updated_at = new Date().toISOString();
  if (patch.reponses) row.reponses = patch.reponses;
  if (patch.controle) row.controle = patch.controle;
  if (patch.statut) row.statut = patch.statut;
  if (patch.prenom != null) row.prenom = patch.prenom;
  if (patch.empreinte) row.token_hash = patch.empreinte;
  if (patch.ferme != null) row.ferme = patch.ferme;
  if (patch.expire) row.expires_at = patch.expire;
  return row;
}

function depotSupabase(url: string, cle: string): DepotFiches {
  const db = createClient(url, cle, { auth: { persistSession: false } });
  const T = "hub_fiches";
  const ok = <X>(r: { data: X; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  return {
    async parEmpreinte(h) {
      const r = ok(await db.from(T).select(COLS).eq("token_hash", h).maybeSingle()) as Row | null;
      return r ? ficheDe(r) : null;
    },
    async fiche(id) {
      const r = ok(await db.from(T).select(COLS).eq("id", id).maybeSingle()) as Row | null;
      return r ? ficheDe(r) : null;
    },
    async duBien(bienId, kind) {
      let q = db.from(T).select(COLS).eq("bien_id", bienId);
      if (kind) q = q.eq("kind", kind);
      const rows = ok(await q.order("created_at", { ascending: false }).limit(100)) as Row[];
      return rows.map(ficheDe);
    },
    async creer(x) {
      const r = ok(
        await db
          .from(T)
          .insert({ user_id: x.userId, bien_id: x.bienId, kind: x.kind, contexte: x.contexte, prenom: x.prenom, reponses: x.reponses ?? {}, token_hash: x.empreinte, expires_at: x.expire })
          .select("id")
          .single()
      ) as { id: string };
      return r.id;
    },
    async maj(id, patch) {
      ok(await db.from(T).update(ligneMaj(patch)).eq("id", id));
    },
    async supprimer(id) {
      ok(await db.from(T).delete().eq("id", id));
    },
    async purger() {
      ok(await db.from(T).delete().lt("created_at", limiteConservation()));
    },
  };
}

/* Mémoire : développement sans Supabase uniquement. */
function depotMemoire(): DepotFiches {
  const g = globalThis as unknown as { __fiches?: Map<string, Row & { token_hash: string }> };
  const m = (g.__fiches ??= new Map());
  const now = () => new Date().toISOString();
  return {
    async parEmpreinte(h) {
      const r = [...m.values()].find((x) => x.token_hash === h);
      return r ? ficheDe(r) : null;
    },
    async fiche(id) {
      const r = m.get(id);
      return r ? ficheDe(r) : null;
    },
    async duBien(bienId, kind) {
      return [...m.values()]
        .filter((r) => r.bien_id === bienId && (!kind || r.kind === kind))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(ficheDe);
    },
    async creer(x) {
      const id = crypto.randomUUID();
      m.set(id, {
        id,
        user_id: x.userId,
        bien_id: x.bienId,
        kind: x.kind,
        contexte: x.contexte,
        prenom: x.prenom,
        reponses: x.reponses ?? {},
        statut: "a_remplir",
        ferme: false,
        created_at: now(),
        updated_at: now(),
        expires_at: x.expire,
        token_hash: x.empreinte,
      });
      return id;
    },
    async maj(id, patch) {
      const r = m.get(id);
      if (!r) return;
      const l = ligneMaj(patch);
      m.set(id, { ...r, ...(l as Partial<Row>), token_hash: (l.token_hash as string) ?? r.token_hash });
    },
    async supprimer(id) {
      m.delete(id);
    },
    async purger() {
      const limite = limiteConservation();
      for (const r of [...m.values()]) if (r.created_at < limite) m.delete(r.id);
    },
  };
}

export function depotFiches(): DepotFiches | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = cleServiceSupabase();
  if (url && cle) return depotSupabase(url, cle);
  if (!url && process.env.NODE_ENV !== "production") return depotMemoire();
  return null;
}
