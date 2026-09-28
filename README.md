👉 **라이브 서비스**: [https://fomopomo.com/](https://fomopomo.com/)

## Development Environment

This project supports native Windows development and WSL.

- Native Windows is the default supported setup for this repository.
- Run `npm install`, `npm run dev`, `npm run build`, and test commands from PowerShell or Command Prompt.
- Recommended Windows clone location: `C:\dev\fomopomo`
- WSL is also supported. Recommended WSL clone location: `~/projects/fomopomo`
- Avoid `/mnt/c/...` when working inside WSL. It works, but file watching and disk access can be slower.

### Recommended Setup

```powershell
mkdir C:\dev -Force
cd C:\dev
git clone <repo-url> fomopomo
cd .\fomopomo
npm install
npm run dev
```

---

## 주요 기능 (Key Features)

- **뽀모도로 타이머**: 집중, 짧은 휴식, 긴 휴식 모드 전환 및 커스텀 타이머 지원
- **할 일 리스트 관리**: 집중 시간 종료 후 실행한 작업을 기록하고 관리
- **과목 자동 선택**: 새 작업·주간 목표·월간 목표·장기 과제의 제목에 등록된 과목명이 있으면 자동으로 선택
- **상세 리포트**: 주간/월간/연간 집중 시간 통계 및 작업별 분포 차트 제공
- **크로스 디바이스 동기화**: Google 로그인으로 기기 간 설정 및 기록 동기화
- **PWA 지원**: 모바일 홈 화면에 추가하여 앱처럼 사용 가능
- **다크 모드**: 라이트 테마와 다크 테마 전환 및 상태 복원

### 과목 자동 선택

과목에 `블록체인`을 등록해 두면 `블록체인 9/13 복습`, `블록체인 9/15 복습`을 입력할 때 과목이 자동으로 채워집니다. 서로 다른 과목명이 함께 나오거나 일치하는 과목이 없으면 미분류로 둡니다. 직접 과목을 고르거나 미분류를 선택하면 그 작업을 작성하는 동안 선택을 유지합니다. 선택박스의 `제목에 맞춰 선택`을 고르면 제목에 따른 선택을 다시 사용하며, 다음 새 작업도 자동 선택으로 시작합니다. 기존 작업을 수정할 때는 저장된 과목을 유지합니다.

---

## 프로젝트 기술 스택 (Tech Stack)

| Category | Technology |
|----------|------------|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS 4, Lucide React |
| **State/UI** | React Hot Toast, Recharts |
| **Backend** | Supabase (Auth, PostgreSQL) |
| **Deployment** | Vercel |

---

## 기여하기 (Contributing)

버그 제보와 기능 제안은 [Issues](https://github.com/hwankr/pomofomo/issues)를 이용해 주세요. Pull Request도 환영합니다.

---

© 2025 Pomofomo. All rights reserved.
