import { ensureSheets, listRows as listGoogleRows, appendRecordRow, updateRow as updateGoogleRow } from './google.js';

export const googleConfigured = env => Boolean(
  env.GOOGLE_SPREADSHEET_ID &&
  env.GOOGLE_REFRESH_TOKEN &&
  env.GOOGLE_CLIENT_ID &&
  env.GOOGLE_CLIENT_SECRET
);

function requireGoogle(env){
  if(!googleConfigured(env)){
    throw new Error('Google Sheets no está configurado para MESA');
  }
}

export async function ensureStore(env, entityConfig){
  requireGoogle(env);
  await ensureSheets(env,entityConfig);
  return {backend:'google-sheets'};
}

export async function listRows(env,cfg){
  requireGoogle(env);
  return listGoogleRows(env,cfg);
}

export async function appendRecord(env,cfg,rec){
  requireGoogle(env);
  await appendRecordRow(env,cfg,rec);
}

export async function updateRecord(env,cfg,rowRef,rec){
  requireGoogle(env);
  await updateGoogleRow(env,cfg,rowRef,rec);
}
