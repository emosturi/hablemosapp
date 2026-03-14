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
| `NOTIFY_WHATSAPP_TO` | Tu número (el que recibe el aviso), **solo dígitos**, nunca `whatsapp:+...` | `56912345678` |
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
2. Abre la página de **Registro de Afiliados** (clientes.html).
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

**Funcionamiento:** `process-reminders` se ejecuta cada 15 minutos y envía los recordatorios cuya fecha es hoy (hora Chile) y cuya hora ya pasó a tu número (NOTIFY_WHATSAPP_TO).

**Si el recordatorio aparece como «Enviado» en la app pero el mensaje nunca llegó a tu WhatsApp:**

- **Mismo destino para todos:** Tanto los recordatorios creados desde **Ver cliente** como desde **Ver cliente potencial** se envían al mismo número (**NOTIFY_WHATSAPP_TO**). No hay diferencia de destino; si otros recordatorios sí llegan, la configuración actual es correcta.
- **Enviado = aceptado por Twilio:** La app marca «Enviado» cuando la API de Twilio acepta el mensaje; la entrega al teléfono puede fallar después (número no unido al Sandbox en ese momento, error puntual de Twilio, etc.). Un recordatorio antiguo (p. ej. de un cliente potencial) puede tener «Enviado: Sí» y no haber llegado por un fallo de entrega puntual.
- **Sandbox:** El número que recibe (**NOTIFY_WHATSAPP_TO**) debe ser **el mismo** que envió `join <código>` al número del Sandbox. Si en la fecha del recordatorio ese número aún no había unido el Sandbox, Twilio pudo aceptar el envío y no entregarlo.
- **Formato de NOTIFY_WHATSAPP_TO:** Solo dígitos, con código de país (Chile: `56` + 9 dígitos, ej. `56912345678`). **No** uses el formato `whatsapp:+...` — ese formato es para **TWILIO_WHATSAPP_FROM** (el número del Sandbox que envía). NOTIFY_WHATSAPP_TO es el número que **recibe** los mensajes.
- **Twilio Console:** En **Monitor → Logs** busca el mensaje por fecha/hora; el estado de entrega te dirá si fue «delivered» o si falló.

**Si la función dice "Enviado" pero el WhatsApp no llega:**

- En la **próxima ejecución**, en los logs de Netlify aparecerá el **Twilio SID** (ej. `SMxxxx`) de cada mensaje. Entra en **Twilio Console → Monitor → Logs** (o **Messaging → Logs**), busca ese SID o filtra por la fecha/hora del envío. Ahí verás el **estado de entrega** (delivered, failed, undelivered) y el motivo si falló (ej. "number not in WhatsApp Sandbox").
- Comprueba que **NOTIFY_WHATSAPP_TO** sea exactamente el número que envió `join <código>` al número del Sandbox desde WhatsApp. Si es otro número o no has unido ese número al Sandbox, Twilio acepta el envío pero no entrega.
- En los logs de Netlify también se muestra el destino como `****XXXX` (últimos 4 dígitos) para verificar que se está usando el número correcto.

**Si no ves logs o no te llega el WhatsApp:**

1. **Ejecutar la función a mano (para ver logs):** Abre en el navegador (sustituye TU_SITIO y tu NOTIFY_SECRET):
   ```
   https://TU_SITIO.netlify.app/.netlify/functions/process-reminders?secret=TU_NOTIFY_SECRET
   ```
   Verás un JSON con `ok`, `hoy`, `ahoraChile` y `enviados` o `procesados`. En Netlify → **Logs & Metrics** → **Functions** → `process-reminders` aparecerán los `console.log` de esa ejecución.
2. **Revisar logs en Netlify:** **Logs & Metrics** → **Functions** → elige `process-reminders` y filtra por fecha/hora. Ahí salen "Hoy (Chile):", "Hora (Chile):" y errores de Twilio si los hay.
3. **Comprobar la función programada:** Si al llamar a la URL manual sí ves logs pero nunca se ejecuta sola, en Netlify revisa que las **scheduled functions** estén activas (cuenta/plan) y que el último deploy haya subido `netlify/functions/process-reminders.js` con `exports.config = { schedule: "*/15 * * * *" }`.
3. **Comprobar fecha/hora:** La función usa la fecha y hora de Chile (America/Santiago). Crea un recordatorio para hoy con una hora que ya haya pasado; en la siguiente ejecución (en 15 min) debería enviarse.
4. **Variables de entorno:** En Netlify deben estar `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y las de Twilio (`TWILIO_*`, `NOTIFY_WHATSAPP_TO`).
