const STOP = new Set(['de','del','la','el','y','en','con','para','por','un','una','a','los','las']);
const ALIASES = {
  backend:['api','apis','node','servidor','base de datos','postgresql'],
  hardware:['electronica','electrónica','pcb','embedded','iot'],
  'diseño industrial':['industrial','prototipado','producto físico'],
  integracion:['integración','integrar','protocolos','webhooks','camaras','cámaras'],
  software:['desarrollo','programacion','programación','full stack','backend','frontend'],
  ventas:['comercial','business development','bd','ventas'],
  financiacion:['financiación','finanzas','inversión','inversion']
};

function norm(s='') { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9+#. ]+/g,' '); }
function tokens(s='') { return new Set(norm(s).split(/\s+/).filter(x => x && !STOP.has(x))); }
function overlap(a,b){ const A=tokens(a),B=tokens(b); let n=0; for(const x of A) if(B.has(x)) n++; return n; }

function expandedText(s='') {
  const base = norm(s); let out = base;
  for (const [k, vals] of Object.entries(ALIASES)) {
    const nk=norm(k);
    if (base.includes(nk) || vals.some(v=>base.includes(norm(v)))) out += ' ' + [k,...vals].join(' ');
  }
  return out;
}

export function scoreMatch(need, capability) {
  const a = expandedText(`${need.necesidad || ''} ${need.categoria || ''} ${need.detalle || ''}`);
  const b = expandedText(`${capability.capacidad || ''} ${capability.categoria || ''} ${capability.evidencia || ''}`);
  let score = 0;
  const direct = overlap(a,b);
  score += Math.min(60, direct * 20);
  if (norm(need.categoria) && norm(capability.categoria) && norm(need.categoria) === norm(capability.categoria)) score += 25;
  if (norm(a).includes(norm(capability.capacidad || '__none__'))) score += 15;
  return Math.min(100, score);
}

export function matchLight(score) {
  const n=Number(score)||0;
  if(n>=70) return 'verde';
  if(n>=35) return 'amarillo';
  return 'rojo';
}

export function buildMatches(needs, capabilities) {
  const result=[];
  for(const n of needs.filter(x=>!truthy(x.eliminado) && String(x.estado||'abierta').toLowerCase()!=='cubierta')) {
    for(const c of capabilities.filter(x=>!truthy(x.eliminado) && String(x.estado||'disponible').toLowerCase()!=='inactiva')) {
      if (n.entidad_tipo===c.entidad_tipo && n.entidad_id===c.entidad_id) continue;
      const score=scoreMatch(n,c);
      if(score<30) continue;
      result.push({need:n, capability:c, score, semaforo:matchLight(score), explanation:`${c.entidad_tipo} ${c.entidad_id} aporta “${c.capacidad}” para cubrir “${n.necesidad}”.`});
    }
  }
  return result.sort((a,b)=>b.score-a.score);
}

function truthy(v){ return v===true || ['true','1','sí','si'].includes(String(v).toLowerCase()); }
