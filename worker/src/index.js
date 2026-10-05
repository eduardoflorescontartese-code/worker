import { ENTITY_CONFIG, PUBLIC_ENTITIES, normalizeEntityName, validateRecord } from './schema.js';
import { ensureStore, listRows, appendRecord, updateRecord } from './store.js';
import { buildMatches } from './matching.js';
import { createPublicApi } from './public.js';
import { createMatchingService } from './matching-service.js';

const json = (data,status=200,headers={}) => new Response(JSON.stringify(data,null,2),{status,headers:{'content-type':'application/json; charset=utf-8',...headers}});
const now = () => new Date().toISOString();

function cors(env, req){
  const origin = req.headers.get('origin');
  const allowed = env.ALLOWED_ORIGIN || '*';
  return {'access-control-allow-origin': allowed==='*' ? '*' : (origin===allowed ? origin : allowed),'access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS','vary':'Origin'};
}
const ADMIN_FALLBACK_HASH='820c59c46d80d7da228a6346a96d36a6e22beda13750d968ad7ce9a4aabf1f51';
async function sha256Hex(value){ const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||''))); return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
async function authorized(env, req){
  const h=req.headers.get('authorization')||'';
  if(env.MESA_ADMIN_TOKEN && h===`Bearer ${env.MESA_ADMIN_TOKEN}`) return true;
  if(!h.startsWith('Bearer ')) return false;
  const token=h.slice(7).trim();
  if(!token) return false;
  return (await sha256Hex(token))===ADMIN_FALLBACK_HASH;
}
function cleanRow(o){ const x={...o}; delete x.__row; return x; }
function deleted(v){ return v===true || ['true','1','sí','si'].includes(String(v).toLowerCase()); }
function nextId(rows,prefix){ let max=0; const re=new RegExp(`^${prefix}-(\\d+)$`); for(const r of rows){ const m=String(r.id||'').match(re); if(m) max=Math.max(max,Number(m[1])); } return `${prefix}-${String(max+1).padStart(4,'0')}`; }
async function audit(env, entity,id,action,origin,detail=''){ const cfg=ENTITY_CONFIG.auditoria; const rows=await listRows(env,cfg); const rec={id:nextId(rows,cfg.prefix),fecha:now(),entidad:entity,registro_id:id,accion:action,origen:origin||'carga manual',usuario_origen:'api',detalle}; await appendRecord(env,cfg,rec); }

async function listEntity(env,entity, includeDeleted=false){ const cfg=ENTITY_CONFIG[entity]; const rows=await listRows(env,cfg); return includeDeleted ? rows : rows.filter(r=>!deleted(r.eliminado)); }
async function findById(env,entity,id){ return (await listRows(env,ENTITY_CONFIG[entity])).find(r=>String(r.id)===String(id)); }
const publicApi=createPublicApi({listEntity,json});
const matchingService=createMatchingService({
  ENTITY_CONFIG,
  listRows,
  listEntity,
  updateRecord,
  appendRecord,
  cleanRow,
  deleted,
  nextId,
  now,
  buildMatches,
  authorized,
  audit,
  json
});

async function crud(env, req, entity, id){
  const cfg=ENTITY_CONFIG[entity];
  if(req.method==='GET'){
    const isAdmin=await authorized(env,req);
    if(id){
      const row=await findById(env,entity,id);
      if(!row || deleted(row.eliminado)) return json({error:'No encontrado'},404);
      if(isAdmin) return json(cleanRow(row));
      return json({error:'No autorizado'},401);
    }
    const rows=await listEntity(env,entity);
    if(isAdmin) return json(rows.map(cleanRow));
    return json({error:'No autorizado'},401);
  }
  if(!(await authorized(env,req))) return json({error:'No autorizado'},401);
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
  const editToken=String(body.edit_token||'').trim();
  if(!nombre) return json({error:'El nombre es obligatorio'},400);
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({error:'Ingresá un correo válido'},400);
  if(editToken.length<20) return json({error:'Falta tu enlace personal de edición'},403);

  const tokenHash=await sha256Hex(editToken);
  const cfg=ENTITY_CONFIG.personas;
  const rows=await listRows(env,cfg);
  let current=rows.find(r=>String(r.email||'').trim().toLowerCase()===email && !deleted(r.eliminado));
  const ts=now();

  if(current?.self_edit_hash && current.self_edit_hash!==tokenHash){
    return json({error:'Esta ficha solo puede editarse desde su enlace personal'},403);
  }

  const allowed={
    nombre_completo:nombre,
    email,
    self_edit_hash:current?.self_edit_hash||tokenHash,
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
    person={...cleanRow(current),...allowed,id:current.id};
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
  let matchingResult={ok:true,created:0,verdes:0,amarillos:0};
  try{ matchingResult=await matchingService.recomputeMatchesCore(env); }catch{}
  return json({ok:true,persona:{id:person.id,nombre_completo:person.nombre_completo,estado:person.estado},matching:matchingResult});
}

async function bootstrap(env, req){
  if(!(await authorized(env,req))) return json({error:'No autorizado'},401);
  await ensureStore(env);
  return json({ok:true,sheets:Object.values(ENTITY_CONFIG).map(x=>x.sheet)});
}

async function uploadDocument(env, req){
  if(!(await authorized(env,req))) return json({error:'No autorizado'},401);
  if(!env.DOCS) return json({error:'El almacenamiento de archivos todavía no está configurado. La base D1 sí está operativa.'},503);

  const form=await req.formData();
  const file=form.get('file');
  if(!(file instanceof File)) return json({error:'Falta archivo'},400);

  const cfg=ENTITY_CONFIG.documentos;
  const rows=await listRows(env,cfg);
  const ts=now();
  const storedName=file.name||'archivo';
  const storedType=file.type||'application/octet-stream';
  const key=`mesa/${Date.now()}-${crypto.randomUUID()}-${storedName.replace(/[^a-zA-Z0-9._-]+/g,'_')}`;

  await env.DOCS.put(key,await file.arrayBuffer(),{
    httpMetadata:{contentType:storedType},
    customMetadata:{
      persona_id:String(form.get('persona_id')||''),
      proyecto_id:String(form.get('proyecto_id')||'')
    }
  });

  const rec={
    id:nextId(rows,cfg.prefix),
    persona_id:form.get('persona_id')||'',
    proyecto_id:form.get('proyecto_id')||'',
    nombre:storedName,
    tipo:storedType,
    storage_key:key,
    url:`r2://DOCS/${key}`,
    fecha:ts,
    origen:form.get('origen')||'carga manual',
    resumen:'',
    estado_analisis:'Pendiente',
    fecha_actualizacion:ts,
    origen_informacion:form.get('origen')||'carga manual',
    origen_referencia:key,
    eliminado:false
  };
  await appendRecord(env,cfg,rec);
  await audit(env,'documentos',rec.id,'subir',rec.origen_informacion);
  return json(rec,201);
}

export default { async fetch(req, env){
  const h=cors(env,req); if(req.method==='OPTIONS') return new Response(null,{status:204,headers:h});
  try{
    const url=new URL(req.url); const path=url.pathname.replace(/\/+$/,'')||'/';
    if(!path.startsWith('/api/') && env.ASSETS) return env.ASSETS.fetch(req);
    if(path==='/api/health') {
      let storeReady=true, storeError='';
      try{ await ensureStore(env); }catch(e){ storeReady=false; storeError=e?.message||String(e); }
      return json({
        ok:storeReady,
        service:'MESA API',
        storage:'d1',
        storageConfigured:Boolean(env.DB),
        documentsStorage:env.DOCS?'r2':'not-configured',
        storeError
      },200,h);
    }
    await ensureStore(env);
    if(path==='/api/public/stats'&&req.method==='GET') { const r=await publicApi.stats(env); return withHeaders(r,h); }
    if(path==='/api/public/dashboard'&&req.method==='GET') { const r=await publicApi.dashboard(env); return withHeaders(r,h); }
    if(path==='/api/public/pending-ids'&&req.method==='GET') { const r=await publicApi.pendingIds(env); return withHeaders(r,h); }
    if(path==='/api/self/persona'&&req.method==='POST') { const r=await selfSave(env,req); return withHeaders(r,h); }
    if(path==='/api/admin/bootstrap'&&req.method==='POST') { const r=await bootstrap(env,req); return withHeaders(r,h); }
    if(path==='/api/matches/recompute'&&req.method==='POST') { const r=await matchingService.recomputeMatches(env,req); return withHeaders(r,h); }
    if(path==='/api/search'&&req.method==='GET') { const r=await publicApi.search(env,url.searchParams.get('q')); return withHeaders(r,h); }
    if(path==='/api/documentos/upload'&&req.method==='POST') { const r=await uploadDocument(env,req); return withHeaders(r,h); }
    const m=path.match(/^\/api\/([a-záéíóúñ]+)(?:\/([^/]+))?$/i);
    if(m){ const entity=normalizeEntityName(m[1]); const r=await crud(env,req,entity,m[2]); return withHeaders(r,h); }
    return json({error:'Ruta no encontrada'},404,h);
  }catch(e){ return json({error:e.message||String(e)},500,h); }
}};

function withHeaders(res, headers){ const out=new Response(res.body,res); for(const [k,v] of Object.entries(headers)) out.headers.set(k,v); return out; }
