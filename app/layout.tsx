import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Footer from '../components/Footer';
import { Toaster } from 'react-hot-toast';
import FriendNotificationListener from '@/components/FriendNotificationListener';
import InstallPrompt from '@/components/InstallPrompt';
import NotificationManager from '@/components/NotificationManager';
import { ThemeProvider } from '@/components/ThemeProvider';
import FloatingTimerButton from '@/components/FloatingTimerButton';
import SnowEffect from '@/components/SnowEffect'; // ❄️ 겨울 눈 효과 (삭제 시 이 줄 제거)
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import GoogleAnalytics from '../components/GoogleAnalytics';

const inter = Inter({ subsets: ['latin'] });

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
  metadataBase: new URL('https://fomopomo.com'),
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: 'https://fomopomo.com',
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
export const viewport: Viewport = {
  themeColor: '#f43f5e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={`${inter.className} flex flex-col min-h-screen`}>
        <ThemeProvider>
          <SnowEffect /> {/* ❄️ 겨울 눈 효과 (삭제 시 이 줄 제거) */}
          <Toaster position="top-center" />
          <FriendNotificationListener />
          <main className="flex-grow">{children}</main>
          <FloatingTimerButton />
          <InstallPrompt />
          <NotificationManager />
          <Footer />
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
        <GoogleAnalytics />
      </body>
    </html>
  );
}
