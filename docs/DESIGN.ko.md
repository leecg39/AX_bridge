# AX브릿지 MVP 설계

## 1. 목적과 경계

중개 운영자가 수요기업의 문제를 정리하고 여러 외부 공급사의 제안을 비교한 뒤, 공급 범위와 납품·검수 진행을 기록하는 단일 로컬 워크스페이스입니다. 서비스 분류는 `ax`(AX 구축), `education`(AI 교육 중개), `infrastructure`(AI 서버·장비 중개)입니다.

세 가지 화면 관점은 수요기업·공급기업·관리자입니다. 영업직원 모드는 관리자 CRM의 담당자별 시연입니다. 역할은 실제 계정이나 조직 경계를 구성하지 않습니다.

이 문서는 구현 구조를 설명합니다. 테스트 실행 결과·시각 검수 완료 여부는 별도의 검증 결과와 구별해야 합니다.

참고 방향: [SourcePanel](https://www.sourcepanel.com/)의 요구 정리→공급 연결→마일스톤 운영, [AIonDemand](https://www.aiodp.ai/)의 솔루션·교육·인프라 구분, [Thumbtack](https://www.thumbtack.com/)의 간결한 입력 UI. SourcePanel은 no-bidding 방식이므로 이 MVP의 다중 견적 비교와 동일 모델로 설명하지 않습니다. 브랜드·원본 화면 복제를 전제로 하지 않습니다.

시각 방향은 흰색 바탕, 짙은 청록, 옅은 올리브를 중심으로 정했고 빨강은 오류·삭제 등 경고 동작에 사용합니다. 실제 브라우저의 레이아웃·색 대비·모바일 동작은 별도 화면 검수가 필요합니다.

## 2. 구성

| 파일/폴더 | 역할 |
| --- | --- |
| `package.json` | Node 24 이상, `npm start`, `npm test`; 외부 npm 의존성 없음 |
| `server.mjs` | 내장 `node:http` 서버, 정적 파일, JSON API, 로컬 요청 검사, 데모 역할별 투영·수정 제한 |
| `db.mjs` | `node:sqlite` 저장소, 타입·필수값·관계·업무 규칙 검증, 트랜잭션 저장 |
| `seed.mjs` | 가상 업무 사례, 공급사 후보 맥락, 상대 날짜 기반 초기 데이터 |
| `public/index.html`, `public/app.js`, `public/styles.css` | 관리자/영업직원 운영 화면. 해시 라우팅, 브라우저 기본 API 사용 |
| `public/buyer.html`, `public/supplier.html` 및 관련 JS/CSS | 수요기업·공급기업 데모 포털 |
| `public/signup.html` 및 관련 JS | 수요기업 의뢰/공급사 후보 로컬 데모 등록 |
| `PREVIEW.html`, `scripts/make-preview.mjs` | 가상 상태를 렌더한 관리자 정적 HTML 미리보기와 재생성 스크립트. 실제 기능·브라우저 스크린샷 아님 |
| `docs/support-notices.json` | 공식 자료 7건의 원문 링크·확인 시점·기업당 지원액/전체 예산 구분을 보존한 조사 스냅샷 |
| `data/` | 런타임 SQLite와 WAL 보조 파일. 외부 공유 대상 아님 |
| `tests/` | Node 내장 테스트 러너 기반 검증 |

브라우저 → 같은 출처의 HTTP JSON API → 검증된 상태 → SQLite 순서로 동작합니다. 외부 인증·메일·결제·클라우드 저장소와 연결하지 않습니다. 공식 공고/검토 자료 링크는 사용자가 별도로 여는 웹 링크입니다.

## 3. 저장 구조와 도메인

각 엔터티는 UUID를 사용합니다. 1.2.0 추가: `registration_requests`는 가입 요청키·본문 지문·생성 결과를 엔터티 저장과 같은 SQLite 트랜잭션에 기록합니다. 재시작해도 유지되며 JSON 업무 백업에는 포함되지 않습니다. SQLite 테이블에는 ID와 JSON `data`를 저장하고, 주요 관계에는 외래키 열을 추가합니다. `metadata`에는 초기화 여부와 마지막 갱신 시각을 기록합니다. 데이터 스키마 버전은 1입니다.

| 컬렉션 | 주요 필드 | 관계·역할 |
| --- | --- | --- |
| `projects` | name, company, contactName/Role/Email, industry, serviceType, problem, requirements, conditions, budget, targetDate, stage, priority, note, ownerId, selectedQuoteId | 고객 의뢰와 CRM의 중심. 고객사/담당자 정보도 이 레코드에 포함 |
| `suppliers` | name, specialty, serviceTypes, industries, contactName/Email, relationship, note | 외부 공급사 후보/확인 상태. `confirmed`도 입력자가 기록한 상태 |
| `quotes` | projectId, supplierId, amount, durationWeeks, scope, exclusions, maintenance, validUntil, status | 의뢰별 공급사 제안. 수신한 견적만 내부 선택 가능 |
| `milestones` | projectId, title, dueDate, status, deliverable, acceptanceCriteria, reviewNote | 단계별 결과물·검수. 첨부파일 자체가 아니라 텍스트/위치 기록 |
| `tasks` | projectId, title, dueDate, done | 고객 의뢰별 다음 행동 |
| `salespeople` | name, note, isDemo | 담당 영업자 명부. 직원 계정 아님 |
| `activities` | projectId, salespersonId, type, content, activityDate | 통화·미팅·메모. 보안 감사로그와는 다름 |
| `programs` | name, year, officialUrl, startDate, endDate, eligibility, benefit, selfContribution, verification, documentType, applicantType, status, checkedAt, statusEvidence, note, isDemo | 지원사업 원문·연도·조건과 자료 유형·확인 시점 |
| `applications` | programId, projectId, status, note, nextAction, dueDate | 지원사업과 고객 의뢰를 연결한 내부 검토·신청 진행 기록 |
| `investments` | company, contactName, business, materialsUrl, desiredAmount, mode, status, note, nextAction, dueDate, isDemo | 관리자용 투자 검토 CRM. 실제 거래 기능 없음 |

### 서비스별 확장 필드

- 교육 의뢰: `audience`, `participantCount`, `skillLevel`, `learningGoal`, `topics`, `deliveryMode`, `location`, `trainingHours`
- 교육 견적: `curriculum`, `practice`, `instructor`, `trainingHours`
- 인프라 의뢰: `infrastructurePurpose`, `existingEnvironment`, `installationSite`
- 인프라 견적: `specifications`, `quantity`, `installationCost`, `deliveryDate`, `warranty`
- 금액은 원 단위 숫자입니다. 부가세 구분·통화 변환·세금 계산 기능이 없으므로 같은 부가세 기준으로 비교하고 조건을 메모해야 합니다. `installationCost`는 `amount`에 포함된 설치비 항목으로 사용합니다.

### 데이터베이스 동작

- `WAL` 모드, 외래키 활성화, `busy_timeout=5000`
- 변경 시 현재 상태를 읽어 검증하고 전체 컬렉션을 트랜잭션으로 다시 저장하는 소규모 MVP 구조
- 첫 실행 시 저장된 상태가 없을 때만 seed 생성. 의도적으로 비운 워크스페이스는 재시작 후에도 유지
- JSON 복원은 전체 상태 정규화·참조 검증 후 원자적으로 교체. 검증 실패 시 기존 상태 유지
- 입력의 알 수 없는 필드는 일반 정규화에서 저장하지 않음. 데모 역할의 수정 요청은 허용 필드도 별도로 제한
- 대규모 데이터, 장시간 작업, 여러 프로세스의 동시 편집, 레코드 버전 충돌 해결을 위한 구조는 아님

## 4. 상태와 불변 조건

### 프로젝트

`consultation` 상담 → `quotation` 견적 → `progress` 진행 → `completed` 완료

- `selectedQuoteId`는 같은 프로젝트의 `received` 견적만 참조할 수 있습니다.
- 진행 상태에는 선택한 수신 견적이 필요합니다.
- 완료 상태에는 마일스톤이 한 개 이상 있어야 하며 모두 `approved`여야 합니다.
- 마지막 마일스톤 승인만으로 프로젝트를 자동 완료하지 않습니다. 운영자가 완료를 별도 선택합니다.
- 현재 완료 규칙은 견적 선택/계약/정산 상태까지 검증하지 않습니다. 순차 단계 이동을 강제하는 완전한 워크플로 엔진도 아닙니다.
- 완료 프로젝트의 검수를 다시 열어야 한다면 프로젝트를 먼저 상담·견적 또는 유효한 진행 상태로 돌려놓아야 합니다. 완료 상태를 유지한 채 미승인 마일스톤을 저장하면 검증에 걸립니다.

### 나머지 상태

| 대상 | 상태 |
| --- | --- |
| 견적 | `requested` 요청 중, `received` 수신 |
| 마일스톤 | `planned` 준비, `submitted` 검수 대기, `revision` 수정 요청, `approved` 검수 승인 |
| 공급사 관계 | `candidate` 후보, `confirmed` 협업 확인 기록 |
| 지원사업 확인 | `unverified` 미검증, `verified` 공식 출처 확인 기록 |
| 지원 신청 | `review` 검토, `preparing` 준비, `submitted` 제출 기록, `selected` 선정 기록, `rejected` 미선정 기록 |
| 투자 방식 | `direct` 직접 투자 검토, `introduction` 투자자 연결 검토 |
| 투자 진행 | `review` 초기 검토, `meeting` 미팅, `diligence` 실사, `decision` 결정 기록 |

지원사업의 시작일은 마감일을 넘을 수 없습니다. `verified` 저장에는 공식 URL이 필요하지만 URL의 내용·기관 신뢰성·현재 접수 상태를 서버가 검증하는 것은 아닙니다. 정책·예산 발표라면 개별 모집 공고로 취급하지 말고 메모에 출처 종류와 확인일을 남겨야 합니다.

공식 자료 파일은 2026-10-05 08:47 KST 기준입니다. 기업 모집 4건(확인 시점 접수기간 내 2건·마감 2건), 기관 모집 1건, 예산자료 2건을 구분합니다. `documentType`, `applicantType`, `checkedAt`, `deadlineTime`, `timezone`, `sources`, `perApplicantCapKrw`, `budgetTotalKrw` 등 원문 정리용 메타데이터를 포함합니다. 예산자료의 숫자를 기업당 지원액으로 표시하거나 기관 모집을 일반기업 신청 목록으로 취급하면 안 됩니다. 자료 파일의 메타데이터 전체와 앱의 저장 필드는 동일하지 않을 수 있으므로 원본 스냅샷도 함께 보관합니다.

시연 상태에는 공식 7건과 가상 2건이 들어갑니다. 화면은 자료/대상 유형에 따라 기업 신청 공고와 예산·기관 참고자료를 구분합니다. 공식 자료의 일정은 실행 시점에 맞춰 이동하지 않습니다.

### 삭제와 연결 보호

- 프로젝트 삭제: 그 프로젝트의 견적·마일스톤·할 일·지원 신청·상담활동도 함께 삭제
- 사용 중인 공급사·지원사업·영업자: 연결을 정리하기 전 삭제 거부
- 프로젝트가 선택한 견적: 선택 해제 전 삭제 거부. 진행 상태라면 먼저 프로젝트 상태를 조정해야 함
- 삭제는 앱 내 휴지통 없이 저장 상태에서 제거. 복구하려면 미리 받은 JSON 백업 필요

## 5. 데모 역할별 데이터 범위

| 모드 | 응답 범위 | 대표 변경 가능 항목 |
| --- | --- | --- |
| 관리자 `admin` | 모든 컬렉션 | 전체 CRUD·백업·복원·초기화 |
| 수요기업 `buyer` | 선택한 프로젝트, 영업 검토 후 공유한 수신 견적, 연결 공급사의 제한된 정보, 마일스톤·할 일 | 자신의 문제·요구사항·조건, 제출 상태의 검수 승인/수정 요청·메모, 할 일 |
| 공급기업 `supplier` | 자신의 공급사/견적, 견적으로 연결된 프로젝트. 마일스톤은 자기 견적이 선택된 의뢰만 | 연결 의뢰의 자기 견적, 선택된 공급사로서 미승인 결과물 제출·검수 요청 |
| 영업직원 `sales` | 자신에게 배정된 프로젝트와 견적·마일스톤·할 일·상담활동, 제한된 공급사 정보 | 담당 의뢰 업무 기록. 신규 의뢰는 자신에게 배정 |

수요기업에는 관리자 프로젝트 메모·영업 배정 필드를 제공하지 않습니다. 공급기업에는 고객 이메일·예산·관리자 메모·선택 견적·영업 배정 필드를 제공하지 않고 경쟁 견적을 제외합니다. 영업직원은 지원사업·지원 신청·투자 검토·전체 백업/초기화 API를 사용할 수 없습니다. 공급사는 이미 견적 관계가 있는 프로젝트만 수정 대상으로 취급합니다.

납품 단계에서는 **수신 견적이 내부 선택된 공급사만** 해당 의뢰의 마일스톤을 조회·제출할 수 있습니다. 다른 견적 후보는 마일스톤 상세 조회/수정을 할 수 없습니다. 공급사는 이미 승인된 결과물을 수정할 수 없고, 수요기업은 `submitted` 상태의 결과물만 `approved` 또는 `revision`으로 변경할 수 있습니다. 관리자·담당 영업자의 운영 수정 범위는 더 넓으며, 이를 실제 권한 인증으로 해석하면 안 됩니다.

**보안 경계가 아님:** 요청 헤더의 `X-Demo-Role`(기본 `admin`)과 `X-Demo-Entity`를 바꾸면 누구나 다른 데모 관점을 선택할 수 있습니다. UI 숨김뿐 아니라 서버 제한이 있더라도, 이 요청자를 검증하지 않으므로 실제 인증·테넌트 격리가 아닙니다. 역할별 엔터티 ID 선택과 관리자 복귀는 공개된 시연 조작입니다.

## 6. API

모든 API는 같은 로컬 출처의 `/api/` 아래 있습니다. JSON 요청에는 `Content-Type: application/json`을 사용합니다. 요청 본문 상한은 1MiB입니다. 일반 컬렉션은 `projects`, `suppliers`, `quotes`, `milestones`, `tasks`, `programs`, `applications`, `investments`, `salespeople`, `activities`입니다.

| 메서드·경로 | 동작 |
| --- | --- |
| `GET /api/state` | 데모 역할에 맞춘 전체 화면 상태 |
| `GET /api/demo-options` | 역할 선택기용 프로젝트·공급사·영업자의 ID·이름 등 최소 목록. 실제 인증 대상자 목록 아님 |
| `GET /api/{collection}` | 볼 수 있는 해당 컬렉션 목록 |
| `GET /api/{collection}/{id}` | 볼 수 있는 개별 항목 |
| `POST /api/{collection}` | 항목 생성. 응답 201 |
| `PATCH /api/{collection}/{id}` | 부분 수정. 응답 200 |
| `DELETE /api/{collection}/{id}` | 삭제 또는 참조 보호 오류 |
| `POST /api/demo-register` | `buyer` 또는 `supplier` 데모 엔터티 생성. 관리자 가입 불가 |
| `GET /api/export` | 관리자용 `{schemaVersion, exportedAt, state}` 전체 JSON 백업 |
| `POST /api/import` | 관리자용 `{state}` 또는 버전 포함 백업으로 전체 교체 |
| `POST /api/reset` | 관리자용. 본문 `{}`로 현재 시점 시연 데이터 초기화 |

가입 입력은 `role`, `company`, `contactName`, `contactEmail`, `serviceType` 등을 받습니다. 수요기업은 프로젝트를 만들며 `requestTitle`, `problem`을 사용할 수 있습니다. 공급기업은 후보 공급사를 만듭니다. 선택적 `referralCode`로 최초 추천인과 담당자를 지정합니다. `Idempotency-Key` 헤더는 16~128자 영숫자·하이픈·밑줄이며, 동일 키/본문은 같은 결과, 동일 키/다른 본문은 409입니다. 키가 없는 레거시 요청과 서로 다른 키는 각각 별개의 가입입니다. 결과는 `{role, entityId}`이며 비밀번호나 인증 토큰이 아닙니다.

오류 응답은 `{ "error": "한국어 안내" }` 형식입니다. 주요 상태 코드는 400(입력/업무 규칙), 403(데모 역할/로컬 요청 제한), 404(없는 항목), 405(미지원 메서드), 409(삭제 참조 충돌), 413(본문 크기), 415(JSON Content-Type 필요), 500(내부 오류)입니다.

## 7. 로컬 방어와 한계

- 시작 시 loopback 이외 HOST 거부, 요청의 원격 주소·Host 검사
- API의 외부 Origin 및 `Sec-Fetch-Site: cross-site` 요청 거부
- 정적 파일 경로 검사와 실제 경로 확인, `public/` 밖 접근 차단
- CSP, nosniff, frame 차단, 카메라/마이크/위치 권한 제한 헤더
- 날짜·URL·이메일·숫자·열거형·문자 길이 검증, 화면 텍스트 이스케이프
- SQLite 파일의 제한적인 파일 권한 설정. 데이터 자체는 암호화하지 않음

이 방어들은 인증을 대체하지 않습니다. 로컬 사용자/프로세스는 관리자 API나 데이터 파일에 접근할 수 있고, 백업에는 내부 기록 전체가 포함됩니다. HTTP 개발 서버이며 실제 운영용 보안 심사·침투 테스트 완료를 의미하지 않습니다.

## 8. 정식 운영으로 확장하기 전

1. 로그인, 초대, 서버 측 세션과 실제 역할/조직 소속 검증
2. 고객·담당자 마스터와 조직별 데이터 경계, 행/필드별 권한
3. 불변 감사로그, 수정 충돌 검출, 마이그레이션·복구 절차
4. 파일 저장소, 악성 파일 검사, 자료 공유 동의·권한
5. 계약·대금·검수 책임 등 중개 운영 정책 및 투자업무 허용 범위 검토
6. 지원사업 출처 종류·확인 시점 관리, 공고 변경 확인 절차
7. 호스팅·TLS·네트워크 제어·모니터링·암호화·개인정보 보관 정책

위 항목은 구현 완료 기능 목록이 아니라 별도 설계와 검증이 필요한 후속 과제입니다.

## 9. 1.2.0 추가 규칙

- 프로젝트/공급사 `ownerId`, `referredById`, `referralCode`: 현재 담당자와 최초 추천 스냅샷을 구분합니다. 최초 정보의 PATCH는 409로 거부하며, 참조 중인 영업자는 삭제할 수 없습니다.
- `POST /api/consultation`: 수요기업 전용. `problem`, `requirements`, `conditions`만 허용합니다. 비어 있지 않은 문제 설명이 필요하고, 프로젝트의 `consultationRef`와 검토 할 일을 원자적으로 생성합니다. 재접수는 같은 접수번호를 유지합니다.
- 견적 `sharedWithBuyer`: 기본 false. 담당 영업자가 지정된 수신 견적만 공유할 수 있습니다. 관리자/담당 영업자가 별도 공유 작업을 수행하며 공급사는 공유를 강제할 수 없습니다. 내용 변경·담당자 변경은 공유를 취소합니다. 수요기업 API는 공유된 견적만 반환합니다.
- 제출/승인 마일스톤은 trim 후 결과물 설명이 있어야 합니다. 인프라 견적 설치비는 총액 이하여야 하며 수량은 정수입니다. CRUD와 백업 가져오기에 동일 규칙을 적용합니다.
- 금액 필드의 서버/관리자/포털 상한은 10^15원입니다.
- 모달 제목·설명은 이스케이프하고, 관리자 역할 조회는 최신 요청만 적용합니다. 저장 후 재조회 실패는 모달 바깥에 저장 완료와 조회 실패를 구분해 표시합니다.
- 자유텍스트 연락처 차단 및 결과물의 영업 사전 승인 단계는 구현하지 않았습니다. 구조화된 공급사 연락처를 숨기는 기능과 구별해야 합니다.
