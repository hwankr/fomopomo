export type StudySubject = {
  id: string;
  user_id: string;
  name: string;
  created_at?: string;
  /** 보관한 시각. 없거나 null이면 사용 중이다(보관 열이 생기기 전의 DB도 사용 중으로 읽힌다). */
  archived_at?: string | null;
};

/** 보관한 과목인가. 보관해도 과목 ID·이름과 그 과목을 가리키는 기록은 그대로다. */
export function isArchivedSubject(subject: Pick<StudySubject, 'archived_at'> | null | undefined): boolean {
  return Boolean(subject?.archived_at);
}

/** 같은 과목 이름인지 비교하는 키. DB 유일 인덱스 `lower(btrim(name))`처럼 앞뒤 공백·대소문자를 무시한다. */
export function subjectNameKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/**
 * 과목 삭제 결과(`delete_study_subject` RPC).
 * - deleted: 과목이 목록에서 사라졌다(이미 지워져 서버에 없던 경우도 같다). 참조는 미분류가 됐다.
 * - in_use_by_subject_group: 장기 과제의 과목 항목(과목 그룹)이 이 과목을 써서 지우지 않았다. projects는 그 장기 과제 제목.
 * - failed: 오류·예외·알 수 없는 응답. 아무것도 바뀌었다고 보지 않는다.
 */
export type DeleteStudySubjectResult =
  | { status: 'deleted' }
  | { status: 'in_use_by_subject_group'; projects: string[] }
  | { status: 'failed' };

// RPC 응답을 믿지 않고 모양을 확인한다. 모르는 모양은 실패로 본다.
export function readDeleteStudySubjectResponse(data: unknown): DeleteStudySubjectResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { status: 'failed' };
  const { status, projects } = data as { status?: unknown; projects?: unknown };
  // not_found도 "목록에서 사라져야 함"이라 deleted와 같게 다룬다(다른 화면에서 먼저 지운 경우 등).
  if (status === 'deleted' || status === 'not_found') return { status: 'deleted' };
  if (status === 'in_use_by_subject_group') {
    return {
      status,
      projects: Array.isArray(projects) ? projects.filter((project): project is string => typeof project === 'string') : [],
    };
  }
  return { status: 'failed' };
}

export const STUDY_SUBJECTS_CHANGED_EVENT = 'study-subjects-changed';

// Other tabs of this browser hear about changes too (other devices do not). One channel per
// tab both sends and receives: a BroadcastChannel never gets its own messages, so this tab
// does not reload twice, and a received message only re-dispatches the local event (no
// re-broadcast). Opened at load so a tab that only listens still receives. Without
// BroadcastChannel (or during SSR) only the same-tab event is sent.
// The channel lives on the tab's global, not in this module: when the module runs again
// (development reload), the previous channel is closed. Left open, it would hear the new
// channel's messages in this same tab and dispatch every change twice.
const CHANNEL_KEY = Symbol.for('fomopomo.studySubjectsChannel');
type ChannelHolder = Record<symbol, BroadcastChannel | null | undefined>;

openCrossTabChannel();

function openCrossTabChannel() {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  const holder = globalThis as unknown as ChannelHolder;
  try {
    holder[CHANNEL_KEY]?.close();
  } catch {
    // An unusable previous channel is replaced all the same.
  }
  holder[CHANNEL_KEY] = null;
  try {
    const channel = new BroadcastChannel(STUDY_SUBJECTS_CHANGED_EVENT);
    channel.onmessage = () => { window.dispatchEvent(new Event(STUDY_SUBJECTS_CHANGED_EVENT)); };
    holder[CHANNEL_KEY] = channel;
  } catch {
    // Same-tab events only.
  }
}

// The event and the message carry no account data. Each subscriber reloads its own user's data.
export function notifyStudySubjectsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(STUDY_SUBJECTS_CHANGED_EVENT));
  try {
    // Read from the global so a caller still holding an older copy of this module sends
    // through the tab's current channel.
    (globalThis as unknown as ChannelHolder)[CHANNEL_KEY]?.postMessage(null);
  } catch {
    // A closed or broken channel must not fail the change that already happened.
  }
}

export function validateSubjectName(value: string): string | null {
  const name = value.trim();
  if (!name) return '과목 이름을 입력해주세요.';
  if ([...name].length > 80) return '과목 이름은 80자 이내로 입력해주세요.';
  return null;
}
