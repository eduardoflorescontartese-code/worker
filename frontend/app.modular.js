import { api } from './api.js';
import { createNavigation } from './modules/navigation.js';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

let dashboard={counts:{},personas:[],proyectos:[],necesidades:[],capacidades:[],equipos:[],matches:[]};
let people=[],projects=[],matches=[];
let lastSearchResults=[];
let navigation;

function hashParams(){
  const p=new URLSearchParams((location.hash||'').replace(/^#/,''));
  return {admin:p.get('admin')||'',edit:p.get('edit')||'',email:p.get('email')||''};
}
function randomToken(){const a=new Uint8Array(32);crypto.getRandomValues(a);return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function localKey(email){return 'mesa_edit_'+String(email||'').trim().toLowerCase()}
function participantToken(email){
  const hp=hashParams();
  if(hp.edit) return hp.edit;
  let t=localStorage.getItem(localKey(email))||'';
  if(!t){t=randomToken();localStorage.setItem(localKey(email),t)}
  return t;
}
function emptyMini(text){return '<div class="empty-mini">'+esc(text)+'</div>'}

function bindIntakeButtons(){$$('.open-intake').forEach(b=>{b.onclick=openModal})}
function openModal(){
  $('#intakeModal').hidden=false;
  document.body.style.overflow='hidden';
  const hp=hashParams();
  if(hp.email){$('#email').value=hp.email;$('#email').readOnly=true}
  setTimeout(()=>$('#name')?.focus(),50);
}
function closeModal(){$('#intakeModal').hidden=true;document.body.style.overflow=''}

function renderDashboard(){
  navigation.setPanelHeader('PANEL DE MATCHING','Conexiones con potencial real','La MESA cruza capacidades y necesidades para detectar colaboraciones útiles.');
  const c=dashboard.counts||{};
  $('#peopleCount').textContent=c.personas||0;
  $('#projectCount').textContent=c.proyectos||0;
  $('#needsCount').textContent=c.necesidades||0;
  $('#impactPeople').textContent=c.personas||0;
  $('#impactProjects').textContent=c.proyectos||0;
  $('#impactMatches').textContent=c.matches||0;

  $('#peopleSuggestions').innerHTML=dashboard.personas?.length
    ? dashboard.personas.map(p=>'<div class="suggestion-item"><strong>'+esc(p.nombre_completo||'Persona')+'</strong><span>'+esc([p.profesion,p.especialidad].filter(Boolean).join(' · ')||'Perfil en MESA')+'</span></div>').join('')
    : emptyMini('Sin personas todavía');

  $('#projectSuggestions').innerHTML=dashboard.proyectos?.length
    ? dashboard.proyectos.map(p=>'<div class="suggestion-item"><strong>'+esc(p.nombre||'Proyecto')+'</strong><span>'+esc([p.sector,p.etapa].filter(Boolean).join(' · ')||'Proyecto en MESA')+'</span></div>').join('')
    : emptyMini('Sin proyectos todavía');

  $('#needSuggestions').innerHTML=dashboard.necesidades?.length
    ? dashboard.necesidades.map(n=>'<div class="suggestion-item"><strong>'+esc(n.categoria||'Necesidad')+'</strong><span>'+esc(n.necesidad||'')+'</span></div>').join('')
    : emptyMini('Sin necesidades todavía');

  const list=$('#matchesList');
  if(dashboard.matches?.length){
    list.innerHTML=dashboard.matches.map(m=>{
      const title=[m.persona?.nombre_completo,m.proyecto?.nombre].filter(Boolean).join(' ↔ ')||'Conexión sugerida';
      return '<article class="match-card"><div><h3>'+esc(title)+'</h3><p>'+esc(m.explicacion||'MESA detectó una posible complementariedad.')+'</p><div class="match-meta"><span class="tag">'+esc(m.semaforo||'sugerido')+'</span><span class="tag">'+esc(m.estado||'sugerido')+'</span></div></div><div class="score">'+esc(m.puntuacion||0)+'%</div></article>';
    }).join('');
  }else{
    list.innerHTML='<div class="empty-state"><div><div class="empty-icon">◎</div><h3>Los matches empiezan con la comunidad</h3><p>A medida que personas y proyectos carguen sus capacidades y necesidades, MESA va a detectar conexiones reales.</p><button class="primary-btn open-intake">Subir mi proyecto</button></div></div>';
    bindIntakeButtons();
  }

  const f=$('#featuredProject');
  if(dashboard.proyectos?.length){
    const p=dashboard.proyectos[0];
    f.innerHTML='<div class="featured-content"><span class="featured-badge">'+esc(p.etapa||'Proyecto activo')+'</span><h3>'+esc(p.nombre)+'</h3><p>'+esc(p.descripcion||p.sector||'Proyecto incorporado a MESA')+'</p></div>';
  }else{
    f.innerHTML='<div class="featured-content"><span class="featured-badge">Esperando proyectos</span><h3>Tu proyecto puede ser el primero</h3><p>Cargalo gratis y empezá a buscar capacidades que te ayuden a avanzar.</p></div>';
  }
}


async function loadDashboard(){
  try{
    dashboard=await api.dashboard();
    renderDashboard();
    const view=navigation.getActiveView();
    if(view!=='inicio'&&view!=='matching') navigation.renderSection(view);
  }
  catch(err){$('#matchesList').innerHTML='<div class="empty-state"><div><h3>No se pudo cargar MESA</h3><p>'+esc(err.message)+'</p></div></div>'}
}

bindIntakeButtons();
$$('[data-close-modal]').forEach(x=>x.addEventListener('click',closeModal));
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!$('#intakeModal').hidden) closeModal();
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#globalSearch')?.focus()}
});

$('#selfForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const status=$('#formStatus');
  const email=$('#email').value.trim();
  status.textContent='Guardando…';
  try{
    const token=participantToken(email);
    await api.selfSave({
      nombre_completo:$('#name').value.trim(),
      email,
      profesion:$('#profession').value.trim(),
      especialidad:$('#specialty').value.trim(),
      proyecto:$('#project').value.trim(),
      etapa:$('#stage').value.trim(),
      sector:$('#sector').value.trim(),
      descripcion_proyecto:$('#projectDescription').value.trim(),
      busca:$('#needs').value.trim(),
      puede_aportar:$('#contribute').value.trim(),
      edit_token:token
    });
    localStorage.setItem(localKey(email),token);
    status.textContent='Listo. Tu información quedó guardada en MESA.';
    await loadDashboard();
    setTimeout(closeModal,900);
  }catch(err){status.textContent='No se pudo guardar: '+err.message}
});

let searchTimer;
$('#globalSearch').addEventListener('input',e=>{
  clearTimeout(searchTimer);
  const q=e.target.value.trim();
  const box=$('#searchResults');
  if(!q){box.hidden=true;box.innerHTML='';return}
  searchTimer=setTimeout(async()=>{
    try{
      const r=await api.search(q);
      box.hidden=false;
      lastSearchResults=r.results||[];
      box.innerHTML=lastSearchResults.length
        ? lastSearchResults.map((x,i)=>'<button type="button" class="search-result" data-search-index="'+i+'"><strong>'+esc(x.label||x.id)+'</strong><span>'+esc(x.entity)+'</span></button>').join('')
        : '<div class="empty-mini">Sin resultados</div>';
    }catch(err){
      box.hidden=false;
      box.innerHTML='<div class="empty-mini">'+esc(err.message)+'</div>';
    }
  },220);
});

$('#refreshDashboard').addEventListener('click',loadDashboard);
$('.nav-item').forEach(b=>b.addEventListener('click',()=>navigation.renderSection(b.dataset.nav||'inicio')));
$('.filter').forEach(b=>b.addEventListener('click',()=>navigation.renderSection(b.dataset.view||'matching')));
$('#searchResults').addEventListener('click',e=>{
  const b=e.target.closest('[data-search-index]');
  if(b) navigation.renderSearchSelection(lastSearchResults[Number(b.dataset.searchIndex)]);
});
$('#notificationsBtn').addEventListener('click',()=>{
  const n=Number(dashboard.counts?.matches||0);
  alert(n?('MESA tiene '+n+' match'+(n===1?'':'es')+' sugerido'+(n===1?'':'s')+'.'):'No hay notificaciones nuevas todavía.');
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
async function loadAdmin(){
  try{[people,projects,matches]=await Promise.all([api.list('personas'),api.list('proyectos'),api.list('matches')]);renderAdmin()}
  catch(err){$('#adminPeopleList').innerHTML=emptyMini(err.message)}
}
function setAdminMode(token){api.setToken(token);$('#participantArea').hidden=true;$('#adminArea').hidden=false;loadAdmin()}

$('#adminSearch').addEventListener('input',renderAdmin);
$('#refreshAdmin').addEventListener('click',loadAdmin);
$('#recomputeMatches').addEventListener('click',async()=>{
  const b=$('#recomputeMatches');b.disabled=true;
  try{await api.recompute();await loadAdmin()}finally{b.disabled=false}
});

$('#adminPeopleList').addEventListener('click',async e=>{
  const edit=e.target.closest('[data-edit-person]'),del=e.target.closest('[data-delete-person]');
  if(edit){
    const p=people.find(x=>x.id===edit.dataset.editPerson);
    if(p){
      $('#adminPersonId').value=p.id;$('#adminName').value=p.nombre_completo||'';$('#adminEmail').value=p.email||'';
      $('#adminProfession').value=p.profesion||'';$('#adminSpecialty').value=p.especialidad||'';
      $('#adminContribute').value=p.puede_aportar||'';$('#adminNeeds').value=p.busca||'';
    }
  }
  if(del&&confirm('¿Eliminar esta persona?')){await api.remove('personas',del.dataset.deletePerson);await loadAdmin()}
});

$('#adminProjectsList').addEventListener('click',async e=>{
  const edit=e.target.closest('[data-edit-project]'),del=e.target.closest('[data-delete-project]');
  if(edit){
    const p=projects.find(x=>x.id===edit.dataset.editProject);
    if(p){
      $('#adminProjectId').value=p.id;$('#adminProjectName').value=p.nombre||'';$('#adminProjectSector').value=p.sector||'';
      $('#adminProjectStage').value=p.etapa||'';$('#adminProjectDescription').value=p.descripcion||'';
    }
  }
  if(del&&confirm('¿Eliminar este proyecto?')){await api.remove('proyectos',del.dataset.deleteProject);await loadAdmin()}
});

$('#adminPersonForm').addEventListener('submit',async e=>{
  e.preventDefault();const id=$('#adminPersonId').value;if(!id)return;
  await api.update('personas',id,{
    nombre_completo:$('#adminName').value.trim(),email:$('#adminEmail').value.trim(),
    profesion:$('#adminProfession').value.trim(),especialidad:$('#adminSpecialty').value.trim(),
    puede_aportar:$('#adminContribute').value.trim(),busca:$('#adminNeeds').value.trim(),origen_informacion:'administración'
  });
  await loadAdmin();
});

$('#adminProjectForm').addEventListener('submit',async e=>{
  e.preventDefault();const id=$('#adminProjectId').value;if(!id)return;
  await api.update('proyectos',id,{
    nombre:$('#adminProjectName').value.trim(),sector:$('#adminProjectSector').value.trim(),
    etapa:$('#adminProjectStage').value.trim(),descripcion:$('#adminProjectDescription').value.trim(),origen_informacion:'administración'
  });
  await loadAdmin();
});

navigation=createNavigation({
  $, $, esc,
  getDashboard:()=>dashboard,
  renderDashboard,
  bindIntakeButtons
});

const hp=hashParams();
if(hp.admin)setAdminMode(hp.admin);else loadDashboard();
