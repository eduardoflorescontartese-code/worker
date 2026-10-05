const CACHEABLE=new Map([
  ['/api/public/stats',15],
  ['/api/public/dashboard',10]
]);

function available(){
  return typeof caches!=='undefined' && caches?.default;
}

function keyFor(req,path){
  const u=new URL(req.url);
  u.pathname=path;
  u.search='';
  return new Request(u.toString(),{method:'GET'});
}

export async function edgeCacheMatch(req,path){
  if(req.method!=='GET'||!CACHEABLE.has(path)||!available())return null;
  return caches.default.match(keyFor(req,path));
}

export async function edgeCachePut(req,path,response,ctx){
  if(req.method!=='GET'||!CACHEABLE.has(path)||!available()||!response?.ok)return;
  const ttl=CACHEABLE.get(path);
  const stored=new Response(response.clone().body,response);
  stored.headers.set('cache-control',`public, max-age=${ttl}`);
  const task=caches.default.put(keyFor(req,path),stored);
  if(ctx?.waitUntil)ctx.waitUntil(task);
  else await task;
}

export async function invalidatePublicEdgeCache(req,ctx){
  if(!available())return;
  const tasks=[...CACHEABLE.keys()].map(path=>caches.default.delete(keyFor(req,path)));
  const task=Promise.all(tasks);
  if(ctx?.waitUntil)ctx.waitUntil(task);
  else await task;
}
