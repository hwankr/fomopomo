import type { Metadata, Viewport } from 'next';
import { Funnel_Display, Noto_Sans_KR } from 'next/font/google';
import './globals.css';
import Footer from '../components/Footer';
import { Toaster } from 'react-hot-toast';
import FriendNotificationListener from '@/components/FriendNotificationListener';
import InstallPrompt from '@/components/InstallPrompt';
import NotificationManager from '@/components/NotificationManager';
import { ShellProvider } from '@/components/layout/ShellProvider';
import MobileTabBar from '@/components/layout/MobileTabBar';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import GoogleAnalytics from '../components/GoogleAnalytics';
import { SITE_URL } from '@/lib/seo';

// 한글 글리프는 unicode-range 조각으로 필요할 때만 받는다. latin 조각만 미리 불러온다.
// 가변 글꼴이라 400–800 굵기를 파일 하나로 쓴다.
const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  variable: '--font-noto-sans-kr',
  display: 'swap',
});

// 타이머 숫자 전용(500–700).
const funnelDisplay = Funnel_Display({
  subsets: ['latin'],
  variable: '--font-funnel-display',
  display: 'swap',
});

const toastStyle = {
  background: 'var(--color-white)',
  color: 'var(--color-ink)',
  borderRadius: 'var(--radius-cta)',
  boxShadow: 'var(--shadow-popover)',
  padding: '10px 14px',
  fontSize: '14px',
  fontWeight: 500,
  lineHeight: 1.5,
};

export const metadata: Metadata = {
  title: {
    default: 'fomopomo | 뽀모도로 타이머',
    template: '%s | fomopomo',
  },
  description: '뽀모도로와 스톱워치로 학습을 기록하세요. Fomopomo',
  keywords: ['뽀모도로', '타이머', '집중', 'pomodoro', 'focus', '공부 타이머', '집중 타이머', '스톱워치', 'stopwatch'],
  authors: [{ name: 'fomopomo' }],
  creator: 'fomopomo',
  verification: {
    google: 'OSDRrmDwqWOqvH1PfSidEU6c2ZX0FA23w7TpZbdHmEg',
    other: {
      'naver-site-verification': '79045230bcdc999bf0f45f89d43fb527bb1ec363',
    },
  },
  metadataBase: new URL(SITE_URL),
  // 공개 페이지의 metadata에서만 index를 허용합니다.
  robots: { index: false, follow: true },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: 'fomopomo',
    title: 'fomopomo - 뽀모도로 타이머',
    description: '뽀모도로와 스톱워치로 학습을 기록하세요. Fomopomo',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'fomopomo - 뽀모도로 타이머' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'fomopomo - 뽀모도로 타이머',
    description: '뽀모도로와 스톱워치로 학습을 기록하세요',
    images: ['/og-image.png'],
  },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.png',
    apple: [
      { url: '/icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    title: 'fomopomo',
    statusBarStyle: 'black-translucent',
  },
};

// 📱 모바일 뷰포트 설정 (상단바 색상 등)
// 라이트 테마만 쓰므로 OS 다크 모드에서도 밝은 브라우저 UI를 요청한다.
export const viewport: Viewport = {
  themeColor: '#ffffff',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // 상단 바·하단 탭 바가 env(safe-area-inset-*)로 노치와 홈 표시줄을 피한다.
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${notoSansKr.variable} ${funnelDisplay.variable}`}>
      <body className="flex min-h-screen flex-col">
        <ShellProvider>
          {/* 모달이 배경을 inert로 만들 때도 토스트는 계속 보이고 읽히게 둔다. */}
          <div data-dialog-keep="">
            <Toaster
              position="top-center"
              toastOptions={{
                style: toastStyle,
                success: { iconTheme: { primary: 'var(--color-rest)', secondary: 'var(--color-white)' } },
                error: { iconTheme: { primary: 'var(--color-pomo)', secondary: 'var(--color-white)' } },
              }}
            />
          </div>
          <FriendNotificationListener />
          <main className="flex-grow">{children}</main>
          <InstallPrompt />
          <NotificationManager />
          <Footer />
          <MobileTabBar />
        </ShellProvider>
        <Analytics />
        <SpeedInsights />
        <GoogleAnalytics />
      </body>
    </html>
  );
}
