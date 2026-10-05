let tokenCache = { token: '', expiresAt: 0 };
const sheetCache = new Map();

function required(env, name) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`${name} no está configurado`);
  return value;
}

function base64UrlBytes(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlJson(value) {
  return base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function privateKeyBytes(pem) {
  const normalized = String(pem || '').replace(/\\n/g, '\n').trim();
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  if (!body) throw new Error('GOOGLE_PRIVATE_KEY no contiene una clave PKCS#8 válida');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function serviceAccountAssertion(env) {
  const email = required(env, 'GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKey = required(env, 'GOOGLE_PRIVATE_KEY');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(claim)}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${base64UrlBytes(new Uint8Array(signature))}`;
}

async function accessToken(env) {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token;
  const assertion = await serviceAccountAssertion(env);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Google OAuth rechazó la autenticación (${res.status}): ${data.error_description || data.error || 'sin detalle'}`);
  }
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000
  };
  return tokenCache.token;
}

function spreadsheetId(env) {
  return required(env, 'GOOGLE_SHEETS_SPREADSHEET_ID');
}

function quoteSheet(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

function columnLetter(n) {
  let out = '';
  let x = Number(n);
  while (x > 0) {
    const r = (x - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    x = Math.floor((x - 1) / 26);
  }
  return out;
}

async function googleRequest(env, url, init = {}) {
  const token = await accessToken(env);
  const headers = new Headers(init.headers || {});
  headers.set('authorization', `Bearer ${token}`);
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const message = data?.error?.message || data?.error_description || data?.raw || `HTTP ${res.status}`;
    throw new Error(`Google Sheets: ${message}`);
  }
  return data;
}

async function readValues(env, range) {
  const sid = spreadsheetId(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sid)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`;
  const data = await googleRequest(env, url);
  return data.values || [];
}

async function writeValues(env, range, values) {
  const sid = spreadsheetId(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sid)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  return googleRequest(env, url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values })
  });
}

async function appendValues(env, range, values) {
  const sid = spreadsheetId(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sid)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  return googleRequest(env, url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values })
  });
}

function normalizedHeader(value) {
  return String(value ?? '').trim();
}

async function sheetInfo(env, cfg, { refresh = false } = {}) {
  const key = `${spreadsheetId(env)}:${cfg.sheet}`;
  if (!refresh && sheetCache.has(key)) return sheetCache.get(key);

  const rows = await readValues(env, `${quoteSheet(cfg.sheet)}!1:1`);
  const headers = (rows[0] || []).map(normalizedHeader);
  if (!headers.length) throw new Error(`La hoja ${cfg.sheet} no tiene encabezados`);

  const duplicates = headers.filter((h, i) => h && headers.indexOf(h) !== i);
  if (duplicates.length) throw new Error(`La hoja ${cfg.sheet} tiene encabezados duplicados: ${[...new Set(duplicates)].join(', ')}`);

  const missing = (cfg.headers || []).filter(h => !headers.includes(h));
  if (missing.length) throw new Error(`La hoja ${cfg.sheet} no contiene columnas requeridas: ${missing.join(', ')}`);

  const info = { headers, lastColumn: columnLetter(headers.length) };
  sheetCache.set(key, info);
  return info;
}

function rowToObject(headers, values, rowNumber) {
  const out = {};
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (!h) continue;
    out[h] = values[i] === undefined ? '' : values[i];
  }
  out.__row = rowNumber;
  return out;
}

function valueForCell(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

export async function ensureStore(env, entityConfig) {
  required(env, 'GOOGLE_SHEETS_SPREADSHEET_ID');
  required(env, 'GOOGLE_SERVICE_ACCOUNT_EMAIL');
  required(env, 'GOOGLE_PRIVATE_KEY');
  for (const cfg of Object.values(entityConfig)) await sheetInfo(env, cfg);
  return { backend: 'google-sheets', spreadsheetId: spreadsheetId(env) };
}

export async function listRows(env, cfg) {
  const info = await sheetInfo(env, cfg);
  const rows = await readValues(env, `${quoteSheet(cfg.sheet)}!A:${info.lastColumn}`);
  if (!rows.length) return [];
  return rows.slice(1)
    .map((values, i) => rowToObject(info.headers, values, i + 2))
    .filter(row => info.headers.some(h => String(row[h] ?? '').trim() !== ''));
}

export async function appendRecord(env, cfg, rec) {
  const info = await sheetInfo(env, cfg);
  const row = info.headers.map(h => valueForCell(rec[h]));
  const range = `${quoteSheet(cfg.sheet)}!A:${info.lastColumn}`;
  await appendValues(env, range, [row]);
}

export async function updateRecord(env, cfg, rowRef, rec) {
  const info = await sheetInfo(env, cfg);
  const rowNumber = Number(rowRef);
  if (!Number.isInteger(rowNumber) || rowNumber < 2) {
    throw new Error(`Referencia de fila inválida para ${cfg.sheet}: ${rowRef}`);
  }
  const row = info.headers.map(h => valueForCell(rec[h]));
  const range = `${quoteSheet(cfg.sheet)}!A${rowNumber}:${info.lastColumn}${rowNumber}`;
  await writeValues(env, range, [row]);
}
