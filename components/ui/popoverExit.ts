// 닫히는 Radix 팝오버·메뉴(.ui-popover)는 퇴장 애니메이션 동안 화면에 남는다(Radix Presence).
// 그동안 클릭·키보드 포커스를 받지 않게 하고, 포커스가 안에 있었으면 바로 트리거로 돌려준다.
// 클릭은 globals.css의 pointer-events: none이, 포커스는 여기서 붙이는 inert가 막는다. ShellProvider가 한 번 설치한다.
// 선택 목록(Select)은 퇴장 애니메이션 없이 닫히는 순간 내려가므로, 함께 사라진 포커스만 트리거로 돌려준다.
// 어느 쪽이든 닫힐 때 포커스를 정리했으면, 내용을 내린 뒤 Radix가 다시 옮기는 포커스(지연된 unmount autofocus)는 취소한다.
// 그래서 한 번 닫을 때 포커스는 한 번만 움직이고, 그새 사용자가 옮긴 포커스는 그대로다.

const POPOVER_SELECTOR = '.ui-popover';
// Radix FocusScope가 내용을 내린 뒤(setTimeout 0) 그 요소(.ui-popover 자신)에 보내는 이벤트. 기본 동작은 트리거로 포커스 이동
const UNMOUNT_AUTOFOCUS_EVENT = 'focusScope.autoFocusOnUnmount';
// 바깥을 눌러 닫힌 것으로 볼 시간(같은 pointerdown에서 닫힘)
const OUTSIDE_PRESS_MS = 100;
/**
 * 내용에 `data-close-autofocus="off"`를 달면 닫힐 때 포커스를 트리거로 돌려주지 않고, 안에 있던 포커스만 놓는다.
 * 포커스로 열리는 트리거(트리거로 돌아가면 다시 열린다)처럼 `onCloseAutoFocus`에서 복귀를 막는 내용에 쓴다.
 */
export const CLOSE_AUTOFOCUS_ATTRIBUTE = 'data-close-autofocus';

/** 포커스가 container 안에 있으면 target(없으면 그냥 놓기)으로 옮긴다. 옮겼으면 true. */
export function releaseFocus(container: Element, target?: HTMLElement | null) {
  const active = container.ownerDocument.activeElement;
  if (!(active instanceof HTMLElement) || !container.contains(active)) return false;
  if (target?.isConnected) target.focus({ preventScroll: true });
  else active.blur();
  return true;
}

export function guardClosingPopovers(doc: Document = document) {
  // 열릴 때의 트리거(Radix 트리거는 열려 있는 동안만 aria-controls를 단다)
  const triggers = new WeakMap<Element, HTMLElement>();
  // 이번 닫힘을 이미 처리한 내용. 다시 열리면 지운다.
  const closing = new WeakSet<Element>();
  // 이 설치가 바꿔 둔 내용과 inert를 붙였는지. 다시 열리거나, Radix가 내린 뒤, 정리할 때 되돌린다.
  const changed = new Map<HTMLElement, boolean>();
  let lastPress: { target: EventTarget | null; at: number } | null = null;

  const restore = (content: HTMLElement) => {
    const addedInert = changed.get(content);
    if (addedInert === undefined) return;
    changed.delete(content);
    content.removeEventListener(UNMOUNT_AUTOFOCUS_EVENT, cancelUnmountFocus);
    if (addedInert) content.removeAttribute('inert');
  };
  // 설치마다 따로 만든다. 다른 설치(정리된 설치, HMR로 다시 평가된 모듈)의 처리기와 섞이지 않는다.
  function cancelUnmountFocus(event: Event) {
    event.preventDefault();
    // Radix는 내용을 내린 뒤 한 번만 보낸다.
    if (event.currentTarget instanceof HTMLElement) restore(event.currentTarget);
  }
  // 포커스는 이미 정리했으므로, 내용을 내린 뒤 Radix가 다시 옮기지 않게 한다.
  const keepFocus = (content: HTMLElement, makeInert: boolean) => {
    const addInert = makeInert && !content.hasAttribute('inert');
    changed.set(content, addInert);
    if (addInert) content.setAttribute('inert', '');
    content.addEventListener(UNMOUNT_AUTOFOCUS_EVENT, cancelUnmountFocus);
  };

  const update = (content: HTMLElement) => {
    const state = content.getAttribute('data-state');
    if (state === 'open') {
      const trigger = content.id ? doc.querySelector(`[aria-controls~="${CSS.escape(content.id)}"]`) : null;
      if (trigger instanceof HTMLElement) triggers.set(content, trigger);
      // 닫히는 중에 다시 열렸다.
      closing.delete(content);
      restore(content);
      return;
    }
    if (state !== 'closed' || closing.has(content)) return;
    closing.add(content);
    const trigger = triggers.get(content);
    const pressed = lastPress !== null && performance.now() - lastPress.at < OUTSIDE_PRESS_MS ? lastPress.target : null;
    const pressedOutside = pressed instanceof Node && !content.contains(pressed) && !trigger?.contains(pressed);
    // 바깥(트리거가 아닌 곳)을 눌러 닫았거나 내용이 복귀를 끈 경우 포커스를 트리거로 끌어오지 않는다.
    const returnTo = pressedOutside || content.getAttribute(CLOSE_AUTOFOCUS_ATTRIBUTE) === 'off' ? null : trigger;
    if (!content.isConnected) {
      // 퇴장 없이 바로 내려간 내용(선택 목록): 함께 사라진 포커스를 바로 트리거로 돌려주고, Radix의 복귀는 취소한다.
      // 돌려줄 곳이 없으면(바깥을 눌렀을 때 등) Radix에 맡긴다.
      const active = doc.activeElement;
      if ((!active || active === doc.body) && returnTo?.isConnected) {
        returnTo.focus({ preventScroll: true });
        keepFocus(content, false);
      }
      return;
    }
    releaseFocus(content, returnTo);
    keepFocus(content, true);
  };

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        if (record.target instanceof HTMLElement && record.target.matches(POPOVER_SELECTOR)) update(record.target);
        continue;
      }
      record.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches(POPOVER_SELECTOR)) update(node);
        node.querySelectorAll<HTMLElement>(POPOVER_SELECTOR).forEach(update);
      });
    }
  });
  const onPress = (event: PointerEvent) => {
    lastPress = { target: event.target, at: performance.now() };
  };

  doc.querySelectorAll<HTMLElement>(POPOVER_SELECTOR).forEach(update);
  observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] });
  doc.addEventListener('pointerdown', onPress, true);
  return () => {
    observer.disconnect();
    doc.removeEventListener('pointerdown', onPress, true);
    Array.from(changed.keys()).forEach(restore);
  };
}
