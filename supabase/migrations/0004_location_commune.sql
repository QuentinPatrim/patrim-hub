-- PATRIM Hub Location : biens à louer et propriétaires communs à toute l'équipe
-- (demande de Quentin du 20/10/2026).
--   - Un bien du Hub Location (data.transaction = 'location') est visible et
--     modifiable par tous les membres de l'équipe, quel que soit leur rôle.
--     Ces biens viennent des annonces de location de patrim.fr (bouton
--     « Actualiser » et tâche du matin) ou sont ajoutés à la main.
--   - Les fiches propriétaires (contacts avec le rôle vendeur) forment un
--     annuaire commun, pour la vente comme pour la location.
-- Inchangé : acquéreurs, locataires, prospects, rendez-vous, tâches,
-- briefings et biens en vente restent réglés comme avant (0002_equipe.sql).

create or replace function public.hub_peut_voir(p_id uuid, p_owner uuid, p_kind text, p_data jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select
    p_owner = (select auth.uid())
    or (
      public.hub_commun(p_kind, p_data)
      and public.hub_role() in ('titulaire', 'responsable')
      and exists (select 1 from public.hub_equipe e where e.user_id = p_owner)
    )
    or (
      public.hub_role() is not null
      and exists (select 1 from public.hub_equipe e where e.user_id = p_owner)
      and (
        (p_kind = 'biens' and p_data->>'transaction' = 'location')
        or (p_kind = 'contacts' and coalesce(p_data->'roles' ? 'vendeur', false))
      )
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

create index if not exists hub_docs_location_idx on public.hub_docs ((data->>'transaction')) where kind = 'biens';
