import { api } from './api.js';

const views=['mapa','personas','capacidades','proyectos','necesidades','matches','equipos','pendientes','documentos','configuracion'];
const labels={mapa:'Mapa vivo',personas:'Personas',capacidades:'Capacidades',proyectos:'Proyectos',necesidades:'Necesidades',matches:'Matches',equipos:'Equipos',pendientes:'Pendientes',documentos:'Documentos',configuracion:'Configuración'};
const columns={
 personas:['id','nombre_completo','profesion','especialidad','estado','fecha_actualizacion'], proyectos:['id','nombre','sector','etapa','estado','fecha_actualizacion'], capacidades:['id','entidad_tipo','entidad_id','capacidad','categoria','estado'], necesidades:['id','entidad_tipo','entidad_id','necesidad','categoria','prioridad','estado'], matches:['id','persona_id','proyecto_id','explicacion','puntuacion','estado'], equipos:['id','nombre','proyecto_id','integrantes','estado'], documentos:['id','nombre','tipo','persona_id','proyecto_id','url','estado_analisis'], pendientes:['id','entidad_tipo','entidad_id','pendiente','prioridad','estado']};
const formFields={
 personas:['nombre_completo','email','telefono','ciudad','departamento','pais','profesion','especialidad','experiencia','seniority','sectores','tecnologias','disponibilidad','intereses','puede_aportar','busca','tiene_proyecto_propio','linkedin','web','observaciones','preguntas_pendientes','estado','origen_informacion'],
 proyectos:['nombre','creador_id','responsables','descripcion','sector','problema','solucion','etapa','tecnologias','evidencia_existente','perfiles_buscados','necesidades_tecnicas','necesidades_comerciales','necesidades_financieras','necesidades_legales','necesidades_hardware','validaciones','piloto','clientes','estado','proximos_pasos','origen_informacion'],
 capacidades:['entidad_tipo','entidad_id','capacidad','categoria','nivel','evidencia','estado','origen_informacion'],
 necesidades:['entidad_tipo','entidad_id','necesidad','categoria','prioridad','detalle','estado','origen_informacion'],
 matches:['estado'], equipos:['nombre','proyecto_id','integrantes','roles','capacidades_cubiertas','capacidades_faltantes','estado','notas','responsable_id','proximos_pasos','origen_informacion'],
 pendientes:['entidad_tipo','entidad_id','pendiente','prioridad','estado','fecha_objetivo','responsable_id','notas','origen_informacion']
};
let current='mapa';
let mapSnapshot=null,mapTimer=null,mapFilter='todos',mapQuery='',mapSelected=null;
const app=document.querySelector('#app'), title=document.querySelector('#title'), subtitle=document.querySelector('#subtitle');
const nav=document.querySelector('#nav');
for(const v of views){ const b=document.createElement('button'); b.textContent=labels[v]; b.dataset.view=v; b.onclick=()=>go(v); nav.appendChild(b); }

document.querySelector('#authBtn').onclick=async()=>{ const v=prompt('Token de administración de MESA (se guarda solo durante esta sesión):',''); if(v){api.setToken(v);if(current==='mapa')await liveMap();else go(current)} };
document.querySelector('#searchBtn').onclick=searchGlobal; document.querySelector('#globalSearch').addEventListener('keydown',e=>{if(e.key==='Enter')searchGlobal();});

async function go(v){ if(mapTimer){clearInterval(mapTimer);mapTimer=null} current=v; location.hash=v; [...nav.children].forEach(b=>b.classList.toggle('active',b.dataset.view===v)); title.textContent=labels[v]; subtitle.textContent=v==='mapa'?'Quién va con quién, en qué proyecto y para hacer qué.':'Google Sheets es la fuente de verdad'; app.innerHTML='<div class="content"><div class="empty">Cargando…</div></div>'; try{ if(v==='mapa') await liveMap(); else if(v==='configuracion') await settings(); else await entityView(v); }catch(e){ fail(e); } }
function esc(v){ return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
function fail(e){
  const msg=String(e?.message||e||'Error inesperado');
  const auth=/no autorizado|401/i.test(msg);
  app.innerHTML='<div class="content"><div class="notice '+(auth?'':'error')+'"><strong>'+(auth?'Acceso requerido':'No se pudo completar la operación')+'</strong><p>'+(auth?'Ingresá el token de administración desde el botón “Acceso”. La información permanece en Google Sheets/Drive y no se perdió.':esc(msg))+'</p>'+(auth?'<button id="inline-auth">Ingresar acceso</button>':'')+'</div></div>';
  const b=document.querySelector('#inline-auth');if(b)b.onclick=document.querySelector('#authBtn').onclick;
}

function textNorm(v){return String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function values(v){
  if(Array.isArray(v))return v.map(String).map(x=>x.trim()).filter(Boolean);
  const s=String(v??'').trim();if(!s)return[];
  try{const j=JSON.parse(s);if(Array.isArray(j))return j.map(String).map(x=>x.trim()).filter(Boolean);if(j&&typeof j==='object')return Object.entries(j).map(([k,val])=>k+': '+val)}catch{}
  return s.split(/[;\n,]+/).map(x=>x.trim()).filter(Boolean);
}
function initials(name){return String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()}
function entityKind(v){const s=textNorm(v);return s.startsWith('proy')?'proyecto':s.startsWith('pers')?'persona':s}
function personByToken(token,people){
  const t=textNorm(token);if(!t)return null;
  return people.find(p=>textNorm(p.id)===t||textNorm(p.nombre_completo)===t||textNorm(p.nombre_completo).includes(t)||t.includes(textNorm(p.nombre_completo)))||null;
}
function roleFor(team,person,index){
  const raw=team.roles;if(!raw)return'Integrante del equipo';
  try{const j=JSON.parse(raw);if(Array.isArray(j)&&j[index])return String(j[index]);if(j&&typeof j==='object')return String(j[person.id]||j[person.nombre_completo]||'Integrante del equipo')}catch{}
  const parts=values(raw),needle=textNorm(person.id),name=textNorm(person.nombre_completo);
  const found=parts.find(x=>{const n=textNorm(x);return n.includes(needle)||(name&&n.includes(name))});
  if(found&&found.includes(':'))return found.split(':').slice(1).join(':').trim()||'Integrante del equipo';
  if(parts.length>index&&parts.length===values(team.integrantes).length)return parts[index];
  return String(raw).length<90?String(raw):'Integrante del equipo';
}
function mapModel(data){
  const people=data.personas||[],projects=data.proyectos||[],teams=data.equipos||[],matches=data.matches||[];
  const personMap=new Map(people.map(x=>[String(x.id),x])),projectMap=new Map(projects.map(x=>[String(x.id),x])),edges=[],seen=new Set();
  for(const team of teams){
    const project=projectMap.get(String(team.proyecto_id||''));if(!project)continue;
    const members=values(team.integrantes);
    members.forEach((token,i)=>{const person=personByToken(token,people);if(!person)return;const key=person.id+'|'+project.id;if(seen.has(key))return;seen.add(key);edges.push({personId:person.id,projectId:project.id,type:'team',score:100,label:roleFor(team,person,i),teamId:team.id,teamName:team.nombre||team.id})});
  }
  for(const m of matches){
    if(['descartado','rechazado','eliminado'].includes(textNorm(m.estado)))continue;
    const person=personMap.get(String(m.persona_id||'')),project=projectMap.get(String(m.proyecto_id||''));if(!person||!project)continue;
    const key=person.id+'|'+project.id;if(seen.has(key))continue;seen.add(key);
    const confirmed=textNorm(m.estado)==='confirmado';
    edges.push({personId:person.id,projectId:project.id,type:confirmed?'team':'match',score:Number(m.puntuacion||0),label:m.explicacion||('Match '+Number(m.puntuacion||0)+'%'),matchId:confirmed?'':m.id});
  }
  return{people,projects,teams,matches,personMap,projectMap,edges};
}
function liveBadge(kind,text){const el=document.querySelector('#liveState');if(!el)return;el.className='live-state '+kind;el.innerHTML='<span></span>'+esc(text)}
async function liveMap(){
  app.innerHTML='<div class="map-wrap"><div class="map-main"><div class="map-toolbar"><div class="map-tabs"><button data-map-filter="todos">Todos</button><button data-map-filter="confirmados">Equipos confirmados</button><button data-map-filter="matches">Matches ≥70%</button><button data-map-filter="necesidades">Con necesidades abiertas</button></div><div class="map-toolbar-right"><div class="map-counts" id="map-counts"></div><button class="secondary map-action" id="map-recompute">Recalcular</button><button class="secondary map-action" id="map-refresh">Actualizar</button></div></div><div class="map-scroll"><div class="graph-stage" id="graph-stage"><div class="map-empty">Sincronizando red operativa…</div></div></div></div><aside class="map-inspector" id="map-inspector"><div class="empty">Seleccioná una persona o proyecto.</div></aside></div>';
  document.querySelectorAll('[data-map-filter]').forEach(b=>b.onclick=()=>{mapFilter=b.dataset.mapFilter;renderLiveMap()});
  document.querySelector('#map-refresh').onclick=()=>refreshLiveMap(false);
  document.querySelector('#map-recompute').onclick=async()=>{const btn=document.querySelector('#map-recompute');btn.disabled=true;try{const r=await api.recompute();await refreshLiveMap(false);alert((r.created||0)+' matches nuevos calculados.')}catch(e){alert(e.message)}finally{btn.disabled=false}};
  await refreshLiveMap(false);
  mapTimer=setInterval(()=>{if(current==='mapa')refreshLiveMap(true)},15000);
}
async function refreshLiveMap(quiet){
  try{
    if(!quiet)liveBadge('','Sincronizando');
    const snap=await api.graph();mapSnapshot=snap.data||{};
    if(!mapSelected){const model=mapModel(mapSnapshot),ranked=model.projects.slice().sort((a,b)=>model.edges.filter(e=>e.projectId===b.id).length-model.edges.filter(e=>e.projectId===a.id).length);if(ranked[0])mapSelected={type:'project',id:ranked[0].id}}
    renderLiveMap();
    liveBadge('ok','Actualizado '+new Date(snap.updatedAt||Date.now()).toLocaleTimeString('es-UY',{hour:'2-digit',minute:'2-digit',second:'2-digit'}));
  }catch(e){liveBadge('error','Sin conexión');if(!quiet)fail(e)}
}
function openNeedsForProject(data,projectId){return(data.necesidades||[]).filter(n=>entityKind(n.entidad_tipo)==='proyecto'&&String(n.entidad_id)===String(projectId)&&textNorm(n.estado)!=='cubierta'&&textNorm(n.estado)!=='eliminado')}
function pendingFor(data,type,id){return(data.pendientes||[]).filter(p=>entityKind(p.entidad_tipo)===type&&String(p.entidad_id)===String(id)&&!['cerrado','completado','eliminado'].includes(textNorm(p.estado)))}
function capsFor(data,personId){return(data.capacidades||[]).filter(x=>entityKind(x.entidad_tipo)==='persona'&&String(x.entidad_id)===String(personId)&&textNorm(x.estado)!=='eliminado')}
function renderLiveMap(){
  if(!mapSnapshot)return;const data=mapSnapshot,model=mapModel(data),q=textNorm(mapQuery);
  let edges=model.edges.slice();
  if(mapFilter==='confirmados')edges=edges.filter(e=>e.type==='team');
  if(mapFilter==='matches')edges=edges.filter(e=>e.type==='match'&&e.score>=70);
  let projects=model.projects.slice();
  if(mapFilter==='necesidades')projects=projects.filter(p=>openNeedsForProject(data,p.id).length);
  if(q){
    const matchedPeople=new Set(model.people.filter(p=>textNorm([p.nombre_completo,p.profesion,p.especialidad,p.tecnologias].join(' ')).includes(q)).map(p=>p.id));
    const matchedProjects=new Set(projects.filter(p=>textNorm([p.nombre,p.sector,p.descripcion,p.problema,p.solucion,p.tecnologias].join(' ')).includes(q)).map(p=>p.id));
    for(const cap of data.capacidades||[]){if(textNorm(cap.capacidad).includes(q)&&entityKind(cap.entidad_tipo)==='persona')matchedPeople.add(cap.entidad_id)}
    edges=edges.filter(e=>matchedPeople.has(e.personId)||matchedProjects.has(e.projectId));
    projects=projects.filter(p=>matchedProjects.has(p.id)||edges.some(e=>e.projectId===p.id));
  }
  const edgeCount=id=>edges.filter(e=>e.projectId===id).length;
  projects=projects.sort((a,b)=>edgeCount(b.id)-edgeCount(a.id)||String(a.nombre||'').localeCompare(String(b.nombre||''))).slice(0,6);
  const projectIds=new Set(projects.map(p=>p.id));edges=edges.filter(e=>projectIds.has(e.projectId));
  const personIds=new Set(edges.map(e=>e.personId));let people=model.people.filter(p=>personIds.has(p.id));
  if(q)people=people.concat(model.people.filter(p=>!personIds.has(p.id)&&textNorm([p.nombre_completo,p.profesion,p.especialidad].join(' ')).includes(q)).slice(0,5));
  people=Array.from(new Map(people.map(p=>[p.id,p])).values()).slice(0,20);

  const width=940,height=Math.max(680,projects.length*180+150),projectPos=new Map(),personPos=new Map();
  projects.forEach((p,i)=>projectPos.set(p.id,{x:620,y:120+i*180}));
  people.forEach((p,i)=>{const rel=edges.filter(e=>e.personId===p.id&&projectPos.has(e.projectId));const ys=rel.map(e=>projectPos.get(e.projectId).y);const base=ys.length?ys.reduce((a,b)=>a+b,0)/ys.length:130+i*90;const lane=i%3;personPos.set(p.id,{x:115+lane*155,y:Math.max(80,Math.min(height-80,base+((i%5)-2)*25))})});

  const paths=[],labels=[];
  for(const e of edges){const a=personPos.get(e.personId),b=projectPos.get(e.projectId);if(!a||!b)continue;const mid=(a.x+b.x)/2;paths.push('<path class="'+e.type+'" d="M '+a.x+' '+a.y+' C '+mid+' '+a.y+', '+mid+' '+b.y+', '+b.x+' '+b.y+'"></path>');if(mapSelected&&mapSelected.type==='project'&&mapSelected.id===e.projectId){labels.push('<span class="orbit-label" style="left:'+mid+'px;top:'+((a.y+b.y)/2)+'px">'+esc(e.label.length>34?e.label.slice(0,34)+'…':e.label)+'</span>')}}
  const personHtml=people.map((p,i)=>{const pos=personPos.get(p.id),selected=mapSelected&&mapSelected.type==='person'&&mapSelected.id===p.id;const linked=edges.some(e=>e.personId===p.id);return '<button class="person-node '+(linked?'':'unlinked')+(selected?' selected':'')+'" data-map-node="person" data-id="'+esc(p.id)+'" style="left:'+pos.x+'px;top:'+pos.y+'px"><span class="person-avatar">'+esc(initials(p.nombre_completo))+'</span><span class="person-name">'+esc(p.nombre_completo||p.id)+'</span><span class="person-role">'+esc(p.especialidad||p.profesion||'Perfil')+'</span></button>'}).join('');
  const projectHtml=projects.map(p=>{const pos=projectPos.get(p.id),selected=mapSelected&&mapSelected.type==='project'&&mapSelected.id===p.id,needs=openNeedsForProject(data,p.id).length,rels=edges.filter(e=>e.projectId===p.id);return '<button class="project-node'+(selected?' selected':'')+'" data-map-node="project" data-id="'+esc(p.id)+'" style="left:'+pos.x+'px;top:'+pos.y+'px"><span class="project-kicker"><b>'+esc(p.sector||'PROYECTO')+'</b><span>'+esc(p.etapa||p.estado||'En análisis')+'</span></span><h3>'+esc(p.nombre||p.id)+'</h3><p>'+esc((p.problema||p.descripcion||'').slice(0,105))+'</p><span class="project-foot"><span class="mini-pill">'+rels.length+' vínculos</span><span class="mini-pill">'+needs+' necesidades</span></span></button>'}).join('');

  const stage=document.querySelector('#graph-stage');if(stage){stage.style.height=height+'px';stage.innerHTML='<svg class="graph-lines" viewBox="0 0 '+width+' '+height+'" preserveAspectRatio="none">'+paths.join('')+'</svg>'+labels.join('')+personHtml+projectHtml+(!projects.length&&!people.length?'<div class="map-empty">No hay relaciones que coincidan con este filtro.</div>':'')}
  const counts=document.querySelector('#map-counts');if(counts)counts.innerHTML='<span>'+people.length+' personas visibles</span><span>'+projects.length+' proyectos</span><span>'+edges.filter(e=>e.type==='team').length+' equipos</span><span>'+edges.filter(e=>e.type==='match').length+' matches</span>';
  document.querySelectorAll('[data-map-filter]').forEach(b=>b.classList.toggle('active',b.dataset.mapFilter===mapFilter));
  document.querySelectorAll('[data-map-node]').forEach(b=>b.onclick=()=>{mapSelected={type:b.dataset.mapNode,id:b.dataset.id};renderLiveMap()});
  renderInspector(model,data,edges);
  document.querySelectorAll('[data-new-pending]').forEach(b=>b.onclick=()=>openQuickPending(b.dataset.newPending,b.dataset.id,b.dataset.responsable||''));
  document.querySelectorAll('[data-complete-pending]').forEach(b=>b.onclick=()=>completePendingFromMap(b.dataset.completePending,b));
  document.querySelectorAll('[data-confirm-match]').forEach(b=>b.onclick=()=>decideMatchFromMap(b.dataset.confirmMatch,'confirm',b));
  document.querySelectorAll('[data-dismiss-match]').forEach(b=>b.onclick=()=>decideMatchFromMap(b.dataset.dismissMatch,'dismiss',b));
}
async function completePendingFromMap(id,button){
  if(button)button.disabled=true;
  try{await api.update('pendientes',id,{estado:'completado',origen_informacion:'operación MESA'});await refreshLiveMap(false)}
  catch(e){alert(e.message)}
  finally{if(button)button.disabled=false}
}
async function decideMatchFromMap(id,decision,button){
  const label=decision==='confirm'?'Confirmar este match y sumarlo al equipo':'Descartar este match';
  if(!confirm(label+'?'))return;
  const buttons=document.querySelectorAll('[data-confirm-match],[data-dismiss-match]');buttons.forEach(x=>x.disabled=true);
  try{await api.decideMatch(id,decision);await refreshLiveMap(false)}
  catch(e){alert(e.message)}
  finally{buttons.forEach(x=>x.disabled=false);if(button)button.blur()}
}
function matchActions(e){
  if(e.type!=='match'||!e.matchId)return'';
  return '<div class="match-actions"><button data-confirm-match="'+esc(e.matchId)+'">Confirmar equipo</button><button class="secondary" data-dismiss-match="'+esc(e.matchId)+'">Descartar</button></div>';
}
function recentActivity(data,limit=6){
  const rows=(data.auditoria||[]).slice().sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||''))).slice(0,limit);
  if(!rows.length)return'<div class="muted">Todavía no hay actividad auditada.</div>';
  return rows.map(x=>'<div class="activity-item"><span>'+esc(x.accion||'cambio')+'</span><strong>'+esc((x.entidad||'')+' '+(x.registro_id||''))+'</strong><small>'+esc(x.detalle||x.origen||'')+'</small><time>'+esc(x.fecha?new Date(x.fecha).toLocaleString('es-UY'):'')+'</time></div>').join('');
}
function openQuickPending(type,id,defaultResponsible=''){
  const modal=document.querySelector('#modal'),form=document.querySelector('#modalForm');
  document.querySelector('#modalTitle').textContent='Nuevo pendiente';
  document.querySelector('#modalBody').innerHTML='<div class="grid"><div class="field" style="grid-column:1/-1"><label>Pendiente</label><textarea name="pendiente" required></textarea></div><div class="field"><label>Prioridad</label><select name="prioridad"><option>Alta</option><option selected>Media</option><option>Baja</option></select></div><div class="field"><label>Responsable ID</label><input name="responsable_id" value="'+esc(defaultResponsible)+'" placeholder="P-0001"></div><div class="field"><label>Fecha objetivo</label><input name="fecha_objetivo" type="date"></div><div class="field"><label>Notas</label><input name="notas"></div></div>';
  form.onsubmit=async e=>{e.preventDefault();if(e.submitter?.value==='cancel'){modal.close();return}const fd=new FormData(form);try{await api.create('pendientes',{entidad_tipo:type,entidad_id:id,pendiente:fd.get('pendiente'),prioridad:fd.get('prioridad')||'Media',estado:'abierto',fecha_alta:new Date().toISOString(),fecha_objetivo:fd.get('fecha_objetivo')||'',responsable_id:fd.get('responsable_id')||'',notas:fd.get('notas')||'',origen_informacion:'carga manual'});modal.close();await refreshLiveMap(false)}catch(err){alert(err.message)}};
  modal.showModal();
}

function renderInspector(model,data,edges){
  const box=document.querySelector('#map-inspector');if(!box)return;
  if(!mapSelected){box.innerHTML='<div class="empty">Seleccioná una persona o proyecto.</div>';return}
  if(mapSelected.type==='person'){
    const p=model.personMap.get(String(mapSelected.id));if(!p){box.innerHTML='<div class="empty">Perfil no encontrado.</div>';return}
    const rel=edges.filter(e=>e.personId===p.id),caps=capsFor(data,p.id),pending=pendingFor(data,'persona',p.id);
    box.innerHTML='<div class="inspector-head"><span class="inspector-kicker">PERSONA · '+esc(p.id)+'</span><h2>'+esc(p.nombre_completo||p.id)+'</h2><p>'+esc([p.profesion,p.especialidad,p.seniority].filter(Boolean).join(' · ')||'Perfil en construcción')+'</p><button class="secondary inspector-action" data-new-pending="persona" data-id="'+esc(p.id)+'" data-responsable="'+esc(p.id)+'">Asignar pendiente</button></div>'+
      '<section class="inspector-section"><h4>Qué puede aportar</h4><div class="inspector-list">'+(caps.length?caps.slice(0,8).map(x=>'<div class="cap-item"><strong>'+esc(x.capacidad)+'</strong><br>'+esc([x.categoria,x.nivel].filter(Boolean).join(' · '))+'</div>').join(''):'<div class="muted">Sin capacidades registradas.</div>')+'</div></section>'+
      '<section class="inspector-section"><h4>Con quién / dónde encaja</h4><div class="inspector-list">'+(rel.length?rel.map(e=>{const pr=model.projectMap.get(e.projectId);return '<div class="inspector-item"><span class="mini-avatar">'+esc(initials(pr?.nombre||'P'))+'</span><div><strong>'+esc(pr?.nombre||e.projectId)+'</strong><small>'+esc(e.type==='team'?'Equipo confirmado · '+e.label:'Match '+e.score+'% · '+e.label)+'</small>'+matchActions(e)+'</div></div>'}).join(''):'<div class="muted">Sin vínculos visibles con este filtro.</div>')+'</div></section>'+
      '<section class="inspector-section"><h4>Pendientes</h4>'+(pending.length?pending.slice(0,6).map(x=>'<div class="task-item"><span>'+esc(x.pendiente)+'</span><button class="task-done" data-complete-pending="'+esc(x.id)+'">Hecho</button></div>').join(''):'<div class="muted">Sin pendientes abiertos.</div>')+'</section><section class="inspector-section"><h4>Actividad reciente</h4><div class="activity-list">'+recentActivity(data,5)+'</div></section><div class="legend"><span><i></i>Equipo</span><span><i class="dash"></i>Match sugerido</span></div>';
    return;
  }
  const p=model.projectMap.get(String(mapSelected.id));if(!p){box.innerHTML='<div class="empty">Proyecto no encontrado.</div>';return}
  const rel=edges.filter(e=>e.projectId===p.id),needs=openNeedsForProject(data,p.id),pending=pendingFor(data,'proyecto',p.id);
  box.innerHTML='<div class="inspector-head"><span class="inspector-kicker">PROYECTO · '+esc(p.id)+'</span><h2>'+esc(p.nombre||p.id)+'</h2><p>'+esc([p.sector,p.etapa,p.estado].filter(Boolean).join(' · '))+'</p><button class="secondary inspector-action" data-new-pending="proyecto" data-id="'+esc(p.id)+'">Crear pendiente</button></div>'+
    '<section class="inspector-section"><h4>Quién va con quién y para qué</h4><div class="inspector-list">'+(rel.length?rel.map(e=>{const person=model.personMap.get(e.personId);return '<div class="inspector-item"><span class="mini-avatar">'+esc(initials(person?.nombre_completo||'P'))+'</span><div><strong>'+esc(person?.nombre_completo||e.personId)+'</strong><small>'+esc(e.type==='team'?'Confirmado · '+e.label:'Sugerido '+e.score+'% · '+e.label)+'</small>'+matchActions(e)+'</div></div>'}).join(''):'<div class="muted">Aún no hay personas vinculadas.</div>')+'</div></section>'+
    '<section class="inspector-section"><h4>Necesidades abiertas</h4>'+(needs.length?needs.slice(0,8).map(x=>'<div class="need-item"><strong>'+esc(x.necesidad)+'</strong><br>'+esc([x.categoria,x.prioridad].filter(Boolean).join(' · '))+'</div>').join(''):'<div class="muted">No hay necesidades abiertas registradas.</div>')+'</section>'+
    '<section class="inspector-section"><h4>Pendientes</h4>'+(pending.length?pending.slice(0,6).map(x=>'<div class="task-item"><span>'+esc(x.pendiente)+'</span><button class="task-done" data-complete-pending="'+esc(x.id)+'">Hecho</button></div>').join(''):'<div class="muted">Sin pendientes abiertos.</div>')+'</section><section class="inspector-section"><h4>Actividad reciente</h4><div class="activity-list">'+recentActivity(data,5)+'</div></section><div class="legend"><span><i></i>Equipo confirmado</span><span><i class="dash"></i>Match sugerido</span></div>';
}
async function dashboard(){ const ents=['personas','proyectos','capacidades','necesidades','matches','equipos','pendientes','documentos']; const data=Object.fromEntries(await Promise.all(ents.map(async e=>[e,await api.list(e)]))); const high=(data.matches||[]).filter(x=>Number(x.puntuacion)>=70).length; const incomplete=(data.personas||[]).filter(x=>!x.profesion||!x.email).length; app.innerHTML=`<div class="content"><div class="cards">${card('Personas',data.personas.length)}${card('Proyectos',data.proyectos.length)}${card('Necesidades abiertas',data.necesidades.filter(x=>String(x.estado).toLowerCase()!=='cubierta').length)}${card('Matches',data.matches.length)}${card('Matches ≥70%',high)}${card('Equipos',data.equipos.length)}${card('Perfiles incompletos',incomplete)}${card('Documentos',data.documentos.length)}</div><div class="split" style="margin-top:16px"><div class="card"><h3>Proyectos por etapa</h3>${stageList(data.proyectos)}</div><div class="card"><h3>Prioridad operativa</h3><p class="muted">Las necesidades se cruzan exclusivamente contra capacidades poseídas. Nunca se registran necesidades como capacidades personales.</p><button id="recompute">Recalcular matches</button></div></div></div>`; document.querySelector('#recompute').onclick=async()=>{try{const r=await api.recompute();alert(`${r.created} matches nuevos`);go('matches')}catch(e){alert(e.message)}}; }
function card(k,v){return `<div class="card"><div class="muted">${esc(k)}</div><div class="metric">${esc(v)}</div></div>`}
function stageList(items){ const m={}; for(const p of items)m[p.etapa||'Sin confirmar']=(m[p.etapa||'Sin confirmar']||0)+1; return Object.entries(m).map(([k,v])=>`<p><span class="badge">${esc(k)}</span> <strong>${v}</strong></p>`).join('')||'<p class="muted">Sin información todavía.</p>'; }

async function entityView(entity){ const rows=await api.list(entity); const cols=columns[entity]||Object.keys(rows[0]||{}).slice(0,8); app.innerHTML=`<div class="content"><div class="toolbar"><div><strong>${rows.length}</strong> registros</div><div>${entity==='documentos'?'<button id="upload">Subir documento</button>':''}${formFields[entity]?` <button id="new">Nuevo</button>`:''}</div></div>${table(rows,cols,entity)}</div>`; if(document.querySelector('#new'))document.querySelector('#new').onclick=()=>openForm(entity); if(document.querySelector('#upload'))document.querySelector('#upload').onclick=openUpload; document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openForm(entity,rows.find(r=>r.id===b.dataset.edit))); document.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(confirm(`Dar de baja lógica ${b.dataset.del}?`)){await api.remove(entity,b.dataset.del);go(entity)}}); }
function table(rows,cols,entity){ if(!rows.length)return '<div class="table-wrap"><div class="empty">Sin información todavía.</div></div>'; return `<div class="table-wrap"><table><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}<th>Acciones</th></tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${c==='url'&&r[c]?`<a href="${esc(r[c])}" target="_blank">Abrir</a>`:esc(r[c])}</td>`).join('')}<td><div class="actions">${formFields[entity]?`<button class="secondary" data-edit="${esc(r.id)}">Editar</button>`:''}<button class="danger" data-del="${esc(r.id)}">Baja</button></div></td></tr>`).join('')}</tbody></table></div>`; }

function openForm(entity,row={}){ const modal=document.querySelector('#modal'); document.querySelector('#modalTitle').textContent=`${row.id?'Editar':'Nuevo'} ${labels[entity]}`; document.querySelector('#modalBody').innerHTML=`<div class="grid">${formFields[entity].map(f=>field(f,row[f]??'')).join('')}</div>`; const form=document.querySelector('#modalForm'); form.onsubmit=async e=>{e.preventDefault(); if(e.submitter?.value==='cancel'){modal.close();return} const fd=new FormData(form); const data={}; for(const f of formFields[entity]) data[f]=fd.get(f)||''; try{ row.id?await api.update(entity,row.id,data):await api.create(entity,data); modal.close(); go(entity); }catch(err){alert(err.message)} }; modal.showModal(); }
function field(name,value){ const long=/descripcion|experiencia|evidencia|observaciones|preguntas|detalle|notas|proximos|necesidades|validaciones|integrantes|roles|capacidades_/i.test(name); return `<div class="field"><label>${esc(name)}</label>${long?`<textarea name="${esc(name)}">${esc(value)}</textarea>`:`<input name="${esc(name)}" value="${esc(value)}">`}</div>`; }
function openUpload(){ const modal=document.querySelector('#modal'); document.querySelector('#modalTitle').textContent='Subir documento a Google Drive'; document.querySelector('#modalBody').innerHTML='<div class="grid"><div class="field"><label>Archivo</label><input name="file" type="file" required></div><div class="field"><label>Persona ID</label><input name="persona_id"></div><div class="field"><label>Proyecto ID</label><input name="proyecto_id"></div><div class="field"><label>Origen</label><input name="origen" value="carga manual"></div></div>'; const form=document.querySelector('#modalForm'); form.onsubmit=async e=>{e.preventDefault();if(e.submitter?.value==='cancel'){modal.close();return}try{await api.uploadDocument(new FormData(form));modal.close();go('documentos')}catch(err){alert(err.message)}}; modal.showModal(); }

async function searchGlobal(){ const q=document.querySelector('#globalSearch').value.trim(); if(current==='mapa'){mapQuery=q;renderLiveMap();return} if(!q)return; title.textContent='Búsqueda'; subtitle.textContent='Resultados para “'+q+'”'; app.innerHTML='<div class="content"><div class="empty">Buscando…</div></div>'; try{const d=await api.search(q); app.innerHTML='<div class="content">'+(d.results.length?d.results.map(x=>'<div class="card" style="margin-bottom:10px"><span class="badge">'+esc(x.entity)+'</span><h3>'+esc(x.label)+'</h3><small>'+esc(x.id)+'</small></div>').join(''):'<div class="empty">Sin resultados.</div>')+'</div>'}catch(e){fail(e)} }
async function settings(){ let h; try{h=await api.health()}catch(e){h={ok:false,error:e.message}} app.innerHTML=`<div class="content"><div class="card"><h3>Estado</h3><pre>${esc(JSON.stringify(h,null,2))}</pre><div class="actions"><button id="bootstrap">Inicializar hojas</button><button class="secondary" id="setToken">Cambiar token de sesión</button></div><p class="muted">Los secretos Google y Cloudflare nunca se guardan en el navegador ni en GitHub. El token de administración solo vive en sessionStorage y desaparece al cerrar la sesión del navegador.</p></div></div>`; document.querySelector('#bootstrap').onclick=async()=>{try{const r=await api.bootstrap();alert(`Hojas verificadas: ${r.sheets.join(', ')}`)}catch(e){alert(e.message)}}; document.querySelector('#setToken').onclick=document.querySelector('#authBtn').onclick; }
const initial=(location.hash||'#mapa').slice(1); go(views.includes(initial)?initial:'mapa');
