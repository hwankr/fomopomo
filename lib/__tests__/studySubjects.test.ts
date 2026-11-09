import { afterEach, describe, expect, it, vi } from 'vitest';

// 탭 사이 알림. 모듈이 읽힐 때 채널을 열므로 테스트마다 새로 읽는다.
// 진짜 BroadcastChannel처럼 보낸 객체 자신을 뺀, 같은 이름의 열린 채널에 전한다(같은 탭 안이라도).
class FakeChannel {
  static instances: FakeChannel[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  posted: unknown[] = [];
  closed = false;
  constructor(public name: string) { FakeChannel.instances.push(this); }
  postMessage(message: unknown) {
    this.posted.push(message);
    FakeChannel.deliver(message, this);
  }
  close() { this.closed = true; }
  static open() { return FakeChannel.instances.filter(channel => !channel.closed); }
  /** 다른 탭(또는 보낸 쪽 sender)이 보낸 메시지를 이 탭의 열린 채널마다 전한다. */
  static deliver(message: unknown, sender?: FakeChannel) {
    for (const channel of FakeChannel.open()) {
      if (channel !== sender) channel.onmessage?.(new MessageEvent('message', { data: message }));
    }
  }
}
const CHANNEL_KEY = Symbol.for('fomopomo.studySubjectsChannel');

async function load(channel: unknown) {
  vi.resetModules();
  vi.stubGlobal('BroadcastChannel', channel);
  return import('@/lib/studySubjects');
}

const changed = vi.fn();
afterEach(() => {
  vi.unstubAllGlobals();
  window.removeEventListener('study-subjects-changed', changed);
  changed.mockReset();
  FakeChannel.instances = [];
  // 탭(전역)에 보관한 채널은 테스트 사이에 넘기지 않는다.
  delete (globalThis as Record<symbol, unknown>)[CHANNEL_KEY];
});
function listen(event: string) { window.addEventListener(event, changed); }

describe('notifyStudySubjectsChanged across tabs', () => {
  it('sends the same-tab event and broadcasts through one channel per tab without account data', async () => {
    const { notifyStudySubjectsChanged, STUDY_SUBJECTS_CHANGED_EVENT } = await load(FakeChannel);
    listen(STUDY_SUBJECTS_CHANGED_EVENT);
    notifyStudySubjectsChanged();
    notifyStudySubjectsChanged();
    expect(changed).toHaveBeenCalledTimes(2);
    expect(FakeChannel.instances).toHaveLength(1);
    expect(FakeChannel.instances[0].posted).toEqual([null, null]);
  });

  it('dispatches a message from another tab once, without broadcasting it back', async () => {
    const { STUDY_SUBJECTS_CHANGED_EVENT } = await load(FakeChannel);
    listen(STUDY_SUBJECTS_CHANGED_EVENT);
    const [channel] = FakeChannel.instances;
    expect(channel.onmessage).toBeTypeOf('function');
    channel.onmessage?.(new MessageEvent('message', { data: null }));
    expect(changed).toHaveBeenCalledTimes(1);
    expect(channel.posted).toEqual([]);
    expect(FakeChannel.instances).toHaveLength(1);
  });

  // 개발 서버가 이 모듈을 다시 실행해도(HMR) 이전 채널이 남아 같은 알림을 두 번 내지 않는다.
  it('keeps one open channel per tab after the module is evaluated again', async () => {
    await load(FakeChannel);
    const { notifyStudySubjectsChanged, STUDY_SUBJECTS_CHANGED_EVENT } = await load(FakeChannel);
    listen(STUDY_SUBJECTS_CHANGED_EVENT);
    expect(FakeChannel.instances).toHaveLength(2);
    expect(FakeChannel.open()).toHaveLength(1);

    FakeChannel.deliver(null);
    expect(changed).toHaveBeenCalledTimes(1);

    notifyStudySubjectsChanged();
    expect(changed).toHaveBeenCalledTimes(2);
    expect(FakeChannel.open()[0].posted).toEqual([null]);
  });

  it.each([
    ['missing', undefined],
    ['throwing on open', class { constructor() { throw new Error('blocked'); } }],
    ['throwing on send', class extends FakeChannel { postMessage() { throw new DOMException('closed', 'InvalidStateError'); } }],
  ])('falls back to the same-tab event without throwing when BroadcastChannel is %s', async (_label, channel) => {
    const { notifyStudySubjectsChanged, STUDY_SUBJECTS_CHANGED_EVENT } = await load(channel);
    listen(STUDY_SUBJECTS_CHANGED_EVENT);
    expect(() => notifyStudySubjectsChanged()).not.toThrow();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('opens no channel and does nothing without a window (SSR)', async () => {
    vi.stubGlobal('window', undefined);
    const { notifyStudySubjectsChanged } = await load(FakeChannel);
    expect(() => notifyStudySubjectsChanged()).not.toThrow();
    expect(FakeChannel.instances).toHaveLength(0);
  });
});
