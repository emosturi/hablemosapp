-- Permite que un platform owner habilite edición libre de datos mandatario (sin 15 días / 1 campo).
ALTER TABLE public.asesor_mandatario_perfil
  ADD COLUMN IF NOT EXISTS mandatario_edicion_sin_restriccion boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.asesor_mandatario_perfil.mandatario_edicion_sin_restriccion IS
  'Si es true, el asesor puede editar todos los datos mandatario sin límite de tiempo ni un solo campo por guardado. Solo owners (panel o service role) deben cambiar este valor; el cliente no lo envía en el upsert.';
