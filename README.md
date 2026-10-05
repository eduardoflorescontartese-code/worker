# MESA — Mapa de Capacidades y Proyectos

Aplicación pública para conectar personas, proyectos, capacidades y necesidades.

## Arquitectura

**GitHub → Cloudflare Worker + Assets → Cloudflare D1**

- **Cloudflare D1** es la única fuente de verdad operativa.
- **Cloudflare R2** es el almacenamiento previsto para archivos y adjuntos cuando el binding `DOCS` esté configurado.
- **LocalStorage no es base de datos**. Solo se usa para conservar el token personal de edición generado en el navegador.
- **sessionStorage** se usa únicamente para la sesión administrativa.
- La aplicación no depende de Google Sheets, Google Drive ni OAuth de Google.

## Modelo

- `Personas`
- `Proyectos`
- `Capacidades`
- `Necesidades`
- `Matches`
- `Equipos`
- `Pendientes`
- `Documentos`
- `Auditoria`

IDs estables: `P-0001`, `PR-0001`, `C-0001`, `N-0001`, `M-0001`, `E-0001`, `PE-0001`, `D-0001`.

## API

- `GET /api/health`
- `GET /api/public/stats`
- `GET /api/public/dashboard`
- `POST /api/self/persona`
- CRUD administrativo
- `GET /api/search?q=...`
- `POST /api/matches/recompute`
- `POST /api/documentos/upload`

## Persistencia

D1 usa una tabla aislada `mesa_v2_records` con separación por entidad. No se mezclan registros de sistemas anteriores.

## Archivos

El endpoint de documentos usa el binding R2 `DOCS`. Si el bucket todavía no está configurado, el resto de MESA continúa funcionando y el endpoint responde de forma explícita que el almacenamiento de archivos está pendiente.

## Seguridad

- Escrituras administrativas protegidas por `MESA_ADMIN_TOKEN`.
- Datos privados como correo no se exponen en el dashboard público.
- Las bajas son lógicas.
- Existe auditoría de cambios.

## Pruebas

- `npm test`
- `node --check frontend/app.js`
- `node --check worker/src/index.js`

## Costo

Diseñado para funcionar dentro de las capas gratuitas de GitHub y Cloudflare durante la etapa inicial, sin SaaS pago obligatorio.
