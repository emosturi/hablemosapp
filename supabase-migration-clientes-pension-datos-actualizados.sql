-- Datos de pensión actualizados al cierre (no reemplazan pension_compania / pension_monto / etc. de la preparación)
-- Ejecutar en Supabase SQL Editor (una vez).

alter table public.clientes add column if not exists pension_datos_actualizados jsonb;

comment on column public.clientes.pension_datos_actualizados is 'JSON con datos vigentes al marcar pensionado si hubo cambios respecto a la preparación. Ej.: {"compania":"...","monto":"123.45","modalidad":"...","periodo_garantizado":true}.';
