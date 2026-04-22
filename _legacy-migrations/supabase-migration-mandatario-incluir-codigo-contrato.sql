-- Opción «incluir código de asesor en el N° del contrato» (pension.html / mis-datos-mandatario.html).
-- Se guarda como clave booleana dentro de asesor_mandatario_perfil.datos (jsonb).
-- No requiere ALTER TABLE: el tipo jsonb ya admite la clave.
--
-- Ejecutar en Supabase SQL Editor después de supabase-migration-asesor-mandatario-perfil.sql

comment on table public.asesor_mandatario_perfil is
  'JSON datos del asesor para pension.html: mandatario (rut, nombres, etc.), poliza, contrato_anexos, incluirCodigoAsesorEnNumeroContrato (boolean, default true en app).';

-- Filas que ya tenían perfil antes del switch: mismo comportamiento histórico (incluir código).
update public.asesor_mandatario_perfil
set
  datos = coalesce(datos, '{}'::jsonb)
    || jsonb_build_object('incluirCodigoAsesorEnNumeroContrato', true),
  updated_at = now()
where not (coalesce(datos, '{}'::jsonb) ? 'incluirCodigoAsesorEnNumeroContrato');
