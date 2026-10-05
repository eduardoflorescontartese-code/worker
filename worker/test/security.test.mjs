import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

test('health endpoint remains public', async()=>{
  const req = new Request('https://mesa.example/api/health');
  const res = await worker.fetch(req, {});
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
});

test('private data endpoints reject requests without admin token', async()=>{
  const req = new Request('https://mesa.example/api/personas');
  const res = await worker.fetch(req, { MESA_ADMIN_TOKEN:'secret' });
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error, 'No autorizado');
});

test('search is private too', async()=>{
  const req = new Request('https://mesa.example/api/search?q=backend');
  const res = await worker.fetch(req, { MESA_ADMIN_TOKEN:'secret' });
  assert.equal(res.status, 401);
});
