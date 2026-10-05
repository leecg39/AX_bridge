import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const SOURCE_DIR=resolve(process.env.AX_SOURCE_DIR || process.cwd());
const {makeSeed}=await import(pathToFileURL(join(SOURCE_DIR,'seed.mjs')).href);
const {normalize}=await import(pathToFileURL(join(SOURCE_DIR,'db.mjs')).href);

// Test-only VM / event harness. No app code changes, browser, network, or production DB.
// 원본 QA 재현을 수정 완료 조건으로 바꾼 회귀 검사. 원본 AX-QA는 보존합니다.
const ROOT = join(SOURCE_DIR,'public');
const sources=Object.fromEntries(['app','portal','consultation'].map(n=>[n,readFileSync(join(ROOT,n+'.js'),'utf8')]));
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
 const ctx=vm.createContext({console,crypto:{randomUUID},URL,URLSearchParams,Intl,Date,Number,String,Object,Array,Set,Map,Math,JSON,Error,TypeError,structuredClone,
 setTimeout:()=>1,clearTimeout(){},location,
 sessionStorage:{getItem(k){if(getThrows)throw Error('SecurityError: storage access denied');return storage.get(k)||null},setItem(k,v){if(setThrows)throw Error('QuotaExceededError');storage.set(k,v)},removeItem(k){storage.delete(k)}},
 window:{addEventListener(t,h){listeners.set('window:'+t,[...(listeners.get('window:'+t)||[]),h])},scrollTo(){}},
 document:{body:{dataset:{portalRole:role}},querySelector:el,activeElement:el('active'),addEventListener(t,h){listeners.set('document:'+t,[...(listeners.get('document:'+t)||[]),h])}},
 fetch:(url,options)=>{calls.push({url,options});return fetchImpl?fetchImpl(url,options,calls.length):Promise.resolve(response(seed()))},
 FormData:class{constructor(form){return new Map(Object.entries(form.values||{}))}},
 });
 const code=kind==='portal'?sources.portal.replace('  initialise();','  globalThis.testHooks={render,refresh,getState:()=>state,editQuote,submitMilestone,form};\n  initialise();'):sources[kind];
 let startupError;try{vm.runInContext(code,ctx)}catch(e){startupError=e}
 return{ctx,el,listeners,calls,navigations,location,storage,startupError,run:code=>vm.runInContext(code,ctx),fire:async(k,t,event)=>{for(const h of listeners.get(k+':'+t)||[])await h(event)}};
}
const event=()=>({preventDefault(){}});
const signupData={role:'buyer',company:'신규 가상기업',contactName:'가상담당',contactEmail:'fake@example.com',serviceType:'ax',requestTitle:'신규 의뢰',problem:'신규 문제',referralCode:''};

test('REGRESSION UI-01 stored name is escaped in quote modal',async()=>{
 const data=seed(),task=data.tasks[0],p=data.projects[0];
 const payload=`<button type="button" data-action="toggle-task" data-id="${task.id}">설명 확인</button>`;
 assert.ok(payload.length<=200);
 const normalized=normalize('projects',{...p,name:payload},p);assert.equal(normalized.name,payload);
 p.name=normalized.name;
 const f=fixture('app',{fetchImpl:async(url,opt)=>response(opt.method==='PATCH'?{...task,done:!task.done}:data)});await settle();
 f.run(`openQuote(null,${JSON.stringify(p.id)})`);
 const html=f.el('#modal').innerHTML;
 assert.ok(!html.includes(payload));assert.match(html,/&lt;button/);assert.equal(f.calls.filter(c=>c.options.method==='PATCH').length,0);

});

test('REGRESSION UI-01b stored milestone title is escaped',async()=>{
 const data=seed(),m=data.milestones[0];m.title='<input name="reviewNote" value="INJECTED">';
 assert.equal(normalize('milestones',m,m).title,m.title);
 const f=fixture('app',{fetchImpl:async()=>response(data)});await settle();f.run(`openReview(${JSON.stringify(m.id)},'approved')`);
 assert.doesNotMatch(f.el('#modal').innerHTML,/<p><input/);assert.match(f.el('#modal').innerHTML,/&lt;input/);
});

test('REGRESSION UI-02 older role response cannot overwrite newer role selection',async()=>{
 const data=seed(),A=data.salespeople[0],B=data.salespeople[1],pending=[];let count=0;
 const f=fixture('app',{fetchImpl:(url,opt)=>++count===1?Promise.resolve(response(data)):new Promise((resolve,reject)=>pending.push({opt,resolve,reject}))});await settle();
 const old=f.fire('#app','change',{target:{id:'operator-role',value:'sales:'+A.id}});
 const newer=f.fire('#app','change',{target:{id:'operator-role',value:'sales:'+B.id}});
 await settle();assert.equal(pending.length,2);
 pending[1].resolve(response(smallState('project-b','ONLY-B-PROJECT')));await newer;
 assert.match(f.el('#app').innerHTML,/ONLY-B-PROJECT/);
 pending[0].resolve(response(smallState('project-a','ONLY-A-PROJECT')));await old;
 assert.equal(f.run('operatorEntity'),B.id);
 assert.equal(f.run('state.projects[0].id'),'project-b');
 assert.match(f.el('#app').innerHTML,/ONLY-B-PROJECT/);
 assert.ok(f.el('#app').innerHTML.includes(`value="sales:${B.id}" selected`));
});

test('REGRESSION UI-03 failed identity write keeps explicit new buyer target',async()=>{
 const storage=new Map([['ax-demo-buyer','old-buyer']]);
 const f=fixture('portal',{role:'signup',storage,setThrows:true,fetchImpl:async()=>response({role:'buyer',entityId:'new-buyer'})});
 f.el('#signup-form').values=signupData;await f.fire('#signup-form','submit',event());
 assert.equal(f.storage.get('ax-demo-buyer'),'old-buyer');assert.deepEqual(f.navigations,['/consultation.html?entity=new-buyer']);
 assert.equal(f.el('#signup-error').hidden,true);
 const next=fixture('consultation',{storage,search:'?entity=new-buyer',fetchImpl:async()=>response(smallState('new-buyer','NEW-BUYER-CONSULTATION'))});await settle();
 assert.equal(next.calls[0].options.headers['X-Demo-Entity'],'new-buyer');
 assert.match(next.el('#consultation-app').innerHTML,/NEW-BUYER-CONSULTATION/);
});

test('REGRESSION UI-03b failed identity write keeps explicit new supplier target',async()=>{
 const data=seed(),storage=new Map([['ax-demo-supplier',data.suppliers[0].id]]);
 const f=fixture('portal',{role:'signup',storage,setThrows:true,fetchImpl:async()=>response({role:'supplier',entityId:'new-supplier'})});
 f.el('#signup-form').values={...signupData,role:'supplier'};await f.fire('#signup-form','submit',event());
 assert.deepEqual(f.navigations,['/supplier.html?entity=new-supplier']);
 data.suppliers.push({id:'new-supplier',name:'신규 공급사'});const next=fixture('portal',{role:'supplier',storage,search:'?entity=new-supplier',fetchImpl:async()=>response(data)});await settle();
 assert.equal(next.calls.at(-1).options.headers['X-Demo-Entity'],'new-supplier');
});

test('REGRESSION UI-03c denied storage read permits initial request',()=>{
 const f=fixture('app',{getThrows:true});assert.equal(f.startupError,undefined);assert.equal(f.calls.length,1);
});

test('REGRESSION UI-04 lost response reuses registration request key',async()=>{
 let registrations=0;
 const f=fixture('portal',{role:'signup',fetchImpl:async()=>{registrations++;if(registrations===1)throw Error('NetworkError after server commit');return response({role:'buyer',entityId:'second-created-buyer'})}});
 f.el('#signup-form').values=signupData;
 await f.fire('#signup-form','submit',event());assert.equal(f.el('#signup-error').hidden,false);
 await f.fire('#signup-form','submit',event());assert.equal(registrations,2);
 const [a,b]=f.calls;assert.equal(a.options.body,b.options.body);
 assert.ok(a.options.headers['Idempotency-Key']);assert.equal(a.options.headers['Idempotency-Key'],b.options.headers['Idempotency-Key']);
});

test('REGRESSION UI-05 committed save displays refresh failure outside modal',async()=>{
 const data=seed();let calls=0;
 const f=fixture('app',{fetchImpl:async()=>{if(++calls===1)return response(data);throw Error('Refresh unavailable after commit')}});await settle();
 f.run("formDialog('QA save','','',async()=>{globalThis.committed=true})");
 await f.fire('#record-form','submit',event());
 assert.equal(f.ctx.committed,true);assert.equal(f.el('#modal').open,false);
 assert.equal(f.el('#form-error').hidden,true);assert.match(f.el('#toast').textContent,/저장은 완료/);assert.match(f.el('#app').innerHTML,/다시 조회/);
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

test('SAFE official seed grant classification separates four applicant notices and three reference documents',async()=>{
 const f=fixture('app');await settle();
 const actual=f.run("state.programs.filter(p=>!p.isDemo).map(p=>({name:p.name,reference:isReferenceProgram(p)}))");
 assert.equal(actual.filter(p=>!p.reference).length,4);assert.equal(actual.filter(p=>p.reference).length,3);
});

test('REGRESSION SUPPORT admin required whitespace is rejected before API',async()=>{
 const data=seed(),m=data.milestones[0];
 const f=fixture('app',{fetchImpl:async()=>response(data)});await settle();
 f.run(`openReview(${JSON.stringify(m.id)},'submitted')`);
 assert.match(f.el('#modal').innerHTML,/name="deliverable" required/);
 f.el('#record-form').values={deliverable:'   ',reviewNote:''};f.el('#record-form').querySelectorAll=()=>[{name:'deliverable'}];
 await f.fire('#record-form','submit',event());
 const patch=f.calls.find(c=>c.options.method==='PATCH');assert.ok(!patch);
});

test('REGRESSION UI-06 accepted quote above 1e12 remains within admin form range',async()=>{
 const data=seed(),q=data.quotes[0];q.amount=2e12;
 assert.equal(normalize('quotes',q,q).amount,2e12);
 const f=fixture('app',{fetchImpl:async()=>response(data)});await settle();f.run(`openQuote(${JSON.stringify(q.id)})`);
 const input=f.el('#modal').innerHTML.match(/<input id="f-amount"[^>]*>/)[0];
 assert.match(input,/value="2000000000000"/);assert.match(input,/max="1000000000000000"/);
 const supplier=fixture('portal',{role:'supplier',storage:new Map([['ax-demo-supplier',q.supplierId]]),fetchImpl:async()=>response(data)});await settle();supplier.ctx.testHooks.editQuote(q.id);
 assert.match(supplier.el('#portal-modal').innerHTML,/name="amount"[^>]*max="1000000000000000"/);
});

test('signup validation failure allows corrected input with a new request key',async()=>{
 let calls=0;
 const f=fixture('portal',{role:'signup',fetchImpl:async()=>++calls===1?{ok:false,status:400,json:async()=>({error:'잘못된 추천코드'})}:response({role:'buyer',entityId:'corrected'})});
 f.el('#signup-form').values={...signupData,referralCode:'BAD'};
 await f.fire('#signup-form','submit',event());
 f.el('#signup-form').values={...signupData,referralCode:'AX-DEMO-A'};
 await f.fire('#signup-form','submit',event());
 assert.equal(f.calls.length,2);assert.notEqual(f.calls[0].options.headers['Idempotency-Key'],f.calls[1].options.headers['Idempotency-Key']);
 assert.deepEqual(f.navigations,['/consultation.html?entity=corrected']);
});
test('missing explicit portal entity never falls back to old saved entity',async()=>{
 const data=seed(),storage=new Map([['ax-demo-buyer',data.projects[0].id]]);
 const f=fixture('portal',{role:'buyer',storage,search:'?entity=deleted',fetchImpl:async()=>response(data)});await settle();
 assert.equal(f.calls.filter(c=>c.url==='/api/state').length,0);assert.match(f.el('#portal-app').innerHTML,/이전 대상으로 자동 전환하지 않습니다/);
});
test('all supplier service pairs survive the admin edit form',async()=>{
 const data=seed(),supplier=data.suppliers[0];supplier.serviceTypes=['education','infrastructure'];
 const f=fixture('app',{fetchImpl:async()=>response(data)});await settle();f.run(`openSupplier('${supplier.id}')`);
 assert.match(f.el('#modal').innerHTML,/<option value="eduinfra" selected>/);
});
