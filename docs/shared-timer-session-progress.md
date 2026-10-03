# 기기 간 타이머 기록과 상태 갱신

## 동일한 공부 시간은 한 번만 기록

타이머 한 집중 구간 또는 스톱워치 누적 구간은 `sessionIdentity.id`를 가진다. 일시정지·재개·새로고침·기기 인계 시 유지하고, 새 타이머 구간·초기화·스톱워치 저장 후에는 새 ID를 사용한다. 작업 A에서 B로 이어할 때는 같은 집중 구간이므로 ID를 유지한다.

`sessionIdentity.progressStart`는 해당 기기가 이미 기록 또는 outbox로 넘긴 누적 공부 초다. 저장 요청의 `p_source_session_id`, `p_progress_start`와 segment 총합이 `[시작, 종료)` 범위를 정의한다. 프로필의 `study_session_offset`은 아직 저장하지 않은 진행 시간의 시작점을 전달한다. 예를 들어 A의 20분을 저장하고 B의 남은 5분을 공개하면, 다른 기기는 같은 ID, offset 1200, duration 300을 복원한다.

`private.study_session_progress`는 계정·ID별 저장 범위를 유지한다. 기록 RPC가 행 잠금을 얻고 이미 기록된 범위를 뺀 부분만 삽입하므로, 서로 다른 batch ID로 동시 저장해도 중복되지 않는다. A의 60초를 B에서 저장한 뒤 A가 65초를 저장하면 신규 기록은 5초다. 입력은 기존처럼 10초 이상이어야 하지만, 중복 제거 후 남은 실제 시간은 1초부터 보존한다. segment를 자를 때 원래 종료 시각을 기준으로 하므로 공부일별 구간도 유지한다.

batch ID는 전송 재시도 식별자로 별도 유지한다. 중복 제거 전 요청 전체를 canonical payload로 보관하고 실제로 추가된 초를 응답에 저장하므로, 응답 유실·오프라인 복구 후 재시도도 같은 결과를 받는다. 기록 삭제나 계정 초기화는 이미 소비된 시간의 tombstone을 유지한다. 계정 자체를 삭제하면 auth.users 외래 키가 tombstone도 삭제한다.

## 상태 요청의 소유자와 순서

상태 갱신은 호출 시점의 계정, 토큰 조회, 작업명, clock ID, 이벤트 시각을 캡처한다. 계정별 큐와 요청 순번으로 오래된 요청을 폐기하고, 계정 전환 후 돌아온 응답도 적용하지 않는다. 공개 설정 조회와 UPDATE 모두 같은 토큰을 사용한다. 조회 오류는 공개 허용으로 취급하지 않는다.

`last_active_at`에는 네트워크 완료 시간이 아닌 사용자 동작 시각을 쓴다. UPDATE의 시각 조건으로 다른 탭이 이미 적용한 더 최신 이벤트도 덮어쓰지 않는다. 요청 실패는 기록 저장 실패와 분리하여 로깅하고 이후 상태 갱신은 계속 진행한다.

## 배포와 이전 버전

1. `20261003050354_shared_timer_session_progress.sql`을 먼저 적용한다. 새 클라이언트는 새 열과 RPC 인자를 요구하며, DB 오류 시 이전 저장 경로로 우회하지 않는다.
2. 앱을 배포한다. 기존 5·6인자 outbox 요청과 기존 batch 재시도는 계속 유효하다.
3. 기존 로컬 스냅샷은 첫 복원에서 ID를 저장한다. ID가 없는 이전 버전의 원격 상태는 다른 기기에서 가져오지 않고, 원래 기기를 새로고침한 뒤 재개하도록 안내한다. 원래 기기의 시간은 유지된다.

이전 버전이 새 ID 열을 모르고 기존 시계를 초기화하거나 모드를 바꾸면 프로필 트리거가 남아 있는 ID를 무효화한다. 이전 버전에서 이미 서로 독립적으로 복사·저장한 기록이나 ID가 없던 outbox에 공유 관계를 소급하여 부여하지는 않는다.

## 검증

- `TimerApp.crossDevice.test.tsx`: 실제 타이머·스톱워치 훅을 통해 A→B 저장→A 추가 진행, offset 1200 인계, 이미 소비한 prefix, 오프라인 draft와 새 구간의 ID 분리.
- `TimerApp.taskHandoff.test.tsx`: A20분·B5분의 동일 ID와 연속 offset.
- `useStudySession.status.test.tsx`: 늦은 시작/빠른 일시정지, A→B 및 A→B→A, 캡처 토큰, 비공개 설정과 조회 오류.
- `shared_timer_session_progress.test.sql`: 범위 겹침·빈틈·부분초·시각·권한·소유자·기존 outbox·삭제 후 재등장 방지.
- 두 독립 DB 연결에서 같은 ID의 [0,60), [0,90) 저장: 합계 90초.

## 운영 적용 기록 — 2026-10-03

앱 배포에 앞서 운영 프로젝트 `pqfozgiprhizwavfhjgv`(PostgreSQL 17.6)에 다음 변경을 적용했다. 기존 타임스탬프 차이를 고려해 배포 이력은 이름으로 대조한다.

| 소스 migration | 운영 버전 |
| --- | --- |
| `20261003050311_pinned_task_identity.sql` | `20261003141618` |
| `20261003050327_account_storage_cleanup_inventory.sql` | `20261003141622` |
| `20261003050354_shared_timer_session_progress.sql` | `20261003141628` |

격리된 PostgreSQL 18.6에서 모든 SQL 테스트 519개와 두 연결 간 동시 저장·고정 작업 생성 검증을 통과했다. Auth/Storage 서비스 자체 대신 Supabase 역할·JWT 함수·Storage 스키마를 갖춘 DB 테스트 환경을 사용했다. 운영 적용 후에는 읽기 전용 권한 검사 52개가 모두 통과했다. 운영 사용자 기록 저장·계정 삭제·Storage 삭제를 검증 목적으로 실행하지 않았다.

기존 미커밋 테마 변경을 제외한 배포 대상 코드에서 Vitest 711개, ESLint, TypeScript 검사와 Next.js 빌드(정적 페이지 22개)가 통과했다. 로컬 빌드는 검증용 Supabase URL/공개 키 자리표시자를 사용했으며 실제 로그인된 브라우저의 운영 E2E 검증을 뜻하지 않는다.

Security Advisor의 기존 authenticated SECURITY DEFINER 경고 20개는 정확한 RPC 허용 목록과 함수 내부 권한 검사로 확인했고 이번 적용 후 개수 증가가 없었다. 의도적으로 클라이언트 접근을 막은 `debug_logs` INFO 및 기존 비밀번호 유출 보호 설정 경고는 남아 있다. [RPC 경고 설명](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [비밀번호 보호 설정](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)을 참고한다.
