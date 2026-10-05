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
    email:'valentinaarchetti7@gmail.com',
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
    email:'anibal0810@gmail.com',
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
    email:'nataliaperez.turismo@gmail.com',
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
    email:'marioadsanchez@gmail.com',
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
    email:'preliasco@gmail.com',
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
    email:'marcioplay3d@gmail.com',
    observaciones:'Manifestó interés en participar.',
    preguntas_pendientes:'Profesión, experiencia, capacidades, proyecto, necesidades y disponibilidad.',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Convocatoria UTEC / correo 2026-10-05',
    eliminado:false
  },
  {
    id:'P-0008',
    nombre:'Adriana Carla',
    apellido:'Dias Trevisan',
    nombre_completo:'Adriana Carla Dias Trevisan',
    email:'adriana-trevisan@uergs.edu.br',
    profesion:'Agrónoma / docente universitaria',
    especialidad:'Plantas nativas y desarrollo agropecuario',
    puede_aportar:'Agronomía, investigación, docencia y conocimiento de plantas nativas',
    busca:'Apoyos para avanzar FitoPampa; etapa y necesidad principal pendientes de confirmar',
    tiene_proyecto_propio:'Sí — FitoPampa',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Convocatoria UTEC / correo 2026-10-05',
    eliminado:false
  },
  {
    id:'P-0009',
    nombre:'Arturo',
    apellido:'Hernández',
    nombre_completo:'Arturo Hernández',
    email:'arturohernandez8752@gmail.com',
    profesion:'Ingeniero químico / desarrollador backend',
    especialidad:'Backend, Java, APIs REST y testing con JavaScript',
    puede_aportar:'Desarrollo backend, Java, APIs REST, testing y formación técnica',
    busca:'Colaborar en proyectos donde su perfil técnico pueda aportar',
    tiene_proyecto_propio:'No informado',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Convocatoria UTEC / correo 2026-10-05',
    eliminado:false
  },
  {
    id:'P-0010',
    nombre:'Santiago',
    apellido:'Beraza',
    nombre_completo:'Santiago Beraza',
    email:'berazasantiago89@gmail.com',
    profesion:'Ingeniero agrónomo',
    especialidad:'Agroecología y bioinsumos',
    puede_aportar:'Agronomía, agroecología y bioinsumos',
    busca:'Apoyo para hacer crecer el biopellet; necesidad concreta pendiente de confirmar',
    tiene_proyecto_propio:'Sí — biopellet regenerador de suelos',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Convocatoria UTEC / correo 2026-10-05',
    eliminado:false
  },
  {
    id:'P-0011',
    nombre:'Karen',
    apellido:'Silveira',
    nombre_completo:'Karen Silveira',
    email:'karensilveira3546@gmail.com',
    profesion:'Técnica en Artes Plásticas y Visuales',
    especialidad:'Economía circular y reutilización de vidrio',
    puede_aportar:'Diseño, economía circular, reutilización de vidrio y desarrollo de productos',
    busca:'Apoyo para escalar y desarrollar Eco Glass / proyecto PAIE; necesidad prioritaria pendiente de confirmar',
    tiene_proyecto_propio:'Sí — Eco Glass / proyecto PAIE',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Convocatoria UTEC / correo 2026-10-05',
    eliminado:false
  },
  {
    id:'P-0012',
    nombre:'Otto Nelson',
    apellido:'Caetano Rodriguez',
    nombre_completo:'Otto Nelson Caetano Rodriguez',
    email:'ottocaetano@gmail.com',
    profesion:'Programador senior',
    especialidad:'Desarrollo de software',
    puede_aportar:'Programación senior y desarrollo técnico',
    busca:'Necesidades de SintegraAi pendientes de confirmar',
    tiene_proyecto_propio:'Sí — SintegraAi',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Convocatoria UTEC / correo 2026-10-05',
    eliminado:false
  },
  {
    id:'P-0013',
    nombre:'Julio',
    apellido:'Friedrich',
    nombre_completo:'Julio Friedrich',
    email:'jfriedrich405@gmail.com',
    profesion:'Alta Cocina — UTEC Paysandú',
    especialidad:'Producción y elaboración de alimentos',
    puede_aportar:'Alta cocina, producción y elaboración de alimentos',
    busca:'Apoyo para hacer crecer emprendimiento de productos a base de chayote/papa del aire; necesidad concreta pendiente',
    tiene_proyecto_propio:'Sí — productos elaborados a base de chayote o papa del aire',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Correo directo 2026-10-05',
    eliminado:false
  }
,
  {
    id:'P-0014',
    nombre:'Annabela',
    apellido:'Estévez Onetto',
    nombre_completo:'Annabela Estévez Onetto',
    email:'aestevezonetto@gmail.com',
    profesion:'Química farmacéutica / química cosmética',
    especialidad:'Formulaciones y habilitación de laboratorios',
    puede_aportar:'Formulación, química cosmética y experiencia en habilitación de laboratorios cosméticos, domisanitarios y alimentarios',
    busca:'Colaborar y conectar con proyectos donde su experiencia pueda aportar',
    tiene_proyecto_propio:'No informado',
    estado:'Activo',
    origen_informacion:'correo directo',
    origen_referencia:'Correo personal 2026-10-05',
    eliminado:false
  },
  {
    id:'P-0015',
    nombre:'Victoria',
    apellido:'Campbell',
    nombre_completo:'Victoria Campbell',
    email:'vicosdr@gmail.com',
    observaciones:'Manifestó interés en participar y espera la primera instancia virtual.',
    preguntas_pendientes:'Área, profesión, capacidades, proyecto o idea y necesidades.',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Correo 2026-10-05',
    eliminado:false
  }];

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
  },
  {
    id:'PR-0003',
    nombre:'FitoPampa',
    creador_id:'P-0008',
    responsables:'P-0008',
    descripcion:'Desarrollo vinculado a plantas nativas con tres productos orientados al sector agropecuario.',
    sector:'Agro / plantas nativas',
    etapa:'Por determinar',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Convocatoria UTEC / correo 2026-10-05',
    eliminado:false
  },
  {
    id:'PR-0004',
    nombre:'Biopellet regenerador de suelos',
    creador_id:'P-0010',
    responsables:'P-0010',
    descripcion:'Biopellet regenerador de suelos en el área de agroecología y bioinsumos.',
    sector:'Agro / bioinsumos',
    etapa:'Por determinar',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Convocatoria UTEC / correo 2026-10-05',
    eliminado:false
  },
  {
    id:'PR-0005',
    nombre:'Eco Glass / PAIE',
    creador_id:'P-0011',
    responsables:'P-0011',
    descripcion:'Economía circular y desarrollo de piezas vítreas sinterizadas a partir de vidrio de un solo uso.',
    sector:'Economía circular / materiales',
    etapa:'Por determinar',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Convocatoria UTEC / correo 2026-10-05',
    eliminado:false
  },
  {
    id:'PR-0006',
    nombre:'SintegraAi',
    creador_id:'P-0012',
    responsables:'P-0012',
    descripcion:'Proyecto de software/IA de Otto Caetano. Alcance pendiente de ampliar con su respuesta.',
    sector:'Software / IA',
    etapa:'Por determinar',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Convocatoria UTEC / correo 2026-10-05',
    eliminado:false
  },
  {
    id:'PR-0007',
    nombre:'Emprendimiento de productos de chayote / papa del aire',
    creador_id:'P-0013',
    responsables:'P-0013',
    descripcion:'Producción, elaboración y venta de productos elaborados a base de chayote o papa del aire.',
    sector:'Alimentos / producción',
    etapa:'En actividad — detalle pendiente',
    estado:'Activo',
    origen_informacion:'correo',
    origen_referencia:'Correo directo 2026-10-05',
    eliminado:false
  }
];

async function seedRecord(env,cfg,rec){
  await ensureD1Table(env,cfg);
  const t=tableName(cfg);
  const ts=new Date().toISOString();
  const found=await env.DB.prepare(`SELECT data FROM ${t} WHERE id=?`).bind(String(rec.id)).first();
  if(found?.data){
    let current={}; try{current=JSON.parse(found.data||'{}')}catch{}
    let changed=false;
    for(const [k,v] of Object.entries(rec)){
      if((current[k]===undefined || current[k]===null || current[k]==='') && v!==undefined && v!==null && v!==''){
        current[k]=v; changed=true;
      }
    }
    if(changed){
      current.fecha_actualizacion=ts;
      await env.DB.prepare(`UPDATE ${t} SET data=?, deleted=?, updated_at=? WHERE id=?`)
        .bind(JSON.stringify(current),current.eliminado?1:0,ts,String(rec.id)).run();
    }
    return;
  }
  const full={...rec,fecha_actualizacion:rec.fecha_actualizacion||ts};
  if(cfg.sheet==='Personas' && !full.fecha_incorporacion) full.fecha_incorporacion=ts;
  await env.DB.prepare(`INSERT INTO ${t}(id,data,deleted,updated_at) VALUES(?,?,?,?)`)
    .bind(String(full.id),JSON.stringify(full),full.eliminado?1:0,full.fecha_actualizacion).run();
}

export async function seedInitialMesaData(env,entityConfig){
  if(!env.DB) return;
  const peopleCfg=entityConfig.personas, projectCfg=entityConfig.proyectos;
  for(const rec of INITIAL_PEOPLE) await seedRecord(env,peopleCfg,rec);
  for(const rec of INITIAL_PROJECTS) await seedRecord(env,projectCfg,rec);
}
