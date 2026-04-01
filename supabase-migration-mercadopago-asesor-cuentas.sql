-- Mercado Pago: idempotencia en webhook (no reprocesar el mismo payment id).
-- Ejecutar en Supabase SQL Editor si ya existe public.asesor_cuentas.

alter table public.asesor_cuentas
  add column if not exists mercadopago_last_payment_id text null;

comment on column public.asesor_cuentas.mercadopago_last_payment_id is
  'Último ID de pago de Mercado Pago aplicado a esta cuenta (evita duplicados al reintentar el webhook).';
