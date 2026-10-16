-- PATRIM Hub : accès de l'équipe
-- Chaque document reste au compte qui l'a créé (user_id). Les autres comptes
-- de l'équipe le voient selon leur rôle :
--   titulaire   : (Quentin) gère les accès ; voit les biens, propriétaires et
--                 estimations des collègues, jamais leurs prospects.
--   responsable : (Julien) voit et modifie les biens, propriétaires et
--                 estimations de toute l'équipe ; jamais les acquéreurs,
--                 prospects, rendez-vous, tâches ni briefings des autres.
--   collegue    : (Clément) ne voit que ses propres documents, plus ce que le
--                 propriétaire d'un document lui a partagé (hub_partages).
--                 Un bien partagé donne aussi accès à ses propriétaires.
-- Un document modifié par un autre membre garde toujours son propriétaire.

create table if not exists public.hub_equipe (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('titulaire', 'responsable', 'collegue')),
  prenom      text not null default '',
  nom         text not null default '',
  titre       text,
  tel         text,
  created_at  timestamptz not null default now()
);
alter table public.hub_equipe enable row level security;

create table if not exists public.hub_partages (
  doc_id      uuid not null references public.hub_docs(id) on delete cascade,
  membre_id   uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (doc_id, membre_id)
);
create index if not exists hub_partages_membre_idx on public.hub_partages(membre_id);
alter table public.hub_partages enable row level security;

-- Rôle du compte connecté (null si hors équipe)
create or replace function public.hub_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.hub_equipe where user_id = (select auth.uid())
$$;

-- Ce qui peut être mis en commun : biens, estimations et fiches propriétaires.
-- Acquéreurs, prospects (même vendeurs), rendez-vous, tâches, briefings, profil : jamais.
create or replace function public.hub_commun(p_kind text, p_data jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case p_kind
    when 'biens' then true
    when 'estimations' then true
    when 'contacts' then coalesce(p_data->'roles' ? 'vendeur', false)
    else false
  end
$$;

create or replace function public.hub_peut_voir(p_id uuid, p_owner uuid, p_kind text, p_data jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select
    p_owner = (select auth.uid())
    or (
      public.hub_commun(p_kind, p_data)
      and public.hub_role() in ('titulaire', 'responsable')
      and exists (select 1 from public.hub_equipe e where e.user_id = p_owner)
    )
    or exists (select 1 from public.hub_partages s where s.doc_id = p_id and s.membre_id = (select auth.uid()))
    or (
      p_kind = 'contacts'
      and coalesce(p_data->'roles' ? 'vendeur', false)
      and exists (
        select 1 from public.hub_partages s
        join public.hub_docs b on b.id = s.doc_id and b.kind = 'biens'
        where s.membre_id = (select auth.uid()) and coalesce(b.data->'vendeurIds', '[]'::jsonb) ? p_id::text
      )
    )
$$;

-- Le propriétaire d'un document ne change jamais (l'appli renvoie l'id de celui qui modifie)
create or replace function public.hub_garde_proprietaire() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  return new;
end
$$;
drop trigger if exists hub_docs_garde_proprietaire on public.hub_docs;
create trigger hub_docs_garde_proprietaire before update on public.hub_docs
  for each row execute function public.hub_garde_proprietaire();

drop policy if exists hub_docs_select on public.hub_docs;
drop policy if exists hub_docs_update on public.hub_docs;
create policy hub_docs_select on public.hub_docs for select to authenticated
  using (public.hub_peut_voir(id, user_id, kind, data));
create policy hub_docs_update on public.hub_docs for update to authenticated
  using (public.hub_peut_voir(id, user_id, kind, data))
  with check (public.hub_peut_voir(id, user_id, kind, data));
-- insert et delete : inchangés, réservés au propriétaire

-- Équipe : chaque membre voit la liste (prénom, nom, rôle) ; modifiée seulement côté serveur
drop policy if exists hub_equipe_select on public.hub_equipe;
create policy hub_equipe_select on public.hub_equipe for select to authenticated
  using (public.hub_role() is not null);

-- Partages : décidés par le propriétaire du document
drop policy if exists hub_partages_select on public.hub_partages;
drop policy if exists hub_partages_insert on public.hub_partages;
drop policy if exists hub_partages_delete on public.hub_partages;
create policy hub_partages_select on public.hub_partages for select to authenticated
  using (membre_id = (select auth.uid()) or exists (select 1 from public.hub_docs d where d.id = doc_id and d.user_id = (select auth.uid())));
create policy hub_partages_insert on public.hub_partages for insert to authenticated
  with check (exists (select 1 from public.hub_docs d where d.id = doc_id and d.user_id = (select auth.uid()))
              and exists (select 1 from public.hub_equipe e where e.user_id = membre_id));
create policy hub_partages_delete on public.hub_partages for delete to authenticated
  using (exists (select 1 from public.hub_docs d where d.id = doc_id and d.user_id = (select auth.uid())));

revoke all on public.hub_equipe, public.hub_partages from anon;
grant select on public.hub_equipe to authenticated;
grant select, insert, delete on public.hub_partages to authenticated;
revoke execute on function public.hub_role(), public.hub_peut_voir(uuid, uuid, text, jsonb) from anon;

-- Le titulaire de l'appli
insert into public.hub_equipe (user_id, role, prenom, nom, titre, tel)
select id, 'titulaire', 'Quentin', 'Delsol', 'Conseiller en vente', '06 52 45 96 54'
from auth.users where lower(email) = 'quentin.delsol@patrim.fr'
on conflict (user_id) do nothing;
