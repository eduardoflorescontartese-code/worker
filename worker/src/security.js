const WRITE_METHODS=new Set(['POST','PUT','DELETE']);
const DEFAULT_PUBLIC_WRITE_LIMIT=8;
const DEFAULT_ADMIN_WRITE_LIMIT=30;
const WINDOW_MS=10*60*1000;

const enc=new TextEncoder();

function originList(env,req){
  const self=new URL(req.url).origin;
  const configured=String(env.ALLOWED_ORIGINS||env.ALLOWED_ORIGIN||'')
    .split(',')
    .map(x=>x.trim())
    .filter(Boolean)
    .filter(x=>x!=='*');
  return new Set([self,...configured]);
}

export function isOriginAllowed(env,req){
  const origin=req.headers.get('origin');
  if(!origin)return true;
  return originList(env,req).has(origin);
}

export function corsHeaders(env,req){
  const origin=req.headers.get('origin');
  if(!origin||!isOriginAllowed(env,req))return {};
  return {
    'access-control-allow-origin':origin,
    'access-control-allow-headers':'authorization,content-type,x-requested-with',
    'access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-max-age':'86400',
    'vary':'Origin'
  };
}

export function requestId(req){
  return req.headers.get('cf-ray')||crypto.randomUUID();
}

export function applySecurityHeaders(response,req,env,id=requestId(req)){
  const out=new Response(response.body,response);
  const path=new URL(req.url).pathname;

  out.headers.set('x-content-type-options','nosniff');
  out.headers.set('x-frame-options','DENY');
  out.headers.set('referrer-policy','no-referrer');
  out.headers.set('permissions-policy','camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  out.headers.set('strict-transport-security','max-age=31536000; includeSubDomains');
  out.headers.set('content-security-policy',[
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ].join('; '));
  out.headers.set('cross-origin-opener-policy','same-origin');
  out.headers.set('cross-origin-resource-policy','same-origin');
  out.headers.set('x-permitted-cross-domain-policies','none');
  out.headers.set('x-request-id',id);

  for(const [k,v] of Object.entries(corsHeaders(env,req)))out.headers.set(k,v);

  if(path.startsWith('/api/')){
    out.headers.set('cache-control','no-store');
    out.headers.set('pragma','no-cache');
  }

  return out;
}

export function preflightResponse(env,req){
  if(req.method!=='OPTIONS')return null;
  if(!isOriginAllowed(env,req)){
    return applySecurityHeaders(
      new Response(null,{status:403}),
      req,
      env
    );
  }
  return applySecurityHeaders(
    new Response(null,{status:204,headers:corsHeaders(env,req)}),
    req,
    env
  );
}

function intEnv(value,fallback){
  const n=Number(value);
  return Number.isFinite(n)&&n>0?Math.floor(n):fallback;
}

async function sha256(value){
  const buf=await crypto.subtle.digest('SHA-256',enc.encode(String(value)));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function ensureRateTable(env){
  if(!env.DB)throw new Error('D1 no disponible para rate limiting');
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS mesa_v2_rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`).run();
}

async function rateLimit(env,req,scope,limit){
  if(String(env.SECURITY_RATE_LIMIT_ENABLED||'true').toLowerCase()==='false'){
    return {allowed:true,remaining:limit};
  }

  await ensureRateTable(env);
  const now=Date.now();
  const ip=req.headers.get('cf-connecting-ip')||'unknown';
  const ua=req.headers.get('user-agent')||'';
  const bucket=Math.floor(now/WINDOW_MS);
  const identity=await sha256(ip+'|'+ua.slice(0,160));
  const key=scope+'|'+bucket+'|'+identity;
  const expiresAt=(bucket+1)*WINDOW_MS;

  await env.DB.prepare(
    'DELETE FROM mesa_v2_rate_limits WHERE expires_at<?'
  ).bind(now).run();

  const current=await env.DB.prepare(
    'SELECT count,expires_at FROM mesa_v2_rate_limits WHERE key=?'
  ).bind(key).first();

  if(!current){
    await env.DB.prepare(
      'INSERT INTO mesa_v2_rate_limits(key,count,expires_at) VALUES(?,?,?)'
    ).bind(key,1,expiresAt).run();
    return {allowed:true,remaining:Math.max(0,limit-1)};
  }

  const next=Number(current.count||0)+1;
  await env.DB.prepare(
    'UPDATE mesa_v2_rate_limits SET count=?,expires_at=? WHERE key=?'
  ).bind(next,expiresAt,key).run();

  if(next>limit){
    return {allowed:false,retryAfter:Math.max(1,Math.ceil((Number(current.expires_at||expiresAt)-now)/1000))};
  }
  return {allowed:true,remaining:Math.max(0,limit-next)};
}

export async function guardRequest(env,req,path){
  const allowedMethods=new Set(['GET','HEAD','POST','PUT','DELETE','OPTIONS']);
  if(!allowedMethods.has(req.method)){
    return new Response(JSON.stringify({error:'Método no permitido'}),{
      status:405,
      headers:{'content-type':'application/json; charset=utf-8'}
    });
  }

  if(WRITE_METHODS.has(req.method)&&req.headers.get('origin')&&!isOriginAllowed(env,req)){
    return new Response(JSON.stringify({error:'Origen no permitido'}),{
      status:403,
      headers:{'content-type':'application/json; charset=utf-8'}
    });
  }

  const contentLength=Number(req.headers.get('content-length')||0);
  const maxBytes=path==='/api/documentos/upload' ? 10*1024*1024 : 64*1024;
  if(contentLength>maxBytes){
    return new Response(JSON.stringify({error:'Solicitud demasiado grande'}),{
      status:413,
      headers:{'content-type':'application/json; charset=utf-8'}
    });
  }

  if(path==='/api/self/persona'&&req.method==='POST'){
    const result=await rateLimit(
      env,
      req,
      'self-persona',
      intEnv(env.PUBLIC_WRITE_LIMIT,DEFAULT_PUBLIC_WRITE_LIMIT)
    );
    if(!result.allowed){
      return new Response(JSON.stringify({error:'Demasiados intentos. Probá nuevamente más tarde.'}),{
        status:429,
        headers:{
          'content-type':'application/json; charset=utf-8',
          'retry-after':String(result.retryAfter||60)
        }
      });
    }
  }

  if(
    WRITE_METHODS.has(req.method)&&
    (
      path.startsWith('/api/admin/')||
      path.startsWith('/api/matches/')||
      path.startsWith('/api/documentos/')
    )
  ){
    const result=await rateLimit(
      env,
      req,
      'admin-write',
      intEnv(env.ADMIN_WRITE_LIMIT,DEFAULT_ADMIN_WRITE_LIMIT)
    );
    if(!result.allowed){
      return new Response(JSON.stringify({error:'Demasiados intentos.'}),{
        status:429,
        headers:{
          'content-type':'application/json; charset=utf-8',
          'retry-after':String(result.retryAfter||60)
        }
      });
    }
  }

  return null;
}

export async function readJsonLimited(req,maxBytes=64*1024){
  const text=await req.text();
  if(enc.encode(text).byteLength>maxBytes){
    const error=new Error('Solicitud demasiado grande');
    error.status=413;
    throw error;
  }
  if(!text.trim())return {};
  try{
    return JSON.parse(text);
  }catch{
    const error=new Error('JSON inválido');
    error.status=400;
    throw error;
  }
}

export function bounded(value,max,{trim=true}={}){
  let s=String(value??'');
  if(trim)s=s.trim();
  s=s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'');
  if(s.length>max)s=s.slice(0,max);
  return s;
}

export function constantTimeEqual(a,b){
  const A=enc.encode(String(a||''));
  const B=enc.encode(String(b||''));
  if(A.length!==B.length)return false;
  let diff=0;
  for(let i=0;i<A.length;i++)diff|=A[i]^B[i];
  return diff===0;
}
