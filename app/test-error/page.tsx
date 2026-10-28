'use client';

import { useState } from 'react';

export default function TestErrorPage() {
  const [shouldError, setShouldError] = useState(false);

  if (shouldError) {
    throw new Error('Test error for verification!');
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="ui-h1">에러 페이지 테스트</h1>
        <p className="text-ink-muted">아래 버튼을 클릭하여 강제로 에러를 발생시켜보세요.</p>
      </div>
      <button
        onClick={() => setShouldError(true)}
        className="ui-button-primary min-h-12 rounded-tile bg-pomo-deep px-6"
      >
        에러 발생시키기
      </button>
    </div>
  );
}
