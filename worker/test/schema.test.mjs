import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRecord } from '../src/schema.js';

test('partial capability update can change only estado', ()=>{
  assert.deepEqual(
    validateRecord('capacidades',{estado:'Disponible'},{partial:true}),
    {estado:'Disponible'}
  );
});

test('partial need update can change only prioridad', ()=>{
  assert.deepEqual(
    validateRecord('necesidades',{prioridad:'Alta'},{partial:true}),
    {prioridad:'Alta'}
  );
});

test('full capability creation still requires identity and capability', ()=>{
  assert.throws(
    ()=>validateRecord('capacidades',{estado:'Disponible'}),
    /entidad_tipo/
  );
});
