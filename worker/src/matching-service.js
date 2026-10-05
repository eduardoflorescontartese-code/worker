import { computeMatchFactors } from './match-factors.js';

export function createMatchingService({
  ENTITY_CONFIG,
  listRows,
  listEntity,
  updateRecord,
  appendRecord,
  cleanRow,
  deleted,
  nextId,
  now,
  buildMatches,
  authorized,
  audit,
  json
}){
  async function upsertDerivedSignal(env,entity,ref,data){
    const cfg=ENTITY_CONFIG[entity];
    const rows=await listRows(env,cfg);
    const existing=rows.find(r=>String(r.origen_referencia||'')===ref);
    const text=String(entity==='capacidades'?data.capacidad:data.necesidad||'').trim();

    if(!text){
      if(existing&&!deleted(existing.eliminado)){
        const rec={...cleanRow(existing),eliminado:true,estado:'Inactiva',fecha_actualizacion:now()};
        await updateRecord(env,cfg,existing.__row,rec);
      }
      return;
    }

    const common={
      ...data,
      fecha_actualizacion:now(),
      origen_informacion:'deducción razonable',
      origen_referencia:ref,
      eliminado:false
    };

    if(existing){
      await updateRecord(env,cfg,existing.__row,{...cleanRow(existing),...common,id:existing.id});
    }else{
      await appendRecord(env,cfg,{...common,id:nextId(rows,cfg.prefix)});
    }
  }

  async function refreshDerivedSignals(env){
    const [people,projects]=await Promise.all([
      listEntity(env,'personas'),
      listEntity(env,'proyectos')
    ]);

    for(const p of people){
      const profile=[p.profesion,p.especialidad,p.tecnologias].filter(Boolean).join(' · ');
      const aporte=[
        p.puede_aportar,
        p.capacidades_tecnicas_resumen,
        p.capacidades_no_tecnicas_resumen
      ].filter(Boolean).join(' · ');

      await upsertDerivedSignal(env,'capacidades',`auto:persona:${p.id}:perfil`,{
        entidad_tipo:'persona',
        entidad_id:p.id,
        capacidad:profile,
        categoria:'Perfil profesional',
        nivel:p.seniority||'',
        evidencia:p.experiencia||'',
        estado:'Disponible'
      });

      await upsertDerivedSignal(env,'capacidades',`auto:persona:${p.id}:aporte`,{
        entidad_tipo:'persona',
        entidad_id:p.id,
        capacidad:aporte,
        categoria:'Capacidad disponible',
        nivel:p.seniority||'',
        evidencia:p.experiencia||'',
        estado:'Disponible'
      });

      await upsertDerivedSignal(env,'necesidades',`auto:persona:${p.id}:busca`,{
        entidad_tipo:'persona',
        entidad_id:p.id,
        necesidad:p.busca||'',
        categoria:'Necesidad declarada',
        prioridad:'Media',
        detalle:p.intereses||'',
        estado:'Abierta'
      });
    }

    const projectNeedFields=[
      ['capacidades_faltantes_resumen','Capacidades faltantes'],
      ['perfiles_buscados','Perfiles buscados'],
      ['necesidades_tecnicas','Tecnología'],
      ['necesidades_comerciales','Comercial'],
      ['necesidades_financieras','Financiación'],
      ['necesidades_legales','Legal'],
      ['necesidades_hardware','Hardware']
    ];

    for(const p of projects){
      const capability=[
        p.capacidades_existentes_resumen,
        p.tecnologias,
        p.evidencia_existente
      ].filter(Boolean).join(' · ');

      await upsertDerivedSignal(env,'capacidades',`auto:proyecto:${p.id}:existente`,{
        entidad_tipo:'proyecto',
        entidad_id:p.id,
        capacidad:capability,
        categoria:p.sector||'Proyecto',
        nivel:p.etapa||'',
        evidencia:p.evidencia_existente||'',
        estado:'Disponible'
      });

      for(const [field,category] of projectNeedFields){
        await upsertDerivedSignal(env,'necesidades',`auto:proyecto:${p.id}:${field}`,{
          entidad_tipo:'proyecto',
          entidad_id:p.id,
          necesidad:p[field]||'',
          categoria:category,
          prioridad:'Media',
          detalle:p.descripcion||'',
          estado:'Abierta'
        });
      }
    }
  }

  async function recomputeMatchesCore(env){
    await refreshDerivedSignals(env);

    const [needs,caps,existing,projects]=await Promise.all([
      listEntity(env,'necesidades'),
      listEntity(env,'capacidades'),
      listEntity(env,'matches'),
      listEntity(env,'proyectos')
    ]);

    const cfg=ENTITY_CONFIG.matches;
    const ownerByProject=new Map(projects.map(p=>[String(p.id),String(p.creador_id||'')]));
    const known=new Set(existing.map(m=>`${m.necesidad_id}|${m.capacidad_id}`));
    let created=0,verdes=0,amarillos=0;

    for(const m of buildMatches(needs,caps)){
      const key=`${m.need.id}|${m.capability.id}`;
      if(known.has(key))continue;

      const needOwner=m.need.entidad_tipo==='proyecto'
        ? ownerByProject.get(String(m.need.entidad_id))
        : '';
      const capOwner=m.capability.entidad_tipo==='proyecto'
        ? ownerByProject.get(String(m.capability.entidad_id))
        : '';

      if(m.need.entidad_tipo==='proyecto'&&m.capability.entidad_tipo==='persona'&&needOwner===String(m.capability.entidad_id))continue;
      if(m.need.entidad_tipo==='persona'&&m.capability.entidad_tipo==='proyecto'&&capOwner===String(m.need.entidad_id))continue;

      const all=await listRows(env,cfg);
      const factors=computeMatchFactors(m.need,m.capability,m.score);
      const rec={
        id:nextId(all,cfg.prefix),
        origen_tipo:m.need.entidad_tipo,
        origen_id:m.need.entidad_id,
        destino_tipo:m.capability.entidad_tipo,
        destino_id:m.capability.entidad_id,
        persona_id:m.capability.entidad_tipo==='persona'
          ? m.capability.entidad_id
          : (m.need.entidad_tipo==='persona'?m.need.entidad_id:''),
        proyecto_id:m.need.entidad_tipo==='proyecto'
          ? m.need.entidad_id
          : (m.capability.entidad_tipo==='proyecto'?m.capability.entidad_id:''),
        necesidad_id:m.need.id,
        capacidad_id:m.capability.id,
        explicacion:m.explanation,
        puntuacion:m.score,
        escala_general:factors.escala_general,
        conocimiento:factors.conocimiento,
        experiencia_sectorial:factors.experiencia_sectorial,
        afinidad_problema:factors.afinidad_problema,
        recursos:factors.recursos,
        urgencia:factors.urgencia,
        capacidad_ejecucion:factors.capacidad_ejecucion,
        complementariedad:factors.complementariedad,
        semaforo:m.semaforo,
        estado:'sugerido',
        fecha:now(),
        fecha_actualizacion:now(),
        origen_informacion:'deducción razonable',
        eliminado:false
      };

      await appendRecord(env,cfg,rec);
      created++;
      if(m.semaforo==='verde')verdes++;
      else if(m.semaforo==='amarillo')amarillos++;
    }

    return {ok:true,created,verdes,amarillos};
  }

  async function recomputeMatches(env,req){
    if(!(await authorized(env,req)))return json({error:'No autorizado'},401);
    const result=await recomputeMatchesCore(env);
    await audit(
      env,
      'matches',
      '*',
      'recalcular',
      'deducción razonable',
      `${result.created} matches nuevos; ${result.verdes} verdes; ${result.amarillos} amarillos`
    );
    return json(result);
  }

  return {refreshDerivedSignals,recomputeMatchesCore,recomputeMatches};
}
