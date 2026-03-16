# Configurar Telegram para notificaciones

La app envía notificaciones por Telegram cuando:
- Un cliente se registra en el formulario
- Llega la fecha y hora de un recordatorio programado

---

## 1. Crear un bot en Telegram

1. Abre Telegram y busca **@BotFather**.
2. Envía `/newbot`.
3. Sigue las instrucciones: nombre del bot y nombre de usuario (debe terminar en `bot`).
4. BotFather te dará un **token** (ej. `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`). Guárdalo.

---

## 2. Obtener tu Chat ID

1. Envía cualquier mensaje a tu bot (ej. `/start`).
2. Abre en el navegador:
   ```
   https://api.telegram.org/bot<TU_TOKEN>/getUpdates
   ```
   Sustituye `<TU_TOKEN>` por el token del paso 1.
3. En la respuesta JSON busca `"chat":{"id": 123456789}`. Ese número es tu **Chat ID** (puede ser negativo si es un grupo).

---

## 3. Variables en Netlify

En **Site configuration** → **Environment variables** añade:

| Variable | Valor |
|----------|-------|
| `TELEGRAM_BOT_TOKEN` | Token del bot (ej. `123456789:ABCdef...`) |
| `TELEGRAM_CHAT_ID` | Tu Chat ID (ej. `123456789`) |
| `NOTIFY_SECRET` | Una contraseña que inventes (la misma en supabase-config.js) |

Para recordatorios también necesitas:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## 4. Configuración en la app (supabase-config.js)

```js
window.NOTIFY_FUNCTION_URL = "https://TU-SITIO.netlify.app/.netlify/functions/notify-telegram";
window.REMINDER_FUNCTION_URL = "https://TU-SITIO.netlify.app/.netlify/functions/send-reminder";
window.NOTIFY_SECRET = "tu-clave-secreta";
```

---

## 5. Flujo

- **Nuevo cliente:** Al registrarse en el formulario, la app llama a `notify-telegram` y recibes un mensaje en Telegram.
- **Recordatorios:** La función `process-reminders` se ejecuta cada 5 min (pruebas) o 15 min (producción) y envía los recordatorios pendientes a tu Chat ID.

No hay "join" ni sesiones que caduquen: siempre que el bot tenga el token y el chat_id correctos, los mensajes llegan.

---

## 6. App Android para notificaciones nativas (opcional)

En la carpeta **recordatorios-android** hay una aplicación Android que usa la misma base de datos y muestra **notificaciones nativas** en el teléfono por cada recordatorio (cada 15 min, zona Chile). No usa Telegram ni WhatsApp: es una redundancia para recibir el aviso también en el propio dispositivo. Ver [recordatorios-android/README.md](recordatorios-android/README.md). Necesitas ejecutar la migración `supabase-migration-recordatorios-update.sql` en Supabase para que la app pueda marcar los recordatorios como enviados tras mostrar la notificación.
