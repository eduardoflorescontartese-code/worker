import { ensureSheets, listRows as listGoogleRows, appendRow, updateRow as updateGoogleRow } from './google.js';

export const tableName = cfg => 'mesa_' + String(cfg.sheet || '').toLowerCase().replace(/[^a-z0-9_]/g,'');

async function ensureD1Table(env,cfg){
  const t=tableName(cfg);
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ${t} (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_${t}_deleted ON ${t}(deleted)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_${t}_updated ON ${t}(updated_at DESC)`).run();
}

export async function ensureStore(env, entityConfig){
  if(env.DB){
    for(const cfg of Object.values(entityConfig)) await ensureD1Table(env,cfg);
    await seedInitialMesaData(env,entityConfig);
    return {backend:'d1'};
  }
  await ensureSheets(env,entityConfig);
  return {backend:'google'};
}

export async function listRows(env,cfg){
  if(!env.DB) return listGoogleRows(env,cfg);
  await ensureD1Table(env,cfg);
  const t=tableName(cfg);
  const out=await env.DB.prepare(`SELECT id,data FROM ${t} ORDER BY updated_at DESC`).all();
  return (out.results||[]).map(r=>{
    let obj={}; try{obj=JSON.parse(r.data||'{}')}catch{}
    return {...obj,id:obj.id||r.id,__row:r.id};
  });
}

export async function appendRecord(env,cfg,rec){
  if(!env.DB){
    await appendRow(env,cfg.sheet,cfg.headers.map(h=>rec[h]??''));
    return;
  }
  await ensureD1Table(env,cfg);
  const t=tableName(cfg), ts=rec.fecha_actualizacion||rec.fecha||new Date().toISOString();
  await env.DB.prepare(`INSERT INTO ${t}(id,data,deleted,updated_at) VALUES(?,?,?,?)`)
    .bind(String(rec.id),JSON.stringify(rec),rec.eliminado?1:0,ts).run();
}

export async function updateRecord(env,cfg,rowRef,rec){
  if(!env.DB){
    await updateGoogleRow(env,cfg,rowRef,rec);
    return;
  }
  await ensureD1Table(env,cfg);
  const t=tableName(cfg), ts=rec.fecha_actualizacion||rec.fecha||new Date().toISOString();
  await env.DB.prepare(`UPDATE ${t} SET data=?, deleted=?, updated_at=? WHERE id=?`)
    .bind(JSON.stringify(rec),rec.eliminado?1:0,ts,String(rec.id||rowRef)).run();
}


const INITIAL_PEOPLE = [
  {
    id:'P-0001',
    nombre:'Javier',
    apellido:'Quintana',
    nombre_completo:'Javier Quintana',
    email:'tupunto2025@gmail.com',
    profesion:'Seguridad / tecnología aplicada a CRA',
    especialidad:'Seguridad y tecnología aplicada',
    intereses:'Desarrollo de RefNet; socios y cofundadores; validación comercial',
    puede_aportar:'Conocimiento del problema, arquitectura de RefNet, motor de decisión y visión de producto',
    busca:'Equipo técnico, contactos, apoyo y socios/cofundadores para RefNet',
    tiene_proyecto_propio:'Sí — RefNet',
    observaciones:'No registrar como capacidades personales las necesidades técnicas de RefNet.',
    preguntas_pendientes:'Completar teléfono, ubicación, disponibilidad detallada y trayectoria.',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Convocatoria UTEC / correo 2026-10-04',
    eliminado:false
  },
  {
    id:'P-0002',
    nombre:'Valentina',
    apellido:'Archetti',
    nombre_completo:'Valentina Archetti',
    profesion:'Construcción',
    especialidad:'Administración, contabilidad y dirección de obra',
    capacidades_no_tecnicas_resumen:'Construcción; administración; contabilidad; dirección de obra',
    disponibilidad:'Disponible para primera reunión',
    intereses:'Proyecto propio de comunicación juvenil para desconexión digital',
    puede_aportar:'Experiencia en construcción, administración, contabilidad y dirección de obra',
    busca:'Ingeniería informática/electrónica o diseño industrial; hardware; prototipado; PCB',
    tiene_proyecto_propio:'Sí — dispositivo juvenil para desconexión digital',
    observaciones:'Etapa exacta del proyecto pendiente de confirmar.',
    preguntas_pendientes:'Completar contacto directo, experiencia detallada y etapa del proyecto.',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Convocatoria UTEC / correo 2026-10-04',
    eliminado:false
  },
  {
    id:'P-0003',
    nombre:'Aníbal',
    apellido:'de Miñaur',
    nombre_completo:'Aníbal de Miñaur',
    observaciones:'Manifestó interés en incorporarse a la Mesa.',
    preguntas_pendientes:'Profesión, experiencia, capacidades, proyecto, etapa, necesidades, disponibilidad y contacto.',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Convocatoria UTEC / correo 2026-10-04',
    eliminado:false
  },
  {
    id:'P-0004',
    nombre:'Natalia',
    apellido:'Pérez',
    nombre_completo:'Natalia Pérez',
    observaciones:'Manifestó interés en participar.',
    preguntas_pendientes:'Profesión, experiencia, capacidades, proyecto, necesidades y disponibilidad.',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Convocatoria UTEC / correo 2026-10-05',
    eliminado:false
  },
  {
    id:'P-0005',
    nombre:'Mario',
    apellido:'Duarte',
    nombre_completo:'Mario Duarte',
    observaciones:'Manifestó interés en participar.',
    preguntas_pendientes:'Profesión, experiencia, capacidades, proyecto, necesidades y disponibilidad.',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Convocatoria UTEC / correo 2026-10-05',
    eliminado:false
  },
  {
    id:'P-0006',
    nombre:'Augusto',
    apellido:'Preliasco',
    nombre_completo:'Augusto Preliasco',
    observaciones:'Manifestó interés en participar.',
    preguntas_pendientes:'Profesión, experiencia, capacidades, proyecto, necesidades y disponibilidad.',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Convocatoria UTEC / correo 2026-10-05',
    eliminado:false
  },
  {
    id:'P-0007',
    nombre:'Marcio',
    apellido:'Umpierrez',
    nombre_completo:'Marcio Umpierrez',
    observaciones:'Manifestó interés en participar.',
    preguntas_pendientes:'Profesión, experiencia, capacidades, proyecto, necesidades y disponibilidad.',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Convocatoria UTEC / correo 2026-10-05',
    eliminado:false
  }
];

const INITIAL_PROJECTS = [
  {
    id:'PR-0001',
    nombre:'RefNet',
    creador_id:'P-0001',
    responsables:'P-0001',
    descripcion:'Proyecto de Javier Quintana con arquitectura documentada, motor de decisión funcionando, demo integrada y consola prototipo.',
    sector:'Seguridad / tecnología aplicada a CRA',
    etapa:'Prototipo',
    evidencia_existente:'Arquitectura documentada; motor de decisión ejecutándose; demo end-to-end; consola de operador en prototipo',
    capacidades_faltantes_resumen:'Software; backend; edge computing; integración hardware/cámaras; protocolos; producto; testing; despliegue',
    perfiles_buscados:'Ingeniería de software; backend; integración; edge computing; producto técnico',
    necesidades_tecnicas:'Nodo local; traducción de eventos; backend/plataforma; integraciones; pruebas; despliegue',
    necesidades_comerciales:'Validación comercial; socios/cofundadores; contactos',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Convocatoria UTEC / correo 2026-10-04',
    eliminado:false
  },
  {
    id:'PR-0002',
    nombre:'Dispositivo juvenil para desconexión digital',
    creador_id:'P-0002',
    responsables:'P-0002',
    descripcion:'Dispositivo de comunicación juvenil enfocado en desconexión digital.',
    sector:'Tecnología / bienestar digital',
    etapa:'Por determinar',
    capacidades_faltantes_resumen:'Ingeniería informática/electrónica; diseño industrial; hardware; prototipado; PCB',
    perfiles_buscados:'Ingeniería informática/electrónica o diseño industrial con experiencia en hardware/PCB',
    necesidades_tecnicas:'Hardware; prototipo; diseño/fabricación de PCB',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Convocatoria UTEC / correo 2026-10-04',
    eliminado:false
  }
];

async function seedRecord(env,cfg,rec){
  await ensureD1Table(env,cfg);
  const t=tableName(cfg);
  const ts=new Date().toISOString();
  const full={...rec,fecha_actualizacion:rec.fecha_actualizacion||ts};
  if(cfg.sheet==='Personas' && !full.fecha_incorporacion) full.fecha_incorporacion=ts;
  await env.DB.prepare(`INSERT OR IGNORE INTO ${t}(id,data,deleted,updated_at) VALUES(?,?,?,?)`)
    .bind(String(full.id),JSON.stringify(full),full.eliminado?1:0,full.fecha_actualizacion).run();
}

export async function seedInitialMesaData(env,entityConfig){
  if(!env.DB) return;
  const peopleCfg=entityConfig.personas, projectCfg=entityConfig.proyectos;
  for(const rec of INITIAL_PEOPLE) await seedRecord(env,peopleCfg,rec);
  for(const rec of INITIAL_PROJECTS) await seedRecord(env,projectCfg,rec);
}
