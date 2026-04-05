-- Datos del mandatario (asesor) para autorellenar el formulario de pensión por usuario.
-- Ejecutar en Supabase SQL Editor.

create table if not exists public.asesor_mandatario_perfil (
  user_id uuid primary key references auth.users (id) on delete cascade,
  datos jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.asesor_mandatario_perfil is
  'JSON datos del asesor para pension.html: campos mandatario (rut, nombres, etc.), opcional poliza (registroPoliza, compania, numeroPoliza, fechas), contrato_anexos, incluirCodigoAsesorEnNumeroContrato (boolean).';

alter table public.asesor_mandatario_perfil enable row level security;

drop policy if exists "asesor_mandatario_perfil_select_own" on public.asesor_mandatario_perfil;
create policy "asesor_mandatario_perfil_select_own"
  on public.asesor_mandatario_perfil for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "asesor_mandatario_perfil_insert_own" on public.asesor_mandatario_perfil;
create policy "asesor_mandatario_perfil_insert_own"
  on public.asesor_mandatario_perfil for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "asesor_mandatario_perfil_update_own" on public.asesor_mandatario_perfil;
create policy "asesor_mandatario_perfil_update_own"
  on public.asesor_mandatario_perfil for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
