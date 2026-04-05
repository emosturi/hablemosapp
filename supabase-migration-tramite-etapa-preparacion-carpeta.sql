-- Nueva etapa 11 «Preparación de carpeta de cierre»; las etapas que antes eran 11–13 pasan a 12–14.
-- Requisito: ya aplicado supabase-migration-clientes-tramite-etapas.sql (columnas tramite_etapa_actual / tramite_etapas_fechas).
-- Ejecutar una vez en el SQL Editor de Supabase.

alter table public.clientes drop constraint if exists clientes_tramite_etapa_actual_check;

-- Reasignar fechas guardadas por índice de etapa (orden inverso para no pisar claves).
update public.clientes c
set tramite_etapas_fechas =
  (c.tramite_etapas_fechas - '13') || jsonb_build_object('14', c.tramite_etapas_fechas->'13')
where c.tramite_etapas_fechas ? '13';

update public.clientes c
set tramite_etapas_fechas =
  (c.tramite_etapas_fechas - '12') || jsonb_build_object('13', c.tramite_etapas_fechas->'12')
where c.tramite_etapas_fechas ? '12';

update public.clientes c
set tramite_etapas_fechas =
  (c.tramite_etapas_fechas - '11') || jsonb_build_object('12', c.tramite_etapas_fechas->'11')
where c.tramite_etapas_fechas ? '11';

-- Quienes estaban en etapa 11 o superior avanzan un número (antigua 11→12, …, 13→14).
update public.clientes
set tramite_etapa_actual = tramite_etapa_actual + 1
where tramite_etapa_actual is not null and tramite_etapa_actual > 10;

alter table public.clientes add constraint clientes_tramite_etapa_actual_check
  check (tramite_etapa_actual >= 1 and tramite_etapa_actual <= 14);

comment on column public.clientes.tramite_etapa_actual is 'Etapa en curso (1-14). Las anteriores se consideran completadas en la UI.';
