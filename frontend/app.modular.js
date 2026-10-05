import { api } from './api.js';
import { createNavigation } from './modules/navigation.js';
import { createIntake } from './modules/intake.js';
import { createAdmin } from './modules/admin.js';
import { createSuggestions } from './modules/suggestions.js';
import { createMatchingView } from './modules/matching-view.js';
import { createRecommendations } from './modules/recommendations.js';

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
let suggestions;
let matchingView;
let recommendations;

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
  suggestions.render();
  matchingView.render();
  recommendations.render();
}

async function loadDashboard(){
  try{
    dashboard=await api.dashboard();
    renderDashboard();
    const view=navigation.getActiveView();
    if(view!=='inicio'&&view!=='matching')navigation.renderSection(view);
  }catch(err){
    $('#matchesList').innerHTML=
      '<div class="empty-state"><div><h3>No se pudo cargar MESA</h3><p>'+
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
      navigation.renderSection(button.dataset.nav||'matching')
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

matchingView=createMatchingView({
  $, esc,
  getDashboard:()=>dashboard,
  bindIntakeButtons:intake.bindButtons
});

navigation=createNavigation({
  $, $$, esc,
  getDashboard:()=>dashboard,
  renderDashboard,
  bindIntakeButtons:intake.bindButtons
});

suggestions=createSuggestions({
  $, $$, esc,
  getDashboard:()=>dashboard
});

recommendations=createRecommendations({
  $, esc,
  getDashboard:()=>dashboard,
  onSelectMatch:match=>{
    navigation.setPanelHeader(
      'MATCH RECOMENDADO',
      'Conexión seleccionada',
      'Detalle del match priorizado por MESA.'
    );
    matchingView.renderOne(match);
  }
});

admin=createAdmin({$, api, esc, emptyMini});

intake.init();
admin.init();
suggestions.init();
matchingView.init();
recommendations.init();
initSearch();
initPublicControls();

const hp=hashParams();
if(hp.admin)admin.activate(hp.admin);
else loadDashboard();
