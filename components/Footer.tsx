'use client';

import Link from 'next/link';
import { toast } from 'react-hot-toast';

const FOOTER_LINKS = [
  { href: '/', label: '타이머' },
  { href: '/plan', label: '계획' },
  { href: '/friends', label: '친구' },
  { href: '/groups', label: '그룹' },
  { href: '/contact', label: '문의하기' },
  { href: '/support', label: '후원하기' },
  { href: '/terms', label: '이용약관' },
  { href: '/privacy', label: '개인정보처리방침' },
];

const CONTACT_EMAIL = 'fabronjeon@naver.com';

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const linkClass = 'text-sm text-ink-muted transition-colors hover:text-pomo';

  return (
    <footer className="bg-white text-ink">
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4 px-5 py-10 md:flex-row md:items-start md:justify-between md:gap-10 md:px-10 md:py-12">
        <div className="flex flex-col gap-1.5">
          <Link href="/" className="w-fit text-lg font-extrabold tracking-[-0.02em] text-pomo">
            Fomopomo
          </Link>
          <p className="m-0 text-[13px] text-ink-subtle">&copy; {currentYear} Fomopomo. All rights reserved.</p>
        </div>

        <nav aria-label="사이트 정보" className="flex flex-col gap-2 md:items-end">
          <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 md:justify-end">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={linkClass}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="m-0 text-sm text-ink-muted">
            문의{' '}
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(CONTACT_EMAIL);
                toast.success('이메일이 복사되었습니다');
              }}
              className={linkClass}
            >
              {CONTACT_EMAIL}
            </button>
          </p>
        </nav>
      </div>
    </footer>
  );
}
