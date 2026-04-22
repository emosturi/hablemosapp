-- Canonizar RUT solamente (sin borrar duplicados)
-- Convierte todos los RUT a formato canónico (solo dígitos y K).
-- Tú te encargas de borrar duplicados después; luego vuelve a añadir la restricción unique (ver al final).

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

-- 2. Quitar la restricción unique de rut para poder canonizar (habrá filas con el mismo rut canónico hasta que borres duplicados)
alter table public.clientes drop constraint if exists clientes_rut_key;

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

comment on function public.canonize_rut(text) is 'Normaliza RUT chileno a formato canónico: solo dígitos y K (ej. 123456785).';

-- Cuando termines de borrar duplicados manualmente, ejecuta esto para restaurar la restricción:
-- alter table public.clientes add constraint clientes_rut_key unique (rut);
