'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import ModalDialog from '@/components/ui/ModalDialog';
import { signOutWithPushCleanup } from '@/lib/pushSubscriptionLifecycle';

interface LogoutDialogProps {
  open: boolean;
  onClose: () => void;
}

// 프로필의 로그아웃 확인. 로그아웃하면 타이머(/)로 돌아간다.
export default function LogoutDialog({ open, onClose }: LogoutDialogProps) {
  const router = useRouter();
  const titleId = useId();
  const messageId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);

  const close = () => {
    if (!pending) onClose();
  };

  const logout = async () => {
    setPending(true);
    try {
      const { error } = await signOutWithPushCleanup();
      if (error) throw error;
      onClose();
      router.replace('/');
    } catch (error) {
      console.error('로그아웃 실패:', error);
      toast.error('로그아웃하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setPending(false);
    }
  };

  return (
    <ModalDialog
      open={open}
      onClose={close}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      initialFocusRef={confirmRef}
      overlayClassName="animate-fade-in"
      className="animate-scale-in gap-3.5 md:max-w-[400px] md:gap-5"
    >
      <span aria-hidden="true" className="ui-sheet-grabber md:hidden" />
      <h2 id={titleId} className="ui-dialog-title">로그아웃할까요?</h2>
      <p id={messageId} className="m-0 text-sm break-keep text-ink-muted md:text-[15px]">
        공부 기록은 계정에 남아 있어요. 다시 로그인하면 그대로 볼 수 있어요.
      </p>
      <div className="flex gap-2 pt-1.5 md:justify-end md:pt-0">
        <button
          type="button"
          onClick={close}
          disabled={pending}
          className="ui-button-secondary min-h-[50px] flex-1 rounded-tile px-5 md:min-h-12 md:flex-none"
        >
          취소
        </button>
        <button
          ref={confirmRef}
          type="button"
          onClick={() => void logout()}
          disabled={pending}
          className="ui-button-primary ui-press min-h-[50px] flex-1 rounded-tile px-6 md:min-h-12 md:flex-none"
        >
          {pending ? '로그아웃 중…' : '로그아웃'}
        </button>
      </div>
    </ModalDialog>
  );
}
