# Supabase 권한 및 VAPID 회전 런북

## 현재 상태

- 2026-08-07 명시적 승인 후 운영 Supabase, Edge Function, Vault, Vercel, browser push subscription에 보안 변경을 적용하고 재검증했다.
- canonical forward-only migration 원본은 `20260807001129_harden_authorization_and_push_webhook.sql`이며, 운영 migration history에는 `20260807105056 harden_authorization_and_push_webhook`으로 기록됐다.
- webhook secret, VAPID pair, Supabase publishable/secret API key를 새로 발급해 모든 확인된 consumer를 전환했고, legacy JWT 기반 API key는 비활성화했다.
- 과거 Git 이력의 VAPID private key와 운영 DB trigger 정의에서 발견된 webhook secret 및 service-role JWT는 값과 무관하게 노출된 자격 증명으로 취급한다. 이 문서에는 어떠한 값도 기록하지 않는다.
- Git history force-push, permissive Edge version 복원, push subscription 일괄 삭제는 수행하지 않았다. 이후 장애도 이 문서의 roll-forward 원칙으로 처리한다.

## 변경 산출물

- `supabase/migrations/20260807001129_harden_authorization_and_push_webhook.sql`
- `supabase/tests/authorization_hardening.test.sql`
- `supabase/tests/fixtures/security_base.sql`
- `test-harness/supabase/config.toml`
- `scripts/test-supabase-security.ps1`
- `components/NotificationManager.tsx`
- `lib/pushSubscriptionSync.ts`
- `lib/__tests__/pushSubscriptionSync.test.ts`
- `supabase/functions/push-notification/index.ts`
- `supabase/functions/push-notification/helpers.ts`
- `supabase/functions/push-notification/helpers_test.ts`
- `supabase/verification/security_preflight.sql`
- `supabase/verification/security_postflight.sql`
- `app/api/account-reset/route.ts`
- `app/api/account-reset/__tests__/route.test.ts`
- `app/api/account-delete/route.ts`
- `app/api/account-delete/__tests__/route.test.ts`

## 권한 모델 전후 비교

| 표면 | 변경 전 위험 | 변경 후 계약 |
|---|---|---|
| `profiles` UPDATE | `authenticated`가 자신의 행에서 `role`을 포함한 전체 열을 갱신 가능 | table-wide UPDATE를 철회하고 `status`, `current_task`, `last_active_at`, `is_task_public`, `study_start_time`, `total_stopwatch_time`, `timer_type`, `timer_mode`, `timer_duration`만 허용 |
| 보호 프로필 열 | RLS가 행만 제한하고 열은 보호하지 않음 | invoker trigger가 `id`, `role`, `email`, `invite_code`, `created_at` 변경을 추가 차단. 일반 admin JWT도 직접 변경 불가 |
| `is_admin()` | 변경 가능한 `profiles.role`을 신뢰하고 search path가 고정되지 않음 | 빈 `search_path`, fully-qualified 객체, 명시적 호출자 검사 및 ACL |
| 친구 관계 생성 | `add_friend`와 직접 `friendships` INSERT로 상대 동의 없이 관계 생성 가능 | `add_friend` 제거, `friendships` INSERT 권한/정책 철회. `send_friend_request` 후 수신자의 `accept_friend_request`만 양방향 관계 생성 |
| 친구 관계 UPDATE | identity 열까지 넓은 UPDATE 가능 | `nickname`, `group_name`, `is_notification_enabled`만 본인의 friendship 행에서 수정 가능 |
| cleanup | `public.delete_unconfirmed_users()`를 `PUBLIC`/`anon`/`authenticated`가 실행 가능 | `private.delete_unconfirmed_users()`로 이동하고 `postgres` owner만 실행. 기존 cron은 private 함수로 재예약 |
| 친구 통계 RPC | caller가 임의 `user_id`를 전달 가능 | `p_user_id = auth.uid()` 강제, 실제 friendship 범위만 반환 |
| 그룹 통계 RPC | 멤버십 확인이 없거나 legacy RPC가 남음 | legacy v1/v2 제거, v3는 호출자의 실제 그룹 멤버십과 유효 시간 범위를 확인 |
| 이메일 lookup | 직접 이메일-to-user-id RPC 노출 | `get_user_id_by_email` 제거. 친구 요청 내부에서만 lookup하고 존재 여부가 구분되지 않는 응답 사용 |
| `SECURITY DEFINER` | 넓은 기본 EXECUTE와 mutable search path | 필요한 함수만 유지하고 빈 `search_path`, fully-qualified 객체, 함수별 REVOKE/GRANT 사용 |
| 향후 함수 | PostgreSQL 기본값과 운영 drift로 넓은 EXECUTE 가능 | `postgres`가 이후 생성하는 함수의 기본 PUBLIC/anon/authenticated/service_role EXECUTE 철회 후 함수별 allowlist 적용 |
| push subscription UPDATE | 운영 drift에 의존하는 table-wide UPDATE | `user_id`, `endpoint`, `keys` 열만 허용하고 `USING`/`WITH CHECK auth.uid() = user_id` 적용 |
| `debug_logs` | `PUBLIC`/`anon`/`authenticated`가 내부 운영 로그를 쓰거나 읽을 수 있음 | 모든 browser-facing 권한과 RLS policy를 제거하고 Edge의 `service_role` INSERT만 유지 |
| profile webhook | 중복 trigger에 자격 증명이 SQL literal로 포함됨 | 기존 webhook trigger/function 제거 후 Vault 이름만 참조하는 단일 trigger 생성. 최소 profile 필드만 전송 |
| Edge webhook 인증 | secret 미설정 시 우회 가능하고 Authorization fallback 허용 | `WEBHOOK_SECRET`이 없으면 503, 정확한 `x-webhook-secret`만 timing-safe 비교, 다른 인증 header는 거부 |
| VAPID 구독 | 현재 key와 무관하게 기존 구독 처리 | browser subscription의 `applicationServerKey`를 비교하고 다를 때만 DB cleanup → unsubscribe → subscribe → persist를 각 1회 수행 |

## 함수별 최종 권한표

| 분류 | 함수 | 최종 실행 역할 | authorization 계약 |
|---|---|---|---|
| 인증 클라이언트 | `send_friend_request(text)` | `authenticated` | `auth.uid()` 필수, 이메일 lookup과 존재 여부는 함수 내부에서만 처리 |
| 인증 클라이언트 | `accept_friend_request(uuid)` | `authenticated` | 실제 수신자만 pending request를 수락 가능 |
| 인증 클라이언트 | `delete_friend(uuid)` | `authenticated` | 호출자와 연결된 양방향 friendship만 삭제 |
| 인증 클라이언트 | `get_friends_study_time(uuid,text)` | `authenticated` | 인자 user ID가 `auth.uid()`와 같고 실제 친구 범위만 반환 |
| 인증 클라이언트 | `get_group_study_time_v3(uuid,timestamptz,timestamptz)` | `authenticated` | 실제 그룹 멤버십과 유효 시간 범위 검사 |
| RLS/helper | `is_admin()` | `authenticated` | 호출자의 `auth.uid()`에 해당하는 보호된 profile role만 검사 |
| RLS/helper | `is_group_member(uuid)` | `authenticated` | 호출자의 실제 group membership만 검사 |
| 관리자 | `get_admin_dashboard_stats(timestamptz)` | `authenticated` | 함수 내부에서 `is_admin()` 재검사 |
| 관리자 | `get_admin_user_study_summary(uuid)` | `authenticated` | 함수 내부에서 `is_admin()` 재검사 |
| cron 전용 | `private.delete_unconfirmed_users()` | owner `postgres`만 | `PUBLIC`/`anon`/`authenticated`/`service_role` EXECUTE 없음 |
| trigger 전용 | `handle_new_user()`, `handle_user_update()`, `trim_push_subscriptions()` | 직접 호출 역할 없음 | trigger에서만 실행 |
| trigger 전용 | `private.guard_profile_protected_columns()`, `private.enqueue_profile_status_webhook()` | 직접 호출 역할 없음 | private schema trigger에서만 실행 |
| 제거 | `add_friend`, `get_user_id_by_email`, `get_group_study_time`, `get_group_study_time_v2`, `public.delete_unconfirmed_users` | 없음 | 직접 친구 생성, 이메일 열거, 비멤버 통계, 공개 destructive 호출 경로 제거 |

`anon`과 `service_role`은 `public`/`private`의 애플리케이션 함수에 대한 EXECUTE를 갖지 않는다. service role의 의도된 시스템 작업은 table privilege와 RLS bypass를 사용하며 공개 RPC 권한에 의존하지 않는다.

2026-08-07 운영 `pg_proc`/ACL과 `information_schema.routine_privileges`의 read-only 대조에서 기존 함수들에 explicit `service_role` EXECUTE drift가 확인됐다. migration은 유지 함수마다 signature-specific REVOKE를 적용하고 `postgres`의 향후 함수 default privilege에서도 `service_role`을 철회한다. 로컬 fixture는 이 운영 drift를 재현한 뒤 pgTAP과 postflight로 제거를 검증한다.

## 비밀값 없는 환경 변수 계약

### Vercel / Next.js

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- 서버 route가 사용하는 환경에는 `SUPABASE_SERVICE_ROLE_KEY`

`NEXT_PUBLIC_VAPID_PUBLIC_KEY`는 공개값이지만 Edge Function의 `VAPID_PUBLIC_KEY`와 정확히 같은 key pair에 속해야 한다.

| 환경 | Vercel 공개키 | Supabase Edge key pair | 계약 |
|---|---|---|---|
| Development | 로컬 개발 공개키 | 로컬 또는 `fomopomo-dev` 전용 pair | Production key를 사용하지 않는다. |
| Preview | Preview 전용 공개키 | 별도 Preview Supabase project/branch의 pair | 대응하는 격리 Supabase가 없으면 remote push를 비활성화한다. |
| Production | 새로 회전한 Production 공개키 | 같은 새 Production pair | 다른 환경과 공유하지 않고 공개키 fingerprint만 배포 기록에 남긴다. |

### Supabase Edge Function

- 플랫폼 제공: `SUPABASE_URL`
- 플랫폼 제공: `SUPABASE_SERVICE_ROLE_KEY`
- 사용자 secret: `WEBHOOK_SECRET`
- 사용자 secret: `VAPID_PUBLIC_KEY`
- 사용자 secret: `VAPID_PRIVATE_KEY`
- 사용자 secret: `VAPID_SUBJECT`

private key, webhook secret, service-role credential은 CLI stdout, CI log, Git 파일, 문서에 기록하지 않는다. 공개키를 식별해야 할 때만 공개키 fingerprint를 기록한다.

### Supabase Vault

- `push_notification_url`
- `push_notification_webhook_secret`

`push_notification_webhook_secret`은 Edge Function의 `WEBHOOK_SECRET`과 같아야 한다. SQL에는 이름만 존재하고 값은 존재하지 않는다.

## 로컬 검증

기존 historical migration 체인은 초기 baseline과 후속 `groups` migration이 같은 table을 다시 생성하므로 그대로는 빈 DB replay가 불가능하다. 과거 migration을 수정하지 않는 제약을 지키기 위해 격리 harness가 최소 pre-remediation schema를 만든 뒤 canonical forward-only migration을 직접 적용한다.

Windows PowerShell에서 다음 한 명령으로 빈 로컬 DB reset, pgTAP, DB lint, security advisor를 실행한다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-supabase-security.ps1
```

추가 검증 명령:

```powershell
npm run lint
npx tsc --noEmit --pretty false
npm run test:run
npm run build
npm audit
```

Edge Function 검증은 Deno runtime에서 `fmt --check`, `test`, `check`를 수행한다. 테스트는 webhook config/auth, 오류 sanitization, 404/410 stale subscription 판정을 포함한다.

2026-08-07 최종 로컬 실행 결과는 pgTAP 67/67, read-only postflight 27/27, DB lint 0건, local security advisor 0건, Vitest 85/85, account route 집중 테스트 16/16, Deno helper 테스트 12/12, Deno format 성공, TypeScript/build 성공, npm audit high 이상 0건이다. ESLint는 오류 0건과 이번 변경과 무관한 기존 경고 2건으로 통과했다.

운영 적용 전에는 `supabase/verification/security_preflight.sql`을, DB migration 적용 후에는 `supabase/verification/security_postflight.sql`을 read-only로 실행한다. postflight의 모든 `passed` 값이 `true`여야 한다. 두 쿼리는 사용자 이메일, credential, 함수 본문, webhook body, 전체 push endpoint를 출력하지 않는다.

## 운영 적용 전 필수 preflight

모든 조회는 read-only로 수행하고 결과에는 credential이나 전체 push endpoint를 포함하지 않는다.

1. Supabase PITR 또는 즉시 복구 가능한 backup 상태를 확인한다.
2. `profiles`의 table/column UPDATE ACL과 UPDATE policy를 저장한다.
3. `public`/`private` 함수의 owner, `prosecdef`, `proconfig`, effective EXECUTE ACL을 저장한다.
4. `delete-unconfirmed-users` cron의 job name, schedule, owner, active 상태를 저장한다.
5. profile table의 webhook trigger/function 이름만 저장한다. 함수 본문은 자격 증명을 포함할 수 있으므로 출력하지 않는다.
6. 다음 두 중복 건수를 집계한다. migration은 각 방향별 최신 행 하나만 남기고 이전 중복을 삭제한 뒤 UNIQUE constraint를 추가한다.
   - `friendships(user_id, friend_id)` 중복 행 수
   - `friend_requests(sender_id, receiver_id)` 중복 행 수
7. 현재 Edge Function version과 `verify_jwt` 상태를 저장한다.
8. 올바른 Vercel Production project와 environment를 확인한다.

중복 삭제 건수가 0이 아니면 삭제 건수와 backup 위치를 승인 요청에 명시한다.

2026-08-07 승인 직전 read-only 집계에서는 두 테이블 모두 중복 그룹 0건, 삭제 예정 행 0건이었다. 실제 적용 직전에도 같은 집계를 다시 수행하며, 값이 달라지면 적용을 중지하고 변경된 삭제 건수로 재승인받는다.

## 승인 후 운영 적용 순서

### 1. 안전한 자격 증명 준비

1. VAPID key pair 한 쌍을 secure workstation 또는 secret manager에서 생성한다.
2. private key를 화면, stdout, clipboard history, 파일, CI log에 남기지 않고 secret destination에 직접 저장한다.
3. 새로운 고엔트로피 webhook secret을 같은 방식으로 생성한다.
4. 새로운 service-role key 또는 legacy JWT 교체 절차를 Supabase 프로젝트의 실제 key 유형에 맞게 준비한다.

### 2. webhook 인증과 DB 권한 cutover

1. Vault에 `push_notification_url`과 새로운 `push_notification_webhook_secret`을 저장한다.
2. Edge Function의 `WEBHOOK_SECRET`을 같은 값으로 설정한다. 이 단계에서는 현재 VAPID pair를 잠시 유지해 인증 변경과 VAPID 변경을 분리한다.
3. hardened `push-notification`을 custom header 인증으로 배포하고 platform JWT 검증은 끈다. JWT를 끄는 것은 함수가 secret 미설정 시 fail-closed이고 정확한 `x-webhook-secret`만 허용할 때만 가능하다.
4. 즉시 forward-only DB migration을 적용한다. migration은 hardcoded credential trigger를 제거하고 Vault-backed trigger로 교체한다.
5. 상태 변경 한 건으로 Edge가 2xx를 반환하고 비밀값 없는 sanitized log만 남기는지 확인한다.

2번의 Edge 배포와 4번의 DB migration 사이에는 기존 trigger 요청이 401이 될 수 있는 짧은 push 중단 구간이 있다. 타이머 및 상태 저장 자체에는 영향을 주지 않는다.

### 3. VAPID pair cutover

1. Vercel의 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`를 새 공개키로 갱신하고 Production app을 배포한다.
2. 바로 이어서 Edge의 `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`를 같은 새 pair로 갱신하고 재배포한다.
3. 테스트 브라우저가 다음 방문 시 기존 key 불일치를 감지하고 정확히 한 번 재구독하는지 확인한다.
4. 실제 브라우저 두 계정으로 친구의 공부 시작 push를 확인한다.
5. 아직 방문하지 않은 브라우저의 기존 subscription은 새 private key로 전송할 수 없으므로 방문 전까지 push를 놓칠 수 있다. 404/410이 아닌 key mismatch는 DB에서 자동 삭제하지 않으며, 방문 시 client가 정리한다.

전체 push subscription 일괄 삭제는 하지 않는다. 일괄 삭제가 필요해지면 영향 범위와 복구 절차를 별도로 제시하고 다시 승인받는다.

### 4. 노출된 service-role credential 회전

1. Vercel server routes, Supabase Edge Functions, 기타 consumer 목록을 확정한다.
2. 새 credential을 모든 consumer에 설정하고 순차 재배포한다.
3. account reset/delete, status route, Edge Function의 service-role 동작을 smoke test한다.
4. 구 credential을 revoke한다.
5. read-only query와 log로 구 credential 사용이 더 이상 없는지 확인한다.

이 회전은 서버 API에 영향을 줄 수 있으므로 webhook/VAPID cutover와 별도의 명시적 승인 지점으로 다뤄도 된다.

## 운영 적용 직후 검증

- `authenticated`의 `profiles` table-wide UPDATE가 false인지 확인한다.
- 보호 열의 UPDATE가 false이고 운영 열만 true인지 확인한다.
- `PUBLIC`/`anon`/`authenticated`가 `debug_logs`를 SELECT/INSERT할 수 없고 client-facing policy가 0개인지 확인한다.
- 일반 사용자, admin JWT 모두 직접 `role` 변경이 실패하는지 확인한다.
- `public.delete_unconfirmed_users()`가 없고 private 함수에 anon/authenticated/service_role EXECUTE가 없는지 확인한다.
- cron이 `private.delete_unconfirmed_users()`만 호출하고 owner가 허용된 실행자인지 확인한다.
- `PUBLIC` 및 `anon`이 민감 RPC를 실행할 수 없는지 확인한다.
- 모든 `SECURITY DEFINER`가 빈 fixed `search_path`를 가지는지 확인한다.
- 직접 `friendships` INSERT가 실패하고 정상 request/accept는 성공하는지 확인한다.
- 비멤버 그룹 통계와 임의 `user_id` 친구 통계가 실패하는지 확인한다.
- security advisor에서 이번 범위의 mutable search path, exposed definer, RLS 경고가 제거됐는지 확인한다.
- 새 VAPID pair로 실제 browser push가 도착하는지 확인한다.
- 로그에 credential, Authorization header, 전체 subscription endpoint가 없는지 확인한다.

## 롤백 및 장애 대응

### DB migration

- 기존 migration 파일을 수정하거나 되돌리지 않는다. 항상 새 compensating migration을 사용한다.
- broad PUBLIC EXECUTE, table-wide profile UPDATE, 직접 friendship INSERT, client-facing `debug_logs` 접근을 다시 허용하지 않는다.
- 중복 friendship/request 정리는 backup 없이는 원복할 수 없다. 적용 전 중복 건수와 backup을 반드시 확인한다.
- RPC 장애 시 해당 RPC 구현/ACL만 최소 범위로 보정한다.
- webhook 장애 시 새 compensating migration으로 profile webhook trigger를 일시 비활성화할 수 있다. 핵심 상태 저장은 계속 동작한다.

### Edge/webhook

- 노출된 webhook secret 또는 service-role credential을 복원하지 않는다.
- 새 secret이 잘못되면 또 다른 새 secret을 생성해 Edge와 Vault를 함께 갱신한다.
- 이전 permissive Edge version으로 그대로 rollback하지 않는다. 필요한 경우 strict custom-secret 검증을 유지한 수정 version으로 roll-forward한다.

### VAPID

- 노출된 과거 pair로 돌아가지 않는다.
- 새 pair가 잘못되면 세 번째 pair를 생성해 Vercel과 Edge에 함께 적용한다. browser client는 다시 한 번 key mismatch rotation을 수행한다.
- 구독 DB를 일괄 삭제하지 않는다. 실제 404/410 또는 사용자 범위 client cleanup만 사용한다.

## 운영 적용 기록 — 2026-08-07

### 사전 안전성 확인

- 운영 프로젝트는 Supabase Free plan으로 scheduled backup/PITR가 제공되지 않았다. 따라서 migration의 transaction 경계를 유지하고, 적용 직전 `friendships(user_id, friend_id)`와 `friend_requests(sender_id, receiver_id)`의 중복을 다시 확인했다.
- 두 테이블 모두 중복 그룹 0건, 삭제 예정 행 0건이었다. 승인 범위를 바꾸는 데이터 삭제는 발생하지 않았다.
- 적용 후 재집계도 두 테이블 모두 중복 그룹 0건, 초과 행 0건이었다.

### DB·Webhook·Edge

- 운영 migration history: `20260807105056 harden_authorization_and_push_webhook`.
- Vault에는 `push_notification_url`, `push_notification_webhook_secret` 이름의 secret만 저장했다. 값은 이 문서와 실행 로그에 기록하지 않았다.
- `push-notification` Edge Function은 version 15, `ACTIVE`, `verify_jwt=false`로 배포됐다. source hash는 `f7b9f0332d25b4ff1b749ce9553db688ad05aff112317eb6b2d999700d3005bb`다.
- Edge는 정확한 `x-webhook-secret`만 허용한다. header가 없으면 401, 새 header를 사용한 Vault-backed `pg_net` 호출은 200과 sanitized `No friends found` 응답을 반환했다.
- legacy API key 비활성화 직후 version 14에서 새 secret key가 배포 snapshot에 포함되지 않아 500이 1회 발생했다. 같은 hardened source를 새 환경 snapshot으로 version 15에 즉시 재배포해 해결했고, 이후 동일 경로는 200을 반환했다. 이 기록은 해결된 전환 중 incident이며, 과거 오류가 없었다고 간주하지 않는다.
- 운영 security postflight는 27/27 모두 `passed=true`였다.

### VAPID·브라우저 Push

- 새 Production VAPID 공개키의 SHA-256 fingerprint는 `b90ecd05571b07d7884e1ae0776a385af81f82d38f29a8dd3425e56c0808da84`다. private key는 기록하지 않는다.
- Vercel `NEXT_PUBLIC_VAPID_PUBLIC_KEY`는 Production에만 설정했고, Edge의 공개키/개인키와 같은 pair로 전환했다.
- 운영 브라우저는 공개키 불일치를 감지해 기존 subscription을 정리하고 새 key로 재구독한 뒤 DB에 저장했다.
- 새 VAPID pair로 최신 운영 subscription에 직접 전송한 Web Push 공급자 응답은 HTTP 201이었다. 화면 toast는 자동화 세션에서 시각적으로 확인하지 못했으므로, 이 결과는 전송 경로 검증이지 UI 도착 증명은 아니다.

### Supabase API key 회전·Vercel

- 새 publishable key와 secret key를 발급해 직접 REST 요청이 각각 HTTP 200임을 확인했다.
- Vercel의 `NEXT_PUBLIC_SUPABASE_ANON_KEY`와 `SUPABASE_SERVICE_ROLE_KEY`를 새 key type으로 전환했다. 기존 프로젝트 설정을 보존해 두 값의 scope는 All Environments이며, Development가 포함된 변수에는 Vercel UI상 Sensitive 표시를 사용할 수 없었다.
- opaque secret key를 지원하도록 account reset/delete route를 보완했다. legacy JWT는 project ref를 검증하고, opaque secret은 `SUPABASE_PROJECT_REF`와 URL의 ref가 일치할 때만 허용하며, 불명확한 설정은 fail-closed한다.
- application code commit `8293cf8`의 Production deployment는 `Ready`, `Current`였고 기본 domain에서 HTTP 200을 반환했다. 배포 bundle에는 새 publishable key만 존재하고 잘못된 임시값은 없음을 확인했다.
- account reset/delete route의 무인증 smoke test는 모두 예상대로 401 `Missing auth token`을 반환했다. 이는 destructive 동작 없이 새 server credential 설정이 수용됨을 확인한 결과다.
- Supabase의 legacy JWT 기반 anon/service-role API key를 비활성화한 뒤, 구 key의 REST 요청은 각각 HTTP 401, 새 publishable/secret key 요청은 각각 HTTP 200이었다.
- 로컬 `.env.local`은 별도 개발 Supabase 프로젝트를 가리킨다. 운영 key를 복사하지 않았으며, 그 개발 프로젝트의 자격 증명 정책은 별도 범위에서 관리한다.

### Advisor와 잔여 관찰 사항

- 운영 Security Advisor의 `debug_logs` RLS-no-policy INFO는 의도적으로 client policy를 0개로 만든 결과다.
- authenticated에만 허용된 `SECURITY DEFINER` RPC 9개의 WARN은 각 함수 내부 authorization, 빈 고정 `search_path`, 명시적 ACL을 postflight로 확인한 allowlist다.
- leaked-password protection 비활성화 WARN과 기존 Performance Advisor 항목은 이번 DB 권한/VAPID 회전 범위 밖이다. 따라서 운영 Advisor 경고가 0건이라고 주장하지 않는다.
- 비밀값, JWT, VAPID private key, 전체 push endpoint, 사용자 이메일은 이 기록에 포함하지 않았다.
