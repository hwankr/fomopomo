import { getPublicPageMetadata } from '@/lib/seo';
import PrivacyClient from './privacy-client';

export const metadata = getPublicPageMetadata('/privacy');

export default function PrivacyPage() {
  return <PrivacyClient />;
}
