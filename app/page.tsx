import { getPublicPageMetadata } from '@/lib/seo';
import HomeClient from './home-client';

export const metadata = getPublicPageMetadata('/');

export default function HomePage() {
  return <HomeClient />;
}
