-- =============================================================================
-- Agenda v2: ventanas de disponibilidad + configuración duración/separación
-- =============================================================================
-- Objetivo: permitir al asesor pintar "ventanas" (rangos horarios) en vez de
-- horas enteras, y que el sistema ofrezca slots derivados de esas ventanas
-- según la duración de llamada y la separación (buffer) configuradas.
--
-- Estrategia: aditiva. Se AGREGAN tablas / columnas / RPCs nuevas sin tocar
-- las viejas. El frontend migra en commits posteriores. La columna legacy
-- `agenda_reservas.hora` queda sincronizada por trigger y se elimina más
-- adelante cuando todo el flujo viejo haya desaparecido.
--
-- Shape nuevo de `asesor_disponibilidad.ventanas`:
--   {
--     "1": [{"inicio": "09:00", "fin": "12:00"}, {"inicio": "14:00", "fin": "18:00"}],
--     "2": [...],
--     ...
--     "7": [...]
--   }
-- ISO dow: 1 = lunes, 7 = domingo.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tabla: asesor_agenda_config
-- -----------------------------------------------------------------------------
-- Duración de cada llamada y separación (buffer) entre llamadas, por asesor.
-- Se exigen múltiplos de 5 en vez de presets hardcoded, así el front puede
-- ajustar su UX sin necesitar migraciones nuevas.

create table if not exists public.asesor_agenda_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  duracion_llamada_minutos smallint not null default 60
    check (duracion_llamada_minutos > 0
           and duracion_llamada_minutos <= 480
           and (duracion_llamada_minutos % 5) = 0),
  separacion_minutos smallint not null default 0
    check (separacion_minutos >= 0
           and separacion_minutos <= 120
           and (separacion_minutos % 5) = 0),
  updated_at timestamptz default now()
);

comment on table public.asesor_agenda_config is
  'Configuración de agenda del asesor: duración de cada llamada y separación (buffer) entre llamadas.';
comment on column public.asesor_agenda_config.duracion_llamada_minutos is
  'Duración fija de cada llamada en minutos (múltiplo de 5, máx 480).';
comment on column public.asesor_agenda_config.separacion_minutos is
  'Tiempo de buffer entre llamadas en minutos (múltiplo de 5, máx 120, 0 = back-to-back).';

alter table public.asesor_agenda_config enable row level security;

drop policy if exists "aac_select_own" on public.asesor_agenda_config;
create policy "aac_select_own" on public.asesor_agenda_config
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "aac_insert_own" on public.asesor_agenda_config;
create policy "aac_insert_own" on public.asesor_agenda_config
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "aac_update_own" on public.asesor_agenda_config;
create policy "aac_update_own" on public.asesor_agenda_config
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "aac_delete_own" on public.asesor_agenda_config;
create policy "aac_delete_own" on public.asesor_agenda_config
  for delete to authenticated using (user_id = auth.uid());

grant all on table public.asesor_agenda_config to anon;
grant all on table public.asesor_agenda_config to authenticated;
grant all on table public.asesor_agenda_config to service_role;


-- -----------------------------------------------------------------------------
-- 2. asesor_disponibilidad: columna nueva `ventanas`
-- -----------------------------------------------------------------------------

alter table public.asesor_disponibilidad
  add column if not exists ventanas jsonb not null default '{}'::jsonb;

comment on column public.asesor_disponibilidad.ventanas is
  'Ventanas de disponibilidad semanales recurrentes. Shape: {"1":[{"inicio":"09:00","fin":"12:00"}],...}. ISO dow: 1=lunes..7=domingo. Reemplaza a `bloques` (legacy).';

-- Migración de `bloques` (horas enteras) → `ventanas` (rangos).
-- Consolida horas consecutivas en un solo rango.
-- Ejemplo: bloques: {"1":[9,10,11,14]} → ventanas: {"1":[{"inicio":"09:00","fin":"12:00"},{"inicio":"14:00","fin":"15:00"}]}
update public.asesor_disponibilidad ad
set ventanas = coalesce((
  select jsonb_object_agg(dow_key, ventanas_dia)
  from (
    select dow_key,
           jsonb_agg(
             jsonb_build_object(
               'inicio', lpad(rango_inicio::text, 2, '0') || ':00',
               'fin',    lpad((rango_fin + 1)::text, 2, '0') || ':00'
             )
             order by rango_inicio
           ) as ventanas_dia
    from (
      select dow_key,
             min(h) as rango_inicio,
             max(h) as rango_fin
      from (
        select dow_key, h,
               h - row_number() over (partition by dow_key order by h) as grp
        from (
          select dias.key as dow_key,
                 (hora_elem.h_val #>> '{}')::int as h
          from jsonb_each(ad.bloques) as dias(key, horas)
          cross join lateral jsonb_array_elements(dias.horas) as hora_elem(h_val)
        ) expanded_hours
      ) grouped
      group by dow_key, grp
    ) rangos
    group by dow_key
  ) resultados
), '{}'::jsonb)
where ad.ventanas = '{}'::jsonb
  and ad.bloques is not null
  and ad.bloques <> '{}'::jsonb;


-- -----------------------------------------------------------------------------
-- 3. agenda_reservas: columnas nuevas hora_inicio / duracion_minutos
-- -----------------------------------------------------------------------------
-- `hora_inicio` + `duracion_minutos` reemplazan a `hora` (que solo soportaba
-- horas en punto). La columna `hora` queda como legacy nullable y se sincroniza
-- automáticamente con un trigger cuando hora_inicio coincide con hora en punto.

alter table public.agenda_reservas
  add column if not exists hora_inicio time,
  add column if not exists duracion_minutos smallint
    check (duracion_minutos is null
           or (duracion_minutos > 0
               and duracion_minutos <= 480
               and (duracion_minutos % 5) = 0));

-- Poblar columnas nuevas desde `hora` para filas existentes.
update public.agenda_reservas
set hora_inicio = ((lpad(hora::text, 2, '0') || ':00:00')::time),
    duracion_minutos = 60
where hora_inicio is null
  and hora is not null;

-- Ahora hacemos NOT NULL las columnas nuevas y le damos default sensato a la duración.
alter table public.agenda_reservas
  alter column hora_inicio set not null,
  alter column duracion_minutos set not null,
  alter column duracion_minutos set default 60;

-- La columna legacy `hora` pasa a ser nullable (para slots no-en-hora-en-punto).
alter table public.agenda_reservas
  alter column hora drop not null;

-- El unique viejo (owner, fecha, hora) se rompería con slots fraccionales.
-- Lo reemplazamos por el nuevo (owner, fecha, hora_inicio).
alter table public.agenda_reservas
  drop constraint if exists agenda_reservas_owner_fecha_hora_unique;
alter table public.agenda_reservas
  drop constraint if exists agenda_reservas_hora_check;

alter table public.agenda_reservas
  add constraint agenda_reservas_owner_fecha_hora_inicio_unique
    unique (owner_user_id, fecha, hora_inicio);

create index if not exists idx_agenda_reservas_owner_fecha_hora_inicio
  on public.agenda_reservas (owner_user_id, fecha, hora_inicio);

comment on column public.agenda_reservas.hora_inicio is
  'Hora de inicio de la reserva (permite granularidad de 15min o mayor). Reemplaza a `hora` (legacy, solo horas enteras).';
comment on column public.agenda_reservas.duracion_minutos is
  'Duración de la llamada en minutos (snapshot al momento de la reserva, múltiplo de 5, máx 480).';


-- Trigger: sincroniza `hora` legacy desde `hora_inicio` automáticamente.
-- Solo rellena `hora` cuando hora_inicio cae en hora en punto; si no, queda NULL.
-- Se eliminará junto con la columna `hora` en una migración posterior.
create or replace function public.agenda_reservas_sync_hora_legacy()
returns trigger
language plpgsql
as $$
begin
  if new.hora_inicio is not null then
    if extract(minute from new.hora_inicio) = 0
       and extract(second from new.hora_inicio) = 0 then
      new.hora := extract(hour from new.hora_inicio)::smallint;
    else
      new.hora := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists agenda_reservas_sync_hora_legacy_trg on public.agenda_reservas;
create trigger agenda_reservas_sync_hora_legacy_trg
before insert or update of hora_inicio on public.agenda_reservas
for each row execute function public.agenda_reservas_sync_hora_legacy();


-- -----------------------------------------------------------------------------
-- 4. RPC: obtener_agenda_publica_v2
-- -----------------------------------------------------------------------------
-- Devuelve ventanas, config y slots derivados (expandidos) ya cruzados con
-- las reservas existentes. El cliente solo tiene que mostrar `slots` y
-- reservas; la derivación ocurre server-side.

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

  -- Slots expandidos: para cada fecha en el rango, para cada ventana del día
  -- de la semana, genera slots de v_duracion min separados por v_step min.
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
    -- Importante: usamos `date + time + interval` => timestamp, que NO envuelve
    -- a 24h como sí lo hace `time + interval`. Sin esto, generate_series produce
    -- slots fantasma cuando la suma cruza medianoche.
    select vpf.fecha,
           (date '2000-01-01' + vpf.v_inicio
              + ((n * v_step) || ' minutes')::interval) as slot_ts
    from ventanas_por_fecha vpf
    cross join generate_series(0, 200) n
    where (date '2000-01-01' + vpf.v_inicio
             + ((n * v_step + v_duracion) || ' minutes')::interval)
          <= (date '2000-01-01' + vpf.v_fin)
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
  from slots_expandidos;

  -- Reservas en el rango, con shape nuevo (hora_inicio + duracion_minutos).
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

alter function public.obtener_agenda_publica_v2(uuid, date, date) owner to postgres;

comment on function public.obtener_agenda_publica_v2(uuid, date, date) is
  'Público v2: retorna ventanas + config + slots expandidos + reservas (nuevo shape con hora_inicio/duracion_minutos).';

revoke all on function public.obtener_agenda_publica_v2(uuid, date, date) from public;
grant all on function public.obtener_agenda_publica_v2(uuid, date, date) to anon;
grant all on function public.obtener_agenda_publica_v2(uuid, date, date) to authenticated;
grant all on function public.obtener_agenda_publica_v2(uuid, date, date) to service_role;


-- -----------------------------------------------------------------------------
-- 5. RPC: agendar_llamada_publica_v2
-- -----------------------------------------------------------------------------
-- Recibe hora_inicio como texto "HH:MM" (permite slots de 15min, 30min, etc.).
-- Valida que el slot pedido cae dentro de una ventana del asesor y está
-- alineado con la cadencia (ventana.inicio + n × (duración + separación)).
-- Protege contra solapamientos con tstzrange.

create or replace function public.agendar_llamada_publica_v2(
  p_invite uuid,
  p_fecha date,
  p_hora_inicio text,
  p_nombres text,
  p_apellido_paterno text,
  p_apellido_materno text,
  p_ciudad text,
  p_telefono text
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

  -- Duplicado por teléfono: bloquea si este teléfono ya tiene una reserva activa
  -- (cuyo fin aún no pasó) con este mismo asesor.
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

  -- Chequea que exista al menos UNA ventana que:
  --   (a) contenga el slot completo (inicio <= hora_inicio y hora_inicio+dur <= fin)
  --   (b) esté alineada: (hora_inicio - ventana.inicio) es múltiplo exacto de v_step.
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

  -- Solapamiento con reservas existentes (usa tstzrange para soportar
  -- cualquier combinación de duraciones).
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

  insert into public.clientes_potenciales (user_id, nombre, telefono, ciudad)
  values (v_owner, v_nombre, v_tel, v_ciudad)
  returning id into v_pot_id;

  insert into public.agenda_reservas (
    owner_user_id, fecha, hora_inicio, duracion_minutos, cliente_potencial_id
  ) values (
    v_owner, p_fecha, v_hora_inicio, v_duracion, v_pot_id
  );

  v_hora_lbl := to_char(v_hora_inicio, 'HH24:MI');

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
    'hora_inicio', v_hora_lbl,
    'duracion_minutos', v_duracion
  );

exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'slot_ocupado');
end;
$$;

alter function public.agendar_llamada_publica_v2(uuid, date, text, text, text, text, text, text) owner to postgres;

comment on function public.agendar_llamada_publica_v2(uuid, date, text, text, text, text, text, text) is
  'Público v2: acepta hora_inicio "HH:MM", valida contra ventanas + config + solapamiento tstzrange. Min 6h antelación.';

revoke all on function public.agendar_llamada_publica_v2(uuid, date, text, text, text, text, text, text) from public;
grant all on function public.agendar_llamada_publica_v2(uuid, date, text, text, text, text, text, text) to anon;
grant all on function public.agendar_llamada_publica_v2(uuid, date, text, text, text, text, text, text) to authenticated;
grant all on function public.agendar_llamada_publica_v2(uuid, date, text, text, text, text, text, text) to service_role;


-- -----------------------------------------------------------------------------
-- 6. Seed inicial: config default (60min, 0 buffer) para asesores existentes
-- -----------------------------------------------------------------------------
-- Solo para quienes ya tienen al menos una fila en asesor_disponibilidad.
-- Los demás se crearán on-demand cuando configuren su agenda por primera vez.

insert into public.asesor_agenda_config (user_id, duracion_llamada_minutos, separacion_minutos)
select distinct user_id, 60, 0
from public.asesor_disponibilidad
on conflict (user_id) do nothing;
