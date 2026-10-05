import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

class MemoryD1 {
  constructor(){ this.rows=new Map(); }

  prepare(sql){
    const db=this;
    const text=String(sql).replace(/\s+/g,' ').trim();

    return {
      args:[],
      bind(...args){ this.args=args; return this; },
      async run(){
        if(/^CREATE TABLE/i.test(text) || /^CREATE INDEX/i.test(text)) return {success:true};

        if(/^INSERT INTO mesa_v2_records/i.test(text)){
          const [entity,id,data,deleted,updated_at]=this.args;
          const key=String(entity)+'|'+String(id);
          if(db.rows.has(key)) throw new Error('UNIQUE constraint failed');
          db.rows.set(key,{entity:String(entity),id:String(id),data:String(data),deleted:Number(deleted)||0,updated_at:String(updated_at)});
          return {success:true};
        }

        if(/^UPDATE mesa_v2_records/i.test(text)){
          const [data,deleted,updated_at,entity,id]=this.args;
          const key=String(entity)+'|'+String(id);
          if(!db.rows.has(key)) return {success:true,meta:{changes:0}};
          db.rows.set(key,{entity:String(entity),id:String(id),data:String(data),deleted:Number(deleted)||0,updated_at:String(updated_at)});
          return {success:true,meta:{changes:1}};
        }

        throw new Error('SQL run no soportado en test: '+text);
      },
      async all(){
        if(/^SELECT id,data FROM mesa_v2_records WHERE entity=\?/i.test(text)){
          const [entity]=this.args;
          const results=[...db.rows.values()]
            .filter(r=>r.entity===String(entity))
            .sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)))
            .map(r=>({id:r.id,data:r.data}));
          return {results};
        }
        throw new Error('SQL all no soportado en test: '+text);
      }
    };
  }
}

const env=()=>({DB:new MemoryD1(),ALLOWED_ORIGINS:'https://mesa.test',SECURITY_RATE_LIMIT_ENABLED:'false'});

async function call(app,environment,path,{method='GET',body}={}){
  const req=new Request('https://mesa.test'+path,{
    method,
    headers:body?{'content-type':'application/json'}:undefined,
    body:body?JSON.stringify(body):undefined
  });
  return app.fetch(req,environment);
}

test('flujo público completo: personas, proyecto, señales, búsqueda y matching',async()=>{
  const environment=env();

  const first=await call(worker,environment,'/api/self/persona',{
    method:'POST',
    body:{
      nombre_completo:'Persona Uno',
      email:'uno@example.test',
      edit_token:'token-persona-uno-12345678901234567890',
      profesion:'Diseño de producto',
      especialidad:'UX',
      proyecto:'Proyecto Alfa',
      etapa:'MVP',
      sector:'Tecnología',
      descripcion_proyecto:'Plataforma que necesita backend para completar el MVP.',
      busca:'Backend Node API',
      puede_aportar:'Diseño UX y producto'
    }
  });
  assert.equal(first.status,200,await first.text());

  const second=await call(worker,environment,'/api/self/persona',{
    method:'POST',
    body:{
      nombre_completo:'Persona Dos',
      email:'dos@example.test',
      edit_token:'token-persona-dos-12345678901234567890',
      profesion:'Backend Node API',
      especialidad:'Node.js',
      proyecto:'',
      etapa:'',
      sector:'Tecnología',
      descripcion_proyecto:'',
      busca:'',
      puede_aportar:'Backend Node API PostgreSQL'
    }
  });
  assert.equal(second.status,200,await second.text());

  const dashRes=await call(worker,environment,'/api/public/dashboard');
  assert.equal(dashRes.status,200);
  const dash=await dashRes.json();

  assert.equal(dash.counts.personas,2);
  assert.equal(dash.counts.proyectos,1);
  assert.ok(dash.counts.capacidades>=3,'debe derivar capacidades');
  assert.ok(dash.counts.necesidades>=1,'debe derivar necesidades');
  assert.ok(dash.counts.matches>=1,'debe crear al menos un match');
  const firstMatch=dash.matches[0];
  for(const key of ['escala_general','conocimiento','experiencia_sectorial','afinidad_problema','recursos','urgencia','capacidad_ejecucion','complementariedad']){
    assert.ok(Number(firstMatch[key])>=1&&Number(firstMatch[key])<=7,key+' debe estar en escala 1-7');
  }
  assert.equal(dash.proyectos[0].nombre,'Proyecto Alfa');

  const searchRes=await call(worker,environment,'/api/search?q=Proyecto%20Alfa');
  assert.equal(searchRes.status,200);
  const search=await searchRes.json();
  assert.ok(search.results.some(x=>x.entity==='proyectos'&&x.label==='Proyecto Alfa'));

  const pendingRes=await call(worker,environment,'/api/public/pending-ids');
  assert.equal(pendingRes.status,401,'pending IDs no pueden ser públicos');

  const healthRes=await call(worker,environment,'/api/health');
  assert.equal(healthRes.status,200);
  assert.equal(healthRes.headers.get('x-frame-options'),'DENY');
  assert.match(healthRes.headers.get('content-security-policy')||'',/frame-ancestors 'none'/);
  const health=await healthRes.json();
  assert.equal(health.ok,true);
  assert.equal(health.storage,'d1');
});
