const D1_TABLE='mesa_v2_records';

function entityKey(cfg){
  return String(cfg?.sheet||'').trim().toLowerCase();
}

async function ensureD1Store(env){
  if(!env.DB) throw new Error('D1 no está configurado para MESA');
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ${D1_TABLE} (
    entity TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(entity,id)
  )`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mesa_v2_records_entity_updated
    ON ${D1_TABLE}(entity, updated_at DESC)`).run();
}

export async function ensureStore(env){
  await ensureD1Store(env);
  return {backend:'d1'};
}

export async function listRows(env,cfg){
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

export async function appendRecord(env,cfg,rec){
  await ensureD1Store(env);
  const entity=entityKey(cfg);
  const ts=rec.fecha_actualizacion||rec.fecha||new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO ${D1_TABLE}(entity,id,data,deleted,updated_at) VALUES(?,?,?,?,?)`
  ).bind(entity,String(rec.id),JSON.stringify(rec),rec.eliminado?1:0,ts).run();
}

export async function updateRecord(env,cfg,rowRef,rec){
  await ensureD1Store(env);
  const entity=entityKey(cfg);
  const ts=rec.fecha_actualizacion||rec.fecha||new Date().toISOString();
  await env.DB.prepare(
    `UPDATE ${D1_TABLE} SET data=?, deleted=?, updated_at=? WHERE entity=? AND id=?`
  ).bind(JSON.stringify(rec),rec.eliminado?1:0,ts,entity,String(rec.id||rowRef)).run();
}
