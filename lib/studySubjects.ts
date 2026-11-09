export type StudySubject = {
  id: string;
  user_id: string;
  name: string;
  created_at?: string;
};

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

// The event carries no account data. Each subscriber reloads its own user's data.
export function notifyStudySubjectsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(STUDY_SUBJECTS_CHANGED_EVENT));
  }
}

export function validateSubjectName(value: string): string | null {
  const name = value.trim();
  if (!name) return '과목 이름을 입력해주세요.';
  if ([...name].length > 80) return '과목 이름은 80자 이내로 입력해주세요.';
  return null;
}
