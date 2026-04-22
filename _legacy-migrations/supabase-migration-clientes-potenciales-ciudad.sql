-- Añadir ciudad (opcional) a clientes potenciales
-- Ejecutar en Supabase: SQL Editor > New query > Pegar y Run

alter table public.clientes_potenciales add column if not exists ciudad text;
