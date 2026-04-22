# Prevy / Hablemos de Pensión

Aplicación web + PWA para asesores previsionales. Frontend en HTML/JS vanilla,
backend vía **Supabase** (Postgres + Auth + Storage) y **Netlify Functions**
para integraciones (Mercado Pago, Telegram, Web Push, etc.).

## Stack

- **Frontend**: HTML/CSS/JS sin framework, Service Worker (`sw.js`) para PWA.
- **Hosting**: Netlify (estáticos + funciones).
- **Backend**: Supabase (DB Postgres, Auth, RLS, Storage).
- **Email transaccional**: Resend (Supabase Auth) + Zoho Mail (recepción humana).
- **PDF**: [pdfmake](https://pdfmake.github.io/) para generación client-side.
- **Pagos**: Mercado Pago (suscripciones).
- **Notificaciones**: Telegram Bot API + Web Push (VAPID).

## Migraciones de base de datos

Se usa **Supabase CLI**. Todas las migraciones viven en `supabase/migrations/`
con nombre `YYYYMMDDHHMMSS_nombre_descriptivo.sql`.

### Flujo para crear una nueva migración

```bash
# 1. Crear archivo con timestamp automático
supabase migration new nombre_cambio

# 2. Editar el .sql generado en supabase/migrations/
#    Escribe SQL idempotente (CREATE ... IF NOT EXISTS, etc.)

# 3. Probar en local contra un Postgres de Docker
supabase db reset        # resetea local y aplica todas las migraciones
# Estudio local disponible en http://localhost:54323

# 4. Cuando esté validada, aplicar al proyecto remoto
supabase db push
```

### Variables de entorno para la CLI

`supabase/.env` (local, **no se commitea**):

```
SUPABASE_DB_PASSWORD=tu-password-de-la-db-remota
```

Para cargarla antes de usar comandos que conectan al remoto:

```bash
export $(cat supabase/.env | xargs)
supabase db push
```

### Ver estado de migraciones

```bash
supabase migration list
```

Muestra lado a lado las migraciones locales y las aplicadas en el remoto.

### Reparar desincronizaciones

Si alguna vez se desincronizan las dos listas:

```bash
# Marcar una migración como aplicada (ya corrió en remoto pero no estaba tracked)
supabase migration repair --status applied YYYYMMDDHHMMSS

# O marcar como revertida (si hay una entrada huérfana sin archivo local)
supabase migration repair --status reverted YYYYMMDDHHMMSS
```

### Baseline inicial

La migración `supabase/migrations/20260422152440_remote_schema.sql` es el
**baseline** capturado el día que se adoptó la CLI. Representa el estado
acumulado de las **44 migraciones legacy** previas (ver `_legacy-migrations/`).

## Estructura del repo

```
.
├── index.html                      # Landing
├── pension.html                    # Formulario principal (mandatos + contrato)
├── dashboard.html, clientes*.html  # UI de asesor
├── ayuda.html, mis-tickets.html    # Soporte
├── app-shell.css/js                # Topbar, sidebar, menús
├── theme-init.js                   # Tema claro/oscuro
├── sw.js, pwa-*.js                 # PWA + Service Worker
├── netlify/
│   ├── functions/                  # Funciones serverless (Node)
│   └── edge-functions/             # Edge (si aplica)
├── supabase/
│   ├── config.toml                 # Configuración CLI
│   ├── migrations/                 # Migraciones nuevas (Supabase CLI)
│   └── seed.sql                    # Datos de prueba para local
└── _legacy-migrations/             # Migraciones antiguas (solo historial)
```

## Desarrollo local

### Front-end

Abre cualquier `.html` directo en el navegador o usa un servidor estático:

```bash
npx serve .
```

### Netlify Functions

```bash
netlify dev
```

### Supabase local (opcional)

```bash
supabase start     # levanta Docker con Postgres + Auth + Studio
supabase stop      # lo detiene
supabase status    # muestra URLs locales
```

## Ramas

- `main` — producción.
- `feature/<nombre>` — ramas de trabajo, se mergean a `main` con `--no-ff`.

## Contacto / soporte

Correo: `hola@prevy.cl`
