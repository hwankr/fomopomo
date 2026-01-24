'use client';

import Link from 'next/link';
import { toast } from 'react-hot-toast';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-50 dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand Section */}
          <div className="space-y-4">
            <Link href="/" className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-rose-500 to-orange-500">
              Fomopomo
            </Link>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              Fear of missing out your Pomodoro
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Contact: <button 
                onClick={() => {
                  navigator.clipboard.writeText('fomopomokr@gmail.com');
                  toast.success('이메일이 복사되었습니다');
                }}
                className="hover:text-rose-500 dark:hover:text-rose-400 transition-colors cursor-pointer"
              >fomopomokr@gmail.com</button>
            </p>
          </div>

          {/* Product Section */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
              서비스
            </h3>
            <ul className="space-y-3">
              <li>
                <Link href="/" className="text-sm text-gray-600 dark:text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors">
                  타이머
                </Link>
              </li>
              <li>
                <Link href="/plan" className="text-sm text-gray-600 dark:text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors">
                  계획
                </Link>
              </li>
              <li>
                <Link href="/friends" className="text-sm text-gray-600 dark:text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors">
                  친구
                </Link>
              </li>
              <li>
                <Link href="/groups" className="text-sm text-gray-600 dark:text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors">
                  그룹
                </Link>
              </li>
            </ul>
          </div>

          {/* Support Section */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
              고객지원
            </h3>
            <ul className="space-y-3">
              <li>
                <Link href="/contact" className="text-sm text-gray-600 dark:text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors">
                  문의하기
                </Link>
              </li>
              <li>
                <Link href="/support" className="text-sm text-gray-600 dark:text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors">
                  후원하기 ☕
                </Link>
              </li>
            </ul>
          </div>

          {/* Company/Legal Section */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
              정보
            </h3>
            <ul className="space-y-3">
              <li>
                <Link href="/terms" className="text-sm text-gray-600 dark:text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors">
                  이용약관
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-sm text-gray-600 dark:text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors">
                  개인정보처리방침
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-gray-200 dark:border-slate-800 pt-8">
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            &copy; {currentYear} Fomopomo. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
