-- Tabla para almacenar el número de contrato asignado por RUT del mandante.
-- Un mismo RUT siempre obtiene el mismo número (no se incrementa al regenerar el contrato).
-- Ejecutar en Supabase: SQL Editor > New query > Pegar y Run

create table if not exists public.numeros_contrato (
  rut_mandante text primary key,
  numero_secuencial int not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.numeros_contrato is 'Número secuencial de contrato asignado por RUT del mandante (formulario de pensión).';

alter table public.numeros_contrato enable row level security;

create policy "Autenticados pueden leer numeros_contrato"
  on public.numeros_contrato for select
  using (auth.role() = 'authenticated');

create policy "Autenticados pueden insertar numeros_contrato"
  on public.numeros_contrato for insert
  with check (auth.role() = 'authenticated');
