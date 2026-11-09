'use client';

import { useState } from 'react';
import type { StudySubject } from '@/lib/studySubjects';
import { suggestSubjectId } from '@/lib/subjectSuggestion';

export function useSuggestedSubject(title: string, subjects: StudySubject[]) {
  // undefined allows inference; null is the user's explicit unclassified choice.
  const [manualSubjectId, setManualSubjectId] = useState<string | null | undefined>(undefined);
  // The chosen subject once it has shown up in the list (cleared whenever the choice changes).
  const [listedSubjectId, setListedSubjectId] = useState<string | null>(null);
  const isAutomatic = manualSubjectId === undefined;
  const inferredSubjectId = isAutomatic ? suggestSubjectId(title, subjects) : null;
  const listed = typeof manualSubjectId === 'string' && subjects.some(subject => subject.id === manualSubjectId);
  if (listed && listedSubjectId !== manualSubjectId) setListedSubjectId(manualSubjectId);
  // A chosen subject that was listed and then left a loaded list (deleted, maybe in another tab)
  // reads as unclassified instead of a dangling ID. One created a moment ago may not be listed
  // yet, and an empty list may still be loading, so neither is judged.
  const manualGone = typeof manualSubjectId === 'string' && listedSubjectId === manualSubjectId
    && subjects.length > 0 && !listed;

  return {
    subjectId: manualSubjectId === undefined ? inferredSubjectId : manualGone ? null : manualSubjectId,
    isAutomatic,
    selectSubject: (id: string | null) => { setManualSubjectId(id); setListedSubjectId(null); },
    resetSubject: () => { setManualSubjectId(undefined); setListedSubjectId(null); },
  };
}
