# Alcance PWA (plataforma de asesores)

La **PWA** aplica solo a la **aplicación** servida desde la raíz del sitio (`/login.html`, `/dashboard.html`, `/pension.html`, etc.).

La **landing de marketing** vive en la carpeta **`www/`** (p. ej. `/www/index.html` o la raíz redirigida a ella en el dominio público). **No forma parte** del alcance de la PWA: no debe registrarse el manifest ni el service worker desde esa página.

## Próximos pasos típicos

- Completar `manifest.webmanifest` (iconos, `theme_color`, etc.).
- Service worker con caché acotada (shell + estáticos), sin romper sesión Supabase.
- Probar instalación sobre todo en el host de **plataforma** (subdominio o ruta donde entra el panel), no confundir con la landing.
