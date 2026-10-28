'use client';

import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { usePresence } from './usePresence';

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
  /** 덮개를 누르면 onClose를 부른다. 기본은 닫지 않는다(설치 안내처럼 가벼운 안내에만 쓴다). */
  closeOnOverlayClick?: boolean;
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

// 대화상자가 이미 처리한 Escape. 같은 이벤트를 다른 경로에서 두 번 처리하지 않게 한다.
const handledEscapes = new WeakSet<Event>();

const isFromInertContent = (event: Event) =>
  event.target instanceof Element && event.target.closest('[inert]') !== null;

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

// Tab/Shift+Tab을 패널 안에서 돌린다. 패널 밖 다른 층(포털된 팝오버 내용 등)의 Tab은 그 층에 맡긴다.
function containTab(panel: HTMLElement, event: globalThis.KeyboardEvent) {
  const target = event.target;
  const fromPanel = target instanceof Node && panel.contains(target);
  const fromNowhere = target === document.body || target === document.documentElement;
  if (!fromPanel && !fromNowhere) return;

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
}

// 대화상자가 inert로 만든 요소와 그 inert를 잡고 있는 대화상자들. 닫히는 대화상자가 놓는 것과
// 같은 순간 열리는 대화상자가 잡는 것의 순서와 상관없이, 잡은 대화상자가 하나라도 있으면 inert로 남는다.
const inertHolders = new WeakMap<Element, Set<number>>();

// 대화상자 밖의 body 자식을 inert로 만들어 포인터·키보드·보조기기에서 뺀다.
// 토스트처럼 계속 읽혀야 하는 영역은 data-dialog-keep으로 남긴다.
function inertOutside(container: HTMLElement, id: number) {
  const held: HTMLElement[] = [];
  Array.from(document.body.children).forEach((child) => {
    if (!(child instanceof HTMLElement) || child === container) return;
    if (child.hasAttribute('data-dialog-keep')) return;
    if (['SCRIPT', 'STYLE', 'NEXTJS-PORTAL'].includes(child.tagName)) return;
    const holders = inertHolders.get(child);
    if (holders) {
      holders.add(id);
    } else {
      // 대화상자가 아닌 쪽(닫히는 대화상자 자신 등)이 붙인 inert는 건드리지 않는다.
      if (child.hasAttribute('inert')) return;
      inertHolders.set(child, new Set([id]));
      child.setAttribute('inert', '');
    }
    held.push(child);
  });
  return () => held.forEach((element) => {
    const holders = inertHolders.get(element);
    holders?.delete(id);
    if (holders && holders.size > 0) return;
    inertHolders.delete(element);
    element.removeAttribute('inert');
  });
}

// 대화상자를 연 요소. 닫히는 중인 대화상자 안에서 다른 대화상자를 열었다면
// (확인 버튼이 곧 사라지므로) 닫히는 대화상자를 처음 연 요소를 이어받는다.
const dialogOpeners = new WeakMap<Element, HTMLElement | null>();

function findOpener() {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const closingOverlay = active?.closest('.ui-dialog-overlay[data-state="closed"]');
  if (closingOverlay && dialogOpeners.has(closingOverlay)) return dialogOpeners.get(closingOverlay) ?? null;
  return active;
}

const subscribeNothing = () => () => {};

// 앱의 모든 모달 대화상자가 쓰는 공통 틀. body로 포털해 띄우고,
// 열 때 안으로 포커스를 옮기고, Tab을 안에 가두고, 배경을 inert로 만들고,
// Escape는 맨 위 대화상자만 닫고, 닫히면 연 요소로 포커스를 돌려준다.
// 덮개는 바탕색이, 패널은 모바일 시트 / md 가운데 패널로 나타나고 사라진다(globals.css, data-state).
// 닫히기 시작하면 곧바로 배경과 포커스를 돌려주고, 퇴장 애니메이션이 끝나면 내린다(없으면 바로).
export default function ModalDialog(props: ModalDialogProps) {
  const isClient = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const presence = usePresence<HTMLDivElement>(props.open);
  // 닫히는 동안에는 마지막으로 열려 있던 내용을 그대로 보여 준다
  // (부모가 닫으면서 비운 상태 때문에 패널 내용이 바뀌거나 줄어들지 않게).
  const [openChildren, setOpenChildren] = useState(props.children);
  if (props.open && openChildren !== props.children) setOpenChildren(props.children);

  if (!presence.mounted || !isClient) return null;
  return createPortal(
    <OpenModalDialog
      key={presence.key}
      {...props}
      closing={presence.closing}
      overlayRef={presence.ref}
    >
      {presence.closing ? openChildren : props.children}
    </OpenModalDialog>,
    document.body,
  );
}

type OpenModalDialogProps = ModalDialogProps & {
  /** 닫히는 중(퇴장 애니메이션). 키·포커스·배경은 이미 돌려줬고 클릭도 받지 않는다. */
  closing: boolean;
  overlayRef: RefObject<HTMLDivElement | null>;
};

function OpenModalDialog({
  closing,
  overlayRef,
  onClose,
  role = 'dialog',
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-label': label,
  initialFocusRef,
  className,
  overlayClassName,
  closeOnOverlayClick = false,
  children,
}: OpenModalDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const onCloseRef = useRef(onClose);
  const teardownRef = useRef(() => {});

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) return;

    const opener = findOpener();
    const id = ++lastDialogId;
    idRef.current = id;
    openDialogs.push(id);
    dialogOpeners.set(overlay, opener);
    const restoreBackground = inertOutside(overlay, id);

    const target = initialFocusRef?.current ?? getTabbableElements(panel)[0] ?? panel;
    target.focus();

    let closed = false;

    // 캡처 단계: 안쪽 컨트롤이 전파를 막아도 맨 위 대화상자가 키를 놓치지 않게 한다.
    // - Tab은 여기서 바로 가둔다.
    // - Escape는 안쪽 층(열린 팝오버, 입력을 닫는 폼 등)이 먼저 쓸 수 있도록 여기서 정하지 않는다.
    //   패널·문서 단계에서 처리되지 못한 채(전파만 막히고 preventDefault 없이) 끝났으면
    //   이벤트 처리가 끝난 뒤 닫는다.
    // inert 배경에서 온 키 입력은 사용자가 낼 수 없는 것이므로 무시한다.
    const handleCapture = (event: globalThis.KeyboardEvent) => {
      if (event.isComposing || !isTopDialog(id) || isFromInertContent(event)) return;
      if (event.key === 'Tab') {
        containTab(panel, event);
        return;
      }
      if (event.key !== 'Escape') return;
      window.setTimeout(() => {
        if (closed || handledEscapes.has(event) || event.defaultPrevented || !isTopDialog(id)) return;
        handledEscapes.add(event);
        onCloseRef.current();
      }, 0);
    };

    // 포커스가 대화상자 밖(body 등)에 있을 때 누른 Escape도 맨 위 대화상자가 바로 받는다.
    const handleBubble = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || handledEscapes.has(event)) return;
      if (!isTopDialog(id) || isFromInertContent(event)) return;
      handledEscapes.add(event);
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };

    document.addEventListener('keydown', handleCapture, true);
    document.addEventListener('keydown', handleBubble);

    // 닫히기 시작할 때(퇴장 애니메이션 전) 한 번, 늦어도 내릴 때 부른다.
    const teardown = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', handleCapture, true);
      document.removeEventListener('keydown', handleBubble);
      const index = openDialogs.indexOf(id);
      if (index >= 0) openDialogs.splice(index, 1);
      restoreBackground();
      // 같은 순간 열린 다른 대화상자가 이미 포커스를 가져갔으면 빼앗지 않는다.
      const active = document.activeElement;
      const focusInOtherDialog = active instanceof Element && !overlay.contains(active)
        && active.closest('[aria-modal="true"]') !== null;
      if (!focusInOtherDialog && opener?.isConnected && opener !== document.body) opener.focus();
    };
    teardownRef.current = teardown;
    return teardown;
    // 열려 있는 동안 한 번만 설정한다(initialFocusRef는 처음 포커스에만 쓴다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (closing) teardownRef.current();
  }, [closing]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // 안쪽 키 입력이 부모 대화상자나 window 단축키(타이머 Space 등)로 새지 않게 한다.
    // (Tab은 문서 캡처 단계에서 이미 가뒀다.)
    event.stopPropagation();
    if (event.key !== 'Escape') return;
    // 안쪽 층(Radix 팝오버, 입력만 닫는 폼 등)이 먼저 처리했다면(preventDefault) 그 층만 닫힌다.
    if (event.defaultPrevented || event.nativeEvent.isComposing || !isTopDialog(idRef.current)) return;
    handledEscapes.add(event.nativeEvent);
    event.preventDefault();
    onCloseRef.current();
  };

  // 덮개를 눌러도 포커스가 body로 빠지지 않게 한다(배경 클릭으로 닫는 것은 closeOnOverlayClick일 때만).
  const keepFocus = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) event.preventDefault();
  };

  // 패널이나 안쪽 포털(팝오버·위에 뜬 대화상자)에서 올라온 클릭은 덮개 클릭이 아니다.
  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!closeOnOverlayClick || event.target !== event.currentTarget || !isTopDialog(idRef.current)) return;
    onCloseRef.current();
  };

  return (
    <div
      ref={overlayRef}
      data-state={closing ? 'closed' : 'open'}
      // 닫히는 동안: 포커스·클릭·보조기기에서 빠지고(inert), 열린 층으로 세지 않는다(aria-modal 없음).
      inert={closing || undefined}
      className={cn('ui-dialog-overlay', overlayClassName)}
      onMouseDown={keepFocus}
      onClick={handleOverlayClick}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal={closing ? undefined : 'true'}
        data-state={closing ? 'closed' : 'open'}
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
