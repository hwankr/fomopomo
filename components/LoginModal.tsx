'use client';

import Image from 'next/image';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoogleLogin: () => void;
}

export default function LoginModal({
  isOpen,
  onClose,
  onGoogleLogin,
}: LoginModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async () => {
    if (!email || !password) {
      toast.error('이메일과 비밀번호를 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        toast.success('회원가입 성공! 이메일을 확인해주세요.');
        onClose();
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success('로그인 성공!');
        onClose();
      }
    } catch (error: any) {
      let message = error.message || '오류가 발생했습니다.';
      if (message.includes('Email not confirmed')) {
        message = '이메일 인증이 완료되지 않았습니다.\n메일함을 확인해주세요!';
      } else if (message.includes('Invalid login credentials')) {
        message = '이메일 또는 비밀번호가 올바르지 않습니다.';
      } else if (message.includes('User already registered')) {
        message = '이미 가입된 이메일입니다.';
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      {/* 모달 박스 */}
      <div className="bg-white text-gray-800 rounded-lg shadow-2xl w-full max-w-sm p-8 relative mx-4">
        {/* 닫기 버튼 (X) */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* 헤더 */}
        <div className="text-center mb-6">
          <h2 className="text-gray-500 font-bold text-sm uppercase tracking-wider mb-1">
            {isSignUp ? 'Sign Up' : 'Sign In'}
          </h2>
          <h1 className="text-2xl font-extrabold text-gray-700">
            {isSignUp ? 'Pomofomo 회원가입' : 'Pomofomo 로그인'}
          </h1>
        </div>

        {/* 구글 로그인 버튼 */}
        <button
          onClick={onGoogleLogin}
          className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-100 py-3 rounded-lg text-gray-600 font-bold shadow-sm hover:bg-gray-50 hover:border-gray-200 transition-all mb-6 group"
        >
          <Image
            src="https://www.svgrepo.com/show/475656/google-color.svg"
            alt="Google"
            width={20}
            height={20}
            className="w-5 h-5 group-hover:scale-110 transition-transform"
          />
          Sign up with Google
        </button>

        {/* 구분선 (OR) */}
        <div className="flex items-center gap-4 mb-6">
          <div className="h-px bg-gray-200 flex-1"></div>
          <span className="text-gray-400 text-sm font-medium">or</span>
          <div className="h-px bg-gray-200 flex-1"></div>
        </div>

        {/* 이메일 로그인 */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@mail.com"
              className="w-full bg-gray-100 border-none rounded text-gray-700 py-3 px-4 focus:ring-2 focus:ring-gray-300 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              className="w-full bg-gray-100 border-none rounded text-gray-700 py-3 px-4 focus:ring-2 focus:ring-gray-300 outline-none transition-all"
              onKeyDown={(e) => e.key === 'Enter' && handleEmailAuth()}
            />
          </div>

          <button
            onClick={handleEmailAuth}
            disabled={loading}
            className="w-full bg-gray-800 text-white font-bold py-3 rounded hover:bg-gray-700 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : isSignUp ? 'Sign Up with Email' : 'Sign In with Email'}
          </button>
        </div>

        {/* 하단 링크 */}
        <div className="mt-6 text-center text-sm">
          <span className="text-gray-400">
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          </span>
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-gray-800 font-bold hover:underline"
          >
            {isSignUp ? 'Log in' : 'Sign up'}
          </button>
        </div>
      </div>
    </div>
  );
}
