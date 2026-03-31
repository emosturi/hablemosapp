-- Prioridad sesión sobre dueño del invite en registrar_cliente_por_invite.
-- Ejecutar una vez en Supabase SQL Editor si la función ya existía.

CREATE OR REPLACE FUNCTION public.registrar_cliente_por_invite(p_invite uuid, p_row jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_rut text;
  v_cony_rut text;
  v_emp_rut text;
  v_id uuid;
  v_cambio_modal boolean;
  v_tiene_hijos boolean;
BEGIN
  IF p_invite IS NULL THEN
    RAISE EXCEPTION 'invite_requerida';
  END IF;

  SELECT i.owner_user_id INTO v_owner
  FROM public.registro_afiliados_invites i
  WHERE i.id = p_invite
  LIMIT 1;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'invite_invalida';
  END IF;

  -- Asesor autenticado: siempre guardar bajo su cuenta, aunque el ?ref= sea de otro (el token solo valida el formulario).
  IF auth.uid() IS NOT NULL THEN
    v_owner := auth.uid();
  END IF;

  v_rut := upper(regexp_replace(coalesce(trim(p_row ->> 'rut'), ''), '[^0-9K]', '', 'g'));
  IF v_rut IS NULL OR length(v_rut) < 2 THEN
    RAISE EXCEPTION 'rut_invalido';
  END IF;

  v_cony_rut := nullif(upper(regexp_replace(coalesce(trim(p_row ->> 'conyuge_rut'), ''), '[^0-9K]', '', 'g')), '');
  v_emp_rut := nullif(upper(regexp_replace(coalesce(trim(p_row ->> 'empleador_rut'), ''), '[^0-9K]', '', 'g')), '');

  IF jsonb_typeof(p_row -> 'solicitud_cambio_modalidad_tramite') = 'boolean' THEN
    v_cambio_modal := (p_row -> 'solicitud_cambio_modalidad_tramite')::text::boolean;
  ELSIF coalesce(trim(p_row ->> 'solicitud_cambio_modalidad_tramite'), '') = 'true' THEN
    v_cambio_modal := true;
  ELSIF coalesce(trim(p_row ->> 'solicitud_cambio_modalidad_tramite'), '') = 'false' THEN
    v_cambio_modal := false;
  ELSE
    v_cambio_modal := null;
  END IF;

  IF jsonb_typeof(p_row -> 'tiene_hijos_menores_24') = 'boolean' THEN
    v_tiene_hijos := (p_row -> 'tiene_hijos_menores_24')::text::boolean;
  ELSE
    v_tiene_hijos := coalesce((p_row ->> 'tiene_hijos_menores_24')::boolean, false);
  END IF;

  INSERT INTO public.clientes (
    user_id,
    rut,
    nombres,
    apellido_paterno,
    apellido_materno,
    fecha_nacimiento,
    estado_civil,
    domicilio,
    comuna,
    ciudad,
    profesion_oficio,
    telefono,
    email,
    afp,
    institucion_salud,
    nacionalidad,
    sexo,
    conyuge_nombres,
    conyuge_apellido_paterno,
    conyuge_apellido_materno,
    conyuge_rut,
    conyuge_fecha_nacimiento,
    conyuge_fecha_matrimonio,
    conyuge_lugar_matrimonio,
    conyuge_nacionalidad,
    conyuge_sexo,
    tiene_hijos_menores_24,
    hijos,
    empleador_razon_social,
    empleador_rut,
    empleador_direccion,
    empleador_telefono,
    empleador_email,
    banco,
    tipo_cuenta,
    numero_cuenta,
    solicitud_tipo_pension,
    solicitud_cambio_modalidad_tramite,
    solicitud_numero_beneficiarios,
    solicitud_beneficiarios,
    solicitud_antecedentes,
    solicitud_autorizaciones,
    solicitud_certificados
  )
  VALUES (
    v_owner,
    v_rut,
    nullif(trim(p_row ->> 'nombres'), ''),
    nullif(trim(p_row ->> 'apellido_paterno'), ''),
    nullif(trim(p_row ->> 'apellido_materno'), ''),
    (nullif(trim(p_row ->> 'fecha_nacimiento'), ''))::date,
    nullif(trim(p_row ->> 'estado_civil'), ''),
    nullif(trim(p_row ->> 'domicilio'), ''),
    nullif(trim(p_row ->> 'comuna'), ''),
    nullif(trim(p_row ->> 'ciudad'), ''),
    nullif(trim(p_row ->> 'profesion_oficio'), ''),
    nullif(trim(p_row ->> 'telefono'), ''),
    nullif(trim(p_row ->> 'email'), ''),
    nullif(trim(p_row ->> 'afp'), ''),
    nullif(trim(p_row ->> 'institucion_salud'), ''),
    nullif(trim(p_row ->> 'nacionalidad'), ''),
    nullif(trim(p_row ->> 'sexo'), ''),
    nullif(trim(p_row ->> 'conyuge_nombres'), ''),
    nullif(trim(p_row ->> 'conyuge_apellido_paterno'), ''),
    nullif(trim(p_row ->> 'conyuge_apellido_materno'), ''),
    v_cony_rut,
    (nullif(trim(p_row ->> 'conyuge_fecha_nacimiento'), ''))::date,
    (nullif(trim(p_row ->> 'conyuge_fecha_matrimonio'), ''))::date,
    nullif(trim(p_row ->> 'conyuge_lugar_matrimonio'), ''),
    nullif(trim(p_row ->> 'conyuge_nacionalidad'), ''),
    nullif(trim(p_row ->> 'conyuge_sexo'), ''),
    v_tiene_hijos,
    coalesce(p_row -> 'hijos', '[]'::jsonb),
    nullif(trim(p_row ->> 'empleador_razon_social'), ''),
    v_emp_rut,
    nullif(trim(p_row ->> 'empleador_direccion'), ''),
    nullif(trim(p_row ->> 'empleador_telefono'), ''),
    nullif(trim(p_row ->> 'empleador_email'), ''),
    nullif(trim(p_row ->> 'banco'), ''),
    nullif(trim(p_row ->> 'tipo_cuenta'), ''),
    nullif(trim(p_row ->> 'numero_cuenta'), ''),
    nullif(trim(p_row ->> 'solicitud_tipo_pension'), ''),
    v_cambio_modal,
    CASE
      WHEN (p_row ->> 'solicitud_numero_beneficiarios') ~ '^[0-9]+$' THEN (p_row ->> 'solicitud_numero_beneficiarios')::int
      ELSE null
    END,
    coalesce(p_row -> 'solicitud_beneficiarios', '[]'::jsonb),
    coalesce(p_row -> 'solicitud_antecedentes', '{}'::jsonb),
    coalesce(p_row -> 'solicitud_autorizaciones', '{}'::jsonb),
    coalesce(p_row -> 'solicitud_certificados', '{}'::jsonb)
  )
  ON CONFLICT (user_id, rut) DO UPDATE SET
    nombres = excluded.nombres,
    apellido_paterno = excluded.apellido_paterno,
    apellido_materno = excluded.apellido_materno,
    fecha_nacimiento = excluded.fecha_nacimiento,
    estado_civil = excluded.estado_civil,
    domicilio = excluded.domicilio,
    comuna = excluded.comuna,
    ciudad = excluded.ciudad,
    profesion_oficio = excluded.profesion_oficio,
    telefono = excluded.telefono,
    email = excluded.email,
    afp = excluded.afp,
    institucion_salud = excluded.institucion_salud,
    nacionalidad = excluded.nacionalidad,
    sexo = excluded.sexo,
    conyuge_nombres = excluded.conyuge_nombres,
    conyuge_apellido_paterno = excluded.conyuge_apellido_paterno,
    conyuge_apellido_materno = excluded.conyuge_apellido_materno,
    conyuge_rut = excluded.conyuge_rut,
    conyuge_fecha_nacimiento = excluded.conyuge_fecha_nacimiento,
    conyuge_fecha_matrimonio = excluded.conyuge_fecha_matrimonio,
    conyuge_lugar_matrimonio = excluded.conyuge_lugar_matrimonio,
    conyuge_nacionalidad = excluded.conyuge_nacionalidad,
    conyuge_sexo = excluded.conyuge_sexo,
    tiene_hijos_menores_24 = excluded.tiene_hijos_menores_24,
    hijos = excluded.hijos,
    empleador_razon_social = excluded.empleador_razon_social,
    empleador_rut = excluded.empleador_rut,
    empleador_direccion = excluded.empleador_direccion,
    empleador_telefono = excluded.empleador_telefono,
    empleador_email = excluded.empleador_email,
    banco = excluded.banco,
    tipo_cuenta = excluded.tipo_cuenta,
    numero_cuenta = excluded.numero_cuenta,
    solicitud_tipo_pension = excluded.solicitud_tipo_pension,
    solicitud_cambio_modalidad_tramite = excluded.solicitud_cambio_modalidad_tramite,
    solicitud_numero_beneficiarios = excluded.solicitud_numero_beneficiarios,
    solicitud_beneficiarios = excluded.solicitud_beneficiarios,
    solicitud_antecedentes = excluded.solicitud_antecedentes,
    solicitud_autorizaciones = excluded.solicitud_autorizaciones,
    solicitud_certificados = excluded.solicitud_certificados,
    tiene_contrato = clientes.tiene_contrato,
    tiene_mandato_corto = clientes.tiene_mandato_corto,
    tiene_mandato_largo = clientes.tiene_mandato_largo,
    tramite_etapa_actual = clientes.tramite_etapa_actual,
    tramite_etapas_fechas = clientes.tramite_etapas_fechas,
    posee_bono_reconocimiento = clientes.posee_bono_reconocimiento,
    created_at = clientes.created_at
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


COMMENT ON FUNCTION public.registrar_cliente_por_invite(uuid, jsonb) IS 'Registro con enlace (?ref): valida p_invite. Sin sesión: user_id = dueño del token. Con sesión (auth.uid): user_id = asesor logueado.';
