import { api } from './api.js';

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

let people = [];
let projects = [];

function getProject(person){
  const own = String(person.tiene_proyecto_propio || '').replace(/^Sí\s*[—-]\s*/i,'').trim();
  if (own && !/^No informado$/i.test(own)) return own;
  const linked = projects.find(p => String(p.creador_id || '') === String(person.id || ''));
  return linked?.nombre || '';
}

function render(){
  const q = ($('#search').value || '').trim().toLowerCase();
  const filtered = people.filter(p => [p.nombre_completo,p.profesion,p.especialidad,getProject(p)].join(' ').toLowerCase().includes(q));
  $('#count').textContent = filtered.length;
  $('#peopleList').innerHTML = filtered.length ? filtered.map(p => {
    const project=getProject(p);
    const area=[p.profesion,p.especialidad].filter(Boolean).join(' · ');
    return '<article class="person-card">'+
      '<div class="person-head"><div><h3>'+esc(p.nombre_completo||p.id)+'</h3>'+
      (area?'<p class="meta">'+esc(area)+'</p>':'')+'</div><span class="id">'+esc(p.id)+'</span></div>'+
      '<div class="project"><span>Proyecto</span><strong>'+esc(project||'Sin proyecto informado')+'</strong></div>'+
      '</article>';
  }).join('') : '<div class="empty">No hay resultados.</div>';
}

async function load(){
  try{
    [people,projects]=await Promise.all([api.list('personas'),api.list('proyectos')]);
    people=people.filter(p=>!p.eliminado);
    projects=projects.filter(p=>!p.eliminado);
    render();
  }catch(e){
    $('#peopleList').innerHTML='<div class="empty error">No se pudo cargar la base: '+esc(e.message)+'</div>';
  }
}

$('#selfForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const status=$('#formStatus');
  status.textContent='Guardando…';
  try{
    await api.selfSave({
      nombre_completo:$('#name').value.trim(),
      email:$('#email').value.trim(),
      profesion:$('#profession').value.trim(),
      especialidad:$('#specialty').value.trim(),
      proyecto:$('#project').value.trim(),
      etapa:$('#stage').value.trim(),
      busca:$('#needs').value.trim(),
      puede_aportar:$('#contribute').value.trim()
    });
    status.textContent='Listo. Tu información quedó guardada.';
    await load();
  }catch(err){
    status.textContent='No se pudo guardar: '+err.message;
  }
});

$('#search').addEventListener('input',render);
load();