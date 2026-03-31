-- Flag para habilitar envío de recordatorios por Telegram por asesor (sin fila en asesor_cuentas = se mantiene comportamiento actual).
-- Ejecutar en Supabase SQL Editor si ya existe public.asesor_cuentas.

alter table public.asesor_cuentas
  add column if not exists telegram_reminders_enabled boolean not null default true;

comment on column public.asesor_cuentas.telegram_reminders_enabled is
  'Si es false, process-reminders no envía Telegram para ese asesor (resto de la app igual).';
