-- Suscripciones Web Push (PWA) por usuario. Ejecutar en Supabase SQL Editor.
-- Tras aplicar: en Netlify define VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:... o https://tu-dominio).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_push_subscriptions_endpoint on public.push_subscriptions (endpoint);
create index if not exists idx_push_subscriptions_user_id on public.push_subscriptions (user_id);

comment on table public.push_subscriptions is 'Claves Web Push por dispositivo; el servidor envía recordatorios vía VAPID.';

alter table public.push_subscriptions enable row level security;

-- Solo el servicio (Netlify Functions con service role) escribe; sin políticas para anon/authenticated.
-- Si en el futuro guardas desde el cliente con JWT, añade políticas SELECT/INSERT por auth.uid().
