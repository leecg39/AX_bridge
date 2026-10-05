import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const SOURCE_DIR=resolve(process.env.AX_SOURCE_DIR || process.cwd());
const {makeSeed}=await import(pathToFileURL(join(SOURCE_DIR,'seed.mjs')).href);
const {normalize}=await import(pathToFileURL(join(SOURCE_DIR,'db.mjs')).href);

// Test-only VM / event harness. No app code changes, browser, network, or production DB.
// REPRO-DEFECT tests PASS when the named defect is reproduced; SAFE tests check safeguards.
const ROOT = join(SOURCE_DIR,'public');
const sources=Object.fromEntries(['app','portal','consultation','case-kpis'].map(n=>[n,readFileSync(join(ROOT,n+'.js'),'utf8')]));
const settle=()=>new Promise(r=>setImmediate(r));
const seed=()=>makeSeed(new Date('2026-10-05T00:00:00Z'));
const response=value=>({ok:true,json:async()=>structuredClone(value)});
const project=(id,name='가상 요청')=>({id,name,company:name+' 기업',serviceType:'ax',stage:'consultation',problem:'검토 문제',budget:0});
const smallState=(id,name)=>({projects:[project(id,name)],suppliers:[],quotes:[],milestones:[],tasks:[],salespeople:[],meta:{}});
function fixture(kind,{role='buyer',storage=new Map(),getThrows=false,setThrows=false,fetchImpl,hash='',search=''}={}){
 const elements=new Map(),listeners=new Map(),calls=[],navigations=[];
 function el(key){if(!elements.has(key))elements.set(key,{
  innerHTML:'',textContent:'',className:'',hidden:false,disabled:false,open:false,isConnected:true,dataset:{},value:'ax',values:{},
  classList:{add(){}},addEventListener(type,handler){const k=key+':'+type;listeners.set(k,[...(listeners.get(k)||[]),handler])},
  querySelector:el,querySelectorAll(){return[]},reportValidity(){return true},focus(){},click(){},
  showModal(){this.open=true},close(){this.open=false},
 });return elements.get(key)}
 const location={hash,search,assign:url=>navigations.push(url),reload(){}};
 const ctx=vm.createContext({console,URL,URLSearchParams,Intl,Date,Number,String,Object,Array,Set,Map,Math,JSON,Error,TypeError,structuredClone,
 setTimeout:()=>1,clearTimeout(){},location,
 sessionStorage:{getItem(k){if(getThrows)throw Error('SecurityError: storage access denied');return storage.get(k)||null},setItem(k,v){if(setThrows)throw Error('QuotaExceededError');storage.set(k,v)},removeItem(k){storage.delete(k)}},
 window:{addEventListener(t,h){listeners.set('window:'+t,[...(listeners.get('window:'+t)||[]),h])},scrollTo(){}},
 document:{body:{dataset:{portalRole:role}},querySelector:el,activeElement:el('active'),addEventListener(t,h){listeners.set('document:'+t,[...(listeners.get('document:'+t)||[]),h])}},
 fetch:(url,options)=>{calls.push({url,options});return fetchImpl?fetchImpl(url,options,calls.length):Promise.resolve(response(seed()))},
 FormData:class{constructor(form){return new Map(Object.entries(form.values||{}))}},
 });
 const code=kind==='portal'?sources.portal.replace('  initialise();','  globalThis.testHooks={render,refresh,getState:()=>state,editQuote,submitMilestone,form,deadlineLabel};\n  initialise();'):sources[kind];
 let startupError;try{vm.runInContext(code,ctx)}catch(e){startupError=e}
 return{ctx,el,listeners,calls,navigations,location,storage,startupError,run:code=>vm.runInContext(code,ctx),fire:async(k,t,event)=>{for(const h of listeners.get(k+':'+t)||[])await h(event)}};
}
const event=()=>({preventDefault(){}});
const signupData={role:'buyer',company:'신규 가상기업',contactName:'가상담당',contactEmail:'fake@example.com',serviceType:'ax',requestTitle:'신규 의뢰',problem:'신규 문제',referralCode:''};

test('REPRO-DEFECT UI-01 stored company/name enters quote modal as HTML and existing action dispatcher mutates data on click',async()=>{
 const data=seed(),task=data.tasks[0],p=data.projects[0];
 const payload=`<button type="button" data-action="toggle-task" data-id="${task.id}">설명 확인</button>`;
 assert.ok(payload.length<=200);
 const normalized=normalize('projects',{...p,name:payload},p);assert.equal(normalized.name,payload);
 p.name=normalized.name;
 const f=fixture('app',{fetchImpl:async(url,opt)=>response(opt.method==='PATCH'?{...task,done:!task.done}:data)});await settle();
 f.run(`openQuote(null,${JSON.stringify(p.id)})`);
 const html=f.el('#modal').innerHTML;
 assert.ok(html.includes(`<p>${p.company} · ${payload}</p>`),'stored field emitted as real button markup, not escaped text');
 const target={dataset:{action:'toggle-task',id:task.id}};
 await f.fire('document','click',{target:{closest:selector=>selector==='[data-action]'?target:null}});
 const patch=f.calls.find(c=>c.options.method==='PATCH');
 assert.equal(patch.url,`/api/tasks/${task.id}`);assert.equal(JSON.parse(patch.options.body).done,!task.done);
 console.log('EVIDENCE UI-01 raw <button> emitted in modal; delegated click sent',patch.url,patch.options.body);
});

test('REPRO-DEFECT UI-01b stored milestone title enters review modal without escaping',async()=>{
 const data=seed(),m=data.milestones[0];m.title='<input name="reviewNote" value="INJECTED">';
 assert.equal(normalize('milestones',m,m).title,m.title);
 const f=fixture('app',{fetchImpl:async()=>response(data)});await settle();f.run(`openReview(${JSON.stringify(m.id)},'approved')`);
 assert.ok(f.el('#modal').innerHTML.includes('<p><input name="reviewNote" value="INJECTED"></p>'));
});

test('REPRO-DEFECT UI-02 older role response overwrites newer role selection',async()=>{
 const data=seed(),A=data.salespeople[0],B=data.salespeople[1],pending=[];let count=0;
 const f=fixture('app',{fetchImpl:(url,opt)=>++count===1?Promise.resolve(response(data)):new Promise((resolve,reject)=>pending.push({opt,resolve,reject}))});await settle();
 const old=f.fire('#app','change',{target:{id:'operator-role',value:'sales:'+A.id}});
 const newer=f.fire('#app','change',{target:{id:'operator-role',value:'sales:'+B.id}});
 await settle();assert.equal(pending.length,2);
 pending[1].resolve(response(smallState('project-b','ONLY-B-PROJECT')));await newer;
 assert.match(f.el('#app').innerHTML,/ONLY-B-PROJECT/);
 pending[0].resolve(response(smallState('project-a','ONLY-A-PROJECT')));await old;
 assert.equal(f.run('operatorEntity'),B.id);
 assert.equal(f.run('state.projects[0].id'),'project-a');
 assert.match(f.el('#app').innerHTML,/ONLY-A-PROJECT/);
 assert.ok(f.el('#app').innerHTML.includes(`value="sales:${B.id}" selected`));
 console.log('EVIDENCE UI-02 selected role B but visible project A after out-of-order GET /api/state');
});

test('REPRO-DEFECT UI-03 failed signup identity write redirects consultation to OLD buyer entity',async()=>{
 const storage=new Map([['ax-demo-buyer','old-buyer']]);
 const f=fixture('portal',{role:'signup',storage,setThrows:true,fetchImpl:async()=>response({role:'buyer',entityId:'new-buyer'})});
 f.el('#signup-form').values=signupData;await f.fire('#signup-form','submit',event());
 assert.equal(f.storage.get('ax-demo-buyer'),'old-buyer');assert.deepEqual(f.navigations,['/consultation.html']);
 assert.equal(f.el('#signup-error').hidden,true);
 const next=fixture('consultation',{storage,fetchImpl:async()=>response(smallState('old-buyer','OLD-BUYER-CONSULTATION'))});await settle();
 assert.equal(next.calls[0].options.headers['X-Demo-Entity'],'old-buyer');
 assert.match(next.el('#consultation-app').innerHTML,/OLD-BUYER-CONSULTATION/);
 console.log('EVIDENCE UI-03 new-buyer registered, next page GET state targets old-buyer with no warning');
});

test('REPRO-DEFECT UI-03b failed supplier identity write redirects to OLD supplier',async()=>{
 const data=seed(),storage=new Map([['ax-demo-supplier',data.suppliers[0].id]]);
 const f=fixture('portal',{role:'signup',storage,setThrows:true,fetchImpl:async()=>response({role:'supplier',entityId:'new-supplier'})});
 f.el('#signup-form').values={...signupData,role:'supplier'};await f.fire('#signup-form','submit',event());
 assert.deepEqual(f.navigations,['/supplier.html']);
 const next=fixture('portal',{role:'supplier',storage,fetchImpl:async(url)=>response(url==='/api/demo-options'?data:data)});await settle();
 assert.equal(next.calls.at(-1).options.headers['X-Demo-Entity'],data.suppliers[0].id);
});

test('REPRO-DEFECT UI-03c denied sessionStorage read aborts admin before any render/request',()=>{
 const f=fixture('app',{getThrows:true});assert.match(f.startupError.message,/SecurityError/);
 assert.equal(f.calls.length,0);assert.equal(f.el('#app').innerHTML,'');
 console.log('EVIDENCE UI-03c admin startup throws before refresh and renders blank app');
});

test('REPRO-DEFECT UI-04 lost registration response enables duplicate POST with identical payload and no idempotency key',async()=>{
 let registrations=0;
 const f=fixture('portal',{role:'signup',fetchImpl:async()=>{registrations++;if(registrations===1)throw Error('NetworkError after server commit');return response({role:'buyer',entityId:'second-created-buyer'})}});
 f.el('#signup-form').values=signupData;
 await f.fire('#signup-form','submit',event());assert.equal(f.el('#signup-error').hidden,false);
 await f.fire('#signup-form','submit',event());assert.equal(registrations,2);
 const [a,b]=f.calls;assert.equal(a.options.body,b.options.body);
 assert.equal(a.options.headers['Idempotency-Key'],undefined);
 console.log('EVIDENCE UI-04 two matching POST /api/demo-register after first response loss; server duplicate proof is separate');
});

test('REPRO-DEFECT UI-05 committed admin save then failed refresh hides error inside closed modal',async()=>{
 const data=seed();let calls=0;
 const f=fixture('app',{fetchImpl:async()=>{if(++calls===1)return response(data);throw Error('Refresh unavailable after commit')}});await settle();
 f.run("formDialog('QA save','','',async()=>{globalThis.committed=true})");
 await f.fire('#record-form','submit',event());
 assert.equal(f.ctx.committed,true);assert.equal(f.el('#modal').open,false);
 assert.equal(f.el('#form-error').hidden,false);assert.match(f.el('#form-error').textContent,/Refresh unavailable/);
 assert.equal(f.el('#toast').textContent,'');
 console.log('EVIDENCE UI-05 commit succeeded; refresh error sits in closed dialog; no toast');
});

test('SAFE portal ignores late response when buyer entity changes twice',async()=>{
 const data=seed(),storage=new Map([['ax-demo-buyer',data.projects[0].id]]),pending=[];
 let states=0;
 const f=fixture('portal',{role:'buyer',storage,fetchImpl:(url,opt)=>url==='/api/demo-options'?Promise.resolve(response(data)):++states===1?Promise.resolve(response(data)):new Promise(resolve=>pending.push({resolve,opt}))});await settle();
 const A=data.projects[1].id,B=data.projects[2].id;
 await f.fire('#portal-app','change',{target:{id:'portal-entity',value:A}});
 await f.fire('#portal-app','change',{target:{id:'portal-entity',value:B}});
 pending[1].resolve(response(data));await settle();pending[0].resolve(response(data));await settle();
 assert.equal(f.ctx.testHooks.getState().projects[0].id,B);
});

test('SAFE signup double submission while POST pending is suppressed',async()=>{
 let resolve;
 const f=fixture('portal',{role:'signup',fetchImpl:()=>new Promise(r=>resolve=r)});f.el('#signup-form').values=signupData;
 const first=f.fire('#signup-form','submit',event());const second=f.fire('#signup-form','submit',event());
 assert.equal(f.calls.length,1);resolve(response({role:'buyer',entityId:'new'}));await Promise.all([first,second]);
});

test('SAFE portal required deliverable rejects whitespace before mutation',async()=>{
 const data=seed(),supplierId=data.quotes.find(q=>data.projects.some(p=>p.selectedQuoteId===q.id))?.supplierId || data.suppliers[0].id;
 const storage=new Map([['ax-demo-supplier',supplierId]]);
 const f=fixture('portal',{role:'supplier',storage,fetchImpl:async()=>response(data)});await settle();
 // Exercise the exact shared portal form handler using an intentionally required field.
 f.ctx.testHooks.form('검사','','',async()=>{throw Error('should not save')});
 const form=f.el('form');form.values={deliverable:'   '};
 form.querySelectorAll=selector=>selector==='[required]'?[{name:'deliverable',focus(){}}]:[];
 await f.fire('form','submit',event());
 assert.equal(f.calls.filter(c=>c.options.method!=='GET').length,0);
 assert.match(f.el('#portal-form-error').textContent,/공백/);
});

test('SAFE admin safeLink blocks active schemes and escapes quotes; approved links isolate opener',async()=>{
 const f=fixture('app');await settle();
 for(const url of ['javascript:alert(1)','data:text/html,<script>alert(1)</script>','file:///etc/passwd']){
  const html=f.run(`safeLink(${JSON.stringify(url)},'보기')`);assert.doesNotMatch(html,/<a /);
 }
 const html=f.run(`safeLink('https://example.test/?q="<','보기')`);assert.match(html,/rel="noopener noreferrer"/);assert.match(html,/&quot;&lt;/);
});

test('SAFE public signup query and consultation project text are escaped',async()=>{
 const payload='<img src=x onerror="alert(1)">';
 const signup=fixture('portal',{role:'signup',search:'?request='+encodeURIComponent(payload)+'&service=constructor'});
 assert.doesNotMatch(signup.el('#portal-app').innerHTML,/<img/);assert.match(signup.el('#portal-app').innerHTML,/&lt;img/);
 const state=smallState('buyer',payload);
 const c=fixture('consultation',{storage:new Map([['ax-demo-buyer','buyer']]),fetchImpl:async()=>response(state)});await settle();
 assert.doesNotMatch(c.el('#consultation-app').innerHTML,/<img/);assert.match(c.el('#consultation-app').innerHTML,/&lt;img/);
});

test('SAFE current fictional KPI examples distinguish relative percent and percentage points',()=>{
 const f=fixture('case-kpis'),k=f.ctx.AXCaseKpis;
 assert.equal(k.formatChange({before:4,after:2.8,kind:'percent',direction:'down'}),'1.2%p 감소 · 상대 30% 감소');
 assert.equal(k.calculate({before:0,after:10,kind:'number',direction:'up'}).relativePercent,null);
 for(const c of k.cases){assert.match(c.period,/가상/);for(const m of c.metrics)assert.equal(k.calculate(m).improved,true)}
});

test('SAFE official seed grant classification separates four applicant notices and three reference documents',async()=>{
 const f=fixture('app');await settle();
 const actual=f.run("state.programs.filter(p=>!p.isDemo).map(p=>({name:p.name,reference:isReferenceProgram(p)}))");
 assert.equal(actual.filter(p=>!p.reference).length,4);assert.equal(actual.filter(p=>p.reference).length,3);
});

test('REPRO-DEFECT SUPPORT admin required deliverable whitespace reaches API unchanged',async()=>{
 const data=seed(),m=data.milestones[0];
 const f=fixture('app',{fetchImpl:async()=>response(data)});await settle();
 f.run(`openReview(${JSON.stringify(m.id)},'submitted')`);
 assert.match(f.el('#modal').innerHTML,/name="deliverable" required/);
 f.el('#record-form').values={deliverable:'   ',reviewNote:''};
 await f.fire('#record-form','submit',event());
 const patch=f.calls.find(c=>c.options.method==='PATCH');assert.ok(patch);
 assert.equal(JSON.parse(patch.options.body).deliverable,'   ');
 console.log('EVIDENCE SUPPORT whitespace deliverable reaches admin PATCH unchanged; backend workflow validation is reviewed separately');
});

test('REPRO-DEFECT UI-06 accepted supplier quote above 1e12 renders out-of-range in admin edit form',async()=>{
 const data=seed(),q=data.quotes[0];q.amount=2e12;
 assert.equal(normalize('quotes',q,q).amount,2e12);
 const f=fixture('app',{fetchImpl:async()=>response(data)});await settle();f.run(`openQuote(${JSON.stringify(q.id)})`);
 const input=f.el('#modal').innerHTML.match(/<input id="f-amount"[^>]*>/)[0];
 assert.match(input,/value="2000000000000"/);assert.match(input,/max="1000000000000"/);
 const supplier=fixture('portal',{role:'supplier',storage:new Map([['ax-demo-supplier',q.supplierId]]),fetchImpl:async()=>response(data)});await settle();supplier.ctx.testHooks.editQuote(q.id);
 assert.match(supplier.el('#portal-modal').innerHTML,/name="amount"[^>]*max="1000000000000000"/);
 console.log('EVIDENCE UI-06 persisted 2e12 accepted by API/supplier form; admin edit max is 1e12');
});
