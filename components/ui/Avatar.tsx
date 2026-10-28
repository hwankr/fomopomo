import type { User } from '@supabase/supabase-js';
import { cn } from '@/lib/utils';

type AvatarProps = {
  name: string | null | undefined;
  size?: 36 | 64;
  /** tint: 연한 로즈 바탕 + 로즈 글자, solid: 로즈 바탕 + 흰 글자(현재 페이지 표시) */
  tone?: 'tint' | 'solid';
  className?: string;
};

type UserLike = Pick<User, 'email' | 'user_metadata'> | null | undefined;

const readText = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

// 닉네임 → 이름 → 이메일 앞부분 순서로 화면에 보일 이름을 고른다.
export function getDisplayName(user: UserLike) {
  if (!user) return null;
  const metadata = user.user_metadata ?? {};
  return (
    readText(metadata.nickname) ??
    readText(metadata.full_name) ??
    readText(metadata.name) ??
    readText(user.email?.split('@')[0]) ??
    null
  );
}

export function getInitial(name: string | null | undefined) {
  const first = Array.from(name?.trim() ?? '')[0];
  return first ? first.toLocaleUpperCase() : '?';
}

// 이니셜 아바타. 이름은 옆에 따로 보여 주거나 링크의 aria-label로 전달하므로 장식으로 숨긴다.
export default function Avatar({ name, size = 36, tone = 'tint', className }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full leading-none select-none',
        size === 64 ? 'size-16 text-[26px] font-extrabold' : 'size-9 text-sm font-bold',
        tone === 'solid' ? 'bg-pomo text-white' : 'bg-pomo-tint text-pomo',
        className,
      )}
    >
      {getInitial(name)}
    </span>
  );
}
