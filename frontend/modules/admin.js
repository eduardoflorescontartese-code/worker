export function createAdmin({$, api, esc, emptyMini}){
  let people=[];
  let projects=[];
  let matches=[];

  const personCard=p=>
    '<div class="admin-row"><div><strong>'+esc(p.nombre_completo||p.id)+'</strong><small>'+
    esc([p.profesion,p.especialidad,p.email].filter(Boolean).join(' · '))+
    '</small></div><div class="row-actions"><button data-edit-person="'+esc(p.id)+'">Editar</button><button data-delete-person="'+esc(p.id)+'">Eliminar</button></div></div>';

  const projectCard=p=>
    '<div class="admin-row"><div><strong>'+esc(p.nombre||p.id)+'</strong><small>'+
    esc([p.sector,p.etapa].filter(Boolean).join(' · '))+
    '</small></div><div class="row-actions"><button data-edit-project="'+esc(p.id)+'">Editar</button><button data-delete-project="'+esc(p.id)+'">Eliminar</button></div></div>';

  const matchCard=m=>{
    const s=['verde','amarillo','rojo'].includes(String(m.semaforo).toLowerCase())
      ? String(m.semaforo).toLowerCase()
      : 'amarillo';
    return '<div class="admin-row"><div><strong><span class="traffic '+s+'"></span>'+
      esc((m.puntuacion||0)+' / 100')+
      '</strong><small>'+esc(m.explicacion||'Match sugerido')+'</small></div></div>';
  };

  function render(){
    const q=($('#adminSearch')?.value||'').toLowerCase();
    $('#adminPeopleList').innerHTML=
      people
        .filter(p=>!q||Object.values(p).join(' ').toLowerCase().includes(q))
        .map(personCard).join('')||emptyMini('Sin personas');
    $('#adminProjectsList').innerHTML=projects.map(projectCard).join('')||emptyMini('Sin proyectos');
    $('#adminMatchesList').innerHTML=matches.map(matchCard).join('')||emptyMini('Sin matches');
  }

  async function load(){
    try{
      [people,projects,matches]=await Promise.all([
        api.list('personas'),
        api.list('proyectos'),
        api.list('matches')
      ]);
      render();
    }catch(err){
      $('#adminPeopleList').innerHTML=emptyMini(err.message);
    }
  }

  function activate(token){
    api.setToken(token);
    $('#participantArea').hidden=true;
    $('#adminArea').hidden=false;
    load();
  }

  function init(){
    $('#adminSearch').addEventListener('input',render);
    $('#refreshAdmin').addEventListener('click',load);

    $('#recomputeMatches').addEventListener('click',async()=>{
      const b=$('#recomputeMatches');
      b.disabled=true;
      try{
        await api.recompute();
        await load();
      }finally{
        b.disabled=false;
      }
    });

    $('#adminPeopleList').addEventListener('click',async e=>{
      const edit=e.target.closest('[data-edit-person]');
      const del=e.target.closest('[data-delete-person]');

      if(edit){
        const p=people.find(x=>x.id===edit.dataset.editPerson);
        if(p){
          $('#adminPersonId').value=p.id;
          $('#adminName').value=p.nombre_completo||'';
          $('#adminEmail').value=p.email||'';
          $('#adminProfession').value=p.profesion||'';
          $('#adminSpecialty').value=p.especialidad||'';
          $('#adminContribute').value=p.puede_aportar||'';
          $('#adminNeeds').value=p.busca||'';
        }
      }

      if(del&&confirm('¿Eliminar esta persona?')){
        await api.remove('personas',del.dataset.deletePerson);
        await load();
      }
    });

    $('#adminProjectsList').addEventListener('click',async e=>{
      const edit=e.target.closest('[data-edit-project]');
      const del=e.target.closest('[data-delete-project]');

      if(edit){
        const p=projects.find(x=>x.id===edit.dataset.editProject);
        if(p){
          $('#adminProjectId').value=p.id;
          $('#adminProjectName').value=p.nombre||'';
          $('#adminProjectSector').value=p.sector||'';
          $('#adminProjectStage').value=p.etapa||'';
          $('#adminProjectDescription').value=p.descripcion||'';
        }
      }

      if(del&&confirm('¿Eliminar este proyecto?')){
        await api.remove('proyectos',del.dataset.deleteProject);
        await load();
      }
    });

    $('#adminPersonForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const id=$('#adminPersonId').value;
      if(!id)return;

      await api.update('personas',id,{
        nombre_completo:$('#adminName').value.trim(),
        email:$('#adminEmail').value.trim(),
        profesion:$('#adminProfession').value.trim(),
        especialidad:$('#adminSpecialty').value.trim(),
        puede_aportar:$('#adminContribute').value.trim(),
        busca:$('#adminNeeds').value.trim(),
        origen_informacion:'administración'
      });
      await load();
    });

    $('#adminProjectForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const id=$('#adminProjectId').value;
      if(!id)return;

      await api.update('proyectos',id,{
        nombre:$('#adminProjectName').value.trim(),
        sector:$('#adminProjectSector').value.trim(),
        etapa:$('#adminProjectStage').value.trim(),
        descripcion:$('#adminProjectDescription').value.trim(),
        origen_informacion:'administración'
      });
      await load();
    });
  }

  return {init,activate,load};
}
