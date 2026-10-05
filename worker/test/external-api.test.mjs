import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

test('OpenAPI de control externo se publica sin secretos y describe administración',async()=>{
  const req=new Request('https://worker.example/api/openapi.json');
  const res=await worker.fetch(req,{}, {waitUntil(){}});
  assert.equal(res.status,200);
  const spec=await res.json();
  assert.equal(spec.openapi,'3.1.0');
  assert.equal(spec.servers[0].url,'https://worker.example');
  assert.ok(spec.paths['/api/admin/schema']);
  assert.ok(spec.paths['/api/admin/snapshot']);
  assert.ok(spec.paths['/api/{entity}']);
  assert.ok(spec.paths['/api/{entity}/{id}']);
  assert.ok(spec.paths['/api/matches/recompute']);
  assert.equal(spec.components.securitySchemes.bearerAuth.scheme,'bearer');
  assert.equal(JSON.stringify(spec).includes('MESA_ADMIN_TOKEN'),true);
  assert.equal(JSON.stringify(spec).includes('Bearer ey'),false);
});
