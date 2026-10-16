import type { MetadataRoute } from 'next';
import { getCanonicalUrl, PUBLIC_PAGE_PATHS } from '@/lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  // 실제 콘텐츠 수정일을 관리하기 전에는 lastModified를 생성하지 않습니다.
  return PUBLIC_PAGE_PATHS.map((path) => ({ url: getCanonicalUrl(path) }));
}
