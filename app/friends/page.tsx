'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import FriendsSection from '@/components/FriendsSection';
import { Toaster } from 'react-hot-toast';

export default function FriendsPage() {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setLoading(false);
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    if (loading) {
        return (
            <div
                className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900"
                suppressHydrationWarning
            >
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans">
            <Toaster position="top-center" />
            <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <Link href="/" className="flex items-center gap-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                        <span className="hidden sm:inline">Back to Timer</span>
                    </Link>
                    <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-2"></div>
                    <h1 className="text-xl font-bold tracking-tight">Friends</h1>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
                        {session?.user?.email || 'Guest'}
                    </div>
                    {session ? (
                        <button
                            onClick={handleLogout}
                            className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                        >
                            Log out
                        </button>
                    ) : (
                        <button
                            onClick={() => supabase.auth.signInWithOAuth({
                                provider: 'google',
                                options: {
                                    redirectTo: window.location.origin,
                                },
                            })}
                            className="text-sm text-rose-500 hover:text-rose-600 font-medium transition-colors"
                        >
                            Log in
                        </button>
                    )}
                </div>
            </header>

            <main className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
                {session ? (
                    <FriendsSection user={session.user} />
                ) : (
                    <div className="text-center py-20">
                        <h2 className="text-2xl font-bold mb-4">Sign in to connect with friends</h2>
                        <p className="text-gray-500 mb-8">You need to be logged in to use the social features.</p>
                        <button
                            onClick={() => supabase.auth.signInWithOAuth({
                                provider: 'google',
                                options: {
                                    redirectTo: window.location.origin,
                                },
                            })}
                            className="px-6 py-3 bg-rose-500 text-white font-bold rounded-full hover:bg-rose-600 transition-colors shadow-lg"
                        >
                            Sign In with Google
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
}
