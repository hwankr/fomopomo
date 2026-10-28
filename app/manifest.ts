import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'fomopomo',
    short_name: 'fomopomo',
    description: '뽀모도로를 안 하면 포모가 온다!',
    start_url: '/',
    display: 'standalone', // 주소창 없는 앱 모드
    background_color: '#ffffff',
    theme_color: '#ffffff', // 라이트 테마의 흰 바탕(app/layout.tsx의 viewport.themeColor와 같다)
    icons: [
      {
        src: '/icon.png',
        sizes: 'any',
        type: 'image/png',
      },
      {
        src: '/favicon.ico',
        sizes: '64x64',
        type: 'image/x-icon',
      },
    ],
  };
}
