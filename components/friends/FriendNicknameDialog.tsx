'use client';

import { useId, useRef, type FormEvent } from 'react';
import ModalDialog from '@/components/ui/ModalDialog';

interface FriendNicknameDialogProps {
  open: boolean;
  email: string;
  value: string;
  saving?: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

// 친구 닉네임 수정 창. 비워 두고 저장하면 친구의 이메일이 이름으로 보인다.
export default function FriendNicknameDialog({
  open,
  email,
  value,
  saving = false,
  onChange,
  onSave,
  onCancel,
}: FriendNicknameDialogProps) {
  const titleId = useId();
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    onSave();
  };

  return (
    <ModalDialog
      open={open}
      onClose={onCancel}
      aria-labelledby={titleId}
      initialFocusRef={inputRef}
      overlayClassName="animate-fade-in"
      className="animate-scale-in md:max-w-[400px]"
    >
      <span aria-hidden="true" className="ui-sheet-grabber md:hidden" />
      <h2 id={titleId} className="ui-dialog-title">
        닉네임 수정
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-[13px] font-semibold text-ink-muted">
            친구 닉네임
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            aria-describedby={hintId}
            autoComplete="off"
            className="ui-input min-h-12 rounded-tile px-4"
          />
          <p id={hintId} className="m-0 text-[13px] break-all text-ink-subtle">
            비워 두면 이메일({email})로 보여요.
          </p>
        </div>
        <div className="flex gap-2 md:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="ui-button-secondary min-h-[50px] flex-1 rounded-tile px-5 md:min-h-12 md:flex-none"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={saving}
            className="ui-button-primary ui-press min-h-[50px] flex-1 rounded-tile bg-ink px-6 md:min-h-12 md:flex-none"
          >
            저장
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
