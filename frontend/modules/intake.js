export function createIntake({$, $$, api, hashParams, loadDashboard}){
  const randomToken=()=>{
    const a=new Uint8Array(32);
    crypto.getRandomValues(a);
    return btoa(String.fromCharCode(...a))
      .replace(/\+/g,'-')
      .replace(/\//g,'_')
      .replace(/=+$/,'');
  };

  const localKey=email=>'mesa_edit_'+String(email||'').trim().toLowerCase();

  function participantToken(email){
    const hp=hashParams();
    if(hp.edit)return hp.edit;
    let token=localStorage.getItem(localKey(email))||'';
    if(!token){
      token=randomToken();
      localStorage.setItem(localKey(email),token);
    }
    return token;
  }

  function open(){
    $('#intakeModal').hidden=false;
    document.body.style.overflow='hidden';
    const hp=hashParams();
    if(hp.email){
      $('#email').value=hp.email;
      $('#email').readOnly=true;
    }
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
      const email=$('#email').value.trim();
      status.textContent='Guardando…';

      try{
        const token=participantToken(email);
        await api.selfSave({
          nombre_completo:$('#name').value.trim(),
          email,
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

        localStorage.setItem(localKey(email),token);
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
