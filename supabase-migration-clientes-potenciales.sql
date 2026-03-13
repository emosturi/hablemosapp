-- Tabla de clientes potenciales (solo nombre y teléfono)
-- Ejecutar en Supabase: SQL Editor > New query > Pegar y Run

create table if not exists public.clientes_potenciales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text not null,
  created_at timestamptz default now()
);

create index if not exists idx_clientes_potenciales_created_at on public.clientes_potenciales (created_at desc);

alter table public.clientes_potenciales enable row level security;

-- Solo usuarios autenticados pueden insertar
create policy "Solo autenticados pueden insertar clientes potenciales"
  on public.clientes_potenciales for insert
  with check (auth.role() = 'authenticated');

-- Solo usuarios autenticados pueden ver el listado
create policy "Solo autenticados pueden leer clientes potenciales"
  on public.clientes_potenciales for select
  using (auth.role() = 'authenticated');

-- Solo usuarios autenticados pueden eliminar
create policy "Solo autenticados pueden eliminar clientes potenciales"
  on public.clientes_potenciales for delete
  using (auth.role() = 'authenticated');
