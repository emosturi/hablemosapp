-- Recordatorios automáticos por etapa de trámite
-- Ejecutar en Supabase: SQL Editor > New query > Run

alter table public.recordatorios
  add column if not exists auto_generado boolean not null default false;

alter table public.recordatorios
  add column if not exists auto_key text;

create unique index if not exists ux_recordatorios_cliente_autokey
  on public.recordatorios (cliente_id, auto_key)
  where auto_key is not null;

comment on column public.recordatorios.auto_generado is 'true si fue generado automáticamente por reglas de etapas';
comment on column public.recordatorios.auto_key is 'clave única de regla automática por cliente';
