export function createSuggestions({$, $$, esc, getDashboard}){
  let active='personas';

  function initials(name){
    return String(name||'M').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'M';
  }

  function bestScore(type,id){
    const matches=getDashboard().matches||[];
    const scores=matches
      .filter(m=>type==='persona'
        ? String(m.persona_id)===String(id)
        : String(m.proyecto_id)===String(id))
      .map(m=>{
        const direct=Number(m.escala_general);
        if(direct>0)return direct;
        const pct=Math.max(0,Math.min(100,Number(m.puntuacion)||0));
        return Number((1+(pct/100)*6).toFixed(1));
      });
    return scores.length?Math.max(...scores):null;
  }

  function setCounts(){
    const c=getDashboard().counts||{};
    $('#peopleCount').textContent=c.personas||0;
    $('#projectCount').textContent=c.proyectos||0;
    $('#needsCount').textContent=c.necesidades||0;
  }


  function emptyRows(label){
    const rows=[];
    for(let i=0;i<5;i++){
      rows.push(
        '<article class="suggestion-row empty-suggestion">'+
          '<div class="person-dot empty-dot">—</div>'+
          '<div><strong>'+(i===0?esc(label):'&nbsp;')+'</strong>'+
          '<p>'+(i===0?'Sin información todavía':'&nbsp;')+'</p>'+
          '<div class="chips"><span class="chip empty-chip">&nbsp;</span><span class="chip empty-chip">&nbsp;</span></div></div>'+
          '<span class="row-arrow">›</span>'+
        '</article>'
      );
    }
    return rows.join('');
  }

  function render(){
    const d=getDashboard();
    setCounts();
    $$('.suggestion-tab').forEach(b=>
      b.classList.toggle('active',b.dataset.suggestionTab===active)
    );

    const box=$('#suggestionList');
    if(active==='personas'){
      const rows=d.personas||[];
      box.innerHTML=rows.length?rows.map((p,i)=>{
        const score=bestScore('persona',p.id);
        return '<article class="suggestion-row '+(i===0?'selected':'')+'">'+
          '<div class="person-dot">'+esc(initials(p.nombre_completo))+'</div>'+
          '<div><strong>'+esc(p.nombre_completo||'Persona')+'</strong>'+
          '<p>'+esc([p.profesion,p.especialidad].filter(Boolean).join(' · ')||'Perfil en MESA')+'</p>'+
          '<div class="chips">'+[p.profesion,p.especialidad].filter(Boolean).slice(0,2).map(x=>'<span class="chip">'+esc(x)+'</span>').join('')+'</div></div>'+
          (score===null?'<span class="row-arrow">›</span>':'<span class="suggestion-score">'+score.toFixed(1)+'</span>')+
        '</article>';
      }).join(''):emptyRows('Personas');
      return;
    }

    if(active==='proyectos'){
      const rows=d.proyectos||[];
      box.innerHTML=rows.length?rows.map((p,i)=>{
        const score=bestScore('proyecto',p.id);
        return '<article class="suggestion-row '+(i===0?'selected':'')+'">'+
          '<div class="project-dot">▣</div>'+
          '<div><strong>'+esc(p.nombre||'Proyecto')+'</strong>'+
          '<p>'+esc([p.sector,p.etapa].filter(Boolean).join(' · ')||'Proyecto en MESA')+'</p>'+
          '<div class="chips">'+[p.sector,p.etapa].filter(Boolean).slice(0,2).map(x=>'<span class="chip">'+esc(x)+'</span>').join('')+'</div></div>'+
          (score===null?'<span class="row-arrow">›</span>':'<span class="suggestion-score">'+score+'%</span>')+
        '</article>';
      }).join(''):emptyRows('Proyectos');
      return;
    }

    const rows=d.necesidades||[];
    box.innerHTML=rows.length?rows.map((n,i)=>
      '<article class="suggestion-row '+(i===0?'selected':'')+'">'+
      '<div class="need-dot">⌾</div><div><strong>'+esc(n.categoria||'Necesidad')+'</strong>'+
      '<p>'+esc(n.necesidad||'Necesidad abierta')+'</p>'+
      '<div class="chips">'+[n.prioridad,n.estado].filter(Boolean).map(x=>'<span class="chip">'+esc(x)+'</span>').join('')+'</div></div>'+
      '<span class="row-arrow">›</span></article>'
    ).join(''):emptyRows('Necesidades');
  }

  function init(){
    $$('.suggestion-tab').forEach(b=>b.addEventListener('click',()=>{
      active=b.dataset.suggestionTab||'personas';
      render();
    }));
  }

  return {init,render};
}
