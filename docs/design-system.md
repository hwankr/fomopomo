# 디자인 시스템

리디자인 화면은 이 문서와 디자인 보드(`.design-ref/*.dc.html`, 이미지는 `.design-ref/png/`)만 보고 구현한다. 토큰·유틸리티·공통 컴포넌트는 여기 적힌 이름을 쓰고, hex 값을 직접 쓰거나 같은 역할의 프리미티브를 새로 만들지 않는다.

- 라이트 테마만 지원한다. 다크·봄 테마와 테마 전환은 없고 `:root`는 `color-scheme: light`다. `dark:` 변형은 정의하지 않으며 코드에 `dark:` 클래스가 없다. 새로 쓰지 않는다(쓰면 Tailwind 기본값대로 OS 다크 모드를 따라가 라이트 화면이 깨진다).
- 중단점은 `md`(768px) 하나다. `md` 미만은 모바일 보드(`XMobile.dc.html`), 이상은 데스크톱 보드(`X.dc.html`)를 따른다.
- 보드의 샘플 데이터(이름·숫자·알림)는 가짜다. 실제 데이터를 그린다.

## 1. 토큰

`app/globals.css`의 `@theme static`에 정의한다. 모든 토큰은 유틸리티(`bg-*`, `text-*`, `border-*`, `fill-*`, `stroke-*` …)와 CSS 변수(`var(--color-*)`) 두 가지로 쓸 수 있다. 인라인 스타일이나 라이브러리 옵션처럼 클래스를 못 쓰는 곳에서만 변수를 쓴다.

### 색

| 토큰 | 유틸리티 예 | 값 | 쓰임 |
| --- | --- | --- | --- |
| `ink` | `text-ink`, `bg-ink` | #1F1B1D | 본문 글자, 선택된 알약 탭 채움 |
| `ink-muted` | `text-ink-muted` | #6B6469 | 보조 글자, 비선택 탭·메뉴, 부제 |
| `ink-subtle` | `text-ink-subtle` | #766E72 | 작은 회색 글자(작업 행의 과목, 힌트) |
| `ink-faint` | `text-ink-faint` | #9A9397 | 모바일 비활성 탭 라벨, 타임라인 시각, placeholder |
| `surface` | `bg-surface` | #F4F2F3 | 쉬는 타이머 무대, 입력칸, 보조 버튼 |
| `line` | `bg-line` | #E9E4E6 | 시트 손잡이 |
| `line-soft` | `border-line-soft` | #F0ECEE | 흰 페이지의 하단 탭 바 위 선 |
| `line-faint` | `border-line-faint` | #EEEAEC | 계획 타임라인의 시간 눈금선 |
| `track` | `bg-track` | #E9E5E7 | 진행 막대 바탕 |
| `bead` | `bg-bead` | #E3DDE0 | 빈 구슬 |
| `bead-past` | `bg-bead-past` | #C9C2C5 | 지난 날의 구슬(7일 기록) |
| `bar` | `bg-bar` | #D9D3D6 | 중립 막대(미분류, 내가 아닌 멤버), 꺼진 토글 |
| `control` | `border-control` | #D4CED1 | 체크 원 테두리(1.5px) |
| `idle` | `bg-idle` | #B5ADB1 | 쉬는 상태 점 |
| `away` | `bg-away` | #E08A00 | 친구 일시정지 상태 점 |
| `hover` | `hover:bg-hover` | rgb(31 27 29 / .06) | 아이콘 버튼·행·고스트 버튼 호버 |
| `scrim` | `bg-scrim` | rgb(31 27 29 / .32) | 대화상자·시트 뒤 덮개 |

모드 색은 세 벌이다. 이름에 `focus`/`break`는 Tailwind 변형과 겹치므로 쓰지 않는다.

| 모드 | 기본(버튼·구슬·점) | `-deep`(실행 중 숫자, 위험 확인) | `-tint`(실행 중 무대, 배지) | 기타 |
| --- | --- | --- | --- | --- |
| 집중(뽀모도로) | `pomo` #D6355A | `pomo-deep` #B01E45 | `pomo-tint` #FBE4EA | `pomo-soft` #F0B3C2 계획한 구슬 |
| 휴식(짧은·긴) | `rest` #12824F | `rest-deep` #0E6B42 | `rest-tint` #DDF1E5 | |
| 스톱워치 | `watch` #4F5BE0 | `watch-deep` #343FB8 | `watch-tint` #E5E7FA | |

구슬 농도(프로필 1년 기록): `heat-0` #F0ECEE(기록 없음) · `heat-1` #F7C2CE(<1시간) · `heat-2` #EE8FA6(<3) · `heat-3` #E25A7B(<5) · `heat-4` #D6355A(5시간 이상).

### 모서리·그림자·글꼴

| 토큰 | 유틸리티 | 값 | 쓰임 |
| --- | --- | --- | --- |
| `chip` | `rounded-chip` | 10px | 작은 버튼(36–40px), 날짜 셀 |
| `control` | `rounded-control` | 12px | 입력칸, 44px 버튼, 메뉴 항목, 목록 행 |
| `tile` | `rounded-tile` | 14px | 48px 버튼(대화상자), 큰 행 |
| `cta` | `rounded-cta` | 18px | 56px 시작 버튼, 알림 팝오버, 종료 안내 띠 |
| `panel` | `rounded-panel` | 20px | 큰 팝오버(작업 선택) |
| `dialog` | `rounded-dialog` | 28px | 대화상자, 모바일 시트(`rounded-t-dialog`) |
| `sheet` | `rounded-t-sheet` | 36px | 타이머의 최근 활동 시트 윗모서리 |
| 알약·아바타 | `rounded-full` | | 탭, 아이콘 버튼, 아바타, 구슬 |
| `popover` | `shadow-popover` | 0 16px 48px / .16 | 팝오버 |
| `dialog` | `shadow-dialog` | 0 24px 64px / .18 | 데스크톱 대화상자 |
| `sheet` | `shadow-sheet` | 0 -10px 30px / .05 | 타이머 시트 |
| `pill` | `shadow-pill` | 0 1px 3px / .10 | 무대가 색으로 꽉 찰 때의 선택 탭 |
| `knob` | `shadow-knob` | 0 1px 3px / .20 | 토글 손잡이 |
| `sans` | `font-sans`(기본) | Pretendard → Noto Sans KR → Apple SD Gothic Neo → Malgun Gothic | 모든 글자 |
| `display` | `font-display` | Funnel Display | 타이머 숫자, 프로필의 큰 누적 숫자만(700) |

글꼴은 `app/layout.tsx`에서 `next/font/google`로 불러온다(Noto Sans KR 가변 400–800, Funnel Display 가변 500–700). Pretendard는 사용자 기기에 있을 때만 쓰인다.

움직임 토큰(`--duration-*`, `--ease-*`, `animate-*`)은 §8에 있다.

## 2. 기본 스타일

- `body`: 흰 바탕, `text-ink`, 15px / 1.5, `tabular-nums`, antialiased. 숫자에 따로 `tabular-nums`를 줄 필요는 없다.
- 포커스: 모든 링크·버튼·입력은 `:focus-visible`에서 `outline: 2px solid var(--focus-ring, currentColor); outline-offset: 3px`. 링은 컨트롤 바깥(흰 바탕)에 그려지므로 **흰 글자 채움 컨트롤은 링을 먹색으로 바꾼다**: `ui-button-primary`와 선택된 `ui-segmented` 버튼은 기본으로, 그 밖의 채움 컨트롤(선택한 날짜, `bg-pomo text-white` 아이콘 버튼, `bg-ink` 칩 등)에는 `ui-focus-ink`를 붙인다. 링 색이 옅은 글자색(`ink-faint`)일 때도 `ui-focus-ink`를 쓴다. `focus-visible:ring-*`이나 `outline-none`으로 덮지 않는다.
- 버튼은 기본 `cursor: pointer`.
- `prefers-reduced-motion`이면 애니메이션·전환을 끄고 지금 구슬은 박동 대신 옅은 테두리로 표시된다.
- `--tabbar-height`: 모바일 탭 바 높이(56px + 아래 안전 영역, 최소 10px). 탭 바 위에 떠야 하는 고정 요소(예: 타이머 시트의 펼친 높이)는 `bottom-(--tabbar-height)`처럼 이 값을 쓴다.
- 스크롤 잠금: 선택 상자(`AppSelect`, Radix Select)가 열려 있는 동안 페이지 스크롤이 잠겨(`body[data-scroll-locked]`) 페이지 스크롤바가 사라지고, 본문은 그 폭만큼의 body 오른쪽 여백으로 제자리를 지킨다. 화면 너비를 채우는 고정 요소(`fixed inset-0`/`inset-x-0`)는 그 여백을 받지 못해 넓어지므로 `ui-scroll-lock-fixed`를 붙인다. 잠긴 동안만 오른쪽 여백 `var(--removed-body-scroll-bar-size)`(스크롤바가 없거나 겹쳐 그려지면 0)를 받아 크기와 내용 위치가 그대로다. 대화상자 덮개(`ui-dialog-overlay`)와 토스트 영역(`[data-dialog-keep]`의 자식)은 `globals.css`의 같은 규칙(「스크롤 잠금 보정」)에 들어 있어 따로 붙이지 않는다. 잠긴 동안 스크롤바가 있던 띠에는 페이지 바탕이 보인다. 늘 자리를 비워 두는 `scrollbar-gutter: stable`이나 잠금을 풀어 스크롤바를 남기는 방식은 쓰지 않는다.

## 3. `.ui-*` 프리미티브

`app/globals.css`의 `@layer components`. 크기·간격은 유틸리티를 덧붙여 바꾼다(유틸리티가 우선한다).

| 클래스 | 모양 | 덧붙이는 예 |
| --- | --- | --- |
| `ui-input` | 최소 높이 44px, `rounded-control`, `bg-surface`, 테두리 없음, 15px, placeholder `ink-faint` | 설정 화면 입력 `min-h-12 rounded-tile px-4` |
| `ui-button-primary` | 44px, `bg-pomo`, 흰 글자 700, 호버 `brightness(.96)`. 버튼 셋·아이콘 버튼 둘·`ui-segmented` 버튼은 누르는 동안 `scale(.97)`(§8) | 모드 색 바꾸기 `bg-rest`, 시작 버튼 `min-h-14 min-w-[200px] rounded-cta px-9 text-[17px]`, 확인 대화상자 `min-h-12 rounded-tile px-6` |
| `ui-button-secondary` | 44px, `bg-surface`, `ink` 600, 호버 `brightness(.97)` | 취소 `min-h-12 rounded-tile px-5`, 무대 위 칩 `bg-white/75` |
| `ui-button-ghost` | 44px, 배경 없음, `ink` 600, 호버 `bg-hover` | 위험 동작 `text-pomo-deep`, 저장 `text-pomo font-bold` |
| `ui-icon-button` | 40px 원, 배경 없음, 글자색 상속, 호버 `bg-hover` | 아이콘은 18–21px, `strokeWidth={1.8}` |
| `ui-icon-button-surface` | 40px 원, `bg-surface` | 달 넘기기, 모바일 프로필의 설정 링크; 48px은 `size-12` |
| `ui-segmented` | 알약 탭 묶음(간격 2px, 넘치면 가로 스크롤). 안의 `<button>`은 36px·14px 600·`ink-muted`, `aria-pressed="true"` 또는 `aria-selected="true"`이면 `bg-ink` 흰 글자 + 먹색 포커스 링(선택이 `--duration-instant`로 바뀐다). 포커스 링이 잘리지 않게 안쪽 5px 여유를 두고 `-m-[5px]`로 자리를 상쇄하므로 바깥 여백은 감싸는 요소에 준다 | 모바일 `[&>button]:h-8 [&>button]:px-3 [&>button]:text-[13px]` |
| `ui-popover-surface` | 흰 바탕, `rounded-cta`, `shadow-popover`, 안쪽 8px | 작업 선택 `rounded-panel p-3` |
| `ui-popover` | Radix `data-state` 등장·퇴장 애니메이션: 트리거 쪽(`--radix-popper-transform-origin`)을 기준으로 `scale(.96)`+투명에서 나타나고(`--duration-enter`) `scale(.97)`+투명으로 사라진다(`--duration-exit`, Radix가 끝날 때까지 남겨 둔다). 닫히는 순간부터는 클릭(`pointer-events: none`)·포커스(`inert`, `ShellProvider`가 설치한 `guardClosingPopovers`)를 받지 않고, 안에 있던 포커스는 바로 트리거로 한 번만 간다(§8 닫히는 팝오버의 포커스). 선택 목록(`role="listbox"`, `AppSelect`)은 퇴장 없이 바로 닫힌다 | 팝오버 내용에 `ui-popover ui-popover-surface` 함께. 트리거로 돌아가면 안 되는 내용은 `data-close-autofocus="off"` |
| `ui-dialog-overlay` | 고정 덮개 `bg-scrim`, z-50, 모바일은 아래 정렬, `md`부터 가운데. `data-state`에 따라 바탕색만 나타나고 사라진다(닫히는 동안 클릭을 받지 않는다) | 직접 쓰지 않는다. `ModalDialog`가 붙인다(`overlayClassName`). 등장 클래스를 덧붙이지 않는다 |
| `ui-dialog` | 모바일: 전체 너비 시트(`rounded-t-dialog`, 20px, 아래 28px+안전 영역). `md`: 최대 440px, `rounded-dialog`, 28px, `shadow-dialog`. 모바일은 아래 가장자리에서 올라오는 시트, `md`는 살짝 커지며 나타나는 패널(§8) | 직접 쓰지 않는다. `ModalDialog`의 `className`으로 너비 `md:max-w-[400px]`, 간격 `gap-3` 등. `animate-*`·`ui-panel-enter`를 덧붙이지 않는다(두 번 움직인다) |
| `ui-dialog-title` | 19px(모바일) / 20px 700 | |
| `ui-sheet-grabber` | 36×4 손잡이(`bg-line`) | 모바일 시트 맨 위에 `md:hidden` |
| `ui-h1` | 22px(모바일) / 28px 800, 자간 -0.02em | |
| `ui-h2` | 18px / 20px 800 | |
| `ui-bead` | 구슬 한 알(아래 `Beads`가 쓴다) | |
| `ui-focus-ink` | 포커스 링을 먹색으로(흰 글자 채움 컨트롤용) | |
| `ui-press` | 누르는 동안 `scale(.97)`(직접 만든 버튼용. `ui-button-*`·`ui-icon-button*`·`ui-segmented` 버튼은 이미 들어 있다) | |
| `ui-scrollbar-horizontal` | 가로 스크롤 막대(`surface` 길, `bar` 손잡이) | |
| `ui-scrollbar-none` | 스크롤 막대 숨김(모바일 가로 탭 줄) | |
| `animate-*`, `ui-panel-enter`, `ui-stagger`, `ui-collapse` | 등장·퇴장·팝·순차 등장·접기(§8) | |

대화상자 버튼 줄: 데스크톱 `flex justify-end gap-2`, 모바일 `flex gap-2` + 각 버튼 `min-h-[50px] flex-1`(`ConfirmModal` 참고). 확인 버튼 색은 세 가지다. `ConfirmModal`에서는 `confirmTone`으로 고른다.

| `confirmTone` | 색 | 처음 포커스 | 쓰는 곳 |
| --- | --- | --- | --- |
| `danger` | `bg-pomo-deep` | 취소 | 되돌릴 수 없는 동작: 계정 초기화·탈퇴, 기록·할 일·계획 삭제, 친구 삭제, 그룹 삭제·멤버 내보내기·그룹장 넘기기 |
| `pomo` | `bg-pomo` | 확인 | 모드 동작: 그룹 나가기. 로그아웃 확인(`LogoutDialog`)도 같은 로즈(`ui-button-primary`)다 |
| `ink`(기본) | `bg-ink` | 확인 | 일반 확인: 설정 초기화 |

## 4. 공통 컴포넌트

### 앱 셸

`app/layout.tsx`가 `ShellProvider` → 페이지 → `Footer` → `MobileTabBar` 순서로 감싼다. 헤더는 각 페이지가 `Navbar`로 그린다.

- **`Navbar`** (`components/Navbar.tsx`) `{ session, onOpenLogin?, mobileTopBar? }`
  - `md` 이상: 높이 72px, 3칸 격자(`1fr auto 1fr`), 좌우 40px. 왼쪽 워드마크(로즈 800 20px, `/`로 이동), 가운데 타이머·계획·친구·그룹(44px, 선택은 `ink` 700 + 아래 5px 로즈 점 + `aria-current="page"`, 나머지 `ink-muted` 500), 오른쪽 알림 종 + 36px 아바타(`/profile`, `aria-label="내 프로필"`). 로그아웃 상태면 종·아바타 대신 `로그인` 보조 버튼이 `onOpenLogin`을 부른다.
  - 고정하지 않고 투명하다. 타이머 무대 색이 그대로 비친다. 페이지 루트에 안쪽 여백을 주면 헤더까지 밀리므로 여백은 본문 래퍼에 준다.
  - 선택 메뉴는 경로로 정한다: `/` 타이머, `/plan*` 계획, `/friends*` 친구, `/groups`·`/groups/[id]` 그룹, `/profile`·`/settings`·그 밖은 없음. `/profile`에서는 아바타가 `tone="solid"`(로즈 바탕 흰 글자) + `aria-current="page"`.
  - 타이머가 실행 중일 때 아바타 바탕은 상위 요소에서 `--header-avatar-bg`(예: `[--header-avatar-bg:rgb(255_255_255/.75)]`)로 바꾼다.
  - 데스크톱 헤더(와 `MobileTopBar`)에는 `data-shell-header`가 있어 화면을 옮길 때 그 아래 본문만 떠오르고 머리는 그대로다(§8 화면 전환). 메뉴 호버 색은 기본 전환(`--duration-instant`)을 쓴다. 메뉴를 옮기면 새 로즈 점이 직전 점 자리에서 미끄러져 오고(`--duration-emphasized`), 두 메뉴 글자색이 서로 바뀐다. 선택이 없던 화면(프로필·설정)에서 오면 점이 나타난다. 처음 불러올 때는 움직이지 않는다.
  - `mobileTopBar`: 생략하면 기본 상단 바(워드마크 + 알림 종, 로그아웃이면 `로그인`), `<MobileTopBar …/>`를 주면 그것을, `null`이면 아무것도 그리지 않는다.
- **`MobileTopBar`** (`components/layout/MobileTopBar.tsx`) `{ start?, center?, end?, sticky?, className? }` — `md` 미만에서만 보인다. `data-shell-header`가 있어 화면을 옮길 때 그대로 있다(§8 화면 전환). 높이 44px + 위 안전 영역, 투명. `center`가 없으면 양끝 정렬(왼쪽 20px, 오른쪽 16px), 있으면 3칸 격자(좌우 12px). `sticky`는 흰 바탕으로 위에 붙인다(저장 버튼이 있는 설정 화면). 함께 내보내는 `Wordmark`, `TopBarTitle { title, subtitle?, titleClassName? }`(22px 800 h1 + 13px 회색 부제).

  | 화면 | 구성 |
  | --- | --- |
  | 타이머 | `start={<Wordmark />}` · `end`에 `NotificationBell variant="topbar"` + 타이머 설정 `ui-icon-button`(SlidersHorizontal 18px) |
  | 계획 | `start`에 `ui-icon-button-surface` ‹ + 달 제목(h1 18px 800, 최소 128px 가운데) + › · `end`에 `오늘`(`ui-button-secondary min-h-9 rounded-[11px] px-3.5 text-sm`) · `className="px-4"` |
  | 친구 | `start={<TopBarTitle title="친구" subtitle="…" />}` · `end={<NotificationBell variant="topbar" />}` |
  | 그룹 | 친구와 같고 `end`에 그룹 만들기(`ui-icon-button ui-focus-ink bg-pomo text-white`, + 18px)를 종 앞에 둔다(`gap-2`로 감싼다) |
  | 프로필 | `start={<TopBarTitle title="프로필" titleClassName="text-xl" />}` · `end`에 `/settings`로 가는 `ui-icon-button-surface`(`aria-label="설정"`) |
  | 설정 | `start` 뒤로(`ui-icon-button`, ChevronLeft 22px, `/profile`) · `center` 제목(h1 17px 700) · `end` 저장(`ui-button-ghost min-h-10 text-pomo font-bold`) · `sticky` |
- **`NotificationBell`** `{ variant?: 'header' | 'topbar' }` — 받은 친구 요청이 있으면 로즈 점과 `aria-label="알림 N개"`, 팝오버(`role="region"`, 바깥 너비 데스크톱 336px / 모바일 316px)에 `받은 친구 요청이 N개 있어요.`(`/friends?tab=requests` 링크 — 친구 화면의 받은 요청 탭)를, 없으면 `새 알림이 없어요.`를 보여 준다. 앱에 없는 알림은 만들지 않는다. 종이 그려진 뒤 새 요청이 오면(`friendRequestPulse`가 바뀌면) 점이 한 번 `animate-pop-in`으로 튄다. 처음 불러올 때나 화면을 옮겨 종이 새로 그려질 때는 튀지 않는다.
- **`MobileTabBar`** — 레이아웃이 그리므로 페이지에서 렌더링하지 않는다. `/`, `/plan`, `/friends`, `/groups`(+`/groups/[id]`), `/profile`에서만 보이고 설정·약관·관리자 화면에는 없다. 흰 바탕 고정, 5탭(Timer·Calendar·Users·LayoutGrid·User 22px, 선택 굵기 2.2 / 나머지 1.8, 11px 라벨, 선택 `ink` 700 + `aria-current`, 나머지 `ink-faint` 500). 흰 페이지에서는 위에 `line-soft` 선, 타이머에서는 선 없음. 친구 탭에 받은 친구 요청 점. 바로 앞에 같은 높이의 빈 칸을 두어 푸터와 본문이 가려지지 않는다.
- **`ShellProvider` / `useShell()`** → `{ session, friendRequestCount, friendRequestPulse }`. 받은 친구 요청 구독(`useFriendRequestCount`/`useFriendRequestState`)은 여기서 한 번만 연다. `friendRequestPulse`는 첫 조회(`loaded`)가 끝난 뒤 같은 계정에서 요청 수가 늘 때마다 1씩 는다(처음 불러온 수·계정 전환·줄어듦은 세지 않는다). 알림 점의 팝에 쓴다(§8). 닫히는 팝오버·메뉴가 클릭·포커스를 받지 않게 하는 `guardClosingPopovers`도 여기서 앱 전체에 한 번 설치한다. 같은 사용자로 훅을 또 부르면 같은 Realtime 채널을 두 번 구독하려다 오류가 나므로, 화면에서는 `useShell().friendRequestCount`를 쓴다.
- **`Footer`** — 흰 바탕, 최대 960px. 워드마크 + ©, 회색 14px 링크(타이머·계획·친구·그룹·문의하기·후원하기·이용약관·개인정보처리방침), 문의 이메일 복사 버튼.

### 구슬 `components/ui/Beads.tsx`

- `<Beads label done? current? planned? total? states? tone? size? gap? direction? wrap? className? />` — `role="img"` + `aria-label={label}` 하나로 읽히고 구슬 하나하나는 숨긴다. 상태는 `states`로 직접 주거나 개수로 준다(끝낸 → 지금 → 계획 → 빈 구슬 순, `total`이 칸 수를 정한다).
- `<Bead state tone size />` 한 알(범례 점 등). `buildBeadStates()`는 개수 → 상태 배열.
- 상태 색: `done` 모드 색 · `current` 모드 색 + 박동 · `empty` `bead` · `planned` `pomo-soft` · `past` `bead-past`. `tone`은 `pomo`(기본)·`rest`·`watch`.
- 색 바꾸기: 상위 요소에 `--bead-on`(끝낸·지금), `--bead-off`(빈), `--bead-planned`, `--bead-past`를 준다. 모드 기본색은 별도 변수 `--bead-tone`(`data-bead-tone`이 정한다)에 있으므로 상위의 `--bead-*`가 `pomo`·`rest`·`watch` 모두에서 이긴다. `--bead-tone`은 직접 바꾸지 않는다. 예) 실행 중 틴트 무대의 빈 구슬은 흰색 `[--bead-off:var(--color-white)]`, 완료된 계획 블록 안은 `[--bead-on:var(--color-white)] [--bead-planned:rgb(255_255_255/.5)]`.

### 아바타 `components/ui/Avatar.tsx`

`<Avatar name size={36 | 64} tone={'tint' | 'solid'} />` — 이름 첫 글자(라틴 문자는 대문자), 36px은 14px 700, 64px은 26px 800. 장식이므로 숨겨지고, 이름은 옆 글자나 링크의 `aria-label`이 전한다. `getDisplayName(user)`는 `user_metadata.nickname` → `full_name` → `name` → 이메일 앞부분 순서, `getInitial(name)`은 첫 글자.

### 대화상자 `components/ui/ModalDialog.tsx`

**모든 모달 대화상자(설정 빠른 창, 그룹 만들기, 로그아웃 확인, 작업 시트, 앱 설치 안내 등)는 `ModalDialog`로 만든다.** `.ui-dialog-overlay`/`.ui-dialog` div를 직접 그리거나 포커스 처리를 따로 만들지 않는다.

```tsx
<ModalDialog
  open={isOpen}
  onClose={handleCancel}            // Escape = 취소
  role="alertdialog"                // 확인 대화상자. 기본은 "dialog"
  aria-labelledby={titleId}
  aria-describedby={descId}         // 선택
  initialFocusRef={cancelRef}       // 선택. 없으면 첫 번째 Tab 대상, 그것도 없으면 패널
  overlayClassName="z-70"           // 선택. 다른 대화상자 위에 뜰 때
  closeOnOverlayClick               // 선택. 덮개를 누르면 onClose(기본은 닫지 않음)
  className="md:max-w-[400px]"      // 선택. 패널(.ui-dialog)에 덧붙임
>
  <span aria-hidden="true" className="ui-sheet-grabber md:hidden" />
  <h2 id={titleId} className="ui-dialog-title">…</h2>
  …
</ModalDialog>
```

- `document.body`로 포털해 띄우고, 패널에 `role`·`aria-modal="true"`를 붙인다. 모바일은 아래 시트, `md`부터 가운데 패널(`.ui-dialog`).
- 움직임은 `ModalDialog`가 맡는다(덮개·패널의 `data-state="open|closed"`, §8): 덮개는 바탕색이 나타나고, 패널은 모바일에서 아래 가장자리부터 끝까지 올라오는 시트(280ms), `md`부터 `scale(.96)`에서 커지는 패널(200ms)이다. 호출하는 쪽은 `className`·`overlayClassName`에 `animate-*`나 `ui-panel-enter`를 붙이지 않는다.
- 열 때: 연 요소를 기억하고 포커스를 안으로 옮긴다. 되돌릴 수 없는 확인은 안전한 취소에, 일반 확인은 확인 버튼에, 입력 대화상자는 첫 실제 컨트롤에 `initialFocusRef`를 준다.
- 열린 동안: Tab/Shift+Tab을 패널 안에서 돈다(문서 캡처 단계에서 처리하므로 안쪽 컨트롤이 전파를 막아도 빠져나가지 않는다. 포털된 팝오버 내용 안의 Tab은 그 팝오버가 다룬다). body의 다른 자식은 `inert`가 된다(포인터·키보드·보조기기 모두 차단). 계속 보여야 하는 영역은 `data-dialog-keep`으로 남긴다(토스트). 패널 안 키 입력은 부모 대화상자나 window 단축키(타이머 Space)로 전달되지 않는다.
- Escape: 맨 위 대화상자 하나만 `onClose`를 부른다. 겹친 층은 안쪽부터 하나씩 닫힌다.
- 덮개: 기본은 눌러도 닫히지 않는다. 앱 설치 안내처럼 언제 닫아도 되는 가벼운 안내만 `closeOnOverlayClick`으로 덮개 클릭에 `onClose`를 부른다(맨 위 대화상자의 덮개를 직접 누를 때만이며, 패널이나 위에 뜬 대화상자에서 올라온 클릭은 무시한다). 입력·확인 대화상자에는 쓰지 않는다.
  - 열린 선택 목록·달력·팝오버가 있으면 첫 Escape는 그 층만 닫고(Radix가 `preventDefault`), 다음 Escape가 대화상자를 닫는다.
  - 안쪽 요소가 Escape를 직접 쓰려면(예: 입력만 닫는 폼) `event.preventDefault()`를 부른다. 그러면 대화상자는 닫히지 않는다.
  - 안쪽 요소가 전파만 막고 `preventDefault`를 하지 않은 Escape도 이벤트 처리가 끝난 뒤 대화상자가 닫는다(그래서 닫힌 선택·날짜 트리거에 포커스가 있어도 Escape로 닫힌다).
  - `ConfirmModal`처럼 다른 대화상자 위에 뜬 것은 자기만 닫힌다.
- 닫을 때(`open=false`): `inert`를 되돌리고 연 요소로 포커스를 돌려준다. 다른 대화상자 위에 띄워도(예: 설정 창 위의 `ConfirmModal`) 아래 대화상자는 그대로다.
  - 퇴장 애니메이션(모바일 200ms, `md` 140ms) 동안 대화상자는 붙어 있지만, 닫히기 시작하는 순간 배경 `inert`와 포커스를 돌려주고 키(Escape·Tab)를 더 다루지 않으며, 자신은 `inert` + `pointer-events: none`에 `aria-modal`이 빠진다(열린 층으로 세지 않는다. 겹친 대화상자는 아래 것이 바로 맨 위가 된다). 애니메이션이 끝나면 내린다. 애니메이션이 없으면(동작 줄이기, 테스트 환경) 같은 커밋에서 바로 내리고, 끝 소식이 없으면 남은 시간 + 100ms(최대 1초) 뒤에 내린다.
  - 닫히는 동안에는 마지막으로 열려 있던 내용을 그대로 보여 준다(부모가 닫으면서 비운 상태로 패널이 바뀌지 않는다). 닫히는 중에 다시 열면 새 대화상자를 처음부터 그린다(이전 입력이 남지 않는다).
  - 한 대화상자가 닫히는 순간 다른 대화상자가 열려도 배경은 `inert`로 남고(대화상자마다 잡은 `inert`를 센다), 새 대화상자를 닫으면 처음 연 요소로 포커스가 돌아간다.
  - **호출하는 쪽은 대화상자를 마운트한 채로 두고 `open`만 바꾼다.** 대화상자 컴포넌트를 조건부로 그리거나(`{open && <X/>}`), 닫을 때 `key`가 바뀌거나, 부모가 내용 대신 `null`을 돌려주면 퇴장 애니메이션 없이 사라진다. 닫히는 동안 보여 줄 대상(예: 리포트의 멤버)은 마지막 값을 남겨 둔다(패널 내용은 `ModalDialog`가 마지막 열린 상태로 고정한다). 앱 설치 안내(`InstallPrompt`)가 이 방식이다.

### 확인·로그인·선택

- `ConfirmModal` `{ isOpen, onClose, onConfirm, title, message, confirmText?, cancelText?, confirmTone?, isDangerous? }` — `ModalDialog` `role="alertdialog"`, z-70. `confirmTone`: `'ink'`(일반 확인, 기본 · `bg-ink`) · `'pomo'`(모드 동작, 예: 그룹 나가기 · `bg-pomo`) · `'danger'`(되돌릴 수 없음, 예: 계정 초기화 · `bg-pomo-deep`). 쓰는 곳은 위 §3의 표. `danger`는 처음 포커스가 취소, 나머지는 확인. 예전 `isDangerous`는 `confirmTone`이 없을 때 `'danger'`와 같다(화면 코드는 모두 `confirmTone`을 쓴다).
- `LogoutDialog` `{ open, onClose, beforeLogout?, onLogoutFailed? }` (`components/LogoutDialog.tsx`) — 프로필 보드의 “로그아웃할까요?” 확인. 프로필과 설정이 함께 쓴다. `alertdialog`, 처음 포커스는 `로그아웃`(`ui-button-primary`). 확인하면 정리 로그아웃(`signOutWithPushCleanup`) 뒤 `/`로 간다. 실패하면 알림을 띄우고 열어 둔다. `beforeLogout`은 그 앞 단계(설정 화면: 저장하지 않은 변경 저장)로, `false`를 돌려주면 로그아웃하지 않는다. `onLogoutFailed`는 로그아웃이 실패했을 때 그 단계에서 바꾼 상태를 되돌린다.
- `LoginModal` `{ isOpen, onClose, onGoogleLogin }` — `ModalDialog`(데스크톱 400px), 처음 포커스는 `Google로 계속하기`, 닫기 `ui-icon-button`.
- `AppSelect` `{ value, onValueChange, options, label?, placeholder?, displayValue?, compact?, disabled?, … }` — 트리거는 `ui-input`과 같은 모양(compact 36px·13px), 목록은 `ui-popover-surface`, 항목 40px·`hover` 강조·선택 600 + 로즈 체크. 화면에서는 기본 `<select>` 대신 이것을 쓴다.
- `DatePicker` `{ value, onChange, label, min?, max?, … }` — 같은 입력 모양, 달력 팝오버. 선택한 날 `bg-ink` 흰 글자, 오늘 로즈 글자.
- `SubjectSelect` — `AppSelect` + `+ 새 과목`(로즈 고스트 버튼) + 새 과목 입력 줄(`ui-input` + `ui-button-primary`). 디자인의 `제목에 맞춰 선택 / 미분류 / 과목 / + 새 과목` 순서는 `onAutoSelect`를 주면 맞춰진다.

## 5. 페이지 레이아웃 (보드 실측)

### 데스크톱(`md` 이상)

헤더 72px 아래에 본문이 온다. 본문은 가운데 정렬하고 좌우 40px(`px-10`).

| 화면 | 본문 최대 너비 | 위·아래 | 섹션 간격 | 비고 |
| --- | --- | --- | --- | --- |
| 타이머 | 시트 안 720px(좌우 32px) | 무대 24 / 56, 시트 위 16 | 무대: 세로 24 | 무대 + 흰 시트(`rounded-t-sheet shadow-sheet`), 탭 줄 위 4px |
| 계획 | 1200px | 16 / 72 | 28 | 달력 `flex-[1_1_560px]` + 날 패널 `flex-[1_1_400px] max-w-[520px]` |
| 친구 | 960px | 머리 8 / 20, 본문 8 / 64 | 머리 18, 본문 16 | |
| 그룹 | 960px | 머리 8 / 20, 본문 12 / 64 | 24 | |
| 프로필 | 1040px | 16 / 80 | 56 | |
| 설정 | 760px | 16 / 80 | 48 | 섹션 안 12 |

### 모바일(`md` 미만)

상단 바(44px + 안전 영역) → 본문 → 탭 바. 본문 좌우 16px(설정 20px), 섹션 간격 36px. 페이지 전체가 스크롤되며 상단 바는 기본적으로 함께 올라간다(`sticky`는 필요한 화면만). 가로로 넘치는 탭 줄은 `overflow-x-auto ui-scrollbar-none`.

### 글자 크기

| 역할 | 데스크톱 | 모바일 |
| --- | --- | --- |
| 화면 제목 H1 (`ui-h1`) | 28px 800 | 22px 800 (프로필 20px) |
| 섹션 제목 H2 (`ui-h2`) | 20px 800 | 18px 800 |
| 큰 제목(계획의 날, 선택한 그룹) | 22–24px 800 | 17–19px 800 |
| 대화상자 제목 (`ui-dialog-title`) | 20px 700 | 19px 700 |
| 목록·본문 | 15px (강조 600) | 15px |
| 보조 | 14px `ink-muted` | 13–14px |
| 메타·과목 | 12–13px `ink-subtle` / `ink-muted` | 12px |
| 탭 라벨 | — | 11px |
| 타이머 숫자 | `font-display` 700, 232px(시:분:초면 150px), `min(…, 19vw)` | 124px(시:분:초면 90px) |

목록 행: 카드 없이 `-mx-3 rounded-tile px-3 hover:bg-hover`, 행 사이 간격 2px, 선 없음. 최소 높이는 아래 **바깥 높이**로 준다: 타이머 작업 선택 56px(모바일 56px), 최근 활동 행 데스크톱 52px / 모바일 60px(버튼, 모바일 보드는 `content-box` 50px + 위아래 5px), 설정 과목 행 60px, 친구 순위 82px, 받은 요청 92px — 화면마다 보드에서 아래 규칙으로 다시 계산한다.

**보드 치수 옮기기(content-box 주의)**: 보드의 `div`·`li`·`a`·`span`·`p`는 인라인 스타일에 `box-sizing: border-box`가 없으면 CSS 기본값 content-box라서 `width`/`min-height`/`height`에 padding이 **더해진다**(예: `min-height: 66px; padding: 8px 12px` → 바깥 82px). Tailwind는 모두 border-box이므로 `min-h-[82px] py-2`처럼 바깥 크기를 쓴다. `button`·`select`는 브라우저 기본이 border-box라 보드 값을 그대로 쓴다(예: 시작 버튼 `height: 56px; min-width: 200px; padding: 0 36px` → 바깥 200×56). 글자 입력칸(`input type=text·email` 등)은 브라우저 기본이 content-box지만, 보드의 입력칸은 인라인 스타일에 `box-sizing: border-box`를 직접 적어 두었으므로 역시 보드 값이 바깥 크기다. 어느 태그든 인라인 스타일에 적힌 `box-sizing`이 태그 기본값보다 먼저다(예: 모바일 최근 활동 행 버튼은 `content-box`라 50px + 위아래 5px → 60px). 같은 개수의 항목으로 PNG와 행 간격을 비교해 확인한다.

## 6. 구슬 규칙

- 뽀모도로 1개(타이머는 1분) = 구슬 1알. 작업 목표, 계획 달력, 7일 기록, 프로필이 모두 같은 구슬을 쓴다.
- 타이머: 분 수만큼 가로 줄, 데스크톱 10px·간격 8px(30알 넘으면 7px·6px, 최대 폭 560px), 모바일 8px·간격 5px(30알 넘으면 6px·4px, 최대 폭 340px). 실행 중일 때만 지금 구슬이 박동한다. 스톱워치는 지난 분 + 지금 1알(최대 60).
- 작업 행·계획 블록: 8px·간격 4px, `done`/`planned`(계획 화면) 또는 `done`/`empty`(타이머 작업 목록). 라벨 `뽀모도로 2 / 4`.
- 계획 달력 칸: 6px·간격 3px, 끝낸 것 먼저, 남은 계획은 `planned`, 최대 6알.
- 7일 기록: 날마다 세로 기둥(`direction="column-reverse"`), 10px·간격 4px, 오늘 `done`, 지난 날 `past`, 0개인 날은 `empty` 1알, 최대 8알.
- 프로필 1년 기록: 14px 원 격자, `heat-0…4` 농도(구슬 대신 버튼 칸이므로 `Beads`를 쓰지 않는다).
- 구슬 줄에는 항상 숫자 요약 라벨을 단다.

## 7. 해야 할 것 / 하지 말 것

- 할 것: 흰 페이지는 여백과 글자 크기로만 나눈다. 탭은 알약(`ui-segmented`), 아이콘 버튼은 배경 없이(`ui-icon-button`), 주요 동작 하나만 모드 색으로 채운다. 문구는 짧은 해요체(예: “아직 기록이 없어요. 첫 뽀모도로를 시작하면 여기에 쌓여요.”).
- 할 것: 색·모서리·그림자는 토큰 유틸리티로, 굵기·크기는 이 문서의 글자 표대로 쓴다. 동작 줄이기 설정을 지킨다.
- 할 것: 토스트(모양은 `app/layout.tsx`의 `Toaster`)의 성공·실패는 `toast.success`/`toast.error` 기본 아이콘을 쓴다. 그 밖의 아이콘은 이모지 대신 lucide 선 아이콘 18px(`strokeWidth={2}`, `aria-hidden`, `shrink-0`)에 토큰 색을 준다(경고 `text-pomo-deep`, 휴식·완료 `text-rest`, 집중 `text-pomo`, 스톱워치 `text-watch`, 안내 `text-ink-muted`). 토스트 문구에도 이모지를 넣지 않는다.
- 하지 말 것: 카드(테두리·그림자 상자), 구분선, 그라데이션, 이모지 장식, `bg-slate-*`/`text-gray-*` 같은 기본 팔레트, hex 직접 입력, `dark:` 클래스.
- 하지 말 것: 페이지마다 헤더·탭 바·알림 구독·대화상자 포커스 처리를 새로 만들기. `Navbar`·`MobileTopBar`·`useShell`·`ModalDialog`를 쓴다.
- 팝오버·선택 컨트롤의 키 경계는 `components/ui/keyBoundary.ts`를 쓴다. **트리거는 자기가 쓰는 키만 막고 Escape·Tab은 올려 보낸다**: 버튼형 트리거 `onKeyDown={stopActivationKeys}`(Enter·Space), 선택 트리거 `stopSelectTriggerKeys`(Enter·Space·위아래 화살표·글자 검색). **열린 팝오버 내용**은 `onKeyDown={stopAllKeys}`(열려 있는 동안은 팝오버가 키보드를 가진다). 그래야 Space가 타이머 전역 단축키로 새지 않으면서 대화상자·폼의 Escape와 Tab이 동작한다(`NotificationBell`, `AppSelect`, `DatePicker` 참고).
- 하지 말 것: 트리거에서 모든 키의 전파를 막기(`onKeyDown={(e) => e.stopPropagation()}`). 대화상자·폼이 Escape와 Tab을 받지 못한다.

## 8. 움직임

동작마다 가볍고 빠른 반응을 준다. 화면 코드는 아래 토큰·클래스·도구만 쓰고, 시간·가속을 직접 적지 않는다(`duration-300`, `ease-out`, 인라인 `transition` 등 금지). 새 의존성(framer-motion 등)은 쓰지 않는다.

### 원칙

| 할 것 | 하지 말 것 |
| --- | --- |
| 누름·호버 100–150ms, 나타남 160–240ms, 사라짐은 나타남보다 짧게 | 300ms를 넘는 움직임(아래 시트 280ms만 예외) |
| 거리는 작게: 이동 8px 이하, 크기 `.96` 이상. 완료 팝만 최고 `1.08` | 튕김·흔들림·새 반복 애니메이션(지금 구슬 박동만 있다) |
| 아래 가장자리에 붙은 시트(md 미만 `ModalDialog` 패널 등)만 자기 높이만큼 끝까지 올라오고 내려간다(유일한 예외) | 다른 요소를 화면 밖에서 끌어오기 |
| `transform`·`opacity`, 색·바탕색 바뀜만 움직인다. 접기·펼치기는 `ui-collapse` | `width`/`height`/`top`/`left`/`margin` 움직이기, 주변 레이아웃을 미는 움직임 |
| 상태는 바로 바꾸고 움직임은 꾸밈으로만. 사라지는 요소는 닫히는 순간부터 클릭·포커스를 받지 않고, 안에 있던 포커스는 바로 트리거로 간다(`ModalDialog`, `ui-popover`, `ui-collapse` 예제) | 애니메이션이 끝날 때까지 입력을 막기·기다리기, 사라지는 요소에 Tab·클릭이 닿게 두기 |
| 사용자가 한 동작과 정말 새로 생긴 항목만 움직인다 | 타이머 틱, 실시간·주기 갱신, 평범한 다시 그리기, 처음 불러오기·하이드레이션에서 움직이기 |
| 동작 줄이기(`prefers-reduced-motion: reduce`)면 움직임도 지연도 없다 | JS가 `animationend`만 기다리기(테스트 환경·동작 줄이기에서는 오지 않는다) |

### 토큰 (`app/globals.css` `@theme`)

| 토큰 | 값 | 쓰임 |
| --- | --- | --- |
| `--duration-instant` | 150ms | 누름, 호버·선택·체크 색 바뀜. `transition-*` 유틸리티의 기본 시간(`--default-transition-duration`)이기도 하다 |
| `--duration-enter` | 200ms | 나타남: 팝오버·메뉴, `md` 대화상자, 목록 항목·섹션, 화면 전환 |
| `--duration-exit` | 140ms | 사라짐 |
| `--duration-emphasized` | 240ms | 큰 이동·강조: 메뉴 점 이동, 펼치기, 완료 팝 |
| `--duration-sheet-enter` / `--duration-sheet-exit` | 280ms / 200ms | 아래 가장자리 시트 |
| `--ease-enter` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | 나타남·상태 바뀜(감속). `transition-*` 유틸리티의 기본 가속이기도 하다. 유틸리티 `ease-enter` |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | 사라짐(가속). `ease-exit` |
| `--ease-pop` | `cubic-bezier(0.3, 0, 0.2, 1)` | 팝 키프레임 구간. `ease-pop` |
| `--ease-sheet` | `cubic-bezier(0.32, 0.72, 0, 1)` | 아래 시트가 올라올 때. `ease-sheet` |
| `--press-scale` | `0.97` | 누르는 동안의 크기 |
| `--stagger-step` | 24ms | 순차 등장 간격 |

CSS 전환에 시간을 따로 줄 때는 `duration-(--duration-enter) ease-enter`처럼 토큰을 쓴다. JS에서는 `components/ui/motion.ts`의 `motionDuration('enter')`, `motionEasing('enter')`.

### 클래스

| 클래스 | 움직임 | 언제 |
| --- | --- | --- |
| (기본) `ui-button-*`, `ui-icon-button`, `ui-icon-button-surface`, `ui-segmented > button` | 누르는 동안 `scale(.97)`(`--duration-instant`), 비활성이면 없음. 호버·선택 색은 `--duration-instant`로 바뀐다 | 따로 붙일 것 없음. 이 버튼에 `transition-[…]`을 덮어쓸 때는 목록에 `scale`을 넣는다(빼면 누름이 바로 바뀐다) |
| `ui-press` | 같은 누름 | 위 클래스가 아닌 직접 만든 버튼·링크 |
| `hover:bg-hover` | 바탕색이 `--duration-instant`로 바뀐다(따로 준 `transition-*`이 있으면 그것) | 목록 행 호버. 따로 붙일 것 없음 |
| `animate-fade-in` | 투명 → 보임, 200ms | 자리를 옮기지 않고 나타나는 것(빈 상태 문구, 덮개) |
| `animate-fade-up` (`ui-panel-enter`도 같다) | 투명 + 6px 아래 → 제자리, 200ms | 펼친 섹션·패널, 새로 추가한 목록 항목, 인라인 폼 |
| `animate-scale-in` | 투명 + `scale(.96)` → 제자리, 200ms | 직접 만든 팝오버·메뉴·작은 패널(Radix 내용은 `ui-popover`) |
| `animate-sheet-in` / `animate-sheet-out` | 자기 높이만큼 아래 → 제자리(280ms, `ease-sheet`) / 반대로(200ms) | 아래 가장자리에 붙은 시트(md 미만) |
| `animate-fade-out`, `animate-scale-out` | 사라짐(140ms, 끝 상태 유지) | `usePresence`로 남겨 둔 요소의 `data-state="closed"` |
| `animate-pop` | `1 → 1.08 → 1`, 240ms | 이미 있는 것의 완료·변화 강조: 구슬이 채워짐, 배지 숫자 바뀜 |
| `animate-pop-in` | 투명 + `.96` → `1.08` → `1`, 240ms | 새로 나타나는 작은 표시: 체크 표시, 새 알림 점 |
| `ui-popover` | Radix 팝오버·메뉴 등장·퇴장(트리거 쪽 기준 `scale`). 닫히는 동안 `pointer-events: none` + `inert`(`guardClosingPopovers`), 포커스는 닫히는 순간 한 번만 움직인다(아래 닫히는 팝오버의 포커스). 선택 목록(`role="listbox"`)은 등장만 있고 바로 닫혀 Radix의 페이지 클릭·스크롤 잠금이 곧바로 풀린다 | Radix `Content`에 `ui-popover ui-popover-surface`. 보통은 따로 할 일 없음. 포커스로 열리는 트리거나 직접 만든 `onCloseAutoFocus`가 있으면 아래 규칙 |
| `ui-stagger` | 자식의 등장을 `--stagger-step`씩 늦춘다. 앞 8개만(0–168ms), 그 뒤는 8번째와 함께 | 짧은 목록을 한꺼번에 열 때(작업 선택 팝오버, 펼친 목록). 목록에 `ui-stagger`, 항목에 `animate-fade-up`. 순서를 직접 주려면 항목에 `style={{ '--stagger-index': i }}` |
| `ui-collapse` + `data-state="open"` | `grid-template-rows: 0fr ↔ 1fr`(펼침 240ms, 접힘 140ms). 접히기 시작하면 바로 클릭을 받지 않고(`pointer-events: none`), 다 접힌 뒤 숨는다 | 접기·펼치기. 안쪽 요소 하나로 감싼다(그 요소는 `overflow: hidden`이므로 가장자리 포커스 링이 필요하면 안쪽에 여백을 둔다). 감싼 요소에 `inert={!open}`, 닫을 때 안에 있던 포커스는 `releaseFocus(panel, trigger)`로 트리거에(아래 예) |

`animate-*`는 Tailwind 유틸리티라 실제로 쓴 것만 CSS에 생긴다(`@theme`의 `--animate-*`가 정의). 등장 키프레임은 시작 상태만 적어 끝나면 원래 스타일로 돌아가므로, 같은 요소의 다른 상태 클래스(투명도 등)를 가리지 않는다.

```tsx
// 짧은 목록을 열 때 순차 등장
<ul className="ui-stagger">
  {tasks.map((task) => <li key={task.id} className="animate-fade-up">…</li>)}
</ul>

// 접기·펼치기: 닫히는 순간부터 안쪽은 포커스·클릭을 받지 않는다(inert + CSS). 안에 있던 포커스는 트리거로.
const toggle = () => {
  if (open && panelRef.current) releaseFocus(panelRef.current, triggerRef.current); // components/ui/popoverExit
  setOpen(!open);
};
<button ref={triggerRef} aria-expanded={open} aria-controls={id} onClick={toggle}>세부 할 일</button>
<div ref={panelRef} id={id} className="ui-collapse" data-state={open ? 'open' : 'closed'} inert={!open || undefined}>
  <div>…</div>
</div>
```

### 닫히는 팝오버의 포커스

`ShellProvider`가 설치한 `guardClosingPopovers`(`components/ui/popoverExit.ts`)가 `.ui-popover` 내용이 닫히는 순간(`data-state="closed"`) 처리한다. 한 번 닫을 때 포커스는 한 번만 움직인다.

- 안에 포커스가 있었으면 바로 트리거로 옮긴다. 트리거는 열려 있을 때 `aria-controls`로 내용의 `id`를 가리킨 요소다(Radix `Trigger`는 저절로 단다). 바깥(트리거가 아닌 곳)을 눌러 닫았으면 누른 곳에 둔다. 포커스가 안에 없었으면(트리거에서 Escape, 트리거를 다시 눌러 닫기) 건드리지 않는다.
- 그 뒤 Radix가 내용을 내리면서 다시 옮기는 포커스(`onCloseAutoFocus`의 기본 동작, 내린 뒤 `setTimeout 0`)는 취소한다. 그래서 퇴장하는 동안이나 닫은 직후 사용자가 옮긴 포커스(Tab, 다른 입력)는 그대로다.
- 선택 목록(`AppSelect`)도 같다. 목록은 닫히는 순간 내려가므로 함께 사라진 포커스를 트리거로 한 번 돌려주고 Radix의 복귀는 취소한다. 바깥을 눌러 닫았을 때만 Radix에 맡긴다(기본 select처럼 트리거로 간다).
- 닫히는 중에 다시 열면 `inert`와 취소를 지운다.
- **복귀 끄기**: 트리거로 돌아가면 안 되는 내용에는 `Content`에 `data-close-autofocus="off"`(`CLOSE_AUTOFOCUS_ATTRIBUTE`)를 단다. 가드는 안에 있던 포커스를 놓기만 한다. 포커스를 받으면 열리는 트리거(`onFocus`로 여는 타임라인 기록 카드)가 그렇다. 트리거로 돌려주면 다시 열린다. 가드가 없을 때(단위 테스트)를 위해 `onCloseAutoFocus={(event) => event.preventDefault()}`도 함께 둔다.
- **직접 만든 `onCloseAutoFocus`**: Radix는 가드가 취소한 뒤에도 이 처리기를 부른다(내용을 내린 뒤, 퇴장이 끝난 뒤). 처음에 `if (event.defaultPrevented) return;`으로 빠진다. 가드가 이미 포커스를 정했다는 뜻이다. 그렇지 않으면 그새 옮긴 포커스를 빼앗는다. 부모가 내용을 열린 채로 바로 내리면(가드가 닫힘을 못 본다) `defaultPrevented`가 아니므로 처리기는 전처럼 돈다.
- `Trigger` 없이 `Anchor`(`virtualRef`)로 여는 팝오버는 가드가 트리거를 모른다. 여는 버튼에 열려 있는 동안 `aria-controls={contentId}`를, `Content`에 같은 `id`를 줘서 가드가 그 버튼으로 돌려주게 한다. 닫는 순간 다른 곳으로 보내야 하면 `data-close-autofocus="off"`를 달고 닫는 처리(`onOpenChange(false)`)에서 직접 옮긴다.

```tsx
// 작업 선택처럼 Anchor로 여는 팝오버를 남겨 두고 open으로 닫을 때
<button ref={anchorRef} aria-expanded={open} aria-controls={open ? pickerId : undefined}>…</button>
<Popover.Content id={pickerId} className="ui-popover ui-popover-surface"
  onCloseAutoFocus={(event) => {
    if (event.defaultPrevented) return; // 가드가 이미 버튼(또는 누른 곳)으로 옮겼다
    event.preventDefault();
    if (!interactedOutsideRef.current) anchorRef.current?.focus();
  }}>…</Popover.Content>
```

### 새 항목 vs 새로 고친 목록

- **사용자가 추가한 항목**: 만든 항목의 id를 상태로 기억해(예: `lastAddedId`) 그 항목에만 `animate-fade-up`(완료 표시는 `animate-pop-in`)을 붙인다. CSS 애니메이션은 요소가 붙을 때 한 번만 돌므로, 같은 `key`로 다시 그려져도 반복되지 않는다. 다음 동작에서 id를 비운다.
- **새로 고친 목록**(실시간 구독, 주기 갱신, 다시 불러오기, 처음 불러오기): 등장 클래스를 붙이지 않는다. 안정된 `key`(서버 id)를 써서 DOM을 유지하면 아무것도 움직이지 않는다. 배열 인덱스를 `key`로 쓰거나 목록을 통째로 다시 마운트하면 붙어 있는 등장 클래스가 다시 돈다.
- **사용자가 연 목록**(팝오버를 열 때, 섹션을 펼칠 때): 목록 전체에 `ui-stagger` + 항목 `animate-fade-up`을 써도 된다. 열 때 한 번만 돈다.
- 실시간으로 들어온 알림처럼 사용자가 알아야 하는 새 소식은 내용 대신 표시(점·배지)를 `animate-pop-in`으로 한 번 강조한다(`NotificationBell`의 `friendRequestPulse`처럼, 처음 불러온 값은 세지 않는다).

### 사라짐과 `usePresence`

`components/ui/usePresence.ts`는 닫힌 요소를 퇴장 애니메이션이 끝날 때까지 남겨 둔다(`ModalDialog`가 쓴다).

```tsx
const { ref, mounted, closing } = usePresence<HTMLDivElement>(open);
if (!mounted) return null;
return (
  <div ref={ref} data-state={closing ? 'closed' : 'open'} inert={closing || undefined}
    className="data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-up">…</div>
);
```

- `ref` 요소와 그 안에서 도는 유한한 애니메이션이 끝나면 내린다. 없으면(동작 줄이기, 테스트, 퇴장을 정하지 않음) 같은 커밋에서 바로, 끝 소식이 없으면 최대 1초 뒤.
- 닫히는 동안에는 `inert`(+ 필요하면 `pointer-events-none`)를 붙여 클릭·포커스를 받지 않게 한다. 닫히는 중에 다시 열면 `key`가 바뀐다. 내용을 `key`로 새로 그리면 이전 상태가 남지 않는다.
- 반환값은 구조 분해해서 쓴다(`presence.ref`를 렌더 중에 다른 값과 함께 읽으면 React Compiler 린트가 ref 접근으로 본다).

### JS 움직임 (`components/ui/motion.ts`)

- `playMotion(element, keyframes, { duration?, easing?, composite? })`: 토큰으로 Web Animation을 한 번 재생한다. 동작 줄이기거나 지원하지 않으면 아무것도 하지 않는다. 끝 상태를 남기지 않는다(`fill` 없음). 시작 상태만 적는다(`[{ opacity: 0, offset: 0 }]`).
- `prefersReducedMotion()`, `motionDuration(name)`, `motionEasing(name)`, `readCssToken('--color-ink')`.
- `getRunningAnimations(elements, { subtree })` + `whenAnimationsFinish(animations, onDone)`: 애니메이션을 기다릴 때는 이 둘을 쓴다(없으면 바로, 멈추면 시간 제한).
- CSS 애니메이션은 동작 줄이기에서 `globals.css`가 시간·지연을 0으로 만들지만, Web Animation은 그 규칙을 받지 않으므로 반드시 `playMotion`을 거친다.
- `components/ui/popoverExit.ts`: `releaseFocus(container, target?)`(안에 있는 포커스를 target으로, 없으면 놓기 — 직접 만든 사라지는 요소에 쓴다), `guardClosingPopovers()`(`ShellProvider`가 앱 전체에 한 번 설치한다. 화면에서 다시 부르지 않는다. 돌려준 정리 함수는 관찰·리스너와 함께 닫히는 내용에 붙인 `inert`·취소 처리기도 되돌리므로 StrictMode·HMR로 다시 설치해도 하나만 동작한다), `CLOSE_AUTOFOCUS_ATTRIBUTE`(위 복귀 끄기).

### 화면 전환

- `app/template.tsx` → `components/layout/RouteEnter.tsx`. 경로 첫 단계가 바뀌어 Next가 템플릿을 새로 붙일 때만, 머리(`data-shell-header`: 데스크톱 헤더와 모바일 상단 바)를 뺀 본문 덩어리들이 투명 + 6px 아래에서 한 번 떠오른다(200ms, Web Animation, `transform`은 기존 값에 더한다). 화면이 처음엔 불러오는 중 표시(`role="status"`·`aria-busy`)만 그리면 재생하지 않고 기다렸다가 머리가 붙는 순간(1.5초 안, 그리기 전) 재생한다. 이미 움직인 요소와 그 안은 다시 움직이지 않고, 먼저 움직인 덩어리가 나중에 머리를 품게 되면(불러오는 중 상자가 화면 틀로 다시 쓰일 때) 그 움직임을 그리기 전에 멈춘다. 머리는 어떤 폭에서도 움직이지 않는다.
- 레이아웃(`ShellProvider`, 토스트, 탭 바, 푸터, 알림 구독)은 템플릿 바깥이라 다시 그려지지 않는다. 화면 컴포넌트는 원래도 화면을 옮기면 새로 그려지므로 템플릿이 더 지우는 상태는 없다. 래퍼는 `display: contents`라 레이아웃에 끼지 않고, 스크롤 처리(Next의 스크롤 처리기는 템플릿 안쪽)를 바꾸지 않는다. 다만 뒤로 가기의 스크롤 복원은 원래부터 불완전하다: 계획 화면을 y=500에서 떠났다가 돌아오면 템플릿이 없는 기준판(HEAD)과 지금 모두 y=355로 돌아온다(돌아오는 순간 화면이 로그인 확인 중 표시라 짧기 때문으로 보인다). 움직임과는 별개의 기존 문제다.
- 같은 화면 안의 상태·검색어(`?tab=`)·`history.replaceState`(그룹 선택), 타이머 틱, 실시간 갱신에는 돌지 않는다. `/groups` ↔ `/groups/[id]`처럼 첫 단계가 같은 이동도 돌지 않는다.
- 처음 불러올 때(서버 렌더·하이드레이션)는 움직이지 않는다. 스타일이 아니라 JS 애니메이션이므로 JS가 늦거나 동작 줄이기면 내용은 처음부터 그대로 보인다.
- 메뉴 점(`Navbar`)은 §4대로 따로 움직인다. 모바일 탭 바는 움직이지 않는다.

### 동작 줄이기

- `globals.css`가 모든 CSS 애니메이션·전환 시간을 0.01ms로, 지연을 0으로 만든다. 누름 크기 변화도 없다. 지금 구슬은 박동 대신 옅은 테두리.
- `playMotion`은 아무것도 재생하지 않는다(화면 전환·메뉴 점). `usePresence`·`ModalDialog`는 기다리지 않고 바로 내린다.
- 토스트(`react-hot-toast`)는 라이브러리 애니메이션을 그대로 쓴다. 동작 줄이기면 라이브러리가 스스로 페이드만 쓴다.

### 확인

- 브라우저에서 동작 직후 `document.getAnimations()`로 무엇이 도는지 보고, `pause()` + `currentTime`으로 중간 프레임을 멈춰 본다(`.design-ref/BRIEF.md` §8).
- 테스트(happy-dom)는 애니메이션을 돌리지 않는다. 퇴장을 기다리는 동작은 `Element.prototype.getAnimations`를 흉내 내 시험한다(`components/ui/__tests__/ModalDialogExit.test.tsx`).
