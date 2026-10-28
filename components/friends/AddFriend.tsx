'use client';

import { useId, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import Avatar from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

interface AddFriendProps {
  session: Session;
  onFriendAdded: () => void;
}

// 줄을 보여 줄지 정하는 느슨한 검사. 실제 검증은 input[type=email]과 서버가 한다.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 서버가 돌려주는 영문 오류를 알아들을 수 있는 말로 바꾼다. 모르는 오류는 그대로 보여 준다.
const RPC_ERROR_COPY: Array<[RegExp, string]> = [
  [/not found/i, '이 이메일로 가입한 사람을 찾지 못했어요.'],
  [/yourself|own sender/i, '나에게는 친구 요청을 보낼 수 없어요.'],
  [/already friends/i, '이미 친구예요.'],
  [/already sent|exists/i, '이미 요청을 보냈거나 이 사람에게서 받은 요청이 있어요.'],
];

function getRpcErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const errorRecord = error as {
      message?: string;
      error_description?: string;
    };

    const message = errorRecord.message || errorRecord.error_description;
    if (message) {
      return RPC_ERROR_COPY.find(([pattern]) => pattern.test(message))?.[1] ?? message;
    }
  }

  return '요청을 보내지 못했어요.';
}

export default function AddFriend({ session, onFriendAdded }: AddFriendProps) {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const formId = useId();
  const inputId = useId();

  void session;

  const handleAddFriend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || loading) return;

    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.rpc('send_friend_request', {
        receiver_email: email,
      });

      if (error) throw error;

      setMessage({ type: 'success', text: '친구 요청을 보냈어요. 상대가 수락하면 순위에 함께 보여요.' });
      setSentTo(email);
      setEmail('');
      onFriendAdded();
    } catch (error: unknown) {
      console.error('Error adding friend:', JSON.stringify(error, null, 2));
      setMessage({ type: 'error', text: getRpcErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  const typed = email.trim();
  // 입력 중이면 입력한 주소를, 막 보냈으면 보낸 주소를 결과 줄로 보여 준다.
  const target = typed ? (EMAIL_PATTERN.test(typed) ? typed : null) : sentTo;
  const isSent = !typed && target !== null;
  const hint = typed
    ? '이메일 주소를 끝까지 입력해 주세요.'
    : '친구가 가입한 이메일을 입력하면 여기에서 친구 요청을 보낼 수 있어요.';

  return (
    <section aria-label="친구 찾기" className="flex flex-col gap-3 md:gap-4">
      <form
        id={formId}
        onSubmit={handleAddFriend}
        className="flex flex-col gap-1.5 px-1 md:max-w-[480px] md:px-3"
      >
        <label htmlFor={inputId} className="sr-only text-[13px] font-semibold text-ink-muted md:not-sr-only">
          이메일로 찾기
        </label>
        <input
          type="email"
          id={inputId}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setMessage(null);
          }}
          placeholder="친구의 가입 이메일"
          autoComplete="off"
          className="ui-input h-12 w-full rounded-tile px-4 md:h-[50px] md:text-base"
          required
        />
      </form>

      {target ? (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          <li className="flex min-h-[72px] items-center gap-3 rounded-tile px-2 py-1.5 md:min-h-[82px] md:gap-4 md:rounded-2xl md:px-3 md:py-2">
            <Avatar name={target} className="bg-surface text-ink md:size-10 md:text-[15px]" />
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold md:text-base" title={target}>
              {target}
            </span>
            {isSent ? (
              <button
                type="button"
                disabled
                className="ui-button-secondary min-h-10 shrink-0 rounded-control px-3 text-sm md:min-h-11 md:rounded-tile md:px-4 md:text-[15px]"
              >
                요청 보냄
              </button>
            ) : (
              <button
                type="submit"
                form={formId}
                disabled={loading}
                className="ui-button-primary ui-press min-h-10 shrink-0 rounded-control px-3.5 text-sm md:min-h-11 md:rounded-tile md:px-[18px] md:text-[15px]"
              >
                {loading ? '보내는 중…' : '친구 요청'}
              </button>
            )}
          </li>
        </ul>
      ) : (
        <p className="m-0 px-2 pt-2 pb-4 text-sm text-ink-muted md:px-3 md:pt-3 md:pb-6 md:text-[15px]">{hint}</p>
      )}

      {/* 늘 그려 두는 알림 영역이라 결과가 바뀔 때마다 보조기기가 읽는다. */}
      <p
        role="status"
        className={cn(
          'm-0 px-2 text-sm empty:hidden md:px-3',
          message?.type === 'error' ? 'text-pomo-deep' : 'text-ink-muted',
        )}
      >
        {message?.text}
      </p>
    </section>
  );
}
