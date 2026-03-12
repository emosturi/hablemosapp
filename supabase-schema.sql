-- Tabla de clientes (alta de clientes - formulario público)
-- Ejecutar en Supabase: SQL Editor > New query > Pegar y Run

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  rut text unique not null,
  nacionalidad text,
  sexo text,
  nombres text,
  apellido_paterno text,
  apellido_materno text,
  domicilio text,
  comuna text,
  ciudad text,
  fecha_nacimiento date,
  estado_civil text,
  profesion_oficio text,
  telefono text,
  email text,
  afp text,
  institucion_salud text,
  -- Cónyuge / Conviviente civil (si estado civil Casado/a o Conviviente civil)
  conyuge_nombres text,
  conyuge_apellido_paterno text,
  conyuge_apellido_materno text,
  conyuge_rut text,
  conyuge_fecha_nacimiento date,
  conyuge_fecha_matrimonio date,
  conyuge_lugar_matrimonio text,
  -- Hijos menores 24 años
  tiene_hijos_menores_24 boolean,
  hijos jsonb default '[]',
  -- Empleador
  empleador_razon_social text,
  empleador_rut text,
  empleador_direccion text,
  empleador_telefono text,
  empleador_email text,
  -- Datos bancarios
  banco text,
  tipo_cuenta text,
  numero_cuenta text,
  created_at timestamptz default now()
);

-- Índice para búsquedas por RUT
create index if not exists idx_clientes_rut on public.clientes (rut);

-- Habilitar Row Level Security (RLS)
alter table public.clientes enable row level security;

-- Permitir que cualquiera (incluso anónimos) inserte un cliente (formulario público)
create policy "Permitir insert cliente público"
  on public.clientes for insert
  with check (true);

-- Solo usuarios autenticados pueden ver la lista de clientes
create policy "Solo autenticados pueden leer clientes"
  on public.clientes for select
  using (auth.role() = 'authenticated');

-- Solo usuarios autenticados pueden actualizar/eliminar (opcional)
create policy "Solo autenticados pueden actualizar clientes"
  on public.clientes for update
  using (auth.role() = 'authenticated');

create policy "Solo autenticados pueden eliminar clientes"
  on public.clientes for delete
  using (auth.role() = 'authenticated');
