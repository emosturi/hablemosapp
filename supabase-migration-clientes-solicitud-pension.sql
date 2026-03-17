-- Migración: guardar secciones del formulario de solicitud de pensión en clientes (sin mandatario)
-- Ejecutar en Supabase SQL Editor si tu tabla public.clientes ya existe.

alter table public.clientes add column if not exists solicitud_tipo_pension text;
alter table public.clientes add column if not exists solicitud_cambio_modalidad_tramite boolean;
alter table public.clientes add column if not exists solicitud_numero_beneficiarios int;
alter table public.clientes add column if not exists solicitud_beneficiarios jsonb default '[]';
alter table public.clientes add column if not exists solicitud_antecedentes jsonb default '{}';
alter table public.clientes add column if not exists solicitud_autorizaciones jsonb default '{}';
alter table public.clientes add column if not exists solicitud_certificados jsonb default '{}';

