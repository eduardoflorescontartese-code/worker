const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

let tokenCache = { token: null, expiresAt: 0 };

function envRequired(env, key) {
  const v = env[key];
  if (!v) throw new Error(`Falta variable/secret ${key}`);
  return v;
}

export async function getGoogleAccessToken(env) {
  if (tokenCache.token && tokenCache.expiresAt > Date.now() + 60000) return tokenCache.token;
  const body = new URLSearchParams({
    client_id: envRequired(env,'GOOGLE_CLIENT_ID'),
    client_secret: envRequired(env,'GOOGLE_CLIENT_SECRET'),
    refresh_token: envRequired(env,'GOOGLE_REFRESH_TOKEN'),
    grant_type: 'refresh_token'
  });
  const res = await fetch(TOKEN_URL, { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body });
  if (!res.ok) throw new Error(`Google OAuth ${res.status}: ${await res.text()}`);
  const data = await res.json();
  tokenCache = { token:data.access_token, expiresAt:Date.now() + (data.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

async function gfetch(env, url, init = {}) {
  const token = await getGoogleAccessToken(env);
  const headers = new Headers(init.headers || {});
  headers.set('authorization', `Bearer ${token}`);
  const res = await fetch(url, {...init, headers});
  if (!res.ok) throw new Error(`Google API ${res.status}: ${await res.text()}`);
  return res;
}

export async function getSpreadsheetMeta(env) {
  const id = envRequired(env,'GOOGLE_SPREADSHEET_ID');
  return (await gfetch(env, `${SHEETS_BASE}/${id}?fields=sheets.properties`)).json();
}

export async function ensureSheetHeaders(env, cfg) {
  const current = await readRange(env, `${cfg.sheet}!1:1`);
  let headers = current.values?.[0] || [];
  if (!headers.length) {
    const endCol=columnName(cfg.headers.length);
    await writeRange(env, `${cfg.sheet}!A1:${endCol}1`, [cfg.headers]);
    return [...cfg.headers];
  }
  const missing=cfg.headers.filter(h=>!headers.includes(h));
  if(missing.length){
    const start=columnName(headers.length+1);
    const end=columnName(headers.length+missing.length);
    await writeRange(env, `${cfg.sheet}!${start}1:${end}1`, [missing]);
    headers=[...headers,...missing];
  }
  return headers;
}

export async function ensureSheets(env, entityConfig) {
  const id = envRequired(env,'GOOGLE_SPREADSHEET_ID');
  const meta = await getSpreadsheetMeta(env);
  const existing = new Set((meta.sheets || []).map(s => s.properties.title));
  const addRequests = [];
  for (const cfg of Object.values(entityConfig)) if (!existing.has(cfg.sheet)) addRequests.push({addSheet:{properties:{title:cfg.sheet}}});
  if (addRequests.length) await gfetch(env, `${SHEETS_BASE}/${id}:batchUpdate`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requests:addRequests})});
  for (const cfg of Object.values(entityConfig)) await ensureSheetHeaders(env,cfg);
}

export async function readRange(env, range) {
  const id = envRequired(env,'GOOGLE_SPREADSHEET_ID');
  const url = `${SHEETS_BASE}/${id}/values/${encodeURIComponent(range)}?majorDimension=ROWS`;
  return (await gfetch(env,url)).json();
}

export async function writeRange(env, range, values) {
  const id = envRequired(env,'GOOGLE_SPREADSHEET_ID');
  const url = `${SHEETS_BASE}/${id}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  return (await gfetch(env,url,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({range,majorDimension:'ROWS',values})})).json();
}

export async function appendRow(env, sheet, row) {
  const id = envRequired(env,'GOOGLE_SPREADSHEET_ID');
  const url = `${SHEETS_BASE}/${id}/values/${encodeURIComponent(`${sheet}!A:ZZ`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  return (await gfetch(env,url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({values:[row]})})).json();
}

export async function appendRecordRow(env,cfg,record){
  const headers=await ensureSheetHeaders(env,cfg);
  return appendRow(env,cfg.sheet,headers.map(h=>record[h]??''));
}

export async function listRows(env, cfg) {
  const data = await readRange(env, `${cfg.sheet}!A:ZZ`);
  const values = data.values || [];
  if (values.length <= 1) return [];
  const headers = values[0];
  return values.slice(1).filter(r => r.some(v => String(v || '').trim())).map((r, idx) => {
    const obj = {__row: idx + 2};
    headers.forEach((h,i) => obj[h] = r[i] ?? '');
    return obj;
  });
}

export async function updateRow(env, cfg, rowNumber, record) {
  const headers=await ensureSheetHeaders(env,cfg);
  const row = headers.map(h => record[h] ?? '');
  const endCol = columnName(headers.length);
  return writeRange(env, `${cfg.sheet}!A${rowNumber}:${endCol}${rowNumber}`, [row]);
}

function columnName(n) {
  let s='';
  while(n){ n--; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26); }
  return s;
}

export async function uploadFileToDrive(env, file, metadata = {}) {
  const folderId = envRequired(env,'GOOGLE_DRIVE_FOLDER_ID');
  const boundary = `mesa_${crypto.randomUUID()}`;
  const meta = {name: metadata.name || file.name || 'documento', parents:[folderId]};
  const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`;
  const post = `\r\n--${boundary}--`;
  const body = new Blob([pre, await file.arrayBuffer(), post]);
  const url = `${DRIVE_UPLOAD}?uploadType=multipart&fields=id,name,mimeType,webViewLink,createdTime`;
  return (await gfetch(env,url,{method:'POST',headers:{'content-type':`multipart/related; boundary=${boundary}`},body})).json();
}

export async function getDriveFile(env, fileId) {
  return (await gfetch(env, `${DRIVE_FILES}/${encodeURIComponent(fileId)}?fields=id,name,mimeType,webViewLink,createdTime`)).json();
}
