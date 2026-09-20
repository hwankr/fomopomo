export type StudySubject = {
  id: string;
  user_id: string;
  name: string;
  created_at?: string;
};

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
