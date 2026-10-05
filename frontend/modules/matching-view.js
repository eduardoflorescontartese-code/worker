export function createMatchingView({$, esc, getDashboard, bindIntakeButtons}){
  const clamp=n=>Math.max(0,Math.min(100,Number(n)||0));

  function level(score){
    if(score>=70)return {label:'Alto encaje',color:'#07945b'};
    if(score>=35)return {label:'Encaje medio',color:'#f4bc2b'};
    return {label:'Bajo encaje',color:'#e73d48'};
  }

  function rows(){
    let list=[...(getDashboard().matches||[])];
    const filter=$('#matchFilter')?.value||'all';
    if(filter==='alto')list=list.filter(m=>clamp(m.puntuacion)>=70);
    if(filter==='medio')list=list.filter(m=>clamp(m.puntuacion)>=35&&clamp(m.puntuacion)<70);
    if(filter==='bajo')list=list.filter(m=>clamp(m.puntuacion)<35);
    if(($('#matchSort')?.value||'score')==='score'){
      list.sort((a,b)=>clamp(b.puntuacion)-clamp(a.puntuacion));
    }else{
      list.sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')));
    }
    return list;
  }

  function card(m){
    const score=clamp(m.puntuacion);
    const info=level(score);
    const person=m.persona||{};
    const project=m.proyecto||{};
    const personName=person.nombre_completo||'Persona';
    const projectName=project.nombre||'Proyecto';
    const initials=String(personName).split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'M';

    return '<article class="match-card-reference">'+
      '<div class="match-pair">'+
        '<div class="match-entity"><div class="entity-icon">'+esc(initials)+'</div><div><span>PERSONA</span><strong>'+esc(personName)+'</strong><small>'+esc([person.profesion,person.especialidad].filter(Boolean).join(' · ')||'Perfil MESA')+'</small></div></div>'+
        '<div class="pair-arrow">↔</div>'+
        '<div class="match-entity project"><div class="entity-icon">▣</div><div><span>PROYECTO</span><strong>'+esc(projectName)+'</strong><small>'+esc([project.sector,project.etapa].filter(Boolean).join(' · ')||'Proyecto MESA')+'</small></div></div>'+
      '</div>'+
      '<div class="match-body-reference">'+
        '<div class="score-zone"><div class="score-ring" style="--score:'+score+';--score-color:'+info.color+'"><div><strong>'+score+'</strong><span>ENCAJE</span></div></div><span class="score-label">'+esc(info.label)+'</span></div>'+
        '<div class="match-detail">'+
          '<div class="progress-line"><span>Encaje calculado</span><div class="bar"><i style="width:'+score+'%"></i></div><b>'+score+'%</b></div>'+
          '<div class="progress-line"><span>Estado</span><div class="bar"><i style="width:'+Math.max(20,score)+'%"></i></div><b>'+esc(m.semaforo||'—')+'</b></div>'+
        '</div>'+
      '</div>'+
      '<div class="match-explanation"><span>'+esc(m.explicacion||'MESA detectó complementariedad entre una necesidad y una capacidad disponible.')+'</span><b>'+esc(m.estado||'sugerido')+'</b></div>'+
    '</article>';
  }

  function render(){
    const list=$('#matchesList');
    const data=rows();
    if(!data.length){
      list.innerHTML='<div class="empty-state"><div><div class="empty-icon">⌘</div><h3>Los matches empiezan con la comunidad</h3><p>A medida que personas y proyectos carguen capacidades y necesidades, MESA va a detectar conexiones reales.</p><button class="primary-btn open-intake">Subir mi proyecto</button></div></div>';
      bindIntakeButtons();
      return;
    }
    list.innerHTML=data.map(card).join('');
  }

  function renderOne(match){
    if(!match)return;
    $('#matchesList').innerHTML=card(match);
  }

  function init(){
    $('#matchSort')?.addEventListener('change',render);
    $('#matchFilter')?.addEventListener('change',render);
  }

  return {init,render,renderOne};
}
