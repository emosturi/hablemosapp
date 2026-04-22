-- Tabla de recordatorios: se programan para una fecha y se envían por WhatsApp a NOTIFY_WHATSAPP_TO
-- Ejecutar en Supabase: SQL Editor > New query > Pegar y Run

create table if not exists public.recordatorios (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  cliente_nombre text,
  cliente_telefono text,
  fecha date not null,
  hora text,
  mensaje text not null,
  enviado boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_recordatorios_fecha_enviado on public.recordatorios (fecha, enviado);

alter table public.recordatorios enable row level security;

-- Solo usuarios autenticados pueden insertar (desde la app)
create policy "Autenticados pueden insertar recordatorios"
  on public.recordatorios for insert
  with check (auth.role() = 'authenticated');

-- El proceso de envío (server-side con service role) no usa RLS
-- Permitir service_role full access (por defecto ya tiene bypass RLS)
