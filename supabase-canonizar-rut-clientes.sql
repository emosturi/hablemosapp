-- Canonizar RUT en la base de datos de clientes
-- Convierte todos los RUT a formato canónico (solo dígitos y K) y resuelve duplicados.
-- Ejecutar en Supabase: SQL Editor > New query > Pegar y Run

-- 1. Función para obtener el RUT canónico (solo dígitos y K, mayúscula)
create or replace function public.canonize_rut(rut text)
returns text
language plpgsql
immutable
as $$
begin
  if rut is null or trim(rut) = '' then
    return null;
  end if;
  return upper(regexp_replace(trim(rut), '[^0-9K]', '', 'gi'));
end;
$$;

-- 2. Eliminar duplicados: dejar una sola fila por RUT canónico (se conserva la que tiene más datos)
-- Se cuenta cada campo no nulo/no vacío; en empate se conserva el de id más antiguo.
-- Si tu tabla no tiene conyuge_nacionalidad ni conyuge_sexo, comenta las dos líneas que las referencian en "scored".
with scored as (
  select
    id,
    canonize_rut(rut) as rut_can,
    (nombres is not null and trim(nombres) <> '')::int +
    (apellido_paterno is not null and trim(apellido_paterno) <> '')::int +
    (apellido_materno is not null and trim(apellido_materno) <> '')::int +
    (nacionalidad is not null and trim(nacionalidad) <> '')::int +
    (sexo is not null and trim(sexo) <> '')::int +
    (domicilio is not null and trim(domicilio) <> '')::int +
    (comuna is not null and trim(comuna) <> '')::int +
    (ciudad is not null and trim(ciudad) <> '')::int +
    (fecha_nacimiento is not null)::int +
    (estado_civil is not null and trim(estado_civil) <> '')::int +
    (profesion_oficio is not null and trim(profesion_oficio) <> '')::int +
    (telefono is not null and trim(telefono) <> '')::int +
    (email is not null and trim(email) <> '')::int +
    (afp is not null and trim(afp) <> '')::int +
    (institucion_salud is not null and trim(institucion_salud) <> '')::int +
    (conyuge_nombres is not null and trim(conyuge_nombres) <> '')::int +
    (conyuge_apellido_paterno is not null and trim(conyuge_apellido_paterno) <> '')::int +
    (conyuge_apellido_materno is not null and trim(conyuge_apellido_materno) <> '')::int +
    (conyuge_rut is not null and trim(conyuge_rut) <> '')::int +
    (conyuge_fecha_nacimiento is not null)::int +
    (conyuge_fecha_matrimonio is not null)::int +
    (conyuge_lugar_matrimonio is not null and trim(conyuge_lugar_matrimonio) <> '')::int +
    (conyuge_nacionalidad is not null and trim(conyuge_nacionalidad) <> '')::int +
    (conyuge_sexo is not null and trim(conyuge_sexo) <> '')::int +
    (tiene_hijos_menores_24 is not null)::int +
    case when hijos is not null and jsonb_typeof(hijos) = 'array' then least(jsonb_array_length(hijos), 10) + 1 else 0 end +
    (empleador_razon_social is not null and trim(empleador_razon_social) <> '')::int +
    (empleador_rut is not null and trim(empleador_rut) <> '')::int +
    (empleador_direccion is not null and trim(empleador_direccion) <> '')::int +
    (empleador_telefono is not null and trim(empleador_telefono) <> '')::int +
    (empleador_email is not null and trim(empleador_email) <> '')::int +
    (banco is not null and trim(banco) <> '')::int +
    (tipo_cuenta is not null and trim(tipo_cuenta) <> '')::int +
    (numero_cuenta is not null and trim(numero_cuenta) <> '')::int
    as info_score
  from public.clientes
),
best as (
  select distinct on (rut_can) id
  from scored
  order by rut_can, info_score desc, id asc
)
delete from public.clientes
where id not in (select id from best);

-- 3. Actualizar RUT del cliente a formato canónico
update public.clientes
set rut = canonize_rut(rut)
where rut is not null and rut <> canonize_rut(rut);

-- 4. Actualizar RUT de cónyuge
update public.clientes
set conyuge_rut = canonize_rut(conyuge_rut)
where conyuge_rut is not null and conyuge_rut <> canonize_rut(conyuge_rut);

-- 5. Actualizar RUT de empleador
update public.clientes
set empleador_rut = canonize_rut(empleador_rut)
where empleador_rut is not null and empleador_rut <> canonize_rut(empleador_rut);

-- 6. Actualizar RUT dentro del JSONB "hijos" (cada hijo puede tener rut)
update public.clientes
set hijos = (
  select coalesce(
    jsonb_agg(
      (elem - 'rut') || jsonb_build_object('rut', canonize_rut(elem->>'rut'))
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(hijos) as elem
)
where hijos is not null
  and jsonb_typeof(hijos) = 'array'
  and jsonb_array_length(hijos) > 0;

-- (numeros_contrato.rut_mandante ya se guarda en canónico desde la app, no es necesario actualizarlo)

-- Comentario para documentar la función
comment on function public.canonize_rut(text) is 'Normaliza RUT chileno a formato canónico: solo dígitos y K (ej. 123456785).';
