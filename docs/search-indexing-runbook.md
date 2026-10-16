# Search Console 색인 정책 수정안

작성일: 2026-10-15 (한국 시간). 분석 기준: `main`의 `e0e855973f45ba20250b3c6f8caf9e9c09a79387`, Next.js `16.3.8`.

이 패치는 확인된 SEO 설정의 불일치를 개선한다. 실제 영향 URL과 Google이 선택한 표준 URL을 확보하지 못했으므로, 10월 12일 경고의 원인을 확정하거나 해결 완료로 선언하지 않는다.

## 확인한 사실과 추정

- Gmail 알림 두 건을 직접 확인했다. 한국 시간 2026-10-12 14:17의 사이트맵 포함 페이지 알림과 14:23의 전체 페이지 알림 모두 `사용자가 선택한 표준이 없는 중복 페이지`다. 본문에는 영향 URL, 개수, Google 선택 canonical이 없다. 두 알림의 URL 집합이 같은지 또는 겹치는지도 미확인이다.
- App Router를 사용한다. 모든 기존 HTML `page.tsx`는 Client Component이고, SEO metadata는 루트 layout에만 있었다. `metadataBase`와 `openGraph.url`은 있지만 `alternates.canonical`, robots metadata는 없었다. 별도 middleware/proxy 및 서버 로그인 리다이렉트는 없다.
- 사이트맵의 9개 URL에 `/plan`, `/friends`, `/groups`, `/profile`이 포함되어 있었다. 모든 `lastModified`는 `new Date()`로 생성되며 실제 콘텐츠 변경일을 나타내지 않는다.
- `useAuthSession`의 초기 `loading=true` 때문에 홈·계획·친구는 로딩 화면, 문의·후원·프로필은 빈 본문을 먼저 렌더링한다. 그룹 상세와 관리자도 클라이언트에서 인증을 확인한다. 법률 안내 두 페이지는 초기 HTML에 본문을 렌더링할 수 있다.
- **추정:** 비로그인/초기 HTML의 유사한 로딩 화면과 공통 Footer, 공통 제목·설명이 중복 판정에 기여했을 수 있다. Google은 JavaScript를 렌더링할 수 있으므로 초기 HTML만으로 실제 판정을 단정할 수 없다.
- **추정:** 추적 쿼리, www 등 호스트 변형이 영향 URL일 수 있다. 실제 보고서의 URL을 확인하기 전에는 어느 변형이 원인인지 단정하지 않는다.

10월 15일 비인증 HTTP 조회 결과(운영 배포의 Git SHA는 별도 확인 필요):

| 조회 | 관찰 |
| --- | --- |
| `https://fomopomo.com/`, `/plan`, `/contact` | 200; canonical, robots meta, X-Robots-Tag, h1 없음 |
| `https://fomopomo.com/?utm_source=seo-audit` | 200; 쿼리 유지, canonical 없음 |
| `/sitemap.xml` | 9개 URL, 공통 lastmod `2026-10-09T12:50:45.633Z` |
| `/robots.txt` | `Allow: /`, `Disallow: /admin/`, `Disallow: /api/` |
| `http://fomopomo.com/` | 308 → `https://fomopomo.com/` |
| `https://fomopomo.com/contact/` | 308 → `/contact` |
| `https://www.fomopomo.com/` | 이 실행환경에서 502. DNS/TLS/서비스 장애 또는 수집환경 문제인지 미확인 |

## 라우트별 정책

공개 접근 가능성과 검색에 노출할 가치는 별개다. 아래 `noindex`는 로그인 차단을 새로 구현하는 것이 아니라, 현재 제품 용도에 따른 검색 제외 정책 제안이다.

| 경로 | 실제 용도·접근 특성 | 제안 robots | canonical | sitemap |
| --- | --- | --- | --- | --- |
| `/` | 비로그인 타이머도 제공; 로그인 시 기록 기능 | index, follow | `https://fomopomo.com` | 포함 |
| `/contact` | 공개 문의 안내 | index, follow | `https://fomopomo.com/contact` | 포함 |
| `/support` | 공개 후원 안내 | index, follow | `https://fomopomo.com/support` | 포함 |
| `/privacy` | 공개 개인정보처리방침 | index, follow | `https://fomopomo.com/privacy` | 포함 |
| `/terms` | 공개 이용약관 | index, follow | `https://fomopomo.com/terms` | 포함 |
| `/plan` | 개인 계획; 비로그인도 UI shell 접근 가능 | noindex, follow | 없음 | 제외 |
| `/friends` | 개인 친구 관리; 비로그인 shell/로그인 UI | noindex, follow | 없음 | 제외 |
| `/groups` | 내 그룹 목록·생성·참여; 비로그인 로그인 안내 | noindex, follow | 없음 | 제외 |
| `/groups/[id]` | 그룹 상세; 클라이언트 인증 후 조회, 미로그인 시 홈 이동 | noindex, follow | 없음 | 제외 |
| `/profile` | 자신의 기록·통계; 공개 사용자 프로필 디렉터리가 아님 | noindex, follow | 없음 | 제외 |
| `/admin`, `/admin/changelog`, `/admin/users/[id]` | 관리자 화면; 클라이언트 권한 확인 | noindex, follow | 없음 | 제외 |
| `/test-error` | 오류 테스트 화면 | noindex, follow | 없음 | 제외 |
| `/api/account-delete`, `/api/account-reset`, `/api/status` | API Route Handlers, HTML 페이지 아님 | layout metadata 적용 안 됨 | 없음 | 제외 |

`/login`이나 `/auth/callback` 페이지는 현재 없다. 로그인은 모달 및 OAuth를 사용한다. 향후 공개 그룹 소개나 공개 프로필을 만들면 개인 작업 화면과 별도로 공개 본문/접근 정책을 갖추고 명시적으로 색인을 허용한다.

## 파일별 수정

| 파일 | 변경 |
| --- | --- |
| `lib/seo.ts` (신규) | 프로덕션 origin, 공개 경로·제목·설명, canonical 생성 및 공개 metadata helper를 한 곳에서 관리 |
| `app/layout.tsx` | 기본 `noindex, follow`, 공통 origin 사용. 모든 페이지에 홈 canonical을 상속시키지 않음. 루트의 고정 `og:url` 제거 |
| `app/page.tsx` | Server Component wrapper로 전환. 홈 metadata 및 실제 표시되는 소개 h1/p 제공 |
| `app/home-client.tsx` (이동) | 기존 타이머·인증 로직 유지. 서버 소개 슬롯을 로딩 중/완료 후 모두 표시 |
| `app/contact/page.tsx`, `app/support/page.tsx`, `app/privacy/page.tsx`, `app/terms/page.tsx` | 각 페이지의 Server Component wrapper에서 해당 경로의 metadata export |
| 각 공개 경로의 `*-client.tsx` (이동) | 기존 UI와 상호작용 유지. 문의·후원은 인증 로딩 때문에 공개 본문 전체를 숨기지 않음 |
| `app/sitemap.ts` | 공개 allowlist 5개 canonical만 반환. 근거 없는 lastModified 및 불필요한 priority/changeFrequency 제거 |
| `app/robots.ts` | `/admin/` 차단 제거. noindex 대상 HTML을 크롤링할 수 있게 하고 공통 origin의 sitemap 사용. 기존 `/api/` 차단 유지 |
| `scripts/verify-seo.mjs` (신규) | 빌드 후 실제 HTTP HTML의 metadata, 공개 본문, sitemap, robots, 슬래시 리다이렉트 검증 |
| `docs/search-indexing-runbook.md` | 근거, 정책, 검증·배포 절차와 미확인 사항 기록 |

설계상 주의사항:

- `metadataBase`는 URL 필드의 기준 주소일 뿐 canonical을 자동 생성하지 않는다. 공개 페이지 각각에서 `alternates.canonical`을 지정한다. 루트에 `canonical: '/'`를 넣어 서로 다른 공개 페이지까지 홈의 중복으로 선언하지 않는다.
- metadata는 서버 `page.tsx`/`layout.tsx`에서 export해야 한다. 기존 Client Component를 분리하되 URL 경로는 유지한다.
- 루트 layout의 `title.template`은 같은 경로 단계의 홈 page에 적용되지 않는다. 공개 helper는 브랜드명이 포함된 `title.absolute`를 지정해 홈과 하위 공개 페이지의 제목을 일관되게 유지한다.
- Next.js metadata는 중첩 객체를 얕게 병합한다. 공개 helper는 `robots`, `openGraph`, `twitter`에 필요한 값을 완전하게 제공한다. root의 noindex는 공개 페이지의 `index:true`로 대체된다.
- 공개 페이지의 추적 쿼리는 콘텐츠 경로의 canonical을 사용한다. 쿼리를 일괄 제거하는 HTTP 리다이렉트는 추가하지 않아 OAuth 파라미터와 기존 기능을 유지한다.
- 개인 페이지는 검색 제외가 목적이므로 홈을 canonical로 지정하지 않는다. 일반적인 중복 URL 통합에는 canonical/영구 리다이렉트를 사용하고, 검색 제외 정책에는 noindex를 사용한다.
- robots.txt는 크롤링 제어이며 색인 제거 또는 접근 권한 통제가 아니다. HTML의 noindex를 읽게 하려면 해당 HTML을 Disallow로 막지 않는다. 인증·권한 검증은 기존 코드/데이터 계층의 별도 책임이다.
- `/api/` Disallow는 기존 크롤링 정책 유지일 뿐, API URL의 색인 제거를 보장하지 않는다. 실제 API URL이 색인되었다면 인증/상태 코드를 확인하고, 필요 시 크롤링 가능한 응답의 `X-Robots-Tag: noindex`를 별도 검토한다. 이번 HTML 경고의 영향 API URL은 확인되지 않았다.
- 새 HTML 페이지는 기본 noindex다. 공개 페이지를 추가할 때 `PUBLIC_PAGES`에 등록하고 해당 Server page에서 helper를 호출해야 한다. 경로 등록만으로 metadata가 자동 적용되지는 않는다.
- 홈·문의·후원의 공개 본문을 초기 HTML에 제공하지만 타이머와 로그인 상태 확인은 클라이언트에서 계속 처리한다. Google이 페이지를 색인할지는 콘텐츠와 기타 신호에도 달려 있다.

## 배포 전 검증

2026-10-16 PR 검토에서 실행한 검증 (WSL Ubuntu, Node 24.19.0):

- 전체 `npm run lint`, `git diff --check` 통과.
- `npm run test:run`: 54개 테스트 파일, 750개 테스트 통과.
- `npm run build`: Turbopack 프로덕션 빌드와 TypeScript 검사 통과. 초기 작성 환경의 `ENOENT: uv_resident_set_memory` 오류는 이 환경에서 재현되지 않았다.
- 빌드된 앱을 `npm start -- --port 3103`으로 실행하고 `node scripts/verify-seo.mjs http://localhost:3103` 통과. 일반 UA/Googlebot, 공개 페이지와 추적 쿼리, 내부 경로, sitemap, robots, 슬래시 리다이렉트를 확인했다.
- 비로그인 브라우저에서 홈 타이머 시작·일시정지·초기화, 문의 이메일 복사 및 로그인 모달, 후원 안내 링크, 이용약관·개인정보처리방침 표시를 확인했다. 확인한 화면에서 브라우저 오류 로그는 없었다.
- 실제 계정의 OAuth 로그인·로그아웃과 로그인 완료 후 Navbar 상태 갱신은 수동 검증이 남아 있다. 위 비로그인 확인이나 자동 테스트가 실제 계정 검증을 대신하지는 않는다.
- 운영 배포 및 Search Console의 Google 선택 canonical은 아래 배포 후 절차로 별도 확인한다.

Node 24, 프로젝트 lockfile을 사용한다. 정상 환경의 공개 Supabase 환경 변수를 준비한 뒤:

```bash
npm ci
npm run build
npm start
```

다른 터미널에서:

```bash
node scripts/verify-seo.mjs http://localhost:3000
```

이 스크립트는 일반 UA와 Googlebot UA로 공개 5개 경로/추적 쿼리 변형 및 내부 9개 경로를 조회한다. 공개 페이지에는 head 안 브랜드명이 포함된 정확한 title과 canonical이 각각 하나, index 허용, 올바른 og:url, 초기 HTML의 고유 h1이 있어야 한다. 내부 페이지에는 noindex가 있고 잘못 상속된 홈 canonical이 없어야 한다. sitemap은 공개 5개만, robots는 HTML 허용/API만 차단, `/contact/`는 영구 리다이렉트여야 한다. Googlebot UA를 사용하는 것은 HTTP 응답 차이를 점검할 뿐 실제 Google 크롤링을 재현하거나 증명하지 않는다.

브라우저에서는 비로그인 타이머, 로그인/로그아웃, 문의 이메일 복사, 후원 링크, 계획·친구·그룹·프로필 화면을 빠르게 확인한다. 특히 공개 본문을 위해 auth loading을 제거한 문의·후원 페이지의 Navbar 상태가 로그인 완료 후 정상 갱신되는지 확인한다. preview 호스트에는 호스팅 접근 보호나 noindex 헤더가 적용되는지 확인한다. 프로덕션 canonical만으로 preview 색인을 막을 수는 없다.

## 배포 후 검증과 Search Console

1. 배포 SHA가 이 수정 커밋인지 확인하고, CDN의 `/robots.txt`, `/sitemap.xml`, HTML에 이전 응답이 남지 않는지 확인한다. 운영 환경에서 다음을 실행한다.

   ```bash
   node scripts/verify-seo.mjs https://fomopomo.com
   ```

2. HTTP/HTTPS, www/non-www, trailing slash를 점검한다. 현재 관찰된 http와 슬래시 308은 유지한다. www를 지원한다면 DNS/TLS가 정상이어야 하며, 같은 경로·쿼리를 보존하는 301/308로 `https://fomopomo.com`에 수렴해야 한다. TLS가 실패하면 앱 코드의 redirect까지 도달하지 못할 수 있다. 실제 호스팅 설정을 확인하지 않고 next.config에 추측성 리다이렉트를 추가하지 않는다.

   ```bash
   curl -I http://fomopomo.com/
   curl -I https://www.fomopomo.com/contact
   curl -I https://fomopomo.com/contact/
   ```

3. Search Console의 `https://fomopomo.com/` 속성에서 전체 페이지 및 해당 사이트맵 필터 각각의 중복 사유를 열고 예시 URL을 내보낸다. URL·쿼리·호스트·마지막 크롤링 시각, 사용자 선언 canonical, Google 선택 canonical을 기록한다. 필터별 목록을 합쳐 중복 제거한다. 이메일 두 통을 별개 장애 두 건으로 집계하지 않는다.
4. 영향 URL마다 URL 검사를 실행한다. 공개 경로이면 사용자 선언 canonical이 의도한 공개 URL인지, Google 선택 canonical이 같은지 확인한다. 내부 경로이면 noindex가 보이는지 확인한다. Google 선택 URL도 검사해 실제 본문 유사성, 리다이렉트, 응답 코드를 비교한다.
5. `실제 URL 테스트`와 테스트된 HTML로 새 canonical/noindex 및 공개 본문이 전달되는지 확인한다. 라이브 테스트는 색인 여부나 Google 선택 canonical을 확정하지 못한다. 해당 값은 크롤링 후 갱신된 색인 버전의 URL 검사 결과로 다시 확인한다.
6. `/sitemap.xml`을 다시 제출하고 성공적으로 읽혔는지 확인한다. 색인이 필요한 공개 canonical에만 색인 생성 요청을 한다. 개인/관리자 URL은 noindex에 의한 정상 제외가 목표이며 색인을 요청하지 않는다.
7. 실제 영향 URL에 대한 수정 여부를 확인한 뒤, 해당 이슈에 `수정 결과 확인`이 제공되면 실행한다. 사이트맵 필터 상태에서 시작하면 검증 범위가 그 필터에 제한될 수 있으므로 전체 보고서도 별도로 확인한다. 재크롤링과 보고서 반영에는 시간이 걸리며 즉시 해결을 보장하지 않는다.

성공 기준은 모든 URL의 색인이 아니다. 공개 canonical에 충돌하는 신호가 없고 Google의 선택을 확인하며, 개인/관리자 URL은 의도한 noindex 제외이고 sitemap에서 빠져 있어야 한다. 일부 URL이 `적절한 표준 태그가 포함된 대체 페이지` 또는 `noindex 태그에 의해 제외됨`으로 바뀌는 것은 정책에 맞으면 정상이다. 실제 영향 URL이 다른 공개 페이지나 host 변형이면 해당 사례에 맞는 추가 수정이 필요하다.

## 근거

- [기준 소스](https://github.com/hwankr/fomopomo/tree/e0e855973f45ba20250b3c6f8caf9e9c09a79387)
- 사용자가 제공한 2026-10-12 Search Console 알림 두 건(원문 확인; 이메일 개인 링크는 저장소 문서에 싣지 않음)
- [Google canonical 가이드](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google noindex 가이드](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- [Google sitemap 가이드](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Search Console 페이지 색인 보고서](https://support.google.com/webmasters/answer/7440203)
- [URL 검사 도구](https://support.google.com/webmasters/answer/9012289)
- [Next.js metadata API](https://nextjs.org/docs/app/api-reference/functions/generate-metadata), 설치된 16.3.8의 `node_modules/next/dist/docs/`도 함께 확인
