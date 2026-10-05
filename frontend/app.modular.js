import { api } from './api.js';
import { createNavigation } from './modules/navigation.js';
import { createIntake } from './modules/intake.js';
import { createAdmin } from './modules/admin.js';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[c]));
const emptyMini=text=>'<div class="empty-mini">'+esc(text)+'</div>';

let dashboard={
  counts:{},
  personas:[],
  proyectos:[],
  necesidades:[],
  capacidades:[],
  equipos:[],
  matches:[]
};
let lastSearchResults=[];
let navigation;
let intake;
let admin;

function hashParams(){
  const p=new URLSearchParams((location.hash||'').replace(/^#/,''));
  return {
    admin:p.get('admin')||'',
    edit:p.get('edit')||'',
    email:p.get('email')||''
  };
}

function renderDashboard(){
  navigation.setPanelHeader(
    'PANEL DE MATCHING',
    'Conexiones con potencial real',
    'La MESA cruza capacidades y necesidades para detectar colaboraciones útiles.'
  );

  const c=dashboard.counts||{};
  $('#peopleCount').textContent=c.personas||0;
  $('#projectCount').textContent=c.proyectos||0;
  $('#needsCount').textContent=c.necesidades||0;
  $('#impactPeople').textContent=c.personas||0;
  $('#impactProjects').textContent=c.proyectos||0;
  $('#impactMatches').textContent=c.matches||0;

  $('#peopleSuggestions').innerHTML=dashboard.personas?.length
    ? dashboard.personas.map(p=>
      '<div class="suggestion-item"><strong>'+esc(p.nombre_completo||'Persona')+
      '</strong><span>'+esc([p.profesion,p.especialidad].filter(Boolean).join(' · ')||'Perfil en MESA')+
      '</span></div>'
    ).join('')
    : emptyMini('Sin personas todavía');

  $('#projectSuggestions').innerHTML=dashboard.proyectos?.length
    ? dashboard.proyectos.map(p=>
      '<div class="suggestion-item"><strong>'+esc(p.nombre||'Proyecto')+
      '</strong><span>'+esc([p.sector,p.etapa].filter(Boolean).join(' · ')||'Proyecto en MESA')+
      '</span></div>'
    ).join('')
    : emptyMini('Sin proyectos todavía');

  $('#needSuggestions').innerHTML=dashboard.necesidades?.length
    ? dashboard.necesidades.map(n=>
      '<div class="suggestion-item"><strong>'+esc(n.categoria||'Necesidad')+
      '</strong><span>'+esc(n.necesidad||'')+'</span></div>'
    ).join('')
    : emptyMini('Sin necesidades todavía');

  const list=$('#matchesList');
  if(dashboard.matches?.length){
    list.innerHTML=dashboard.matches.map(m=>{
      const title=[m.persona?.nombre_completo,m.proyecto?.nombre]
        .filter(Boolean).join(' ↔ ')||'Conexión sugerida';
      return '<article class="match-card"><div><h3>'+esc(title)+
        '</h3><p>'+esc(m.explicacion||'MESA detectó una posible complementariedad.')+
        '</p><div class="match-meta"><span class="tag">'+esc(m.semaforo||'sugerido')+
        '</span><span class="tag">'+esc(m.estado||'sugerido')+
        '</span></div></div><div class="score">'+esc(m.puntuacion||0)+'%</div></article>';
    }).join('');
  }else{
    list.innerHTML='<div class="empty-state"><div><div class="empty-icon">◎</div>'+
      '<h3>Los matches empiezan con la comunidad</h3>'+
      '<p>A medida que personas y proyectos carguen sus capacidades y necesidades, MESA va a detectar conexiones reales.</p>'+
      '<button class="primary-btn open-intake">Subir mi proyecto</button></div></div>';
    intake.bindButtons();
  }

  const featured=$('#featuredProject');
  if(dashboard.proyectos?.length){
    const p=dashboard.proyectos[0];
    featured.innerHTML='<div class="featured-content"><span class="featured-badge">'+
      esc(p.etapa||'Proyecto activo')+'</span><h3>'+esc(p.nombre)+
      '</h3><p>'+esc(p.descripcion||p.sector||'Proyecto incorporado a MESA')+'</p></div>';
  }else{
    featured.innerHTML='<div class="featured-content"><span class="featured-badge">Esperando proyectos</span>'+
      '<h3>Tu proyecto puede ser el primero</h3>'+
      '<p>Cargalo gratis y empezá a buscar capacidades que te ayuden a avanzar.</p></div>';
  }
}

async function loadDashboard(){
  try{
    dashboard=await api.dashboard();
    renderDashboard();
    const view=navigation.getActiveView();
    if(view!=='inicio'&&view!=='matching')navigation.renderSection(view);
  }catch(err){
    $('#matchesList').innerHTML='<div class="empty-state"><div><h3>No se pudo cargar MESA</h3><p>'+
      esc(err.message)+'</p></div></div>';
  }
}

function initSearch(){
  let timer;

  document.addEventListener('keydown',e=>{
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){
      e.preventDefault();
      $('#globalSearch')?.focus();
    }
  });

  $('#globalSearch').addEventListener('input',e=>{
    clearTimeout(timer);
    const q=e.target.value.trim();
    const box=$('#searchResults');

    if(!q){
      box.hidden=true;
      box.innerHTML='';
      return;
    }

    timer=setTimeout(async()=>{
      try{
        const result=await api.search(q);
        lastSearchResults=result.results||[];
        box.hidden=false;
        box.innerHTML=lastSearchResults.length
          ? lastSearchResults.map((x,i)=>
            '<button type="button" class="search-result" data-search-index="'+i+'">'+
            '<strong>'+esc(x.label||x.id)+'</strong><span>'+esc(x.entity)+'</span></button>'
          ).join('')
          : emptyMini('Sin resultados');
      }catch(err){
        box.hidden=false;
        box.innerHTML=emptyMini(err.message);
      }
    },220);
  });

  $('#searchResults').addEventListener('click',e=>{
    const button=e.target.closest('[data-search-index]');
    if(button){
      navigation.renderSearchSelection(
        lastSearchResults[Number(button.dataset.searchIndex)]
      );
    }
  });
}

function initPublicControls(){
  $('#refreshDashboard').addEventListener('click',loadDashboard);

  $$('.nav-item').forEach(button=>
    button.addEventListener('click',()=>
      navigation.renderSection(button.dataset.nav||'inicio')
    )
  );

  $$('.filter').forEach(button=>
    button.addEventListener('click',()=>
      navigation.renderSection(button.dataset.view||'matching')
    )
  );

  $('#notificationsBtn').addEventListener('click',()=>{
    const n=Number(dashboard.counts?.matches||0);
    alert(
      n
        ? 'MESA tiene '+n+' match'+(n===1?'':'es')+' sugerido'+(n===1?'':'s')+'.'
        : 'No hay notificaciones nuevas todavía.'
    );
  });
}

intake=createIntake({$, $$, api, hashParams, loadDashboard});
navigation=createNavigation({
  $, $$, esc,
  getDashboard:()=>dashboard,
  renderDashboard,
  bindIntakeButtons:intake.bindButtons
});
admin=createAdmin({$, api, esc, emptyMini});

intake.init();
admin.init();
initSearch();
initPublicControls();

const hp=hashParams();
if(hp.admin)admin.activate(hp.admin);
else loadDashboard();
