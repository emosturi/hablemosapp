-- Campos extra para cónyuge: nacionalidad y sexo
-- Ejecutar en Supabase si tu tabla clientes ya existe

alter table public.clientes add column if not exists conyuge_nacionalidad text;
alter table public.clientes add column if not exists conyuge_sexo text;

