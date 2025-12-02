'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';

interface AddFriendProps {
  session: Session;
  onFriendAdded: () => void;
}

export default function AddFriend({ session, onFriendAdded }: AddFriendProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.rpc('send_friend_request', {
        receiver_email: email,
      });

      if (error) throw error;

      setMessage({ type: 'success', text: '친구 요청을 보냈습니다!' });
      setEmail('');
      onFriendAdded();
    } catch (error: any) {
      console.error('Error adding friend:', error);
      setMessage({ type: 'error', text: error.message || '요청 전송에 실패했습니다.' });
    } finally {

      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleAddFriend} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          친구 이메일
        </label>
        <input
          type="email"
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일 주소를 입력하세요"
          className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"

          required
        />
      </div>

      {message && (
        <div className={`text-sm p-3 rounded-lg ${message.type === 'success'
          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
          : 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'
          }`}>
          {message.text}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
      >
        {loading ? '전송 중...' : '친구 요청 보내기'}
      </button>

    </form>
  );
}
