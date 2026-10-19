-- PATRIM Hub : compteur de mandats de l'agence, partagé par toute l'équipe.
-- Un seul compteur global, jamais remis à zéro (même d'une année sur l'autre).
-- Dernier numéro attribué aujourd'hui : 1022. Le prochain sera donc 1023.
-- L'incrémentation est atomique côté serveur (fonction PostgreSQL) : deux
-- conseillers qui demandent un numéro en même temps obtiennent deux numéros
-- différents, quel que soit le compte (Quentin, Julien, Clément…).

create table if not exists public.hub_compteurs (
  cle         text primary key,
  valeur      bigint not null default 0,
  updated_at  timestamptz not null default now()
);

insert into public.hub_compteurs (cle, valeur) values ('mandat', 1022)
on conflict (cle) do nothing;

alter table public.hub_compteurs enable row level security;

-- Aucune politique de lecture/écriture directe : le compteur passe uniquement
-- par la fonction ci-dessous (sécurisée par definer) appelée par l'API du Hub.

create or replace function public.hub_prochain_numero(p_cle text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_num bigint;
begin
  update public.hub_compteurs
     set valeur = valeur + 1, updated_at = now()
   where cle = p_cle
  returning valeur into v_num;
  if v_num is null then
    insert into public.hub_compteurs (cle, valeur) values (p_cle, 1)
    on conflict (cle) do update set valeur = public.hub_compteurs.valeur + 1, updated_at = now()
    returning valeur into v_num;
  end if;
  return v_num;
end;
$$;

revoke all on function public.hub_prochain_numero(text) from public, authenticated;
