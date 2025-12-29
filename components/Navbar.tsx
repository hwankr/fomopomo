'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Session } from '@supabase/supabase-js';
import { Menu, X, Sun, Moon, Settings, Flag, LogOut, User as UserIcon, ChevronDown } from 'lucide-react';
import appIcon from '@/app/icon.png';
import { usePathname } from 'next/navigation';
import { useFriendRequestCount } from '@/hooks/useFriendRequestCount';
import { usePendingFeedbackCount } from '@/hooks/usePendingFeedbackCount';
import { useUnreadChangelogCount } from '@/hooks/useUnreadChangelogCount';

interface NavbarProps {
    session: Session | null;
    isDarkMode: boolean;
    toggleDarkMode: () => void;
    onOpenSettings?: () => void;
    onOpenLogin?: () => void;
    onLogout?: () => void;
}

export default function Navbar({
    session,
    isDarkMode,
    toggleDarkMode,
    onOpenSettings,
    onOpenLogin,
    onLogout,
}: NavbarProps) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const pathname = usePathname();
    const friendRequestCount = useFriendRequestCount(session);
    const pendingFeedbackCount = usePendingFeedbackCount(session);
    const { hasUnread: hasUnreadChangelog } = useUnreadChangelogCount();

    // Scroll effect for glassmorphism intensity
    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 10);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const navLinks = [
        { href: '/', label: '타이머', mobileOnly: true },
        { href: '/plan', label: '계획' },
        { href: '/friends', label: '친구' },
        { href: '/groups', label: '그룹' },
        { href: '/leaderboard', label: '리더보드' },
        { href: '/feedback', label: '피드백' },
    ];

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

    return (
        <>
            <nav
                className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b ${scrolled
                    ? 'bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-gray-200/50 dark:border-slate-700/50 shadow-sm'
                    : 'bg-transparent border-transparent'
                    }`}
            >
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        {/* Logo & Desktop Nav */}
                        <div className="flex items-center gap-8">
                            <Link href="/" className="flex-shrink-0 flex items-center gap-2 group">
                                <div className="relative w-8 h-8 overflow-hidden rounded-xl shadow-sm group-hover:shadow-md transition-all duration-300 group-hover:scale-105">
                                    <Image
                                        src={appIcon}
                                        alt="fomopomo"
                                        fill
                                        className="object-cover"
                                    />
                                </div>
                                <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-rose-500 to-orange-500 block">
                                    Fomopomo
                                </span>
                            </Link>

                            {/* Desktop Navigation Links */}
                            <div className="hidden md:flex space-x-1">
                                {navLinks.filter(link => !link.mobileOnly).map((link) => {
                                    const isActive = pathname === link.href;
                                    return (
                                        <Link
                                            key={link.href}
                                            href={link.href}
                                            className={`relative px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${isActive
                                                ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'
                                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/50 dark:text-gray-300 dark:hover:text-white dark:hover:bg-slate-800/50'
                                                }`}
                                        >
                                            {link.label}
                                            {link.href === '/friends' && friendRequestCount > 0 && (
                                                <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                                                </span>
                                            )}
                                            {link.href === '/feedback' && pendingFeedbackCount > 0 && (
                                                <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                                                </span>
                                            )}
                                            {link.href === '/feedback' && pendingFeedbackCount === 0 && hasUnreadChangelog && (
                                                <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                                </span>
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Right Side Icons (Desktop) */}
                        <div className="hidden md:flex items-center gap-3">
                            <button
                                onClick={toggleDarkMode}
                                className="p-2.5 rounded-full text-gray-500 hover:bg-gray-100 hover:text-amber-500 dark:text-gray-400 dark:hover:bg-slate-800 dark:hover:text-yellow-400 transition-all duration-200"
                                aria-label="Toggle Dark Mode"
                            >
                                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                            </button>

                            {session && (
                                <Link
                                    href="/profile"
                                    className="p-2.5 rounded-full text-gray-500 hover:bg-gray-100 hover:text-rose-500 dark:text-gray-400 dark:hover:bg-slate-800 dark:hover:text-rose-400 transition-all duration-200"
                                    aria-label="Profile"
                                >
                                    <UserIcon className="w-5 h-5" />
                                </Link>
                            )}

                            {onOpenSettings && (
                                <button
                                    onClick={onOpenSettings}
                                    className="p-2.5 rounded-full text-gray-500 hover:bg-gray-100 hover:text-indigo-500 dark:text-gray-400 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-all duration-200"
                                    aria-label="Settings"
                                >
                                    <Settings className="w-5 h-5" />
                                </button>
                            )}

                            <div className="h-6 w-px bg-gray-200 dark:bg-slate-700 mx-1"></div>

                            {session ? (
                                <div className="relative">
                                    <button
                                        onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                                        className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-gray-50 dark:hover:bg-slate-800 transition-all duration-200 border border-transparent hover:border-gray-200 dark:hover:border-slate-700"
                                    >
                                        <div className="relative w-8 h-8 rounded-full overflow-hidden border border-gray-200 dark:border-slate-600 shadow-sm">
                                            <Image
                                                src={
                                                    session.user.user_metadata.avatar_url ||
                                                    `https://ui-avatars.com/api/?name=${encodeURIComponent(
                                                        session.user.email?.split('@')[0] || 'User'
                                                    )}&background=random&color=fff`
                                                }
                                                alt="User"
                                                fill
                                                className="object-cover"
                                            />
                                        </div>
                                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isProfileMenuOpen && (
                                        <>
                                            <div
                                                className="fixed inset-0 z-10 cursor-default"
                                                onClick={() => setIsProfileMenuOpen(false)}
                                            ></div>
                                            <div className="absolute right-0 mt-2 w-56 rounded-2xl shadow-xl py-2 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 ring-1 ring-black ring-opacity-5 focus:outline-none z-20 animate-in fade-in zoom-in-95 duration-200">
                                                <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 mb-1">
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                        {session.user.email?.split('@')[0]}
                                                    </p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                                        {session.user.email}
                                                    </p>
                                                </div>
                                            <Link
                                                href="/profile"
                                                onClick={() => setIsProfileMenuOpen(false)}
                                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-slate-700 flex items-center gap-2 transition-colors"
                                            >
                                                <UserIcon className="w-4 h-4" />
                                                내 프로필
                                            </Link>
                                            <button
                                                onClick={() => {
                                                    setIsProfileMenuOpen(false);
                                                    onLogout?.();
                                                }}
                                                className="w-full text-left px-4 py-2.5 text-sm text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 flex items-center gap-2 transition-colors"
                                                >
                                                    <LogOut className="w-4 h-4" />
                                                    Sign out
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <button
                                    onClick={onOpenLogin}
                                    className="bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-5 py-2 rounded-full text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                                >
                                    로그인
                                </button>
                            )}
                        </div>

                        {/* Mobile Menu Button */}
                        <div className="flex items-center md:hidden">
                            <button
                                onClick={toggleMenu}
                                className="inline-flex items-center justify-center p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
                            >
                                <span className="sr-only">Open main menu</span>
                                {isMenuOpen ? (
                                    <X className="block h-6 w-6" aria-hidden="true" />
                                ) : (
                                    <Menu className="block h-6 w-6" aria-hidden="true" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile Menu Overlay */}
                {isMenuOpen && (
                    <div className="md:hidden absolute top-16 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-b border-gray-200 dark:border-slate-800 shadow-xl animate-in slide-in-from-top-5 duration-200 h-[calc(100vh-4rem)] overflow-y-auto">
                        <div className="px-4 pt-4 pb-6 space-y-2">
                            {navLinks.map((link) => {
                                const isActive = pathname === link.href;
                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        onClick={() => setIsMenuOpen(false)}
                                        className={`relative block px-4 py-3 rounded-xl text-base font-medium transition-all ${isActive
                                            ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'
                                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-slate-800 dark:hover:text-white'
                                            }`}
                                    >
                                        <span className="flex items-center justify-between">
                                            {link.label}
                                            <div className="flex gap-2">
                                                {link.href === '/friends' && friendRequestCount > 0 && (
                                                    <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                                        {friendRequestCount}
                                                    </span>
                                                )}
                                                {link.href === '/feedback' && pendingFeedbackCount > 0 && (
                                                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                                        {pendingFeedbackCount}
                                                    </span>
                                                )}
                                                {link.href === '/feedback' && pendingFeedbackCount === 0 && hasUnreadChangelog && (
                                                    <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                                        N
                                                    </span>
                                                )}
                                            </div>
                                        </span>
                                    </Link>
                                );
                            })}
                        </div>

                        <div className="px-4 py-6 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50">
                            <div className="flex items-center px-2 mb-6">
                                {session ? (
                                    <div className="flex-shrink-0 relative">
                                        <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white dark:border-slate-700 shadow-sm">
                                            <Image
                                                src={
                                                    session.user.user_metadata.avatar_url ||
                                                    `https://ui-avatars.com/api/?name=${encodeURIComponent(
                                                        session.user.email?.split('@')[0] || 'User'
                                                    )}&background=random&color=fff`
                                                }
                                                alt="User"
                                                fill
                                                className="object-cover"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center shadow-sm border border-gray-100 dark:border-slate-600">
                                        <UserIcon className="w-6 h-6 text-gray-400" />
                                    </div>
                                )}
                                <div className="ml-4">
                                    <div className="text-base font-bold text-gray-900 dark:text-white">
                                        {session ? session.user.email?.split('@')[0] : '게스트'}
                                    </div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400">
                                        {session ? session.user.email : 'fomopomo에 오신 것을 환영합니다'}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={toggleDarkMode}
                                    className="flex flex-col items-center justify-center p-4 rounded-xl bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-all"
                                >
                                    {isDarkMode ? <Sun className="w-6 h-6 mb-2 text-amber-500" /> : <Moon className="w-6 h-6 mb-2 text-indigo-500" />}
                                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                                        {isDarkMode ? '라이트' : '다크'}
                                    </span>
                                </button>

                                {onOpenSettings && (
                                    <button
                                        onClick={() => {
                                            setIsMenuOpen(false);
                                            onOpenSettings();
                                        }}
                                        className="flex flex-col items-center justify-center p-4 rounded-xl bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-all"
                                    >
                                        <Settings className="w-6 h-6 mb-2 text-gray-500 dark:text-gray-400" />
                                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">설정</span>
                                    </button>
                                )}



                                {session ? (
                                    <>
                                        <Link
                                            href="/profile"
                                            onClick={() => setIsMenuOpen(false)}
                                            className="flex flex-col items-center justify-center p-4 rounded-xl bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-all"
                                        >
                                            <UserIcon className="w-6 h-6 mb-2 text-gray-500 dark:text-gray-400" />
                                            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">내 프로필</span>
                                        </Link>

                                        <button
                                            onClick={() => {
                                                setIsMenuOpen(false);
                                                onLogout?.();
                                            }}
                                            className="flex flex-col items-center justify-center p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800/50 shadow-sm hover:shadow-md transition-all"
                                        >
                                            <LogOut className="w-6 h-6 mb-2 text-rose-500" />
                                            <span className="text-xs font-medium text-rose-600 dark:text-rose-400">로그아웃</span>
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => {
                                            setIsMenuOpen(false);
                                            onOpenLogin?.();
                                        }}
                                        className="flex flex-col items-center justify-center p-4 rounded-xl bg-gray-900 dark:bg-white shadow-sm hover:shadow-md transition-all"
                                    >
                                        <UserIcon className="w-6 h-6 mb-2 text-white dark:text-gray-900" />
                                        <span className="text-xs font-medium text-white dark:text-gray-900">로그인</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </nav>
            {/* Spacer to prevent content from hiding behind fixed navbar */}
            <div className="h-16" />
        </>
    );
}
