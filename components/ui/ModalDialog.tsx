'use client';

import {
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

type ModalDialogProps = {
  open: boolean;
  /** Escape(맨 위 대화상자일 때만)로 닫을 때 부른다. 취소와 같은 동작이어야 한다. */
  onClose: () => void;
  role?: 'dialog' | 'alertdialog';
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-label'?: string;
  /** 열릴 때 먼저 받을 컨트롤. 없으면 첫 번째로 Tab이 닿는 요소, 그것도 없으면 패널 자체. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** 패널(.ui-dialog)에 덧붙일 클래스 */
  className?: string;
  /** 덮개(.ui-dialog-overlay)에 덧붙일 클래스(z-index 등) */
  overlayClassName?: string;
  children: ReactNode;
};

const TABBABLE = [
  'a[href]',
  'area[href]',
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  'summary',
  'iframe',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',');

// 열려 있는 대화상자들. 마지막 항목이 맨 위다.
const openDialogs: number[] = [];
let lastDialogId = 0;

const isTopDialog = (id: number) => openDialogs[openDialogs.length - 1] === id;

function isRendered(element: HTMLElement, root: HTMLElement) {
  for (let node: HTMLElement | null = element; node && node !== root; node = node.parentElement) {
    if (node.hidden || node.hasAttribute('inert')) return false;
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

export function getTabbableElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (element) => element.tabIndex >= 0 && isRendered(element, root),
  );
}

// 대화상자 밖의 body 자식을 inert로 만들어 포인터·키보드·보조기기에서 뺀다.
// 토스트처럼 계속 읽혀야 하는 영역은 data-dialog-keep으로 남긴다.
function inertOutside(container: HTMLElement) {
  const changed: HTMLElement[] = [];
  Array.from(document.body.children).forEach((child) => {
    if (!(child instanceof HTMLElement) || child === container) return;
    if (child.hasAttribute('inert') || child.hasAttribute('data-dialog-keep')) return;
    if (['SCRIPT', 'STYLE', 'NEXTJS-PORTAL'].includes(child.tagName)) return;
    child.setAttribute('inert', '');
    changed.push(child);
  });
  return () => changed.forEach((element) => element.removeAttribute('inert'));
}

const subscribeNothing = () => () => {};

// 앱의 모든 모달 대화상자가 쓰는 공통 틀. body로 포털해 띄우고,
// 열 때 안으로 포커스를 옮기고, Tab을 안에 가두고, 배경을 inert로 만들고,
// Escape는 맨 위 대화상자만 닫고, 닫히면 연 요소로 포커스를 돌려준다.
export default function ModalDialog(props: ModalDialogProps) {
  const isClient = useSyncExternalStore(subscribeNothing, () => true, () => false);
  if (!props.open || !isClient) return null;
  return createPortal(<OpenModalDialog {...props} />, document.body);
}

function OpenModalDialog({
  onClose,
  role = 'dialog',
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-label': label,
  initialFocusRef,
  className,
  overlayClassName,
  children,
}: ModalDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const onCloseRef = useRef(onClose);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const id = ++lastDialogId;
    idRef.current = id;
    openDialogs.push(id);
    const restoreBackground = inertOutside(overlay);

    const target = initialFocusRef?.current ?? getTabbableElements(panel)[0] ?? panel;
    target.focus();

    // 포커스가 대화상자 밖(body 등)에 있을 때 누른 Escape도 맨 위 대화상자가 받는다.
    // inert 배경에서 온 키 입력은 사용자가 낼 수 없는 것이므로 무시한다.
    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || !isTopDialog(id)) return;
      if (event.target instanceof Element && event.target.closest('[inert]')) return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener('keydown', handleDocumentKeyDown);

    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown);
      const index = openDialogs.indexOf(id);
      if (index >= 0) openDialogs.splice(index, 1);
      restoreBackground();
      if (opener?.isConnected && opener !== document.body) opener.focus();
    };
    // 열려 있는 동안 한 번만 설정한다(initialFocusRef는 처음 포커스에만 쓴다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const panel = event.currentTarget;
    // 안쪽 키 입력이 부모 대화상자나 window 단축키(타이머 Space 등)로 새지 않게 한다.
    event.stopPropagation();

    if (event.key === 'Escape') {
      // Radix 팝오버 등 안쪽 층이 먼저 처리했다면(preventDefault) 그 층만 닫힌다.
      if (event.defaultPrevented || event.nativeEvent.isComposing || !isTopDialog(idRef.current)) return;
      event.preventDefault();
      onCloseRef.current();
      return;
    }

    if (event.key !== 'Tab' || !panel.contains(event.target as Node)) return;
    const tabbables = getTabbableElements(panel);
    if (tabbables.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = tabbables[0];
    const last = tabbables[tabbables.length - 1];
    const active = document.activeElement;
    const outside = !tabbables.includes(active as HTMLElement);
    if (event.shiftKey && (active === first || outside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || outside)) {
      event.preventDefault();
      first.focus();
    }
  };

  // 덮개를 눌러도 포커스가 body로 빠지지 않게 한다(배경 클릭으로 닫지는 않는다).
  const keepFocus = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) event.preventDefault();
  };

  return (
    <div ref={overlayRef} className={cn('ui-dialog-overlay', overlayClassName)} onMouseDown={keepFocus}>
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-label={label}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={cn('ui-dialog outline-none', className)}
      >
        {children}
      </div>
    </div>
  );
}
