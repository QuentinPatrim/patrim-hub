-- PATRIM Hub : suppression des fiches partagées par l'équipe (demande et accord de Quentin du 21/10/2026).
-- Jusqu'ici, seul le compte qui avait créé une fiche pouvait la supprimer. Le titulaire
-- et le responsable voient pourtant les propriétaires de toute l'équipe : une fiche en
-- double créée par un collègue revenait après chaque actualisation.
-- Désormais, le titulaire et le responsable peuvent supprimer les fiches contact qu'ils
-- voient. Biens, estimations et documents restent réservés au compte qui les a créés.

drop policy if exists hub_docs_delete on public.hub_docs;
create policy hub_docs_delete on public.hub_docs for delete to authenticated
  using (
    (select auth.uid()) = user_id
    or (
      kind = 'contacts'
      and public.hub_role() in ('titulaire', 'responsable')
      and public.hub_peut_voir(id, user_id, kind, data)
    )
  );
