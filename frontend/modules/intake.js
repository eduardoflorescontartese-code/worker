export function createIntake({$, $$, api, hashParams, loadDashboard}){
  const TOKEN_KEY='mesa_self_edit_token';
  const PERSON_KEY='mesa_self_person_id';

  const randomToken=()=>{
    const a=new Uint8Array(32);
    crypto.getRandomValues(a);
    return btoa(String.fromCharCode(...a))
      .replace(/\+/g,'-')
      .replace(/\//g,'_')
      .replace(/=+$/,'');
  };

  function participantToken(){
    const hp=hashParams();
    if(hp.edit)return hp.edit;
    let token=localStorage.getItem(TOKEN_KEY)||'';
    if(!token){
      token=randomToken();
      localStorage.setItem(TOKEN_KEY,token);
    }
    return token;
  }

  function participantId(){
    return localStorage.getItem(PERSON_KEY)||'';
  }

  function open(){
    $('#intakeModal').hidden=false;
    document.body.style.overflow='hidden';
    setTimeout(()=>$('#name')?.focus(),50);
  }

  function close(){
    $('#intakeModal').hidden=true;
    document.body.style.overflow='';
  }

  function bindButtons(){
    $$('.open-intake').forEach(button=>{button.onclick=open});
  }

  function init(){
    bindButtons();
    $$('[data-close-modal]').forEach(x=>x.addEventListener('click',close));

    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&!$('#intakeModal').hidden)close();
    });

    $('#selfForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const status=$('#formStatus');
      status.textContent='Guardando…';

      try{
        const token=participantToken();
        const result=await api.selfSave({
          participant_id:participantId(),
          nombre_completo:$('#name').value.trim(),
          profesion:$('#profession').value.trim(),
          especialidad:$('#specialty').value.trim(),
          proyecto:$('#project').value.trim(),
          etapa:$('#stage').value.trim(),
          sector:$('#sector').value.trim(),
          descripcion_proyecto:$('#projectDescription').value.trim(),
          busca:$('#needs').value.trim(),
          puede_aportar:$('#contribute').value.trim(),
          edit_token:token,
          website:$('#website')?.value||''
        });

        if(result?.persona?.id){
          localStorage.setItem(PERSON_KEY,String(result.persona.id));
          localStorage.setItem(TOKEN_KEY,token);
        }

        status.textContent='Listo. Tu información quedó guardada en MESA.';
        await loadDashboard();
        setTimeout(close,900);
      }catch(err){
        status.textContent='No se pudo guardar: '+err.message;
      }
    });
  }

  return {init,open,close,bindButtons};
}
