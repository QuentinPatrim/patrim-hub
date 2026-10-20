-- PATRIM Hub Location : fiche de renseignements remplie en ligne par les
-- candidats locataires et leurs garants (demande de Quentin du 20/10/2026).
--   - Un dossier par candidature, rattaché à un bien à louer.
--   - Une ligne par personne (locataire, conjoint ou colocataire, garant),
--     chacune avec son propre lien secret. La base ne garde que l'empreinte
--     (SHA-256) du lien, jamais le lien lui-même.
--   - Aucune règle d'accès : ni les candidats, ni les comptes de l'équipe ne
--     lisent ces tables directement. Tout passe par le serveur du Hub (clé
--     serveur), qui vérifie le lien ou le compte avant de répondre.
--   - Les dossiers sont effacés trois mois après leur création.

create table if not exists public.hub_dossiers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  bien_id     text not null,
  logement    jsonb not null default '{}'::jsonb,
  ferme       boolean not null default false,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days'
);
create index if not exists hub_dossiers_bien_idx on public.hub_dossiers(bien_id);
create index if not exists hub_dossiers_cree_idx on public.hub_dossiers(created_at);

create table if not exists public.hub_dossier_personnes (
  id          uuid primary key default gen_random_uuid(),
  dossier_id  uuid not null references public.hub_dossiers(id) on delete cascade,
  token_hash  text not null unique check (char_length(token_hash) = 64),
  role        text not null check (role in ('locataire', 'colocataire', 'garant')),
  principal   boolean not null default false,
  garant_de   uuid references public.hub_dossier_personnes(id) on delete set null,
  prenom      text not null default '' check (char_length(prenom) <= 80),
  reponses    jsonb not null default '{}'::jsonb check (pg_column_size(reponses) < 20000),
  statut      text not null default 'a_remplir' check (statut in ('a_remplir', 'en_cours', 'termine')),
  updated_at  timestamptz not null default now()
);
create index if not exists hub_dossier_personnes_dossier_idx on public.hub_dossier_personnes(dossier_id);

alter table public.hub_dossiers enable row level security;
alter table public.hub_dossier_personnes enable row level security;
revoke all on public.hub_dossiers from anon, authenticated;
revoke all on public.hub_dossier_personnes from anon, authenticated;
