import { ensureSheets, listRows as listGoogleRows, appendRecordRow, updateRow as updateGoogleRow } from './google.js';

const D1_TABLE='mesa_v2_records';
let googleDisabled=false;
let googleRuntimeError='';

export const googleConfigured = env => Boolean(
  env.GOOGLE_SPREADSHEET_ID &&
  env.GOOGLE_REFRESH_TOKEN &&
  env.GOOGLE_CLIENT_ID &&
  env.GOOGLE_CLIENT_SECRET
);

export const googleRuntimeAvailable = env => googleConfigured(env) && !googleDisabled;
export const googleRuntimeStatus = () => ({disabled:googleDisabled,error:googleRuntimeError});

function entityKey(cfg){
  return String(cfg?.sheet||'').trim().toLowerCase();
}

function authFailure(err){
  const msg=String(err?.message||err||'');
  return /invalid_grant|expired|revoked|google oauth|unauthori[sz]ed|forbidden|\b401\b|\b403\b/i.test(msg);
}

function disableGoogle(err){
  googleDisabled=true;
  googleRuntimeError=String(err?.message||err||'Google no disponible');
}

async function ensureD1Store(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ${D1_TABLE} (
    entity TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(entity,id)
  )`).run();
}

async function googleOrD1(env, googleFn, d1Fn){
  if(googleRuntimeAvailable(env)){
    try{
      return await googleFn();
    }catch(err){
      if(!env.DB || !authFailure(err)) throw err;
      disableGoogle(err);
    }
  }
  if(env.DB) return d1Fn();
  throw new Error(googleRuntimeError || 'No hay datastore operativo para MESA');
}

export async function ensureStore(env, entityConfig){
  if(googleRuntimeAvailable(env)){
    try{
      await ensureSheets(env,entityConfig);
      return {backend:'google',googleError:''};
    }catch(err){
      if(!env.DB || !authFailure(err)) throw err;
      disableGoogle(err);
    }
  }
  if(env.DB){
    await ensureD1Store(env);
    return {backend:'d1',googleError:googleRuntimeError};
  }
  throw new Error(googleRuntimeError || 'No hay datastore configurado para MESA');
}

export async function listRows(env,cfg){
  return googleOrD1(
    env,
    ()=>listGoogleRows(env,cfg),
    async()=>{
      await ensureD1Store(env);
      const entity=entityKey(cfg);
      const out=await env.DB.prepare(
        `SELECT id,data FROM ${D1_TABLE} WHERE entity=? ORDER BY updated_at DESC`
      ).bind(entity).all();
      return (out.results||[]).map(r=>{
        let obj={};
        try{obj=JSON.parse(r.data||'{}')}catch{}
        return {...obj,id:obj.id||r.id,__row:r.id};
      });
    }
  );
}

export async function appendRecord(env,cfg,rec){
  return googleOrD1(
    env,
    ()=>appendRecordRow(env,cfg,rec),
    async()=>{
      await ensureD1Store(env);
      const entity=entityKey(cfg);
      const ts=rec.fecha_actualizacion||rec.fecha||new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO ${D1_TABLE}(entity,id,data,deleted,updated_at) VALUES(?,?,?,?,?)`
      ).bind(entity,String(rec.id),JSON.stringify(rec),rec.eliminado?1:0,ts).run();
    }
  );
}

export async function updateRecord(env,cfg,rowRef,rec){
  return googleOrD1(
    env,
    ()=>updateGoogleRow(env,cfg,rowRef,rec),
    async()=>{
      await ensureD1Store(env);
      const entity=entityKey(cfg);
      const ts=rec.fecha_actualizacion||rec.fecha||new Date().toISOString();
      await env.DB.prepare(
        `UPDATE ${D1_TABLE} SET data=?, deleted=?, updated_at=? WHERE entity=? AND id=?`
      ).bind(JSON.stringify(rec),rec.eliminado?1:0,ts,entity,String(rec.id||rowRef)).run();
    }
  );
}
