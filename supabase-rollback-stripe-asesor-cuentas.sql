-- Revierte columnas `stripe_customer_id` y `stripe_subscription_id` en `asesor_cuentas`.
-- Ejecutar en Supabase SQL Editor SOLO si esas columnas existen (p. ej. tras una prueba con Stripe).
-- Si nunca las creaste, no ejecutes este script.

drop index if exists public.idx_asesor_cuentas_stripe_customer;

alter table public.asesor_cuentas
  drop column if exists stripe_subscription_id,
  drop column if exists stripe_customer_id;
