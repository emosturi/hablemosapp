-- Referidos entre asesores: código único, atribución y descuentos acumulados (15% por referido pagado).
-- Ejecutar en Supabase SQL Editor.

-- Columnas en asesor_cuentas
alter table public.asesor_cuentas
  add column if not exists referral_code text null,
  add column if not exists referral_discount_percent_mensual smallint not null default 0,
  add column if not exists referral_discount_percent_anual smallint not null default 0;

alter table public.asesor_cuentas
  drop constraint if exists asesor_cuentas_referral_discount_mensual_chk;

alter table public.asesor_cuentas
  add constraint asesor_cuentas_referral_discount_mensual_chk
  check (referral_discount_percent_mensual >= 0 and referral_discount_percent_mensual <= 90);

alter table public.asesor_cuentas
  drop constraint if exists asesor_cuentas_referral_discount_anual_chk;

alter table public.asesor_cuentas
  add constraint asesor_cuentas_referral_discount_anual_chk
  check (referral_discount_percent_anual >= 0 and referral_discount_percent_anual <= 90);

create unique index if not exists idx_asesor_cuentas_referral_code
  on public.asesor_cuentas (referral_code)
  where referral_code is not null;

comment on column public.asesor_cuentas.referral_code is 'Código corto para enlaces login.html?ref= (único).';
comment on column public.asesor_cuentas.referral_discount_percent_mensual is 'Descuento % acumulado por referidos que pagaron plan mensual (máx. 90).';
comment on column public.asesor_cuentas.referral_discount_percent_anual is 'Descuento % acumulado por referidos que pagaron plan anual (máx. 90).';

-- Atribución: un solo referidor por asesor referido (primera vinculación válida).
create table if not exists public.referral_attributions (
  referred_user_id uuid primary key references auth.users (id) on delete cascade,
  referrer_user_id uuid not null references auth.users (id) on delete cascade,
  referral_code text not null,
  created_at timestamptz not null default now(),
  constraint referral_attributions_no_self check (referred_user_id <> referrer_user_id)
);

create index if not exists idx_referral_attributions_referrer on public.referral_attributions (referrer_user_id);

alter table public.referral_attributions enable row level security;

comment on table public.referral_attributions is 'Quién refirió a cada asesor; solo el backend (service role) escribe.';

-- Conversiones: un crédito de referido por pago aprobado (idempotencia por payment id).
create table if not exists public.referral_conversions (
  id uuid primary key default gen_random_uuid (),
  mp_payment_id text not null unique,
  referrer_user_id uuid not null references auth.users (id) on delete cascade,
  referred_user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null check (plan in ('mensual', 'anual')),
  created_at timestamptz not null default now()
);

create index if not exists idx_referral_conversions_referrer on public.referral_conversions (referrer_user_id);

alter table public.referral_conversions enable row level security;

comment on table public.referral_conversions is 'Pagos aprobados que generaron +15% de descuento al referidor.';

-- Generar referral_code automáticamente si falta (INSERT/UPDATE).
create or replace function public.asesor_cuentas_set_referral_code ()
returns trigger
language plpgsql
as $$
declare
  candidate text;
  attempts int := 0;
begin
  if new.referral_code is not null and length(trim(new.referral_code)) > 0 then
    new.referral_code := upper(trim(new.referral_code));
    return new;
  end if;
  loop
    candidate := upper(substr(md5(random()::text || clock_timestamp()::text || random()::text), 1, 8));
    exit when not exists (
      select 1
      from public.asesor_cuentas o
      where o.referral_code = candidate
        and o.user_id is distinct from new.user_id
    );
    attempts := attempts + 1;
    if attempts > 40 then
      candidate := upper(replace(gen_random_uuid()::text, '-', ''));
      candidate := substr(candidate, 1, 8);
      exit;
    end if;
  end loop;
  new.referral_code := candidate;
  return new;
end;
$$;

drop trigger if exists trg_asesor_referral_code on public.asesor_cuentas;

create trigger trg_asesor_referral_code
  before insert or update on public.asesor_cuentas
  for each row
  when (new.referral_code is null)
  execute function public.asesor_cuentas_set_referral_code ();

-- Asignar código a filas que ya existían (el trigger corre en UPDATE mientras referral_code sea null).
update public.asesor_cuentas
set updated_at = now()
where referral_code is null;
