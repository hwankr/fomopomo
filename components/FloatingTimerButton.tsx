'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Timer } from 'lucide-react';

export default function FloatingTimerButton() {
    const pathname = usePathname();

    // Don't show on the timer page (home)
    if (pathname === '/') {
        return null;
    }

    return (
        <Link
            href="/"
            className="fixed bottom-6 right-6 z-50 md:hidden flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200"
            aria-label="타이머로 이동"
        >
            <Timer className="w-6 h-6" />

            {/* Pulse animation ring */}
            <span className="absolute inset-0 rounded-full bg-rose-400 animate-ping opacity-20"></span>
        </Link>
    );
}
