import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isOriginAllowed,
  applySecurityHeaders,
  preflightResponse,
  guardRequest,
  bounded,
  constantTimeEqual,
  readJsonLimited
} from '../src/security.js';

class RateDB {
  constructor(){ this.rows=new Map(); }
  prepare(sql){
    const db=this;
    const text=String(sql).replace(/\s+/g,' ').trim();
    return {
      args:[],
      bind(...args){ this.args=args; return this; },
      async run(){
        if(/^CREATE TABLE/i.test(text)) return {success:true};
        if(/^DELETE FROM mesa_v2_rate_limits WHERE expires_at<\?/i.test(text)){
          const [now]=this.args;
          for(const [k,v] of db.rows) if(Number(v.expires_at)<Number(now)) db.rows.delete(k);
          return {success:true};
        }
        if(/^INSERT INTO mesa_v2_rate_limits/i.test(text)){
          const [key,count,expires_at]=this.args;
          db.rows.set(String(key),{count:Number(count),expires_at:Number(expires_at)});
          return {success:true};
        }
        if(/^UPDATE mesa_v2_rate_limits SET count=\?,expires_at=\? WHERE key=\?/i.test(text)){
          const [count,expires_at,key]=this.args;
          db.rows.set(String(key),{count:Number(count),expires_at:Number(expires_at)});
          return {success:true};
        }
        throw new Error('SQL no soportado: '+text);
      },
      async first(){
        if(/^SELECT count,expires_at FROM mesa_v2_rate_limits WHERE key=\?/i.test(text)){
          const [key]=this.args;
          return db.rows.get(String(key))||null;
        }
        throw new Error('SQL first no soportado: '+text);
      }
    };
  }
}

test('CORS solo acepta orígenes permitidos y mismo origen',()=>{
  const env={ALLOWED_ORIGINS:'https://mesa.example'};
  assert.equal(isOriginAllowed(env,new Request('https://worker.test/api/health',{headers:{origin:'https://mesa.example'}})),true);
  assert.equal(isOriginAllowed(env,new Request('https://worker.test/api/health',{headers:{origin:'https://evil.example'}})),false);
  assert.equal(isOriginAllowed(env,new Request('https://worker.test/api/health',{headers:{origin:'https://worker.test'}})),true);
});

test('preflight bloquea origen ajeno',()=>{
  const env={ALLOWED_ORIGINS:'https://mesa.example'};
  const req=new Request('https://worker.test/api/self/persona',{
    method:'OPTIONS',
    headers:{origin:'https://evil.example'}
  });
  const res=preflightResponse(env,req);
  assert.equal(res.status,403);
});

test('headers endurecen HTML y API',()=>{
  const env={ALLOWED_ORIGINS:'https://worker.test'};
  const req=new Request('https://worker.test/api/health');
  const res=applySecurityHeaders(new Response('{}',{headers:{'content-type':'application/json'}}),req,env,'req-1');
  assert.equal(res.headers.get('x-frame-options'),'DENY');
  assert.equal(res.headers.get('x-content-type-options'),'nosniff');
  assert.equal(res.headers.get('referrer-policy'),'no-referrer');
  assert.match(res.headers.get('content-security-policy')||'',/frame-ancestors 'none'/);
  assert.equal(res.headers.get('cache-control'),'no-store');
  assert.equal(res.headers.get('x-request-id'),'req-1');
});

test('guard bloquea origen de escritura, método extraño y payload enorme',async()=>{
  const env={ALLOWED_ORIGINS:'https://mesa.example',SECURITY_RATE_LIMIT_ENABLED:'false'};

  let req=new Request('https://worker.test/api/self/persona',{
    method:'POST',
    headers:{origin:'https://evil.example'}
  });
  let res=await guardRequest(env,req,'/api/self/persona');
  assert.equal(res.status,403);

  req=new Request('https://worker.test/api/health',{method:'TRACE'});
  res=await guardRequest(env,req,'/api/health');
  assert.equal(res.status,405);

  req=new Request('https://worker.test/api/self/persona',{
    method:'POST',
    headers:{'content-length':String(70*1024)}
  });
  res=await guardRequest(env,req,'/api/self/persona');
  assert.equal(res.status,413);
});

test('rate limit corta ráfagas de autocarga',async()=>{
  const env={
    DB:new RateDB(),
    ALLOWED_ORIGINS:'https://worker.test',
    SECURITY_RATE_LIMIT_ENABLED:'true',
    PUBLIC_WRITE_LIMIT:'2'
  };
  const make=()=>new Request('https://worker.test/api/self/persona',{
    method:'POST',
    headers:{
      'cf-connecting-ip':'203.0.113.5',
      'user-agent':'security-test'
    }
  });

  assert.equal(await guardRequest(env,make(),'/api/self/persona'),null);
  assert.equal(await guardRequest(env,make(),'/api/self/persona'),null);
  const blocked=await guardRequest(env,make(),'/api/self/persona');
  assert.equal(blocked.status,429);
  assert.ok(Number(blocked.headers.get('retry-after'))>0);
});

test('entrada limitada, comparación segura y JSON acotado',async()=>{
  assert.equal(bounded('  abc\u0000def  ',6),'abcdef');
  assert.equal(constantTimeEqual('secreto-largo','secreto-largo'),true);
  assert.equal(constantTimeEqual('secreto-largo','otro-secreto'),false);

  await assert.rejects(
    ()=>readJsonLimited(new Request('https://worker.test',{method:'POST',body:'{' }),1024),
    err=>err.status===400
  );
});
