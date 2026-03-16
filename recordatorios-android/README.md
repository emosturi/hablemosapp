# Recordatorios Hablemos (Android)

Aplicación Android que muestra **notificaciones nativas** en el teléfono para los recordatorios de la misma base de datos Supabase que usa la web (Hablemos). No usa Telegram ni WhatsApp: es una **redundancia** al envío por Telegram que ya tienes en Netlify, para que también recibas el aviso en el propio dispositivo.

## Requisitos

- Android 7.0 (API 24) o superior
- Misma base de datos Supabase que la app web
- Mismo usuario (email/contraseña) que en la web para iniciar sesión

## Configuración en Supabase

Ejecuta en el **SQL Editor** de Supabase la migración que permite a usuarios autenticados actualizar recordatorios (marcar `enviado = true`):

```sql
-- Archivo: supabase-migration-recordatorios-update.sql (en la raíz del proyecto web)
create policy "Autenticados pueden actualizar recordatorios"
  on public.recordatorios for update
  using (auth.role() = 'authenticated');
```

Sin esta política, la app no podrá marcar los recordatorios como enviados tras mostrar la notificación.

## Cómo abrir y compilar

1. Abre **Android Studio**.
2. **File → Open** y elige la carpeta `recordatorios-android`.
3. Espera a que Gradle sincronice.
4. Conecta un dispositivo o inicia un emulador y pulsa **Run**.

## Uso en el móvil

1. **Primera vez**
   - Pulsa **Ajustes** y rellena **Supabase URL** y **Supabase anon key** (los mismos que en la web; en Dashboard → Settings → API).
   - Guarda y vuelve.
   - Inicia sesión con **el mismo email y contraseña** que usas en la web (login de la app Hablemos).
   - En Android 13 o superior, acepta el permiso de notificaciones cuando lo pida la app.

2. **Notificaciones**
   - La app programa un trabajo en segundo plano cada **15 minutos** (zona Chile). Cuando llega la fecha y hora de un recordatorio, muestra una **notificación nativa** en el teléfono (bandeja de notificaciones) y marca `enviado = true` en Supabase.
   - Así evitas depender solo de Telegram: si Netlify no envía o no estás en Telegram, el móvil te avisa igual.
   - Puedes pulsar **Comprobar recordatorios ahora** para lanzar una comprobación inmediata.

3. **Sesión**
   - El token de sesión puede caducar (p. ej. en ~1 h). Si dejas de recibir notificaciones, abre la app y vuelve a iniciar sesión.

## Datos que usa

- **Tabla**: `recordatorios` (igual que la web).
- **Consulta**: `fecha = hoy (Chile)` y `enviado = false`. Para cada fila cuya hora ya pasó (o no tiene hora), muestra una notificación nativa y hace `PATCH` para poner `enviado = true`.
- **Zona horaria**: America/Santiago (igual que `process-reminders.js` en Netlify).

## Estructura del proyecto

- `app/src/main/java/com/hablemos/recordatorios/`
  - **MainActivity**: login, pantalla principal y ajustes (solo Supabase).
  - **ReminderWorker**: WorkManager que cada 15 min consulta Supabase y muestra notificaciones nativas (NotificationManager / NotificationCompat).
  - **SupabaseAuth**: login contra Supabase Auth (mismo usuario que la web).
  - **Prefs**: guarda URL, anon key y access token de sesión.
- **RecordatoriosApp**: arranca y programa el trabajo periódico de `ReminderWorker`.

## Notas

- Solo usuarios **autenticados** pueden leer y actualizar recordatorios (RLS). Por eso la app pide login con el mismo Supabase que la web.
- No se usa Telegram ni WhatsApp en esta app: todo es notificación nativa del sistema Android.
