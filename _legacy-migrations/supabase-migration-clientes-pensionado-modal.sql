-- =============================================================================
-- Pensionado (etapa final de la línea de tiempo)
-- Agrega columnas a public.clientes para guardar datos cuando el cliente
-- pasa a ser pensionado desde ver-cliente.html.
--
-- Ejecutar en Supabase: SQL Editor > New query > Pegar y Run
-- =============================================================================

alter table public.clientes
  add column if not exists pensionado boolean not null default false;

alter table public.clientes
  add column if not exists pension_compania text;

alter table public.clientes
  add column if not exists pension_monto text;

alter table public.clientes
  add column if not exists pension_modalidad text;

-- Solo aplica cuando la modalidad es renta vitalicia (inmediata/diferida o combinada).
alter table public.clientes
  add column if not exists pension_periodo_garantizado boolean;

comment on column public.clientes.pensionado is 'Indica si el cliente ya pasó a la condición de pensionado.';
comment on column public.clientes.pension_compania is 'Compañía seleccionada para el proceso de pensión (renta vitalicia) o AFP.';
comment on column public.clientes.pension_monto is 'Monto de la pensión ingresado al finalizar la línea de tiempo.';
comment on column public.clientes.pension_modalidad is 'Modalidad de pensión seleccionada al finalizar la línea de tiempo.';
comment on column public.clientes.pension_periodo_garantizado is 'Periodo garantizado (Sí/No) cuando corresponde a renta vitalicia.';

