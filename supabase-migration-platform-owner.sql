-- Plataforma: cuenta propietaria y estado administrativo de asesores.
-- Ejecutar en Supabase SQL Editor.

create table if not exists public.platform_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.asesor_cuentas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_enabled boolean not null default true,
  telegram_reminders_enabled boolean not null default true,
  subscription_plan text check (subscription_plan in ('mensual', 'anual') or subscription_plan is null),
  subscription_status text check (
    subscription_status in ('trial', 'active', 'past_due', 'canceled', 'none') or subscription_status is null
  ),
  current_period_end timestamptz null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_asesor_cuentas_status on public.asesor_cuentas (subscription_status);

alter table public.platform_owners enable row level security;
alter table public.asesor_cuentas enable row level security;

drop policy if exists "platform_owners_self_select" on public.platform_owners;
create policy "platform_owners_self_select"
  on public.platform_owners for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "asesor_cuentas_self_select" on public.asesor_cuentas;
create policy "asesor_cuentas_self_select"
  on public.asesor_cuentas for select
  to authenticated
  using (user_id = auth.uid());

comment on table public.platform_owners is 'Usuarios propietarios de plataforma con acceso a panel owner.';
comment on table public.asesor_cuentas is 'Estado administrativo y suscripción por asesor.';
