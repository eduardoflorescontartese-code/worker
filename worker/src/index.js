import { ENTITY_CONFIG, PUBLIC_ENTITIES, normalizeEntityName, validateRecord } from './schema.js';
import { ensureSheets, listRows, appendRow, updateRow, uploadFileToDrive } from './google.js';
import { buildMatches } from './matching.js';

const json = (data,status=200,headers={}) => new Response(JSON.stringify(data,null,2),{status,headers:{'content-type':'application/json; charset=utf-8',...headers}});
const now = () => new Date().toISOString();

function cors(env, req){
  const origin = req.headers.get('origin');
  const allowed = env.ALLOWED_ORIGIN || '*';
  return {'access-control-allow-origin': allowed==='*' ? '*' : (origin===allowed ? origin : allowed),'access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS','vary':'Origin'};
}
function authorized(env, req){ const h=req.headers.get('authorization')||''; return !!env.MESA_ADMIN_TOKEN && h===`Bearer ${env.MESA_ADMIN_TOKEN}`; }
function cleanRow(o){ const x={...o}; delete x.__row; return x; }
function deleted(v){ return v===true || ['true','1','sí','si'].includes(String(v).toLowerCase()); }
function nextId(rows,prefix){ let max=0; const re=new RegExp(`^${prefix}-(\\d+)$`); for(const r of rows){ const m=String(r.id||'').match(re); if(m) max=Math.max(max,Number(m[1])); } return `${prefix}-${String(max+1).padStart(4,'0')}`; }
async function audit(env, entity,id,action,origin,detail=''){ const cfg=ENTITY_CONFIG.auditoria; const rows=await listRows(env,cfg); const rec={id:nextId(rows,cfg.prefix),fecha:now(),entidad:entity,registro_id:id,accion:action,origen:origin||'carga manual',usuario_origen:'api',detalle:detail}; await appendRow(env,cfg.sheet,cfg.headers.map(h=>rec[h]??'')); }

async function listEntity(env,entity, includeDeleted=false){ const cfg=ENTITY_CONFIG[entity]; const rows=await listRows(env,cfg); return includeDeleted ? rows : rows.filter(r=>!deleted(r.eliminado)); }
async function findById(env,entity,id){ return (await listRows(env,ENTITY_CONFIG[entity])).find(r=>String(r.id)===String(id)); }

async function crud(env, req, entity, id){
  const cfg=ENTITY_CONFIG[entity];
  if(req.method==='GET'){
    if(id){ const row=await findById(env,entity,id); return row && !deleted(row.eliminado) ? json(cleanRow(row)) : json({error:'No encontrado'},404); }
    return json((await listEntity(env,entity)).map(cleanRow));
  }
  if(req.method==='POST'){
    const body=validateRecord(entity,await req.json()); const rows=await listRows(env,cfg); const ts=now();
    const rec={...body,id:body.id||nextId(rows,cfg.prefix),fecha_actualizacion:ts,origen_informacion:body.origen_informacion||'carga manual',eliminado:false};
    if(entity==='personas'&&!rec.fecha_incorporacion) rec.fecha_incorporacion=ts;
    await appendRow(env,cfg.sheet,cfg.headers.map(h=>rec[h]??'')); await audit(env,entity,rec.id,'crear',rec.origen_informacion); return json(rec,201);
  }
  const current=await findById(env,entity,id); if(!current) return json({error:'No encontrado'},404);
  if(req.method==='PUT'){
    const patch=validateRecord(entity,await req.json(),{partial:true}); const rec={...cleanRow(current),...patch,id:current.id,fecha_actualizacion:now()};
    await updateRow(env,cfg,current.__row,rec); await audit(env,entity,id,'editar',patch.origen_informacion||rec.origen_informacion); return json(rec);
  }
  if(req.method==='DELETE'){
    const rec={...cleanRow(current),eliminado:true,estado:'Eliminado',fecha_actualizacion:now()}; await updateRow(env,cfg,current.__row,rec); await audit(env,entity,id,'baja lógica','carga manual'); return json({ok:true,id});
  }
  return json({error:'Método no permitido'},405);
}

async function bootstrap(env, req){
  await ensureSheets(env,ENTITY_CONFIG);
  return json({ok:true,sheets:Object.values(ENTITY_CONFIG).map(x=>x.sheet)});
}

async function recomputeMatches(env, req){
  const needs=await listEntity(env,'necesidades'); const caps=await listEntity(env,'capacidades'); const existing=await listEntity(env,'matches'); const cfg=ENTITY_CONFIG.matches;
  const known=new Set(existing.map(m=>`${m.necesidad_id}|${m.capacidad_id}`)); let created=0;
  for(const m of buildMatches(needs,caps)){
    const key=`${m.need.id}|${m.capability.id}`; if(known.has(key)) continue;
    const all=await listRows(env,cfg); const rec={id:nextId(all,cfg.prefix),origen_tipo:m.need.entidad_tipo,origen_id:m.need.entidad_id,destino_tipo:m.capability.entidad_tipo,destino_id:m.capability.entidad_id,persona_id:m.capability.entidad_tipo==='persona'?m.capability.entidad_id:(m.need.entidad_tipo==='persona'?m.need.entidad_id:''),proyecto_id:m.need.entidad_tipo==='proyecto'?m.need.entidad_id:(m.capability.entidad_tipo==='proyecto'?m.capability.entidad_id:''),necesidad_id:m.need.id,capacidad_id:m.capability.id,explicacion:m.explanation,puntuacion:m.score,estado:'sugerido',fecha:now(),fecha_actualizacion:now(),origen_informacion:'deducción razonable',eliminado:false};
    await appendRow(env,cfg.sheet,cfg.headers.map(h=>rec[h]??'')); created++;
  }
  await audit(env,'matches','*','recalcular','deducción razonable',`${created} matches nuevos`); return json({ok:true,created});
}

async function graphSnapshot(env){
  const entities=['personas','proyectos','capacidades','necesidades','matches','equipos','pendientes','documentos','auditoria'];
  const pairs=await Promise.all(entities.map(async entity=>[entity,(await listEntity(env,entity)).map(cleanRow)]));
  return json({updatedAt:now(),data:Object.fromEntries(pairs)});
}

function parseListValue(v){
  if(Array.isArray(v)) return v.map(String).map(x=>x.trim()).filter(Boolean);
  const s=String(v??'').trim(); if(!s) return [];
  try{const j=JSON.parse(s); if(Array.isArray(j)) return j.map(String).map(x=>x.trim()).filter(Boolean)}catch{}
  return s.split(/[;\n,]+/).map(x=>x.trim()).filter(Boolean);
}
function parseObjectValue(v){
  if(v&&typeof v==='object'&&!Array.isArray(v)) return {...v};
  const s=String(v??'').trim(); if(!s) return {};
  try{const j=JSON.parse(s); return j&&typeof j==='object'&&!Array.isArray(j)?j:{}}catch{return {}}
}
function parseArrayValue(v){
  if(Array.isArray(v)) return structuredClone(v);
  const s=String(v??'').trim(); if(!s) return [];
  try{const j=JSON.parse(s); if(Array.isArray(j)) return j}catch{}
  return s.split(/[;\n,]+/).map(x=>x.trim()).filter(Boolean);
}
export function matchDecisionMode(status,decision){
  const state=String(status||'sugerido').toLowerCase();
  const action=String(decision||'').toLowerCase();
  if(!['confirm','dismiss'].includes(action)) return 'INVALID';
  if(state==='confirmado') return action==='confirm'?'IDEMPOTENT':'CONFLICT';
  if(state==='descartado') return action==='dismiss'?'IDEMPOTENT':'CONFLICT';
  return 'APPLY';
}
async function decideMatch(env, req, idValue){
  const match=await findById(env,'matches',idValue); if(!match||deleted(match.eliminado)) return json({error:'Match no encontrado'},404);
  const body=await req.json(), decision=String(body.decision||'').toLowerCase(), mode=matchDecisionMode(match.estado,decision);
  if(mode==='INVALID') return json({error:'Decisión inválida'},400);
  if(mode==='CONFLICT') return json({error:'El match ya tiene una decisión final distinta'},409);
  if(mode==='IDEMPOTENT'){
    const team=match.origen_referencia?await findById(env,'equipos',match.origen_referencia):null;
    return json({ok:true,idempotent:true,match:cleanRow(match),team:team?cleanRow(team):null});
  }
  if(decision==='dismiss'){
    const rec={...cleanRow(match),estado:'descartado',fecha_actualizacion:now(),origen_informacion:'decisión operativa'};
    await updateRow(env,ENTITY_CONFIG.matches,match.__row,rec);
    await audit(env,'matches',match.id,'descartar','decisión operativa',match.explicacion||'');
    return json({ok:true,match:rec});
  }
  const person=await findById(env,'personas',match.persona_id), project=await findById(env,'proyectos',match.proyecto_id);
  if(!person||deleted(person.eliminado)||!project||deleted(project.eliminado)) return json({error:'Persona o proyecto del match no disponible'},409);
  const capability=match.capacidad_id?await findById(env,'capacidades',match.capacidad_id):null;
  const need=match.necesidad_id?await findById(env,'necesidades',match.necesidad_id):null;
  const role=[capability?.capacidad,need?.necesidad?('cubre '+need.necesidad):''].filter(Boolean).join(' · ')||'Integrante del equipo';
  const teams=await listEntity(env,'equipos');
  let team=teams.find(t=>String(t.proyecto_id)===String(project.id)&&!['cerrado','eliminado','inactivo'].includes(String(t.estado||'').toLowerCase()));
  if(!team){
    const all=await listRows(env,ENTITY_CONFIG.equipos),ts=now();
    const missing=(await listEntity(env,'necesidades')).filter(n=>String(n.entidad_tipo)==='proyecto'&&String(n.entidad_id)===String(project.id)&&String(n.estado||'').toLowerCase()!=='cubierta').map(n=>n.necesidad).filter(Boolean);
    team={id:nextId(all,ENTITY_CONFIG.equipos.prefix),nombre:'Equipo · '+(project.nombre||project.id),proyecto_id:project.id,integrantes:JSON.stringify([person.id]),roles:JSON.stringify({[person.id]:role}),capacidades_cubiertas:JSON.stringify([{persona_id:person.id,capacidad_id:match.capacidad_id||'',necesidad_id:match.necesidad_id||'',descripcion:role}]),capacidades_faltantes:JSON.stringify(missing.filter(x=>x!==need?.necesidad)),estado:'activo',notas:'Creado desde un match confirmado en MESA.',responsable_id:person.id,proximos_pasos:'Definir tareas y próximos hitos.',fecha_actualizacion:ts,origen_informacion:'match confirmado',origen_referencia:match.id,eliminado:false};
    await appendRow(env,ENTITY_CONFIG.equipos.sheet,ENTITY_CONFIG.equipos.headers.map(h=>team[h]??''));
    await audit(env,'equipos',team.id,'crear_desde_match','match confirmado',match.id);
  }else{
    const current=await findById(env,'equipos',team.id);
    const members=parseListValue(current.integrantes),roles=parseObjectValue(current.roles),covered=parseArrayValue(current.capacidades_cubiertas);
    if(!members.includes(person.id)) members.push(person.id);
    roles[person.id]=role;
    const coverage={persona_id:person.id,capacidad_id:match.capacidad_id||'',necesidad_id:match.necesidad_id||'',descripcion:role};
    const exists=covered.some(x=>x&&typeof x==='object'&&String(x.persona_id||'')===String(coverage.persona_id)&&String(x.capacidad_id||'')===String(coverage.capacidad_id)&&String(x.necesidad_id||'')===String(coverage.necesidad_id));
    if(!exists) covered.push(coverage);
    const rec={...cleanRow(current),integrantes:JSON.stringify(members),roles:JSON.stringify(roles),capacidades_cubiertas:JSON.stringify(covered),estado:'activo',fecha_actualizacion:now(),origen_informacion:'match confirmado'};
    await updateRow(env,ENTITY_CONFIG.equipos,current.__row,rec); team=rec;
    await audit(env,'equipos',team.id,'agregar_integrante_desde_match','match confirmado',match.id+' · '+person.id);
  }
  const matchRec={...cleanRow(match),estado:'confirmado',fecha_actualizacion:now(),origen_informacion:'decisión operativa',origen_referencia:team.id};
  await updateRow(env,ENTITY_CONFIG.matches,match.__row,matchRec);
  await audit(env,'matches',match.id,'confirmar','decisión operativa',team.id+' · '+role);
  return json({ok:true,match:matchRec,team:cleanRow(team),role});
}

async function globalSearch(env, q){
  const needle=String(q||'').trim().toLowerCase(); if(!needle) return json({query:q,results:[]});
  const results=[];
  for(const entity of PUBLIC_ENTITIES){ for(const row of await listEntity(env,entity)){ const text=Object.values(row).join(' ').toLowerCase(); if(text.includes(needle)) results.push({entity,id:row.id,label:row.nombre_completo||row.nombre||row.capacidad||row.necesidad||row.pendiente||row.id,row:cleanRow(row)}); } }
  return json({query:q,results:results.slice(0,100)});
}

async function uploadDocument(env, req){
  const form=await req.formData(); const file=form.get('file'); if(!(file instanceof File)) return json({error:'Falta archivo'},400);
  const drive=await uploadFileToDrive(env,file,{name:file.name});
  const cfg=ENTITY_CONFIG.documentos, rows=await listRows(env,cfg), ts=now();
  const rec={id:nextId(rows,cfg.prefix),persona_id:form.get('persona_id')||'',proyecto_id:form.get('proyecto_id')||'',nombre:drive.name||file.name,tipo:drive.mimeType||file.type,drive_file_id:drive.id,url:drive.webViewLink||`https://drive.google.com/open?id=${drive.id}`,fecha:drive.createdTime||ts,origen:form.get('origen')||'carga manual',resumen:'',estado_analisis:'Pendiente',fecha_actualizacion:ts,origen_informacion:form.get('origen')||'carga manual',origen_referencia:'',eliminado:false};
  await appendRow(env,cfg.sheet,cfg.headers.map(h=>rec[h]??'')); await audit(env,'documentos',rec.id,'subir',rec.origen_informacion); return json(rec,201);
}

export default { async fetch(req, env){
  const h=cors(env,req); if(req.method==='OPTIONS') return new Response(null,{status:204,headers:h});
  try{
    const url=new URL(req.url); const path=url.pathname.replace(/\/+$/,'')||'/';
    if(path==='/api/health') return json({ok:true,service:'MESA API',googleConfigured:Boolean(env.GOOGLE_SPREADSHEET_ID&&env.GOOGLE_REFRESH_TOKEN)},200,h);

    if(path.startsWith('/api/') && !authorized(env,req)) return json({error:'No autorizado'},401,h);

    if(path==='/api/admin/bootstrap'&&req.method==='POST') { const r=await bootstrap(env,req); return withHeaders(r,h); }
    if(path==='/api/matches/recompute'&&req.method==='POST') { const r=await recomputeMatches(env,req); return withHeaders(r,h); }
    const matchDecision=path.match(/^\/api\/matches\/([^/]+)\/decision$/); if(matchDecision&&req.method==='POST') { const r=await decideMatch(env,req,decodeURIComponent(matchDecision[1])); return withHeaders(r,h); }
    if(path==='/api/graph'&&req.method==='GET') { const r=await graphSnapshot(env); return withHeaders(r,h); }
    if(path==='/api/search'&&req.method==='GET') { const r=await globalSearch(env,url.searchParams.get('q')); return withHeaders(r,h); }
    if(path==='/api/documentos/upload'&&req.method==='POST') { const r=await uploadDocument(env,req); return withHeaders(r,h); }
    const m=path.match(/^\/api\/([a-záéíóúñ]+)(?:\/([^/]+))?$/i);
    if(m){ const entity=normalizeEntityName(m[1]); const r=await crud(env,req,entity,m[2]); return withHeaders(r,h); }
    return json({error:'Ruta no encontrada'},404,h);
  }catch(e){ return json({error:e.message||String(e)},500,h); }
}};

function withHeaders(res, headers){ const out=new Response(res.body,res); for(const [k,v] of Object.entries(headers)) out.headers.set(k,v); return out; }
