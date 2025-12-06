'use client';

import { useState } from 'react';

export default function TestErrorPage() {
  const [shouldError, setShouldError] = useState(false);

  if (shouldError) {
    throw new Error('Test error for verification!');
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-8">
      <h1 className="text-2xl font-bold">에러 페이지 테스트</h1>
      <p>아래 버튼을 클릭하여 강제로 에러를 발생시켜보세요.</p>
      <button
        onClick={() => setShouldError(true)}
        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
      >
        에러 발생시키기
      </button>
    </div>
  );
}
