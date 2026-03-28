-- Agenda de llamadas: disponibilidad del asesor, reservas públicas por token, cliente potencial + recordatorio.
-- Requisitos: public.clientes_potenciales con user_id; public.recordatorios con user_id (migración multi-usuario).
-- Ejecutar en Supabase SQL Editor.

-- Opcional: vincular recordatorio al prospecto
alter table public.recordatorios
  add column if not exists cliente_potencial_id uuid references public.clientes_potenciales(id) on delete set null;

create index if not exists idx_recordatorios_cliente_potencial_id
  on public.recordatorios (cliente_potencial_id)
  where cliente_potencial_id is not null;

-- Disponibilidad: bloques JSON por día ISO 1=lunes … 7=domingo; valores = array de horas enteras 0–23
create table if not exists public.asesor_disponibilidad (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bloques jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

comment on table public.asesor_disponibilidad is 'Horarios disponibles para agendar llamadas; bloques["1"]..["7"] = arrays de hora (0-23).';

-- Un token público por asesor (como registro_afiliados_invites)
create table if not exists public.agenda_llamadas_invites (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

comment on table public.agenda_llamadas_invites is 'UUID en agendar-llamada.html?ref= para reservar llamada con un asesor.';

create index if not exists idx_agenda_invites_owner on public.agenda_llamadas_invites (owner_user_id);

-- Reservas (evita doble uso del mismo slot)
create table if not exists public.agenda_reservas (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  fecha date not null,
  hora smallint not null check (hora >= 0 and hora <= 23),
  cliente_potencial_id uuid references public.clientes_potenciales(id) on delete set null,
  created_at timestamptz default now(),
  constraint agenda_reservas_owner_fecha_hora_unique unique (owner_user_id, fecha, hora)
);

create index if not exists idx_agenda_reservas_owner_fecha on public.agenda_reservas (owner_user_id, fecha);

alter table public.asesor_disponibilidad enable row level security;
alter table public.agenda_llamadas_invites enable row level security;
alter table public.agenda_reservas enable row level security;

drop policy if exists "asesor_disp_select_own" on public.asesor_disponibilidad;
drop policy if exists "asesor_disp_upsert_own" on public.asesor_disponibilidad;
drop policy if exists "asesor_disp_delete_own" on public.asesor_disponibilidad;

create policy "asesor_disp_select_own"
  on public.asesor_disponibilidad for select to authenticated
  using (user_id = auth.uid());

create policy "asesor_disp_insert_own"
  on public.asesor_disponibilidad for insert to authenticated
  with check (user_id = auth.uid());

create policy "asesor_disp_update_own"
  on public.asesor_disponibilidad for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "asesor_disp_delete_own"
  on public.asesor_disponibilidad for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "agenda_inv_select_own" on public.agenda_llamadas_invites;
drop policy if exists "agenda_inv_insert_own" on public.agenda_llamadas_invites;
drop policy if exists "agenda_inv_delete_own" on public.agenda_llamadas_invites;

create policy "agenda_inv_select_own"
  on public.agenda_llamadas_invites for select to authenticated
  using (owner_user_id = auth.uid());

create policy "agenda_inv_insert_own"
  on public.agenda_llamadas_invites for insert to authenticated
  with check (owner_user_id = auth.uid());

create policy "agenda_inv_delete_own"
  on public.agenda_llamadas_invites for delete to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "agenda_res_select_own" on public.agenda_reservas;
create policy "agenda_res_select_own"
  on public.agenda_reservas for select to authenticated
  using (owner_user_id = auth.uid());

-- --- Funciones públicas (anon) ---

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
    'zona', 'America/Santiago'
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
  if v_tel = '' or length(v_tel) < 6 then
    return jsonb_build_object('ok', false, 'code', 'telefono_requerido');
  end if;

  select coalesce(bloques, '{}'::jsonb) into v_bloques
  from public.asesor_disponibilidad
  where user_id = v_owner;

  if v_bloques is null or v_bloques = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'code', 'sin_disponibilidad');
  end if;

  -- ISO: 1 = lunes … 7 = domingo
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

revoke all on function public.obtener_agenda_publica(uuid, date, date) from public;
revoke all on function public.agendar_llamada_publica(uuid, date, int, text, text, text, text, text) from public;

grant execute on function public.obtener_agenda_publica(uuid, date, date) to anon, authenticated;
grant execute on function public.agendar_llamada_publica(uuid, date, int, text, text, text, text, text) to anon, authenticated;

comment on function public.obtener_agenda_publica is 'Público: bloques y reservas para armar calendario de agendamiento.';
comment on function public.agendar_llamada_publica is 'Público: crea prospecto, reserva y recordatorio de llamada.';
