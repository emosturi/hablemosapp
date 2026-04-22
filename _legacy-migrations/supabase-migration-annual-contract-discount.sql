-- Descuento % permanente solo para plan anual (auspicios, influencers, etc.).
-- No se resetea al pagar (a diferencia de referral_discount_percent_anual).
-- Ejecutar en Supabase SQL Editor si ya existe public.asesor_cuentas.

alter table public.asesor_cuentas
  add column if not exists annual_contract_discount_percent numeric(5, 2) not null default 0;

alter table public.asesor_cuentas
  drop constraint if exists asesor_cuentas_annual_contract_discount_chk;

alter table public.asesor_cuentas
  add constraint asesor_cuentas_annual_contract_discount_chk
  check (annual_contract_discount_percent >= 0 and annual_contract_discount_percent <= 100);

comment on column public.asesor_cuentas.annual_contract_discount_percent is
  'Descuento % permanente solo al pagar plan anual, calculado sobre el precio listado (MERCADOPAGO_PLAN_ANUAL_CLP). Junto con referidos se cobra el mínimo entre precio tras referidos y precio con solo este descuento sobre la lista. No se borra al aprobar el pago.';
