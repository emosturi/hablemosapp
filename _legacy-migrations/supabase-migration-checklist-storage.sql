-- =============================================================================
-- Storage para archivos del checklist por cliente
-- Bucket: checklist-archivos
-- Estructura esperada desde frontend: <auth.uid()>/<cliente_id>/<item>/<timestamp>-archivo.ext
-- =============================================================================

-- 1) Crear bucket (privado)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'checklist-archivos',
  'checklist-archivos',
  false,
  15728640, -- 15 MB
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2) Policies RLS por usuario para storage.objects (bucket checklist-archivos)
drop policy if exists "checklist_storage_select_own" on storage.objects;
drop policy if exists "checklist_storage_insert_own" on storage.objects;
drop policy if exists "checklist_storage_update_own" on storage.objects;
drop policy if exists "checklist_storage_delete_own" on storage.objects;

create policy "checklist_storage_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'checklist-archivos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "checklist_storage_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'checklist-archivos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "checklist_storage_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'checklist-archivos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'checklist-archivos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "checklist_storage_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'checklist-archivos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

comment on policy "checklist_storage_select_own" on storage.objects is
  'Permite leer solo archivos del bucket checklist-archivos cuyo primer folder coincide con auth.uid().';
