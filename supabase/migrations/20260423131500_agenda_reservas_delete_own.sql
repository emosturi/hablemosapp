-- El asesor puede eliminar sus propias reservas públicas desde la agenda (authenticated + RLS).

drop policy if exists "agenda_res_delete_own" on public.agenda_reservas;

create policy "agenda_res_delete_own"
  on public.agenda_reservas for delete to authenticated
  using (owner_user_id = auth.uid());

comment on policy agenda_res_delete_own on public.agenda_reservas is
  'Solo el dueño puede borrar filas agenda_reservas (anular llamada agendada).';
