'use client';

import Link from 'next/link';
import { Coffee } from 'lucide-react';

interface DonationSectionProps {
  variant?: 'card' | 'inline' | 'minimal';
  showDescription?: boolean;
}

const BMC_LINK = 'https://buymeacoffee.com/hwankr';
// Buy Me a Coffee 브랜드 버튼(외부 서비스 색이라 토큰 대신 브랜드 값을 쓴다)
const BMC_BUTTON = 'bg-[#FFDD00] text-black hover:bg-[#FFCC00] active:bg-[#EEBB00]';

export default function DonationSection({
  variant = 'card',
  showDescription = true,
}: DonationSectionProps) {
  // 후원 페이지용
  if (variant === 'card') {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-col items-center p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-surface">
          <Coffee aria-hidden="true" className="size-7 text-ink" />
        </div>

        <h3 className="m-0 mt-5 text-lg font-bold">커피 한 잔 사주기</h3>

        {showDescription && (
          <p className="m-0 mt-2 text-sm text-ink-muted">
            후원금은 서버 운영과 기능 개선에 쓰입니다.
          </p>
        )}

        <a
          href={BMC_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className={`ui-press mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-tile px-6 font-semibold transition-colors ${BMC_BUTTON}`}
        >
          <Coffee aria-hidden="true" className="size-5" />
          Buy Me a Coffee
        </a>
      </div>
    );
  }

  // 인라인형
  if (variant === 'inline') {
    return (
      <a
        href={BMC_LINK}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex min-h-10 items-center gap-2 rounded-control px-4 text-sm font-semibold transition-colors ${BMC_BUTTON}`}
      >
        <Coffee aria-hidden="true" className="size-4" />
        Buy Me a Coffee
      </a>
    );
  }

  // 설정 화면용: 후원 페이지로 가는 보조 버튼
  return (
    <div className="flex flex-col items-start gap-2">
      {showDescription && (
        <p className="m-0 text-[13px] text-ink-muted md:text-sm">
          서비스가 마음에 드셨다면, 커피 한 잔으로 응원해주세요.
        </p>
      )}

      <Link
        href="/support"
        className="ui-button-secondary ui-press min-h-[46px] rounded-tile px-[18px] md:min-h-12"
      >
        후원하기
      </Link>
    </div>
  );
}
