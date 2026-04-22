-- Si ya ejecutaste la migración anterior con insert público, ejecuta esto
-- para que solo usuarios autenticados puedan insertar y eliminar:

drop policy if exists "Permitir insert clientes potenciales público" on public.clientes_potenciales;

create policy "Solo autenticados pueden insertar clientes potenciales"
  on public.clientes_potenciales for insert
  with check (auth.role() = 'authenticated');

create policy "Solo autenticados pueden eliminar clientes potenciales"
  on public.clientes_potenciales for delete
  using (auth.role() = 'authenticated');
