# 그룹·피드백 Storage·Push 보안 운영 런북

## 상태와 승인 경계

이 문서는 그룹 가입, 피드백 이미지 Storage, Push 알림 보안 변경의 운영 절차다. 저장소 변경과 로컬 검증은 운영 변경이 아니다. 다음 작업은 정확한 변경 내용, 영향, 롤백을 검토한 뒤 사용자의 명시적 승인을 받아야만 수행한다.

- 운영 DB migration 적용
- `feedback-uploads` bucket 공개 여부, 크기 제한, MIME 제한, Storage policy 변경
- Edge Function 배포
- Supabase Edge secret 또는 Vault secret 변경
- Database Webhook/trigger 변경
- 운영 Storage 객체 또는 테이블 데이터의 backfill/삭제

이번 변경에서는 VAPID key pair를 회전하지 않는다. service-role/secret key, webhook secret, VAPID private key는 출력하거나 파일·로그·명령 이력에 기록하지 않는다.

2026-08-07 읽기 전용 조사 기준 운영 프로젝트의 migration history는 다음 세 항목뿐이다.

- `20260123190000 remote_baseline`
- `20260123191000 remove_leaderboard`
- `20260807105056 harden_authorization_and_push_webhook`

반면 저장소에는 오래된 로컬 migration이 함께 남아 있다. 따라서 운영에서 `supabase db push`를 실행해 로컬 전체 체인을 적용하지 않는다. 승인 후에도 이번 forward-only SQL 한 건만 이름을 명시해 적용하고, 적용 직후 remote migration history를 다시 조회한다.

같은 시점의 민감값 없는 영향 집계는 다음과 같다.

- 그룹 5개, membership 17개, 6자리 대문자 영숫자 형식에 맞지 않는 그룹 코드 0개
- feedback 1개, reply 1개, 두 테이블의 legacy image URL reference 0개
- push subscription 30개: Apple provider 25개, FCM provider 5개
- `feedback-uploads` object 2개: 두 object 모두 owner 정보는 있으나 owner-prefixed/canonical namespace가 아님

GitHub의 읽기 전용 deployment 기록에서는 `origin/main`의 현재 커밋 `89971c6c65349fabf7e148cb7238a1d508f9e358`에 대해 `vercel[bot]`이 만든 `Production` 배포가 성공 상태다. 따라서 이 저장소에서 `main` push는 운영 앱 배포를 유발하는 외부 변경으로 취급하며, 별도의 명시적 승인 없이 commit/push하지 않는다.

따라서 migration은 기존 group code나 subscription을 정리·삭제할 이유가 없으며, 두 legacy Storage object를 이동·backfill·삭제해서는 안 된다. 실제 적용 직전 같은 집계를 반복하고 수치가 달라지면 승인을 다시 받는다.

## 변경 산출물

- `supabase/migrations/20260807052639_secure_groups_storage_push.sql`
- 그룹 생성·가입·초대 코드·리더 이양 RPC 호출 코드
- `public.feedback_images` canonical object-path 모델
- 사용자 namespace/owner 기반 Storage policy
- 공유 account reset/delete Storage cleanup helper
- fail-closed, DB 재검증, deduplication을 적용한 `push-notification`
- RLS/RPC/Storage/Edge Function 공격 경로 테스트
- `supabase/verification/security_preflight.sql`
- `supabase/verification/security_postflight.sql`
- 이 문서

## 변경 전후 권한표

| 표면 | 변경 전 | 변경 후 계약 |
|---|---|---|
| `groups` SELECT | `PUBLIC` 정책 `USING (true)`로 anon·비멤버가 ID와 초대 코드 조회 가능 | `authenticated` 멤버/리더만 row 조회. 일반 조회 열에서 `code` 제외 |
| 그룹 초대 코드 | `groups.code` 직접 SELECT | 리더 전용 RPC만 반환. 일반 멤버·anon·비멤버에는 미노출 |
| 그룹 생성 | browser가 `groups` INSERT 후 `group_members` INSERT, 실패 시 best-effort 삭제 | `create_group(p_name)`가 인증 확인, 코드 생성, 그룹/리더 membership을 한 transaction에서 생성 |
| 그룹 가입 | code로 table 조회 후 browser가 `group_members` 직접 INSERT | `join_group_by_code(p_code)`만 실행. code 정규화·형식 검사·중복/동시 가입 idempotency를 DB에서 보장 |
| membership INSERT/UPDATE | 자기 `user_id`면 임의 그룹 INSERT 가능; UPDATE 열 제한 없음 | 직접 INSERT 철회. `nickname`만 자기 row에서 수정 가능하며 identity 열은 변경 불가 |
| 리더 이양 | browser가 `groups.leader_id` 직접 UPDATE | 기존 리더만 현재 멤버에게 RPC로 원자적 이양 |
| feedback 이미지 식별자 | 사용자 입력 `images[]`의 public URL을 삭제 식별자로 재사용 | `feedback_images(user_id,bucket_id,object_path,feedback_id/reply_id)`에 canonical path 저장. 표시 URL과 삭제 식별자 분리 |
| 새 object key | 원본 파일명/임의 경로 가능 | `<auth.uid()>/<generated-uuid>.<validated-extension>`만 허용 |
| Storage INSERT/UPDATE/DELETE | authenticated면 bucket 어느 경로든 INSERT; owner UPDATE/DELETE 정책 없음 | MIME/크기 제한 + 사용자 namespace와 `owner_id` 일치. 다른 사용자 object 쓰기/수정/삭제 차단 |
| Storage SELECT | bucket 전체 public | private bucket과 signed URL 흐름. 소유자 또는 허용된 canonical attachment만 조회 |
| account reset/delete | feedback URL 문자열에서 경로를 잘라 service role로 삭제 | `userId/` namespace를 list하고 object owner를 재검증한 뒤 dedupe/chunk 삭제. 임의 URL은 권한 근거로 사용하지 않음 |
| `push-notification` 인증 | secret 누락 시 503, 정확한 custom header 사용(기존 보완 완료) | 기존 fail-closed 계약 유지 + method/body/schema/size 엄격 검증. user JWT만으로 호출 불가 |
| Push 이벤트 | body의 profile/transition을 신뢰, dedup 없음 | event UUID를 원자적으로 claim하고 실제 profile 상태를 DB에서 재조회. 동일 event 및 짧은 status flap 억제 |
| Push 수신자 | 발신자 방향 friendship을 조회하고 opt-out 무시 | `friend_id = actor`, `user_id = recipient`, `is_notification_enabled = true` 방향만 사용 |
| Push endpoint | DB에 저장된 임의 HTTPS/내부 endpoint 가능 | 표준 browser push provider HTTPS endpoint만 허용하고 localhost/private/link-local/IP literal 차단 |
| stale subscription | `id`만으로 404/410 row 삭제 | 실제 조회한 `id + user_id + endpoint`가 모두 일치할 때만 삭제 |

## 비밀값 없는 환경 변수 계약

### Next.js / Vercel

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- server route 전용 `SUPABASE_SERVICE_ROLE_KEY`
- opaque Supabase secret key 사용 시 server route 전용 `SUPABASE_PROJECT_REF`
- 선택적 방어 계층 `SUPABASE_ALLOWED_PROJECT_REFS`

### Supabase Edge Function

- 플랫폼 제공 `SUPABASE_URL`
- `SUPABASE_SECRET_KEYS`의 `backend_api` 또는 `default`, 혹은 전환 기간의 `SUPABASE_SERVICE_ROLE_KEY`
- `WEBHOOK_SECRET`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

### Supabase Vault

- `push_notification_url`
- `push_notification_webhook_secret`

Vault의 `push_notification_webhook_secret`과 Edge의 `WEBHOOK_SECRET`은 같은 값이어야 한다. 이번 작업은 값 회전을 요구하지 않으며, 존재 여부와 연결만 검증한다.

## 로컬 검증

설치된 CLI는 `npx --yes supabase`로 호출하며, 구현 시 확인한 stable version은 2.111.0이다. 먼저 각 명령의 `--help`를 확인한다.

```powershell
npx --yes supabase --version
npx --yes supabase migration list --help
npx --yes supabase db reset --help
npx --yes supabase db lint --help
npx --yes supabase db advisors --help
npx --yes supabase test db --help
npx --yes supabase functions serve --help
```

historical migration 체인은 서로 중복되는 과거 baseline 때문에 그대로 replay하지 않는다. 과거 파일을 수정하는 대신 격리된 `test-harness`가 빈 Postgres 17 DB에 현재 운영 전제 fixture와 기존 canonical 보안 migration만 먼저 적용하고, preflight를 실행한 다음 이번 migration 한 건을 적용한다. 그 뒤 pgTAP, postflight, lint, advisor를 실행해 실제 운영 순서를 재현한다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-supabase-security.ps1
npm run lint
npx tsc --noEmit --pretty false
npm run test:run
npm run build
npm audit --audit-level=high
```

Edge Function은 다음 명령으로 검증한다. `--no-lock`은 검증 과정에서 저장소 루트에 임시 lockfile이 생기는 것을 막는다.

```powershell
Push-Location .\supabase\functions\push-notification
npx deno fmt --check helpers.ts helpers_test.ts index.ts index_test.ts
npx deno check --node-modules-dir=none --no-lock index.ts
npx deno test --node-modules-dir=none --no-lock --allow-env
Pop-Location
```

secret 값이 없는 테스트 환경에서는 placeholder test secret만 process/runtime memory에 주입하고 저장소에 기록하지 않는다.

2026-08-07 최종 로컬 검증 결과는 다음과 같다.

- pre-migration preflight → migration 단독 적용 → 126개 pgTAP → postflight: 통과
- `supabase db lint --local --schema public,private --level warning --fail-on error`: 이슈 0개
- `supabase db advisors --local --type security`: 이슈 0개
- Deno format/check 및 Edge 테스트 32개: 통과
- Vitest 18개 파일, 98개 테스트: 통과
- TypeScript: 통과
- ESLint: 오류 0개, 이번 변경과 무관한 기존 경고 2개
- Next.js production build: 통과
- `npm audit --audit-level=high`: 취약점 0개

## 운영 적용 전 읽기 전용 preflight

`supabase/verification/security_preflight.sql`은 사용자 데이터 값, 전체 object path, push endpoint, 함수 본문, secret 값을 반환하지 않아야 한다. 적용 직전에 다음을 다시 확인한다.

1. 현재 remote migration history와 대상 프로젝트 이름
2. `groups`, `group_members`, `feedbacks`, `feedback_replies`, `push_subscriptions`의 grants/policies
3. `groups(code)`와 `group_members(group_id,user_id)` unique constraint
4. feedback bucket의 `public`, `file_size_limit`, `allowed_mime_types`
5. Storage object policy 목록과 owner/path 조건
6. `push-notification` active version 및 `verify_jwt=false`
7. profile status webhook trigger/function 이름, Vault secret 이름의 존재 여부(값 제외)
8. canonical 형식으로 자동 전환 가능한 legacy attachment 수와 소유권 미확인 수
9. migration이 정리하거나 삭제할 중복/invalid row 수
10. 즉시 복구 가능한 backup/PITR 상태

사전 집계가 문서의 승인 요청 수치와 다르거나 migration이 예고하지 않은 row를 수정·삭제한다면 적용을 중지하고 새 영향도로 다시 승인받는다.

## 승인 요청에 포함할 정확한 변경

2026-08-07 최종 검증 산출물의 SHA-256은 다음과 같다. 파일 내용이 바뀌면 이 값은 무효이며, 전체 검증과 승인을 다시 받아야 한다.

- migration: `b909c53c6d16fbf264745d441147c79b65ad9229e017c0fe23610563804dbb2b`
- Edge `index.ts`: `7c3c5e50d836c6e1835f8e618332fc43fa2bd1c774c61983680951e876b1b65d`
- Edge `helpers.ts`: `c73ebd174b2cbefd73b90ba4178824b55aca020da70e1f11ae3448aeebc21fe6`
- Edge `deno.json`: `d6362ea36424d429cf0185822a9ecbf3e7f1c28315b4904ea7f7d420e3555ac8`

승인 요청에는 다음 자료를 붙인다.

- 적용할 SQL 파일의 전체 diff와 SHA-256
- 생성/변경/삭제되는 policy, function, constraint, trigger 이름
- bucket 공개→비공개 전환 및 legacy public URL 중단 영향
- 직접 group DML이 즉시 차단되는 동안 발생할 수 있는 짧은 배포 전환 구간
- Edge payload contract 전환 중 발생할 수 있는 일시적 push 누락/일반화된 알림 문구
- legacy Storage 자동 삭제·자동 backfill을 하지 않는다는 보장
- 아래의 forward-only 롤백 절차

운영 migration은 연결된 Supabase 관리 API의 `apply_migration`으로 다음 한 건만 적용한다. `<verbatim SQL>`은 승인된 파일의 SHA-256과 일치하는 전체 내용이어야 한다.

```text
project_id: pqfozgiprhizwavfhjgv
name: secure_groups_storage_push
query: <verbatim supabase/migrations/20260807052639_secure_groups_storage_push.sql>
```

이 방식은 저장소의 과거 migration 전체를 push하지 않고 SQL 적용과 remote migration history 기록을 한 작업으로 묶는다. SQL Editor에서 임의 실행하거나 `supabase db push`로 대체하지 않는다.

승인 전에는 migration 적용, Edge 배포, bucket 변경, secret 변경, webhook 변경을 실행하지 않는다.

## 승인 후 운영 적용 순서

1. maintenance window를 시작하고 그룹 생성/가입 및 feedback image upload를 잠시 중단한다.
2. preflight를 다시 실행하고 승인된 수치와 일치하는지 확인한다.
3. 전체 로컬 migration 체인을 push하지 않고 `20260807052639_secure_groups_storage_push.sql` 한 건만 migration history에 기록되는 방식으로 적용한다.
4. postflight에서 모든 boolean assertion이 true인지 확인한다. 실패하면 app/Edge 배포를 중단하고 안전한 보정 migration을 준비한다.
5. 새 payload와 dedup/recipient 검증을 지원하는 `push-notification`을 기존 secret과 VAPID pair로 배포한다. custom secret 인증 때문에 `verify_jwt=false`를 유지한다.
6. 그룹 RPC 및 canonical feedback-image helper를 사용하는 Next.js app을 배포한다.
7. 두 개의 실제 test account로 그룹 생성→코드 조회→가입→중복 가입→이양→탈퇴를 smoke test한다.
8. 자기 namespace upload/signed read/delete와 다른 사용자 namespace 거부를 확인한다.
9. opt-in 친구 한 명과 opt-out 친구 한 명으로 단일 status transition을 발생시켜 전자에게만 한 번 전달되는지 확인한다. 같은 event UUID replay는 전달되지 않아야 한다.
10. 404/410 test endpoint 정리가 해당 subscription row에만 영향을 주는지 확인한다.
11. Security Advisor와 read-only postflight를 다시 실행하고 maintenance window를 종료한다.

DB 적용과 app 배포 사이에는 기존 client의 직접 group write가 실패하는 짧은 fail-safe 중단 구간이 생긴다. 이 구간에서 취약 정책을 다시 열어 호환성을 유지하지 않는다.

Edge 배포 입력은 `push-notification` 이름, `index.ts`, `helpers.ts`, `deno.json`, `verify_jwt=false`다. 배포 전에 기존 `WEBHOOK_SECRET`과 VAPID 환경 변수의 존재만 확인하고 값을 출력하지 않는다. 배포 후 새 version과 source hash를 적용 기록에 남긴다.

현재 확인된 앱 배포 입력은 검증된 27개 변경 파일을 하나의 의도적인 commit으로 만들고 `origin/main`에 push하는 것이다. 이 push는 Vercel Production 배포를 자동으로 시작하므로 DB/Edge/app을 함께 승인받은 maintenance window 안에서만 실행한다. push 전 최종 commit SHA와 변경 파일 목록을 다시 제시하고, push 후 GitHub deployment 상태가 `success`가 될 때까지 확인한다.

## Webhook secret 설정 또는 복구 순서

현재 운영은 Vault의 `push_notification_webhook_secret`과 Edge의 `WEBHOOK_SECRET`을 이미 사용한다. 이번 변경에서는 값 변경이나 VAPID 회전을 하지 않는다. 둘 중 하나가 없거나 서로 다른 것으로 확인되면 rollout을 중지하고 다음 작업을 별도 승인받는다.

1. 암호학적으로 안전한 새 secret을 승인된 password/secret manager 안에서 생성한다. 채팅, 저장소, 로그, shell history에 값을 넣지 않는다.
2. Edge의 `WEBHOOK_SECRET`을 먼저 등록하되 아직 트래픽을 전환하지 않는다.
3. 같은 값을 Supabase Vault의 `push_notification_webhook_secret`에 parameterized/dashboard secret 입력으로 등록한다.
4. `push_notification_url`이 승인된 현재 프로젝트의 `push-notification` URL인지 host와 function slug만 확인한다.
5. `verify_jwt=false`와 custom secret 검증 코드가 포함된 Edge version을 배포한다.
6. secret 없음/오류 요청이 401, runtime secret 없음이 503인지 확인한 뒤 한 번의 실제 status transition으로 정상 호출을 검증한다.
7. 실패하면 secret 값을 비교 출력하지 말고 설정 순서와 secret version을 확인한다. 필요 시 webhook trigger를 보정 migration으로 일시 비활성화한다.

## Legacy Storage 처리 전략

- 기존 `feedbacks.images`와 `feedback_replies.images`는 읽기 호환용으로만 남기고 새 client write 권한을 철회한다.
- URL 문자열만으로 object 삭제 또는 ownership 결정을 하지 않는다.
- 새 upload는 모두 canonical `feedback_images` row와 사용자 namespace를 사용한다.
- cleanup은 `userId/` prefix를 Storage API로 list한 뒤 각 object의 owner가 user ID와 같은 경우만 삭제한다.
- 정확한 project host/bucket/path와 Storage owner가 모두 확인되는 legacy object만 별도 승인된 backfill 대상으로 분류한다.
- 소유권 미확인, 외부 host, 다른 project/bucket, traversal/encoded separator가 포함된 URL은 자동 backfill·자동 삭제하지 않는다.
- legacy backfill은 별도 dry-run 보고서(대상/건너뜀/충돌 건수)를 만든 뒤 승인받아 실행한다. 전체 path나 사용자 식별자는 운영 로그에 남기지 않는다.

## 운영 적용 후 검증

- anon과 인증 비멤버의 `groups` SELECT가 0 row/권한 오류인지 확인
- 일반 멤버에게 `groups.code` SELECT가 거부되는지 확인
- direct `group_members` INSERT 및 `group_id`/`user_id` UPDATE가 거부되는지 확인
- `create_group`, `join_group_by_code`, leader-only code fetch, leadership transfer ACL과 결과 확인
- Storage 정책이 사용자 namespace와 owner를 모두 검사하는지 확인
- 다른 사용자 object의 UPDATE/DELETE가 거부되는지 확인
- 악의적 feedback URL이 account reset/delete target이 되지 않는지 확인
- cleanup의 chunk 실패가 2xx success로 보고되지 않는지 확인
- push subscription CRUD가 자기 row에만 허용되고 user_id 변경이 거부되는지 확인
- secret 누락/오류, 일반 JWT-only, oversized/invalid payload가 거부되는지 확인
- forged profile ID와 현재 상태 불일치가 알림을 만들지 않는지 확인
- opt-out recipient 제외, event replay dedup, cooldown suppression 확인
- private/local endpoint가 network target이 되지 않는지 확인
- Security Advisor에서 이번 범위의 public bucket/listing, RLS, mutable search path, broad function ACL 경고 검토

## 안전한 롤백과 장애 대응

### DB/RLS/RPC

- 적용된 migration 파일을 수정하거나 migration history를 지우지 않는다. 새 compensating migration으로 roll-forward한다.
- public group read, direct membership INSERT, broad identity UPDATE를 다시 허용하지 않는다.
- RPC 오류는 해당 함수 signature/body/ACL만 보정한다. 필요하면 group write 기능을 일시 중단한다.
- column privilege 문제는 필요한 non-secret 열만 추가 grant한다. `groups.code` table SELECT는 열지 않는다.

### Storage

- 삭제된 object는 DB rollback으로 복구되지 않는다. 그래서 migration은 legacy object를 삭제하지 않으며 cleanup은 owner 확인 후에만 실행한다.
- private bucket 전환으로 표시 장애가 생기면 public bucket/policy를 복원하지 않고 signed URL 발급 경로를 보정한다.
- upload 장애 시 새 upload를 일시 중단하고 canonical attachment row/object의 부분 생성 여부를 정리한다.
- cleanup 실패 시 account reset/delete를 성공 처리하지 않고 재시도 가능한 오류를 반환한다.

### Edge/Webhook

- 이전의 body-trusting Edge version으로 rollback하지 않는다.
- 심각한 push 장애 시 새 compensating migration으로 status webhook trigger를 비활성화해 push만 중단한다. profile status 저장은 계속 동작한다.
- secret 불일치 시 secret 값을 출력해 비교하지 않는다. 동일 secret의 Edge/Vault 설정 순서를 재확인하거나 별도 승인으로 새 secret을 회전한다.
- VAPID pair는 이번 변경에서 유지한다. push provider 오류 때문에 subscription 전체를 삭제하거나 VAPID key를 임의 회전하지 않는다.

## 적용 기록

운영 변경을 승인받아 실제 적용한 경우에만 다음을 기록한다.

- 승인 시각과 승인 범위
- migration remote version/name 및 SQL SHA-256
- Edge Function version/source hash와 `verify_jwt` 상태
- app deployment 식별자
- preflight/postflight/test 결과(건수만, 민감값 제외)
- 실제 데이터 변경 건수와 건너뛴 legacy object 건수
- incident, 보정 migration, 남은 수동 작업

### 2026-08-07 운영 반영

- 승인 범위: 프로젝트 `pqfozgiprhizwavfhjgv`의 DB/Storage/Webhook migration, `push-notification` Edge Function, 이 문서를 포함한 `origin/main` commit의 Vercel Production 배포
- migration: remote version `20260807154657`, name `secure_groups_storage_push`, SQL SHA-256 `b909c53c6d16fbf264745d441147c79b65ad9229e017c0fe23610563804dbb2b`
- Edge Function: `push-notification` version `16`, bundle SHA-256 `842f35ab21d87cda00be23efdd3eb76f636688eeccde74ffef17c35d34a4115f`, `verify_jwt=false`
- secret/VAPID: 기존 `WEBHOOK_SECRET`과 VAPID pair를 유지했으며 값 조회·출력·변경 없음
- 검증: 운영 preflight 승인 수치 일치, DB postflight의 모든 assertion 통과, secret 없음/오류/JWT-only Edge 요청이 각각 HTTP 401
- 데이터 영향: 그룹 5개, membership 17개, feedback/reply 각 1개, push subscription 30개, Storage object 2개 유지; 삭제·legacy backfill 0개; 새 `feedback_images`/push event row 0개
- bucket: `feedback-uploads`를 private, 5 MiB, JPEG/PNG/WebP/GIF 제한으로 전환; 기존 비정규 legacy object 2개는 이동하거나 삭제하지 않음
- advisor: 이번 RPC의 authenticated `SECURITY DEFINER` 일반 경고는 의도된 API surface로 검토했으며, exact EXECUTE allowlist, `auth.uid()` 재검증, 빈 `search_path` postflight가 모두 통과
- 배포 incident: 첫 Edge 요청은 기존 v15의 절대 import-map 경로가 승계되어 배포 전에 거부됐고 활성 v15는 불변이었다. `import_map_path=deno.json` 상대 경로를 명시한 동일 승인 번들 재시도로 v16이 정상 활성화됐다.
- 앱 commit 및 Vercel deployment 식별자는 이 문서를 포함한 최종 `origin/main` push의 GitHub/Vercel 외부 deployment 기록을 권위 있는 적용 기록으로 사용한다.
