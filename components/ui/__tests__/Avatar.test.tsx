import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Avatar, { getDisplayName, getInitial } from '../Avatar';

describe('getDisplayName', () => {
  it('prefers nickname, then name, then the email local part', () => {
    expect(getDisplayName({ email: 'a@b.c', user_metadata: { nickname: ' 민지 ', full_name: '김민지' } })).toBe('민지');
    expect(getDisplayName({ email: 'a@b.c', user_metadata: { full_name: '김민지', name: 'Minji' } })).toBe('김민지');
    expect(getDisplayName({ email: 'a@b.c', user_metadata: { name: 'Minji' } })).toBe('Minji');
    expect(getDisplayName({ email: 'study.buddy@example.com', user_metadata: { full_name: '  ' } })).toBe('study.buddy');
    expect(getDisplayName(null)).toBeNull();
  });
});

describe('getInitial', () => {
  it('takes the first character and upper-cases latin letters', () => {
    expect(getInitial('민지')).toBe('민');
    expect(getInitial('study.buddy')).toBe('S');
    expect(getInitial('  ')).toBe('?');
    expect(getInitial(null)).toBe('?');
  });
});

describe('Avatar', () => {
  afterEach(() => cleanup());

  it('renders a decorative initial in the requested size and tone', () => {
    const { container, rerender } = render(<Avatar name="민지" />);
    const avatar = container.firstElementChild as HTMLElement;
    expect(avatar).toHaveTextContent('민');
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
    expect(avatar).toHaveClass('size-9', 'bg-pomo-tint', 'text-pomo');

    rerender(<Avatar name="민지" size={64} tone="solid" />);
    expect(container.firstElementChild).toHaveClass('size-16', 'bg-pomo', 'text-white');
  });
});
