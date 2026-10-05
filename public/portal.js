'use strict';
(() => {
  const role = document.body.dataset.portalRole;
  const isBuyer = role === 'buyer';
  const isSignup = role === 'signup';
  const app = document.querySelector('#portal-app');
  const dialog = document.querySelector('#portal-modal');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number = value => new Intl.NumberFormat('ko-KR').format(Number(value) || 0);
  const date = value => value ? escape(String(value).replaceAll('-', '.')) : '일정 미정';
  const stageNames = {consultation:'상담 접수',quotation:'견적 검토',progress:'진행 중',completed:'완료'};
  const milestoneNames = {planned:'준비 중',submitted:'검수 대기',revision:'수정 요청',approved:'검수 완료'};
  const serviceNames = {ax:'AX 구축',education:'AI 교육',infrastructure:'AI 인프라'};
  const paths = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3z"/>',
    quote:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6m-6 4h3"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
    edit:'<path d="m15 4 5 5M4 20l1-6L16 3a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3L10 19z"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
    send:'<path d="m3 3 18 9-18 9 4-9-4-9zm4 9h14"/>',
    people:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.folder}</svg>`;
  const badge = (value, names = stageNames) => `<span class="badge ${escape(value)}">${escape(names[value] || value)}</span>`;
  const demo = item => item?.isDemo ? '<span class="badge demo">가상</span>' : '';
  const btn = (action, label, iconName = '', attrs = '', primary = false) => `<button type="button" class="btn${primary ? ' primary' : ''}" data-action="${escape(action)}" ${attrs}>${iconName ? icon(iconName) : ''}${escape(label)}</button>`;
  const empty = (title, detail, action = '') => `<div class="empty"><h3>${escape(title)}</h3><p>${escape(detail)}</p>${action}</div>`;
  let state = null, identities = [], entityId = '', page = 'overview', projectFilter = '', busy = false, fetching = false, loadError = '', version = 0, lastFocus = null;
  let signupAttempt=null;
  const explicitEntity=new URLSearchParams(location.search).get('entity')||'';
  const sessionKey = `ax-demo-${role}`;
  const getSaved = () => { try { return sessionStorage.getItem(sessionKey) || ''; } catch { return ''; } };
  const saveIdentity = (kind, id) => { try { sessionStorage.setItem(`ax-demo-${kind}`, id); return sessionStorage.getItem(`ax-demo-${kind}`)===id; } catch { return false; } };
  const titleOf = id => state?.projects.find(item => item.id === id)?.name || '연결된 프로젝트';
  const companyOf = id => state?.projects.find(item => item.id === id)?.company || '';
  const findProject = id => state?.projects.find(item => item.id === id);
  const currentProject = () => state?.projects.find(item => item.id === entityId);
  const currentSupplier = () => state?.suppliers.find(item => item.id === entityId);
  const money = amount => `${number(amount)}<small>원</small>`;
  const notice = message => { const target = document.querySelector('#toast'); target.textContent = message; target.className = 'show'; clearTimeout(notice.timeout); notice.timeout = setTimeout(() => target.className = '', 5000); };

  async function request(path, method = 'GET', data, scoped = true, targetEntity = entityId) {
    const headers = {};
    if (scoped) { headers['X-Demo-Role'] = role; headers['X-Demo-Entity'] = targetEntity; }
    if (path === 'demo-register' && signupAttempt) headers['Idempotency-Key']=signupAttempt.key;
    if (data !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`/api/${path}`, {method, headers, body:data !== undefined ? JSON.stringify(data) : undefined, cache:'no-store'});
    let result;
    try { result = await response.json(); } catch { throw new Error('서버 응답을 읽지 못했습니다. 로컬 서버가 실행 중인지 확인해 주세요.'); }
    if (!response.ok) { const error=new Error(result.error || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'); error.status=response.status; throw error; }
    return result;
  }
  // Public local-demo labels contain no quote, contact, budget or private module data.
  async function loadIdentities() {
    const raw = await request('demo-options', 'GET', undefined, false);
    identities = (isBuyer ? raw.projects : raw.suppliers).map(item => ({id:item.id, label:isBuyer ? `${item.company} · ${item.name}` : item.name, isDemo:Boolean(item.isDemo)}));
    if (explicitEntity && !entityId) { if (!identities.some(item=>item.id===explicitEntity)) throw new Error('전달된 가입 대상을 찾을 수 없습니다. 이전 대상으로 자동 전환하지 않습니다.'); entityId=explicitEntity; }
    if (!identities.some(item => item.id === entityId)) entityId = identities.find(item => item.id === getSaved())?.id || identities[0]?.id || '';
  }
  function scopedView(raw) {
    const ownQuotes = (raw.quotes || []).filter(q => isBuyer ? q.projectId === entityId && q.status === 'received' : q.supplierId === entityId);
    const projectIds = isBuyer ? new Set([entityId]) : new Set(ownQuotes.map(q => q.projectId));
    const supplierIds = isBuyer ? new Set(ownQuotes.map(q => q.supplierId)) : new Set([entityId]);
    return {
      projects:(raw.projects || []).filter(p => projectIds.has(p.id)),
      suppliers:(raw.suppliers || []).filter(s => supplierIds.has(s.id)),
      quotes:ownQuotes,
      milestones:(raw.milestones || []).filter(m => projectIds.has(m.projectId)),
      tasks:(raw.tasks || []).filter(t => projectIds.has(t.projectId)),
      meta:raw.meta || {}
    };
  }
  async function refresh() {
    const sequence = ++version;
    const requestedEntity = entityId;
    fetching = true; loadError = ''; state = null; render();
    if (!requestedEntity) { fetching = false; render(); return; }
    try {
      const raw = await request('state', 'GET', undefined, true, requestedEntity);
      if (sequence !== version || entityId !== requestedEntity) return;
      state = scopedView(raw);
      saveIdentity(role, entityId);
      if (projectFilter && !state.projects.some(p => p.id === projectFilter)) projectFilter = '';
    } catch (error) { if (sequence === version) loadError = error.message; }
    finally { if (sequence === version) { fetching = false; render(); } }
  }
  function header() {
    return `<header class="portal-header"><div class="portal-header-inner"><a class="brand" href="/"><span class="brandmark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20V9m18 11V9M3 15h18M3 9c5 0 5-5 9-5s4 5 9 5M8 12v8m8-8v8"/></svg></span>AX브릿지</a><nav class="portal-role-nav" aria-label="검토용 역할 전환"><a href="/admin.html">관리자</a>${isBuyer?`<a href="/consultation.html${entityId?`?entity=${encodeURIComponent(entityId)}`:''}">상담 접수</a>`:''}<a href="/buyer.html" ${isBuyer ? 'aria-current="page"' : ''}>수요기업</a><a href="/supplier.html" ${role === 'supplier' ? 'aria-current="page"' : ''}>공급기업</a><a href="/signup.html" ${isSignup ? 'aria-current="page"' : ''}>가입 체험</a></nav><span class="portal-demo-label">검토용 역할 전환 · 실제 인증 아님</span></div></header>`;
  }
  function render() {
    if (isSignup) return renderSignup();
    const validPages = isBuyer ? ['overview','request','quotes','progress'] : ['overview','quotes','progress'];
    const nextPage = location.hash.slice(1) || 'overview';
    page = validPages.includes(nextPage) ? nextPage : 'overview';
    const identity = isBuyer ? currentProject() : currentSupplier();
    const label = isBuyer ? identity?.company : identity?.name;
    const navItems = isBuyer ? [['overview','grid','대시보드'],['request','folder','내 요청서'],['quotes','quote','받은 견적'],['progress','check','진행 · 검수']] : [['overview','grid','대시보드'],['quotes','quote','내 견적'],['progress','check','결과물 제출']];
    app.innerHTML = `${header()}<div class="portal-layout"><aside class="portal-aside"><section class="portal-identity"><div class="portal-avatar">${isBuyer ? '수요' : '공급'}</div><h2>${escape(label || (isBuyer ? '수요기업 포털' : '공급기업 포털'))}${demo(identity)}</h2><p>${isBuyer ? '우리 기업의 전환을 한 걸음씩' : '당신의 전문성이 필요한 연결'}</p><label for="portal-entity">${isBuyer ? '시연할 요청 선택' : '시연할 공급기업 선택'}</label><select id="portal-entity" ${busy || !identities.length ? 'disabled' : ''}>${identities.length ? identities.map(item => `<option value="${escape(item.id)}" ${item.id === entityId ? 'selected' : ''}>${escape(item.label)}${item.isDemo ? ' (가상)' : ''}</option>`).join('') : '<option value="">등록된 항목 없음</option>'}</select><small>선택기는 공개 시연 목록의 이름만 사용하는 도구입니다. 계정 로그인이나 기업 간 접근 격리가 아닙니다.</small></section><nav class="portal-navigation" aria-label="${isBuyer ? '수요기업' : '공급기업'} 메뉴">${navItems.map(([id, iconName, label]) => `<a href="#${id}" class="${page === id ? 'active' : ''}" ${page === id ? 'aria-current="page"' : ''}>${icon(iconName)}${label}${id === 'quotes' && state ? `<b>${state.quotes.length}</b>` : ''}</a>`).join('')}</nav><div class="portal-help"><strong>함께 만드는 더 나은 전환</strong><p>${isBuyer ? '문제 정의부터 견적 비교, 결과물 검수까지. 같은 요청을 함께 보며 다음 단계를 준비하세요.' : '배정된 요청의 조건을 확인하고, 견적과 결과물을 중개 운영팀과 함께 관리하세요.'}</p></div></aside><main id="portal-main" class="portal-main" tabindex="-1">${fetching ? '<div class="portal-inline-load" role="status">선택한 기업의 정보를 불러오는 중…</div>' : loadError ? `<div class="portal-error" role="alert">${escape(loadError)}<br>${btn('retry','다시 연결')}</div>` : !entityId || !state ? empty('등록된 시연 항목이 없습니다','검토용 가입으로 첫 요청 또는 공급기업 프로필을 만들 수 있습니다.',`<a class="btn primary" href="/signup.html?role=${role}">검토용 가입 시작</a>`) : renderPage()}<footer class="portal-footer"><span>AX브릿지 · ${isBuyer ? '수요기업' : '공급기업'} 포털 · 작업명</span><span>로컬 검토용 MVP · 실제 고객 정보 입력 전 인증 및 접근제어 필요</span></footer></main></div>`;
  }
  function pageHead(eyebrow, title, detail, actions = '') { return `<div class="portal-page-head"><div><div class="eyebrow">${escape(eyebrow)}</div><h1>${escape(title)}</h1><p>${escape(detail)}</p></div>${actions}</div>`; }
  function renderPage() { return ({overview:renderOverview,request:renderRequest,quotes:renderQuotes,progress:renderProgress}[page] || renderOverview)(); }
  function stat(label, value, suffix, detail, iconName) { return `<div class="portal-stat"><span>${escape(label)}${icon(iconName)}</span><strong>${escape(value)}<small>${escape(suffix)}</small></strong><p>${escape(detail)}</p></div>`; }
  function tasks() {
    const items = state.tasks.filter(t => !t.done).sort((a,b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).slice(0,5);
    const reviews = state.milestones.filter(m => isBuyer ? m.status === 'submitted' : m.status === 'revision').slice(0,2);
    return `<section class="portal-card"><div class="section-title"><h2>다가오는 할 일</h2>${icon('clock')}</div>${reviews.map(m => `<a href="#progress" class="portal-alert-row"><span class="portal-alert-icon">${icon('check')}</span><div><strong>${isBuyer ? '결과물 검수' : '수정 요청 확인'} · ${escape(m.title)}</strong><small>${date(m.dueDate)} · ${escape(titleOf(m.projectId))}</small></div></a>`).join('')}${items.map(t => `<div class="portal-alert-row"><span class="portal-alert-icon">${icon('clock')}</span><div><strong>${escape(t.title)}</strong><small>${date(t.dueDate)}${isBuyer ? '' : ` · ${escape(titleOf(t.projectId))}`}</small></div></div>`).join('')}${!items.length && !reviews.length ? empty('지금 확인할 할 일이 없어요','새 일정이나 검수 요청이 생기면 이곳에 표시됩니다.') : ''}</section>`;
  }
  function flow(project) { const current = Object.keys(stageNames).indexOf(project.stage); return `<div class="portal-flow" aria-label="진행 단계: ${escape(stageNames[project.stage] || project.stage)}">${Object.entries(stageNames).map(([stage, label], index) => `<div class="portal-step ${index < current ? 'done' : ''} ${index === current ? 'current' : ''}">${label}</div>`).join('')}</div>`; }
  function selectedSupplier(project) { const quote = state.quotes.find(q => q.id === project?.selectedQuoteId); return quote ? {quote,supplier:state.suppliers.find(s => s.id === quote.supplierId)} : null; }
  function selectedPanel(project) { const chosen = selectedSupplier(project); return chosen ? `<div class="portal-choice"><div><label>관리자 기록 · 선택된 공급기업</label><strong>${escape(chosen.supplier?.name || '선택 공급기업')}${demo(chosen.supplier)}</strong><p>${number(chosen.quote.amount)}원 · ${number(chosen.quote.durationWeeks)}주<br>내부 선택 기록이며 계약 체결이나 결제 완료를 뜻하지 않습니다.</p></div>${icon('shield')}</div>` : ''; }
  function renderOverview() {
    const reviews = state.milestones.filter(m => m.status === 'submitted').length;
    const approved = state.milestones.filter(m => m.status === 'approved').length;
    if (isBuyer) {
      const project = currentProject();
      if (!project) return empty('요청서를 찾을 수 없습니다','다른 시연 요청을 선택하거나 새로 등록해 주세요.');
      return `${pageHead('BUYER WORKSPACE','우리의 전환, 한눈에','요청부터 결과물까지, 다음 단계를 함께 확인하세요',`<a class="btn" href="/signup.html?role=buyer">${icon('plus')}새 요청 등록</a>`)}<section class="portal-hero"><div><div class="eyebrow">YOUR NEXT STEP</div><h2>${reviews ? '확인할 결과물이 도착했어요' : project.stage === 'consultation' ? '첫 연결을 준비하고 있어요' : project.stage === 'quotation' ? '우리에게 맞는 제안을 살펴보세요' : project.stage === 'completed' ? '전환의 한 단계를 마쳤어요' : '함께 정한 목표를 향해 나아가요'}</h2><p>${reviews ? '제출된 결과물과 검수 기준을 확인한 뒤 승인 또는 수정 의견을 남겨 주세요.' : project.stage === 'consultation' ? '현재의 문제와 원하는 변화를 구체적으로 정리하면 더 알맞은 연결을 준비할 수 있어요.' : '프로젝트의 요청 조건, 받은 견적, 검수 내역을 한곳에서 확인할 수 있습니다.'}</p></div><a class="btn" href="#${reviews ? 'progress' : project.stage === 'quotation' ? 'quotes' : 'request'}">${reviews ? '결과물 확인' : project.stage === 'quotation' ? '견적 살펴보기' : '내 요청서 확인'}${icon('arrow')}</a></section><div class="portal-stats">${stat('받은 견적',state.quotes.length,'건','수신 완료된 제안','quote')}${stat('검수 대기',reviews,'건','결과물 확인이 필요해요','check')}${stat('검수 완료',approved,'건',`전체 결과물 ${state.milestones.length}건`,'folder')}</div><div class="portal-columns"><div><section class="portal-card"><div class="section-title"><h2>내 프로젝트</h2><a href="#request">요청서 보기 ${icon('arrow')}</a></div><div class="portal-summary-name">${escape(project.name)}</div><div class="portal-summary-sub"><span>${escape(serviceNames[project.serviceType] || project.serviceType)}</span><span>·</span><span>${escape(project.industry || '업종 미정')}</span>${demo(project)}</div>${flow(project)}<div class="portal-facts">${fact('희망 완료일',date(project.targetDate))}${fact('희망 예산',`${number(project.budget)}원`)}</div></section>${selectedPanel(project)}</div>${tasks()}</div><p class="portal-footnote">가상 표시는 시연용 데이터입니다. 견적·선택·검수 기록은 실제 계약이나 금융 거래를 실행하지 않습니다.</p>`;
    }
    const awaiting = state.quotes.filter(q => q.status === 'requested').length;
    const revisions = state.milestones.filter(m => m.status === 'revision').length;
    const openMilestones = state.milestones.filter(m => ['planned','revision'].includes(m.status)).length;
    return `${pageHead('PARTNER WORKSPACE','전문성을 연결하는 공간','배정된 요청을 확인하고 제안과 결과물을 관리하세요')}<section class="portal-hero"><div><div class="eyebrow">LET’S BUILD TOGETHER</div><h2>${awaiting ? '다음 연결은 당신의 제안에서' : revisions ? '더 좋은 결과를 위한 다음 단계' : '좋은 제안이 좋은 전환을 만듭니다'}</h2><p>${awaiting ? '견적 요청의 문제와 조건을 살펴보고, 실행 범위와 운영 계획을 구체적으로 제안해 주세요.' : revisions ? '수요기업이 남긴 수정 의견을 확인하고 보완한 결과물을 다시 제출해 주세요.' : '내 견적과 배정된 프로젝트만 확인하고, 약속한 결과물을 제출할 수 있습니다.'}</p></div><div class="portal-hero-count">${awaiting || openMilestones}<small>${awaiting ? '작성할 견적 요청' : '제출할 결과물'}</small></div></section><div class="portal-stats">${stat('배정된 프로젝트',state.projects.length,'건','내 견적이 연결된 요청','folder')}${stat('작성할 견적',awaiting,'건',`제출 완료 ${state.quotes.filter(q => q.status === 'received').length}건`,'quote')}${stat('수정 요청',revisions,'건','검수 의견을 확인해 주세요','check')}</div><div class="portal-columns"><section class="portal-card"><div class="section-title"><h2>배정된 프로젝트</h2><a href="#quotes">내 견적 보기 ${icon('arrow')}</a></div>${state.projects.map(p => `<article class="portal-assignment"><div class="portal-assignment-icon">${escape(p.company?.replace('가상 ','').slice(0,2) || 'AX')}</div><div><h3>${escape(p.name)}${demo(p)}</h3><p>${escape(p.company)} · ${escape(serviceNames[p.serviceType] || p.serviceType)} · ${date(p.targetDate)}</p><details class="portal-project-detail"><summary>요청 내용 확인</summary><h4>현재 문제</h4><p class="portal-description">${escape(p.problem || '등록된 문제 정의가 없습니다.')}</p><h4>요구사항 · 성공 기준</h4><p class="portal-description">${escape(p.requirements || '등록된 요구사항이 없습니다.')}</p><h4>추가 조건</h4><p class="portal-description">${escape(p.conditions || '등록된 추가 조건이 없습니다.')}</p>${p.serviceType === 'education' ? `<h4>교육 조건</h4><p class="portal-description">${escape(p.audience || '대상 미정')} · ${number(p.participantCount)}명 · ${number(p.trainingHours)}시간\n${escape(p.learningGoal || '')}\n${escape(p.topics || '')}</p>` : p.serviceType === 'infrastructure' ? `<h4>인프라 구축 목적</h4><p class="portal-description">${escape(p.infrastructurePurpose || '미정')}</p><h4>기존 환경 / 설치 장소</h4><p class="portal-description">${escape(p.existingEnvironment || '미정')}\n${escape(p.installationSite || '미정')}</p>` : ''}</details></div>${badge(p.stage)}</article>`).join('') || empty('아직 배정된 프로젝트가 없어요','관리자가 이 공급기업에 견적 요청을 배정하면 여기에 표시됩니다.')}</section>${tasks()}</div><p class="portal-footnote">다른 공급기업의 견적은 표시하지 않습니다. 배정과 선택은 실제 계약 체결을 의미하지 않습니다.</p>`;
  }
  function fact(label, value) { return `<div class="portal-fact"><span>${escape(label)}</span><strong>${value}</strong></div>`; }
  function educationFacts(project) { return `${fact('교육 대상 / 인원',`${escape(project.audience || '미정')} / ${number(project.participantCount)}명`)}${fact('현재 수준',escape(project.skillLevel || '미정'))}${fact('방식 / 교육 시간',`${escape({online:'온라인',offline:'오프라인',hybrid:'혼합'}[project.deliveryMode] || '미정')} / ${number(project.trainingHours)}시간`)}${fact('교육 장소',escape(project.location || '미정'))}`; }
  function renderRequest() {
    const project = currentProject();
    if (!project) return empty('요청서를 찾을 수 없습니다','다른 시연 요청을 선택해 주세요.');
    return `${pageHead('YOUR REQUEST','내 요청서','해결할 문제와 원하는 결과를 구체적으로 정리해 주세요',btn('edit-request','요청서 수정','edit'))}<div class="portal-request-grid"><div><section class="portal-card"><div class="portal-summary-name">${escape(project.name)}${demo(project)}</div><div class="portal-summary-sub">${escape(project.company)} · ${escape(serviceNames[project.serviceType] || project.serviceType)}</div><h3>현재 해결하고 싶은 문제</h3><p class="portal-description">${escape(project.problem || '현재 문제를 정리해 주세요.')}</p><h3>요구사항 · 성공 기준</h3><p class="portal-description">${escape(project.requirements || '원하는 결과와 성공 기준을 입력해 주세요.')}</p><h3>추가 조건 · 교육 요청 조건</h3><p class="portal-description">${escape(project.conditions || '등록된 추가 조건이 없습니다.')}</p></section>${project.serviceType === 'education' ? `<section class="portal-card"><h2>교육 요청 조건</h2><div class="portal-facts">${educationFacts(project)}</div><h3>교육 목표</h3><p class="portal-description">${escape(project.learningGoal || '미정')}</p><h3>희망 주제</h3><p class="portal-description">${escape(project.topics || '미정')}</p></section>` : project.serviceType === 'infrastructure' ? `<section class="portal-card"><h2>AI 인프라 구축 조건</h2><h3>구축 목적</h3><p class="portal-description">${escape(project.infrastructurePurpose || '미정')}</p><h3>기존 환경</h3><p class="portal-description">${escape(project.existingEnvironment || '미정')}</p><h3>설치 장소</h3><p class="portal-description">${escape(project.installationSite || '미정')}</p></section>` : ''}</div><div><section class="portal-card"><h2>진행 조건</h2>${badge(project.stage)}<div class="portal-facts">${fact('희망 예산',`${number(project.budget)}원`)}${fact('희망 완료일',date(project.targetDate))}${fact('담당자',escape(project.contactName || '미정'))}${fact('업종',escape(project.industry || '미정'))}</div>${flow(project)}</section>${selectedPanel(project)}<p class="portal-footnote">조건 수정은 요청서에 기록됩니다. 단계 변경과 공급기업 선정은 관리자 화면에서 진행합니다.</p></div></div>`;
  }
  function quoteField(label, content) { return `<div class="quote-field"><label>${escape(label)}</label><div>${escape(content || '별도 협의')}</div></div>`; }
  function projectSelect() { return !isBuyer && state.projects.length > 1 ? `<div class="portal-filter"><label class="portal-filter-label" for="portal-project-filter">프로젝트별 보기</label><select id="portal-project-filter"><option value="">모든 배정 프로젝트</option>${state.projects.map(p => `<option value="${escape(p.id)}" ${projectFilter === p.id ? 'selected' : ''}>${escape(p.name)}</option>`).join('')}</select></div>` : ''; }
  function renderQuotes() {
    const project = currentProject();
    const quotes = state.quotes.filter(q => !projectFilter || isBuyer || q.projectId === projectFilter);
    return `${pageHead(isBuyer ? 'PROPOSALS FOR YOU' : 'YOUR PROPOSALS',isBuyer ? '받은 견적' : '내 견적',isBuyer ? '금액, 실행 범위, 운영 조건을 함께 살펴보세요' : '우리 기업의 제안 범위와 금액을 작성하고 제출하세요')}${isBuyer ? selectedPanel(project) : projectSelect()}${!quotes.length ? empty(isBuyer ? '아직 받은 견적이 없습니다' : '연결된 견적 요청이 없습니다',isBuyer ? '공급기업이 제안을 제출하면 여기에 표시됩니다.' : '관리자가 프로젝트에 견적 요청을 배정하면 작성할 수 있습니다.') : `<div class="portal-quote-grid">${quotes.map(q => {
      const supplier = state.suppliers.find(s => s.id === q.supplierId);
      const linked = findProject(q.projectId);
      const selected = isBuyer && project?.selectedQuoteId === q.id;
      return `<article class="quote-card ${selected ? 'is-selected' : ''}">${selected ? '<div class="quote-selected">관리자 기록 · 선택된 제안</div>' : ''}<div class="quote-card-head"><div class="quote-card-top"><span class="portal-service-tag">${escape(serviceNames[linked?.serviceType] || 'AX 구축')}</span>${badge(q.status,{requested:'작성 요청',received:'제출 완료'})}</div><h3>${escape(isBuyer ? supplier?.name || '공급기업 정보 없음' : linked?.name || '프로젝트')}${demo(q)}</h3><p>${escape(isBuyer ? supplier?.specialty || '전문 분야 미등록' : linked?.company || '')}</p><div class="quote-price">${money(q.amount)}</div><p>수행 기간 ${number(q.durationWeeks)}주 · 유효일 ${date(q.validUntil)}</p></div><div class="quote-body">${quoteField('제안 범위',q.scope)}${quoteField('포함되지 않는 항목',q.exclusions)}${quoteField('유지보수 · 운영 조건',q.maintenance)}${linked?.serviceType === 'education' ? `${quoteField('교육 커리큘럼',q.curriculum)}${quoteField('실습 내용',q.practice)}${quoteField('강사 / 교육 시간',`${q.instructor || '미정'} / ${number(q.trainingHours)}시간`)}` : linked?.serviceType === 'infrastructure' ? `${quoteField('장비 사양',q.specifications)}${quoteField('수량 / 설치 비용',`${number(q.quantity)}대 / ${number(q.installationCost)}원`)}${quoteField('납품 일정',q.deliveryDate || '미정')}${quoteField('보증 · A/S 조건',q.warranty)}` : ''}</div>${!isBuyer ? `<div class="quote-actions">${btn('edit-quote',q.status === 'requested' ? '견적 작성 · 제출' : '견적 수정','edit',`data-id="${escape(q.id)}"`,true)}</div>` : ''}</article>`;
    }).join('')}</div>`}<p class="portal-footnote">${isBuyer ? '표시된 금액은 공급기업의 제안입니다. 세금·지급 조건은 별도 협의가 필요하며, 이 화면에서 결제 또는 계약이 실행되지 않습니다.' : '제출하면 수요기업의 받은 견적에 표시됩니다. 금액은 원 단위이며 실제 계약이나 청구가 발생하지 않습니다. 다른 공급기업의 제안은 공개되지 않습니다.'}</p>`;
  }
  function renderProgress() {
    const milestones = state.milestones.filter(m => isBuyer || !projectFilter || m.projectId === projectFilter).sort((a,b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    const approved = milestones.filter(m => m.status === 'approved').length;
    return `${pageHead(isBuyer ? 'PROJECT PROGRESS' : 'DELIVER YOUR WORK',isBuyer ? '진행 · 검수' : '결과물 제출',isBuyer ? '약속한 기준에 맞춰 결과물을 확인해 주세요' : '배정된 마일스톤의 결과물을 제출하고 검수 의견을 확인하세요')}${projectSelect()}${milestones.length ? `<div class="portal-progress-meter"><strong>${approved}<small> / ${milestones.length} 검수 완료</small></strong><div class="progress-track" role="progressbar" aria-label="검수 완료 비율" aria-valuemin="0" aria-valuemax="${milestones.length}" aria-valuenow="${approved}"><div style="width:${Math.round(approved / milestones.length * 100)}%"></div></div><span>${milestones.filter(m => m.status === 'submitted').length}건 검수 대기</span></div>${milestones.map((m,index) => `<article class="portal-milestone"><div class="portal-milestone-title"><span class="milestone-number">${String(index + 1).padStart(2,'0')}</span><div><h2>${escape(m.title)}</h2><p>예정일 ${date(m.dueDate)}${isBuyer ? '' : ` · ${escape(titleOf(m.projectId))}`}</p></div>${badge(m.status,milestoneNames)}</div><div class="milestone-content"><div><label>검수 기준</label><div>${escape(m.acceptanceCriteria || '등록된 검수 기준이 없습니다.')}</div></div><div><label>제출된 결과물 · 설명</label><div>${escape(m.deliverable || '아직 결과물이 제출되지 않았습니다.')}</div></div></div>${m.reviewNote ? `<div class="review-note"><strong>검수 의견</strong><br>${escape(m.reviewNote)}</div>` : ''}<div class="milestone-actions">${isBuyer ? m.status === 'submitted' ? `<span class="portal-review-hint">실제 지급이나 계약 완료를 실행하지 않습니다</span>${btn('review-revision','수정 요청','','data-id="'+escape(m.id)+'"')}${btn('review-approved','검수 승인','check','data-id="'+escape(m.id)+'"',true)}` : `<span class="portal-review-hint">${m.status === 'approved' ? '승인된 검수 기록입니다' : m.status === 'revision' ? '공급기업의 보완 제출을 기다리고 있습니다' : '공급기업이 제출하면 검수할 수 있습니다'}</span>` : m.status !== 'approved' ? `<span class="portal-review-hint">제출 후 수요기업의 검수가 진행됩니다</span>${btn('submit-deliverable',m.status === 'submitted' ? '결과물 수정 · 재제출' : '결과물 제출','send','data-id="'+escape(m.id)+'"',true)}` : '<span class="portal-review-hint">수요기업이 검수를 완료한 결과물입니다</span>'}</div></article>`).join('')}` : empty('아직 진행할 마일스톤이 없습니다',isBuyer ? '관리자가 수행 일정과 검수 기준을 등록하면 여기에 표시됩니다.' : '선택된 프로젝트의 수행 마일스톤이 배정되면 결과물을 제출할 수 있습니다.')}<p class="portal-footnote">마일스톤과 검수 기준은 관리자가 등록합니다. 결과물은 설명 텍스트로 기록하며 파일 업로드·전송 기능은 포함되지 않습니다.</p>`;
  }
  function input(name,label,value = '',type = 'text',attrs = '',wide = false) { return `<div class="field ${wide ? 'wide' : ''}"><label for="field-${name}">${escape(label)}</label><input id="field-${name}" name="${name}" type="${type}" value="${escape(value)}" ${attrs}></div>`; }
  function textarea(name,label,value = '',required = false) { return `<div class="field wide"><label for="field-${name}">${escape(label)}</label><textarea id="field-${name}" name="${name}" maxlength="10000" ${required ? 'required' : ''}>${escape(value)}</textarea></div>`; }
  function select(name,label,value,values) { return `<div class="field"><label for="field-${name}">${escape(label)}</label><select id="field-${name}" name="${name}">${Object.entries(values).map(([key, text]) => `<option value="${escape(key)}" ${key === value ? 'selected' : ''}>${escape(text)}</option>`).join('')}</select></div>`; }
  function form(title,detail,fields,save,submit = '변경 저장') {
    if (busy) return;
    lastFocus = document.activeElement;
    dialog.innerHTML = `<form id="portal-form"><div class="modal-head"><div><h2 id="portal-modal-title">${escape(title)}</h2><p>${escape(detail)}</p></div><button type="button" class="icon-btn" data-action="close-modal" aria-label="닫기">${icon('close')}</button></div><div class="modal-body"><div class="form-grid">${fields}</div><div id="portal-form-error" class="form-error" role="alert" hidden></div></div><div class="modal-footer"><span class="modal-note">로컬 검토용 · 실제 인증 및 계약 미구현</span><div><button type="button" class="btn" data-action="close-modal">취소</button><button type="submit" class="btn primary">${escape(submit)}</button></div></div></form>`;
    dialog.showModal();
    const formElement = dialog.querySelector('form');
    formElement.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || !formElement.reportValidity()) return;
      const data = Object.fromEntries(new FormData(formElement));
      for (const field of formElement.querySelectorAll('input[type=number]')) data[field.name] = Number(data[field.name]);
      for (const [key,value] of Object.entries(data)) if (typeof value === 'string') data[key] = value.trim();
      const requiredEmpty = [...formElement.querySelectorAll('[required]')].find(field => !String(data[field.name] ?? '').trim());
      if (requiredEmpty) { const error = dialog.querySelector('#portal-form-error'); error.textContent = '필수 항목에 공백만 입력할 수 없습니다.'; error.hidden = false; requiredEmpty.focus(); return; }
      busy = true;
      const submitButton = formElement.querySelector('[type=submit]');
      const oldText = submitButton.textContent;
      formElement.querySelectorAll('button,input,textarea,select').forEach(element => element.disabled = true);
      submitButton.textContent = '저장 중…';
      try { await save(data); dialog.close(); await refresh(); notice('변경 내용을 저장했습니다'); }
      catch (error) { const errorElement = dialog.querySelector('#portal-form-error'); errorElement.textContent = error.message; errorElement.hidden = false; }
      finally { busy = false; formElement.querySelectorAll('button,input,textarea,select').forEach(element => element.disabled = false); submitButton.textContent = oldText; const picker = document.querySelector('#portal-entity'); if (picker) picker.disabled = !identities.length; }
    });
  }
  function editRequest() {
    const project = currentProject(); if (!project) return;
    const target = entityId;
    const fields = textarea('problem','현재 해결하고 싶은 문제',project.problem,true) + textarea('requirements','요구사항 · 성공 기준',project.requirements) + textarea('conditions','추가 조건 · 교육 요청 조건',project.conditions || '');
    form('내 요청서 수정','변경한 요청 조건은 관리자와 배정된 공급기업에 표시됩니다.',fields,data => request(`projects/${encodeURIComponent(project.id)}`,'PATCH',data,true,target));
  }
  function editQuote(id) {
    const quote = state.quotes.find(q => q.id === id && q.supplierId === entityId); if (!quote) return;
    const linked = findProject(quote.projectId), target = entityId;
    let fields = `<div class="portal-demo-form-notice">${escape(linked?.name || '')}<br>저장하면 담당 영업자의 검토를 거친 뒤 고객에게 공유됩니다. 이미 공유한 견적의 내용 변경 시 공유가 해제됩니다. 실제 계약·청구는 발생하지 않습니다.</div>` + input('amount','견적 금액 (원)',quote.amount,'number','min="0" max="1000000000000000" step="1" required') + input('durationWeeks','수행 기간 (주)',quote.durationWeeks,'number','min="0" max="520" step="0.5" required') + textarea('scope','제안 범위',quote.scope,true) + textarea('exclusions','포함되지 않는 항목',quote.exclusions) + textarea('maintenance','유지보수 · 운영 조건',quote.maintenance) + input('validUntil','견적 유효일',quote.validUntil,'date','min="1900-01-01" max="9999-12-31"');
    if (linked?.serviceType === 'education') fields += input('trainingHours','교육 시간',quote.trainingHours,'number','min="0" max="10000" step="0.5"') + input('instructor','강사 소개',quote.instructor,'text','maxlength="500"',true) + textarea('curriculum','교육 커리큘럼',quote.curriculum) + textarea('practice','실습 내용',quote.practice);
    if (linked?.serviceType === 'infrastructure') fields += textarea('specifications','장비 사양',quote.specifications) + input('quantity','장비 수량',quote.quantity,'number','min="0" max="1000000000" step="1"') + input('installationCost','설치 비용 (원)',quote.installationCost,'number','min="0" max="1000000000000000" step="1"') + input('deliveryDate','납품 일정',quote.deliveryDate,'date','min="1900-01-01" max="9999-12-31"') + textarea('warranty','보증 · A/S 조건',quote.warranty);
    form('견적 작성 · 제출','배정된 요청에 우리 기업의 제안을 기록합니다.',fields,data => request(`quotes/${encodeURIComponent(id)}`,'PATCH',{...data,status:'received'},true,target),'견적 저장 · 제출');
  }
  function reviewMilestone(id,status) {
    const milestone = state.milestones.find(m => m.id === id && m.projectId === entityId && m.status === 'submitted'); if (!milestone) return;
    const target = entityId;
    const approval = status === 'approved';
    form(approval ? '결과물 검수를 승인할까요?' : '결과물 수정을 요청할까요?',milestone.title,`<div class="portal-demo-form-notice">검수 기준: ${escape(milestone.acceptanceCriteria || '별도 등록된 기준 없음')}<br>${approval ? '승인은 이 결과물의 검수 기록만 변경합니다. 지급이나 계약 완료를 실행하지 않습니다.' : '필요한 수정 내용을 구체적으로 남겨 주세요.'}</div>${textarea('reviewNote',approval ? '검수 의견 (선택)' : '수정 요청 내용',milestone.reviewNote,!approval)}`,data => request(`milestones/${encodeURIComponent(id)}`,'PATCH',{reviewNote:data.reviewNote,status},true,target),approval ? '검수 승인 기록' : '수정 요청 보내기');
  }
  function submitMilestone(id) {
    const milestone = state.milestones.find(m => m.id === id && m.status !== 'approved'); if (!milestone) return;
    const target = entityId;
    form('결과물 제출',milestone.title,`<div class="portal-demo-form-notice">검수 기준: ${escape(milestone.acceptanceCriteria || '별도 등록된 기준 없음')}<br>결과물 내용을 텍스트로 기록하면 수요기업에 검수를 요청합니다. 파일 업로드는 지원하지 않습니다.</div>${textarea('deliverable','결과물 설명 · 확인 내용',milestone.deliverable,true)}`,data => request(`milestones/${encodeURIComponent(id)}`,'PATCH',{deliverable:data.deliverable,status:'submitted'},true,target),'결과물 제출');
  }

  function renderSignup() {
    const serviceParam=new URLSearchParams(location.search).get('service');
    const initialService=['ax','education','infrastructure'].includes(serviceParam)?serviceParam:'ax';
    const initialRole = new URLSearchParams(location.search).get('role') === 'supplier' ? 'supplier' : 'buyer';
    app.innerHTML = `${header()}<main id="portal-main" class="signup-main" tabindex="-1"><div class="signup-intro"><div class="eyebrow">A BETTER WAY TO CONNECT</div><h1>더 나은 전환의<br>첫 연결을 시작하세요</h1><p>해결하고 싶은 문제와 전문성을 연결합니다.<br>AX 구축부터 AI 교육까지, AX브릿지와 함께.</p><div class="signup-promise">${icon('folder')}<div><strong>수요기업</strong><span>요청 등록 · 견적 검토 · 결과물 검수</span></div></div><div class="signup-promise">${icon('people')}<div><strong>공급기업</strong><span>배정 요청 확인 · 견적 제출 · 결과물 공유</span></div></div><div class="signup-safety">${icon('shield')}<p>검토용 가입 · 실제 인증 미구현<br>비밀번호를 수집하지 않으며 이메일 인증이나 계정 보호 기능은 없습니다. 가상의 회사·담당자 정보로만 체험해 주세요.</p></div></div><section class="signup-form-card"><h2>검토용 가입</h2><p>시연할 역할과 기본 정보를 입력해 주세요</p><form id="signup-form"><fieldset class="signup-role-picker"><legend>어떤 역할로 시작할까요?</legend><label><input type="radio" name="role" value="buyer" ${initialRole === 'buyer' ? 'checked' : ''}><span>${icon('folder')}수요기업<small>문제를 해결하고 싶어요</small></span></label><label><input type="radio" name="role" value="supplier" ${initialRole === 'supplier' ? 'checked' : ''}><span>${icon('people')}공급기업<small>전문성을 제공해요</small></span></label></fieldset><div class="form-grid">${input('company','회사명 (가상)', '', 'text','maxlength="200" placeholder="예: 가상 미래제조" required',true)}${input('contactName','담당자명 (가상)','','text','maxlength="100" placeholder="예: 김담당" required')}${input('contactEmail','이메일 (가상)','','email','maxlength="254" placeholder="demo@example.com" required')}${input('referralCode','추천코드 (선택)',new URLSearchParams(location.search).get('ref')||'','text','maxlength="100"',true)}${select('serviceType','관심 서비스',initialService,serviceNames)}<div class="field" id="signup-service-context"><label>이렇게 시작해요</label><p class="signup-context">${initialRole === 'buyer' ? '첫 요청이 상담 접수됩니다' : '공급기업 후보로 등록됩니다'}</p></div><div id="signup-buyer-fields" class="signup-buyer-fields" ${initialRole === 'supplier' ? 'hidden' : ''}>${input('requestTitle','첫 요청 제목',new URLSearchParams(location.search).get('request')||'','text','maxlength="200" placeholder="예: 수주 업무 자동화" '+(initialRole === 'buyer' ? 'required' : ''),true)}${textarea('problem','해결하고 싶은 문제','',initialRole === 'buyer')}</div></div><div class="portal-demo-form-notice signup-notice">입력 내용은 이 컴퓨터의 시연 데이터에 저장됩니다. 실제 계정이나 계약은 생성되지 않으며, 역할 선택만으로 누구나 화면을 전환할 수 있습니다.</div><div class="form-error" id="signup-error" role="alert" hidden></div><button class="btn primary full signup-submit" type="submit">검토용 가입 · 시작하기 ${icon('arrow')}</button><p class="signup-bottom">기존 시연 데이터를 보려면 <a href="/buyer.html">수요기업 포털</a> 또는 <a href="/supplier.html">공급기업 포털</a>로 이동하세요</p></form></section></main><footer class="signup-footer">AX브릿지 · 로컬 검토용 MVP · 작업명</footer>`;
    const signupForm = document.querySelector('#signup-form');
    signupForm.addEventListener('change',event => {
      if (event.target.name !== 'role') return;
      const buyer = event.target.value === 'buyer';
      document.querySelector('#signup-buyer-fields').hidden = !buyer;
      document.querySelector('#field-requestTitle').required = buyer;
      document.querySelector('#field-problem').required = buyer;
      document.querySelector('.signup-context').textContent = buyer ? '첫 요청이 상담 접수됩니다' : '공급기업 후보로 등록됩니다';
    });
    signupForm.addEventListener('submit',async event => {
      event.preventDefault(); if (busy || !signupForm.reportValidity()) return;
      const data = Object.fromEntries(new FormData(signupForm));
      for (const key of Object.keys(data)) data[key] = data[key].trim();
      if (data.role === 'supplier') { delete data.requestTitle; delete data.problem; }
      const errorElement = document.querySelector('#signup-error');
      if (Object.entries(data).some(([key,value]) => key!=='referralCode' && !value)) { errorElement.textContent = '필수 항목을 입력해 주세요. 공백만 입력할 수 없습니다.'; errorElement.hidden = false; return; }
      if(!signupAttempt)signupAttempt={key:crypto.randomUUID(),data:structuredClone(data)};
      if(JSON.stringify(data)!==JSON.stringify(signupAttempt.data)){errorElement.textContent='이전 요청의 결과 확인을 위해 기존 입력으로 재시도해 주세요. 새 가입은 별도 페이지에서 시작해 주세요.';errorElement.hidden=false;return;}
      busy = true; errorElement.hidden = true;
      signupForm.querySelectorAll('input,select,textarea,button').forEach(element => element.disabled = true);
      const submit = signupForm.querySelector('[type=submit]'); submit.textContent = '등록 중…';
      try {
        const result = await request('demo-register','POST',data,false);
        if (!['buyer','supplier'].includes(result.role) || typeof result.entityId !== 'string' || !result.entityId) throw new Error('등록 응답을 확인할 수 없습니다. 중복 등록 전에 관리자 화면에서 생성 여부를 확인해 주세요.');
        saveIdentity(result.role,result.entityId);
        location.assign(`/${result.role==='buyer'?'consultation':result.role}.html?entity=${encodeURIComponent(result.entityId)}`);
      } catch (error) { if([400,403,413,415].includes(error.status))signupAttempt=null; errorElement.textContent = error.message; errorElement.hidden = false; busy = false; signupForm.querySelectorAll('input,select,textarea,button').forEach(element => element.disabled = false); submit.textContent = '검토용 가입 · 시작하기'; }
    });
  }
  app.addEventListener('click',event => {
    const button = event.target.closest('[data-action]'); if (!button || busy) return;
    const action = button.dataset.action;
    if (action === 'retry') { initialise(); return; }
    if (fetching || !state) return;
    if (action === 'edit-request' && isBuyer) editRequest();
    if (action === 'edit-quote' && !isBuyer) editQuote(button.dataset.id);
    if (action === 'review-approved' && isBuyer) reviewMilestone(button.dataset.id,'approved');
    if (action === 'review-revision' && isBuyer) reviewMilestone(button.dataset.id,'revision');
    if (action === 'submit-deliverable' && !isBuyer) submitMilestone(button.dataset.id);
  });
  app.addEventListener('change',event => {
    if (event.target.id === 'portal-entity') { if (busy) return; entityId = event.target.value; projectFilter = ''; if (dialog.open) dialog.close(); refresh(); }
    if (event.target.id === 'portal-project-filter') { projectFilter = event.target.value; render(); }
  });
  dialog.addEventListener('click',event => { if (event.target.closest('[data-action="close-modal"]') && !busy) dialog.close(); });
  dialog.addEventListener('cancel',event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close',() => { if (lastFocus?.isConnected) lastFocus.focus(); });
  window.addEventListener('hashchange',() => { if (isSignup) return; if (dialog.open && !busy) dialog.close(); render(); window.scrollTo({top:0,behavior:'instant'}); });
  async function initialise() {
    if (isSignup) { renderSignup(); return; }
    try { await loadIdentities(); await refresh(); }
    catch (error) { fetching = false; loadError = error.message; render(); }
  }
  initialise();
})();
