'use strict';
(() => {
  const app=document.querySelector('#consultation-app');
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let entity=new URLSearchParams(location.search).get('entity')||'',busy=false;
  if(!entity)try{entity=sessionStorage.getItem('ax-demo-buyer')||''}catch{}
  const headers={'Content-Type':'application/json','X-Demo-Role':'buyer','X-Demo-Entity':entity};
  async function request(path,body){const response=await fetch('/api/'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw Error(data.error||'요청 실패');return data}
  async function init(){
    if(!entity){app.innerHTML='<main class="signup-main"><section class="signup-form-card"><h1>상담할 의뢰를 선택해 주세요</h1><a href="/signup.html">새 의뢰 등록</a> · <a href="/buyer.html">수요기업 포털</a></section></main>';return}
    try{
      const state=await request('state'),project=state.projects.find(p=>p.id===entity);
      if(!project)throw Error('전달된 의뢰를 찾을 수 없습니다. 다른 의뢰로 자동 전환하지 않습니다.');
      app.innerHTML=`<main class="signup-main"><section class="signup-form-card"><a class="brand" href="/">AX브릿지</a><h1>상담 요청서</h1><p>${esc(project.company)} · ${esc(project.name)}</p><p>로컬 시연용 접수입니다. 외부 연락을 보내지 않습니다.</p><form id="consultation-form"><div class="form-grid">${[['problem','해결하고 싶은 문제',true],['requirements','요구사항',false],['conditions','일정·운영 조건',false]].map(([key,label,required])=>`<div class="field wide"><label for="${key}">${label}</label><textarea id="${key}" name="${key}" maxlength="10000" ${required?'required':''}>${esc(project[key])}</textarea></div>`).join('')}</div><p id="consultation-status" role="status">${project.consultationRef?`접수번호: ${esc(project.consultationRef)}`:''}</p><button class="btn primary" type="submit">${project.consultationRef?'상담 내용 수정':'상담 접수'}</button></form><p><a href="/buyer.html?entity=${encodeURIComponent(entity)}">이 의뢰의 포털로 이동</a></p></section></main>`;
      const form=document.querySelector('#consultation-form');
      form.addEventListener('submit',async event=>{event.preventDefault();if(busy||!form.reportValidity())return;const data=Object.fromEntries(new FormData(form));for(const key of Object.keys(data))data[key]=data[key].trim();const status=document.querySelector('#consultation-status');if(!data.problem){status.textContent='문제 내용을 입력해 주세요. 공백만 입력할 수 없습니다.';return}busy=true;const button=form.querySelector('button');button.disabled=true;try{const result=await request('consultation',data);status.textContent='접수 완료 · 접수번호: '+result.receipt;button.textContent='상담 내용 수정'}catch(error){status.textContent=error.message+' 같은 내용으로 다시 시도할 수 있습니다.'}finally{busy=false;button.disabled=false}});
    }catch(error){app.innerHTML=`<main class="signup-main"><section class="signup-form-card"><h1>상담 정보를 불러오지 못했습니다</h1><p role="alert">${esc(error.message)}</p><button id="retry-consultation" class="btn">다시 조회</button></section></main>`;document.querySelector('#retry-consultation').addEventListener('click',init)}
  }
  init();
})();
