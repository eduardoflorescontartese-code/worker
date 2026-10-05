import { api } from './api.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

let people = [];
let projects = [];
let matches = [];

function hashParams(){
  const raw=(location.hash||'').replace(/^#/,'');
  const p=new URLSearchParams(raw);
  return {admin:p.get('admin')||'',edit:p.get('edit')||'',email:p.get('email')||''};
}

function randomToken(){
  const a=new Uint8Array(32);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function localKey(email){ return 'mesa_edit_'+String(email||'').trim().toLowerCase(); }
function participantToken(email){
  const hp=hashParams();
  if(hp.edit) return hp.edit;
  let t=localStorage.getItem(localKey(email))||'';
  if(!t){ t=randomToken(); localStorage.setItem(localKey(email),t); }
  return t;
}

async function loadStats(){
  try{
    const s=await api.stats();
    $('#peopleCount').textContent=String(s.personas ?? 0);
    $('#projectCount').textContent=String(s.proyectos ?? 0);
  }catch{
    $('#peopleCount').textContent='—';
    $('#projectCount').textContent='—';
  }
}

function openIntake(mode='profile'){
  const d=$('#intakeDialog');
  $('#dialogTitle').textContent=mode==='project'?'Subí tu proyecto':'Completá tu ficha';
  if(mode==='project') setTimeout(()=>$('#project')?.focus(),80);
  else setTimeout(()=>$('#name')?.focus(),80);
  if(!d.open) d.showModal();
}
function closeIntake(){ const d=$('#intakeDialog'); if(d.open) d.close(); }

function setParticipantMode(){
  $('#participantArea').hidden=false;
  $('#adminArea').hidden=true;
  const hp=hashParams();
  if(hp.email){ $('#email').value=hp.email; $('#email').readOnly=true; }
  loadStats();
}

function personCard(p){
  return '<div class="admin-row"><div><strong>'+esc(p.nombre_completo||p.id)+'</strong><small>'+
    esc([p.profesion,p.especialidad,p.email].filter(Boolean).join(' · '))+
    '</small></div><div class="row-actions"><button type="button" data-edit-person="'+esc(p.id)+'">Editar</button><button type="button" data-delete-person="'+esc(p.id)+'">Eliminar</button></div></div>';
}
function projectCard(p){
  return '<div class="admin-row"><div><strong>'+esc(p.nombre||p.id)+'</strong><small>'+
    esc([p.sector,p.etapa,p.creador_id].filter(Boolean).join(' · '))+
    '</small></div><div class="row-actions"><button type="button" data-edit-project="'+esc(p.id)+'">Editar</button><button type="button" data-delete-project="'+esc(p.id)+'">Eliminar</button></div></div>';
}
function matchCard(m){
  const light=String(m.semaforo||'').toLowerCase();
  const cls=['verde','amarillo','rojo'].includes(light)?light:'amarillo';
  return '<div class="admin-row"><div><strong><span class="traffic '+cls+'"></span>'+esc((m.puntuacion??0)+' / 100')+'</strong><small>'+esc(m.explicacion||'Match sugerido')+'</small></div><small>'+esc(m.id||'')+'</small></div>';
}
function renderAdmin(){
  const q=($('#adminSearch')?.value||'').trim().toLowerCase();
  const filtered=people.filter(p=>!q || Object.values(p).join(' ').toLowerCase().includes(q));
  $('#adminPeopleList').innerHTML=filtered.length?filtered.map(personCard).join(''):'<div class="admin-row"><small>Sin personas todavía.</small></div>';
  $('#adminProjectsList').innerHTML=projects.length?projects.map(projectCard).join(''):'<div class="admin-row"><small>Sin proyectos todavía.</small></div>';
  const ordered=[...matches].sort((a,b)=>(Number(b.puntuacion)||0)-(Number(a.puntuacion)||0));
  $('#adminMatchesList').innerHTML=ordered.length?ordered.map(matchCard).join(''):'<div class="admin-row"><small>Sin matches calculados todavía.</small></div>';
}
async function loadAdmin(){
  try{
    [people,projects,matches]=await Promise.all([api.list('personas'),api.list('proyectos'),api.list('matches')]);
    people=people.filter(p=>!p.eliminado); projects=projects.filter(p=>!p.eliminado); matches=matches.filter(m=>!m.eliminado);
    renderAdmin();
  }catch(err){
    const html='<div class="admin-row"><small>'+esc(err.message)+'</small></div>';
    $('#adminPeopleList').innerHTML=html; $('#adminProjectsList').innerHTML=html; $('#adminMatchesList').innerHTML=html;
  }
}
function setAdminMode(token){
  api.setToken(token);
  $('#participantArea').hidden=true;
  $('#adminArea').hidden=false;
  loadAdmin();
}

$$('[data-open-intake]').forEach(b=>b.addEventListener('click',()=>openIntake(b.dataset.openIntake)));
$('#openProfile').addEventListener('click',()=>openIntake('profile'));
$('#openProject').addEventListener('click',()=>openIntake('project'));
$('#closeIntake').addEventListener('click',closeIntake);
$('#intakeDialog').addEventListener('click',e=>{ if(e.target===$('#intakeDialog')) closeIntake(); });
$('#openHelp').addEventListener('click',()=>alert('MESA es de acceso abierto. Completá tu ficha o subí tu proyecto para participar.'));

$$('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{
  $$('.nav-item').forEach(x=>x.classList.remove('active')); btn.classList.add('active');
  const target=btn.dataset.section;
  if(target==='matching') $('#matchingPanel').scrollIntoView({behavior:'smooth',block:'center'});
  else if(target==='proyectos') openIntake('project');
  else if(target==='personas') openIntake('profile');
}));

$('#globalSearch').addEventListener('input',e=>{
  const has=e.target.value.trim().length>0;
  e.target.setAttribute('aria-label',has?'Búsqueda local pendiente de datos':'Buscar personas, proyectos o necesidades');
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
    await loadStats();
    setTimeout(closeIntake,900);
  }catch(err){ status.textContent='No se pudo guardar: '+err.message; }
});

$('#adminSearch').addEventListener('input',renderAdmin);
$('#refreshAdmin').addEventListener('click',loadAdmin);
$('#recomputeMatches').addEventListener('click',async()=>{
  const b=$('#recomputeMatches'),old=b.textContent;
  b.disabled=true;b.textContent='Calculando…';
  try{ const r=await api.recompute(); b.textContent='Nuevos: '+(r.created??0); await loadAdmin(); }
  catch(err){ b.textContent='Error: '+err.message; }
  finally{ setTimeout(()=>{b.disabled=false;b.textContent=old;},2200); }
});

$('#adminPeopleList').addEventListener('click',async e=>{
  const edit=e.target.closest('[data-edit-person]'),del=e.target.closest('[data-delete-person]');
  if(edit){
    const p=people.find(x=>x.id===edit.dataset.editPerson); if(!p)return;
    $('#adminPersonId').value=p.id||''; $('#adminName').value=p.nombre_completo||''; $('#adminEmail').value=p.email||'';
    $('#adminProfession').value=p.profesion||''; $('#adminSpecialty').value=p.especialidad||'';
    $('#adminContribute').value=p.puede_aportar||''; $('#adminNeeds').value=p.busca||'';
    $('#adminPersonStatus').textContent='Editando '+(p.nombre_completo||p.id);
  }
  if(del){
    const id=del.dataset.deletePerson,p=people.find(x=>x.id===id);
    if(!confirm('¿Eliminar de MESA a '+(p?.nombre_completo||id)+'?'))return;
    try{await api.remove('personas',id);await loadAdmin();}catch(err){alert(err.message)}
  }
});
$('#adminProjectsList').addEventListener('click',async e=>{
  const edit=e.target.closest('[data-edit-project]'),del=e.target.closest('[data-delete-project]');
  if(edit){
    const p=projects.find(x=>x.id===edit.dataset.editProject); if(!p)return;
    $('#adminProjectId').value=p.id||''; $('#adminProjectName').value=p.nombre||''; $('#adminProjectSector').value=p.sector||'';
    $('#adminProjectStage').value=p.etapa||''; $('#adminProjectDescription').value=p.descripcion||'';
    $('#adminProjectStatus').textContent='Editando '+(p.nombre||p.id);
  }
  if(del){
    const id=del.dataset.deleteProject,p=projects.find(x=>x.id===id);
    if(!confirm('¿Eliminar el proyecto '+(p?.nombre||id)+'?'))return;
    try{await api.remove('proyectos',id);await loadAdmin();}catch(err){alert(err.message)}
  }
});
$('#adminPersonForm').addEventListener('submit',async e=>{
  e.preventDefault(); const id=$('#adminPersonId').value;
  if(!id){$('#adminPersonStatus').textContent='Elegí una persona.';return}
  try{
    await api.update('personas',id,{nombre_completo:$('#adminName').value.trim(),email:$('#adminEmail').value.trim(),profesion:$('#adminProfession').value.trim(),especialidad:$('#adminSpecialty').value.trim(),puede_aportar:$('#adminContribute').value.trim(),busca:$('#adminNeeds').value.trim(),origen_informacion:'administración'});
    $('#adminPersonStatus').textContent='Guardado.';await loadAdmin();
  }catch(err){$('#adminPersonStatus').textContent='Error: '+err.message}
});
$('#adminProjectForm').addEventListener('submit',async e=>{
  e.preventDefault(); const id=$('#adminProjectId').value;
  if(!id){$('#adminProjectStatus').textContent='Elegí un proyecto.';return}
  try{
    await api.update('proyectos',id,{nombre:$('#adminProjectName').value.trim(),sector:$('#adminProjectSector').value.trim(),etapa:$('#adminProjectStage').value.trim(),descripcion:$('#adminProjectDescription').value.trim(),origen_informacion:'administración'});
    $('#adminProjectStatus').textContent='Guardado.';await loadAdmin();
  }catch(err){$('#adminProjectStatus').textContent='Error: '+err.message}
});

const hp=hashParams();
if(hp.admin) setAdminMode(hp.admin); else setParticipantMode();
