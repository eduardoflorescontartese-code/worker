import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicApi } from '../src/public.js';

function fixture(){
  const records={
    personas:[{
      id:'P-0001', nombre_completo:'Persona Confirmada', profesion:'Ingeniería',
      especialidad:'Backend', puede_aportar:'Node.js', busca:'Colaboraciones',
      email:'privado@example.com', self_edit_hash:'NO_PUBLICAR'
    }],
    proyectos:[
      {id:'PR-0001', nombre:'Proyecto con responsable', creador_id:'P-0001', etapa:'MVP'},
      {id:'PR-0002', nombre:'Proyecto previo sin autor', creador_id:'P-9999', etapa:'Idea'}
    ],
    necesidades:[], capacidades:[], matches:[], equipos:[]
  };
  return createPublicApi({
    listEntity:async (_env,entity)=>records[entity]||[],
    json:data=>data
  });
}

test('El proyecto muestra solo autoría verificable y conserva proyectos sin autor',async()=>{
  const api=fixture();
  const snapshot=await api.dashboard({});
  assert.equal(snapshot.counts.personas,1);
  assert.equal(snapshot.counts.proyectos,2);
  assert.equal(snapshot.proyectos[0].autor_nombre,'Persona Confirmada');
  assert.equal(snapshot.proyectos[0].creador.id,'P-0001');
  assert.equal(snapshot.proyectos[0].autor_verificado,true);
  assert.equal(snapshot.proyectos[1].autor_verificado,false);
  assert.equal(snapshot.proyectos[1].creador,null);
  assert.equal(snapshot.proyectos[1].autor_nombre,'Responsable pendiente de identificar');
});

test('Nunca publica email ni token de edición en fichas o búsquedas',async()=>{
  const api=fixture();
  const snapshot=JSON.stringify(await api.dashboard({}));
  assert.ok(!snapshot.includes('privado@example.com'));
  assert.ok(!snapshot.includes('NO_PUBLICAR'));
  const found=JSON.stringify(await api.search({},'Persona Confirmada'));
  assert.ok(!found.includes('privado@example.com'));
  assert.ok(!found.includes('NO_PUBLICAR'));
});

test('Es posible encontrar un proyecto por el nombre público de su autora',async()=>{
  const api=fixture();
  const found=await api.search({},'Persona Confirmada');
  assert.ok(found.results.some(x=>x.entity==='proyectos'&&x.id==='PR-0001'));
  assert.equal(found.results.find(x=>x.id==='PR-0001').row.autor_nombre,'Persona Confirmada');
});
