-- Hasta 3 enlaces de referido activos por asesor; descuento acumulado máximo 45% (3×15%) por tipo de plan.
-- Requisitos: supabase-migration-referidos-asesores.sql (y ajustes de descuento) ya aplicados.
-- Ejecutar una vez en Supabase SQL Editor.

-- -----------------------------------------------------------------------------
-- 1) Tope de descuento 45% en asesor_cuentas
-- -----------------------------------------------------------------------------
update public.asesor_cuentas
set referral_discount_percent_mensual = 45
where referral_discount_percent_mensual > 45;

update public.asesor_cuentas
set referral_discount_percent_anual = 45
where referral_discount_percent_anual > 45;

alter table public.asesor_cuentas
  drop constraint if exists asesor_cuentas_referral_discount_mensual_chk;

alter table public.asesor_cuentas
  add constraint asesor_cuentas_referral_discount_mensual_chk
  check (referral_discount_percent_mensual >= 0 and referral_discount_percent_mensual <= 45);

alter table public.asesor_cuentas
  drop constraint if exists asesor_cuentas_referral_discount_anual_chk;

alter table public.asesor_cuentas
  add constraint asesor_cuentas_referral_discount_anual_chk
  check (referral_discount_percent_anual >= 0 and referral_discount_percent_anual <= 45);

comment on column public.asesor_cuentas.referral_discount_percent_mensual is
  'Descuento % acumulado por referidos que pagaron plan mensual (máx. 45, 3×15%).';

comment on column public.asesor_cuentas.referral_discount_percent_anual is
  'Descuento % acumulado por referidos que pagaron plan anual (máx. 45, 3×15%).';

comment on column public.asesor_cuentas.referral_code is
  'Código principal en asesor_cuentas (sincronizado con el primer enlace); enlaces adicionales en asesor_referral_links.';

comment on table public.referral_conversions is
  'Pagos aprobados que sumaron +15% de descuento al referidor (tope acumulado 45% por tipo de plan).';

-- -----------------------------------------------------------------------------
-- 2) Tabla de enlaces (códigos) por asesor
-- -----------------------------------------------------------------------------
create table if not exists public.asesor_referral_links (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  active boolean not null default true,
  created_at timestamptz not null default now (),
  constraint asesor_referral_links_code_upper_chk check (code = upper(trim(code)))
);

create unique index if not exists idx_asesor_referral_links_code on public.asesor_referral_links (code);

create index if not exists idx_asesor_referral_links_user on public.asesor_referral_links (user_id);

create index if not exists idx_asesor_referral_links_user_active
  on public.asesor_referral_links (user_id)
  where active = true;

comment on table public.asesor_referral_links is
  'Enlaces login.html?ref=CODE por asesor; máximo 3 filas con active=true por user_id.';

-- -----------------------------------------------------------------------------
-- 3) Trigger: código automático y máximo 3 activos por usuario
-- -----------------------------------------------------------------------------
create or replace function public.asesor_referral_links_biud ()
returns trigger
language plpgsql
as $$
declare
  n int;
  candidate text;
  attempts int := 0;
begin
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.code is distinct from old.code) then
    if new.code is null or length(trim(new.code)) = 0 then
      loop
        candidate := upper(substr(md5(random()::text || clock_timestamp()::text || random()::text), 1, 8));
        exit when not exists (select 1 from public.asesor_referral_links o where o.code = candidate)
          and not exists (
            select 1 from public.asesor_cuentas a
            where a.referral_code is not null and upper(trim(a.referral_code)) = candidate
          );
        attempts := attempts + 1;
        if attempts > 40 then
          candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
          exit;
        end if;
      end loop;
      new.code := candidate;
    else
      new.code := upper(trim(new.code));
    end if;
  end if;

  if new.active then
    select count(*)::int into n
    from public.asesor_referral_links
    where user_id = new.user_id
      and active = true
      and id is distinct from new.id;

    if n >= 3 then
      raise exception 'max_active_referral_links: máximo 3 enlaces activos por asesor';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_asesor_referral_links_biud on public.asesor_referral_links;

create trigger trg_asesor_referral_links_biud
  before insert or update on public.asesor_referral_links
  for each row
  execute function public.asesor_referral_links_biud ();

-- -----------------------------------------------------------------------------
-- 4) Sincronizar primer enlace desde asesor_cuentas.referral_code (solo si no hay filas)
-- -----------------------------------------------------------------------------
create or replace function public.asesor_referral_links_sync_from_cuentas ()
returns trigger
language plpgsql
as $$
begin
  if new.referral_code is null or length(trim(new.referral_code)) = 0 then
    return new;
  end if;
  if exists (select 1 from public.asesor_referral_links where user_id = new.user_id limit 1) then
    return new;
  end if;
  insert into public.asesor_referral_links (user_id, code, active)
  values (new.user_id, upper(trim(new.referral_code)), true);
  return new;
exception
  when unique_violation then
    return new;
end;
$$;

drop trigger if exists trg_asesor_cuentas_sync_referral_link on public.asesor_cuentas;

create trigger trg_asesor_cuentas_sync_referral_link
  after insert or update of referral_code on public.asesor_cuentas
  for each row
  execute function public.asesor_referral_links_sync_from_cuentas ();

-- -----------------------------------------------------------------------------
-- 5) Rellenar enlaces desde códigos existentes
-- -----------------------------------------------------------------------------
insert into public.asesor_referral_links (user_id, code, active)
select a.user_id, upper(trim(a.referral_code)), true
from public.asesor_cuentas a
where a.referral_code is not null
  and length(trim(a.referral_code)) > 0
  and not exists (
    select 1 from public.asesor_referral_links l where l.user_id = a.user_id
  )
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- 6) RLS
-- -----------------------------------------------------------------------------
alter table public.asesor_referral_links enable row level security;

drop policy if exists "asesor_referral_links_select_own" on public.asesor_referral_links;
drop policy if exists "asesor_referral_links_insert_own" on public.asesor_referral_links;
drop policy if exists "asesor_referral_links_update_own" on public.asesor_referral_links;

create policy "asesor_referral_links_select_own"
  on public.asesor_referral_links for select to authenticated
  using (user_id = auth.uid ());

create policy "asesor_referral_links_insert_own"
  on public.asesor_referral_links for insert to authenticated
  with check (user_id = auth.uid ());

create policy "asesor_referral_links_update_own"
  on public.asesor_referral_links for update to authenticated
  using (user_id = auth.uid ())
  with check (user_id = auth.uid ());

grant select, insert, update on public.asesor_referral_links to authenticated;
