import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreMatch, buildMatches, matchLight } from '../src/matching.js';

test('hardware need matches electronics/PCB capability',()=>{
  const s=scoreMatch({necesidad:'hardware PCB',categoria:'Electrónica'},{capacidad:'Ingeniería electrónica y PCB',categoria:'Electrónica'});
  assert.ok(s>=45);
});

test('does not match an entity against itself',()=>{
  const needs=[{id:'N-1',entidad_tipo:'persona',entidad_id:'P-1',necesidad:'backend',estado:'Abierta'}];
  const caps=[{id:'C-1',entidad_tipo:'persona',entidad_id:'P-1',capacidad:'backend',estado:'Disponible'}];
  assert.equal(buildMatches(needs,caps).length,0);
});

test('backend need can match software capability',()=>{
  const out=buildMatches([{id:'N-1',entidad_tipo:'proyecto',entidad_id:'PR-1',necesidad:'backend APIs',categoria:'Software',estado:'Abierta'}],[{id:'C-1',entidad_tipo:'persona',entidad_id:'P-2',capacidad:'Node APIs PostgreSQL',categoria:'Software',estado:'Disponible'}]);
  assert.ok(out.length>0);
});


test('traffic light thresholds are stable',()=>{
  assert.equal(matchLight(80),'verde');
  assert.equal(matchLight(50),'amarillo');
  assert.equal(matchLight(10),'rojo');
});

test('generated matches include a traffic light',()=>{
  const out=buildMatches(
    [{id:'N-2',entidad_tipo:'proyecto',entidad_id:'PR-2',necesidad:'hardware PCB electrónica',categoria:'Electrónica',estado:'Abierta'}],
    [{id:'C-2',entidad_tipo:'persona',entidad_id:'P-9',capacidad:'Ingeniería electrónica PCB hardware',categoria:'Electrónica',estado:'Disponible'}]
  );
  assert.ok(out.length>0);
  assert.ok(['verde','amarillo','rojo'].includes(out[0].semaforo));
});
