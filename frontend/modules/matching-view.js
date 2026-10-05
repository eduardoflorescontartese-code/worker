export function createMatchingView({$, esc, getDashboard, bindIntakeButtons}){
  const clamp100=n=>Math.max(0,Math.min(100,Number(n)||0));
  const clamp7=n=>Math.max(1,Math.min(7,Number(n)||1));
  const scale7=m=>{
    const direct=Number(m?.escala_general);
    if(direct>0)return Number(direct.toFixed(1));
    return Number((1+(clamp100(m?.puntuacion)/100)*6).toFixed(1));
  };
  const pctFrom7=n=>Math.max(0,Math.min(100,((clamp7(n)-1)/6)*100));

  function level(score7){
    if(score7>=6)return {label:'Muy alto',color:'#0a9b5b'};
    if(score7>=5)return {label:'Alto',color:'#3aba68'};
    if(score7>=4)return {label:'Medio',color:'#f4b92b'};
    if(score7>=3)return {label:'Bajo',color:'#f59a23'};
    return {label:'Muy bajo',color:'#e6434f'};
  }

  function rows(){
    let list=[...(getDashboard().matches||[])];
    const filter=$('#matchFilter')?.value||'all';

    if(filter==='alto')list=list.filter(m=>scale7(m)>=5);
    if(filter==='medio')list=list.filter(m=>scale7(m)>=4&&scale7(m)<5);
    if(filter==='bajo')list=list.filter(m=>scale7(m)<4);

    if(($('#matchSort')?.value||'score')==='score'){
      list.sort((a,b)=>scale7(b)-scale7(a));
    }else{
      list.sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')));
    }
    return list;
  }

  function chips(values){
    return values.filter(Boolean).slice(0,3)
      .map(x=>'<span class="entity-chip">'+esc(x)+'</span>').join('');
  }

  const factorDefs=[
    ['conocimiento','Conocimiento'],
    ['experiencia_sectorial','Experiencia sectorial'],
    ['afinidad_problema','Afinidad del problema'],
    ['recursos','Recursos'],
    ['urgencia','Urgencia'],
    ['capacidad_ejecucion','Capacidad de ejecución'],
    ['complementariedad','Complementariedad']
  ];

  function factorRows(m){
    return factorDefs.map(([key,label])=>{
      const raw=Number(m[key]);
      const has=raw>0;
      const value=has?clamp7(raw):null;
      const pct=has?pctFrom7(value):0;
      return '<div class="factor-line">'+
        '<span>'+esc(label)+'</span>'+
        '<div class="factor-bar"><i style="width:'+pct+'%"></i></div>'+
        '<b>'+(has?value.toFixed(1):'—')+'</b>'+
      '</div>';
    }).join('');
  }

  function legend(){
    const rows=[
      [7,'Excelente'],[6,'Muy alto'],[5,'Alto'],[4,'Medio'],[3,'Bajo'],[2,'Muy bajo'],[1,'Sin encaje']
    ];
    return '<div class="score-legend">'+rows.map(([n,label])=>
      '<div><span class="legend-dot l'+n+'">'+n+'</span><small>'+label+'</small></div>'
    ).join('')+'</div>';
  }

  function card(m){
    const score7=scale7(m);
    const info=level(score7);
    const person=m.persona||{};
    const project=m.proyecto||{};
    const personName=person.nombre_completo||'Persona';
    const projectName=project.nombre||'Proyecto';
    const initials=String(personName).split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'M';
    const needText=m.necesidad?.necesidad||'';
    const capText=m.capacidad?.capacidad||'';
    const dotClass=score7>=5?'dot-green':score7>=4?'dot-yellow':'dot-red';

    return '<article class="match-card-reference">'+
      '<div class="match-pair">'+
        '<div class="match-entity">'+
          '<div class="entity-icon person-icon">'+esc(initials)+'<i class="entity-status '+dotClass+'"></i></div>'+
          '<div><span>Persona</span><strong>'+esc(personName)+'</strong>'+
          '<small>'+esc([person.profesion,person.especialidad].filter(Boolean).join(' · ')||'Perfil MESA')+'</small>'+
          '<div class="entity-chips">'+chips([person.profesion,person.especialidad])+'</div></div>'+
        '</div>'+
        '<div class="pair-arrow">↔</div>'+
        '<div class="match-entity project">'+
          '<div class="entity-icon project-icon">▣</div>'+
          '<div><span>Proyecto</span><strong>'+esc(projectName)+'</strong>'+
          '<small>'+esc(project.descripcion||[project.sector,project.etapa].filter(Boolean).join(' · ')||'Proyecto MESA')+'</small>'+
          '<div class="entity-chips">'+chips([project.sector,project.etapa])+'</div></div>'+
          '<button class="bookmark-btn" type="button" aria-label="Guardar match">♡</button>'+
        '</div>'+
      '</div>'+

      '<div class="match-body-reference">'+
        '<div class="score-zone">'+
          '<div class="score-gauge" style="--score-pct:'+pctFrom7(score7)+'%;--score-color:'+info.color+'">'+
            '<div><strong>'+score7.toFixed(1)+'</strong><span>Encaje general</span></div>'+
          '</div>'+
          '<span class="score-label" style="--label-color:'+info.color+'">'+esc(info.label)+'</span>'+
        '</div>'+
        '<div class="factor-zone">'+
          '<div class="factor-list">'+factorRows(m)+'</div>'+
          legend()+
        '</div>'+
      '</div>'+

      '<div class="match-explanation">'+
        '<span class="bulb">●</span>'+
        '<span class="explanation-copy">'+esc(m.explicacion||'MESA detectó una complementariedad entre una necesidad y una capacidad disponible.')+'</span>'+
        '<button class="details-btn" type="button" data-details>Ver detalles ›</button>'+
      '</div>'+
      '<div class="match-details" hidden>'+
        (needText?'<div><strong>Necesidad</strong><span>'+esc(needText)+'</span></div>':'')+
        (capText?'<div><strong>Capacidad</strong><span>'+esc(capText)+'</span></div>':'')+
      '</div>'+
    '</article>';
  }

  function bindCardActions(){
    $('#matchesList').querySelectorAll('.bookmark-btn').forEach(button=>{
      button.addEventListener('click',()=>{
        const active=button.dataset.active==='1';
        button.dataset.active=active?'0':'1';
        button.textContent=active?'♡':'♥';
      });
    });

    $('#matchesList').querySelectorAll('[data-details]').forEach(button=>{
      button.addEventListener('click',()=>{
        const card=button.closest('.match-card-reference');
        const details=card?.querySelector('.match-details');
        if(!details)return;
        const opening=details.hidden;
        details.hidden=!opening;
        button.textContent=opening?'Ocultar detalles ‹':'Ver detalles ›';
      });
    });
  }

  function render(){
    const list=$('#matchesList');
    const data=rows();

    if(!data.length){
      list.innerHTML='<div class="empty-state"><div><div class="empty-icon">⌘</div>'+
        '<h3>Sin conexiones sugeridas todavía</h3>'+
        '<p>Cuando existan personas, proyectos, capacidades y necesidades compatibles, MESA mostrará aquí los matches.</p>'+
        '<button class="primary-btn open-intake">Subir mi proyecto</button></div></div>';
      bindIntakeButtons();
      return;
    }

    list.innerHTML=data.map(card).join('');
    bindCardActions();
  }

  function renderOne(match){
    if(!match)return;
    $('#matchesList').innerHTML=card(match);
    bindCardActions();
  }

  function init(){
    $('#matchSort')?.addEventListener('change',render);
    $('#matchFilter')?.addEventListener('change',render);
  }

  return {init,render,renderOne};
}
