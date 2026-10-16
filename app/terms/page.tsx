import { getPublicPageMetadata } from '@/lib/seo';
import TermsClient from './terms-client';

export const metadata = getPublicPageMetadata('/terms');

export default function TermsPage() {
  return <TermsClient />;
}
