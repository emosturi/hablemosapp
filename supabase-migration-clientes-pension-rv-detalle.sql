-- Detalle adicional de renta vitalicia en preparación de cierre (período garantizado en meses, tipo de aumento, etc.)

alter table public.clientes
  add column if not exists pension_rv_detalle jsonb;

comment on column public.clientes.pension_rv_detalle is
  'JSON preparación cierre RV con PG=Sí: meses_periodo_garantizado, tipo_aumento (sin_aumento|aumento_temporal|aumento_sobrevivencia), porcentaje_aumento, periodo_aumento_meses (solo temporal). NULL si no aplica.';
