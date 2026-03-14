# Configuración de Supabase

## 1. Crear proyecto en Supabase

1. Entra en [supabase.com](https://supabase.com) y crea un proyecto (o usa uno existente).
2. En **Project Settings > API** copia:
   - **Project URL** → lo usarás como `SUPABASE_URL`
   - **anon public** (clave pública) → lo usarás como `SUPABASE_ANON_KEY`

## 2. Configurar la app

Edita el archivo **`supabase-config.js`** en la raíz del proyecto y reemplaza los valores de ejemplo:

```js
window.SUPABASE_URL = "https://TU_PROYECTO.supabase.co";
window.SUPABASE_ANON_KEY = "tu-anon-key-aqui";
```

Pon tu URL y tu anon key reales.

## 3. Crear la tabla de clientes

1. En el panel de Supabase ve a **SQL Editor**.
2. Abre el archivo **`supabase-schema.sql`** de este proyecto.
3. Copia todo su contenido, pégalo en el editor y ejecuta la consulta (**Run**).

Con eso se crea la tabla `clientes` y las políticas de seguridad (RLS): cualquier persona puede insertar (formulario público) y solo usuarios autenticados pueden leer, actualizar o eliminar.

**Si ya tenías la tabla `clientes` creada** (versión anterior), ejecuta además el archivo **`supabase-schema-migration-clientes-v2.sql`** en el SQL Editor para añadir las columnas de cónyuge, hijos, empleador y datos bancarios.

## 4. Crear un usuario para el login

1. En Supabase ve a **Authentication > Users**.
2. Pulsa **Add user > Create new user**.
3. Elige **Email** e introduce el email y la contraseña que quieras usar para acceder al formulario de pensión.
4. Guarda. Ese email y contraseña son los que debes usar en la página de login (`login.html`).

## 5. Netlify (opcional)

Si desplegas en Netlify y no quieres dejar las claves en `supabase-config.js`:

- Crea las variables de entorno en Netlify: `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
- En el build puedes generar `supabase-config.js` a partir de esas variables (por ejemplo con un script que lea `process.env.SUPABASE_URL` y escriba el archivo).

## Resumen

| Archivo / Lugar   | Uso |
|-------------------|-----|
| `supabase-config.js` | URL y anon key de tu proyecto (editar con tus datos). |
| `supabase-config.example.js` | Plantilla para copiar y rellenar. |
| `supabase-schema.sql` | Script para crear la tabla `clientes` y políticas RLS en Supabase. |
| **Login** | Usa Supabase Auth (email + contraseña). El usuario se crea en Authentication > Users. |
| **Registro de Afiliados** | Inserta en la tabla `clientes` (acceso público por RLS). |
| **Formulario de pensión** | Solo accesible si hay sesión de Supabase; “Cerrar sesión” hace sign out. |

| **Listado de Clientes** | Página `revisar-clientes.html` (solo autenticados): lista clientes y botón "Usar en formulario de pensión". |
| **Notificación Telegram** | Opcional: función Netlify + Telegram. Variables: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, NOTIFY_SECRET. En config: NOTIFY_FUNCTION_URL y NOTIFY_SECRET. Ver **TELEGRAM.md** para pasos detallados. |

## Notificación por Telegram (opcional)

Cuando un cliente se registra en el formulario público puedes recibir un aviso por Telegram. Creas un bot con BotFather, obtienes el token y tu chat_id, y desplegas en Netlify. **Guía: [TELEGRAM.md](TELEGRAM.md).**

**Netlify (env):** TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, NOTIFY_SECRET. Para recordatorios: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

**En `supabase-config.js`:** NOTIFY_FUNCTION_URL (ej. `https://tu-sitio.netlify.app/.netlify/functions/notify-telegram`) y NOTIFY_SECRET.

Flujo: cliente llena el Registro de Afiliados → se guarda → se llama a la función → recibes Telegram. Los recordatorios también se envían por Telegram.
