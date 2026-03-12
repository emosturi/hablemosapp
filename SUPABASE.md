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
| **Alta de clientes** | Inserta en la tabla `clientes` (acceso público por RLS). |
| **Formulario de pensión** | Solo accesible si hay sesión de Supabase; “Cerrar sesión” hace sign out. |
