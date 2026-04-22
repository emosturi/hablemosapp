-- =============================================================================
-- Checklist del caso (por cliente)
-- Guarda el estado (true/false) de los ítems del checklist en public.clientes.
--
-- Ejecutar en Supabase: SQL Editor > New query > Pegar y Run
-- =============================================================================

alter table public.clientes
  add column if not exists checklist_caso jsonb not null default '{}'::jsonb;

comment on column public.clientes.checklist_caso is
  'Checklist de documentos/pasos del caso. JSON con claves por ítem, ej. {\"copia_ci\":true,\"contrato_firmado\":false}.';

