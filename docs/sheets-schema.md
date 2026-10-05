# Esquema de Google Sheets

Hojas: Personas, Proyectos, Capacidades, Necesidades, Matches, Equipos, Pendientes, Documentos, Auditoria.

La hoja `Auditoria` es adicional y necesaria para cumplir el requisito de trazabilidad.

## Separación crítica

- `Capacidades`: solo lo que una persona/proyecto **posee**.
- `Necesidades`: solo lo que una persona/proyecto **requiere/busca**.
- `entidad_tipo`: `persona` o `proyecto`.
- `entidad_id`: ID estable de esa entidad.

Así se evita convertir “RefNet necesita backend” en “Javier sabe backend”.

Los encabezados canónicos están definidos en `worker/src/schema.js` y el endpoint `/api/admin/bootstrap` crea/verifica las hojas.
