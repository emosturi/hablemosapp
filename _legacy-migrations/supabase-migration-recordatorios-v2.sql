-- Si ya ejecutaste supabase-migration-recordatorios.sql, ejecuta esto para añadir hora y cliente_telefono:

alter table public.recordatorios add column if not exists cliente_telefono text;
alter table public.recordatorios add column if not exists hora text;
