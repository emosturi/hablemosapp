-- Ciclo de suscripción: mora (3 días tras vencimiento) y bypass administrativo.
-- Ejecutar en Supabase SQL Editor.
-- Recomendación: las transiciones se aplican al cargar la app (Netlify advisor-subscription-sync).
-- Opcional (respaldo): job diario con pg_cron o Edge Function que reproduzca las mismas reglas
-- si necesitas estados correctos sin que el asesor abra la app (la app ya sincroniza al cargar).

alter table public.asesor_cuentas
  add column if not exists subscription_grace_until timestamptz null;

alter table public.asesor_cuentas
  add column if not exists subscription_bypass boolean not null default false;

comment on column public.asesor_cuentas.subscription_grace_until is
  'Fin del periodo de mora (current_period_end + 3 días UTC). Null si no está en mora.';

comment on column public.asesor_cuentas.subscription_bypass is
  'Si true, el asesor tiene acceso completo sin depender del estado de suscripción (solo owner).';
