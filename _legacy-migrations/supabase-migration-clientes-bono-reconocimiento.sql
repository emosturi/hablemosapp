-- Campo explícito para saber si el cliente posee Bono de Reconocimiento
-- Ejecutar en Supabase: SQL Editor > New query > Run

alter table public.clientes
  add column if not exists posee_bono_reconocimiento boolean;

comment on column public.clientes.posee_bono_reconocimiento is 'Indica si el cliente posee bono de reconocimiento (Sí/No del formulario).';
