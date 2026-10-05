# Arquitectura de MESA

## Flujo operativo

Gmail → análisis en ChatGPT/integración autorizada → persona/proyecto → capacidades/necesidades → Google Sheets → matching → equipos.

## Fuente de verdad

La fuente de verdad inicial es Google Sheets/Drive. La web es interfaz. Cloudflare procesa solicitudes, valida, audita y aplica reglas de negocio.

## Seguridad

- Secretos Google únicamente en Cloudflare Secrets.
- Ningún usuario/contraseña Gmail.
- Ningún secreto real en Git.
- Escrituras protegidas con token administrativo en fase inicial.
- Preparado para sustituir el token por Cloudflare Access y roles administrador/colaborador/lectura.
- Bajas lógicas y auditoría en hoja `Auditoria`.

## Persistencia y recuperación

La aplicación reconstruye cada vista consultando la API; la API lee las hojas. Si el navegador cambia o se borra la caché, los datos permanecen en Google.
