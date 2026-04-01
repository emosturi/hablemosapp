-- Tickets de soporte para asesores.
-- Ejecutar en Supabase SQL Editor.

create table if not exists public.soporte_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  advisor_email text null,
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  owner_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz null
);

create index if not exists idx_soporte_tickets_user_id on public.soporte_tickets (user_id);
create index if not exists idx_soporte_tickets_status on public.soporte_tickets (status);
create index if not exists idx_soporte_tickets_created_at on public.soporte_tickets (created_at desc);

alter table public.soporte_tickets enable row level security;

drop policy if exists "soporte_tickets_self_select" on public.soporte_tickets;
create policy "soporte_tickets_self_select"
  on public.soporte_tickets for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "soporte_tickets_self_insert" on public.soporte_tickets;
create policy "soporte_tickets_self_insert"
  on public.soporte_tickets for insert
  to authenticated
  with check (user_id = auth.uid());

comment on table public.soporte_tickets is 'Tickets de soporte creados por asesores desde la plataforma.';
