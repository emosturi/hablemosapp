-- Chat ID de Telegram guardado por el asesor (alternativa/complemento a TELEGRAM_CHAT_BY_PHONE_JSON en Netlify).
-- Ejecutar en Supabase SQL Editor si ya existe public.asesor_cuentas.

alter table public.asesor_cuentas
  add column if not exists telegram_chat_id text,
  add column if not exists telegram_chat_id_updated_at timestamptz;

comment on column public.asesor_cuentas.telegram_chat_id is
  'ID de chat personal de Telegram (solo dígitos). Tiene prioridad sobre TELEGRAM_CHAT_BY_PHONE_JSON al enviar recordatorios.';

comment on column public.asesor_cuentas.telegram_chat_id_updated_at is
  'Última vez que el asesor guardó su chat ID (panel configuración Telegram).';
