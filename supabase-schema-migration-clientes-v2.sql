-- Migración: añadir columnas al formulario de clientes (conyuge, hijos, empleador, datos bancarios)
-- Ejecutar en Supabase SQL Editor si ya tienes la tabla clientes creada.

alter table public.clientes add column if not exists conyuge_nombres text;
alter table public.clientes add column if not exists conyuge_apellido_paterno text;
alter table public.clientes add column if not exists conyuge_apellido_materno text;
alter table public.clientes add column if not exists conyuge_rut text;
alter table public.clientes add column if not exists conyuge_fecha_nacimiento date;
alter table public.clientes add column if not exists conyuge_fecha_matrimonio date;
alter table public.clientes add column if not exists conyuge_lugar_matrimonio text;

alter table public.clientes add column if not exists tiene_hijos_menores_24 boolean;
alter table public.clientes add column if not exists hijos jsonb default '[]';

alter table public.clientes add column if not exists empleador_razon_social text;
alter table public.clientes add column if not exists empleador_rut text;
alter table public.clientes add column if not exists empleador_direccion text;
alter table public.clientes add column if not exists empleador_telefono text;
alter table public.clientes add column if not exists empleador_email text;

alter table public.clientes add column if not exists banco text;
alter table public.clientes add column if not exists tipo_cuenta text;
alter table public.clientes add column if not exists numero_cuenta text;
