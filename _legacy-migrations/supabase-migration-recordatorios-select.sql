-- Permitir a usuarios autenticados ver (SELECT) todos los recordatorios.
-- Ejecutar en Supabase: SQL Editor > New query > Pegar y Run

create policy "Autenticados pueden ver recordatorios"
  on public.recordatorios for select
  using (auth.role() = 'authenticated');
