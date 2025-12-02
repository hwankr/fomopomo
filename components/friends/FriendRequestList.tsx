'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';

interface FriendRequestListProps {
  session: Session;
  refreshTrigger: number;
  onUpdate: () => void;
}

interface FriendRequest {
  id: string;
  sender_email: string;
  created_at: string;
}

export default function FriendRequestList({ session, refreshTrigger, onUpdate }: FriendRequestListProps) {
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRequests();
  }, [session, refreshTrigger]);

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('friend_requests')
        .select('id, sender_email, created_at')
        .eq('receiver_id', session.user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (requestId: string) => {
    try {
      const { error } = await supabase.rpc('accept_friend_request', { request_id: requestId });
      if (error) throw error;
      onUpdate();
      fetchRequests();
    } catch (error) {
      console.error('Error accepting request:', error);
      alert('친구 요청 수락에 실패했습니다.');
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      const { error } = await supabase
        .from('friend_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId);

      if (error) throw error;
      onUpdate();
      fetchRequests();
    } catch (error) {
      console.error('Error rejecting request:', error);
      alert('친구 요청 거절에 실패했습니다.');
    }
  };

  if (loading) return <div className="text-gray-500">요청 목록을 불러오는 중...</div>;

  if (requests.length === 0) {
    return <div className="text-gray-500">받은 친구 요청이 없습니다.</div>;
  }

  return (
    <ul className="space-y-3">
      {requests.map((req) => (
        <li key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl hover:border-indigo-100 dark:hover:border-indigo-900 transition-colors">
          <div className="mb-3 sm:mb-0">
            <p className="font-medium text-gray-900 dark:text-white">{req.sender_email}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {new Date(req.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAccept(req.id)}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-400 text-sm font-medium rounded-lg transition-colors"
            >
              수락
            </button>
            <button
              onClick={() => handleReject(req.id)}
              className="px-3 py-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-sm font-medium rounded-lg transition-colors"
            >
              거절
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
