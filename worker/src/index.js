import { ENTITY_CONFIG, PUBLIC_ENTITIES, normalizeEntityName, validateRecord } from './schema.js';
import { ensureStore, listRows, appendRecord, updateRecord } from './store.js';
import { buildMatches } from './matching.js';
import { createPublicApi } from './public.js';
import { createMatchingService } from './matching-service.js';
import { applySecurityHeaders, preflightResponse, guardRequest, readJsonLimited, bounded, constantTimeEqual, requestId } from './security.js';

const json = (data,status=200,headers={}) => new Response(JSON.stringify(data,null,2),{status,headers:{'content-type':'application/json; charset=utf-8',...headers}});
const now = () => new Date().toISOString();

async function sha256Hex(value){ const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||''))); return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
async function authorized(env, req){
  const secret=String(env.MESA_ADMIN_TOKEN||'');
  if(secret.length<32)return false;
  const h=req.headers.get('authorization')||'';
  if(!h.startsWith('Bearer '))return false;
  const token=h.slice(7).trim();
  return constantTimeEqual(token,secret);
}
function cleanRow(o){ const x={...o}; delete x.__row; return x; }
function deleted(v){ return v===true || ['true','1','sí','si'].includes(String(v).toLowerCase()); }
function nextId(rows,prefix){ let max=0; const re=new RegExp(`^${prefix}-(\\d+)$`); for(const r of rows){ const m=String(r.id||'').match(re); if(m) max=Math.max(max,Number(m[1])); } return `${prefix}-${String(max+1).padStart(4,'0')}`; }
async function audit(env, entity,id,action,origin,detail=''){ const cfg=ENTITY_CONFIG.auditoria; const rows=await listRows(env,cfg); const rec={id:nextId(rows,cfg.prefix),fecha:now(),entidad:entity,registro_id:id,accion:action,origen:origin||'carga manual',usuario_origen:'api',detalle:detail}; await appendRecord(env,cfg,rec); }

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
    const body=validateRecord(entity,await readJsonLimited(req)); const rows=await listRows(env,cfg); const ts=now();
    const rec={...body,id:body.id||nextId(rows,cfg.prefix),fecha_actualizacion:ts,origen_informacion:body.origen_informacion||'carga manual',eliminado:false};
    if(entity==='personas'&&!rec.fecha_incorporacion) rec.fecha_incorporacion=ts;
    await appendRecord(env,cfg,rec); await audit(env,entity,rec.id,'crear',rec.origen_informacion); return json(rec,201);
  }
  const current=await findById(env,entity,id); if(!current) return json({error:'No encontrado'},404);
  if(req.method==='PUT'){
    const patch=validateRecord(entity,await readJsonLimited(req),{partial:true}); const rec={...cleanRow(current),...patch,id:current.id,fecha_actualizacion:now()};
    await updateRecord(env,cfg,current.__row,rec); await audit(env,entity,id,'editar',patch.origen_informacion||rec.origen_informacion); return json(rec);
  }
  if(req.method==='DELETE'){
    const rec={...cleanRow(current),eliminado:true,estado:'Eliminado',fecha_actualizacion:now()}; await updateRecord(env,cfg,current.__row,rec); await audit(env,entity,id,'baja lógica','carga manual'); return json({ok:true,id});
  }
  return json({error:'Método no permitido'},405);
}

async function selfSave(env, req){
  const body=await readJsonLimited(req,32*1024);
  if(bounded(body.website,200)) return json({ok:true});
  const email=bounded(body.email,254).toLowerCase();
  const nombre=bounded(body.nombre_completo,120);
  const editToken=bounded(body.edit_token,256);
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
    profesion:bounded(body.profesion,160),
    especialidad:bounded(body.especialidad,160),
    puede_aportar:bounded(body.puede_aportar,3000),
    busca:bounded(body.busca,3000),
    tiene_proyecto_propio:bounded(body.proyecto,200) ? 'Sí — '+bounded(body.proyecto,200) : (current?.tiene_proyecto_propio||''),
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

  const proyecto=bounded(body.proyecto,200);
  if(proyecto){
    const pcfg=ENTITY_CONFIG.proyectos;
    const prows=await listRows(env,pcfg);
    const existing=prows.find(p=>String(p.creador_id||'')===String(person.id) && !deleted(p.eliminado));
    const pdata={
      nombre:proyecto,
      creador_id:person.id,
      responsables:person.id,
      descripcion:bounded(body.descripcion_proyecto,5000),
      sector:bounded(body.sector,160),
      etapa:bounded(body.etapa,120)||existing?.etapa||'Por determinar',
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
  const rid=requestId(req);
  const preflight=preflightResponse(env,req);
  if(preflight)return preflight;

  let path='/';
  try{
    const url=new URL(req.url);
    path=url.pathname.replace(/\/+$/,'')||'/';

    const guarded=await guardRequest(env,req,path);
    if(guarded)return applySecurityHeaders(guarded,req,env,rid);

    if(!path.startsWith('/api/')&&env.ASSETS){
      const asset=await env.ASSETS.fetch(req);
      return applySecurityHeaders(asset,req,env,rid);
    }

    let response;

    if(path==='/api/health'){
      let storeReady=true;
      try{ await ensureStore(env); }catch{ storeReady=false; }
      response=json({
        ok:storeReady,
        service:'MESA API',
        storage:'d1',
        storageConfigured:Boolean(env.DB),
        documentsStorage:env.DOCS?'r2':'not-configured'
      },storeReady?200:503);
      return applySecurityHeaders(response,req,env,rid);
    }

    await ensureStore(env);

    if(path==='/api/public/stats'&&req.method==='GET'){
      response=await publicApi.stats(env);
    }else if(path==='/api/public/dashboard'&&req.method==='GET'){
      response=await publicApi.dashboard(env);
    }else if(path==='/api/public/pending-ids'&&req.method==='GET'){
      if(!(await authorized(env,req))) response=json({error:'No autorizado'},401);
      else response=await publicApi.pendingIds(env);
    }else if(path==='/api/self/persona'&&req.method==='POST'){
      response=await selfSave(env,req);
    }else if(path==='/api/admin/bootstrap'&&req.method==='POST'){
      response=await bootstrap(env,req);
    }else if(path==='/api/matches/recompute'&&req.method==='POST'){
      response=await matchingService.recomputeMatches(env,req);
    }else if(path==='/api/search'&&req.method==='GET'){
      const q=bounded(url.searchParams.get('q'),120);
      response=await publicApi.search(env,q);
    }else if(path==='/api/documentos/upload'&&req.method==='POST'){
      response=await uploadDocument(env,req);
    }else{
      const m=path.match(/^\/api\/([a-záéíóúñ]+)(?:\/([^/]+))?$/i);
      if(m){
        const entity=normalizeEntityName(m[1]);
        if(!entity||!ENTITY_CONFIG[entity]) response=json({error:'Ruta no encontrada'},404);
        else response=await crud(env,req,entity,m[2]);
      }else{
        response=json({error:'Ruta no encontrada'},404);
      }
    }

    return applySecurityHeaders(response,req,env,rid);
  }catch(e){
    const status=Number(e?.status)||500;
    console.error('MESA request failed',{request_id:rid,path,status,message:e?.message||String(e)});
    const safeMessage=status<500?(e?.message||'Solicitud inválida'):'Error interno';
    return applySecurityHeaders(
      json({error:safeMessage,request_id:rid},status),
      req,
      env,
      rid
    );
  }
}};