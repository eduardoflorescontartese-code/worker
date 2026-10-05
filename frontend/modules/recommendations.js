export function createRecommendations({$, esc, getDashboard, onSelectMatch}){
  const clamp=n=>Math.max(0,Math.min(100,Number(n)||0));
  const groups=[
    {label:'Conectar ahora',color:'green',icon:'◉',min:70,max:101,action:'Ver conexión',note:'Encaje alto según las señales disponibles.'},
    {label:'Invitar a reunión',color:'blue',icon:'▣',min:55,max:70,action:'Revisar candidato',note:'Buen potencial; conviene validar objetivos en conversación.'},
    {label:'Pedir más datos',color:'orange',icon:'?',min:40,max:55,action:'Revisar información',note:'Hay complementariedad, pero faltan señales para priorizar.'},
    {label:'Seguimiento',color:'purple',icon:'⌕',min:30,max:40,action:'Mantener visible',note:'Puede ganar relevancia cuando aparezca nueva información.'},
    {label:'No prioritario',color:'red',icon:'×',min:0,max:30,action:'Revisar después',note:'Encaje bajo con la información actualmente disponible.'}
  ];
  let grouped=[];

  function render(){
    const d=getDashboard();
    const all=d.matches||[];
    const c=d.counts||{};

    $('#sideMatches').textContent=c.matches||0;
    $('#sideFollow').textContent=all.filter(m=>['contactado','conversando','seguimiento'].includes(String(m.estado||'').toLowerCase())).length;
    $('#sideTeams').textContent=c.equipos||0;

    grouped=groups.map(def=>({
      def,
      items:all.filter(m=>{
        const s=clamp(m.puntuacion);
        return s>=def.min&&s<def.max;
      }).sort((a,b)=>clamp(b.puntuacion)-clamp(a.puntuacion))
    }));

    $('#recommendationList').innerHTML=grouped.map((g,index)=>{
      const best=g.items[0];
      const score=best?clamp(best.puntuacion):null;
      const title=best
        ? [best.persona?.nombre_completo,best.proyecto?.nombre].filter(Boolean).join(' ↔ ')
        : 'Sin coincidencias en este nivel';
      return '<section class="recommendation-card '+g.def.color+'">'+
        '<div class="rec-head"><div class="rec-icon">'+g.def.icon+'</div><div><strong>'+g.def.label+'</strong><small>'+esc(title)+'</small></div><span class="rec-score">'+(score===null?'—':score+'%')+'</span></div>'+
        '<button class="rec-action" data-rec-group="'+index+'" '+(best?'':'disabled')+'>'+g.def.action+(g.items.length?' · '+g.items.length:'')+'</button>'+
        '<div class="rec-note">'+g.def.note+'</div></section>';
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
