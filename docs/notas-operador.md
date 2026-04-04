# Notas de operador (uso interno)

Texto que **no** se muestra en la app; solo para quien despliega o administra la plataforma.

Si no quieres versionar este archivo en el remoto, añádelo a `.gitignore`.

---

## Recordatorios y Telegram

Al llegar la fecha, cada recordatorio se envía por Telegram al chat personal del asesor. Si falta vincular Telegram, verás un aviso rojo arriba con el enlace para configurarlo (esta pantalla y la agenda de llamadas). El teléfono de tu cuenta debe coincidir con el que usas en Telegram; la plataforma también puede usar el mapa `TELEGRAM_CHAT_BY_PHONE_JSON` en Netlify.

---

## Agenda de llamadas (migraciones SQL)

- `supabase-migration-agenda-llamadas.sql`
- Si la agenda ya existía, aplica además `supabase-migration-agenda-no-slots-pasados.sql` para no ofrecer horas ya pasadas.

Si **Mi disponibilidad** falla al guardar: ejecutar en Supabase `supabase-migration-agenda-llamadas.sql`.

---

## Enlace registro público de afiliados

Si no aparece el enlace en la pantalla correspondiente, ejecutar en Supabase la migración `supabase-migration-registro-afiliados-enlace-publico.sql`.
