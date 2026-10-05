# MESA — Personas. Proyectos. Impacto real.

Aplicación pública y gratuita para conectar personas, capacidades, necesidades y proyectos.

## Arquitectura actual

**GitHub → Cloudflare Worker + Assets → Cloudflare D1**

- **Cloudflare D1** es la fuente de verdad operativa de MESA.
- La información de MESA V2 vive aislada en la tabla `mesa_v2_records`, separada por entidad.
- **Google ya no es una dependencia operativa**.
- **LocalStorage no es base de datos**; solo se utiliza para conservar el token personal de edición generado en el navegador.
- El frontend es público: no requiere login para participar ni para cargar un proyecto.

## Entidades

- Personas
- Proyectos
- Capacidades
- Necesidades
- Matches
- Equipos
- Pendientes
- Documentos
- Auditoría

IDs estables: `P-0001`, `PR-0001`, `C-0001`, `N-0001`, `M-0001`, `E-0001`, `PE-0001`, `D-0001`.

## API principal

- `GET /api/health`
- `GET /api/public/stats`
- `GET /api/public/dashboard`
- `POST /api/self/persona`
- `GET /api/search?q=...`
- `POST /api/matches/recompute`
- CRUD administrativo de entidades

## Documentos

La API está preparada para **Cloudflare R2** mediante el binding `DOCS`. Si R2 todavía no está configurado, MESA continúa funcionando normalmente para personas, proyectos, matching y búsqueda; solo la carga binaria de archivos queda deshabilitada temporalmente.

## Pruebas

El repositorio incluye pruebas con Node `node:test` y despliegue automático a Cloudflare desde `main`.

## Costo

Diseñado para operar con infraestructura gratuita o free-tier, sin Replit ni SaaS pago obligatorio.
