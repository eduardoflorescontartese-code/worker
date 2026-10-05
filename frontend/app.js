import { api } from './api.js';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const clamp=n=>Math.max(0,Math.min(100,Number(n)||0));

let dashboard={counts:{},personas:[],proyectos:[],necesidades:[],capacidades:[],matches:[]};
let suggestionTab='personas';
let people=[],projects=[],matches=[];

function hashParams(){
  const p=new URLSearchParams((location.hash||'').replace(/^#/,''));
  return {admin:p.get('admin')||'',edit:p.get('edit')||'',email:p.get('email')||''};
}
function randomToken(){
  const a=new Uint8Array(32);crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function localKey(email){return 'mesa_edit_'+String(email||'').trim().toLowerCase()}
function participantToken(email){
  const hp=hashParams(); if(hp.edit)return hp.edit;
  let t=localStorage.getItem(localKey(email))||'';
  if(!t){t=randomToken();localStorage.setItem(localKey(email),t)}
  return t;
}
function initials(name){
  return String(name||'M').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'M';
}
function emptyMini(text){return '<div class="empty-mini">'+esc(text)+'</div>'}

function bestScoreFor(type,id){
  const values=(dashboard.matches||[])
    .filter(m=>type==='persona'?String(m.persona_id)===String(id):String(m.proyecto_id)===String(id))
    .map(m=>clamp(m.puntuacion));
  return values.length?Math.max(...values):null;
}

function renderSuggestions(){
  $$('.suggestion-tab').forEach(b=>b.classList.toggle('active',b.dataset.suggestionTab===suggestionTab));
  const box=$('#suggestionList');
  if(suggestionTab==='personas'){
    const rows=dashboard.personas||[];
    box.innerHTML=rows.length?rows.map((p,i)=>{
      const score=bestScoreFor('persona',p.id);
      return '<article class="suggestion-row '+(i===0?'selected':'')+'">'+
        '<div class="person-dot">'+esc(initials(p.nombre_completo))+'</div>'+
        '<div><strong>'+esc(p.nombre_completo||'Persona')+'</strong><p>'+esc([p.profesion,p.especialidad].filter(Boolean).join(' · ')||'Perfil incorporado a MESA')+'</p>'+
        '<div class="chips">'+[p.profesion,p.especialidad].filter(Boolean).slice(0,2).map(x=>'<span class="chip">'+esc(x)+'</span>').join('')+'</div></div>'+
        (score===null?'<span class="row-arrow">›</span>':'<span class="suggestion-score">'+score+'%</span>')+
      '</article>';
    }).join(''):emptyMini('Sin personas todavía');
  }else if(suggestionTab==='proyectos'){
    const rows=dashboard.proyectos||[];
    box.innerHTML=rows.length?rows.map((p,i)=>{
      const score=bestScoreFor('proyecto',p.id);
      return '<article class="suggestion-row '+(i===0?'selected':'')+'">'+
        '<div class="project-dot">▣</div>'+
        '<div><strong>'+esc(p.nombre||'Proyecto')+'</strong><p>'+esc([p.sector,p.etapa].filter(Boolean).join(' · ')||'Proyecto incorporado a MESA')+'</p>'+
        '<div class="chips">'+[p.sector,p.etapa].filter(Boolean).slice(0,2).map(x=>'<span class="chip">'+esc(x)+'</span>').join('')+'</div></div>'+
        (score===null?'<span class="row-arrow">›</span>':'<span class="suggestion-score">'+score+'%</span>')+
      '</article>';
    }).join(''):emptyMini('Sin proyectos todavía');
  }else{
    const rows=dashboard.necesidades||[];
    box.innerHTML=rows.length?rows.map((n,i)=>
      '<article class="suggestion-row '+(i===0?'selected':'')+'"><div class="need-dot">⌾</div>'+
      '<div><strong>'+esc(n.categoria||'Necesidad')+'</strong><p>'+esc(n.necesidad||'Necesidad abierta')+'</p>'+
      '<div class="chips">'+[n.prioridad,n.estado].filter(Boolean).map(x=>'<span class="chip">'+esc(x)+'</span>').join('')+'</div></div><span class="row-arrow">›</span></article>'
    ).join(''):emptyMini('Sin necesidades todavía');
  }
}

function matchLevel(score){
  if(score>=75)return {label:'Alto encaje',color:'var(--green)'};
  if(score>=50)return {label:'Encaje medio',color:'var(--yellow)'};
  return {label:'Bajo encaje',color:'var(--red)'};
}
function filteredMatches(){
  let rows=[...(dashboard.matches||[])];
  const filter=$('#matchFilter')?.value||'all';
  if(filter==='alto')rows=rows.filter(m=>clamp(m.puntuacion)>=75);
  if(filter==='medio')rows=rows.filter(m=>clamp(m.puntuacion)>=50&&clamp(m.puntuacion)<75);
  if(filter==='bajo')rows=rows.filter(m=>clamp(m.puntuacion)<50);
  if(($('#matchSort')?.value||'score')==='score')rows.sort((a,b)=>clamp(b.puntuacion)-clamp(a.puntuacion));
  else rows.sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')));
  return rows;
}
function renderMatches(){
  const rows=filteredMatches();
  const box=$('#matchesList');
  if(!rows.length){
    box.innerHTML='<div class="empty-state"><div><div class="empty-icon">⌘</div><h3>Los matches empiezan con la comunidad</h3><p>A medida que personas y proyectos carguen sus capacidades y necesidades, MESA va a detectar conexiones reales.</p><button class="primary-btn open-intake">Subir mi proyecto</button></div></div>';
    bindIntakeButtons();
    return;
  }
  box.innerHTML=rows.map(m=>{
    const score=clamp(m.puntuacion);
    const level=matchLevel(score);
    const person=m.persona||null,project=m.proyecto||null;
    const personName=person?.nombre_completo||'Persona';
    const projectName=project?.nombre||'Proyecto';
    const personMeta=[person?.profesion,person?.especialidad].filter(Boolean).join(' · ');
    const projectMeta=[project?.sector,project?.etapa].filter(Boolean).join(' · ');
    return '<article class="match-card">'+
      '<div class="match-pair">'+
        '<div class="match-entity"><div class="entity-icon">'+esc(initials(personName))+'</div><div><span>PERSONA</span><strong>'+esc(personName)+'</strong><small>'+esc(personMeta||'Perfil MESA')+'</small></div></div>'+
        '<div class="pair-arrow">↔</div>'+
        '<div class="match-entity project"><div class="entity-icon">▣</div><div><span>PROYECTO</span><strong>'+esc(projectName)+'</strong><small>'+esc(projectMeta||'Proyecto MESA')+'</small></div></div>'+
      '</div>'+
      '<div class="match-body">'+
        '<div class="score-zone"><div class="score-ring" style="--score:'+score+';background:conic-gradient('+level.color+' '+score+'%,#eaf0f5 0)"><div><strong>'+score+'</strong><span>ENC AJE</span></div></div><span class="score-label">'+esc(level.label)+'</span></div>'+
        '<div class="match-detail">'+
          '<div class="progress-line"><span>Encaje calculado</span><div class="bar"><i style="width:'+score+'%"></i></div><b>'+score+'%</b></div>'+
          '<div class="progress-line"><span>Estado</span><div class="bar"><i style="width:'+(m.estado==='equipo formado'?100:Math.max(20,score))+'%"></i></div><b>'+esc(m.semaforo||'—')+'</b></div>'+
        '</div>'+
      '</div>'+
      '<div class="match-explanation"><span>'+esc(m.explicacion||'MESA detectó complementariedad entre una necesidad y una capacidad disponible.')+'</span><b>'+esc(m.estado||'sugerido')+'</b></div>'+
    '</article>';
  }).join('');
}

const recDefs=[
  {key:'connect',label:'Conectar ahora',color:'green',icon:'◉',min:75,max:101,action:'Ver conexiones',note:'Encaje alto según las señales disponibles.'},
  {key:'meeting',label:'Invitar a reunión',color:'blue',icon:'▣',min:60,max:75,action:'Ver candidatos',note:'Buen potencial; conviene validar objetivos en conversación.'},
  {key:'data',label:'Pedir más datos',color:'orange',icon:'?',min:45,max:60,action:'Revisar información',note:'Hay complementariedad, pero faltan señales para priorizar.'},
  {key:'follow',label:'Seguimiento',color:'purple',icon:'⌕',min:30,max:45,action:'Mantener visible',note:'Puede ganar relevancia a medida que aparezca nueva información.'},
  {key:'low',label:'No prioritario',color:'red',icon:'×',min:0,max:30,action:'Revisar después',note:'Encaje bajo con la información actualmente disponible.'}
];
function renderRecommendations(){
  const all=dashboard.matches||[];
  $('#recommendationList').innerHTML=recDefs.map(d=>{
    const group=all.filter(m=>{const s=clamp(m.puntuacion);return s>=d.min&&s<d.max}).sort((a,b)=>clamp(b.puntuacion)-clamp(a.puntuacion));
    const best=group[0];
    const score=best?clamp(best.puntuacion):null;
    const title=best?[best.persona?.nombre_completo,best.proyecto?.nombre].filter(Boolean).join(' ↔ '):'Sin coincidencias en este nivel';
    return '<section class="recommendation-card '+d.color+'"><div class="rec-head"><div class="rec-icon">'+d.icon+'</div><div><strong>'+d.label+'</strong><small>'+esc(title)+'</small></div><span class="rec-score">'+(score===null?'—':score+'%')+'</span></div>'+
      '<button class="rec-action" '+(group.length?'':'disabled')+'>'+d.action+(group.length?' · '+group.length:'')+'</button><div class="rec-note">'+d.note+'</div></section>';
  }).join('');
}

function renderCounts(){
  const c=dashboard.counts||{};
  $('#peopleCount').textContent=c.personas||0;
  $('#projectCount').textContent=c.proyectos||0;
  $('#needsCount').textContent=c.necesidades||0;
  $('#sideMatches').textContent=c.matches||0;
  const all=dashboard.matches||[];
  $('#sideFollow').textContent=all.filter(m=>['contactado','conversando','seguimiento'].includes(String(m.estado||'').toLowerCase())).length;
  $('#sideTeams').textContent=all.filter(m=>String(m.estado||'').toLowerCase()==='equipo formado').length;
}
function renderDashboard(){
  renderCounts();renderSuggestions();renderMatches();renderRecommendations();
}
async function loadDashboard(){
  try{dashboard=await api.dashboard();renderDashboard()}
  catch(err){$('#matchesList').innerHTML='<div class="empty-state"><div><h3>No se pudo cargar MESA</h3><p>'+esc(err.message)+'</p></div></div>'}
}

function openModal(){
  $('#intakeModal').hidden=false;document.body.style.overflow='hidden';
  const hp=hashParams();if(hp.email){$('#email').value=hp.email;$('#email').readOnly=true}
  setTimeout(()=>$('#name')?.focus(),50);
}
function closeModal(){$('#intakeModal').hidden=true;document.body.style.overflow=''}
function bindIntakeButtons(){$$('.open-intake').forEach(b=>{b.onclick=openModal})}
bindIntakeButtons();
$$('[data-close-modal]').forEach(x=>x.addEventListener('click',closeModal));
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!$('#intakeModal').hidden)closeModal();
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#globalSearch')?.focus()}
});

$$('.suggestion-tab').forEach(b=>b.addEventListener('click',()=>{suggestionTab=b.dataset.suggestionTab;renderSuggestions()}));
$('#matchSort').addEventListener('change',renderMatches);
$('#matchFilter').addEventListener('change',renderMatches);
$('#refreshDashboard').addEventListener('click',loadDashboard);
$$('.nav-item').forEach(b=>b.addEventListener('click',()=>{$$('.nav-item').forEach(x=>x.classList.remove('active'));b.classList.add('active')}));

$('#selfForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const status=$('#formStatus'),email=$('#email').value.trim();
  status.textContent='Guardando…';
  try{
    const token=participantToken(email);
    await api.selfSave({
      nombre_completo:$('#name').value.trim(),email,profesion:$('#profession').value.trim(),especialidad:$('#specialty').value.trim(),
      proyecto:$('#project').value.trim(),etapa:$('#stage').value.trim(),sector:$('#sector').value.trim(),
      descripcion_proyecto:$('#projectDescription').value.trim(),busca:$('#needs').value.trim(),puede_aportar:$('#contribute').value.trim(),edit_token:token
    });
    localStorage.setItem(localKey(email),token);
    status.textContent='Listo. Tu información quedó guardada en MESA.';
    await loadDashboard();setTimeout(closeModal,900);
  }catch(err){status.textContent='No se pudo guardar: '+err.message}
});

let searchTimer;
$('#globalSearch').addEventListener('input',e=>{
  clearTimeout(searchTimer);const q=e.target.value.trim(),box=$('#searchResults');
  if(!q){box.hidden=true;box.innerHTML='';return}
  searchTimer=setTimeout(async()=>{
    try{
      const r=await api.search(q);box.hidden=false;
      box.innerHTML=r.results?.length?r.results.map(x=>'<div class="search-result"><strong>'+esc(x.label||x.id)+'</strong><span>'+esc(x.entity)+'</span></div>').join(''):'<div class="empty-mini">Sin resultados</div>';
    }catch(err){box.hidden=false;box.innerHTML='<div class="empty-mini">'+esc(err.message)+'</div>'}
  },220);
});

function personCard(p){return '<div class="admin-row"><div><strong>'+esc(p.nombre_completo||p.id)+'</strong><small>'+esc([p.profesion,p.especialidad,p.email].filter(Boolean).join(' · '))+'</small></div><div class="row-actions"><button data-edit-person="'+esc(p.id)+'">Editar</button><button data-delete-person="'+esc(p.id)+'">Eliminar</button></div></div>'}
function projectCard(p){return '<div class="admin-row"><div><strong>'+esc(p.nombre||p.id)+'</strong><small>'+esc([p.sector,p.etapa].filter(Boolean).join(' · '))+'</small></div><div class="row-actions"><button data-edit-project="'+esc(p.id)+'">Editar</button><button data-delete-project="'+esc(p.id)+'">Eliminar</button></div></div>'}
function matchCard(m){const s=['verde','amarillo','rojo'].includes(String(m.semaforo).toLowerCase())?String(m.semaforo).toLowerCase():'amarillo';return '<div class="admin-row"><div><strong><span class="traffic '+s+'"></span>'+esc((m.puntuacion||0)+' / 100')+'</strong><small>'+esc(m.explicacion||'Match sugerido')+'</small></div></div>'}
function renderAdmin(){
  const q=($('#adminSearch')?.value||'').toLowerCase();
  $('#adminPeopleList').innerHTML=people.filter(p=>!q||Object.values(p).join(' ').toLowerCase().includes(q)).map(personCard).join('')||emptyMini('Sin personas');
  $('#adminProjectsList').innerHTML=projects.map(projectCard).join('')||emptyMini('Sin proyectos');
  $('#adminMatchesList').innerHTML=matches.map(matchCard).join('')||emptyMini('Sin matches');
}
async function loadAdmin(){try{[people,projects,matches]=await Promise.all([api.list('personas'),api.list('proyectos'),api.list('matches')]);renderAdmin()}catch(err){$('#adminPeopleList').innerHTML=emptyMini(err.message)}}
function setAdminMode(token){api.setToken(token);$('#participantArea').hidden=true;$('#adminArea').hidden=false;loadAdmin()}
$('#adminSearch').addEventListener('input',renderAdmin);
$('#refreshAdmin').addEventListener('click',loadAdmin);
$('#recomputeMatches').addEventListener('click',async()=>{const b=$('#recomputeMatches');b.disabled=true;try{await api.recompute();await loadAdmin()}finally{b.disabled=false}});
$('#adminPeopleList').addEventListener('click',async e=>{
  const edit=e.target.closest('[data-edit-person]'),del=e.target.closest('[data-delete-person]');
  if(edit){const p=people.find(x=>x.id===edit.dataset.editPerson);if(p){$('#adminPersonId').value=p.id;$('#adminName').value=p.nombre_completo||'';$('#adminEmail').value=p.email||'';$('#adminProfession').value=p.profesion||'';$('#adminSpecialty').value=p.especialidad||'';$('#adminContribute').value=p.puede_aportar||'';$('#adminNeeds').value=p.busca||''}}
  if(del&&confirm('¿Eliminar esta persona?')){await api.remove('personas',del.dataset.deletePerson);await loadAdmin()}
});
$('#adminProjectsList').addEventListener('click',async e=>{
  const edit=e.target.closest('[data-edit-project]'),del=e.target.closest('[data-delete-project]');
  if(edit){const p=projects.find(x=>x.id===edit.dataset.editProject);if(p){$('#adminProjectId').value=p.id;$('#adminProjectName').value=p.nombre||'';$('#adminProjectSector').value=p.sector||'';$('#adminProjectStage').value=p.etapa||'';$('#adminProjectDescription').value=p.descripcion||''}}
  if(del&&confirm('¿Eliminar este proyecto?')){await api.remove('proyectos',del.dataset.deleteProject);await loadAdmin()}
});
$('#adminPersonForm').addEventListener('submit',async e=>{
  e.preventDefault();const id=$('#adminPersonId').value;if(!id)return;
  await api.update('personas',id,{nombre_completo:$('#adminName').value.trim(),email:$('#adminEmail').value.trim(),profesion:$('#adminProfession').value.trim(),especialidad:$('#adminSpecialty').value.trim(),puede_aportar:$('#adminContribute').value.trim(),busca:$('#adminNeeds').value.trim(),origen_informacion:'administración'});await loadAdmin();
});
$('#adminProjectForm').addEventListener('submit',async e=>{
  e.preventDefault();const id=$('#adminProjectId').value;if(!id)return;
  await api.update('proyectos',id,{nombre:$('#adminProjectName').value.trim(),sector:$('#adminProjectSector').value.trim(),etapa:$('#adminProjectStage').value.trim(),descripcion:$('#adminProjectDescription').value.trim(),origen_informacion:'administración'});await loadAdmin();
});

const hp=hashParams();
if(hp.admin)setAdminMode(hp.admin);else loadDashboard();
