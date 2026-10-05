'use strict';
(() => {
  // Old admin bookmarks continue to work after the homepage move.
  if (/^#(dashboard|projects|compare|suppliers|crm|programs|investments|tasks|settings)(\/|$)/.test(location.hash)) { location.replace('/admin.html'+location.hash); return; }
  const form=document.querySelector('#service-search'),input=document.querySelector('#request-search'),select=document.querySelector('#service-type');
  const tabs=[...document.querySelectorAll('[role=tab]')],cards=[...document.querySelectorAll('.service-card')];
  const status=document.querySelector('#results-status'),empty=document.querySelector('#empty-results'),panel=document.querySelector('#service-panel');
  let active='all',query='';
  function applyFilter(kind,search=''){
    active=kind;query=search.trim().toLocaleLowerCase('ko-KR');
    tabs.forEach(tab=>{const selected=tab.dataset.filter===kind;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1});
    panel.setAttribute('aria-labelledby','tab-'+kind);select.value=kind;
    const terms=query.split(/\s+/).filter(Boolean);
    let count=0;
    cards.forEach(card=>{const text=(card.textContent+' '+card.dataset.keywords).toLocaleLowerCase('ko-KR');const visible=(kind==='all'||kind===card.dataset.service)&&terms.every(term=>text.includes(term));card.hidden=!visible;if(visible)count++});
    empty.hidden=count>0;status.hidden=false;status.textContent=query?`“${search.trim()}”에 맞는 서비스 ${count}개`:`${kind==='all'?'전체':select.selectedOptions[0].textContent} 서비스 ${count}개`;
    const params=new URLSearchParams({role:'buyer',request:search.trim()});if(kind!=='all')params.set('service',kind);
    document.querySelector('#custom-request').href='/signup.html?'+params;
  }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>{input.value='';applyFilter(tab.dataset.filter)});
    tab.addEventListener('keydown',event=>{let target;if(event.key==='ArrowRight')target=(index+1)%tabs.length;else if(event.key==='ArrowLeft')target=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')target=0;else if(event.key==='End')target=tabs.length-1;else return;event.preventDefault();tabs[target].focus();tabs[target].click()});
  });
  form.addEventListener('submit',event=>{event.preventDefault();const error=document.querySelector('#search-error');error.hidden=true;input.removeAttribute('aria-invalid');if(input.value.length&& !input.value.trim()){error.textContent='공백 대신 찾고 싶은 업무를 입력해 주세요.';error.hidden=false;input.setAttribute('aria-invalid','true');input.focus();return}applyFilter(select.value,input.value);document.querySelector('#services').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});panel.focus({preventScroll:true})});
  document.querySelector('#clear-search').addEventListener('click',()=>{input.value='';applyFilter('all');tabs[0].focus()});
  const toggle=document.querySelector('.menu-toggle'),menu=document.querySelector('#mobile-nav');
  function closeMenu(returnFocus=false){menu.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','메뉴 열기');if(returnFocus)toggle.focus()}
  toggle.addEventListener('click',()=>{const open=menu.hidden;menu.hidden=!open;toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'메뉴 닫기':'메뉴 열기');if(open)menu.querySelector('a').focus()});
  menu.addEventListener('click',event=>{if(event.target.closest('a'))closeMenu()});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden)closeMenu(true)});
  document.addEventListener('click',event=>{if(!menu.hidden&&!event.target.closest('.site-header'))closeMenu()});
  matchMedia('(min-width: 701px)').addEventListener('change',event=>{if(event.matches)closeMenu()});
})();
