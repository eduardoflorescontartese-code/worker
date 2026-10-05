import { api } from './api.js';

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

let people = [];
let projects = [];

function getProject(person){
  const own = String(person.tiene_proyecto_propio || '').replace(/^Sí\s*[—-]\s*/i,'').trim();
  if (own) return own;
  const linked = projects.find(p => String(p.creador_id || '') === String(person.id || ''));
  return linked?.nombre || '';
}

function render(){
  const q = ($('#search').value || '').trim().toLowerCase();
  const filtered = people.filter(p => {
    const text = [
      p.nombre_completo,
      p.email,
      p.profesion,
      p.especialidad,
      p.puede_aportar,
      p.busca,
      getProject(p)
    ].join(' ').toLowerCase();
    return !q || text.includes(q);
  });

  $('#count').textContent = filtered.length;

  $('#peopleList').innerHTML = filtered.length ? filtered.map(p => {
    const project = getProject(p);
    const extra = [p.profesion,p.especialidad].filter(Boolean).join(' · ');
    const details = [
      p.puede_aportar ? '<p><b>Puede aportar:</b> '+esc(p.puede_aportar)+'</p>' : '',
      p.busca ? '<p><b>Busca:</b> '+esc(p.busca)+'</p>' : '',
      p.observaciones ? '<p><b>Nota:</b> '+esc(p.observaciones)+'</p>' : ''
    ].join('');

    return '<article class="person-card">'+
      '<div class="person-head">'+
        '<div><h3>'+esc(p.nombre_completo || p.nombre || p.id)+'</h3>'+
        '<p class="mail">'+esc(p.email || 'Correo pendiente')+'</p></div>'+
        '<span class="id">'+esc(p.id)+'</span>'+
      '</div>'+
      (extra ? '<p class="meta">'+esc(extra)+'</p>' : '')+
      '<div class="project"><span>Proyecto</span><strong>'+esc(project || 'Todavía no informado')+'</strong></div>'+
      (details ? '<details><summary>Ver información disponible</summary>'+details+'</details>' : '')+
    '</article>';
  }).join('') : '<div class="empty">No hay resultados.</div>';
}

async function load(){
  try{
    [people, projects] = await Promise.all([
      api.list('personas'),
      api.list('proyectos')
    ]);
    people = people.filter(p => !p.eliminado);
    projects = projects.filter(p => !p.eliminado);
    render();
  }catch(e){
    $('#peopleList').innerHTML = '<div class="empty error">No se pudo cargar la base: '+esc(e.message)+'</div>';
  }
}

async function createPerson(data){
  try{
    return await api.create('personas', data);
  }catch(e){
    if(!/No autorizado|401/i.test(e.message)) throw e;
    const token = prompt('Token de administración de MESA');
    if(!token) throw e;
    api.setToken(token);
    return api.create('personas', data);
  }
}

$('#personForm').addEventListener('submit', async e => {
  e.preventDefault();

  const nombre = $('#name').value.trim();
  const email = $('#email').value.trim();
  const proyecto = $('#project').value.trim();
  const status = $('#formStatus');

  status.textContent = 'Guardando…';

  try{
    const person = await createPerson({
      nombre_completo: nombre,
      email,
      tiene_proyecto_propio: proyecto ? 'Sí — '+proyecto : '',
      estado: 'Activo',
      origen_informacion: 'carga manual'
    });

    if(proyecto){
      await api.create('proyectos',{
        nombre: proyecto,
        creador_id: person.id,
        responsables: person.id,
        etapa: 'Por determinar',
        estado: 'Activo',
        origen_informacion: 'carga manual'
      });
    }

    e.target.reset();
    status.textContent = 'Guardado.';
    await load();
  }catch(err){
    status.textContent = 'No se pudo guardar: '+err.message;
  }
});

$('#search').addEventListener('input', render);
load();