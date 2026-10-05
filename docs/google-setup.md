# Configuración Google

Se requiere una autorización inicial de la cuenta Google de Eduardo. Esa autorización es el único punto que no debe automatizarse sin consentimiento.

1. Crear/usar un proyecto de Google Cloud.
2. Habilitar Google Sheets API y Google Drive API.
3. Crear credenciales OAuth para aplicación web/desktop de administración.
4. Autorizar scopes de Sheets y Drive.
5. Obtener refresh token.
6. Crear una Google Sheet y una carpeta Drive para MESA.
7. Guardar en Cloudflare Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_SPREADSHEET_ID`, `GOOGLE_DRIVE_FOLDER_ID`.
8. Ejecutar `POST /api/admin/bootstrap` una vez.

No guardar estos valores en GitHub ni en archivos públicos.
