'use client';

import { useState } from 'react';
import Image from 'next/image';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoogleLogin: () => void;
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const maybeError = error as { message?: unknown };
    if (typeof maybeError.message === 'string') {
      return maybeError.message;
    }
  }

  return '오류가 발생했습니다.';
};

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
        toast.success('회원가입에 성공했습니다. 이메일을 확인해주세요.');
        onClose();
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        toast.success('로그인에 성공했습니다.');
        onClose();
      }
    } catch (error: unknown) {
      let message = getErrorMessage(error);
      if (message.includes('Email not confirmed')) {
        message = '이메일 인증이 완료되지 않았습니다.\n메일함을 확인해주세요.';
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
      <div className="relative mx-4 w-full max-w-sm rounded-lg bg-white p-8 text-gray-800 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-6 w-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <div className="mb-6 text-center">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wider text-gray-500">
            {isSignUp ? '회원가입' : '로그인'}
          </h2>
          <h1 className="text-2xl font-extrabold text-gray-700">
            {isSignUp ? 'fomopomo 회원가입' : 'fomopomo 로그인'}
          </h1>
        </div>

        <button
          onClick={onGoogleLogin}
          className="group mb-6 flex w-full items-center justify-center gap-3 rounded-lg border-2 border-gray-100 bg-white py-3 font-bold text-gray-600 shadow-sm transition-all hover:border-gray-200 hover:bg-gray-50"
        >
          <Image
            src="https://www.svgrepo.com/show/475656/google-color.svg"
            alt="Google"
            width={20}
            height={20}
            className="h-5 w-5 transition-transform group-hover:scale-110"
          />
          Google로 계속하기
        </button>

        <div className="mb-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-gray-200"></div>
          <span className="text-sm font-medium text-gray-400">또는</span>
          <div className="h-px flex-1 bg-gray-200"></div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-400">
              이메일
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="example@mail.com"
              className="w-full rounded bg-gray-100 px-4 py-3 text-gray-700 outline-none transition-all focus:ring-2 focus:ring-gray-300"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-gray-400">
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="********"
              className="w-full rounded bg-gray-100 px-4 py-3 text-gray-700 outline-none transition-all focus:ring-2 focus:ring-gray-300"
              onKeyDown={(event) =>
                event.key === 'Enter' ? void handleEmailAuth() : undefined
              }
            />
          </div>

          <button
            onClick={handleEmailAuth}
            disabled={loading}
            className="w-full rounded bg-gray-800 py-3 font-bold text-white shadow-lg transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? '처리 중...'
              : isSignUp
                ? '이메일로 가입하기'
                : '이메일로 로그인'}
          </button>
        </div>

        <div className="mt-6 text-center text-sm">
          <span className="text-gray-400">
            {isSignUp
              ? '이미 계정이 있으신가요? '
              : '계정이 없으신가요? '}
          </span>
          <button
            onClick={() => setIsSignUp((current) => !current)}
            className="font-bold text-gray-800 hover:underline"
          >
            {isSignUp ? '로그인' : '회원가입'}
          </button>
        </div>
      </div>
    </div>
  );
}
