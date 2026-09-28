'use client';

import { useState } from 'react';
import type { StudySubject } from '@/lib/studySubjects';
import { suggestSubjectId } from '@/lib/subjectSuggestion';

export function useSuggestedSubject(title: string, subjects: StudySubject[]) {
  // undefined allows inference; null is the user's explicit unclassified choice.
  const [manualSubjectId, setManualSubjectId] = useState<string | null | undefined>(undefined);
  const isAutomatic = manualSubjectId === undefined;
  const inferredSubjectId = isAutomatic ? suggestSubjectId(title, subjects) : null;

  return {
    subjectId: manualSubjectId === undefined ? inferredSubjectId : manualSubjectId,
    isAutomatic,
    selectSubject: (id: string | null) => setManualSubjectId(id),
    resetSubject: () => setManualSubjectId(undefined),
  };
}
