import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
const officialSupportNotices = JSON.parse(readFileSync(new URL('./docs/support-notices.json', import.meta.url), 'utf8'));


// Every company, requirement, quote and project below is fictional demonstration data.
// Named supplier candidates are contextual examples, not confirmed relationships or offers.
export function makeSeed(now = new Date()) {
  const date = (offset) => {
    const value = new Date(now);
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  };
  const stamp = now.toISOString();
  const ids = Array.from({ length: 14 }, () => randomUUID());
  const suppliers = [
    { id: ids[6], name: '르몽', specialty: 'F&B · 프랜차이즈 마케팅 자동화', industries: ['F&B', '프랜차이즈'], contactName: '', relationship: 'candidate', isDemo: true, note: '공급사 후보 예시입니다. 협업·계약이 확인되지 않았으며 아래 연결 견적은 모두 가상입니다.' },
    { id: ids[7], name: '어크로스', specialty: 'GEO 직접 공급', industries: ['커머스', '전문 서비스'], contactName: '이재홍', relationship: 'candidate', isDemo: true, note: '보고된 맥락을 바탕으로 표시한 공급사 후보입니다. 실제 제휴·계약·제공 범위·가격을 의미하지 않습니다.' },
    { id: ids[8], name: '가상 오퍼레이션랩', specialty: '고객 응대 · 업무 프로세스 자동화', industries: ['커머스', '교육'], contactName: '가상 담당자', relationship: 'candidate', isDemo: true, note: '기능 확인용으로 만든 가상의 공급사입니다.' },
    { id: ids[9], name: '가상 데이터스튜디오', specialty: '데이터 연결 · 영업 리포트', industries: ['제조', '전문 서비스'], contactName: '가상 담당자', relationship: 'candidate', isDemo: true, note: '기능 확인용으로 만든 가상의 공급사입니다.' },
    { id: ids[10], name: '스파르타', specialty: 'AI 교육 중개 후보', industries: [], contactName: '', relationship: 'candidate', isDemo: true, serviceTypes: ['education'], note: '사용자 제공 맥락: 협업 논의 중인 후보입니다. 실제 계약·제휴 체결은 확인되지 않았으며 교육 과정, 연락처, 가격은 미확인입니다.' },
    { id: ids[11], name: '에이블런', specialty: 'AI 교육 중개 후보', industries: [], contactName: '', relationship: 'candidate', isDemo: true, serviceTypes: ['education'], note: '사용자 제공 맥락: 협업 논의 중인 후보입니다. 실제 계약·제휴 체결은 확인되지 않았으며 교육 과정, 연락처, 가격은 미확인입니다.' },
    { id: ids[12], name: '세계경영연구회', specialty: 'AI 교육 중개 후보', industries: [], contactName: '', relationship: 'candidate', isDemo: true, serviceTypes: ['education'], note: '사용자 제공 맥락: 협업 논의 중인 후보입니다. 실제 계약·제휴 체결은 확인되지 않았으며 교육 과정, 연락처, 가격은 미확인입니다.' },
    { id: ids[13], name: '가상 러닝파트너스', specialty: '직무별 생성형 AI 실습', industries: ['교육', '전문 서비스'], contactName: '가상 담당자', relationship: 'candidate', isDemo: true, serviceTypes: ['education'], note: '기능 확인용으로 만든 가상의 교육 공급사입니다.' },
  ].map(s => ({ serviceTypes: ['ax'], ...s }));
  const specs = [
    ['문의 응대 자동화', '가상 모노커머스', '커머스', '반복 문의가 많아 담당자의 응대 시간이 부족합니다.', 'FAQ 분류, 답변 초안, 담당자 연결', 12000000, 24, 'consultation', 'high'],
    ['매장 마케팅 운영 정리', '가상 온기키친', 'F&B', '매장별 마케팅 자료가 흩어져 운영 점검이 어렵습니다.', '캠페인 캘린더, 매장별 콘텐츠 초안, 승인 흐름', 18000000, 35, 'quotation', 'medium'],
    ['생성형 검색 노출 진단', '가상 리프파트너스', '전문 서비스', '생성형 검색에서 브랜드 정보의 정확성을 확인하고 싶습니다.', '현황 진단, 정보 구조 점검, 개선 가이드', 9000000, 21, 'quotation', 'high'],
    ['영업 리포트 자동화', '가상 네스트팩토리', '제조', '주간 영업 리포트를 수작업으로 취합하고 있습니다.', '샘플 데이터 연결, 주간 리포트, 검수 체크리스트', 24000000, 18, 'progress', 'high'],
    ['실무자 AI 활용 교육', '가상 배움온', '교육', '운영팀이 생성형 AI의 안전한 업무 활용 방법을 배우고 싶습니다.', '성인 직원 대상 프롬프트 실습, 검증 방법, 개인정보 주의사항', 15000000, 28, 'progress', 'medium'],
    ['팀장 대상 AI 입문 워크숍', '가상 클리어워크', '전문 서비스', '팀장들이 AI 활용 기회와 검증 기준을 함께 정리하고 싶습니다.', '가상 사례 분석, 업무 적용 계획, 교육 만족도 확인', 8000000, -7, 'completed', 'low'],
  ];
  const projects = specs.map((p, i) => ({
    id: ids[i], serviceType: i >= 4 ? 'education' : 'ax', audience: i >= 4 ? '성인 재직자 (가상)' : '', participantCount: i >= 4 ? 20 : 0, skillLevel: i >= 4 ? '입문' : '', learningGoal: i >= 4 ? '업무에 맞는 AI 활용 과제를 찾고 결과를 검증합니다.' : '', topics: i >= 4 ? '생성형 AI 기초, 프롬프트 실습, 검증과 보안' : '', deliveryMode: 'online', location: '', trainingHours: i >= 4 ? 6 : 0, name: p[0], company: p[1], contactName: '가상 담당자', contactRole: '운영 담당', contactEmail: '', industry: p[2], problem: p[3], requirements: p[4], budget: p[5], targetDate: date(p[6]), stage: p[7], priority: p[8], note: '샘플 데이터 · 실제 상담, 계약, 가격 또는 개인정보가 아닙니다.', selectedQuoteId: null, isDemo: true, createdAt: new Date(now.getTime() - (20 - i * 2) * 86400000).toISOString(), updatedAt: stamp,
  }));
  const q = (project, supplier, amount, weeks, status = 'received') => ({ id: randomUUID(), projectId: ids[project], supplierId: ids[supplier + 6], amount, durationWeeks: weeks, curriculum: project >= 4 ? '가상 커리큘럼: 입문 2시간, 실습 3시간, 검토 1시간' : '', practice: project >= 4 ? '가상 업무 문서로 실습' : '', instructor: project >= 4 ? '가상 강사 (실제 인물 아님)' : '', trainingHours: project >= 4 ? 6 : 0, scope: project >= 4 ? '가상 교육 견적 · 온라인 강의, 실습 자료, 결과 정리' : '가상 견적 · 요구사항 검토, 파일럿 구성, 내부 검수', exclusions: '실제 구축 및 운영 계약 없음 · 외부 서비스 비용 제외', maintenance: '가상 조건: 인수 후 2주 점검', validUntil: date(14), status, isDemo: true });
  const quotes = [q(1, 0, 16500000, 5), q(1, 2, 18000000, 6), q(2, 1, 8500000, 3), q(2, 3, 0, 0, 'requested'), q(3, 3, 22000000, 6), q(4, 7, 14000000, 5), q(5, 7, 7500000, 3)];
  projects[3].selectedQuoteId = quotes[4].id;
  projects[4].selectedQuoteId = quotes[5].id;
  projects[5].selectedQuoteId = quotes[6].id;
  const m = (project, title, offset, status, deliverable, acceptanceCriteria) => ({ id: randomUUID(), projectId: ids[project], title, dueDate: date(offset), status, deliverable, acceptanceCriteria, reviewNote: status === 'approved' ? '샘플 검수 완료 기록' : '' });
  const milestones = [
    m(3, '요구사항 · 데이터 연결 확인', -4, 'approved', '가상 데이터 매핑 문서', '필수 필드와 집계 기준을 확인합니다.'),
    m(3, '주간 리포트 시안 검수', -1, 'submitted', '리포트 시안 v1 (샘플)', '가상 원본 수치와 합계가 일치하고 예외 처리가 보입니다.'),
    m(3, '운영 인수', 18, 'planned', '', '내부 담당자가 샘플 리포트를 재생성할 수 있습니다.'),
    m(4, '커리큘럼 · 실습 구성 검수', 2, 'revision', '교육안 초안 (샘플)', '교육 목표와 실습 난이도가 성인 참여자의 수준에 맞습니다.'),
    m(4, '교육 운영 · 결과 검수', 21, 'planned', '', '교육 시간, 실습 자료, 만족도 집계를 확인합니다.'),
    m(5, '교육 자료 검수', -9, 'approved', '가상 워크숍 자료', '목표, 실습 과정 및 결과 검증 방법을 확인합니다.'),
    m(5, '교육 운영 최종 확인', -7, 'approved', '출결·만족도 요약 (모두 가상)', '계획한 교육과 결과 보고가 완료되었는지 확인합니다.'),
  ];
  const t = (project, title, offset, done = false) => ({ id: randomUUID(), projectId: ids[project], title, dueDate: date(offset), done });
  const tasks = [t(0, '첫 상담 후 요구사항 정리', 0), t(1, '가상 견적 범위 비교', 2), t(2, '요구사항 우선순위 확인', 0), t(3, '리포트 시안 피드백 정리', -1), t(4, '교육 실습 난이도 재검토', 1), t(5, '인수 확인 기록', -7, true)];
  const infrastructureSupplier = { id: randomUUID(), name: '가상 컴퓨트파트너스', specialty: 'AI 인프라 사양 검토 · 설치 예시', industries: ['제조'], contactName: '가상 담당자', relationship: 'candidate', serviceTypes: ['infrastructure'], isDemo: true, note: '가상의 인프라 공급사입니다. 실제 장비 제안, 가격, 계약이 아닙니다.' };
  suppliers.push(infrastructureSupplier);
  const infrastructureProject = { ...projects[0], id: randomUUID(), serviceType: 'infrastructure', name: '사내 AI 테스트 장비 검토', company: '가상 파인테크', industry: '제조', problem: '내부 AI 실험에 사용할 장비와 설치 조건을 검토하고 싶습니다.', requirements: '가상 장비 사양 비교, 설치 조건 확인, 인수 검수', budget: 35000000, stage: 'quotation', targetDate: date(40), infrastructurePurpose: '사내 AI 파일럿 실험', existingEnvironment: '가상 사무실 네트워크 · 실제 환경 조사 전', installationSite: '가상 사무실', priority: 'medium' };
  projects.push(infrastructureProject);
  quotes.push({ ...q(0, 3, 33000000, 4), projectId: infrastructureProject.id, supplierId: infrastructureSupplier.id, scope: '가상 견적 · 장비 1대와 설치 지원, 금액은 설치비 포함 총액', specifications: '가상의 AI 실험용 워크스테이션 · 실제 부품/성능 제안 아님', quantity: 1, installationCost: 1000000, deliveryDate: date(30), warranty: '가상 조건: 인수 검수 후 점검 · 실제 보증 아님' });
  tasks.push({ id: randomUUID(), projectId: infrastructureProject.id, title: '설치 공간과 보안 조건 확인', dueDate: date(4), done: false });
  const programs = [
    { id: randomUUID(), name: '가상 AI 바우처 검토 예시', year: now.getUTCFullYear(), officialUrl: '', startDate: '', endDate: '', eligibility: '미확인 · 실제 공식 공고 확인 필요', benefit: '미확인 · 가상 분류 예시', selfContribution: '미확인', note: 'AI 바우처 유형을 보여주는 가상 내부 검토 항목입니다. 현재 접수 중인 실제 공고나 지원 자격을 의미하지 않습니다.', isDemo: true, verification: 'unverified' },
    { id: randomUUID(), name: '가상 소상공인 AI 지원 검토 예시', year: now.getUTCFullYear(), officialUrl: '', startDate: '', endDate: '', eligibility: '미확인 · 실제 공식 공고 확인 필요', benefit: '미확인 · 가상 분류 예시', selfContribution: '미확인', note: '소상공인 AI·혁신바우처 등의 유형을 검토하는 가상 항목입니다. 실제 공고, 금액, 일정은 확인되지 않았습니다.', isDemo: true, verification: 'unverified' },
  ];
  const applications = [
    { id: randomUUID(), programId: programs[0].id, projectId: projects[0].id, status: 'review', note: '가상 내부 검토 기록 · 실제 지원 신청 아님', nextAction: '공식 공고와 자격 조건 확인', dueDate: date(7) },
    { id: randomUUID(), programId: programs[1].id, projectId: projects[1].id, status: 'preparing', note: '가상 내부 준비 상태 · 실제 제출 아님', nextAction: '공고 확인 후 필요한 자료 목록 정리', dueDate: date(10) },
  ];
  // Official public-source snapshot; dates/status stay fixed at the research timestamp.
  // Never relabel a past notice as currently open based on the runtime clock.
  programs.unshift(...officialSupportNotices.map(p => ({ ...p, id: randomUUID() })));
  const investments = [
    { id: randomUUID(), company: '가상 웨이브AI', contactName: '가상 담당자', business: '가상 업무 자동화 솔루션', materialsUrl: '', desiredAmount: 0, mode: 'direct', status: 'review', note: '가상 내부 CRM 예시입니다. 실제 투자 제안·결정·금융 자문·거래가 아닙니다.', nextAction: '내부 검토용 자료 목록 정리', dueDate: date(8), isDemo: true },
    { id: randomUUID(), company: '가상 그린오퍼레이션', contactName: '가상 담당자', business: '가상 AI 운영 도구', materialsUrl: '', desiredAmount: 0, mode: 'introduction', status: 'meeting', note: '가상 내부 소개 검토 기록입니다. 실제 투자자 연결·약정·송금은 없습니다.', nextAction: '소개 검토 범위와 필요한 동의 정리', dueDate: date(5), isDemo: true },
  ];
  const salespeople = [{ id: randomUUID(), referralCode: 'AX-DEMO-A', name: '가상 영업자 A', note: '가상 내부 CRM 담당자', isDemo: true }, { id: randomUUID(), referralCode: 'AX-DEMO-B', name: '가상 영업자 B', note: '가상 내부 CRM 담당자', isDemo: true }];
  const activities = [{ id: randomUUID(), projectId: projects[0].id, salespersonId: salespeople[0].id, type: 'call', content: '가상 첫 상담: 요구사항 정리 후 다음 검토 항목 확인', activityDate: date(-1) }, { id: randomUUID(), projectId: projects[1].id, salespersonId: salespeople[1].id, type: 'meeting', content: '가상 상담 미팅 기록 · 실제 연락 아님', activityDate: date(-2) }];
  return {
    projects: projects.map((p, index) => ({ ownerId: salespeople[index % 2].id, conditions: '', infrastructurePurpose: '', existingEnvironment: '', installationSite: '', ...p })),
    suppliers: suppliers.map(s => ({ contactEmail: '', ...s, isDemo: ['르몽', '어크로스', '스파르타', '에이블런', '세계경영연구회'].includes(s.name) ? false : s.isDemo })),
    quotes: quotes.map(q => ({ sharedWithBuyer: q.status === 'received', specifications: '', quantity: 0, installationCost: 0, deliveryDate: '', warranty: '', ...q })),
    milestones, tasks, programs, applications, investments, salespeople, activities,
  };
}
