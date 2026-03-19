-- Agrega flags para mostrar documentos generados en el listado de clientes
-- Ejecutar en Supabase: SQL Editor > New query > Pegar y Run

alter table public.clientes add column if not exists tiene_contrato boolean not null default false;
alter table public.clientes add column if not exists tiene_mandato_corto boolean not null default false;
alter table public.clientes add column if not exists tiene_mandato_largo boolean not null default false;

comment on column public.clientes.tiene_contrato is 'True si se ha generado contrato para el cliente';
comment on column public.clientes.tiene_mandato_corto is 'True si se ha generado mandato corto para el cliente';
comment on column public.clientes.tiene_mandato_largo is 'True si se ha generado mandato largo para el cliente';
