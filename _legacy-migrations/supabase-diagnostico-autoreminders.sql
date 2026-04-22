-- Diagnóstico rápido para autoreminders

-- 1) Ver columnas nuevas en recordatorios
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'recordatorios'
  and column_name in ('auto_generado', 'auto_key', 'cliente_id', 'fecha', 'hora', 'mensaje', 'enviado')
order by column_name;

-- 2) Ver índice único cliente_id + auto_key
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'recordatorios'
  and indexname = 'ux_recordatorios_cliente_autokey';

-- 3) Ver políticas RLS de recordatorios
select policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'recordatorios'
order by cmd, policyname;
