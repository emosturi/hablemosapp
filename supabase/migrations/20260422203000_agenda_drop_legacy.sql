-- =============================================================================
-- Agenda v2 — limpieza legacy (post-migración frontend a v2)
-- =============================================================================
-- Elimina: columna agenda_reservas.hora + trigger de sync, columna
-- asesor_disponibilidad.bloques, RPCs públicas obtener_agenda_publica /
-- agendar_llamada_publica (v1).
-- =============================================================================

-- Última pasada bloques → ventanas por si quedó alguna fila solo con bloques.
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

drop trigger if exists agenda_reservas_sync_hora_legacy_trg on public.agenda_reservas;
drop function if exists public.agenda_reservas_sync_hora_legacy();

alter table public.agenda_reservas drop column if exists hora;

drop function if exists public.obtener_agenda_publica(uuid, date, date);
drop function if exists public.agendar_llamada_publica(uuid, date, integer, text, text, text, text, text);

alter table public.asesor_disponibilidad drop column if exists bloques;

comment on table public.asesor_disponibilidad is
  'Horarios disponibles para agendar llamadas; ventanas["1"]..["7"] = rangos {inicio, fin} en HH:MM (ISO dow 1=lunes..7=domingo).';
