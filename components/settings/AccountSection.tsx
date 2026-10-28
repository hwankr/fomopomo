'use client';

import { useId, useRef, useState } from 'react';
import ConfirmModal from '@/components/ConfirmModal';
import ModalDialog from '@/components/ui/ModalDialog';
import { cn } from '@/lib/utils';
import { SettingsSection } from './SettingsControls';

type AccountSectionProps = {
  signedIn: boolean;
  status: string;
  onOpenLogin: () => void;
  onResetSettings: () => void;
  /** 로그아웃이 끝나 화면을 떠나면 true. 실패하면 대화상자를 연 채로 둔다. */
  onLogout: () => Promise<boolean>;
  onResetAccount: () => void;
  onDeleteAccount: () => void;
};

type ConfirmKind = 'settings' | 'account' | 'delete';

const ERASED_DATA = [
  '공부 기록/시간',
  '친구/친구 요청',
  '가입된 그룹 (자동 탈퇴, 혼자만 있는 그룹은 삭제)',
  '할 일/주간·월간 플랜',
  '설정/알림',
];

const button = 'ui-button-secondary ui-press min-h-[50px] w-full justify-start rounded-tile px-[18px] md:min-h-12 md:w-auto md:justify-center';
const dangerButton = cn(button, 'bg-pomo-tint text-pomo-deep');

function ErasedDataMessage({ lead, note }: { lead: string; note: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0">{lead}</p>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-[18px] text-sm text-ink">
        {ERASED_DATA.map((item) => <li key={item}>{item}</li>)}
      </ul>
      <p className="m-0 text-[13px]">{note}</p>
    </div>
  );
}

export default function AccountSection({
  signedIn,
  status,
  onOpenLogin,
  onResetSettings,
  onLogout,
  onResetAccount,
  onDeleteAccount,
}: AccountSectionProps) {
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const closeConfirm = () => setConfirm(null);

  return (
    <SettingsSection id="settings-account" title="계정" className="gap-2 md:gap-3" headingClassName="mb-0.5 md:mb-0">
      {!signedIn && (
        <p className="m-0 text-[13px] text-ink-muted md:text-sm">로그인하면 계정을 관리할 수 있어요. 타이머 설정은 로그인하지 않아도 이 기기에 저장돼요.</p>
      )}
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
        {signedIn ? (
          <button type="button" onClick={() => setIsLogoutOpen(true)} className={button}>로그아웃</button>
        ) : (
          <button type="button" onClick={onOpenLogin} className={button}>로그인</button>
        )}
        <button type="button" onClick={() => setConfirm('settings')} className={button}>설정 초기화</button>
        {signedIn && (
          <>
            <button type="button" onClick={() => setConfirm('account')} className={dangerButton}>계정 초기화</button>
            <button type="button" onClick={() => setConfirm('delete')} className={dangerButton}>계정 탈퇴</button>
          </>
        )}
      </div>
      <span role="status" className="min-h-[18px] text-xs text-ink-muted md:min-h-0 md:text-[13px]">{status}</span>

      <ConfirmModal
        isOpen={confirm === 'settings'}
        onClose={closeConfirm}
        onConfirm={onResetSettings}
        title="설정을 초기화할까요?"
        message="시간, 자동 시작, 소리 설정이 기본값으로 돌아가요. 과목과 공부 기록은 그대로예요."
        confirmText="초기화"
      />
      <ConfirmModal
        isOpen={confirm === 'account'}
        onClose={closeConfirm}
        onConfirm={onResetAccount}
        title="계정을 초기화할까요?"
        message={<ErasedDataMessage lead="다음 데이터가 모두 초기화돼요." note="다른 멤버가 있는 그룹의 그룹장은 그룹장을 넘긴 뒤에 초기화할 수 있어요. 되돌릴 수 없어요." />}
        confirmText="계정 초기화"
        isDangerous
      />
      <ConfirmModal
        isOpen={confirm === 'delete'}
        onClose={closeConfirm}
        onConfirm={onDeleteAccount}
        title="정말 탈퇴할까요?"
        message={<ErasedDataMessage lead="다음 데이터가 영구적으로 삭제되고, 되돌릴 수 없어요." note="다른 멤버가 있는 그룹의 그룹장은 그룹장을 넘긴 뒤에 탈퇴할 수 있어요." />}
        confirmText="탈퇴하기"
        isDangerous
      />
      <LogoutDialog open={isLogoutOpen} onClose={() => setIsLogoutOpen(false)} onLogout={onLogout} />
    </SettingsSection>
  );
}

// 프로필의 로그아웃 확인과 같은 모양. 설정 화면은 로그아웃 전에 저장하지 않은 변경을 저장해야 해서 동작을 밖에서 받는다.
function LogoutDialog({ open, onClose, onLogout }: { open: boolean; onClose: () => void; onLogout: () => Promise<boolean> }) {
  const titleId = useId();
  const messageId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);

  const close = () => {
    if (!pending) onClose();
  };

  const handleLogout = async () => {
    setPending(true);
    try {
      if (await onLogout()) onClose();
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
      overlayClassName="z-70 animate-fade-in"
      className="animate-scale-in gap-3 md:max-w-[400px] md:gap-5"
    >
      <span aria-hidden="true" className="ui-sheet-grabber md:hidden" />
      <h2 id={titleId} className="ui-dialog-title">로그아웃할까요?</h2>
      <p id={messageId} className="m-0 text-sm break-keep text-ink-muted md:text-[15px]">
        공부 기록은 계정에 남아 있어요. 다시 로그인하면 그대로 볼 수 있어요.
      </p>
      <div className="flex gap-2 pt-2 md:justify-end md:pt-0">
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
          onClick={() => { void handleLogout(); }}
          disabled={pending}
          className="ui-button-primary ui-press min-h-[50px] flex-1 rounded-tile px-6 md:min-h-12 md:flex-none"
        >
          {pending ? '로그아웃 중…' : '로그아웃'}
        </button>
      </div>
    </ModalDialog>
  );
}
