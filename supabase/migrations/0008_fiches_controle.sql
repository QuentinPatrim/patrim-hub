-- PATRIM Hub Transaction : évaluation du risque anti-blanchiment saisie dans
-- l'appli par le conseiller (demande de Quentin du 28/10/2026), au lieu de
-- cocher le PDF imprimé puis de le scanner.
-- Rangée à côté des réponses du client, jamais renvoyée par le lien public.

alter table public.hub_fiches add column if not exists controle jsonb not null default '{}'::jsonb;
