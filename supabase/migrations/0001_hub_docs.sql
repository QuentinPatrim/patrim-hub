-- PATRIM Hub : un document JSON par objet (bien, contact, rdv, estimation, tâche, contenu, briefing)
create table if not exists public.hub_docs (
  id          uuid primary key,
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind        text not null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists hub_docs_user_kind_idx on public.hub_docs(user_id, kind);

alter table public.hub_docs enable row level security;
drop policy if exists hub_docs_select on public.hub_docs;
drop policy if exists hub_docs_insert on public.hub_docs;
drop policy if exists hub_docs_update on public.hub_docs;
drop policy if exists hub_docs_delete on public.hub_docs;
create policy hub_docs_select on public.hub_docs for select using ((select auth.uid()) = user_id);
create policy hub_docs_insert on public.hub_docs for insert with check ((select auth.uid()) = user_id);
create policy hub_docs_update on public.hub_docs for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy hub_docs_delete on public.hub_docs for delete using ((select auth.uid()) = user_id);
