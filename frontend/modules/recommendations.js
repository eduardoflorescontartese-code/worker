export function createRecommendations({$, esc, getDashboard, onSelectMatch}){
  const clamp100=n=>Math.max(0,Math.min(100,Number(n)||0));
  const scale7=m=>{
    const direct=Number(m?.escala_general);
    if(direct>0)return Number(direct.toFixed(1));
    return Number((1+(clamp100(m?.puntuacion)/100)*6).toFixed(1));
  };

  const groups=[
    {
      label:'Conectar ahora',
      color:'green',
      icon:'♙',
      min:5.8,max:7.1,
      action:'Conectar ahora',
      subtitle:'Alto encaje y oportunidad concreta.',
      bullets:['Intereses muy alineados','Puede aportar valor inmediato','Ambos con disponibilidad']
    },
    {
      label:'Invitar a reunión',
      color:'blue',
      icon:'▣',
      min:5,max:5.8,
      action:'Invitar a reunión',
      subtitle:'Buen encaje con potencial.',
      bullets:['Complementariedad clara','Vale la pena profundizar','Verificar plazos y condiciones']
    },
    {
      label:'Pedir más datos',
      color:'orange',
      icon:'▤',
      min:4,max:5,
      action:'Solicitar más datos',
      subtitle:'Encaje medio, faltan datos clave.',
      bullets:['Faltan detalles de recursos','Alinear expectativas','Consultar disponibilidad']
    },
    {
      label:'Seguimiento',
      color:'purple',
      icon:'◷',
      min:3,max:4,
      action:'Agregar a seguimiento',
      subtitle:'Interesante para el futuro.',
      bullets:['Buen potencial a mediano plazo','Notificar si hay novedades','Revisar en 1-2 meses']
    },
    {
      label:'No prioritario',
      color:'red',
      icon:'⊘',
      min:1,max:3,
      action:'Marcar como no prioritario',
      subtitle:'Bajo encaje en este momento.',
      bullets:['Objetivos poco alineados','Diferencias en tiempos o foco','Mantener en radar general']
    }
  ];

  let grouped=[];

  function render(){
    const d=getDashboard();
    const all=d.matches||[];
    const c=d.counts||{};

    $('#sideMatches').textContent=c.matches||0;
    $('#sideFollow').textContent=all.filter(m=>
      ['contactado','conversando','seguimiento'].includes(String(m.estado||'').toLowerCase())
    ).length;
    $('#sideTeams').textContent=c.equipos||0;

    const badge=$('#notificationBadge');
    if(badge){
      const n=Number(c.matches||0);
      badge.textContent=n>99?'99+':String(n);
      badge.hidden=n===0;
    }

    grouped=groups.map(def=>({
      def,
      items:all.filter(m=>{
        const s=scale7(m);
        return s>=def.min&&s<def.max;
      }).sort((a,b)=>scale7(b)-scale7(a))
    }));

    $('#recommendationList').innerHTML=grouped.map((g,index)=>{
      const best=g.items[0];
      const score=best?scale7(best):null;

      return '<section class="recommendation-card '+g.def.color+'">'+
        '<div class="rec-head">'+
          '<div class="rec-icon">'+g.def.icon+'</div>'+
          '<div><strong>'+g.def.label+'</strong><small>'+g.def.subtitle+'</small></div>'+
          '<span class="rec-score">'+(score===null?'—':score.toFixed(1))+'</span>'+
        '</div>'+
        '<button class="rec-action" data-rec-group="'+index+'" '+(best?'':'disabled')+'>'+
          g.def.action+
        '</button>'+
        '<div class="rec-bullets">'+g.def.bullets.map(x=>'<div>✓ '+esc(x)+'</div>').join('')+'</div>'+
      '</section>';
    }).join('');
  }

  function init(){
    $('#recommendationList').addEventListener('click',e=>{
      const button=e.target.closest('[data-rec-group]');
      if(!button)return;
      const group=grouped[Number(button.dataset.recGroup)];
      const match=group?.items?.[0];
      if(match)onSelectMatch(match);
    });
  }

  return {init,render};
}
