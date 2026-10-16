import { getPublicPageMetadata } from '@/lib/seo';
import HomeClient from './home-client';

export const metadata = getPublicPageMetadata('/');

export default function HomePage() {
  return (
    <HomeClient
      introduction={
        <section className="w-full max-w-lg px-4 pt-6 text-center text-gray-900 dark:text-gray-100">
          <h1 className="text-xl font-bold sm:text-2xl">
            집중 시간을 기록하는 뽀모도로 타이머
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            뽀모도로와 스톱워치로 집중 시간을 측정하고 학습을 기록하세요.
            Fomopomo와 함께 꾸준한 공부 습관을 만들어 보세요.
          </p>
        </section>
      }
    />
  );
}
