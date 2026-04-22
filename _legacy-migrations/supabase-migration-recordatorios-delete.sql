-- Permitir a usuarios autenticados borrar recordatorios desde el listado.
-- Ejecutar en Supabase: SQL Editor > New query > Pegar y Run

create policy "Autenticados pueden borrar recordatorios"
  on public.recordatorios for delete
  using (auth.role() = 'authenticated');
