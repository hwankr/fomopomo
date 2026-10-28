'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service if needed
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="flex flex-col gap-2">
        <h2 className="ui-h1">
          문제가 발생했습니다
        </h2>
        <p className="text-ink-muted">
          죄송합니다. 요청하신 작업을 처리하는 도중 오류가 발생했습니다.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          onClick={
            // Attempt to recover by trying to re-render the segment
            () => reset()
          }
          className="ui-button-primary min-h-12 rounded-tile px-6"
        >
          다시 시도하기
        </button>
        <Link
          href="/"
          className="ui-button-secondary min-h-12 rounded-tile px-5"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
