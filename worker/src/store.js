import { ensureSheets, listRows as listGoogleRows, appendRow, updateRow as updateGoogleRow } from './google.js';

const tableName = cfg => 'mesa_' + String(cfg.sheet || '').toLowerCase().replace(/[^a-z0-9_]/g,'');

async function ensureD1Table(env,cfg){
  const t=tableName(cfg);
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ${t} (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_${t}_deleted ON ${t}(deleted)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_${t}_updated ON ${t}(updated_at DESC)`).run();
}

export async function ensureStore(env, entityConfig){
  if(env.DB){
    for(const cfg of Object.values(entityConfig)) await ensureD1Table(env,cfg);
    return {backend:'d1'};
  }
  await ensureSheets(env,entityConfig);
  return {backend:'google'};
}

export async function listRows(env,cfg){
  if(!env.DB) return listGoogleRows(env,cfg);
  await ensureD1Table(env,cfg);
  const t=tableName(cfg);
  const out=await env.DB.prepare(`SELECT id,data FROM ${t} ORDER BY updated_at DESC`).all();
  return (out.results||[]).map(r=>{
    let obj={}; try{obj=JSON.parse(r.data||'{}')}catch{}
    return {...obj,id:obj.id||r.id,__row:r.id};
  });
}

export async function appendRecord(env,cfg,rec){
  if(!env.DB){
    await appendRow(env,cfg.sheet,cfg.headers.map(h=>rec[h]??''));
    return;
  }
  await ensureD1Table(env,cfg);
  const t=tableName(cfg), ts=rec.fecha_actualizacion||rec.fecha||new Date().toISOString();
  await env.DB.prepare(`INSERT INTO ${t}(id,data,deleted,updated_at) VALUES(?,?,?,?)`)
    .bind(String(rec.id),JSON.stringify(rec),rec.eliminado?1:0,ts).run();
}

export async function updateRecord(env,cfg,rowRef,rec){
  if(!env.DB){
    await updateGoogleRow(env,cfg,rowRef,rec);
    return;
  }
  await ensureD1Table(env,cfg);
  const t=tableName(cfg), ts=rec.fecha_actualizacion||rec.fecha||new Date().toISOString();
  await env.DB.prepare(`UPDATE ${t} SET data=?, deleted=?, updated_at=? WHERE id=?`)
    .bind(JSON.stringify(rec),rec.eliminado?1:0,ts,String(rec.id||rowRef)).run();
}
