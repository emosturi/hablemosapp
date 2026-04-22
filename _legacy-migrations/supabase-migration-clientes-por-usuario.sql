-- =============================================================================
-- Multi-usuario: clientes (y tablas relacionadas) por propietario (auth.uid).
-- Las filas existentes se asignan al usuario con email albistur.ap@gmail.com
--
-- Ejecutar UNA VEZ en Supabase: SQL Editor > New query > Run
-- Requisitos:
--   - Cuenta en Authentication con email albistur.ap@gmail.com (ajusta el email en el bloque DO si hace falta).
--   - Tabla public.numeros_contrato ya creada (supabase-migration-numeros-contrato.sql).
--   - Tablas public.clientes, public.recordatorios, public.clientes_potenciales existentes.
-- =============================================================================

DO $$
DECLARE
  owner_id uuid;
BEGIN
  SELECT id INTO owner_id FROM auth.users WHERE lower(email) = lower('albistur.ap@gmail.com') LIMIT 1;
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'No existe usuario en auth.users con email albistur.ap@gmail.com. Créalo primero o edita el email en este script.';
  END IF;

  -- -------------------------------------------------------------------------
  -- clientes
  -- -------------------------------------------------------------------------
  ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

  UPDATE public.clientes SET user_id = owner_id WHERE user_id IS NULL;

  ALTER TABLE public.clientes ALTER COLUMN user_id SET NOT NULL;
  ALTER TABLE public.clientes ALTER COLUMN user_id SET DEFAULT auth.uid();

  ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_rut_key;

  CREATE UNIQUE INDEX IF NOT EXISTS clientes_user_id_rut_unique ON public.clientes (user_id, rut);

  CREATE INDEX IF NOT EXISTS idx_clientes_user_id ON public.clientes (user_id);

  -- -------------------------------------------------------------------------
  -- clientes_potenciales
  -- -------------------------------------------------------------------------
  ALTER TABLE public.clientes_potenciales ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

  UPDATE public.clientes_potenciales SET user_id = owner_id WHERE user_id IS NULL;

  ALTER TABLE public.clientes_potenciales ALTER COLUMN user_id SET NOT NULL;
  ALTER TABLE public.clientes_potenciales ALTER COLUMN user_id SET DEFAULT auth.uid();

  CREATE INDEX IF NOT EXISTS idx_clientes_potenciales_user_id ON public.clientes_potenciales (user_id);

  -- -------------------------------------------------------------------------
  -- recordatorios (desde cliente o fallback al propietario histórico)
  -- -------------------------------------------------------------------------
  ALTER TABLE public.recordatorios ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

  UPDATE public.recordatorios r
  SET user_id = c.user_id
  FROM public.clientes c
  WHERE r.cliente_id IS NOT NULL AND r.cliente_id = c.id AND r.user_id IS NULL;

  UPDATE public.recordatorios SET user_id = owner_id WHERE user_id IS NULL;

  ALTER TABLE public.recordatorios ALTER COLUMN user_id SET NOT NULL;
  ALTER TABLE public.recordatorios ALTER COLUMN user_id SET DEFAULT auth.uid();

  CREATE INDEX IF NOT EXISTS idx_recordatorios_user_id ON public.recordatorios (user_id);

  -- -------------------------------------------------------------------------
  -- numeros_contrato: clave compuesta (user_id, rut_mandante)
  -- -------------------------------------------------------------------------
  ALTER TABLE public.numeros_contrato ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

  UPDATE public.numeros_contrato SET user_id = owner_id WHERE user_id IS NULL;

  ALTER TABLE public.numeros_contrato ALTER COLUMN user_id SET NOT NULL;
  ALTER TABLE public.numeros_contrato ALTER COLUMN user_id SET DEFAULT auth.uid();

  ALTER TABLE public.numeros_contrato DROP CONSTRAINT IF EXISTS numeros_contrato_pkey;

  ALTER TABLE public.numeros_contrato ADD PRIMARY KEY (user_id, rut_mandante);

END $$;

-- =============================================================================
-- RLS: public.clientes
-- =============================================================================
DROP POLICY IF EXISTS "Permitir insert cliente público" ON public.clientes;
DROP POLICY IF EXISTS "Solo autenticados pueden leer clientes" ON public.clientes;
DROP POLICY IF EXISTS "Solo autenticados pueden actualizar clientes" ON public.clientes;
DROP POLICY IF EXISTS "Solo autenticados pueden eliminar clientes" ON public.clientes;

CREATE POLICY "clientes_select_propietario"
  ON public.clientes FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "clientes_insert_propietario"
  ON public.clientes FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "clientes_update_propietario"
  ON public.clientes FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "clientes_delete_propietario"
  ON public.clientes FOR DELETE
  USING (user_id = auth.uid());

-- =============================================================================
-- RLS: public.clientes_potenciales
-- =============================================================================
DROP POLICY IF EXISTS "Solo autenticados pueden insertar clientes potenciales" ON public.clientes_potenciales;
DROP POLICY IF EXISTS "Permitir insert clientes potenciales público" ON public.clientes_potenciales;
DROP POLICY IF EXISTS "Solo autenticados pueden leer clientes potenciales" ON public.clientes_potenciales;
DROP POLICY IF EXISTS "Solo autenticados pueden eliminar clientes potenciales" ON public.clientes_potenciales;

CREATE POLICY "clientes_potenciales_select_propietario"
  ON public.clientes_potenciales FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "clientes_potenciales_insert_propietario"
  ON public.clientes_potenciales FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "clientes_potenciales_delete_propietario"
  ON public.clientes_potenciales FOR DELETE
  USING (user_id = auth.uid());

-- =============================================================================
-- RLS: public.recordatorios
-- =============================================================================
DROP POLICY IF EXISTS "Autenticados pueden insertar recordatorios" ON public.recordatorios;
DROP POLICY IF EXISTS "Autenticados pueden ver recordatorios" ON public.recordatorios;
DROP POLICY IF EXISTS "Autenticados pueden actualizar recordatorios" ON public.recordatorios;
DROP POLICY IF EXISTS "Autenticados pueden borrar recordatorios" ON public.recordatorios;

CREATE POLICY "recordatorios_select_propietario"
  ON public.recordatorios FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "recordatorios_insert_propietario"
  ON public.recordatorios FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "recordatorios_update_propietario"
  ON public.recordatorios FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "recordatorios_delete_propietario"
  ON public.recordatorios FOR DELETE
  USING (user_id = auth.uid());

-- =============================================================================
-- RLS: public.numeros_contrato
-- =============================================================================
DROP POLICY IF EXISTS "Autenticados pueden leer numeros_contrato" ON public.numeros_contrato;
DROP POLICY IF EXISTS "Autenticados pueden insertar numeros_contrato" ON public.numeros_contrato;

CREATE POLICY "numeros_contrato_select_propietario"
  ON public.numeros_contrato FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "numeros_contrato_insert_propietario"
  ON public.numeros_contrato FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "numeros_contrato_update_propietario"
  ON public.numeros_contrato FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "numeros_contrato_delete_propietario"
  ON public.numeros_contrato FOR DELETE
  USING (user_id = auth.uid());
