import type { Metadata } from 'next';

export const SITE_URL = 'https://fomopomo.com';

// 검색에 공개할 페이지를 명시적으로 관리합니다. 새 페이지는 기본 noindex입니다.
export const PUBLIC_PAGES = {
  '/': {
    title: '뽀모도로 타이머',
    description: '뽀모도로와 스톱워치로 집중 시간을 측정하고 학습을 기록하세요. Fomopomo와 함께 꾸준한 공부 습관을 만들어 보세요.',
  },
  '/support': {
    title: '후원하기',
    description: 'Fomopomo의 운영과 개발을 응원하는 후원 방법을 안내합니다.',
  },
  '/privacy': {
    title: '개인정보처리방침',
    description: 'Fomopomo가 수집하는 개인정보의 항목, 이용 목적, 보유 기간과 문의처를 안내합니다.',
  },
  '/terms': {
    title: '이용약관',
    description: 'Fomopomo 서비스의 이용 조건과 절차, 이용자와 서비스의 권리 및 의무를 확인하세요.',
  },
  '/contact': {
    title: '문의하기',
    description: 'Fomopomo 이용 중 궁금한 점이나 의견을 전달할 수 있는 연락처를 안내합니다.',
  },
} as const;

export type PublicPagePath = keyof typeof PUBLIC_PAGES;

export const PUBLIC_PAGE_PATHS: readonly PublicPagePath[] = Object.keys(PUBLIC_PAGES) as PublicPagePath[];

export function getCanonicalUrl(path: PublicPagePath): string {
  return path === '/' ? SITE_URL : `${SITE_URL}${path}`;
}

export function getPublicPageMetadata(path: PublicPagePath): Metadata {
  const page = PUBLIC_PAGES[path];
  const title = `${page.title} | fomopomo`;
  const url = getCanonicalUrl(path);
  const image = `${SITE_URL}/og-image.png`;

  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    // 중첩 metadata는 병합되지 않고 교체되므로 공유 필드도 함께 지정합니다.
    openGraph: {
      type: 'website',
      locale: 'ko_KR',
      siteName: 'fomopomo',
      url,
      title,
      description: page.description,
      images: [{ url: image, width: 1200, height: 630, alt: 'fomopomo - 뽀모도로 타이머' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: page.description,
      images: [image],
    },
  };
}
