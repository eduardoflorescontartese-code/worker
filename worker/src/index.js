import { ENTITY_CONFIG, PUBLIC_ENTITIES, normalizeEntityName, validateRecord } from './schema.js';
import { uploadFileToDrive } from './google.js';
import { ensureStore, listRows, appendRecord, updateRecord } from './store.js';
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
async function audit(env, entity,id,action,origin,detail=''){ const cfg=ENTITY_CONFIG.auditoria; const rows=await listRows(env,cfg); const rec={id:nextId(rows,cfg.prefix),fecha:now(),entidad:entity,registro_id:id,accion:action,origen:origin||'carga manual',usuario_origen:'api',detalle}; await appendRecord(env,cfg,rec); }

async function listEntity(env,entity, includeDeleted=false){ const cfg=ENTITY_CONFIG[entity]; const rows=await listRows(env,cfg); return includeDeleted ? rows : rows.filter(r=>!deleted(r.eliminado)); }
async function findById(env,entity,id){ return (await listRows(env,ENTITY_CONFIG[entity])).find(r=>String(r.id)===String(id)); }
function publicPerson(r){ return {id:r.id,nombre_completo:r.nombre_completo||[r.nombre,r.apellido].filter(Boolean).join(' '),profesion:r.profesion||'',especialidad:r.especialidad||'',tiene_proyecto_propio:r.tiene_proyecto_propio||'',estado:r.estado||'Activo'}; }
function publicProject(r){ return {id:r.id,nombre:r.nombre||'',creador_id:r.creador_id||'',descripcion:r.descripcion||'',sector:r.sector||'',etapa:r.etapa||'',estado:r.estado||'Activo'}; }

async function crud(env, req, entity, id){
  const cfg=ENTITY_CONFIG[entity];
  if(req.method==='GET'){
    const isAdmin=authorized(env,req);
    if(id){
      const row=await findById(env,entity,id);
      if(!row || deleted(row.eliminado)) return json({error:'No encontrado'},404);
      if(isAdmin) return json(cleanRow(row));
      if(entity==='personas') return json(publicPerson(row));
      if(entity==='proyectos') return json(publicProject(row));
      return json({error:'No autorizado'},401);
    }
    const rows=await listEntity(env,entity);
    if(isAdmin) return json(rows.map(cleanRow));
    if(entity==='personas') return json(rows.map(publicPerson));
    if(entity==='proyectos') return json(rows.map(publicProject));
    return json({error:'No autorizado'},401);
  }
  if(!authorized(env,req)) return json({error:'No autorizado'},401);
  if(req.method==='POST'){
    const body=validateRecord(entity,await req.json()); const rows=await listRows(env,cfg); const ts=now();
    const rec={...body,id:body.id||nextId(rows,cfg.prefix),fecha_actualizacion:ts,origen_informacion:body.origen_informacion||'carga manual',eliminado:false};
    if(entity==='personas'&&!rec.fecha_incorporacion) rec.fecha_incorporacion=ts;
    await appendRecord(env,cfg,rec); await audit(env,entity,rec.id,'crear',rec.origen_informacion); return json(rec,201);
  }
  const current=await findById(env,entity,id); if(!current) return json({error:'No encontrado'},404);
  if(req.method==='PUT'){
    const patch=validateRecord(entity,await req.json(),{partial:true}); const rec={...cleanRow(current),...patch,id:current.id,fecha_actualizacion:now()};
    await updateRecord(env,cfg,current.__row,rec); await audit(env,entity,id,'editar',patch.origen_informacion||rec.origen_informacion); return json(rec);
  }
  if(req.method==='DELETE'){
    const rec={...cleanRow(current),eliminado:true,estado:'Eliminado',fecha_actualizacion:now()}; await updateRecord(env,cfg,current.__row,rec); await audit(env,entity,id,'baja lógica','carga manual'); return json({ok:true,id});
  }
  return json({error:'Método no permitido'},405);
}

async function selfSave(env, req){
  const body=await req.json();
  const email=String(body.email||'').trim().toLowerCase();
  const nombre=String(body.nombre_completo||'').trim();
  if(!nombre) return json({error:'El nombre es obligatorio'},400);
  if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) return json({error:'Ingresá un correo válido'},400);

  const cfg=ENTITY_CONFIG.personas;
  const rows=await listRows(env,cfg);
  let current=rows.find(r=>String(r.email||'').trim().toLowerCase()===email && !deleted(r.eliminado));
  const ts=now();
  const allowed={
    nombre_completo:nombre,
    email,
    profesion:String(body.profesion||'').trim(),
    especialidad:String(body.especialidad||'').trim(),
    puede_aportar:String(body.puede_aportar||'').trim(),
    busca:String(body.busca||'').trim(),
    tiene_proyecto_propio:String(body.proyecto||'').trim() ? 'Sí — '+String(body.proyecto).trim() : (current?.tiene_proyecto_propio||''),
    estado:'Activo',
    fecha_actualizacion:ts,
    origen_informacion:'autocarga web'
  };

  let person;
  if(current){
    person={...cleanRow(current)};
    for(const [k,v] of Object.entries(allowed)) if(v!=='' || ['especialidad','puede_aportar','busca'].includes(k)) person[k]=v;
    await updateRecord(env,cfg,current.__row,person);
    await audit(env,'personas',person.id,'autocarga/editar','autocarga web');
  }else{
    person={...allowed,id:nextId(rows,cfg.prefix),fecha_incorporacion:ts,eliminado:false};
    await appendRecord(env,cfg,person);
    await audit(env,'personas',person.id,'autocarga/crear','autocarga web');
  }

  const proyecto=String(body.proyecto||'').trim();
  if(proyecto){
    const pcfg=ENTITY_CONFIG.proyectos;
    const prows=await listRows(env,pcfg);
    const existing=prows.find(p=>String(p.creador_id||'')===String(person.id) && !deleted(p.eliminado));
    const pdata={
      nombre:proyecto,
      creador_id:person.id,
      responsables:person.id,
      descripcion:String(body.descripcion_proyecto||'').trim(),
      sector:String(body.sector||'').trim(),
      etapa:String(body.etapa||'').trim()||existing?.etapa||'Por determinar',
      estado:'Activo',
      fecha_actualizacion:ts,
      origen_informacion:'autocarga web',
      eliminado:false
    };
    if(existing){
      const prec={...cleanRow(existing),...pdata,id:existing.id};
      await updateRecord(env,pcfg,existing.__row,prec);
      await audit(env,'proyectos',existing.id,'autocarga/editar','autocarga web');
    }else{
      const prec={...pdata,id:nextId(prows,pcfg.prefix)};
      await appendRecord(env,pcfg,prec);
      await audit(env,'proyectos',prec.id,'autocarga/crear','autocarga web');
    }
  }
  return json({ok:true,persona:publicPerson(person)});
}

async function bootstrap(env, req){
  if(!authorized(env,req)) return json({error:'No autorizado'},401);
  await ensureStore(env,ENTITY_CONFIG);
  return json({ok:true,sheets:Object.values(ENTITY_CONFIG).map(x=>x.sheet)});
}

async function recomputeMatches(env, req){
  if(!authorized(env,req)) return json({error:'No autorizado'},401);
  const needs=await listEntity(env,'necesidades'); const caps=await listEntity(env,'capacidades'); const existing=await listEntity(env,'matches'); const cfg=ENTITY_CONFIG.matches;
  const known=new Set(existing.map(m=>`${m.necesidad_id}|${m.capacidad_id}`)); let created=0;
  for(const m of buildMatches(needs,caps)){
    const key=`${m.need.id}|${m.capability.id}`; if(known.has(key)) continue;
    const all=await listRows(env,cfg); const rec={id:nextId(all,cfg.prefix),origen_tipo:m.need.entidad_tipo,origen_id:m.need.entidad_id,destino_tipo:m.capability.entidad_tipo,destino_id:m.capability.entidad_id,persona_id:m.capability.entidad_tipo==='persona'?m.capability.entidad_id:(m.need.entidad_tipo==='persona'?m.need.entidad_id:''),proyecto_id:m.need.entidad_tipo==='proyecto'?m.need.entidad_id:(m.capability.entidad_tipo==='proyecto'?m.capability.entidad_id:''),necesidad_id:m.need.id,capacidad_id:m.capability.id,explicacion:m.explanation,puntuacion:m.score,estado:'sugerido',fecha:now(),fecha_actualizacion:now(),origen_informacion:'deducción razonable',eliminado:false};
    await appendRecord(env,cfg,rec); created++;
  }
  await audit(env,'matches','*','recalcular','deducción razonable',`${created} matches nuevos`); return json({ok:true,created});
}

async function globalSearch(env, q){
  const needle=String(q||'').trim().toLowerCase(); if(!needle) return json({query:q,results:[]});
  const results=[];
  for(const entity of PUBLIC_ENTITIES){ for(const row of await listEntity(env,entity)){ const text=Object.values(row).join(' ').toLowerCase(); if(text.includes(needle)) results.push({entity,id:row.id,label:row.nombre_completo||row.nombre||row.capacidad||row.necesidad||row.pendiente||row.id,row:cleanRow(row)}); } }
  return json({query:q,results:results.slice(0,100)});
}

async function uploadDocument(env, req){
  if(!authorized(env,req)) return json({error:'No autorizado'},401);
  const form=await req.formData(); const file=form.get('file'); if(!(file instanceof File)) return json({error:'Falta archivo'},400);
  const drive=await uploadFileToDrive(env,file,{name:file.name});
  const cfg=ENTITY_CONFIG.documentos, rows=await listRows(env,cfg), ts=now();
  const rec={id:nextId(rows,cfg.prefix),persona_id:form.get('persona_id')||'',proyecto_id:form.get('proyecto_id')||'',nombre:drive.name||file.name,tipo:drive.mimeType||file.type,drive_file_id:drive.id,url:drive.webViewLink||`https://drive.google.com/open?id=${drive.id}`,fecha:drive.createdTime||ts,origen:form.get('origen')||'carga manual',resumen:'',estado_analisis:'Pendiente',fecha_actualizacion:ts,origen_informacion:form.get('origen')||'carga manual',origen_referencia:'',eliminado:false};
  await appendRecord(env,cfg,rec); await audit(env,'documentos',rec.id,'subir',rec.origen_informacion); return json(rec,201);
}

export default { async fetch(req, env){
  const h=cors(env,req); if(req.method==='OPTIONS') return new Response(null,{status:204,headers:h});
  try{
    const url=new URL(req.url); const path=url.pathname.replace(/\/+$/,'')||'/';
    if(!path.startsWith('/api/') && env.ASSETS) return env.ASSETS.fetch(req);
    await ensureStore(env,ENTITY_CONFIG);
    if(path==='/api/health') return json({ok:true,service:'MESA API',storage:env.DB?'d1':'google',storageConfigured:Boolean(env.DB||(env.GOOGLE_SPREADSHEET_ID&&env.GOOGLE_REFRESH_TOKEN))},200,h);
    if(path==='/api/self/persona'&&req.method==='POST') { const r=await selfSave(env,req); return withHeaders(r,h); }
    if(path==='/api/admin/bootstrap'&&req.method==='POST') { const r=await bootstrap(env,req); return withHeaders(r,h); }
    if(path==='/api/matches/recompute'&&req.method==='POST') { const r=await recomputeMatches(env,req); return withHeaders(r,h); }
    if(path==='/api/search'&&req.method==='GET') { const r=await globalSearch(env,url.searchParams.get('q')); return withHeaders(r,h); }
    if(path==='/api/documentos/upload'&&req.method==='POST') { const r=await uploadDocument(env,req); return withHeaders(r,h); }
    const m=path.match(/^\/api\/([a-záéíóúñ]+)(?:\/([^/]+))?$/i);
    if(m){ const entity=normalizeEntityName(m[1]); const r=await crud(env,req,entity,m[2]); return withHeaders(r,h); }
    return json({error:'Ruta no encontrada'},404,h);
  }catch(e){ return json({error:e.message||String(e)},500,h); }
}};

function withHeaders(res, headers){ const out=new Response(res.body,res); for(const [k,v] of Object.entries(headers)) out.headers.set(k,v); return out; }
