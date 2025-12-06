import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 text-center">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
          페이지를 찾을 수 없습니다
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          요청하신 페이지가 존재하지 않거나, 주소가 변경되었을 수 있습니다.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 transition-colors"
      >
        홈으로 돌아가기
      </Link>
    </div>
  );
}
