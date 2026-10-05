import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {makeSeed} from '../seed.mjs';

// Rendering smoke tests, NOT a replacement for real browser/visual verification.
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
async function fixture(){
 const data=makeSeed(new Date('2026-10-05T00:00:00Z'));
 const elements=new Map();
 const el=key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',className:'',hidden:false,disabled:false,value:'ax',open:false,dataset:{},addEventListener(){},querySelector(s){return el(s)},showModal(){this.open=true},close(){this.open=false},click(){}});return elements.get(key)};
 const context=vm.createContext({console,URL,Intl,Date,Number,String,Object,Array,Set,Map,Math,JSON,Error,structuredClone,setTimeout:()=>1,clearTimeout(){},sessionStorage:{getItem(){return null},setItem(){}},location:{hash:'',reload(){}},window:{addEventListener(){},scrollTo(){}},document:{querySelector:el,addEventListener(){}},fetch:async()=>({ok:true,json:async()=>structuredClone(data)}),FormData:class{}});
 vm.runInContext(source,context);await new Promise(r=>setImmediate(r));
 return {context,data,el,run:code=>vm.runInContext(code,context)};
}
test('dashboard renders counts, demo warnings and role navigation',async()=>{
 const f=await fixture(),html=f.el('#app').innerHTML;
 assert.match(html,/오늘의 운영 현황/);assert.match(html,/AX브릿지/);assert.match(html,/로그인 미설정/);assert.match(html,/buyer.html/);assert.match(html,/supplier.html/);assert.match(html,/signup.html/);assert.doesNotMatch(html,/undefined/);
});
test('every admin route renders and all project tabs handle the seed',async()=>{
 const f=await fixture();
 for(const page of ['dashboard','projects','compare','suppliers','tasks','settings','programs','investments','crm']){
  f.run(`location.hash='#${page}';render()`);assert.ok(f.el('#app').innerHTML.length>500,page);assert.doesNotMatch(f.el('#app').innerHTML,/undefined/,page);
 }
 for(const p of f.data.projects)for(const tab of ['overview','quotes','milestones']){
  f.run(`location.hash='#projects/${p.id}/${tab}';render()`);assert.match(f.el('#app').innerHTML,new RegExp(p.name));assert.doesNotMatch(f.el('#app').innerHTML,/undefined/);
 }
});
test('all create and edit forms render without runtime errors',async()=>{
 const f=await fixture();
 for(const expr of ['openProject()','openSupplier()','openTask()','openSalesperson()','openProgram()','openApplication()','openInvestment()','openActivity()',`openQuote(null,'${f.data.projects[1].id}')`,`openMilestone(null,'${f.data.projects[1].id}')`]){
  f.run(expr);assert.match(f.el('#modal').innerHTML,/<form/);assert.doesNotMatch(f.el('#modal').innerHTML,/undefined/);
 }
 for(const p of f.data.projects){f.run(`openProject('${p.id}')`);assert.match(f.el('#modal').innerHTML,/f-serviceType/);assert.match(f.el('#modal').innerHTML,/infrastructure-fields/)}
});
test('search and service filters select projects; list and board both render',async()=>{
 const f=await fixture();
 f.run("filters.search='네스트';filters.serviceType='';");assert.equal(f.run('filteredProjects().length'),1);
 f.run("filters.search='';filters.serviceType='education';");assert.ok(f.run('filteredProjects().every(p=>p.serviceType==="education")'));
 f.run("filters.view='list';location.hash='#projects';render()");assert.match(f.el('#app').innerHTML,/<table>/);
 f.run("filters.view='board';render()");assert.match(f.el('#app').innerHTML,/kanban-col/);
});
test('untrusted text is escaped and unsafe resource links are never active',async()=>{
 const f=await fixture();
 f.run(`state.projects[0].name='<img src=x onerror=alert(1)>';state.projects[0].company='<script>bad</script>';location.hash='#projects';render()`);
 const html=f.el('#app').innerHTML;assert.doesNotMatch(html,/<img src=x/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<script>bad/);
 assert.doesNotMatch(f.run("safeLink('javascript:alert(1)','open')"),/<a/);
 assert.doesNotMatch(f.run("safeLink('data:text/html,unsafe','open')"),/<a/);
});
test('sales mode hides investment/support/data routes and assignment changes',async()=>{
 const f=await fixture();f.run("operatorMode='sales';location.hash='#investments';render()");assert.match(f.el('#app').innerHTML,/관리자 전용 메뉴/);assert.doesNotMatch(f.el('#app').innerHTML,/href="#investments"/);
 f.run(`openProject('${f.data.projects[0].id}')`);assert.equal(f.el('#f-ownerId').disabled,true);
});
test('support notices are separated from budget and institution references',async()=>{
 const f=await fixture();f.run("location.hash='#programs';render()");
 let html=f.el('#app').innerHTML;assert.match(html,/충북/);assert.match(html,/기존 수혜기업 전용/);assert.doesNotMatch(html,/2027년 중소벤처기업부 예산안/);
 f.run("programView='reference';render()");html=f.el('#app').innerHTML;assert.match(html,/2027년 중소벤처기업부 예산안/);assert.match(html,/일반기업 공고 전/);assert.doesNotMatch(html,/가상 AI 바우처 검토 예시<\/h2>/);
});
