-- Cuadrícula de agenda y recordatorios: slots cada 15 min (no 5 min).
-- Alineado con cron process-reminders cada 15 minutos.

update public.asesor_agenda_config
set separacion_minutos = 15
where separacion_minutos in (5, 10);

alter table public.asesor_agenda_config
  drop constraint if exists asesor_agenda_config_duracion_llamada_minutos_check;

alter table public.asesor_agenda_config
  add constraint asesor_agenda_config_duracion_llamada_minutos_check
  check (
    duracion_llamada_minutos > 0
    and duracion_llamada_minutos <= 480
    and (duracion_llamada_minutos % 15) = 0
  );

alter table public.asesor_agenda_config
  drop constraint if exists asesor_agenda_config_separacion_minutos_check;

alter table public.asesor_agenda_config
  add constraint asesor_agenda_config_separacion_minutos_check
  check (
    separacion_minutos >= 0
    and separacion_minutos <= 120
    and (separacion_minutos % 15) = 0
  );

alter table public.agenda_reservas
  drop constraint if exists agenda_reservas_duracion_minutos_check;

alter table public.agenda_reservas
  add constraint agenda_reservas_duracion_minutos_check
  check (
    duracion_minutos is null
    or (
      duracion_minutos > 0
      and duracion_minutos <= 480
      and (duracion_minutos % 15) = 0
    )
  );

comment on column public.asesor_agenda_config.duracion_llamada_minutos is
  'Duración fija de cada llamada en minutos (múltiplo de 15, máx 480).';
comment on column public.asesor_agenda_config.separacion_minutos is
  'Tiempo de buffer entre llamadas en minutos (múltiplo de 15, máx 120, 0 = back-to-back).';

create or replace function public.obtener_agenda_publica_v2(
  p_invite uuid,
  p_desde date default null,
  p_hasta date default null
) returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_owner uuid;
  v_ventanas jsonb;
  v_duracion int;
  v_separacion int;
  v_step int;
  v_desde date;
  v_hasta date;
  v_slots jsonb;
  v_reservas jsonb;
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

  select coalesce(ventanas, '{}'::jsonb) into v_ventanas
  from public.asesor_disponibilidad
  where user_id = v_owner;
  if v_ventanas is null then
    v_ventanas := '{}'::jsonb;
  end if;

  select duracion_llamada_minutos, separacion_minutos
    into v_duracion, v_separacion
  from public.asesor_agenda_config
  where user_id = v_owner;
  v_duracion := coalesce(v_duracion, 60);
  v_separacion := coalesce(v_separacion, 0);
  v_step := v_duracion + v_separacion;

  v_desde := coalesce(p_desde, (timezone('America/Santiago', now()))::date);
  v_hasta := coalesce(p_hasta, v_desde + 21);
  if v_hasta < v_desde then
    v_hasta := v_desde + 21;
  end if;
  if v_hasta > v_desde + 60 then
    v_hasta := v_desde + 60;
  end if;

  with fechas as (
    select d::date as fecha,
           extract(isodow from d::date)::int as dow
    from generate_series(v_desde, v_hasta, interval '1 day') d
  ),
  ventanas_por_fecha as (
    select f.fecha,
           (v ->> 'inicio')::time as v_inicio,
           (v ->> 'fin')::time    as v_fin
    from fechas f
    cross join lateral jsonb_array_elements(
      coalesce(v_ventanas -> f.dow::text, '[]'::jsonb)
    ) v
  ),
  slots_expandidos as (
    select vpf.fecha,
           (date '2000-01-01' + vpf.v_inicio
              + ((n * v_step) || ' minutes')::interval) as slot_ts
    from ventanas_por_fecha vpf
    cross join generate_series(0, 200) n
    where (date '2000-01-01' + vpf.v_inicio
             + ((n * v_step + v_duracion) || ' minutes')::interval)
          <= (date '2000-01-01' + vpf.v_fin)
  ),
  slots_cuadricula as (
    select fecha, slot_ts
    from slots_expandidos
    where (extract(minute from slot_ts)::int % 15) = 0
      and floor(extract(second from slot_ts))::int = 0
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'fecha', fecha,
        'hora_inicio', to_char(slot_ts, 'HH24:MI'),
        'duracion_minutos', v_duracion
      )
      order by fecha, slot_ts
    ),
    '[]'::jsonb
  )
  into v_slots
  from slots_cuadricula;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'fecha', r.fecha,
        'hora_inicio', to_char(r.hora_inicio, 'HH24:MI'),
        'duracion_minutos', r.duracion_minutos
      )
      order by r.fecha, r.hora_inicio
    ),
    '[]'::jsonb
  )
  into v_reservas
  from public.agenda_reservas r
  where r.owner_user_id = v_owner
    and r.fecha >= v_desde
    and r.fecha <= v_hasta;

  return jsonb_build_object(
    'ok', true,
    'ventanas', v_ventanas,
    'duracion_minutos', v_duracion,
    'separacion_minutos', v_separacion,
    'slots', v_slots,
    'reservas', coalesce(v_reservas, '[]'::jsonb),
    'desde', v_desde,
    'hasta', v_hasta,
    'zona', 'America/Santiago',
    'hoy_zona', (timezone('America/Santiago', now()))::date,
    'min_booking_at', to_jsonb(now() + interval '6 hours'),
    'min_hours_advance', 6
  );
end;
$$;

create or replace function public.agendar_llamada_publica_v2(
  p_invite uuid,
  p_fecha date,
  p_hora_inicio text,
  p_nombres text,
  p_apellido_paterno text,
  p_apellido_materno text,
  p_ciudad text,
  p_telefono text,
  p_tema text default null,
  p_mensaje_breve text default null,
  p_origen_codigo text default null
) returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_owner uuid;
  v_dow int;
  v_ventanas jsonb;
  v_day_ventanas jsonb;
  v_duracion int;
  v_separacion int;
  v_step int;
  v_hora_inicio time;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_hoy date;
  v_nombre text;
  v_tel text;
  v_tel_digits text;
  v_ciudad text;
  v_pot_id uuid;
  v_hora_lbl text;
  v_ok_slot boolean := false;
  v_tema_key text;
  v_tema_lbl text;
  v_msj text;
  v_origen_cod text;
  v_origen_lbl text;
  v_notas text;
  v_reminder text;
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

  begin
    v_hora_inicio := p_hora_inicio::time;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'hora_invalida');
  end;

  if v_hora_inicio is null then
    return jsonb_build_object('ok', false, 'code', 'hora_invalida');
  end if;

  if (extract(minute from v_hora_inicio)::int % 15) <> 0
     or floor(extract(second from v_hora_inicio))::int <> 0 then
    return jsonb_build_object('ok', false, 'code', 'hora_invalida');
  end if;

  select duracion_llamada_minutos, separacion_minutos
    into v_duracion, v_separacion
  from public.asesor_agenda_config
  where user_id = v_owner;
  v_duracion := coalesce(v_duracion, 60);
  v_separacion := coalesce(v_separacion, 0);
  v_step := v_duracion + v_separacion;

  v_slot_start := (
    (p_fecha::text || ' ' || to_char(v_hora_inicio, 'HH24:MI') || ':00')::timestamp
    at time zone 'America/Santiago'
  );
  v_slot_end := v_slot_start + (v_duracion || ' minutes')::interval;

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

  v_tema_key := lower(trim(coalesce(p_tema, '')));
  v_tema_lbl := case v_tema_key
    when 'rentas_vitalicias' then 'Rentas vitalicias'
    when 'retiro_programado' then 'Retiro programado'
    when 'pension_sobrevivencia' then 'Pensión de sobrevivencia'
    when 'invalidez' then 'Invalidez'
    else null
  end;
  if v_tema_lbl is null then
    return jsonb_build_object('ok', false, 'code', 'tema_invalido');
  end if;

  v_msj := nullif(trim(coalesce(p_mensaje_breve, '')), '');
  if v_msj is not null and length(v_msj) > 500 then
    v_msj := left(v_msj, 500);
  end if;

  v_origen_cod := lower(trim(coalesce(p_origen_codigo, '')));
  v_origen_lbl := case v_origen_cod
    when '' then null
    when 'ig' then 'Instagram'
    when 'fb' then 'Facebook'
    when 'li' then 'LinkedIn'
    when 'wa' then 'WhatsApp'
    when 'tg' then 'Telegram'
    when 'tt' then 'TikTok'
    when 'yt' then 'YouTube'
    when 'mail' then 'Correo electrónico'
    when 'buscoasesor' then 'buscoasesor.cl'
    when 'referido' then 'Referido'
    when 'web' then 'Web / otro'
    else null
  end;
  if v_origen_cod <> '' and v_origen_lbl is null then
    return jsonb_build_object('ok', false, 'code', 'origen_invalido');
  end if;

  v_notas := 'Tema de la llamada: ' || v_tema_lbl;
  if v_msj is not null then
    v_notas := v_notas || e'\n\n' || 'Mensaje: ' || v_msj;
  end if;
  if v_origen_lbl is not null then
    v_notas := v_notas || e'\n\n' || '(' || v_origen_lbl || ')';
  end if;

  if exists (
    select 1
    from public.agenda_reservas r
    inner join public.clientes_potenciales cp on cp.id = r.cliente_potencial_id
    where r.owner_user_id = v_owner
      and regexp_replace(coalesce(cp.telefono, ''), '\D', '', 'g') = v_tel_digits
      and (
        (r.fecha::text || ' ' || to_char(r.hora_inicio, 'HH24:MI') || ':00')::timestamp
        at time zone 'America/Santiago'
        + (r.duracion_minutos || ' minutes')::interval
      ) > now()
  ) then
    return jsonb_build_object('ok', false, 'code', 'ya_tiene_reserva');
  end if;

  select coalesce(ventanas, '{}'::jsonb) into v_ventanas
  from public.asesor_disponibilidad
  where user_id = v_owner;

  if v_ventanas is null or v_ventanas = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'code', 'sin_disponibilidad');
  end if;

  v_dow := extract(isodow from p_fecha)::int;
  v_day_ventanas := v_ventanas -> (v_dow::text);

  if v_day_ventanas is null or jsonb_typeof(v_day_ventanas) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'slot_no_disponible');
  end if;

  select exists (
    select 1
    from jsonb_array_elements(v_day_ventanas) v,
         lateral (select (v ->> 'inicio')::time as vi,
                         (v ->> 'fin')::time    as vf) t
    where t.vi <= v_hora_inicio
      and (date '2000-01-01' + v_hora_inicio + (v_duracion || ' minutes')::interval)
          <= (date '2000-01-01' + t.vf)
      and (
        extract(epoch from (v_hora_inicio - t.vi))::int / 60
      ) % v_step = 0
  ) into v_ok_slot;

  if not v_ok_slot then
    return jsonb_build_object('ok', false, 'code', 'slot_no_disponible');
  end if;

  if exists (
    select 1
    from public.agenda_reservas r
    where r.owner_user_id = v_owner
      and r.fecha = p_fecha
      and tstzrange(
        (r.fecha::text || ' ' || to_char(r.hora_inicio, 'HH24:MI') || ':00')::timestamp
          at time zone 'America/Santiago',
        (r.fecha::text || ' ' || to_char(r.hora_inicio, 'HH24:MI') || ':00')::timestamp
          at time zone 'America/Santiago'
          + (r.duracion_minutos || ' minutes')::interval
      ) && tstzrange(v_slot_start, v_slot_end)
  ) then
    return jsonb_build_object('ok', false, 'code', 'slot_ocupado');
  end if;

  insert into public.clientes_potenciales (user_id, nombre, telefono, ciudad, notas_asesor)
  values (v_owner, v_nombre, v_tel, v_ciudad, v_notas)
  returning id into v_pot_id;

  insert into public.agenda_reservas (
    owner_user_id, fecha, hora_inicio, duracion_minutos, cliente_potencial_id
  ) values (
    v_owner, p_fecha, v_hora_inicio, v_duracion, v_pot_id
  );

  v_hora_lbl := to_char(v_hora_inicio, 'HH24:MI');

  v_reminder := 'Llamada telefónica agendada por la web. Tema: ' || v_tema_lbl ||
    '. Prospecto — ciudad: ' || coalesce(v_ciudad, '—') || '.';

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
    v_reminder,
    false,
    false
  );

  return jsonb_build_object(
    'ok', true,
    'cliente_potencial_id', v_pot_id,
    'fecha', p_fecha,
    'hora_inicio', v_hora_lbl,
    'duracion_minutos', v_duracion
  );

exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'slot_ocupado');
end;
$$;

comment on function public.obtener_agenda_publica_v2(uuid, date, date) is
  'Público v2: slots en cuadrícula de 15 min; ventanas + config + reservas.';

comment on function public.agendar_llamada_publica_v2(uuid, date, text, text, text, text, text, text, text, text, text) is
  'Público v2: hora_inicio HH:MM en cuadrícula de 15 min; tema obligatorio; notas en clientes_potenciales.';
