const STOP=new Set(['de','del','la','el','y','en','con','para','por','un','una','a','los','las']);

function norm(value=''){
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9+#. ]+/g,' ');
}

function words(value=''){
  return new Set(
    norm(value).split(/\s+/).filter(x=>x&&!STOP.has(x))
  );
}

function overlap(a,b){
  const A=words(a),B=words(b);
  let n=0;
  for(const x of A)if(B.has(x))n++;
  return n;
}

function scale7From100(score){
  const n=Math.max(0,Math.min(100,Number(score)||0));
  return Number((1+(n/100)*6).toFixed(1));
}

function keywordLevel(level=''){
  const n=norm(level);
  if(/principal|lead|senior|sr|experto|expert/.test(n))return 6.4;
  if(/semi|ssr|mid|intermedio/.test(n))return 5.4;
  if(/junior|jr|inicial/.test(n))return 3.6;
  return null;
}

export function computeMatchFactors(need,capability,overall100){
  const needText=[need.necesidad,need.categoria,need.detalle].filter(Boolean).join(' ');
  const capText=[capability.capacidad,capability.categoria,capability.evidencia].filter(Boolean).join(' ');

  const direct=overlap(needText,capText);
  const sameCategory=norm(need.categoria)&&norm(need.categoria)===norm(capability.categoria);
  const overall7=scale7From100(overall100);

  const conocimiento=Math.min(7,Math.max(1,1.8+direct*1.2+(sameCategory?1.2:0)));
  const experienciaSectorial=Math.min(7,Math.max(1,
    (sameCategory?5.7:3.6)+
    (capability.evidencia?0.8:0)+
    (capability.nivel?0.3:0)
  ));
  const afinidadProblema=Math.min(7,Math.max(1,1.6+overlap(need.necesidad||'',capability.capacidad||'')*1.35+overlap(need.detalle||'',capability.evidencia||'')*.7));
  const recursos=Math.min(7,Math.max(1,
    3.2+
    (capability.evidencia?1.0:0)+
    (capability.nivel?0.6:0)+
    (String(capability.capacidad||'').length>28?.4:0)
  ));

  const priority=norm(need.prioridad);
  const urgencia=
    /urgente|critica|critico/.test(priority)?6.8:
    /alta/.test(priority)?6.1:
    /baja/.test(priority)?3.0:4.5;

  const nivel=keywordLevel(capability.nivel);
  const capacidadEjecucion=Math.min(7,Math.max(1,
    nivel??(capability.evidencia?5.4:4.4)
  ));

  const complementariedad=Math.min(7,Math.max(1,
    overall7+
    (need.entidad_tipo!==capability.entidad_tipo ? 0.3 : 0)
  ));

  const round=n=>Number(n.toFixed(1));

  return {
    escala_general:overall7,
    conocimiento:round(conocimiento),
    experiencia_sectorial:round(experienciaSectorial),
    afinidad_problema:round(afinidadProblema),
    recursos:round(recursos),
    urgencia:round(urgencia),
    capacidad_ejecucion:round(capacidadEjecucion),
    complementariedad:round(complementariedad)
  };
}
