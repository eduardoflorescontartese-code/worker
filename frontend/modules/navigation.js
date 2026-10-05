export function createNavigation({$, $$, esc, getDashboard, renderDashboard, bindIntakeButtons}){
  let activeView='matching';

  function setPanelHeader(kicker,title,subtitle){
    $('#panelKicker').textContent=kicker;
    $('#panelTitle').textContent=title;
    $('#panelSubtitle').textContent=subtitle;
  }

  function directoryCard(title,subtitle,body='',tags=[]){
    return '<article class="directory-card"><div><h3>'+esc(title)+'</h3><p>'+esc(subtitle||'')+'</p>'+(body?'<small>'+esc(body)+'</small>':'')+(tags.length?'<div class="match-meta">'+tags.filter(Boolean).map(t=>'<span class="tag">'+esc(t)+'</span>').join('')+'</div>':'')+'</div></article>';
  }

  function emptyDirectory(title,copy){
    return '<div class="empty-state"><div><div class="empty-icon">◎</div><h3>'+esc(title)+'</h3><p>'+esc(copy)+'</p><button class="primary-btn open-intake">Sumarme a MESA</button></div></div>';
  }

  function setActiveControls(view){
    $$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.nav===view || (view==='matching'&&x.dataset.nav==='matching')));
    $$('.filter').forEach(x=>x.classList.toggle('active',x.dataset.view===view || (view==='inicio'&&x.dataset.view==='matching')));
  }

  function renderSection(view){
    activeView=view;
    setActiveControls(view);
    const dashboard=getDashboard();
    const list=$('#matchesList');

    if(view==='inicio'||view==='matching'){
      renderDashboard();
      bindIntakeButtons();
      return;
    }
    if(view==='personas'){
      setPanelHeader('PERSONAS','Personas de la comunidad','Perfiles públicos seguros: profesión y especialidad, sin exponer correos.');
      list.innerHTML=dashboard.personas?.length?dashboard.personas.map(p=>directoryCard(p.nombre_completo||p.id,[p.profesion,p.especialidad].filter(Boolean).join(' · '),'',[p.estado])).join(''):emptyDirectory('Sin personas todavía','Las personas aparecerán cuando completen su ficha.');
    }else if(view==='proyectos'){
      setPanelHeader('PROYECTOS','Proyectos incorporados','Ideas y proyectos cargados por la comunidad.');
      list.innerHTML=dashboard.proyectos?.length?dashboard.proyectos.map(p=>directoryCard(p.nombre||p.id,[p.sector,p.etapa].filter(Boolean).join(' · '),p.descripcion,[p.estado])).join(''):emptyDirectory('Sin proyectos todavía','El primer proyecto puede cargarse ahora mismo.');
    }else if(view==='necesidades'){
      setPanelHeader('NECESIDADES','Qué hace falta para avanzar','Necesidades declaradas o derivadas de información real.');
      list.innerHTML=dashboard.necesidades?.length?dashboard.necesidades.map(n=>directoryCard(n.categoria||'Necesidad',n.necesidad||'',n.detalle||'',[n.prioridad,n.estado])).join(''):emptyDirectory('Sin necesidades todavía','Aparecerán cuando las personas y proyectos indiquen qué necesitan.');
    }else if(view==='capacidades'){
      setPanelHeader('CAPACIDADES','Qué puede aportar la comunidad','Conocimientos, experiencia y recursos disponibles.');
      list.innerHTML=dashboard.capacidades?.length?dashboard.capacidades.map(x=>directoryCard(x.capacidad||'Capacidad',[x.categoria,x.nivel].filter(Boolean).join(' · '),x.evidencia||'',[x.estado])).join(''):emptyDirectory('Sin capacidades todavía','Aparecerán a medida que se completen los perfiles.');
    }else if(view==='equipos'){
      setPanelHeader('EQUIPOS','Equipos que se van formando','Agrupaciones vinculadas a proyectos y capacidades concretas.');
      list.innerHTML=dashboard.equipos?.length?dashboard.equipos.map(x=>directoryCard(x.nombre||x.id,[x.estado,x.roles].filter(Boolean).join(' · '),x.proximos_pasos||x.notas||'',[x.proyecto_id])).join(''):emptyDirectory('Sin equipos todavía','MESA mostrará aquí los equipos cuando se formen.');
    }else if(view==='organizaciones'){
      setPanelHeader('ORGANIZACIONES','Organizaciones de la red','Este bloque queda listo para organizaciones reales; no se generan registros ficticios.');
      list.innerHTML=emptyDirectory('Sin organizaciones todavía','Las organizaciones aparecerán cuando existan registros reales asociados a la comunidad.');
    }else if(view==='red'){
      const c=dashboard.counts||{};
      setPanelHeader('RED','La red de MESA','Vista consolidada de personas, proyectos, capacidades, necesidades y equipos.');
      list.innerHTML='<div class="metrics-board">'+[
        ['Personas',c.personas||0],['Proyectos',c.proyectos||0],['Capacidades',c.capacidades||0],['Necesidades',c.necesidades||0],['Matches',c.matches||0],['Equipos',c.equipos||0]
      ].map(([label,value])=>'<div class="metric-card"><strong>'+esc(value)+'</strong><span>'+esc(label)+'</span></div>').join('')+'</div>';
    }else if(view==='impacto'){
      const c=dashboard.counts||{};
      setPanelHeader('IMPACTO','Actividad real de MESA','Indicadores calculados únicamente con información registrada.');
      list.innerHTML='<div class="metrics-board">'+[
        ['Personas',c.personas||0],['Proyectos',c.proyectos||0],['Necesidades',c.necesidades||0],['Capacidades',c.capacidades||0],['Matches',c.matches||0],['Equipos',c.equipos||0]
      ].map(([label,value])=>'<div class="metric-card"><strong>'+esc(value)+'</strong><span>'+esc(label)+'</span></div>').join('')+'</div>';
    }else if(view==='reportes'){
      const stages={};
      (dashboard.proyectos||[]).forEach(p=>{const k=p.etapa||'Sin etapa';stages[k]=(stages[k]||0)+1});
      setPanelHeader('REPORTES','Resumen de la MESA','Lectura rápida de la base actual, sin cifras inventadas.');
      const stageRows=Object.entries(stages);
      list.innerHTML='<div class="report-board">'+
        directoryCard('Estado general','Base pública operativa','Personas: '+(dashboard.counts?.personas||0)+' · Proyectos: '+(dashboard.counts?.proyectos||0)+' · Matches: '+(dashboard.counts?.matches||0),['D1'])+
        (stageRows.length?'<div class="report-table"><h3>Proyectos por etapa</h3>'+stageRows.map(([k,v])=>'<div><span>'+esc(k)+'</span><strong>'+esc(v)+'</strong></div>').join('')+'</div>':'<div class="empty-mini">Todavía no hay proyectos para reportar por etapa.</div>')+
        '</div>';
    }
    bindIntakeButtons();
  }

  function renderSearchSelection(item){
    if(!item)return;
    const row=item.row||{};
    activeView=item.entity||'matching';
    setActiveControls(activeView);
    setPanelHeader('RESULTADO DE BÚSQUEDA',item.label||item.id,'Registro público encontrado en MESA.');
    $('#matchesList').innerHTML=directoryCard(
      item.label||item.id,
      item.entity||'',
      row.descripcion||row.necesidad||row.capacidad||[row.profesion,row.especialidad].filter(Boolean).join(' · '),
      [row.estado,row.etapa,row.sector]
    );
    $('#searchResults').hidden=true;
  }

  return {
    getActiveView:()=>activeView,
    setPanelHeader,
    renderSection,
    renderSearchSelection
  };
}
