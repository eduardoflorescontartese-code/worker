import test from 'node:test';
import assert from 'node:assert/strict';
import { matchDecisionMode } from '../src/index.js';

test('confirming an already confirmed match is idempotent',()=>{
  assert.equal(matchDecisionMode('confirmado','confirm'),'IDEMPOTENT');
});

test('discarding an already discarded match is idempotent',()=>{
  assert.equal(matchDecisionMode('descartado','dismiss'),'IDEMPOTENT');
});

test('cannot reverse a final match decision by accident',()=>{
  assert.equal(matchDecisionMode('confirmado','dismiss'),'CONFLICT');
  assert.equal(matchDecisionMode('descartado','confirm'),'CONFLICT');
});

test('a suggested match can still be decided',()=>{
  assert.equal(matchDecisionMode('sugerido','confirm'),'APPLY');
  assert.equal(matchDecisionMode('sugerido','dismiss'),'APPLY');
});
