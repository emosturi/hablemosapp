# Migraciones legacy (pre-Supabase CLI)

Esta carpeta contiene las **44 migraciones SQL** que se aplicaron a la base de datos
de Supabase **antes** de adoptar el flujo oficial con
[Supabase CLI](https://supabase.com/docs/guides/cli).

## ¿Para qué sirven?

**Solo referencia histórica.** No hay que volver a ejecutarlas. El estado actual de
la base de datos ya quedó capturado como baseline en:

```
supabase/migrations/20260422152440_remote_schema.sql
```

Ese archivo representa la **suma** de todos estos SQL legacy aplicada a la DB remota.

## ¿Cómo se aplicaban antes?

Manualmente:

1. Se escribía un archivo `supabase-migration-*.sql` en la raíz del repo.
2. Se copiaba el contenido al **SQL Editor** del dashboard de Supabase.
3. Se ejecutaba ahí.
4. Se commiteaba el `.sql` en git para mantener rastro.

Este flujo funcionaba pero tenía varios problemas:

- No había tracking automático de qué migración se había aplicado.
- Imposible replicar la DB en un entorno local o de staging.
- Orden temporal dependía del nombre del archivo, no de un timestamp estándar.

## ¿Cómo se hacen ahora?

Usando la Supabase CLI (ver `README.md` en la raíz del repo):

```bash
supabase migration new mi_cambio
# editar supabase/migrations/YYYYMMDDHHMMSS_mi_cambio.sql
supabase db reset   # prueba local con Docker
supabase db push    # aplica en la DB remota
```

## ¿Se pueden borrar estos archivos?

**Sí, eventualmente.** Están en git history de todas formas, así que si un día quieres
revisar qué hacía cada migración, siempre puedes `git log` o `git show`. Pero no hay
prisa por borrarlos: no afectan nada y pesan muy poco.
