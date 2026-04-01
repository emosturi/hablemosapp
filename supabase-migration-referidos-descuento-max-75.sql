-- Tope de descuento por referidos: 75% (5 bonificaciones de 15% por tipo de plan).
-- Ejecutar en Supabase si ya aplicaste supabase-migration-referidos-asesores.sql con tope 90%.

update public.asesor_cuentas
set referral_discount_percent_mensual = 75,
    updated_at = now()
where referral_discount_percent_mensual > 75;

update public.asesor_cuentas
set referral_discount_percent_anual = 75,
    updated_at = now()
where referral_discount_percent_anual > 75;

alter table public.asesor_cuentas
  drop constraint if exists asesor_cuentas_referral_discount_mensual_chk;

alter table public.asesor_cuentas
  add constraint asesor_cuentas_referral_discount_mensual_chk
  check (referral_discount_percent_mensual >= 0 and referral_discount_percent_mensual <= 75);

alter table public.asesor_cuentas
  drop constraint if exists asesor_cuentas_referral_discount_anual_chk;

alter table public.asesor_cuentas
  add constraint asesor_cuentas_referral_discount_anual_chk
  check (referral_discount_percent_anual >= 0 and referral_discount_percent_anual <= 75);

comment on column public.asesor_cuentas.referral_discount_percent_mensual is 'Descuento % acumulado por referidos que pagaron plan mensual (máx. 75, 5×15%).';
comment on column public.asesor_cuentas.referral_discount_percent_anual is 'Descuento % acumulado por referidos que pagaron plan anual (máx. 75, 5×15%).';

comment on table public.referral_conversions is 'Pagos aprobados que generaron +15% de descuento al referidor (tope acumulado 75% por tipo de plan).';
