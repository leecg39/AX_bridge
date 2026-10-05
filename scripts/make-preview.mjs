import vm from 'node:vm';
import {readFileSync,writeFileSync} from 'node:fs';
import {makeSeed} from '../seed.mjs';
const root=new URL('../',import.meta.url),data=makeSeed();
const elements=new Map();
const el=key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',value:'ax',open:false,addEventListener(){},querySelector(s){return el(s)},showModal(){this.open=true},close(){this.open=false}});return elements.get(key)};
const ctx=vm.createContext({console,URL,Intl,Date,Number,String,Object,Array,Set,Map,Math,JSON,Error,structuredClone,setTimeout:()=>1,clearTimeout(){},sessionStorage:{getItem(){return null},setItem(){}},location:{hash:'',reload(){}},window:{addEventListener(){},scrollTo(){}},document:{querySelector:el,addEventListener(){}},fetch:async()=>({ok:true,json:async()=>structuredClone(data)}),FormData:class{}});
vm.runInContext(readFileSync(new URL('public/app.js',root),'utf8'),ctx);await new Promise(r=>setImmediate(r));
const snapshots={};
const routes=['dashboard','projects','compare','suppliers','tasks','crm','programs','investments','settings'];
for(const p of data.projects)for(const tab of ['overview','quotes','milestones'])routes.push(`projects/${p.id}/${tab}`);
for(const p of data.projects)routes.push(`projects/${p.id}`,`compare/${p.id}`);
for(const route of routes){vm.runInContext(`location.hash=${JSON.stringify('#'+route)};render()`,ctx);snapshots[route]=el('#app').innerHTML}
vm.runInContext("programView='reference';location.hash='#programs';render()",ctx);snapshots['program-reference']=el('#app').innerHTML;
const css=['styles.css','tokens.css','system.css'].map(name=>readFileSync(new URL('public/'+name,root),'utf8')).join('\n').replaceAll("url('/assets/","url('public/assets/");
const js=`const screens=${JSON.stringify(snapshots).replaceAll('<','\\u003c')};function show(){document.getElementById('preview').innerHTML=screens[location.hash.slice(1)]||screens.dashboard;window.scrollTo(0,0)}addEventListener('hashchange',show);document.addEventListener('click',e=>{const a=e.target.closest('a');if(a?.getAttribute('href')?.startsWith('/')){e.preventDefault();alert('수요·공급·가입 화면은 서버 실행 후 이용할 수 있습니다. README를 확인해 주세요.')}const b=e.target.closest('button');if(b){e.preventDefault();if(b.dataset.action==='program-view'){location.hash=b.dataset.value==='reference'?'program-reference':'programs';return}alert('정적 미리보기입니다. 등록·수정·저장은 npm start로 실행한 앱에서 확인할 수 있습니다.')}});show();`;
writeFileSync(new URL('PREVIEW.html',root),`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AX브릿지 · 정적 디자인 검토</title><style>${css}\n.preview-banner{position:fixed;left:0;right:0;bottom:0;z-index:80;background:#20382f;color:#e0edcc;padding:11px 20px;text-align:center;font:12px/1.6 system-ui}.footer{padding-bottom:45px}</style></head><body><div id="preview"></div><div class="preview-banner">정적 디자인 검토 · 메뉴 이동만 가능 · 샘플 데이터 · 실제 기능은 README의 실행 안내를 확인하세요</div><script>${js}</script></body></html>`);
console.log('PREVIEW.html generated; static snapshot only, not browser-verified');
