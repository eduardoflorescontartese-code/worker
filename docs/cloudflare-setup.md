# Despliegue Cloudflare

## Worker API

- Crear Worker `mesa-api` desde el repositorio GitHub o mediante Wrangler.
- Configurar secrets indicados en `.env.example`.
- Definir `ALLOWED_ORIGIN` con la URL real de Pages.
- Desplegar y comprobar `/api/health`.

## Pages

- Publicar el directorio `frontend/` como sitio estático.
- Cambiar `frontend/config.js` para apuntar `apiBaseUrl` al `workers.dev` real.
- No incrustar secretos en `config.js`.

## Seguridad inicial

`MESA_ADMIN_TOKEN` protege escrituras. El administrador lo introduce en la sesión del navegador. Para endurecimiento posterior se recomienda Cloudflare Access, manteniendo la misma API.
