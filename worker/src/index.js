import { ENTITY_CONFIG, PUBLIC_ENTITIES, normalizeEntityName, validateRecord } from './schema.js';
import { ensureStore, listRows, appendRecord, updateRecord, googleConfigured } from './store.js';
import { uploadFileToDrive } from './google.js';
import { buildMatches } from './matching.js';

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
function publicPerson(r){ return {id:r.id,nombre_completo:r.nombre_completo||[r.nombre,r.apellido].filter(Boolean).join(' '),profesion:r.profesion||'',especialidad:r.especialidad||'',tiene_proyecto_propio:r.tiene_proyecto_propio||'',estado:r.estado||'Activo'}; }
function publicProject(r){ return {id:r.id,nombre:r.nombre||'',creador_id:r.creador_id||'',descripcion:r.descripcion||'',sector:r.sector||'',etapa:r.etapa||'',estado:r.estado||'Activo'}; }

function publicCapability(r){ return {id:r.id,entidad_tipo:r.entidad_tipo||'',entidad_id:r.entidad_id||'',capacidad:r.capacidad||'',categoria:r.categoria||'',nivel:r.nivel||'',estado:r.estado||'Disponible'}; }
function publicNeed(r){ return {id:r.id,entidad_tipo:r.entidad_tipo||'',entidad_id:r.entidad_id||'',necesidad:r.necesidad||'',categoria:r.categoria||'',prioridad:r.prioridad||'',estado:r.estado||'Abierta'}; }
function publicMatch(r){ return {id:r.id,persona_id:r.persona_id||'',proyecto_id:r.proyecto_id||'',necesidad_id:r.necesidad_id||'',capacidad_id:r.capacidad_id||'',explicacion:r.explicacion||'',puntuacion:Number(r.puntuacion)||0,semaforo:r.semaforo||'',estado:r.estado||'sugerido'}; }

async function publicDashboard(env){
  const [people,projects,needs,caps,matches]=await Promise.all([
    listEntity(env,'personas'),
    listEntity(env,'proyectos'),
    listEntity(env,'necesidades'),
    listEntity(env,'capacidades'),
    listEntity(env,'matches')
  ]);
  const peopleMap=new Map(people.map(p=>[String(p.id),publicPerson(p)]));
  const projectMap=new Map(projects.map(p=>[String(p.id),publicProject(p)]));
  const safeMatches=matches
    .map(publicMatch)
    .sort((a,b)=>b.puntuacion-a.puntuacion)
    .slice(0,8)
    .map(m=>({
      ...m,
      persona:peopleMap.get(String(m.persona_id))||null,
      proyecto:projectMap.get(String(m.proyecto_id))||null
    }));
  return json({
    counts:{personas:people.length,proyectos:projects.length,necesidades:needs.length,capacidades:caps.length,matches:matches.length},
    personas:people.slice(0,6).map(publicPerson),
    proyectos:projects.slice(0,6).map(publicProject),
    necesidades:needs.slice(0,6).map(publicNeed),
    capacidades:caps.slice(0,6).map(publicCapability),
    matches:safeMatches
  });
}

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
  try{ matchingResult=await recomputeMatchesCore(env); }catch{}
  return json({ok:true,persona:{id:person.id,nombre_completo:person.nombre_completo,estado:person.estado},matching:matchingResult});
}

async function publicStats(env){
  const people=await listEntity(env,'personas');
  const projects=await listEntity(env,'proyectos');
  return json({personas:people.length,proyectos:projects.length});
}
async function publicPendingIds(env){
  const people=await listEntity(env,'personas');
  const ids=people.filter(p=>String(p.origen_informacion||'')!=='autocarga web').map(p=>p.id);
  return json({ids});
}

async function bootstrap(env, req){
  if(!(await authorized(env,req))) return json({error:'No autorizado'},401);
  await ensureStore(env,ENTITY_CONFIG);
  return json({ok:true,sheets:Object.values(ENTITY_CONFIG).map(x=>x.sheet)});
}

async function upsertDerivedSignal(env, entity, ref, data){
  const cfg=ENTITY_CONFIG[entity];
  const rows=await listRows(env,cfg);
  const existing=rows.find(r=>String(r.origen_referencia||'')===ref);
  const text=String(entity==='capacidades'?data.capacidad:data.necesidad||'').trim();
  if(!text){
    if(existing && !deleted(existing.eliminado)){
      const rec={...cleanRow(existing),eliminado:true,estado:'Inactiva',fecha_actualizacion:now()};
      await updateRecord(env,cfg,existing.__row,rec);
    }
    return;
  }
  const ts=now();
  const common={...data,fecha_actualizacion:ts,origen_informacion:'deducción razonable',origen_referencia:ref,eliminado:false};
  if(existing){
    const rec={...cleanRow(existing),...common,id:existing.id};
    await updateRecord(env,cfg,existing.__row,rec);
  }else{
    const rec={...common,id:nextId(rows,cfg.prefix)};
    await appendRecord(env,cfg,rec);
  }
}

async function refreshDerivedSignals(env){
  const people=await listEntity(env,'personas');
  const projects=await listEntity(env,'proyectos');

  for(const p of people){
    const profile=[p.profesion,p.especialidad,p.tecnologias].filter(Boolean).join(' · ');
    const aporte=[p.puede_aportar,p.capacidades_tecnicas_resumen,p.capacidades_no_tecnicas_resumen].filter(Boolean).join(' · ');
    await upsertDerivedSignal(env,'capacidades',`auto:persona:${p.id}:perfil`,{entidad_tipo:'persona',entidad_id:p.id,capacidad:profile,categoria:'Perfil profesional',nivel:p.seniority||'',evidencia:p.experiencia||'',estado:'Disponible'});
    await upsertDerivedSignal(env,'capacidades',`auto:persona:${p.id}:aporte`,{entidad_tipo:'persona',entidad_id:p.id,capacidad:aporte,categoria:'Capacidad disponible',nivel:p.seniority||'',evidencia:p.experiencia||'',estado:'Disponible'});
    await upsertDerivedSignal(env,'necesidades',`auto:persona:${p.id}:busca`,{entidad_tipo:'persona',entidad_id:p.id,necesidad:p.busca||'',categoria:'Necesidad declarada',prioridad:'Media',detalle:p.intereses||'',estado:'Abierta'});
  }

  const projectNeedFields=[
    ['capacidades_faltantes_resumen','Capacidades faltantes'],
    ['perfiles_buscados','Perfiles buscados'],
    ['necesidades_tecnicas','Tecnología'],
    ['necesidades_comerciales','Comercial'],
    ['necesidades_financieras','Financiación'],
    ['necesidades_legales','Legal'],
    ['necesidades_hardware','Hardware']
  ];

  for(const p of projects){
    const capability=[p.capacidades_existentes_resumen,p.tecnologias,p.evidencia_existente].filter(Boolean).join(' · ');
    await upsertDerivedSignal(env,'capacidades',`auto:proyecto:${p.id}:existente`,{entidad_tipo:'proyecto',entidad_id:p.id,capacidad:capability,categoria:p.sector||'Proyecto',nivel:p.etapa||'',evidencia:p.evidencia_existente||'',estado:'Disponible'});
    for(const [field,category] of projectNeedFields){
      await upsertDerivedSignal(env,'necesidades',`auto:proyecto:${p.id}:${field}`,{entidad_tipo:'proyecto',entidad_id:p.id,necesidad:p[field]||'',categoria:category,prioridad:'Media',detalle:p.descripcion||'',estado:'Abierta'});
    }
  }
}

async function recomputeMatchesCore(env){
  await refreshDerivedSignals(env);

  const needs=await listEntity(env,'necesidades');
  const caps=await listEntity(env,'capacidades');
  const existing=await listEntity(env,'matches');
  const projects=await listEntity(env,'proyectos');
  const cfg=ENTITY_CONFIG.matches;
  const ownerByProject=new Map(projects.map(p=>[String(p.id),String(p.creador_id||'')]));
  const known=new Set(existing.map(m=>`${m.necesidad_id}|${m.capacidad_id}`));
  let created=0, verdes=0, amarillos=0;

  for(const m of buildMatches(needs,caps)){
    const key=`${m.need.id}|${m.capability.id}`;
    if(known.has(key)) continue;

    const needOwner=m.need.entidad_tipo==='proyecto'?ownerByProject.get(String(m.need.entidad_id)):'';
    const capOwner=m.capability.entidad_tipo==='proyecto'?ownerByProject.get(String(m.capability.entidad_id)):'';
    if(m.need.entidad_tipo==='proyecto' && m.capability.entidad_tipo==='persona' && needOwner===String(m.capability.entidad_id)) continue;
    if(m.need.entidad_tipo==='persona' && m.capability.entidad_tipo==='proyecto' && capOwner===String(m.need.entidad_id)) continue;

    const all=await listRows(env,cfg);
    const rec={
      id:nextId(all,cfg.prefix),
      origen_tipo:m.need.entidad_tipo,
      origen_id:m.need.entidad_id,
      destino_tipo:m.capability.entidad_tipo,
      destino_id:m.capability.entidad_id,
      persona_id:m.capability.entidad_tipo==='persona'?m.capability.entidad_id:(m.need.entidad_tipo==='persona'?m.need.entidad_id:''),
      proyecto_id:m.need.entidad_tipo==='proyecto'?m.need.entidad_id:(m.capability.entidad_tipo==='proyecto'?m.capability.entidad_id:''),
      necesidad_id:m.need.id,
      capacidad_id:m.capability.id,
      explicacion:m.explanation,
      puntuacion:m.score,
      semaforo:m.semaforo,
      estado:'sugerido',
      fecha:now(),
      fecha_actualizacion:now(),
      origen_informacion:'deducción razonable',
      eliminado:false
    };
    await appendRecord(env,cfg,rec);
    created++;
    if(m.semaforo==='verde') verdes++;
    else if(m.semaforo==='amarillo') amarillos++;
  }
  return {ok:true,created,verdes,amarillos};
}

async function recomputeMatches(env, req){
  if(!(await authorized(env,req))) return json({error:'No autorizado'},401);
  const result=await recomputeMatchesCore(env);
  await audit(env,'matches','*','recalcular','deducción razonable',`${result.created} matches nuevos; ${result.verdes} verdes; ${result.amarillos} amarillos`);
  return json(result);
}

async function globalSearch(env, q){
  const needle=String(q||'').trim().toLowerCase();
  if(!needle) return json({query:q,results:[]});
  const results=[];
  for(const row of await listEntity(env,'personas')){
    const safe=publicPerson(row);
    if(Object.values(safe).join(' ').toLowerCase().includes(needle)) results.push({entity:'personas',id:safe.id,label:safe.nombre_completo,row:safe});
  }
  for(const row of await listEntity(env,'proyectos')){
    const safe=publicProject(row);
    if(Object.values(safe).join(' ').toLowerCase().includes(needle)) results.push({entity:'proyectos',id:safe.id,label:safe.nombre,row:safe});
  }
  for(const row of await listEntity(env,'capacidades')){
    const safe=publicCapability(row);
    if(Object.values(safe).join(' ').toLowerCase().includes(needle)) results.push({entity:'capacidades',id:safe.id,label:safe.capacidad,row:safe});
  }
  for(const row of await listEntity(env,'necesidades')){
    const safe=publicNeed(row);
    if(Object.values(safe).join(' ').toLowerCase().includes(needle)) results.push({entity:'necesidades',id:safe.id,label:safe.necesidad,row:safe});
  }
  return json({query:q,results:results.slice(0,60)});
}

async function uploadDocument(env, req){
  if(!(await authorized(env,req))) return json({error:'No autorizado'},401);
  const form=await req.formData();
  const file=form.get('file');
  if(!(file instanceof File)) return json({error:'Falta archivo'},400);
  const cfg=ENTITY_CONFIG.documentos, rows=await listRows(env,cfg), ts=now();

  let storageUrl='', driveFileId='', storedName=file.name||'archivo', storedType=file.type||'application/octet-stream', created=ts;
  if(googleConfigured(env) && env.GOOGLE_DRIVE_FOLDER_ID){
    const drive=await uploadFileToDrive(env,file,{name:storedName});
    storageUrl=drive.webViewLink||`https://drive.google.com/open?id=${drive.id}`;
    driveFileId=drive.id||'';
    storedName=drive.name||storedName;
    storedType=drive.mimeType||storedType;
    created=drive.createdTime||created;
  }else{
    if(!env.DOCS) return json({error:'No hay almacenamiento de documentos configurado'},503);
    const key=`mesa/${Date.now()}-${crypto.randomUUID()}-${storedName.replace(/[^a-zA-Z0-9._-]+/g,'_')}`;
    await env.DOCS.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:storedType}});
    storageUrl=`r2://DOCS/${key}`;
  }

  const rec={
    id:nextId(rows,cfg.prefix),
    persona_id:form.get('persona_id')||'',
    proyecto_id:form.get('proyecto_id')||'',
    nombre:storedName,
    tipo:storedType,
    drive_file_id:driveFileId,
    url:storageUrl,
    fecha:created,
    origen:form.get('origen')||'carga manual',
    resumen:'',
    estado_analisis:'Pendiente',
    fecha_actualizacion:ts,
    origen_informacion:form.get('origen')||'carga manual',
    origen_referencia:driveFileId||storageUrl,
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
    await ensureStore(env,ENTITY_CONFIG);
    if(path==='/api/health') { const storage=googleConfigured(env)?'google':(env.DB?'d1':'none'); return json({ok:true,service:'MESA API',storage,storageConfigured:storage!=='none',googleConfigured:googleConfigured(env),googleConfig:{clientId:Boolean(env.GOOGLE_CLIENT_ID),clientSecret:Boolean(env.GOOGLE_CLIENT_SECRET),refreshToken:Boolean(env.GOOGLE_REFRESH_TOKEN),spreadsheetId:Boolean(env.GOOGLE_SPREADSHEET_ID),driveFolderId:Boolean(env.GOOGLE_DRIVE_FOLDER_ID)}},200,h); }
    if(path==='/api/public/stats'&&req.method==='GET') { const r=await publicStats(env); return withHeaders(r,h); }
    if(path==='/api/public/dashboard'&&req.method==='GET') { const r=await publicDashboard(env); return withHeaders(r,h); }
    if(path==='/api/public/pending-ids'&&req.method==='GET') { const r=await publicPendingIds(env); return withHeaders(r,h); }
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
