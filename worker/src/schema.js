export const ENTITY_CONFIG = {
  personas: {
    sheet: 'Personas', prefix: 'P',
    headers: ['id','nombre','apellido','nombre_completo','email','telefono','ciudad','departamento','pais','profesion','especialidad','experiencia','seniority','sectores','tecnologias','capacidades_tecnicas_resumen','capacidades_no_tecnicas_resumen','disponibilidad','intereses','puede_aportar','busca','tiene_proyecto_propio','linkedin','web','observaciones','preguntas_pendientes','estado','fecha_incorporacion','fecha_actualizacion','origen_informacion','origen_referencia','eliminado']
  },
  proyectos: {
    sheet: 'Proyectos', prefix: 'PR',
    headers: ['id','nombre','creador_id','responsables','descripcion','sector','problema','solucion','etapa','tecnologias','evidencia_existente','capacidades_existentes_resumen','capacidades_faltantes_resumen','perfiles_buscados','necesidades_tecnicas','necesidades_comerciales','necesidades_financieras','necesidades_legales','necesidades_hardware','validaciones','piloto','clientes','estado','proximos_pasos','documentos','fecha_actualizacion','origen_informacion','origen_referencia','eliminado']
  },
  capacidades: {
    sheet: 'Capacidades', prefix: 'C',
    headers: ['id','entidad_tipo','entidad_id','capacidad','categoria','nivel','evidencia','estado','fecha_actualizacion','origen_informacion','origen_referencia','eliminado']
  },
  necesidades: {
    sheet: 'Necesidades', prefix: 'N',
    headers: ['id','entidad_tipo','entidad_id','necesidad','categoria','prioridad','detalle','estado','fecha_actualizacion','origen_informacion','origen_referencia','eliminado']
  },
  matches: {
    sheet: 'Matches', prefix: 'M',
    headers: ['id','origen_tipo','origen_id','destino_tipo','destino_id','persona_id','proyecto_id','necesidad_id','capacidad_id','explicacion','puntuacion','estado','fecha','fecha_actualizacion','origen_informacion','origen_referencia','eliminado']
  },
  equipos: {
    sheet: 'Equipos', prefix: 'E',
    headers: ['id','nombre','proyecto_id','integrantes','roles','capacidades_cubiertas','capacidades_faltantes','estado','notas','responsable_id','proximos_pasos','fecha_actualizacion','origen_informacion','origen_referencia','eliminado']
  },
  pendientes: {
    sheet: 'Pendientes', prefix: 'PE',
    headers: ['id','entidad_tipo','entidad_id','pendiente','prioridad','estado','fecha_alta','fecha_objetivo','responsable_id','notas','fecha_actualizacion','origen_informacion','origen_referencia','eliminado']
  },
  documentos: {
    sheet: 'Documentos', prefix: 'D',
    headers: ['id','persona_id','proyecto_id','nombre','tipo','drive_file_id','url','fecha','origen','resumen','estado_analisis','fecha_actualizacion','origen_informacion','origen_referencia','eliminado']
  },
  auditoria: {
    sheet: 'Auditoria', prefix: 'A',
    headers: ['id','fecha','entidad','registro_id','accion','origen','usuario_origen','detalle']
  }
};

export const PUBLIC_ENTITIES = Object.keys(ENTITY_CONFIG).filter(k => k !== 'auditoria');
export const PROJECT_STAGES = ['Idea','Concepto definido','Diseño funcional','Arquitectura definida','Prototipo','MVP','Producto funcional','Piloto','Validación comercial','Producción','Escalamiento'];
export const ORIGIN_TYPES = ['correo','CV','documento','carga manual','deducción razonable'];

export function normalizeEntityName(name) {
  const key = String(name || '').toLowerCase();
  if (!ENTITY_CONFIG[key]) throw new Error('Entidad inválida');
  return key;
}

function provided(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function requiredWhenPresent(record, key, { partial }) {
  return !partial || provided(record, key);
}

export function validateRecord(entity, record, { partial = false } = {}) {
  const cfg = ENTITY_CONFIG[entity];
  if (!cfg) throw new Error('Entidad inválida');
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Registro inválido');

  const out = {};
  for (const h of cfg.headers) if (record[h] !== undefined) out[h] = record[h];

  if (entity === 'personas' && requiredWhenPresent(record, 'nombre_completo', { partial }) && !String(record.nombre_completo || '').trim()) {
    throw new Error('nombre_completo es obligatorio');
  }
  if (entity === 'proyectos' && requiredWhenPresent(record, 'nombre', { partial }) && !String(record.nombre || '').trim()) {
    throw new Error('nombre es obligatorio');
  }

  if (entity === 'capacidades') {
    if (requiredWhenPresent(record, 'entidad_tipo', { partial }) && !['persona','proyecto'].includes(record.entidad_tipo)) {
      throw new Error('entidad_tipo debe ser persona o proyecto');
    }
    if (requiredWhenPresent(record, 'entidad_id', { partial }) && !String(record.entidad_id || '').trim()) {
      throw new Error('entidad_id es obligatorio');
    }
    if (requiredWhenPresent(record, 'capacidad', { partial }) && !String(record.capacidad || '').trim()) {
      throw new Error('capacidad es obligatoria');
    }
  }

  if (entity === 'necesidades') {
    if (requiredWhenPresent(record, 'entidad_tipo', { partial }) && !['persona','proyecto'].includes(record.entidad_tipo)) {
      throw new Error('entidad_tipo debe ser persona o proyecto');
    }
    if (requiredWhenPresent(record, 'entidad_id', { partial }) && !String(record.entidad_id || '').trim()) {
      throw new Error('entidad_id es obligatorio');
    }
    if (requiredWhenPresent(record, 'necesidad', { partial }) && !String(record.necesidad || '').trim()) {
      throw new Error('necesidad es obligatoria');
    }
  }

  return out;
}
