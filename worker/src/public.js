export function createPublicApi({listEntity,json}){
  const publicPerson=r=>({
    id:r.id,
    nombre_completo:r.nombre_completo||[r.nombre,r.apellido].filter(Boolean).join(' '),
    profesion:r.profesion||'',
    especialidad:r.especialidad||'',
    tiene_proyecto_propio:r.tiene_proyecto_propio||'',
    estado:r.estado||'Activo'
  });

  const publicProject=r=>({
    id:r.id,
    nombre:r.nombre||'',
    creador_id:r.creador_id||'',
    descripcion:r.descripcion||'',
    sector:r.sector||'',
    etapa:r.etapa||'',
    estado:r.estado||'Activo'
  });

  const publicCapability=r=>({
    id:r.id,
    entidad_tipo:r.entidad_tipo||'',
    entidad_id:r.entidad_id||'',
    capacidad:r.capacidad||'',
    categoria:r.categoria||'',
    nivel:r.nivel||'',
    evidencia:r.evidencia||'',
    estado:r.estado||'Disponible'
  });

  const publicNeed=r=>({
    id:r.id,
    entidad_tipo:r.entidad_tipo||'',
    entidad_id:r.entidad_id||'',
    necesidad:r.necesidad||'',
    categoria:r.categoria||'',
    prioridad:r.prioridad||'',
    detalle:r.detalle||'',
    estado:r.estado||'Abierta'
  });

  const publicMatch=r=>({
    id:r.id,
    persona_id:r.persona_id||'',
    proyecto_id:r.proyecto_id||'',
    necesidad_id:r.necesidad_id||'',
    capacidad_id:r.capacidad_id||'',
    explicacion:r.explicacion||'',
    puntuacion:Number(r.puntuacion)||0,
    escala_general:Number(r.escala_general)||0,
    conocimiento:Number(r.conocimiento)||0,
    experiencia_sectorial:Number(r.experiencia_sectorial)||0,
    afinidad_problema:Number(r.afinidad_problema)||0,
    recursos:Number(r.recursos)||0,
    urgencia:Number(r.urgencia)||0,
    capacidad_ejecucion:Number(r.capacidad_ejecucion)||0,
    complementariedad:Number(r.complementariedad)||0,
    semaforo:r.semaforo||'',
    estado:r.estado||'sugerido',
    fecha:r.fecha||''
  });

  const publicTeam=r=>({
    id:r.id,
    nombre:r.nombre||'',
    proyecto_id:r.proyecto_id||'',
    roles:r.roles||'',
    capacidades_cubiertas:r.capacidades_cubiertas||'',
    capacidades_faltantes:r.capacidades_faltantes||'',
    estado:r.estado||'Activo',
    notas:r.notas||'',
    proximos_pasos:r.proximos_pasos||''
  });

  async function dashboard(env){
    const [people,projects,needs,caps,matches,teams]=await Promise.all([
      listEntity(env,'personas'),
      listEntity(env,'proyectos'),
      listEntity(env,'necesidades'),
      listEntity(env,'capacidades'),
      listEntity(env,'matches'),
      listEntity(env,'equipos')
    ]);
    const peopleMap=new Map(people.map(p=>[String(p.id),publicPerson(p)]));
    const projectMap=new Map(projects.map(p=>[String(p.id),publicProject(p)]));
    const needMap=new Map(needs.map(n=>[String(n.id),publicNeed(n)]));
    const capMap=new Map(caps.map(x=>[String(x.id),publicCapability(x)]));
    const safeMatches=matches
      .map(publicMatch)
      .sort((a,b)=>b.puntuacion-a.puntuacion)
      .slice(0,60)
      .map(m=>({
        ...m,
        persona:peopleMap.get(String(m.persona_id))||null,
        proyecto:projectMap.get(String(m.proyecto_id))||null,
        necesidad:needMap.get(String(m.necesidad_id))||null,
        capacidad:capMap.get(String(m.capacidad_id))||null
      }));

    return json({
      counts:{
        personas:people.length,
        proyectos:projects.length,
        necesidades:needs.length,
        capacidades:caps.length,
        matches:matches.length,
        equipos:teams.length
      },
      personas:people.slice(0,60).map(publicPerson),
      proyectos:projects.slice(0,60).map(publicProject),
      necesidades:needs.slice(0,60).map(publicNeed),
      capacidades:caps.slice(0,60).map(publicCapability),
      equipos:teams.slice(0,60).map(publicTeam),
      matches:safeMatches
    });
  }

  async function stats(env){
    const [people,projects]=await Promise.all([
      listEntity(env,'personas'),
      listEntity(env,'proyectos')
    ]);
    return json({personas:people.length,proyectos:projects.length});
  }

  async function pendingIds(env){
    const people=await listEntity(env,'personas');
    return json({
      ids:people
        .filter(p=>String(p.origen_informacion||'')!=='autocarga web')
        .map(p=>p.id)
    });
  }

  async function search(env,q){
    const needle=String(q||'').trim().toLowerCase();
    if(!needle)return json({query:q,results:[]});
    const results=[];

    for(const row of await listEntity(env,'personas')){
      const safe=publicPerson(row);
      if(Object.values(safe).join(' ').toLowerCase().includes(needle))
        results.push({entity:'personas',id:safe.id,label:safe.nombre_completo,row:safe});
    }
    for(const row of await listEntity(env,'proyectos')){
      const safe=publicProject(row);
      if(Object.values(safe).join(' ').toLowerCase().includes(needle))
        results.push({entity:'proyectos',id:safe.id,label:safe.nombre,row:safe});
    }
    for(const row of await listEntity(env,'capacidades')){
      const safe=publicCapability(row);
      if(Object.values(safe).join(' ').toLowerCase().includes(needle))
        results.push({entity:'capacidades',id:safe.id,label:safe.capacidad,row:safe});
    }
    for(const row of await listEntity(env,'necesidades')){
      const safe=publicNeed(row);
      if(Object.values(safe).join(' ').toLowerCase().includes(needle))
        results.push({entity:'necesidades',id:safe.id,label:safe.necesidad,row:safe});
    }
    return json({query:q,results:results.slice(0,60)});
  }

  return {dashboard,stats,pendingIds,search};
}
