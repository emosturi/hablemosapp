-- Notas libres del asesor en ficha de cliente y cliente potencial (ver-cliente / ver-potencial).
-- Ejecutar en Supabase SQL Editor.

alter table public.clientes
  add column if not exists notas_asesor text;

alter table public.clientes_potenciales
  add column if not exists notas_asesor text;

comment on column public.clientes.notas_asesor is
  'Texto acumulado: notas internas del asesor sobre el cliente (afiliado o pensionado).';

comment on column public.clientes_potenciales.notas_asesor is
  'Texto acumulado: notas internas del asesor sobre el cliente potencial.';

-- Actualizar filas propias (p. ej. notas); requisito: migración multi-usuario con user_id en clientes_potenciales.
drop policy if exists "clientes_potenciales_update_propietario" on public.clientes_potenciales;

create policy "clientes_potenciales_update_propietario"
  on public.clientes_potenciales for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
