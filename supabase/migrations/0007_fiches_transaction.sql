-- PATRIM Hub Transaction : fiches vendeur et acquéreur remplies en ligne
-- (demande de Quentin du 28/10/2026).
--   - Fiche vendeur : envoyée avant le mandat (état civil, régime matrimonial,
--     propriétaires, bien, origine de propriété, vérifications anti-blanchiment).
--   - Fiche acquéreur : envoyée quand un acquéreur veut faire une offre sur un
--     bien (identité, financement, origine des fonds, vérifications).
--   - Un lien secret par fiche. La base ne garde que l'empreinte (SHA-256) du
--     lien, jamais le lien lui-même.
--   - Aucune règle d'accès : ni les clients, ni les comptes de l'équipe ne
--     lisent cette table directement. Tout passe par le serveur du Hub (clé
--     serveur), qui vérifie le lien ou le compte avant de répondre.
--   - Les fiches sont effacées un an après leur création (l'agence garde le
--     PDF dans son dossier anti-blanchiment).

create table if not exists public.hub_fiches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  bien_id     text not null,
  kind        text not null check (kind in ('vendeur', 'acquereur')),
  token_hash  text not null unique check (char_length(token_hash) = 64),
  contexte    jsonb not null default '{}'::jsonb,
  prenom      text not null default '' check (char_length(prenom) <= 80),
  reponses    jsonb not null default '{}'::jsonb check (pg_column_size(reponses) < 40000),
  statut      text not null default 'a_remplir' check (statut in ('a_remplir', 'en_cours', 'termine')),
  ferme       boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days'
);
create index if not exists hub_fiches_bien_idx on public.hub_fiches(bien_id);
create index if not exists hub_fiches_cree_idx on public.hub_fiches(created_at);

alter table public.hub_fiches enable row level security;
revoke all on public.hub_fiches from anon, authenticated;
