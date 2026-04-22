


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."agendar_llamada_publica"("p_invite" "uuid", "p_fecha" "date", "p_hora" integer, "p_nombres" "text", "p_apellido_paterno" "text", "p_apellido_materno" "text", "p_ciudad" "text", "p_telefono" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owner uuid;
  v_dow int;
  v_bloques jsonb;
  v_day_hours jsonb;
  v_ok_hour boolean;
  v_nombre text;
  v_tel text;
  v_tel_digits text;
  v_ciudad text;
  v_pot_id uuid;
  v_hora_lbl text;
  v_hoy date;
  v_slot_start timestamptz;
begin
  if p_invite is null then
    return jsonb_build_object('ok', false, 'code', 'invite_requerida');
  end if;

  select owner_user_id into v_owner
  from public.agenda_llamadas_invites
  where id = p_invite;

  if v_owner is null then
    return jsonb_build_object('ok', false, 'code', 'invite_invalida');
  end if;

  v_hoy := (timezone('America/Santiago', now()))::date;
  if p_fecha is null or p_fecha < v_hoy then
    return jsonb_build_object('ok', false, 'code', 'fecha_invalida');
  end if;

  if p_hora is null or p_hora < 0 or p_hora > 23 then
    return jsonb_build_object('ok', false, 'code', 'hora_invalida');
  end if;

  v_slot_start := (
    (p_fecha::text || ' ' || lpad(p_hora::text, 2, '0') || ':00:00')::timestamp
    at time zone 'America/Santiago'
  );
  if v_slot_start <= now() then
    return jsonb_build_object('ok', false, 'code', 'slot_pasado');
  end if;

  if v_slot_start < now() + interval '6 hours' then
    return jsonb_build_object('ok', false, 'code', 'anticipacion_insuficiente');
  end if;

  v_nombre := trim(concat_ws(' ',
    nullif(trim(coalesce(p_nombres, '')), ''),
    nullif(trim(coalesce(p_apellido_paterno, '')), ''),
    nullif(trim(coalesce(p_apellido_materno, '')), '')
  ));
  v_tel := trim(coalesce(p_telefono, ''));
  v_tel_digits := regexp_replace(v_tel, '\D', '', 'g');
  v_ciudad := nullif(trim(coalesce(p_ciudad, '')), '');

  if v_nombre = '' or length(v_nombre) < 3 then
    return jsonb_build_object('ok', false, 'code', 'nombre_requerido');
  end if;
  if length(v_tel_digits) < 8 then
    return jsonb_build_object('ok', false, 'code', 'telefono_requerido');
  end if;

  if exists (
    select 1
    from public.agenda_reservas r
    inner join public.clientes_potenciales cp on cp.id = r.cliente_potencial_id
    where r.owner_user_id = v_owner
      and regexp_replace(coalesce(cp.telefono, ''), '\D', '', 'g') = v_tel_digits
      and (
        (
          (r.fecha::text || ' ' || lpad(r.hora::text, 2, '0') || ':00:00')::timestamp
          at time zone 'America/Santiago'
        ) + interval '1 hour'
      ) > now()
  ) then
    return jsonb_build_object('ok', false, 'code', 'ya_tiene_reserva');
  end if;

  select coalesce(bloques, '{}'::jsonb) into v_bloques
  from public.asesor_disponibilidad
  where user_id = v_owner;

  if v_bloques is null or v_bloques = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'code', 'sin_disponibilidad');
  end if;

  v_dow := extract(isodow from p_fecha)::int;
  v_day_hours := v_bloques -> (v_dow::text);

  select exists (
    select 1
    from jsonb_array_elements(coalesce(v_day_hours, '[]'::jsonb)) elem
    where (elem #>> '{}')::int = p_hora
  ) into v_ok_hour;

  if not v_ok_hour then
    return jsonb_build_object('ok', false, 'code', 'slot_no_disponible');
  end if;

  if exists (
    select 1 from public.agenda_reservas
    where owner_user_id = v_owner and fecha = p_fecha and hora = p_hora
  ) then
    return jsonb_build_object('ok', false, 'code', 'slot_ocupado');
  end if;

  insert into public.clientes_potenciales (user_id, nombre, telefono, ciudad)
  values (v_owner, v_nombre, v_tel, v_ciudad)
  returning id into v_pot_id;

  insert into public.agenda_reservas (owner_user_id, fecha, hora, cliente_potencial_id)
  values (v_owner, p_fecha, p_hora::smallint, v_pot_id);

  v_hora_lbl := lpad(p_hora::text, 2, '0') || ':00';

  insert into public.recordatorios (
    user_id,
    cliente_id,
    cliente_potencial_id,
    cliente_nombre,
    cliente_telefono,
    fecha,
    hora,
    mensaje,
    enviado,
    auto_generado
  ) values (
    v_owner,
    null,
    v_pot_id,
    v_nombre,
    v_tel,
    p_fecha,
    v_hora_lbl,
    'Llamada telefónica agendada por la web. Prospecto — ciudad: ' || coalesce(v_ciudad, '—') || '.',
    false,
    false
  );

  return jsonb_build_object(
    'ok', true,
    'cliente_potencial_id', v_pot_id,
    'fecha', p_fecha,
    'hora', p_hora
  );

exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'slot_ocupado');
end;
$$;


ALTER FUNCTION "public"."agendar_llamada_publica"("p_invite" "uuid", "p_fecha" "date", "p_hora" integer, "p_nombres" "text", "p_apellido_paterno" "text", "p_apellido_materno" "text", "p_ciudad" "text", "p_telefono" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."agendar_llamada_publica"("p_invite" "uuid", "p_fecha" "date", "p_hora" integer, "p_nombres" "text", "p_apellido_paterno" "text", "p_apellido_materno" "text", "p_ciudad" "text", "p_telefono" "text") IS 'Público: mínimo 6 h de anticipación; una reserva activa por teléfono y asesor; slot pasado rechazado.';



CREATE OR REPLACE FUNCTION "public"."asesor_cuentas_set_referral_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  candidate text;
  attempts int := 0;
begin
  if new.referral_code is not null and length(trim(new.referral_code)) > 0 then
    new.referral_code := upper(trim(new.referral_code));
    return new;
  end if;
  loop
    candidate := upper(substr(md5(random()::text || clock_timestamp()::text || random()::text), 1, 8));
    exit when not exists (
      select 1
      from public.asesor_cuentas o
      where o.referral_code = candidate
        and o.user_id is distinct from new.user_id
    );
    attempts := attempts + 1;
    if attempts > 40 then
      candidate := upper(replace(gen_random_uuid()::text, '-', ''));
      candidate := substr(candidate, 1, 8);
      exit;
    end if;
  end loop;
  new.referral_code := candidate;
  return new;
end;
$$;


ALTER FUNCTION "public"."asesor_cuentas_set_referral_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."asesor_referral_links_biud"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  n int;
  candidate text;
  attempts int := 0;
begin
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.code is distinct from old.code) then
    if new.code is null or length(trim(new.code)) = 0 then
      loop
        candidate := upper(substr(md5(random()::text || clock_timestamp()::text || random()::text), 1, 8));
        exit when not exists (select 1 from public.asesor_referral_links o where o.code = candidate)
          and not exists (
            select 1 from public.asesor_cuentas a
            where a.referral_code is not null and upper(trim(a.referral_code)) = candidate
          );
        attempts := attempts + 1;
        if attempts > 40 then
          candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
          exit;
        end if;
      end loop;
      new.code := candidate;
    else
      new.code := upper(trim(new.code));
    end if;
  end if;

  if new.active then
    select count(*)::int into n
    from public.asesor_referral_links
    where user_id = new.user_id
      and active = true
      and id is distinct from new.id;

    if n >= 3 then
      raise exception 'max_active_referral_links: máximo 3 enlaces activos por asesor';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."asesor_referral_links_biud"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."asesor_referral_links_sync_from_cuentas"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.referral_code is null or length(trim(new.referral_code)) = 0 then
    return new;
  end if;
  if exists (select 1 from public.asesor_referral_links where user_id = new.user_id limit 1) then
    return new;
  end if;
  insert into public.asesor_referral_links (user_id, code, active)
  values (new.user_id, upper(trim(new.referral_code)), true);
  return new;
exception
  when unique_violation then
    return new;
end;
$$;


ALTER FUNCTION "public"."asesor_referral_links_sync_from_cuentas"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."canonize_rut"("rut" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
begin
  if rut is null or trim(rut) = '' then
    return null;
  end if;
  return upper(regexp_replace(trim(rut), '[^0-9K]', '', 'gi'));
end;
$$;


ALTER FUNCTION "public"."canonize_rut"("rut" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."canonize_rut"("rut" "text") IS 'Normaliza RUT chileno a formato canónico: solo dígitos y K (ej. 123456785).';



CREATE OR REPLACE FUNCTION "public"."obtener_agenda_publica"("p_invite" "uuid", "p_desde" "date" DEFAULT NULL::"date", "p_hasta" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owner uuid;
  v_bloques jsonb;
  v_desde date;
  v_hasta date;
  v_res jsonb;
  v_hoy_zona date;
  v_hora_cursor int;
begin
  if p_invite is null then
    return jsonb_build_object('ok', false, 'code', 'invite_requerida');
  end if;

  select owner_user_id into v_owner
  from public.agenda_llamadas_invites
  where id = p_invite;

  if v_owner is null then
    return jsonb_build_object('ok', false, 'code', 'invite_invalida');
  end if;

  select coalesce(bloques, '{}'::jsonb) into v_bloques
  from public.asesor_disponibilidad
  where user_id = v_owner;

  if v_bloques is null then
    v_bloques := '{}'::jsonb;
  end if;

  v_desde := coalesce(p_desde, (timezone('America/Santiago', now()))::date);
  v_hasta := coalesce(p_hasta, v_desde + 21);

  if v_hasta < v_desde then
    v_hasta := v_desde + 21;
  end if;
  if v_hasta > v_desde + 60 then
    v_hasta := v_desde + 60;
  end if;

  v_hoy_zona := (timezone('America/Santiago', now()))::date;
  v_hora_cursor := extract(hour from timezone('America/Santiago', now()))::int;

  select coalesce(jsonb_agg(sub.j), '[]'::jsonb)
  into v_res
  from (
    select jsonb_build_object('fecha', r.fecha, 'hora', r.hora) as j
    from public.agenda_reservas r
    where r.owner_user_id = v_owner
      and r.fecha >= v_desde
      and r.fecha <= v_hasta
    order by r.fecha, r.hora
  ) sub;

  return jsonb_build_object(
    'ok', true,
    'bloques', v_bloques,
    'reservas', coalesce(v_res, '[]'::jsonb),
    'desde', v_desde,
    'hasta', v_hasta,
    'zona', 'America/Santiago',
    'hoy_zona', v_hoy_zona,
    'hora_cursor_zona', v_hora_cursor,
    'min_booking_at', to_jsonb(now() + interval '6 hours'),
    'min_hours_advance', 6
  );
end;
$$;


ALTER FUNCTION "public"."obtener_agenda_publica"("p_invite" "uuid", "p_desde" "date", "p_hasta" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."obtener_agenda_publica"("p_invite" "uuid", "p_desde" "date", "p_hasta" "date") IS 'Público: bloques, reservas, min_booking_at (now+6h) para ocultar franjas sin antelación suficiente.';



CREATE OR REPLACE FUNCTION "public"."registrar_cliente_por_invite"("p_invite" "uuid", "p_row" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."registrar_cliente_por_invite"("p_invite" "uuid", "p_row" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."registrar_cliente_por_invite"("p_invite" "uuid", "p_row" "jsonb") IS 'Registro con enlace (?ref): valida p_invite. Sin sesión: user_id = dueño del token. Con sesión (auth.uid): user_id = asesor logueado.';



CREATE OR REPLACE FUNCTION "public"."support_chat_touch_thread_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.support_chat_threads
  set updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."support_chat_touch_thread_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."agenda_llamadas_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."agenda_llamadas_invites" OWNER TO "postgres";


COMMENT ON TABLE "public"."agenda_llamadas_invites" IS 'UUID en agendar-llamada.html?ref= para reservar llamada con un asesor.';



CREATE TABLE IF NOT EXISTS "public"."agenda_reservas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "fecha" "date" NOT NULL,
    "hora" smallint NOT NULL,
    "cliente_potencial_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "agenda_reservas_hora_check" CHECK ((("hora" >= 0) AND ("hora" <= 23)))
);


ALTER TABLE "public"."agenda_reservas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."asesor_cuentas" (
    "user_id" "uuid" NOT NULL,
    "account_enabled" boolean DEFAULT true NOT NULL,
    "subscription_plan" "text",
    "subscription_status" "text",
    "current_period_end" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "telegram_reminders_enabled" boolean DEFAULT true NOT NULL,
    "mercadopago_last_payment_id" "text",
    "referral_code" "text",
    "referral_discount_percent_mensual" smallint DEFAULT 0 NOT NULL,
    "referral_discount_percent_anual" smallint DEFAULT 0 NOT NULL,
    "subscription_grace_until" timestamp with time zone,
    "subscription_bypass" boolean DEFAULT false NOT NULL,
    "telegram_chat_id" "text",
    "telegram_chat_id_updated_at" timestamp with time zone,
    "annual_contract_discount_percent" numeric(5,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "asesor_cuentas_annual_contract_discount_chk" CHECK ((("annual_contract_discount_percent" >= (0)::numeric) AND ("annual_contract_discount_percent" <= (100)::numeric))),
    CONSTRAINT "asesor_cuentas_referral_discount_anual_chk" CHECK ((("referral_discount_percent_anual" >= 0) AND ("referral_discount_percent_anual" <= 45))),
    CONSTRAINT "asesor_cuentas_referral_discount_mensual_chk" CHECK ((("referral_discount_percent_mensual" >= 0) AND ("referral_discount_percent_mensual" <= 45))),
    CONSTRAINT "asesor_cuentas_subscription_plan_check" CHECK ((("subscription_plan" = ANY (ARRAY['mensual'::"text", 'anual'::"text"])) OR ("subscription_plan" IS NULL))),
    CONSTRAINT "asesor_cuentas_subscription_status_check" CHECK ((("subscription_status" = ANY (ARRAY['trial'::"text", 'active'::"text", 'past_due'::"text", 'canceled'::"text", 'none'::"text"])) OR ("subscription_status" IS NULL)))
);


ALTER TABLE "public"."asesor_cuentas" OWNER TO "postgres";


COMMENT ON COLUMN "public"."asesor_cuentas"."telegram_reminders_enabled" IS 'Si es false, process-reminders no envía Telegram para ese asesor (resto de la app igual).';



COMMENT ON COLUMN "public"."asesor_cuentas"."mercadopago_last_payment_id" IS 'Último ID de pago de Mercado Pago aplicado a esta cuenta (evita duplicados al reintentar el webhook).';



COMMENT ON COLUMN "public"."asesor_cuentas"."referral_code" IS 'Código principal en asesor_cuentas (sincronizado con el primer enlace); enlaces adicionales en asesor_referral_links.';



COMMENT ON COLUMN "public"."asesor_cuentas"."referral_discount_percent_mensual" IS 'Descuento % acumulado por referidos que pagaron plan mensual (máx. 45, 3×15%).';



COMMENT ON COLUMN "public"."asesor_cuentas"."referral_discount_percent_anual" IS 'Descuento % acumulado por referidos que pagaron plan anual (máx. 45, 3×15%).';



COMMENT ON COLUMN "public"."asesor_cuentas"."subscription_grace_until" IS 'Fin del periodo de mora (current_period_end + 3 días UTC). Null si no está en mora.';



COMMENT ON COLUMN "public"."asesor_cuentas"."subscription_bypass" IS 'Si true, el asesor tiene acceso completo sin depender del estado de suscripción (solo owner).';



COMMENT ON COLUMN "public"."asesor_cuentas"."telegram_chat_id" IS 'ID de chat personal de Telegram (solo dígitos). Tiene prioridad sobre TELEGRAM_CHAT_BY_PHONE_JSON al enviar recordatorios.';



COMMENT ON COLUMN "public"."asesor_cuentas"."telegram_chat_id_updated_at" IS 'Última vez que el asesor guardó su chat ID (panel configuración Telegram).';



COMMENT ON COLUMN "public"."asesor_cuentas"."annual_contract_discount_percent" IS 'Descuento % permanente solo al pagar plan anual, calculado sobre el precio listado (MERCADOPAGO_PLAN_ANUAL_CLP). Junto con referidos se cobra el mínimo entre precio tras referidos y precio con solo este descuento sobre la lista. No se borra al aprobar el pago.';



CREATE TABLE IF NOT EXISTS "public"."asesor_disponibilidad" (
    "user_id" "uuid" NOT NULL,
    "bloques" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."asesor_disponibilidad" OWNER TO "postgres";


COMMENT ON TABLE "public"."asesor_disponibilidad" IS 'Horarios disponibles para agendar llamadas; bloques["1"]..["7"] = arrays de hora (0-23).';



CREATE TABLE IF NOT EXISTS "public"."asesor_mandatario_perfil" (
    "user_id" "uuid" NOT NULL,
    "datos" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mandatario_datos_checkpoint_at" timestamp with time zone
);


ALTER TABLE "public"."asesor_mandatario_perfil" OWNER TO "postgres";


COMMENT ON TABLE "public"."asesor_mandatario_perfil" IS 'JSON datos del asesor para pension.html: campos mandatario (rut, nombres, etc.), opcional poliza (registroPoliza, compania, numeroPoliza, fechas), contrato_anexos, incluirCodigoAsesorEnNumeroContrato (boolean).';



COMMENT ON COLUMN "public"."asesor_mandatario_perfil"."mandatario_datos_checkpoint_at" IS 'Tras un perfil mandatario completo: marca la última edición restringida (máx. 1 campo / 15 días). NULL en filas nuevas o antes de migrar.';



CREATE TABLE IF NOT EXISTS "public"."asesor_referral_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "asesor_referral_links_code_upper_chk" CHECK (("code" = "upper"(TRIM(BOTH FROM "code"))))
);


ALTER TABLE "public"."asesor_referral_links" OWNER TO "postgres";


COMMENT ON TABLE "public"."asesor_referral_links" IS 'Enlaces login.html?ref=CODE por asesor; máximo 3 filas con active=true por user_id.';



CREATE TABLE IF NOT EXISTS "public"."clientes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rut" "text" NOT NULL,
    "nacionalidad" "text",
    "sexo" "text",
    "nombres" "text",
    "apellido_paterno" "text",
    "apellido_materno" "text",
    "domicilio" "text",
    "comuna" "text",
    "ciudad" "text",
    "fecha_nacimiento" "date",
    "estado_civil" "text",
    "profesion_oficio" "text",
    "telefono" "text",
    "email" "text",
    "afp" "text",
    "institucion_salud" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "conyuge_nombres" "text",
    "conyuge_apellido_paterno" "text",
    "conyuge_apellido_materno" "text",
    "conyuge_rut" "text",
    "conyuge_fecha_nacimiento" "date",
    "conyuge_fecha_matrimonio" "date",
    "conyuge_lugar_matrimonio" "text",
    "tiene_hijos_menores_24" boolean,
    "hijos" "jsonb" DEFAULT '[]'::"jsonb",
    "empleador_razon_social" "text",
    "empleador_rut" "text",
    "empleador_direccion" "text",
    "empleador_telefono" "text",
    "empleador_email" "text",
    "banco" "text",
    "tipo_cuenta" "text",
    "numero_cuenta" "text",
    "conyuge_nacionalidad" "text",
    "conyuge_sexo" "text",
    "solicitud_tipo_pension" "text",
    "solicitud_cambio_modalidad_tramite" boolean,
    "solicitud_numero_beneficiarios" integer,
    "solicitud_beneficiarios" "jsonb" DEFAULT '[]'::"jsonb",
    "solicitud_antecedentes" "jsonb" DEFAULT '{}'::"jsonb",
    "solicitud_autorizaciones" "jsonb" DEFAULT '{}'::"jsonb",
    "solicitud_certificados" "jsonb" DEFAULT '{}'::"jsonb",
    "tiene_contrato" boolean DEFAULT false NOT NULL,
    "tiene_mandato_corto" boolean DEFAULT false NOT NULL,
    "tiene_mandato_largo" boolean DEFAULT false NOT NULL,
    "tramite_etapa_actual" smallint DEFAULT 1 NOT NULL,
    "tramite_etapas_fechas" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "posee_bono_reconocimiento" boolean,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "pensionado" boolean DEFAULT false NOT NULL,
    "pension_compania" "text",
    "pension_monto" "text",
    "pension_modalidad" "text",
    "pension_periodo_garantizado" boolean,
    "checklist_caso" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notas_asesor" "text",
    "pension_datos_actualizados" "jsonb",
    "pension_rv_detalle" "jsonb",
    CONSTRAINT "clientes_tramite_etapa_actual_check" CHECK ((("tramite_etapa_actual" >= 1) AND ("tramite_etapa_actual" <= 14)))
);


ALTER TABLE "public"."clientes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clientes"."tiene_contrato" IS 'True si se ha generado contrato para el cliente';



COMMENT ON COLUMN "public"."clientes"."tiene_mandato_corto" IS 'True si se ha generado mandato corto para el cliente';



COMMENT ON COLUMN "public"."clientes"."tiene_mandato_largo" IS 'True si se ha generado mandato largo para el cliente';



COMMENT ON COLUMN "public"."clientes"."tramite_etapa_actual" IS 'Etapa en curso (1-14). Las anteriores se consideran completadas en la UI.';



COMMENT ON COLUMN "public"."clientes"."tramite_etapas_fechas" IS 'Fechas ISO (YYYY-MM-DD) por índice de etapa completada, ej. {"1":"2025-03-01","2":"2025-03-10"}';



COMMENT ON COLUMN "public"."clientes"."posee_bono_reconocimiento" IS 'Indica si el cliente posee bono de reconocimiento (Sí/No del formulario).';



COMMENT ON COLUMN "public"."clientes"."pensionado" IS 'Indica si el cliente ya pasó a la condición de pensionado.';



COMMENT ON COLUMN "public"."clientes"."pension_compania" IS 'Compañía seleccionada para el proceso de pensión (renta vitalicia) o AFP.';



COMMENT ON COLUMN "public"."clientes"."pension_monto" IS 'Monto de la pensión ingresado al finalizar la línea de tiempo.';



COMMENT ON COLUMN "public"."clientes"."pension_modalidad" IS 'Modalidad de pensión seleccionada al finalizar la línea de tiempo.';



COMMENT ON COLUMN "public"."clientes"."pension_periodo_garantizado" IS 'Periodo garantizado (Sí/No) cuando corresponde a renta vitalicia.';



COMMENT ON COLUMN "public"."clientes"."checklist_caso" IS 'Checklist de documentos/pasos del caso. JSON con claves por ítem, ej. {\"copia_ci\":true,\"contrato_firmado\":false}.';



COMMENT ON COLUMN "public"."clientes"."notas_asesor" IS 'Texto acumulado: notas internas del asesor sobre el cliente (afiliado o pensionado).';



COMMENT ON COLUMN "public"."clientes"."pension_datos_actualizados" IS 'JSON con datos vigentes al marcar pensionado si hubo cambios respecto a la preparación. Ej.: {"compania":"...","monto":"123.45","modalidad":"...","periodo_garantizado":true}.';



COMMENT ON COLUMN "public"."clientes"."pension_rv_detalle" IS 'JSON preparación cierre RV con PG=Sí: meses_periodo_garantizado, tipo_aumento (sin_aumento|aumento_temporal|aumento_sobrevivencia), porcentaje_aumento, periodo_aumento_meses (solo temporal). NULL si no aplica.';



CREATE TABLE IF NOT EXISTS "public"."clientes_potenciales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "telefono" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "ciudad" "text",
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "notas_asesor" "text"
);


ALTER TABLE "public"."clientes_potenciales" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clientes_potenciales"."notas_asesor" IS 'Texto acumulado: notas internas del asesor sobre el cliente potencial.';



CREATE TABLE IF NOT EXISTS "public"."numeros_contrato" (
    "rut_mandante" "text" NOT NULL,
    "numero_secuencial" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL
);


ALTER TABLE "public"."numeros_contrato" OWNER TO "postgres";


COMMENT ON TABLE "public"."numeros_contrato" IS 'Número secuencial de contrato asignado por RUT del mandante (formulario de pensión).';



CREATE TABLE IF NOT EXISTS "public"."platform_owners" (
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."platform_owners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."push_subscriptions" IS 'Claves Web Push por dispositivo; el servidor envía recordatorios vía VAPID.';



CREATE TABLE IF NOT EXISTS "public"."recordatorios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid",
    "cliente_nombre" "text",
    "cliente_telefono" "text",
    "fecha" "date" NOT NULL,
    "hora" "text",
    "mensaje" "text" NOT NULL,
    "enviado" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "auto_generado" boolean DEFAULT false NOT NULL,
    "auto_key" "text",
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "cliente_potencial_id" "uuid"
);


ALTER TABLE "public"."recordatorios" OWNER TO "postgres";


COMMENT ON COLUMN "public"."recordatorios"."auto_generado" IS 'true si fue generado automáticamente por reglas de etapas';



COMMENT ON COLUMN "public"."recordatorios"."auto_key" IS 'clave única de regla automática por cliente';



CREATE TABLE IF NOT EXISTS "public"."referral_attributions" (
    "referred_user_id" "uuid" NOT NULL,
    "referrer_user_id" "uuid" NOT NULL,
    "referral_code" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "referral_attributions_no_self" CHECK (("referred_user_id" <> "referrer_user_id"))
);


ALTER TABLE "public"."referral_attributions" OWNER TO "postgres";


COMMENT ON TABLE "public"."referral_attributions" IS 'Quién refirió a cada asesor; solo el backend (service role) escribe.';



CREATE TABLE IF NOT EXISTS "public"."referral_conversions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mp_payment_id" "text" NOT NULL,
    "referrer_user_id" "uuid" NOT NULL,
    "referred_user_id" "uuid" NOT NULL,
    "plan" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "referral_conversions_plan_check" CHECK (("plan" = ANY (ARRAY['mensual'::"text", 'anual'::"text"])))
);


ALTER TABLE "public"."referral_conversions" OWNER TO "postgres";


COMMENT ON TABLE "public"."referral_conversions" IS 'Pagos aprobados que sumaron +15% de descuento al referidor (tope acumulado 45% por tipo de plan).';



CREATE TABLE IF NOT EXISTS "public"."registro_afiliados_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."registro_afiliados_invites" OWNER TO "postgres";


COMMENT ON TABLE "public"."registro_afiliados_invites" IS 'Token de enlace público para registro de afiliados; un token por asesor.';



CREATE TABLE IF NOT EXISTS "public"."soporte_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "advisor_email" "text",
    "subject" "text" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "owner_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    CONSTRAINT "soporte_tickets_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."soporte_tickets" OWNER TO "postgres";


COMMENT ON TABLE "public"."soporte_tickets" IS 'Tickets de soporte creados por asesores desde la plataforma.';



CREATE TABLE IF NOT EXISTS "public"."support_chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "sender_user_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "support_chat_messages_body_nonempty" CHECK (("char_length"(TRIM(BOTH FROM "body")) > 0))
);


ALTER TABLE "public"."support_chat_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."support_chat_messages" IS 'Mensajes del chat de soporte; emisor asesor u owner.';



CREATE TABLE IF NOT EXISTS "public"."support_chat_threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "advisor_user_id" "uuid" NOT NULL,
    "advisor_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."support_chat_threads" OWNER TO "postgres";


COMMENT ON TABLE "public"."support_chat_threads" IS 'Un hilo por asesor; los platform_owners leen y responden todos.';



ALTER TABLE ONLY "public"."agenda_llamadas_invites"
    ADD CONSTRAINT "agenda_llamadas_invites_owner_user_id_key" UNIQUE ("owner_user_id");



ALTER TABLE ONLY "public"."agenda_llamadas_invites"
    ADD CONSTRAINT "agenda_llamadas_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agenda_reservas"
    ADD CONSTRAINT "agenda_reservas_owner_fecha_hora_unique" UNIQUE ("owner_user_id", "fecha", "hora");



ALTER TABLE ONLY "public"."agenda_reservas"
    ADD CONSTRAINT "agenda_reservas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asesor_cuentas"
    ADD CONSTRAINT "asesor_cuentas_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."asesor_disponibilidad"
    ADD CONSTRAINT "asesor_disponibilidad_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."asesor_mandatario_perfil"
    ADD CONSTRAINT "asesor_mandatario_perfil_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."asesor_referral_links"
    ADD CONSTRAINT "asesor_referral_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clientes_potenciales"
    ADD CONSTRAINT "clientes_potenciales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."numeros_contrato"
    ADD CONSTRAINT "numeros_contrato_pkey" PRIMARY KEY ("user_id", "rut_mandante");



ALTER TABLE ONLY "public"."platform_owners"
    ADD CONSTRAINT "platform_owners_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recordatorios"
    ADD CONSTRAINT "recordatorios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_attributions"
    ADD CONSTRAINT "referral_attributions_pkey" PRIMARY KEY ("referred_user_id");



ALTER TABLE ONLY "public"."referral_conversions"
    ADD CONSTRAINT "referral_conversions_mp_payment_id_key" UNIQUE ("mp_payment_id");



ALTER TABLE ONLY "public"."referral_conversions"
    ADD CONSTRAINT "referral_conversions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."registro_afiliados_invites"
    ADD CONSTRAINT "registro_afiliados_invites_owner_unique" UNIQUE ("owner_user_id");



ALTER TABLE ONLY "public"."registro_afiliados_invites"
    ADD CONSTRAINT "registro_afiliados_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."soporte_tickets"
    ADD CONSTRAINT "soporte_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_chat_messages"
    ADD CONSTRAINT "support_chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_chat_threads"
    ADD CONSTRAINT "support_chat_threads_one_per_advisor" UNIQUE ("advisor_user_id");



ALTER TABLE ONLY "public"."support_chat_threads"
    ADD CONSTRAINT "support_chat_threads_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "clientes_user_id_rut_unique" ON "public"."clientes" USING "btree" ("user_id", "rut");



CREATE INDEX "idx_agenda_invites_owner" ON "public"."agenda_llamadas_invites" USING "btree" ("owner_user_id");



CREATE INDEX "idx_agenda_reservas_owner_fecha" ON "public"."agenda_reservas" USING "btree" ("owner_user_id", "fecha");



CREATE UNIQUE INDEX "idx_asesor_cuentas_referral_code" ON "public"."asesor_cuentas" USING "btree" ("referral_code") WHERE ("referral_code" IS NOT NULL);



CREATE INDEX "idx_asesor_cuentas_status" ON "public"."asesor_cuentas" USING "btree" ("subscription_status");



CREATE UNIQUE INDEX "idx_asesor_referral_links_code" ON "public"."asesor_referral_links" USING "btree" ("code");



CREATE INDEX "idx_asesor_referral_links_user" ON "public"."asesor_referral_links" USING "btree" ("user_id");



CREATE INDEX "idx_asesor_referral_links_user_active" ON "public"."asesor_referral_links" USING "btree" ("user_id") WHERE ("active" = true);



CREATE INDEX "idx_clientes_potenciales_created_at" ON "public"."clientes_potenciales" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_clientes_potenciales_user_id" ON "public"."clientes_potenciales" USING "btree" ("user_id");



CREATE INDEX "idx_clientes_rut" ON "public"."clientes" USING "btree" ("rut");



CREATE INDEX "idx_clientes_user_id" ON "public"."clientes" USING "btree" ("user_id");



CREATE INDEX "idx_push_subscriptions_user_id" ON "public"."push_subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_recordatorios_cliente_potencial_id" ON "public"."recordatorios" USING "btree" ("cliente_potencial_id") WHERE ("cliente_potencial_id" IS NOT NULL);



CREATE INDEX "idx_recordatorios_fecha_enviado" ON "public"."recordatorios" USING "btree" ("fecha", "enviado");



CREATE INDEX "idx_recordatorios_user_id" ON "public"."recordatorios" USING "btree" ("user_id");



CREATE INDEX "idx_referral_attributions_referrer" ON "public"."referral_attributions" USING "btree" ("referrer_user_id");



CREATE INDEX "idx_referral_conversions_referrer" ON "public"."referral_conversions" USING "btree" ("referrer_user_id");



CREATE INDEX "idx_registro_afiliados_invites_owner" ON "public"."registro_afiliados_invites" USING "btree" ("owner_user_id");



CREATE INDEX "idx_soporte_tickets_created_at" ON "public"."soporte_tickets" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_soporte_tickets_status" ON "public"."soporte_tickets" USING "btree" ("status");



CREATE INDEX "idx_soporte_tickets_user_id" ON "public"."soporte_tickets" USING "btree" ("user_id");



CREATE INDEX "idx_support_chat_messages_thread_created" ON "public"."support_chat_messages" USING "btree" ("thread_id", "created_at");



CREATE INDEX "idx_support_chat_threads_updated" ON "public"."support_chat_threads" USING "btree" ("updated_at" DESC);



CREATE UNIQUE INDEX "ux_push_subscriptions_endpoint" ON "public"."push_subscriptions" USING "btree" ("endpoint");



CREATE UNIQUE INDEX "ux_recordatorios_cliente_autokey" ON "public"."recordatorios" USING "btree" ("cliente_id", "auto_key");



CREATE OR REPLACE TRIGGER "tr_support_chat_messages_touch_thread" AFTER INSERT ON "public"."support_chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."support_chat_touch_thread_updated_at"();



CREATE OR REPLACE TRIGGER "trg_asesor_cuentas_sync_referral_link" AFTER INSERT OR UPDATE OF "referral_code" ON "public"."asesor_cuentas" FOR EACH ROW EXECUTE FUNCTION "public"."asesor_referral_links_sync_from_cuentas"();



CREATE OR REPLACE TRIGGER "trg_asesor_referral_code" BEFORE INSERT OR UPDATE ON "public"."asesor_cuentas" FOR EACH ROW WHEN (("new"."referral_code" IS NULL)) EXECUTE FUNCTION "public"."asesor_cuentas_set_referral_code"();



CREATE OR REPLACE TRIGGER "trg_asesor_referral_links_biud" BEFORE INSERT OR UPDATE ON "public"."asesor_referral_links" FOR EACH ROW EXECUTE FUNCTION "public"."asesor_referral_links_biud"();



ALTER TABLE ONLY "public"."agenda_llamadas_invites"
    ADD CONSTRAINT "agenda_llamadas_invites_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agenda_reservas"
    ADD CONSTRAINT "agenda_reservas_cliente_potencial_id_fkey" FOREIGN KEY ("cliente_potencial_id") REFERENCES "public"."clientes_potenciales"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agenda_reservas"
    ADD CONSTRAINT "agenda_reservas_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asesor_cuentas"
    ADD CONSTRAINT "asesor_cuentas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asesor_disponibilidad"
    ADD CONSTRAINT "asesor_disponibilidad_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asesor_mandatario_perfil"
    ADD CONSTRAINT "asesor_mandatario_perfil_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asesor_referral_links"
    ADD CONSTRAINT "asesor_referral_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clientes_potenciales"
    ADD CONSTRAINT "clientes_potenciales_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."numeros_contrato"
    ADD CONSTRAINT "numeros_contrato_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."platform_owners"
    ADD CONSTRAINT "platform_owners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recordatorios"
    ADD CONSTRAINT "recordatorios_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recordatorios"
    ADD CONSTRAINT "recordatorios_cliente_potencial_id_fkey" FOREIGN KEY ("cliente_potencial_id") REFERENCES "public"."clientes_potenciales"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recordatorios"
    ADD CONSTRAINT "recordatorios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."referral_attributions"
    ADD CONSTRAINT "referral_attributions_referred_user_id_fkey" FOREIGN KEY ("referred_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_attributions"
    ADD CONSTRAINT "referral_attributions_referrer_user_id_fkey" FOREIGN KEY ("referrer_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_conversions"
    ADD CONSTRAINT "referral_conversions_referred_user_id_fkey" FOREIGN KEY ("referred_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_conversions"
    ADD CONSTRAINT "referral_conversions_referrer_user_id_fkey" FOREIGN KEY ("referrer_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."registro_afiliados_invites"
    ADD CONSTRAINT "registro_afiliados_invites_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."soporte_tickets"
    ADD CONSTRAINT "soporte_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_chat_messages"
    ADD CONSTRAINT "support_chat_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_chat_messages"
    ADD CONSTRAINT "support_chat_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."support_chat_threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_chat_threads"
    ADD CONSTRAINT "support_chat_threads_advisor_user_id_fkey" FOREIGN KEY ("advisor_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "agenda_inv_delete_own" ON "public"."agenda_llamadas_invites" FOR DELETE TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "agenda_inv_insert_own" ON "public"."agenda_llamadas_invites" FOR INSERT TO "authenticated" WITH CHECK (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "agenda_inv_select_own" ON "public"."agenda_llamadas_invites" FOR SELECT TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));



ALTER TABLE "public"."agenda_llamadas_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agenda_res_select_own" ON "public"."agenda_reservas" FOR SELECT TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));



ALTER TABLE "public"."agenda_reservas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."asesor_cuentas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asesor_cuentas_self_select" ON "public"."asesor_cuentas" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "asesor_disp_delete_own" ON "public"."asesor_disponibilidad" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "asesor_disp_insert_own" ON "public"."asesor_disponibilidad" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "asesor_disp_select_own" ON "public"."asesor_disponibilidad" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "asesor_disp_update_own" ON "public"."asesor_disponibilidad" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."asesor_disponibilidad" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."asesor_mandatario_perfil" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asesor_mandatario_perfil_insert_own" ON "public"."asesor_mandatario_perfil" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "asesor_mandatario_perfil_select_own" ON "public"."asesor_mandatario_perfil" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "asesor_mandatario_perfil_update_own" ON "public"."asesor_mandatario_perfil" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."asesor_referral_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asesor_referral_links_insert_own" ON "public"."asesor_referral_links" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "asesor_referral_links_select_own" ON "public"."asesor_referral_links" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "asesor_referral_links_update_own" ON "public"."asesor_referral_links" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."clientes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clientes_delete_propietario" ON "public"."clientes" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "clientes_insert_propietario" ON "public"."clientes" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."clientes_potenciales" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clientes_potenciales_delete_propietario" ON "public"."clientes_potenciales" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "clientes_potenciales_insert_propietario" ON "public"."clientes_potenciales" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "clientes_potenciales_select_propietario" ON "public"."clientes_potenciales" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "clientes_potenciales_update_propietario" ON "public"."clientes_potenciales" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "clientes_select_propietario" ON "public"."clientes" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "clientes_update_propietario" ON "public"."clientes" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."numeros_contrato" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "numeros_contrato_delete_propietario" ON "public"."numeros_contrato" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "numeros_contrato_insert_propietario" ON "public"."numeros_contrato" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "numeros_contrato_select_propietario" ON "public"."numeros_contrato" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "numeros_contrato_update_propietario" ON "public"."numeros_contrato" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "owner_self_select" ON "public"."platform_owners" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."platform_owners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recordatorios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recordatorios_delete_propietario" ON "public"."recordatorios" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "recordatorios_insert_propietario" ON "public"."recordatorios" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "recordatorios_select_propietario" ON "public"."recordatorios" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "recordatorios_update_propietario" ON "public"."recordatorios" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."referral_attributions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referral_conversions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."registro_afiliados_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "registro_invites_delete_own" ON "public"."registro_afiliados_invites" FOR DELETE TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "registro_invites_insert_own" ON "public"."registro_afiliados_invites" FOR INSERT TO "authenticated" WITH CHECK (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "registro_invites_select_own" ON "public"."registro_afiliados_invites" FOR SELECT TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));



ALTER TABLE "public"."soporte_tickets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "soporte_tickets_self_insert" ON "public"."soporte_tickets" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "soporte_tickets_self_select" ON "public"."soporte_tickets" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."support_chat_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "support_chat_messages_participant_insert" ON "public"."support_chat_messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."support_chat_threads" "t"
  WHERE (("t"."id" = "support_chat_messages"."thread_id") AND (("t"."advisor_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
           FROM "public"."platform_owners" "po"
          WHERE ("po"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))))));



CREATE POLICY "support_chat_messages_participant_select" ON "public"."support_chat_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."support_chat_threads" "t"
  WHERE (("t"."id" = "support_chat_messages"."thread_id") AND (("t"."advisor_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
           FROM "public"."platform_owners" "po"
          WHERE ("po"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))))));



ALTER TABLE "public"."support_chat_threads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "support_chat_threads_advisor_insert" ON "public"."support_chat_threads" FOR INSERT TO "authenticated" WITH CHECK (("advisor_user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "support_chat_threads_advisor_select" ON "public"."support_chat_threads" FOR SELECT TO "authenticated" USING ((("advisor_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."platform_owners" "po"
  WHERE ("po"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."support_chat_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."support_chat_threads";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































REVOKE ALL ON FUNCTION "public"."agendar_llamada_publica"("p_invite" "uuid", "p_fecha" "date", "p_hora" integer, "p_nombres" "text", "p_apellido_paterno" "text", "p_apellido_materno" "text", "p_ciudad" "text", "p_telefono" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agendar_llamada_publica"("p_invite" "uuid", "p_fecha" "date", "p_hora" integer, "p_nombres" "text", "p_apellido_paterno" "text", "p_apellido_materno" "text", "p_ciudad" "text", "p_telefono" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."agendar_llamada_publica"("p_invite" "uuid", "p_fecha" "date", "p_hora" integer, "p_nombres" "text", "p_apellido_paterno" "text", "p_apellido_materno" "text", "p_ciudad" "text", "p_telefono" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."agendar_llamada_publica"("p_invite" "uuid", "p_fecha" "date", "p_hora" integer, "p_nombres" "text", "p_apellido_paterno" "text", "p_apellido_materno" "text", "p_ciudad" "text", "p_telefono" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."asesor_cuentas_set_referral_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."asesor_cuentas_set_referral_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."asesor_cuentas_set_referral_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."asesor_referral_links_biud"() TO "anon";
GRANT ALL ON FUNCTION "public"."asesor_referral_links_biud"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."asesor_referral_links_biud"() TO "service_role";



GRANT ALL ON FUNCTION "public"."asesor_referral_links_sync_from_cuentas"() TO "anon";
GRANT ALL ON FUNCTION "public"."asesor_referral_links_sync_from_cuentas"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."asesor_referral_links_sync_from_cuentas"() TO "service_role";



GRANT ALL ON FUNCTION "public"."canonize_rut"("rut" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."canonize_rut"("rut" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."canonize_rut"("rut" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."obtener_agenda_publica"("p_invite" "uuid", "p_desde" "date", "p_hasta" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."obtener_agenda_publica"("p_invite" "uuid", "p_desde" "date", "p_hasta" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."obtener_agenda_publica"("p_invite" "uuid", "p_desde" "date", "p_hasta" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."obtener_agenda_publica"("p_invite" "uuid", "p_desde" "date", "p_hasta" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."registrar_cliente_por_invite"("p_invite" "uuid", "p_row" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registrar_cliente_por_invite"("p_invite" "uuid", "p_row" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."registrar_cliente_por_invite"("p_invite" "uuid", "p_row" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."registrar_cliente_por_invite"("p_invite" "uuid", "p_row" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."support_chat_touch_thread_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."support_chat_touch_thread_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."support_chat_touch_thread_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."agenda_llamadas_invites" TO "anon";
GRANT ALL ON TABLE "public"."agenda_llamadas_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."agenda_llamadas_invites" TO "service_role";



GRANT ALL ON TABLE "public"."agenda_reservas" TO "anon";
GRANT ALL ON TABLE "public"."agenda_reservas" TO "authenticated";
GRANT ALL ON TABLE "public"."agenda_reservas" TO "service_role";



GRANT ALL ON TABLE "public"."asesor_cuentas" TO "anon";
GRANT ALL ON TABLE "public"."asesor_cuentas" TO "authenticated";
GRANT ALL ON TABLE "public"."asesor_cuentas" TO "service_role";



GRANT ALL ON TABLE "public"."asesor_disponibilidad" TO "anon";
GRANT ALL ON TABLE "public"."asesor_disponibilidad" TO "authenticated";
GRANT ALL ON TABLE "public"."asesor_disponibilidad" TO "service_role";



GRANT ALL ON TABLE "public"."asesor_mandatario_perfil" TO "anon";
GRANT ALL ON TABLE "public"."asesor_mandatario_perfil" TO "authenticated";
GRANT ALL ON TABLE "public"."asesor_mandatario_perfil" TO "service_role";



GRANT ALL ON TABLE "public"."asesor_referral_links" TO "anon";
GRANT ALL ON TABLE "public"."asesor_referral_links" TO "authenticated";
GRANT ALL ON TABLE "public"."asesor_referral_links" TO "service_role";



GRANT ALL ON TABLE "public"."clientes" TO "anon";
GRANT ALL ON TABLE "public"."clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."clientes" TO "service_role";



GRANT ALL ON TABLE "public"."clientes_potenciales" TO "anon";
GRANT ALL ON TABLE "public"."clientes_potenciales" TO "authenticated";
GRANT ALL ON TABLE "public"."clientes_potenciales" TO "service_role";



GRANT ALL ON TABLE "public"."numeros_contrato" TO "anon";
GRANT ALL ON TABLE "public"."numeros_contrato" TO "authenticated";
GRANT ALL ON TABLE "public"."numeros_contrato" TO "service_role";



GRANT ALL ON TABLE "public"."platform_owners" TO "anon";
GRANT ALL ON TABLE "public"."platform_owners" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_owners" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."recordatorios" TO "anon";
GRANT ALL ON TABLE "public"."recordatorios" TO "authenticated";
GRANT ALL ON TABLE "public"."recordatorios" TO "service_role";



GRANT ALL ON TABLE "public"."referral_attributions" TO "anon";
GRANT ALL ON TABLE "public"."referral_attributions" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_attributions" TO "service_role";



GRANT ALL ON TABLE "public"."referral_conversions" TO "anon";
GRANT ALL ON TABLE "public"."referral_conversions" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_conversions" TO "service_role";



GRANT ALL ON TABLE "public"."registro_afiliados_invites" TO "anon";
GRANT ALL ON TABLE "public"."registro_afiliados_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."registro_afiliados_invites" TO "service_role";



GRANT ALL ON TABLE "public"."soporte_tickets" TO "anon";
GRANT ALL ON TABLE "public"."soporte_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."soporte_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."support_chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."support_chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."support_chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."support_chat_threads" TO "anon";
GRANT ALL ON TABLE "public"."support_chat_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."support_chat_threads" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































