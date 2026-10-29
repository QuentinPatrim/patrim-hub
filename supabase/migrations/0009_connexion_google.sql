-- Connexion Google (Gmail + Agenda) de chaque utilisateur du Hub.
-- Les autorisations Google ne sont lues et écrites que par le serveur (clé de service) :
-- RLS activé sans aucune règle, donc rien n'est lisible depuis le téléphone ou le navigateur.

create table if not exists public.hub_google (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  refresh_token text not null,
  scopes text,
  connecte_le timestamptz not null default now(),
  derniere_synchro timestamptz
);

alter table public.hub_google enable row level security;
revoke all on public.hub_google from anon, authenticated;
