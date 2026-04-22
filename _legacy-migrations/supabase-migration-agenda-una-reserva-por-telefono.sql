-- Agenda pública: una reserva activa por teléfono y asesor + mínimo 6 h de anticipación.
-- Ejecutar en Supabase SQL Editor después de supabase-migration-agenda-no-slots-pasados.sql
-- (reemplaza obtener_agenda_publica y agendar_llamada_publica).

create or replace function public.obtener_agenda_publica(
  p_invite uuid,
  p_desde date default null,
  p_hasta date default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

create or replace function public.agendar_llamada_publica(
  p_invite uuid,
  p_fecha date,
  p_hora int,
  p_nombres text,
  p_apellido_paterno text,
  p_apellido_materno text,
  p_ciudad text,
  p_telefono text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

comment on function public.obtener_agenda_publica is
  'Público: bloques, reservas, min_booking_at (now+6h) para ocultar franjas sin antelación suficiente.';

comment on function public.agendar_llamada_publica is
  'Público: mínimo 6 h de anticipación; una reserva activa por teléfono y asesor; slot pasado rechazado.';
