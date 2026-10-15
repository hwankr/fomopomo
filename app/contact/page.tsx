import { getPublicPageMetadata } from '@/lib/seo';
import ContactClient from './contact-client';

export const metadata = getPublicPageMetadata('/contact');

export default function ContactPage() {
  return <ContactClient />;
}
