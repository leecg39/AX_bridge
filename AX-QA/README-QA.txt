AX브릿지 1.1.1 적대적 QA 묶음
2026-10-05 UTC

먼저 AX브릿지-적대적-QA-보고서-20261005.docx를 읽어 주세요.
높음 1건 / 중간 6건 / 낮음 2건, 총 9개 결함을 정리했습니다.
원본 애플리케이션 수정판이 아닙니다. 원본 소스나 실행 데이터는 변경하지 않았습니다.

환경
- Node.js 24 이상, npm 추가 의존성 없음
- 별도로 받은 소스 ZIP을 풀고 package.json과 server.mjs가 있는 폴더 경로를 확인
- 아래 예시의 /absolute/path/...를 자신의 실제 절대경로로 변경

macOS / Linux
1. 기존 테스트
   cd "/absolute/path/ax-bridge-mvp"
   npm test
2. API/SQLite 적대적 회귀 조건
   AX_SOURCE_DIR="/absolute/path/ax-bridge-mvp" node --test "/absolute/path/AX-QA/backend/adversarial-api.test.mjs"
3. UI 이벤트/응답 모사
   AX_SOURCE_DIR="/absolute/path/ax-bridge-mvp" node --test "/absolute/path/AX-QA/ui/adversarial-ui.test.mjs"
4. 자유텍스트 연락처 경계
   AX_SOURCE_DIR="/absolute/path/ax-bridge-mvp" node "/absolute/path/AX-QA/backend/residual-observations.mjs"

Windows PowerShell
$env:AX_SOURCE_DIR="C:\path\ax-bridge-mvp"
node --test "C:\path\AX-QA\backend\adversarial-api.test.mjs"
node --test "C:\path\AX-QA\ui\adversarial-ui.test.mjs"
node "C:\path\AX-QA\backend\residual-observations.mjs"

결과 읽기
- 기존 npm test: 80 통과 / 0 실패
- API 테스트: 26개 중 22 통과 / B01~B04 네 개 실패. 네 실패는 확인된 결함을 나타내는 예상 결과이며 종료 코드는 1
  B01 가입 응답 유실 후 중복 생성
  B02 공백 결과물 제출/검수/완료
  B03 총액을 넘는 포함 설치비
  B04 소수 장비 수량
- UI 테스트: 17개 확인. REPRO-DEFECT 10개는 결함 재현에 성공한 것이며 정상 통과가 아님. SAFE 7개는 방어 동작 확인
- UI 테스트는 Node VM과 최소 DOM 모사 사용. 실제 브라우저 검수, 시각, 키보드/접근성 판정이 아님
- API 테스트는 테스트마다 임시 SQLite와 127.0.0.1 임의 포트를 사용한 뒤 폐기. 소스 data/를 사용하지 않음
- 로컬 서버 실행 권한이 없는 환경에서는 API 테스트를 억지로 우회하지 말고 허용되는 자신의 로컬 환경에서 실행
- 바이트 대조와 이전 1.1.0 코드 비교는 logs의 JSON에 기록

앱 소스와 DB 보존
source-manifest.json의 41개 원본 파일이 전달 ZIP v2와 모두 일치했습니다.
현재 스코프는 QA/검토이므로 앱 수정을 하지 않았습니다.
실사용 인증·테넌트 보안·배포 가능성 검증으로 해석하지 마세요.
