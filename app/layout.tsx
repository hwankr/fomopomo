import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Footer from '../components/Footer';
import { Toaster } from 'react-hot-toast';
import FriendNotificationListener from '@/components/FriendNotificationListener';
import InstallPrompt from '@/components/InstallPrompt';
import { ThemeProvider } from '@/components/ThemeProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'fomopomo',
  description: 'fomopomo - Focus on your work, not on missing out',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.png', // 기본 파비콘
    apple: [
      { url: '/icon.png', sizes: '180x180', type: 'image/png' }, // 애플용 고화질 아이콘 지정
    ],
  },
  appleWebApp: {
    capable: true, // 웹앱으로 동작 가능하게 설정
    title: 'fomopomo', // 홈 화면에 추가될 때의 이름
    statusBarStyle: 'black-translucent', // 상단 상태바 스타일 (선택사항: default, black, black-translucent)
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
          <Toaster position="top-center" />
          <FriendNotificationListener />
          <main className="flex-grow">{children}</main>
          <InstallPrompt />
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
