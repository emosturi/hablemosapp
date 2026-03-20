-- Etapas del trámite de pensión (línea de tiempo en vista cliente)
-- Ejecutar en Supabase: SQL Editor

alter table public.clientes add column if not exists tramite_etapa_actual smallint not null default 1
  check (tramite_etapa_actual >= 1 and tramite_etapa_actual <= 13);

alter table public.clientes add column if not exists tramite_etapas_fechas jsonb not null default '{}'::jsonb;

comment on column public.clientes.tramite_etapa_actual is 'Etapa en curso (1-13). Las anteriores se consideran completadas en la UI.';
comment on column public.clientes.tramite_etapas_fechas is 'Fechas ISO (YYYY-MM-DD) por índice de etapa completada, ej. {"1":"2025-03-01","2":"2025-03-10"}';
