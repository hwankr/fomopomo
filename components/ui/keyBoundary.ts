import type { KeyboardEvent } from 'react';

// 팝오버·선택 컨트롤의 키 경계.
// 컨트롤이 직접 쓰는 키만 위(폼 단축키, window 전역 단축키 — 타이머 Space 등)로 보내지 않고,
// Escape·Tab처럼 쓰지 않는 키는 그대로 올려 보내 대화상자·폼이 닫기와 포커스 이동을 처리하게 한다.

const isTypeahead = (event: KeyboardEvent) =>
  event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

/** 버튼형 트리거(닫힌 팝오버를 여는 버튼): Enter·Space만 막는다. */
export function stopActivationKeys(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
}

/** 선택(Radix Select) 트리거: 여는 키, 위·아래 화살표, 글자 검색만 막는다. */
export function stopSelectTriggerKeys(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === 'ArrowUp' || event.key === 'ArrowDown' || isTypeahead(event)) {
    event.stopPropagation();
  }
}

/** 열린 팝오버 내용: 열려 있는 동안은 팝오버가 키보드를 가지므로 모두 막는다.
 *  (Escape는 Radix가 문서 캡처 단계에서 먼저 받아 이 층만 닫는다.) */
export function stopAllKeys(event: KeyboardEvent) {
  event.stopPropagation();
}
