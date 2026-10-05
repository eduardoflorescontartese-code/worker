const cfg = window.MESA_CONFIG || {};
const base = (cfg.apiBaseUrl || '').replace(/\/$/,'');
function token(){ return sessionStorage.getItem('mesa_admin_token') || ''; }
async function call(path, init={}){
  const headers=new Headers(init.headers||{}); const t=token(); if(t) headers.set('authorization',`Bearer ${t}`); if(init.body && !(init.body instanceof FormData)) headers.set('content-type','application/json');
  const res=await fetch(base+path,{...init,headers}); const text=await res.text(); let data; try{data=JSON.parse(text)}catch{data={raw:text}}; if(!res.ok) throw new Error(data.error||`HTTP ${res.status}`); return data;
}
export const api={
  setToken(v){ sessionStorage.setItem('mesa_admin_token',v); },
  clearToken(){ sessionStorage.removeItem('mesa_admin_token'); },
  health:()=>call('/api/health'),
  list:e=>call(`/api/${e}`), get:(e,id)=>call(`/api/${e}/${encodeURIComponent(id)}`),
  create:(e,data)=>call(`/api/${e}`,{method:'POST',body:JSON.stringify(data)}),
  update:(e,id,data)=>call(`/api/${e}/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(data)}),
  remove:(e,id)=>call(`/api/${e}/${encodeURIComponent(id)}`,{method:'DELETE'}),
  search:q=>call(`/api/search?q=${encodeURIComponent(q)}`),
  recompute:()=>call('/api/matches/recompute',{method:'POST'}),
  bootstrap:()=>call('/api/admin/bootstrap',{method:'POST'}),
  selfSave:data=>call('/api/self/persona',{method:'POST',body:JSON.stringify(data)}),
  uploadDocument:form=>call('/api/documentos/upload',{method:'POST',body:form})
};
