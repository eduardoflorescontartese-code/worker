import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { ENTITY_CONFIG } from '../src/schema.js';

function memoryGoogle(){
  const sheets=Object.fromEntries(Object.values(ENTITY_CONFIG).map(cfg=>[cfg.sheet,[cfg.headers.slice()]]));
  const original=globalThis.fetch;

  globalThis.fetch=async (input,init={})=>{
    const url=String(input);
    if(url==='https://oauth2.googleapis.com/token'){
      return new Response(JSON.stringify({access_token:'test-token',expires_in:3600}),{status:200,headers:{'content-type':'application/json'}});
    }
    const u=new URL(url);
    if(!u.hostname.includes('sheets.googleapis.com')) return original(input,init);
    if(u.pathname.includes(':batchUpdate')) return new Response(JSON.stringify({}),{status:200,headers:{'content-type':'application/json'}});

    const marker='/values/';
    const at=u.pathname.indexOf(marker);
    if(at<0) return new Response(JSON.stringify({sheets:Object.keys(sheets).map(title=>({properties:{title}}))}),{status:200,headers:{'content-type':'application/json'}});
    let range=decodeURIComponent(u.pathname.slice(at+marker.length));
    const append=range.endsWith(':append');
    if(append) range=range.slice(0,-7);
    const sheet=range.split('!')[0];
    const rows=sheets[sheet];
    if(!rows) return new Response(JSON.stringify({error:'sheet not found'}),{status:404});

    if((init.method||'GET')==='GET'){
      return new Response(JSON.stringify({range,majorDimension:'ROWS',values:rows}),{status:200,headers:{'content-type':'application/json'}});
    }
    const body=JSON.parse(init.body||'{}');
    if(append){
      rows.push(...(body.values||[]).map(x=>x.slice()));
      return new Response(JSON.stringify({updates:{updatedRows:(body.values||[]).length}}),{status:200,headers:{'content-type':'application/json'}});
    }
    if((init.method||'GET')==='PUT'){
      const m=range.match(/!A(\d+):[A-Z]+(\d+)$/);
      if(m) rows[Number(m[1])-1]=(body.values?.[0]||[]).slice();
      else if(range.endsWith('!A1')) rows[0]=(body.values?.[0]||[]).slice();
      return new Response(JSON.stringify({updatedRange:range}),{status:200,headers:{'content-type':'application/json'}});
    }
    return new Response(JSON.stringify({}),{status:200,headers:{'content-type':'application/json'}});
  };
  return {sheets,restore:()=>{globalThis.fetch=original}};
}

const env={
  MESA_ADMIN_TOKEN:'secret',
  GOOGLE_CLIENT_ID:'client',
  GOOGLE_CLIENT_SECRET:'client-secret',
  GOOGLE_REFRESH_TOKEN:'refresh',
  GOOGLE_SPREADSHEET_ID:'sheet',
  GOOGLE_DRIVE_FOLDER_ID:'drive',
  ALLOWED_ORIGIN:'*'
};
const headers={authorization:'Bearer secret','content-type':'application/json'};
async function call(path,{method='GET',body}={}){
  const res=await worker.fetch(new Request('https://mesa.example'+path,{method,headers,body:body?JSON.stringify(body):undefined}),env);
  const data=await res.json();
  assert.ok(res.ok,JSON.stringify(data));
  return data;
}

test('operational flow: person -> need -> match -> team -> pending -> audit',async()=>{
  const g=memoryGoogle();
  try{
    const person=await call('/api/personas',{method:'POST',body:{nombre_completo:'Ana Técnica',profesion:'Ingeniería',especialidad:'Backend',estado:'Activa'}});
    const project=await call('/api/proyectos',{method:'POST',body:{nombre:'Proyecto Uno',sector:'Tecnología',etapa:'MVP',estado:'Activo'}});
    const capability=await call('/api/capacidades',{method:'POST',body:{entidad_tipo:'persona',entidad_id:person.id,capacidad:'Node APIs PostgreSQL',categoria:'Software',nivel:'Senior',estado:'Disponible'}});
    const need=await call('/api/necesidades',{method:'POST',body:{entidad_tipo:'proyecto',entidad_id:project.id,necesidad:'backend APIs',categoria:'Software',prioridad:'Alta',estado:'Abierta'}});
    assert.ok(capability.id&&need.id);

    const recompute=await call('/api/matches/recompute',{method:'POST'});
    assert.equal(recompute.created,1);
    const matches=await call('/api/matches');
    assert.equal(matches.length,1);
    assert.equal(matches[0].persona_id,person.id);
    assert.equal(matches[0].proyecto_id,project.id);

    const first=await call('/api/matches/'+matches[0].id+'/decision',{method:'POST',body:{decision:'confirm'}});
    assert.equal(first.match.estado,'confirmado');
    assert.ok(first.team.id);

    const second=await call('/api/matches/'+matches[0].id+'/decision',{method:'POST',body:{decision:'confirm'}});
    assert.equal(second.idempotent,true);

    const teams=await call('/api/equipos');
    assert.equal(teams.length,1);
    assert.deepEqual(JSON.parse(teams[0].integrantes),[person.id]);
    assert.equal(JSON.parse(teams[0].capacidades_cubiertas).length,1);

    const pending=await call('/api/pendientes',{method:'POST',body:{entidad_tipo:'proyecto',entidad_id:project.id,pendiente:'Preparar integración',prioridad:'Alta',estado:'abierto',responsable_id:person.id}});
    await call('/api/pendientes/'+pending.id,{method:'PUT',body:{estado:'completado',origen_informacion:'operación MESA'}});

    const graph=await call('/api/graph');
    assert.equal(graph.data.equipos.length,1);
    assert.equal(graph.data.pendientes.find(x=>x.id===pending.id).estado,'completado');
    assert.ok(graph.data.auditoria.some(x=>x.entidad==='matches'&&x.accion==='confirmar'));
    assert.ok(graph.data.auditoria.some(x=>x.entidad==='pendientes'&&x.accion==='editar'));
  }finally{
    g.restore();
  }
});
