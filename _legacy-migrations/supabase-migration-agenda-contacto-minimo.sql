-- Refuerzo: reservas siempre con prospecto y teléfono con dígitos reales.
-- Para bases que YA ejecutaron supabase-migration-agenda-llamadas.sql (esquema antiguo).
-- Ejecutar en Supabase SQL Editor (una vez).

-- 1) Reservas sin prospecto (no hay nombre/teléfono que mostrar)
delete from public.agenda_reservas
where cliente_potencial_id is null;

-- 2) FK: si se borra el prospecto, se borra la reserva de agenda (evita huecos)
alter table public.agenda_reservas
  drop constraint if exists agenda_reservas_cliente_potencial_id_fkey;

alter table public.agenda_reservas
  alter column cliente_potencial_id set not null;

alter table public.agenda_reservas
  add constraint agenda_reservas_cliente_potencial_id_fkey
  foreign key (cliente_potencial_id)
  references public.clientes_potenciales(id)
  on delete cascade;

-- 3) Misma lógica que en supabase-migration-agenda-llamadas.sql (teléfono ≥ 8 dígitos)
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
  v_ciudad text;
  v_pot_id uuid;
  v_hora_lbl text;
  v_hoy date;
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

  v_nombre := trim(concat_ws(' ',
    nullif(trim(coalesce(p_nombres, '')), ''),
    nullif(trim(coalesce(p_apellido_paterno, '')), ''),
    nullif(trim(coalesce(p_apellido_materno, '')), '')
  ));
  v_tel := trim(coalesce(p_telefono, ''));
  v_ciudad := nullif(trim(coalesce(p_ciudad, '')), '');

  if v_nombre = '' or length(v_nombre) < 3 then
    return jsonb_build_object('ok', false, 'code', 'nombre_requerido');
  end if;
  if length(regexp_replace(v_tel, '\D', '', 'g')) < 8 then
    return jsonb_build_object('ok', false, 'code', 'telefono_requerido');
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
