import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreMatch, buildMatches } from '../src/matching.js';

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
