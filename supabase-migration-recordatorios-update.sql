-- Permitir a usuarios autenticados actualizar recordatorios (p. ej. marcar enviado = true).
-- Necesario para la app Android que envía los recordatorios por Telegram.
-- Ejecutar en Supabase: SQL Editor > New query > Pegar y Run

create policy "Autenticados pueden actualizar recordatorios"
  on public.recordatorios for update
  using (auth.role() = 'authenticated');
