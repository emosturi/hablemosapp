# Alcance PWA (plataforma de asesores)

La **PWA** aplica solo a la **aplicación** servida desde la raíz del sitio (`/login.html`, `/dashboard.html`, `/pension.html`, etc.).

La **landing de marketing** vive en la carpeta **`www/`** (p. ej. `/www/index.html` o la raíz redirigida a ella en el dominio público). **No forma parte** del alcance de la PWA: no debe registrarse el manifest ni el service worker desde esa página.

## Implementado en el repo

- `manifest.webmanifest` con iconos 192 / 512 (`/icons/`).
- `sw.js`: precarga manifest + `app-shell.css` + `theme-init` + iconos; en fetch solo cachea estáticos (css, js, png, …) del mismo origen; **no** toca `/.netlify/*` ni HTML.
- `app-shell.js` y `login.html`: manifest, `theme-color`, meta Apple, registro del SW (`pwa-register.js` en login).

## Próximos pasos opcionales

- Pantalla offline mínima (`offline.html` + fallback en SW para navegación).
- Icono **maskable** (512 con zona segura) si quieres mejor ajuste en Android.
- Probar instalación en **plataforma.*** (HTTPS); la landing en `www/` no enlaza el SW.
