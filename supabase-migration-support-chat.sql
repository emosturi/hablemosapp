-- Chat de soporte asesor ↔ equipo (owners). Realtime + RLS.
-- Tras ejecutar, en Supabase → Database → Replication: confirma que support_chat_messages (y opcional threads) estén en la publicación realtime si no se añadieron aquí.

create table if not exists public.support_chat_threads (
  id uuid primary key default gen_random_uuid(),
  advisor_user_id uuid not null references auth.users (id) on delete cascade,
  advisor_email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_chat_threads_one_per_advisor unique (advisor_user_id)
);

create table if not exists public.support_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_chat_threads (id) on delete cascade,
  sender_user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint support_chat_messages_body_nonempty check (char_length(trim(body)) > 0)
);

create index if not exists idx_support_chat_messages_thread_created
  on public.support_chat_messages (thread_id, created_at);

create index if not exists idx_support_chat_threads_updated
  on public.support_chat_threads (updated_at desc);

comment on table public.support_chat_threads is 'Un hilo por asesor; los platform_owners leen y responden todos.';
comment on table public.support_chat_messages is 'Mensajes del chat de soporte; emisor asesor u owner.';

-- Mantener updated_at del hilo al llegar mensajes
create or replace function public.support_chat_touch_thread_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_chat_threads
  set updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists tr_support_chat_messages_touch_thread on public.support_chat_messages;
create trigger tr_support_chat_messages_touch_thread
  after insert on public.support_chat_messages
  for each row
  execute function public.support_chat_touch_thread_updated_at();

alter table public.support_chat_threads enable row level security;
alter table public.support_chat_messages enable row level security;

drop policy if exists "support_chat_threads_advisor_select" on public.support_chat_threads;
create policy "support_chat_threads_advisor_select"
  on public.support_chat_threads for select
  to authenticated
  using (
    advisor_user_id = (select auth.uid())
    or exists (
      select 1 from public.platform_owners po
      where po.user_id = (select auth.uid())
    )
  );

drop policy if exists "support_chat_threads_advisor_insert" on public.support_chat_threads;
create policy "support_chat_threads_advisor_insert"
  on public.support_chat_threads for insert
  to authenticated
  with check (advisor_user_id = (select auth.uid()));

drop policy if exists "support_chat_messages_participant_select" on public.support_chat_messages;
create policy "support_chat_messages_participant_select"
  on public.support_chat_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.support_chat_threads t
      where t.id = thread_id
        and (
          t.advisor_user_id = (select auth.uid())
          or exists (
            select 1 from public.platform_owners po
            where po.user_id = (select auth.uid())
          )
        )
    )
  );

drop policy if exists "support_chat_messages_participant_insert" on public.support_chat_messages;
create policy "support_chat_messages_participant_insert"
  on public.support_chat_messages for insert
  to authenticated
  with check (
    sender_user_id = (select auth.uid())
    and exists (
      select 1 from public.support_chat_threads t
      where t.id = thread_id
        and (
          t.advisor_user_id = (select auth.uid())
          or exists (
            select 1 from public.platform_owners po
            where po.user_id = (select auth.uid())
          )
        )
    )
  );

-- Realtime (puede requerir rol owner en algunos proyectos; si falla, activar manualmente en el panel).
do $$
begin
  alter publication supabase_realtime add table public.support_chat_messages;
exception
  when duplicate_object then null;
  when insufficient_privilege then
    raise notice 'No se pudo añadir support_chat_messages a supabase_realtime; actívalo en Database → Replication.';
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.support_chat_threads;
exception
  when duplicate_object then null;
  when insufficient_privilege then
    raise notice 'No se pudo añadir support_chat_threads a supabase_realtime; actívalo en Database → Replication.';
end;
$$;
