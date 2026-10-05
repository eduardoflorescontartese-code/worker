# MESA — Mapa de Capacidades y Proyectos

Aplicación privada para administrar la Mesa Independiente de Proyectos.

## Arquitectura

**GitHub → Cloudflare Pages + Cloudflare Worker API → Google Sheets / Google Drive**

- **Google Sheets** es la fuente de verdad estructurada.
- **Google Drive** conserva CV, PDF, presentaciones y adjuntos.
- **Gmail** permanece como puerta de entrada; su análisis se realiza desde integraciones autorizadas, no desde el frontend.
- **Cloudflare** aloja interfaz/API y no encierra la información operativa.
- **LocalStorage no se usa como base de datos**. El frontend solo usa `sessionStorage` para el token administrativo de la sesión.

## Modelo

- `Capacidades`: solo lo que una persona/proyecto posee.
- `Necesidades`: solo lo que una persona/proyecto requiere/busca.
- `entidad_tipo`: `persona` o `proyecto`.
- IDs estables: `P-0001`, `PR-0001`, `C-0001`, `N-0001`, `M-0001`, `E-0001`, `PE-0001`, `D-0001`.
- Bajas lógicas y auditoría.
- Ninguna necesidad de Javier/RefNet se registra como capacidad personal.

## API

- `GET /api/health`
- CRUD para personas, proyectos, capacidades, necesidades, matches, equipos, pendientes y documentos
- `GET /api/search?q=...`
- `POST /api/matches/recompute`
- `POST /api/documentos/upload`
- `POST /api/admin/bootstrap`
- `POST /api/admin/seed`

Las escrituras requieren `Authorization: Bearer <MESA_ADMIN_TOKEN>`.

## Seguridad

Los secretos Google viven exclusivamente en Cloudflare Secrets/Environment Variables. Nunca se guardan en GitHub ni se exponen en frontend.

## Pruebas

La base incluye pruebas del motor de matching con Node `node:test`.

## Costo

Diseñado para GitHub + Cloudflare free + Google, sin Replit y sin SaaS pago obligatorio.
