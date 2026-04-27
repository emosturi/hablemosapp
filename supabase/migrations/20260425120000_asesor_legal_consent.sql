-- Registro del consentimiento aceptado por el asesor (términos, cookies, buscoasesor.cl).
-- Uso desde buscoasesor.cl: consultar esta tabla con service_role o desde un backend con clave segura
-- (la clave anon/authenticated no puede leer filas de otros usuarios por RLS).

create table if not exists public.asesor_legal_consent (
  user_id uuid primary key references auth.users (id) on delete cascade,
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.asesor_legal_consent is
  'Versión de términos/cookies/tratamiento aceptada por el asesor; sirve para habilitar exposición en buscoasesor.cl y trazabilidad.';

create or replace function public.asesor_legal_consent_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists asesor_legal_consent_updated_at on public.asesor_legal_consent;
create trigger asesor_legal_consent_updated_at
  before update on public.asesor_legal_consent
  for each row
  execute function public.asesor_legal_consent_set_updated_at();

alter table public.asesor_legal_consent enable row level security;

drop policy if exists "asesor_legal_consent_select_own" on public.asesor_legal_consent;
create policy "asesor_legal_consent_select_own"
  on public.asesor_legal_consent
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "asesor_legal_consent_insert_own" on public.asesor_legal_consent;
create policy "asesor_legal_consent_insert_own"
  on public.asesor_legal_consent
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "asesor_legal_consent_update_own" on public.asesor_legal_consent;
create policy "asesor_legal_consent_update_own"
  on public.asesor_legal_consent
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on table public.asesor_legal_consent to authenticated;
grant all on table public.asesor_legal_consent to service_role;
