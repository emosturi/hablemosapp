-- Control de edición del bloque mandatario en «Mis datos (mandatario)»: máx. 1 campo por guardado y 15 días entre ediciones.
-- La lógica principal está en mis-datos-mandatario.html; esta columma persiste el punto de control.
-- Ejecutar en Supabase SQL Editor.

alter table public.asesor_mandatario_perfil
  add column if not exists mandatario_datos_checkpoint_at timestamptz null;

comment on column public.asesor_mandatario_perfil.mandatario_datos_checkpoint_at is
  'Tras un perfil mandatario completo: marca la última edición restringida (máx. 1 campo / 15 días). NULL en filas nuevas o antes de migrar.';

-- Perfiles ya completos: usar updated_at como punto de partida del plazo de 15 días.
update public.asesor_mandatario_perfil
set mandatario_datos_checkpoint_at = updated_at
where mandatario_datos_checkpoint_at is null
  and datos is not null
  and coalesce(trim(datos->>'rut'), '') <> ''
  and coalesce(trim(datos->>'nombres'), '') <> '';
