const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const labels={personas:'Personas',proyectos:'Proyectos',capacidades:'Capacidades',necesidades:'Necesidades',matches:'Matches',equipos:'Equipos',pendientes:'Pendientes',documentos:'Documentos',auditoria:'Auditoría'};
const singular={personas:'Persona',proyectos:'Proyecto',capacidades:'Capacidad',necesidades:'Necesidad',matches:'Match',equipos:'Equipo',pendientes:'Pendiente',documentos:'Documento',auditoria:'Auditoría'};
let token='',schema={},snapshot={},current='resumen',editing=null;

async function call(path,init={}){
 const h=new Headers(init.headers||{}); if(token)h.set('authorization','Bearer '+token); if(init.body)h.set('content-type','application/json');
 const r=await fetch(path,{cache:'no-store',...init,headers:h}); const t=await r.text(); let d;try{d=JSON.parse(t)}catch{d={raw:t}};if(!r.ok)throw new Error(d.error||'HTTP '+r.status);return d;
}
function rows(e){return snapshot[e]||[]}
function setMsg(el,text,bad=false){el.textContent=text;el.className='msg'+(bad?' err':'');el.hidden=!text}
async function login(v){
 token=v.trim(); if(!token)throw new Error('Ingresá la clave administrativa');
 schema=await call('/api/admin/schema');
 sessionStorage.setItem('mesa_admin_token',token);
 await loadSnapshot();
 $('#login').hidden=true;$('#app').hidden=false;renderNav();renderSummary();
}
async function loadSnapshot(){
 const d=await call('/api/admin/snapshot?include_deleted=false'); snapshot=d.data||{};
}
function renderNav(){
 const order=['personas','proyectos','equipos','necesidades','capacidades','matches','pendientes','documentos','auditoria'];
 $('#navEntities').innerHTML=order.map(e=>'<button data-entity="'+e+'">'+labels[e]+'</button>').join('');
}
function renderSummary(){
 current='resumen';$('#summary').hidden=false;$('#entitySection').hidden=true;$('#title').textContent='Resumen';$('#subtitle').textContent='Control operativo y seguimiento interno';
 document.querySelectorAll('[data-entity]').forEach(x=>x.classList.toggle('active',x.dataset.entity==='resumen'));
 const statEntities=['personas','proyectos','equipos','matches'];
 $('#stats').innerHTML=statEntities.map(e=>'<div class="stat"><b>'+rows(e).length+'</b><span>'+labels[e]+'</span></div>').join('');
 $('#system').innerHTML='<div class="system-row"><span>Base operativa</span><b class="ok">D1 activa</b></div><div class="system-row"><span>Administración</span><b class="ok">Privada</b></div><div class="system-row"><span>Entidades gestionables</span><b>'+Object.keys(schema.entities||{}).length+'</b></div><div class="system-row"><span>Última lectura</span><b>'+new Date().toLocaleTimeString('es-UY',{hour:'2-digit',minute:'2-digit'})+'</b></div>';
 renderProjectOverview();renderActivity();
}
function renderProjectOverview(){
 const projects=rows('proyectos');
 $('#projectOverview').innerHTML=projects.length?projects.map(p=>{
  const team=rows('equipos').filter(x=>x.proyecto_id===p.id);
  const needs=rows('necesidades').filter(x=>x.entidad_tipo==='proyecto'&&x.entidad_id===p.id);
  const matches=rows('matches').filter(x=>x.proyecto_id===p.id);
  return '<div class="project-card" data-project="'+esc(p.id)+'"><h3>'+esc(p.nombre||p.id)+'</h3><p>'+esc(p.descripcion||p.problema||'Sin descripción interna')+'</p><div class="project-meta"><span class="pill">'+esc(p.etapa||'Etapa sin definir')+'</span><span class="pill">'+team.length+' equipo(s)</span><span class="pill">'+needs.length+' necesidad(es)</span><span class="pill">'+matches.length+' match(es)</span></div></div>'
 }).join(''):'<p>No hay proyectos todavía.</p>';
}
function renderActivity(){
 const a=[...rows('auditoria')].sort((x,y)=>String(y.fecha).localeCompare(String(x.fecha))).slice(0,12);
 $('#activity').innerHTML=table(a,['fecha','entidad','registro_id','accion','origen','detalle'],false);
}
function table(data,fields,actions=true){
 if(!data.length)return '<p>No hay registros.</p>';
 return '<table><thead><tr>'+fields.map(f=>'<th>'+esc(f.replaceAll('_',' '))+'</th>').join('')+(actions?'<th>Acciones</th>':'')+'</tr></thead><tbody>'+data.map(r=>'<tr>'+fields.map(f=>'<td class="cut" title="'+esc(r[f]||'')+'">'+esc(r[f]||'—')+'</td>').join('')+(actions?'<td><div class="row-actions">'+(current==='proyectos'?'<button data-detail="'+esc(r.id)+'" class="ghost">Ver</button>':'')+'<button data-edit="'+esc(r.id)+'">Editar</button><button data-delete="'+esc(r.id)+'" class="danger">Baja</button></div></td>':'')+'</tr>').join('')+'</tbody></table>';
}
function visibleFields(entity){
 const preferred={
  personas:['id','nombre_completo','email','profesion','especialidad','estado','disponibilidad'],
  proyectos:['id','nombre','creador_id','sector','etapa','estado','proximos_pasos'],
  equipos:['id','nombre','proyecto_id','integrantes','roles','estado','proximos_pasos'],
  necesidades:['id','entidad_id','necesidad','categoria','prioridad','estado'],
  capacidades:['id','entidad_id','capacidad','categoria','nivel','estado'],
  matches:['id','persona_id','proyecto_id','puntuacion','semaforo','estado'],
  pendientes:['id','entidad_id','pendiente','prioridad','estado','fecha_objetivo'],
  documentos:['id','nombre','proyecto_id','persona_id','tipo','estado_analisis'],
  auditoria:['fecha','entidad','registro_id','accion','origen','detalle']
 };
 return preferred[entity]||['id'];
}
function renderEntity(entity){
 current=entity;$('#summary').hidden=true;$('#entitySection').hidden=false;$('#title').textContent=labels[entity];$('#subtitle').textContent='Información interna y gestión de '+labels[entity].toLowerCase();
 document.querySelectorAll('[data-entity]').forEach(x=>x.classList.toggle('active',x.dataset.entity===entity));
 $('#entityTitle').textContent=labels[entity];$('#count').textContent=rows(entity).length+' registro(s)';
 $('#newRecord').hidden=entity==='auditoria';
 renderRecords();
}
function renderRecords(){
 const q=$('#search').value.trim().toLowerCase();const data=rows(current).filter(r=>!q||Object.values(r).some(v=>String(v??'').toLowerCase().includes(q)));
 $('#records').innerHTML=table(data,visibleFields(current),current!=='auditoria');
}
function fieldHtml(name,value=''){
 const long=/descripcion|experiencia|observaciones|detalle|resumen|notas|proximos|capacidades_|necesidades_|perfiles_|evidencia|validaciones|solucion|problema|roles|integrantes|explicacion|busca|puede_aportar|preguntas/.test(name);
 return '<div class="field"><label>'+esc(name.replaceAll('_',' '))+'</label>'+(long?'<textarea name="'+esc(name)+'">'+esc(value)+'</textarea>':'<input name="'+esc(name)+'" value="'+esc(value)+'" '+(name==='id'?'readonly':'')+'>')+'</div>';
}
function openEditor(entity,record=null){
 editing={entity,id:record?.id||null};$('#modalTitle').textContent=(record?'Editar ':'Nuevo ')+singular[entity];$('#modalSub').textContent=record?.id||'Se asignará un ID automáticamente';
 const fields=(schema.entities?.[entity]?.fields||[]).filter(f=>!['fecha_actualizacion','eliminado','self_edit_hash'].includes(f));
 $('#fields').innerHTML=fields.map(f=>fieldHtml(f,record?.[f]||'')).join('');$('#modal').hidden=false;
}
async function saveEditor(){
 const fd=new FormData($('#editForm'));const data={};for(const [k,v] of fd.entries())if(k!=='id'||editing.id)data[k]=String(v).trim();
 if(editing.id)await call('/api/'+editing.entity+'/'+encodeURIComponent(editing.id),{method:'PUT',body:JSON.stringify(data)});
 else{delete data.id;await call('/api/'+editing.entity,{method:'POST',body:JSON.stringify(data)})}
 $('#modal').hidden=true;await loadSnapshot();renderEntity(editing.entity);
}
function detailBlock(title,items,formatter){
 return '<h3>'+esc(title)+' ('+items.length+')</h3>'+(items.length?items.map(x=>'<div class="detail-block">'+formatter(x)+'</div>').join(''):'<div class="detail-block"><p>Sin registros.</p></div>');
}
function openProject(id){
 const p=rows('proyectos').find(x=>x.id===id);if(!p)return;
 $('#detailTitle').textContent=p.nombre||p.id;$('#detailSub').textContent=[p.sector,p.etapa,p.estado].filter(Boolean).join(' · ');
 const creator=rows('personas').find(x=>x.id===p.creador_id);
 const needs=rows('necesidades').filter(x=>x.entidad_tipo==='proyecto'&&x.entidad_id===id);
 const caps=rows('capacidades').filter(x=>x.entidad_tipo==='proyecto'&&x.entidad_id===id);
 const teams=rows('equipos').filter(x=>x.proyecto_id===id);
 const matches=rows('matches').filter(x=>x.proyecto_id===id);
 const pending=rows('pendientes').filter(x=>x.entidad_id===id);
 const docs=rows('documentos').filter(x=>x.proyecto_id===id);
 let h='<div class="detail-block"><b>Descripción interna</b><p>'+esc(p.descripcion||'—')+'</p><b>Problema</b><p>'+esc(p.problema||'—')+'</p><b>Solución</b><p>'+esc(p.solucion||'—')+'</p><b>Próximos pasos</b><p>'+esc(p.proximos_pasos||'—')+'</p></div>';
 h+=detailBlock('Creador / responsable',creator?[creator]:[],x=>'<b>'+esc(x.nombre_completo||x.id)+'</b><p>'+esc([x.email,x.profesion,x.especialidad].filter(Boolean).join(' · '))+'</p>');
 h+=detailBlock('Equipos',teams,x=>'<b>'+esc(x.nombre||x.id)+'</b><p>Integrantes: '+esc(x.integrantes||'—')+'\nRoles: '+esc(x.roles||'—')+'\nEstado: '+esc(x.estado||'—')+'\nPróximos pasos: '+esc(x.proximos_pasos||'—')+'</p>');
 h+=detailBlock('Necesidades',needs,x=>'<b>'+esc(x.necesidad||x.id)+'</b><p>'+esc([x.categoria,x.prioridad,x.estado].filter(Boolean).join(' · '))+'\n'+esc(x.detalle||'')+'</p>');
 h+=detailBlock('Capacidades',caps,x=>'<b>'+esc(x.capacidad||x.id)+'</b><p>'+esc([x.categoria,x.nivel,x.estado].filter(Boolean).join(' · '))+'</p>');
 h+=detailBlock('Matches',matches,x=>'<b>'+esc((x.puntuacion||'—')+' · '+(x.semaforo||''))+'</b><p>Persona: '+esc(x.persona_id||'—')+'\n'+esc(x.explicacion||'')+'</p>');
 h+=detailBlock('Pendientes',pending,x=>'<b>'+esc(x.pendiente||x.id)+'</b><p>'+esc([x.prioridad,x.estado,x.fecha_objetivo].filter(Boolean).join(' · '))+'\n'+esc(x.notas||'')+'</p>');
 h+=detailBlock('Documentos',docs,x=>'<b>'+esc(x.nombre||x.id)+'</b><p>'+esc([x.tipo,x.estado_analisis].filter(Boolean).join(' · '))+(x.url?'\n'+esc(x.url):'')+'</p>');
 $('#detailBody').innerHTML=h;$('#detail').hidden=false;
}
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();try{await login($('#token').value);setMsg($('#loginMsg'),'')}catch(err){setMsg($('#loginMsg'),err.message,true)}});
$('#logout').onclick=()=>{sessionStorage.removeItem('mesa_admin_token');location.reload()};
$('#refresh').onclick=async()=>{await loadSnapshot();current==='resumen'?renderSummary():renderEntity(current)};
document.addEventListener('click',async e=>{
 const nav=e.target.closest('[data-entity]');if(nav){nav.dataset.entity==='resumen'?renderSummary():renderEntity(nav.dataset.entity);return}
 const n=e.target.closest('[data-new]');if(n){openEditor(n.dataset.new);return}
 const edit=e.target.closest('[data-edit]');if(edit){openEditor(current,rows(current).find(x=>x.id===edit.dataset.edit));return}
 const det=e.target.closest('[data-detail],[data-project]');if(det){openProject(det.dataset.detail||det.dataset.project);return}
 const del=e.target.closest('[data-delete]');if(del&&confirm('¿Dar de baja este registro?')){await call('/api/'+current+'/'+encodeURIComponent(del.dataset.delete),{method:'DELETE'});await loadSnapshot();renderEntity(current)}
});
$('#newRecord').onclick=()=>openEditor(current);
$('#search').oninput=renderRecords;
$('#modalClose').onclick=$('#cancel').onclick=()=>$('#modal').hidden=true;
$('#detailClose').onclick=()=>$('#detail').hidden=true;
$('#editForm').onsubmit=async e=>{e.preventDefault();try{await saveEditor()}catch(err){alert(err.message)}};
$('#recompute').onclick=async()=>{const b=$('#recompute');b.disabled=true;try{await call('/api/matches/recompute',{method:'POST'});await loadSnapshot();renderSummary();setMsg($('#actionMsg'),'Matching recalculado correctamente.')}catch(err){setMsg($('#actionMsg'),err.message,true)}finally{b.disabled=false}};
const saved=sessionStorage.getItem('mesa_admin_token');if(saved){$('#token').value=saved;login(saved).catch(()=>sessionStorage.removeItem('mesa_admin_token'));}