import type { StudySubject } from '@/lib/studySubjects';

const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
const latinWordCharacter = /[a-z0-9_]/u;

function findSubjectOccurrences(title: string, name: string) {
  const occurrences: { start: number; end: number }[] = [];
  let start = title.indexOf(name);
  while (start !== -1) {
    const end = start + name.length;
    // Short English names such as OS must not match inside words such as POST.
    const joinsPreviousWord = latinWordCharacter.test(name[0]) && latinWordCharacter.test(title[start - 1] ?? '');
    const joinsNextWord = latinWordCharacter.test(name.at(-1) ?? '') && latinWordCharacter.test(title[end] ?? '');
    if (!joinsPreviousWord && !joinsNextWord) occurrences.push({ start, end });
    start = title.indexOf(name, start + 1);
  }
  return occurrences;
}

export function suggestSubjectId(title: string, subjects: StudySubject[]): string | null {
  const normalizedTitle = normalize(title);
  if (!normalizedTitle) return null;

  const matches = subjects.flatMap(subject => {
    const name = normalize(subject.name);
    return name ? findSubjectOccurrences(normalizedTitle, name)
      .map(occurrence => ({ ...occurrence, id: subject.id })) : [];
  });

  // Ignore "대수" within "선형대수", but keep an independent "대수" mention ambiguous.
  const specificMatches = matches.filter(match => !matches.some(other =>
    other.start <= match.start && other.end >= match.end &&
    other.end - other.start > match.end - match.start
  ));
  const subjectIds = [...new Set(specificMatches.map(match => match.id))];

  return subjectIds.length === 1 ? subjectIds[0] : null;
}
