'use client';

import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AddFriendProps {
  session: Session;
  onFriendAdded: () => void;
}

function getRpcErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const errorRecord = error as {
      message?: string;
      error_description?: string;
    };

    return (
      errorRecord.message ||
      errorRecord.error_description ||
      '요청 전송에 실패했습니다.'
    );
  }

  return '요청 전송에 실패했습니다.';
}

export default function AddFriend({ session, onFriendAdded }: AddFriendProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  void session;

  const handleAddFriend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email) return;

    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.rpc('send_friend_request', {
        receiver_email: email,
      });

      if (error) throw error;

      setMessage({ type: 'success', text: '친구 요청을 보냈습니다.' });
      setEmail('');
      onFriendAdded();
    } catch (error: unknown) {
      console.error('Error adding friend:', JSON.stringify(error, null, 2));
      setMessage({ type: 'error', text: getRpcErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleAddFriend} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          친구 이메일
        </label>
        <input
          type="email"
          id="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="이메일 주소를 입력하세요"
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-gray-900 transition-all focus:border-transparent focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900/50 dark:text-white"
          required
        />
      </div>

      {message && (
        <div
          className={`text-sm p-3 rounded-lg ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
              : 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'
          }`}
        >
          {message.text}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 font-medium text-white shadow-sm transition-all hover:bg-indigo-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
      >
        {loading ? '전송 중...' : '친구 요청 보내기'}
      </button>
    </form>
  );
}
