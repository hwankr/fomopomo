👉 **라이브 서비스**: [https://fomopomo.com/](https://fomopomo.com/)

## Development Environment

This project is configured for WSL/Linux-first development.

- Run `npm install`, `npm run dev`, `npm run build`, and test commands inside WSL.
- Do not develop this project with native Windows `node`/`npm`.
- Recommended clone location inside WSL: `~/projects/fomopomo`
- Avoid `/mnt/c/...` for day-to-day development. It is slower and can cause file watching and native module issues.
- If you want to open the project from Windows Explorer, use `\\wsl.localhost\Ubuntu\home\<your-user>\projects\fomopomo`

### Recommended Setup

```bash
mkdir -p ~/projects
cd ~/projects
git clone <repo-url> fomopomo
cd fomopomo
npm install
npm run dev
```

---

## ✨ 주요 기능 (Key Features)

- **⏱️ 스마트 타이머**: 뽀모도로(집중), 짧은 휴식, 긴 휴식 모드 자동 전환 및 커스텀 타이머 지원.
- **📝 태스크 관리**: 집중 시간 종료 시 수행한 태스크를 기록하고 관리.
- **📊 상세 리포트**: 주/월/년 단위의 집중 시간 통계 및 태스크별 분포 차트 제공.
- **☁️ 클라우드 동기화**: 구글 로그인으로 기기 간 설정 및 기록 동기화 (비로그인 시 로컬 저장 지원).
- **📱 PWA 지원**: 모바일 홈 화면에 추가하여 앱처럼 사용 가능.
- **🌙 다크 모드**: 눈이 편안한 다크 모드 및 로컬 상태 복원 기능.

---

## 🛠️ 기술 스택 (Tech Stack)

| Category | Technology |
|----------|------------|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS 4, Lucide React |
| **State/UI** | React Hot Toast, Recharts |
| **Backend** | Supabase (Auth, PostgreSQL) |
| **Deployment** | Vercel |

---

## 🤝 기여하기 (Contributing)

버그 제보나 기능 제안은 [Issues](https://github.com/hwankr/pomofomo/issues)를 이용해 주세요. Pull Request도 환영합니다!

---

© 2025 Pomofomo. All rights reserved.
