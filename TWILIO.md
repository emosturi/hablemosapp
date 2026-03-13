# Configurar Twilio para notificaciones por WhatsApp

Esta guía te lleva paso a paso desde crear la cuenta en Twilio hasta recibir el aviso por WhatsApp cuando un cliente se registra en el formulario.

---

## 1. Crear cuenta en Twilio

1. Entra en **[twilio.com](https://www.twilio.com)** y haz clic en **Sign up**.
2. Completa email, contraseña y verifica tu número de teléfono.
3. En las preguntas iniciales puedes elegir "Explore the product" o "Build something"; no es obligatorio contratar un plan de pago para empezar.
4. Twilio te da crédito de prueba; con el **Sandbox de WhatsApp** puedes enviar mensajes sin coste durante las pruebas.

---

## 2. Obtener Account SID y Auth Token

1. En Twilio entra al **[Console (Dashboard)](https://console.twilio.com)**.
2. En la página principal verás:
   - **Account SID** (empieza por `AC...`).
   - **Auth Token** (clic en "Show" para verlo).
3. **Cópialos** y guárdalos en un lugar seguro. Los usarás en Netlify como:
   - `TWILIO_ACCOUNT_SID` = Account SID
   - `TWILIO_AUTH_TOKEN` = Auth Token

---

## 3. Activar WhatsApp Sandbox (para pruebas)

El Sandbox permite enviar y recibir mensajes de WhatsApp sin tener un número de negocio aprobado.

1. En el menú lateral de Twilio ve a **Messaging** → **Try it out** → **Send a WhatsApp message** (o **[Messaging > Try it out > WhatsApp](https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn)**).
2. Verás la sección **Sandbox**. Ahí aparece:
   - Un **número de Twilio** (ej: `+1 415 523 8886`).
   - Un **código de unión** (ej: `join <palabra>`).
3. **Con tu teléfono (el que quieres que reciba las notificaciones):**
   - Abre WhatsApp.
   - Crea un nuevo chat y agrega el número que muestra Twilio (ej: +1 415 523 8886, con código de país sin espacios).
   - Envía el mensaje exacto que indica Twilio, por ejemplo: `join palabra-secreta`.
4. Twilio confirmará que el número está conectado al Sandbox. A partir de ahí ese número puede **recibir** mensajes del Sandbox.

El valor **TWILIO_WHATSAPP_FROM** en Netlify debe ser el número del Sandbox en formato WhatsApp, por ejemplo:

- Si el número es `+1 415 523 8886` → `whatsapp:+14155238886`  
  (sin espacios, sin guiones, prefijo `whatsapp:`).

Anota ese valor; lo configurarás en Netlify como `TWILIO_WHATSAPP_FROM`.

---

## 4. Número al que quieres recibir las notificaciones

- Es el número que acabas de unir al Sandbox (el que envió `join ...`).
- En Netlify lo configuras como **NOTIFY_WHATSAPP_TO**.
- Formato: solo dígitos, con código de país. Para Chile: `56` + número de 9 dígitos (ej: `56912345678`). La función ya añade el prefijo `whatsapp:+` si hace falta.

---

## 5. Resumen de variables en Netlify

En tu sitio en Netlify: **Site configuration** → **Environment variables** → **Add a variable** (o **Add from .env**). Añade:

| Variable | Dónde la sacas | Ejemplo |
|----------|----------------|---------|
| `TWILIO_ACCOUNT_SID` | Console de Twilio (paso 2) | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Console de Twilio (paso 2) | `tu-auth-token-secreto` |
| `TWILIO_WHATSAPP_FROM` | Número del Sandbox (paso 3), con prefijo `whatsapp:+` | `whatsapp:+14155238886` |
| `NOTIFY_WHATSAPP_TO` | Tu número (el que recibe el aviso), solo dígitos | `56912345678` |
| `NOTIFY_SECRET` | Una contraseña que inventes (la misma en front y Netlify) | `miClaveSecreta123` |

Guarda los cambios y, si el sitio ya está desplegado, vuelve a desplegar para que las variables se apliquen.

---

## 6. Configuración en tu app (supabase-config.js)

En **supabase-config.js** (o donde cargues la config del front), descomenta y rellena:

```js
window.NOTIFY_FUNCTION_URL = "https://TU-SITIO.netlify.app/.netlify/functions/notify-whatsapp";
window.NOTIFY_SECRET = "miClaveSecreta123";   // la misma que NOTIFY_SECRET en Netlify
```

- **NOTIFY_FUNCTION_URL**: sustituye `TU-SITIO` por la URL real de tu sitio en Netlify (ej: `hablemosapp.netlify.app`). La ruta debe ser `/.netlify/functions/notify-whatsapp`.
- **NOTIFY_SECRET**: debe ser **exactamente** el mismo valor que la variable `NOTIFY_SECRET` en Netlify.

---

## 7. Probar que funciona

1. Despliega el sitio en Netlify con las variables de entorno configuradas.
2. Abre la página de **Alta de clientes** (clientes.html).
3. Completa el formulario con datos de prueba y envíalo.
4. Si todo está bien:
   - El cliente se guarda en Supabase.
   - La app llama a la función `notify-whatsapp`.
   - Deberías recibir un WhatsApp en el número configurado en `NOTIFY_WHATSAPP_TO` con el RUT, nombre y teléfono del cliente.

Si no recibes el mensaje:

- Revisa en Netlify **Functions** los logs de `notify-whatsapp` (errores de Twilio o de configuración).
- Comprueba que tu número haya enviado `join <código>` al número del Sandbox y que Twilio muestre el número como conectado.
- Comprueba que `TWILIO_WHATSAPP_FROM` sea exactamente `whatsapp:+XXXXXXXXXX` (sin espacios).

---

## 8. Producción (opcional): número de WhatsApp propio

Para usar un número de WhatsApp que no sea el Sandbox (ej: número de negocio):

1. En Twilio: **Messaging** → **WhatsApp** → **Senders** (o **Phone numbers** según la cuenta).
2. Solicita un **número de WhatsApp para negocio** (o enlaza uno existente). Twilio te guía por el proceso de verificación de Meta/Facebook.
3. Cuando tengas el número aprobado, usa ese número en formato `whatsapp:+56XXXXXXXXX` como `TWILIO_WHATSAPP_FROM` en Netlify.

Mientras tanto, el Sandbox es suficiente para recibir las notificaciones de nuevos clientes en tu propio número.

---

## 9. Recordatorios programados (opcional)

La app permite crear recordatorios desde **Ver cliente** que se envían por WhatsApp a **NOTIFY_WHATSAPP_TO** en la fecha indicada.

**Variables adicionales en Netlify:**

| Variable | Descripción |
|----------|-------------|
| `SUPABASE_URL` | URL de tu proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (Dashboard → Settings → API) |

**En supabase-config.js** añade:

```js
window.REMINDER_FUNCTION_URL = "https://TU-SITIO.netlify.app/.netlify/functions/send-reminder";
```

**Migración en Supabase:** ejecuta el contenido de `supabase-migration-recordatorios.sql` en SQL Editor.

**Funcionamiento:** `process-reminders` se ejecuta diariamente (~9:00 Chile) y envía los recordatorios programados para ese día a tu número (NOTIFY_WHATSAPP_TO).
