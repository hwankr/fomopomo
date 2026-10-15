import { getPublicPageMetadata } from '@/lib/seo';
import SupportClient from './support-client';

export const metadata = getPublicPageMetadata('/support');

export default function SupportPage() {
  return <SupportClient />;
}
