import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // HTML 페이지는 크롤링을 허용해야 검색엔진이 noindex를 읽을 수 있습니다.
      disallow: ['/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
